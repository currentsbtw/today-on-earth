import { cellToLatLng } from "h3-js";
import { cellStats, compareNewestFirst, knownCountries, representative, round, sortCounts, toCellArticle } from "./stats.ts";
import type { BaselineView } from "./baseline.ts";
import { outletOf } from "./domains.ts";
import { createKeyer, keyCounts, unitsOf, type Keyer } from "./reprints.ts";
import { buildStories } from "./stories.ts";
import type { ArticleRecord, CellFile, HeatCell, HeatFile, Story, StoryEn } from "./types.ts";

export { compareNewestFirst, countSorted } from "./stats.ts";

export const ARTICLES_PER_CELL = 50;
export const MAX_PER_OUTLET = 5;
/** The per-outlet cap applies only when a cell has at least this many distinct outlets. */
export const OUTLET_CAP_MIN_OUTLETS = 10;
export const TOP_LIST_SIZE = 10;
/** heat.json's topOutletCountries: the window's largest news countries by article units. */
export const TOP_OUTLET_COUNTRIES = 20;
/** Cells with fewer articles than this are dropped (contract: "n < 2 may be dropped"). */
export const MIN_CELL_ARTICLES = 2;


/**
 * Pick the cell's article list: newest first, de-duplicated by URL, at most 50.
 * When the cell has 10 or more distinct outlets, no outlet contributes more than 5.
 * At most one article per non-empty reprint key: the newest copy the outlet cap lets in.
 * Outlets are outletOf(source): a network counts once for the threshold and the cap.
 */
export function selectArticles(records: readonly ArticleRecord[], keyer: Keyer = createKeyer(records)): ArticleRecord[] {
  const seen = new Set<string>();
  const unique: ArticleRecord[] = [];
  for (const r of [...records].sort(compareNewestFirst)) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    unique.push(r);
  }
  // Same definition as the cell's `o`: distinct non-empty outlets.
  const outletCount = new Set(unique.map((r) => outletOf(r.source)).filter(Boolean)).size;
  const capped = outletCount >= OUTLET_CAP_MIN_OUTLETS;

  const perOutlet = new Map<string, number>();
  const keys = new Set<string>();
  const picked: ArticleRecord[] = [];
  for (const r of unique) {
    if (picked.length >= ARTICLES_PER_CELL) break;
    const key = keyer.keyOf(r);
    if (key && keys.has(key)) continue;
    const outlet = outletOf(r.source);
    const k = perOutlet.get(outlet) ?? 0;
    if (capped && k >= MAX_PER_OUTLET) continue;
    perOutlet.set(outlet, k + 1);
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
  /**
   * Per story: its grim share, the share of its article units carrying the harm kind h (KILL or
   * WOUND), over its fresh units under the G_SINCE transition (stories.ts storyGrimShare);
   * a story without one is not in the map (ingest-internal here; stories.json writes it as `g`).
   */
  storyGrim: Map<Story, number>;
  /**
   * Per story whose credited headline is not English and that has an English-titled clustered
   * member: its English title (stories.ts englishTitle; ingest-internal here; stories.json
   * writes it as `en`).
   */
  storyEn: Map<Story, StoryEn>;
  /**
   * Per story: how many of its leading `entities` are persons or organisations; the rest are
   * theme words (ingest-internal, for topics.json).
   */
  storyNames: Map<Story, number>;
}

/**
 * Build heat.json and the per-cell files from the (already windowed, URL-unique) records.
 * Counts are article units (stats.ts articleUnits): an outlet's copies of one headline are
 * one article. `totals.articles` sums the units of every cell (kept or dropped) and of the
 * unplaced records, so the cells' `n` plus `unplaced` never exceed it. `topOutletCountries`
 * splits the same units by the outlet country of each unit's earliest copy.
 */
