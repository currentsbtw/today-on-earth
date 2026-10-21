import { distinctCount } from "./reprints.ts";
import type { ArticleRecord, CellArticle } from "./types.ts";

/** Shared counters for cells and stories. */

export const round = (x: number, digits: number) => {
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

/** `reprints`: how many other articles in the same cell share this one's reprint key. */
export function toCellArticle(r: ArticleRecord, reprints = 0): CellArticle {
  return {
    title: r.title,
    url: r.url,
    source: r.source,
    country: r.country,
    lang: r.lang,
    time: r.time,
    tone: round(r.tone, 1),
    image: r.image,
    video: r.video,
    reprints,
  };
}

export interface CellStats {
  n: number;
  /** Distinct reprint keys (untitled articles count one each). */
  u: number;
  o: number;
  c: number;
  l: number;
  t: number;
  /** Distinct non-empty outlet countries other than `home`; `c` when `home` is "". */
  i: number;
  /** Most common non-empty locationCountry among the records, "" if none. */
  home: string;
  name: string;
  outlets: [string, number][];
  countries: [string, number][];
  languages: [string, number][];
}

/** Most common non-empty location country (ties by code), "" if none. */
export function homeCountry(records: readonly ArticleRecord[]): string {
  return countSorted(records.map((r) => r.locationCountry).filter(Boolean))[0]?.[0] ?? "";
}

/**
 * Counters over `records`. `home` is the place's own country for `i`; it defaults to the
 * records' own home (a story passes its cell's).
 */
export function cellStats(records: readonly ArticleRecord[], home = homeCountry(records)): CellStats {
  const outlets = countSorted(records.map((r) => r.source));
  const countries = countSorted(records.map((r) => r.country));
  const languages = countSorted(records.map((r) => r.lang));
  const names = countSorted(records.map((r) => r.locationName).filter(Boolean));
  const toneSum = records.reduce((s, r) => s + r.tone, 0);
  const c = countries.filter(([k]) => k !== "").length;
  return {
    n: records.length,
    u: distinctCount(records),
    o: outlets.filter(([k]) => k !== "").length,
    c,
    l: languages.filter(([k]) => k !== "").length,
    t: records.length ? round(toneSum / records.length, 1) : 0,
    i: home ? countries.filter(([k]) => k !== "" && k !== home).length : c,
    home,
    name: names[0]?.[0] ?? "",
    outlets,
    countries,
    languages,
  };
}
