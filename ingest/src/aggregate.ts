import { cellToLatLng } from "h3-js";
import type { ArticleRecord, CellArticle, CellFile, HeatCell, HeatFile } from "./types.ts";

export const ARTICLES_PER_CELL = 50;
export const MAX_PER_OUTLET = 5;
/** The per-outlet cap applies only when a cell has at least this many distinct outlets. */
export const OUTLET_CAP_MIN_OUTLETS = 10;
export const TOP_LIST_SIZE = 10;
/** Cells with fewer articles than this are dropped (contract: "n < 2 may be dropped"). */
export const MIN_CELL_ARTICLES = 2;

const round = (x: number, digits: number) => {
  const f = 10 ** digits;
  const r = Math.round(x * f) / f;
  return r === 0 ? 0 : r; // no -0
};

/** Newest first; ties broken by URL so output is deterministic. */
export function compareNewestFirst(a: ArticleRecord, b: ArticleRecord): number {
  if (a.time !== b.time) return a.time < b.time ? 1 : -1;
  return a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
}

/** Count occurrences, sorted by count desc then key asc. */
export function countSorted(values: Iterable<string>): [string, number][] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/**
 * Pick the cell's article list: newest first, de-duplicated by URL, at most 50.
 * When the cell has 10 or more distinct outlets, no outlet contributes more than 5.
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
  if (outletCount < OUTLET_CAP_MIN_OUTLETS) return unique.slice(0, ARTICLES_PER_CELL);

  const perOutlet = new Map<string, number>();
  const picked: ArticleRecord[] = [];
  for (const r of unique) {
    if (picked.length >= ARTICLES_PER_CELL) break;
    const k = perOutlet.get(r.source) ?? 0;
    if (k >= MAX_PER_OUTLET) continue;
    perOutlet.set(r.source, k + 1);
    picked.push(r);
  }
  return picked;
}

function toCellArticle(r: ArticleRecord): CellArticle {
  return {
    title: r.title,
    url: r.url,
    source: r.source,
    country: r.country,
    lang: r.lang,
    time: r.time,
    tone: round(r.tone, 1),
    image: r.image,
  };
}

interface CellStats {
  n: number;
  o: number;
  c: number;
  l: number;
  t: number;
  name: string;
  outlets: [string, number][];
  countries: [string, number][];
  languages: [string, number][];
}

function cellStats(records: readonly ArticleRecord[]): CellStats {
  const outlets = countSorted(records.map((r) => r.source));
  const countries = countSorted(records.map((r) => r.country));
  const languages = countSorted(records.map((r) => r.lang));
  const names = countSorted(records.map((r) => r.locationName).filter(Boolean));
  const toneSum = records.reduce((s, r) => s + r.tone, 0);
  return {
    n: records.length,
    o: outlets.filter(([k]) => k !== "").length,
    c: countries.filter(([k]) => k !== "").length,
    l: languages.filter(([k]) => k !== "").length,
    t: records.length ? round(toneSum / records.length, 1) : 0,
    name: names[0]?.[0] ?? "",
    outlets,
    countries,
    languages,
  };
}

export interface Snapshot {
  heat: HeatFile;
  cells: CellFile[];
}

/**
 * Build heat.json and the per-cell files from the (already windowed, URL-unique) records.
 */
export function buildSnapshot(records: readonly ArticleRecord[], opts: { now: Date; windowHours: number }): Snapshot {
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

  const heatCells: HeatCell[] = [];
  const cellFiles = new Map<string, CellFile>();
  for (const [id, list] of byCell) {
    if (list.length < MIN_CELL_ARTICLES) continue;
    const s = cellStats(list);
    const [lat, lon] = cellToLatLng(id);
    heatCells.push({ id, lat: round(lat, 2), lon: round(lon, 2), n: s.n, o: s.o, c: s.c, l: s.l, t: s.t, name: s.name });
    cellFiles.set(id, {
      id,
      name: s.name,
      n: s.n,
      o: s.o,
      c: s.c,
      l: s.l,
      t: s.t,
      topOutlets: s.outlets.slice(0, TOP_LIST_SIZE),
      topCountries: s.countries.slice(0, TOP_LIST_SIZE),
      languages: s.languages.slice(0, TOP_LIST_SIZE),
      articles: selectArticles(list).map(toCellArticle),
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
    totals: { articles: records.length, outlets: outlets.size, countries: countries.size, cells: heatCells.length, unplaced },
    cells: heatCells,
  };
  return { heat, cells: heatCells.map((c) => cellFiles.get(c.id)!) };
}
