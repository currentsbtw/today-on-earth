/** One article in the rolling window. Persisted in state.json.gz between runs. */
export interface ArticleRecord {
  url: string;
  title: string;
  /** Source domain (GKG SourceCommonName). */
  source: string;
  /** Outlet country, ISO 3166-1 alpha-2, "" if unknown. */
  country: string;
  /** ISO 639-1 where known. */
  lang: string;
  /** ISO 8601 UTC, e.g. "2026-10-20T18:45:00Z" (GKG DATE). */
  time: string;
  tone: number;
  /** GKG SharingImage, "" if none. */
  image: string;
  lat: number;
  lon: number;
  /** H3 resolution-3 index of the primary location; "" when unplaced (country-level only). */
  cellId: string;
  /** FullName of the primary location; "" when unplaced. */
  locationName: string;
}

/** `/data/heat.json` (docs/DATA-CONTRACT.md). */
export interface HeatFile {
  generatedAt: string;
  windowHours: number;
  newestArticleAt: string;
  totals: { articles: number; outlets: number; countries: number; cells: number; unplaced: number };
  cells: HeatCell[];
}

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
}

export interface CellArticle {
  title: string;
  url: string;
  source: string;
  country: string;
  lang: string;
  time: string;
  tone: number;
  image: string;
}

/** `/data/cells/<id>.json` (docs/DATA-CONTRACT.md). */
export interface CellFile {
  id: string;
  name: string;
  n: number;
  o: number;
  c: number;
  l: number;
  t: number;
  topOutlets: [string, number][];
  topCountries: [string, number][];
  languages: [string, number][];
  articles: CellArticle[];
}
