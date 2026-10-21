// Types and loaders for the files described in docs/DATA-CONTRACT.md.

export interface HeatCell {
  id: string;
  lat: number;
  lon: number;
  n: number;
  o: number;
  c: number;
  l: number;
  t: number;
  name: string;
  /** Distinct headlines (reprints collapsed). Absent in older files: treat as n. */
  u?: number;
  /** Outlet countries other than the place's own. Absent in older files: 0. */
  i?: number;
  /** Median daily articles over the last up to 7 complete UTC days; 0 when unknown or new. */
  b?: number;
}

export interface Totals {
  articles: number;
  outlets: number;
  countries: number;
  cells: number;
  unplaced?: number;
  /** Articles that copy another article's headline in the same cell (heat.json only). */
  reprints?: number;
}

export interface Heat {
  generatedAt: string;
  windowHours: number;
  newestArticleAt: string;
  /** Complete UTC days of per-cell history behind `b` (0-14). Relative heat needs >= 3. */
  baselineDays?: number;
  totals: Totals;
  cells: HeatCell[];
}

export interface Article {
  title: string;
  url: string;
  source: string;
  country: string;
  lang: string;
  time: string;
  tone: number;
  image?: string;
  /** A youtube.com / youtu.be URL, "" when none. */
  video?: string;
  /** Other articles in the same cell with the same headline; absent means 0. */
  reprints?: number;
}

export interface CellDetail {
  id: string;
  name: string;
  /** The place's own country (ISO alpha-2), "" when unknown or absent. */
  home?: string;
  n: number;
  /** Distinct headlines; absent in older files. */
  u?: number;
  /** Outlet countries other than the place's own; absent in older files. */
  i?: number;
  o: number;
  c: number;
  l: number;
  t: number;
  topOutlets: [string, number][];
  topCountries: [string, number][];
  languages: [string, number][];
  articles: Article[];
  /** Groups of the cell's articles about the same thing, by n descending. May be absent. */
  stories?: Story[];
  /** Articles in the cell (whole window) that carry a video. */
  videos?: number;
  /** Articles in no story; sum(stories.n) + unclustered == n. */
  unclustered?: number;
}

export interface Story {
  n: number;
  u?: number;
  i?: number;
  o: number;
  c: number;
  l: number;
  t: number;
  first: string;
  last: string;
  /** A verbatim outlet title (the story's medoid article); may be empty. */
  headline: string;
  headlineSource: string;
  headlineLang: string;
  entities: string[];
  /** Newest 6, at most 2 per outlet. */
  articles: Article[];
}

/** Resolves a path against the page so the site works under any base path. */
export function siteUrl(path: string): string {
  return new URL(path, document.baseURI).href;
}

async function getJson<T>(path: string): Promise<T> {
  // no-cache: revalidate with the server so a new snapshot shows up on reload.
  const res = await fetch(siteUrl(path), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return (await res.json()) as T;
}

export function loadHeat(): Promise<Heat> {
  return getJson<Heat>('data/heat.json');
}

/** An H3 index as the ingest job writes it. Anything else never reaches a URL. */
export const isCellId = (id: string) => /^[0-9a-f]{15}$/.test(id);

export function loadCell(id: string): Promise<CellDetail> {
  if (!isCellId(id)) return Promise.reject(new Error(`bad cell id ${id}`));
  return getJson<CellDetail>(`data/cells/${id}.json`);
}

/** One entry of history/index.json, oldest first; the last one is the live snapshot. */
export interface HistoryFrame {
  at: string;
  file: string;
  windowHours: number;
  totals: Totals;
}

/** [id, lat, lon, n], sorted by n descending. */
export type FrameRow = [string, number, number, number];

export async function loadHistoryIndex(): Promise<HistoryFrame[]> {
  const index = await getJson<{ frames?: HistoryFrame[] }>('data/history/index.json');
  return Array.isArray(index.frames) ? index.frames : [];
}

export async function loadFrame(file: string): Promise<FrameRow[]> {
  if (!/^[\w.-]+\.json$/.test(file)) throw new Error(`bad frame file ${file}`);
  const frame = await getJson<{ cells?: FrameRow[] }>(`data/history/${file}`);
  return Array.isArray(frame.cells) ? frame.cells : [];
}
