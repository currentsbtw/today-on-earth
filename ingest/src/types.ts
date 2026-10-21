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
  /** Country of the primary location (V2Locations CountryCode, FIPS -> ISO 3166-1 alpha-2); "" when unknown or unplaced. */
  locationCountry: string;
  /** Up to 6 most-mentioned GKG V2Persons, lowercase. */
  persons: string[];
  /** Up to 6 most-mentioned GKG V2Organizations, lowercase. */
  orgs: string[];
  /** Up to 6 most-mentioned GKG V2Themes outside the deny-list, lowercase. */
  themes: string[];
  /** First YouTube video URL from GKG SocialVideoEmbeds, "" when none. */
  video: string;
  /**
   * Kinds of the article from its raw V2Themes (kinds.ts): sorted distinct letters among
   * c (conflict), d (disaster), k (crime), p (politics), "" when none. Ingest-internal.
   */
  kinds: string;
}

/** `/data/heat.json` (docs/DATA-CONTRACT.md). */
export interface HeatFile {
  generatedAt: string;
  windowHours: number;
  newestArticleAt: string;
  /** Complete UTC days of per-cell counts in the baseline, capped at 14. */
  baselineDays: number;
  totals: { articles: number; outlets: number; countries: number; cells: number; unplaced: number; reprints: number };
  cells: HeatCell[];
}

export interface HeatCell {
  id: string;
  lat: number;
  lon: number;
  n: number;
  /** Distinct headlines: distinct reprint keys, untitled articles one each. */
  u: number;
  o: number;
  c: number;
  /** Outlet countries other than the place's own (`c` when the place's country is unknown). */
  i: number;
  l: number;
  t: number;
  name: string;
  /** Median daily article count over the last up to 7 complete UTC days; 0 without a baseline. */
  b: number;
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
  /** YouTube video URL from GKG SocialVideoEmbeds, "" when none. */
  video: string;
  /** Other articles in the same cell with the same reprint key. */
  reprints: number;
}

/** `/data/cells/<id>.json` (docs/DATA-CONTRACT.md). */
export interface CellFile {
  id: string;
  name: string;
  /** The place's own country: most common article location country, "" if none. */
  home: string;
  n: number;
  u: number;
  o: number;
  c: number;
  i: number;
  l: number;
  t: number;
  topOutlets: [string, number][];
  topCountries: [string, number][];
  languages: [string, number][];
  articles: CellArticle[];
  /** Articles in the cell (whole window) that carry a video. */
  videos: number;
  stories: Story[];
  /** Articles in the cell that belong to no story; sum(stories[].n) + unclustered == n. */
  unclustered: number;
}

/** A group of a cell's articles about the same thing (docs/DATA-CONTRACT.md "Stories"). */
export interface Story {
  n: number;
  u: number;
  o: number;
  c: number;
  /** As the cell's `i`, over the story's articles, against the cell's `home`. */
  i: number;
  l: number;
  t: number;
  first: string;
  last: string;
  headline: string;
  headlineSource: string;
  headlineLang: string;
  /** URL of the article the headline comes from, "" when none. */
  headlineUrl: string;
  entities: string[];
  articles: CellArticle[];
}

/** `/data/broadcast.json` (docs/DATA-CONTRACT.md "Broadcast"); mirrors web/src/broadcast.ts. */
export type SlotId = "loudest" | "planet" | "rising" | "brightest" | "ordinary" | "faint";

export interface SlotCell {
  id: string;
  name: string;
  lat: number;
  lon: number;
  home: string;
}

export interface SlotStory {
  headline: string;
  headlineSource: string;
  headlineLang: string;
  headlineUrl: string;
  n: number;
  u: number;
  o: number;
  c: number;
  i: number;
  l: number;
  t: number;
  first: string;
  last: string;
}

export interface Slot {
  id: SlotId;
  available: boolean;
  reason?: "baseline" | "none";
  availableFrom?: string;
  cell?: SlotCell;
  story?: SlotStory;
  /** Rising only. */
  ratio?: number;
  /** Rising and faint. */
  b?: number;
}

export interface BroadcastFile {
  generatedAt: string;
  windowHours: number;
  baselineDays: number;
  slots: Slot[];
}
