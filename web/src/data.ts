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
}

export interface Heat {
  generatedAt: string;
  windowHours: number;
  newestArticleAt: string;
  totals: { articles: number; outlets: number; countries: number; cells: number };
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
}

export interface CellDetail {
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

export function loadCell(id: string): Promise<CellDetail> {
  if (!/^[0-9a-f]{15}$/i.test(id)) return Promise.reject(new Error(`bad cell id ${id}`));
  return getJson<CellDetail>(`data/cells/${id}.json`);
}