export function buildSnapshot(
  records: readonly ArticleRecord[],
  opts: {
    now: Date;
    windowHours: number;
    baseline?: BaselineView;
    keyer?: Keyer;
    /** stories.ts G_SINCE, overridable only for tests and offline replays. */
    gSince?: string;
  },
): Snapshot {
  const baseline = opts.baseline ?? { baselineDays: 0, b: () => 0, articlesNormal: null, articlesNormalDays: 0, totalDays: 0 };
  const keyer = opts.keyer ?? createKeyer(records);
  const byCell = new Map<string, ArticleRecord[]>();
  const unplacedRecords: ArticleRecord[] = [];
  for (const r of records) {
    if (!r.cellId) {
      unplacedRecords.push(r); // country-level only: counted, never binned
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
  // Article units per outlet country over the window, partitioned as totals.articles is.
  const countryUnits = new Map<string, number>();
  const addCountry = (cc: string, units: number) => {
    if (cc) countryUnits.set(cc, (countryUnits.get(cc) ?? 0) + units);
  };
  const unplacedUnits = unitsOf(unplacedRecords, keyer, outletOf).map(representative);
  for (const r of unplacedUnits) addCountry(r.country, 1);
  const unplaced = unplacedUnits.length;
  let articles = unplaced;
  const storyTagged = new Map<Story, number>();
  const storyGrim = new Map<Story, number>();
  const storyEn = new Map<Story, StoryEn>();
  const storyNames = new Map<Story, number>();
  for (const [id, list] of byCell) {
    if (list.length < MIN_CELL_ARTICLES) {
      articles += list.length; // a 1-article cell holds no copies
      for (const r of list) addCountry(r.country, 1);
      continue;
    }
    const s = cellStats(list, keyer);
    articles += s.n;
    for (const [cc, units] of s.countries) addCountry(cc, units);
    if (s.n < MIN_CELL_ARTICLES) continue; // one outlet's copies of one headline: one article
    reprints += s.n - s.u; // articles that are copies of another outlet's article in the same cell
    const [lat, lon] = cellToLatLng(id);
    heatCells.push({ id, lat: round(lat, 2), lon: round(lon, 2), n: s.n, u: s.u, o: s.o, c: s.c, i: s.i, l: s.l, t: s.t, name: s.name, b: baseline.b(id) });
    const copies = keyCounts(list, keyer, outletOf);
    const others = (r: ArticleRecord) => {
      const key = keyer.keyOf(r);
      return key ? copies.get(key)! - 1 : 0;
    };
    const { stories, unclustered, tagged, grim, en, names } = timed(() => buildStories(list, keyer, s.home, opts.gSince));
    stories.forEach((story, k) => {
      storyTagged.set(story, tagged[k]);
      const g = grim[k];
      if (g !== undefined) storyGrim.set(story, g);
      const e = en[k];
      if (e) storyEn.set(story, e);
      storyNames.set(story, names[k]);
    });
    cellFiles.set(id, {
      id,
      name: s.name,
      home: s.home,
      ...(s.fid ? { fid: s.fid } : {}),
      n: s.n,
      u: s.u,
      o: s.o,
      c: s.c,
      i: s.i,
      l: s.l,
      t: s.t,
      topOutlets: s.outlets.slice(0, TOP_LIST_SIZE),
      topCountries: knownCountries(s.countries),
      languages: s.languages.slice(0, TOP_LIST_SIZE),
      articles: selectArticles(list, keyer).map((r) => toCellArticle(r, keyer, others(r))),
      videos: unitsOf(list, keyer, outletOf).reduce((k, unit) => k + (unit.some((r) => r.video) ? 1 : 0), 0),
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
    if (r.source) outlets.add(outletOf(r.source));
    if (r.country) countries.add(r.country);
  }

  const heat: HeatFile = {
    generatedAt: opts.now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    windowHours: opts.windowHours,
    newestArticleAt: newest,
    baselineDays: baseline.baselineDays,
    totals: { articles, outlets: outlets.size, countries: countries.size, cells: heatCells.length, unplaced, reprints },
    articlesNormal: baseline.articlesNormal,
    articlesNormalDays: baseline.articlesNormalDays,
    topOutletCountries: sortCounts(countryUnits).slice(0, TOP_OUTLET_COUNTRIES),
    cells: heatCells,
  };
  return { heat, cells: heatCells.map((c) => cellFiles.get(c.id)!), storiesMs, storyTagged, storyGrim, storyEn, storyNames };
}
