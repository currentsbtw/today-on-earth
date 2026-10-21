import { cellToLatLng } from "h3-js";
import { cellStats, compareNewestFirst, round, toCellArticle } from "./stats.ts";
import type { BaselineView } from "./baseline.ts";
import { keyCounts, keyOf } from "./reprints.ts";
import { buildStories } from "./stories.ts";
import type { ArticleRecord, CellFile, HeatCell, HeatFile, Story } from "./types.ts";

export { compareNewestFirst, countSorted } from "./stats.ts";

export const ARTICLES_PER_CELL = 50;
export const MAX_PER_OUTLET = 5;
/** The per-outlet cap applies only when a cell has at least this many distinct outlets. */
export const OUTLET_CAP_MIN_OUTLETS = 10;
export const TOP_LIST_SIZE = 10;
/** Cells with fewer articles than this are dropped (contract: "n < 2 may be dropped"). */
export const MIN_CELL_ARTICLES = 2;


/**
 * Pick the cell's article list: newest first, de-duplicated by URL, at most 50.
 * When the cell has 10 or more distinct outlets, no outlet contributes more than 5.
 * At most one article per non-empty reprint key: the newest copy the outlet cap lets in.
 */
export function selectArticles(records: readonly ArticleRecord[]): ArticleRecord[] {
  const seen = new Set<string>();
  const unique: ArticleRecord[] = [];
  for (const r of [...records].sort(compareNewestFirst)) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    unique.push(r);
  }
  // Same definition as the cell's `o`: distinct non-empty source domains.
  const outletCount = new Set(unique.map((r) => r.source).filter(Boolean)).size;
  const capped = outletCount >= OUTLET_CAP_MIN_OUTLETS;

  const perOutlet = new Map<string, number>();
  const keys = new Set<string>();
  const picked: ArticleRecord[] = [];
  for (const r of unique) {
    if (picked.length >= ARTICLES_PER_CELL) break;
    const key = keyOf(r);
    if (key && keys.has(key)) continue;
    const k = perOutlet.get(r.source) ?? 0;
    if (capped && k >= MAX_PER_OUTLET) continue;
    perOutlet.set(r.source, k + 1);
    if (key) keys.add(key);
    picked.push(r);
  }
  return picked;
}


export interface Snapshot {
  heat: HeatFile;
  cells: CellFile[];
  /** Time spent grouping stories, for the run log. */
  storiesMs: number;
  /** Per story: how many of its articles carry any kind (ingest-internal, for the broadcast). */
  storyTagged: Map<Story, number>;
}

/**
 * Build heat.json and the per-cell files from the (already windowed, URL-unique) records.
 */
export function buildSnapshot(
  records: readonly ArticleRecord[],
  opts: { now: Date; windowHours: number; baseline?: BaselineView },
): Snapshot {
  const baseline = opts.baseline ?? { baselineDays: 0, b: () => 0 };
  const byCell = new Map<string, ArticleRecord[]>();
  let unplaced = 0;
  for (const r of records) {
    if (!r.cellId) {
      unplaced++; // country-level only: counted, never binned
      continue;
    }
    let list = byCell.get(r.cellId);
    if (!list) byCell.set(r.cellId, (list = []));
    list.push(r);
  }

  let storiesMs = 0;
  const timed = <T>(fn: () => T): T => {
    const t0 = performance.now();
    const out = fn();
    storiesMs += performance.now() - t0;
    return out;
  };
  const heatCells: HeatCell[] = [];
  const cellFiles = new Map<string, CellFile>();
  let reprints = 0;
  const storyTagged = new Map<Story, number>();
  for (const [id, list] of byCell) {
    if (list.length < MIN_CELL_ARTICLES) continue; // a 1-article cell holds no copies
    const s = cellStats(list);
    reprints += s.n - s.u; // articles that are copies of another article in the same cell
    const [lat, lon] = cellToLatLng(id);
    heatCells.push({ id, lat: round(lat, 2), lon: round(lon, 2), n: s.n, u: s.u, o: s.o, c: s.c, i: s.i, l: s.l, t: s.t, name: s.name, b: baseline.b(id) });
    const copies = keyCounts(list);
    const others = (r: ArticleRecord) => {
      const key = keyOf(r);
      return key ? copies.get(key)! - 1 : 0;
    };
    const { stories, unclustered, tagged } = timed(() => buildStories(list, s.home));
    stories.forEach((story, k) => storyTagged.set(story, tagged[k]));
    cellFiles.set(id, {
      id,
      name: s.name,
      home: s.home,
      n: s.n,
      u: s.u,
      o: s.o,
      c: s.c,
      i: s.i,
      l: s.l,
      t: s.t,
      topOutlets: s.outlets.slice(0, TOP_LIST_SIZE),
      topCountries: s.countries.slice(0, TOP_LIST_SIZE),
      languages: s.languages.slice(0, TOP_LIST_SIZE),
      articles: selectArticles(list).map((r) => toCellArticle(r, others(r))),
      videos: list.reduce((k, r) => k + (r.video ? 1 : 0), 0),
      stories,
      unclustered,
    });
  }
  heatCells.sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  let newest = "";
  const outlets = new Set<string>();
  const countries = new Set<string>();
  for (const r of records) {
    if (r.time > newest) newest = r.time;
    if (r.source) outlets.add(r.source);
    if (r.country) countries.add(r.country);
  }

  const heat: HeatFile = {
    generatedAt: opts.now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    windowHours: opts.windowHours,
    newestArticleAt: newest,
    baselineDays: baseline.baselineDays,
    totals: { articles: records.length, outlets: outlets.size, countries: countries.size, cells: heatCells.length, unplaced, reprints },
    cells: heatCells,
  };
  return { heat, cells: heatCells.map((c) => cellFiles.get(c.id)!), storiesMs, storyTagged };
}
