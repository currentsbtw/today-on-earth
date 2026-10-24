/**
 * The GDELT FeatureID -> GeoNames crosswalk and the name filter of the place-names table
 * (`ingest/data/placenames.json`, docs/DATA-CONTRACT.md "Top stories", Confirmation), as pure
 * functions over the GeoNames dump text so build-placenames.ts and the tests share them.
 *
 * GDELT's FeatureID is an NGA GNS or USGS GNIS id (or an ADM1 code for regions), not a
 * GeoNames id, so a feature is matched by name and place: a city (GDELT type 3 or 4) to a
 * cities500 row in the same country within CROSSWALK_KM whose name, ASCII name or one of its
 * alternate names equals the feature's first name part (folded), the most populous first,
 * then the nearest; a region (type 2 or 5) to an admin1 row of the same country by name.
 */
import { cleanPlaceName } from "../src/placename.ts";
import { foldText } from "../src/top-stories.ts";

/** A city candidate must lie within this distance of GDELT's coordinate. */
export const CROSSWALK_KM = 30;

/**
 * Languages kept: the languages seen in GDELT's translated feed (the article languages of the
 * 2026-10-24 audit snapshot's cell files), plus nb and nn for no. Alternate names in other
 * languages are left out; unlabelled names, abbreviations ("abbr"), short and colloquial names
 * are kept in any language.
 */
export const FEED_LANGS: readonly string[] = [
  "ar", "bg", "bn", "bs", "ca", "cs", "da", "de", "el", "en", "es", "et", "fa", "fi", "fr", "gl", "he", "hi", "hr", "hu", "hy",
  "id", "is", "it", "ja", "ko", "lt", "lv", "mk", "ml", "mr", "nb", "ne", "nl", "nn", "no", "pa", "pl", "pt", "ro", "ru", "sk",
  "sl", "sq", "sr", "sv", "ta", "te", "th", "tr", "uk", "ur", "vi", "zh",
];

/** alternateNamesV2 "languages" that are links, ids or codes, never names. */
const CODE_LANGS = new Set(["link", "wkdt", "post", "iata", "icao", "faac", "unlc", "tcid", "fr_1793", "phon", "piny"]);

/** Scripts written without spaces between words (as top-stories.ts NO_SPACE_SCRIPT). */
const NO_SPACE_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/gu;

/** Folding for name comparison: diacritics stripped, lower-cased, typographic apostrophes as "'". */
export const foldName = (s: string) => foldText(s).replace(/[’‘`ʼ]/g, "'").trim();

/** Great-circle distance in km. */
export function km(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const t = Math.PI / 180;
  const x = Math.sin(((lat2 - lat1) * t) / 2) ** 2 + Math.cos(lat1 * t) * Math.cos(lat2 * t) * Math.sin(((lon2 - lon1) * t) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** A GDELT feature to resolve: a candidate location's FeatureID with its tidied name, ISO country and coordinate. */
export interface Feature {
  fid: string;
  type: 2 | 3 | 4 | 5;
  /** FullName tidied by cleanPlaceName. */
  name: string;
  /** ISO 3166-1 alpha-2, "" when unknown. */
  country: string;
  lat: number;
  lon: number;
}

export interface GnCity {
  id: number;
  name: string;
  ascii: string;
  lat: number;
  lon: number;
  cc: string;
  /** admin1 code within the country ("14"), "" when none. */
  adm1: string;
  pop: number;
}

export interface GnAdmin1 {
  id: number;
  cc: string;
  /** "CN.14" as in admin1CodesASCII. */
  key: string;
  name: string;
  ascii: string;
}

export interface AltName {
  id: number;
  lang: string;
  name: string;
  short: boolean;
  colloquial: boolean;
  historic: boolean;
}

/** countryInfo.txt: FIPS -> ISO alpha-2. */
export function parseCountryInfo(text: string): Map<string, string> {
  const fipsToIso = new Map<string, string>();
  for (const line of text.split("\n")) {
    if (line.startsWith("#") || !line.trim()) continue;
    const f = line.split("\t");
    if (/^[A-Z]{2}$/.test(f[0] ?? "") && /^[A-Z]{2}$/.test(f[3] ?? "")) fipsToIso.set(f[3], f[0]);
  }
  return fipsToIso;
}

/** One cities500.txt row (geoname table: id, name, asciiname, alternatenames, lat, lon, ..., cc 8, admin1 10, population 14). */
export function parseCityLine(line: string): { city: GnCity; alternates: string[] } | null {
  const f = line.split("\t");
  if (f.length < 15) return null;
  const id = Number(f[0]);
  const [lat, lon, pop] = [Number(f[4]), Number(f[5]), Number(f[14])];
  if (!Number.isInteger(id) || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    city: { id, name: f[1], ascii: f[2], lat, lon, cc: f[8], adm1: f[10] ?? "", pop: Number.isFinite(pop) ? pop : 0 },
    alternates: f[3] ? f[3].split(",") : [],
  };
}

/** admin1CodesASCII.txt: "CN.14<TAB>Tibet<TAB>Tibet<TAB>1279685". */
export function parseAdmin1(text: string): GnAdmin1[] {
  const out: GnAdmin1[] = [];
  for (const line of text.split("\n")) {
    const f = line.replace(/\r$/, "").split("\t");
    if (f.length < 4) continue;
    const id = Number(f[3]);
    if (!Number.isInteger(id) || !f[0].includes(".")) continue;
    out.push({ id, cc: f[0].split(".")[0], key: f[0], name: f[1], ascii: f[2] });
  }
  return out;
}

/** One alternateNamesV2.txt row: altId, geonameid, isolanguage, name, isPreferred, isShort, isColloquial, isHistoric, from, to. */
export function parseAltNameLine(line: string): AltName | null {
  const f = line.replace(/\r$/, "").split("\t");
  if (f.length < 8) return null;
  const id = Number(f[1]);
  if (!Number.isInteger(id) || !f[3]) return null;
  return { id, lang: f[2], name: f[3], short: f[5] === "1", colloquial: f[6] === "1", historic: f[7] === "1" };
}

/** The geonameid of an alternateNamesV2 line without parsing the rest (for the one pass over the 16M-line file). */
export function altNameId(line: string): number {
  const a = line.indexOf("\t");
  const b = line.indexOf("\t", a + 1);
  return a < 0 || b < 0 ? NaN : Number(line.slice(a + 1, b));
}

/** Cities by every folded name (name, ASCII name, alternate names). */
export class CityIndex {
  readonly byName = new Map<string, GnCity[]>();
  readonly byId = new Map<number, GnCity>();

  add(city: GnCity, alternates: readonly string[]): void {
    this.byId.set(city.id, city);
    const keys = new Set([city.name, city.ascii, ...alternates].map(foldName).filter((k) => k !== ""));
    for (const k of keys) {
      let list = this.byName.get(k);
      if (!list) this.byName.set(k, (list = []));
      list.push(city);
    }
  }

  static fromText(text: string): CityIndex {
    const index = new CityIndex();
    for (const line of text.split("\n")) {
      const row = parseCityLine(line.replace(/\r$/, ""));
      if (row) index.add(row.city, row.alternates);
    }
    return index;
  }
}

/** The first comma-separated part of a feature name, and its middle parts. */
function parts(name: string): { first: string; middle: string[] } {
  const p = cleanPlaceName(name).split(",").map((s) => s.trim()).filter((s) => s !== "");
  return { first: p[0] ?? "", middle: p.slice(1, -1) };
}

/**
 * Countries the crosswalk treats as one: GDELT writes Gaza and West Bank places as Israel
 * ("Gaza, Israel") as well as under their own codes, GeoNames as PS.
 */
const COUNTRY_GROUPS: readonly (readonly string[])[] = [["IL", "PS"]];
const sameCountry = (a: string, b: string) => a === b || COUNTRY_GROUPS.some((g) => g.includes(a) && g.includes(b));

/**
 * The cities500 row a city feature (type 3 or 4) names: same folded name, within CROSSWALK_KM,
 * in the feature's country when it is known (COUNTRY_GROUPS count as one); the most populous, then the nearest, then the
 * lowest id. Null when none.
 */
export function matchCity(f: Feature, index: CityIndex, maxKm = CROSSWALK_KM): { city: GnCity; km: number } | null {
  if (f.type !== 3 && f.type !== 4) return null;
  const key = foldName(parts(f.name).first);
  const found = (index.byName.get(key) ?? [])
    .filter((c) => f.country === "" || sameCountry(c.cc, f.country))
    .map((c) => ({ city: c, km: km(f.lat, f.lon, c.lat, c.lon) }))
    .filter((x) => x.km <= maxKm);
  found.sort((a, b) => b.city.pop - a.city.pop || a.km - b.km || a.city.id - b.city.id);
  return found[0] ?? null;
}

/** The one admin1 of `inCountry` a folded name names: by name or ASCII name, else by an alternate name; null when none or several. */
function admin1Named(key: string, inCountry: readonly GnAdmin1[], altById: ReadonlyMap<number, readonly AltName[]>): GnAdmin1 | null {
  if (key === "") return null;
  const exact = inCountry.filter((a) => foldName(a.name) === key || foldName(a.ascii) === key);
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  const alt = inCountry.filter((a) => (altById.get(a.id) ?? []).some((n) => !CODE_LANGS.has(n.lang) && foldName(n.name) === key));
  return alt.length === 1 ? alt[0] : null;
}

/**
 * The admin1 row a region names, in the feature's country (GDELT gives regions no useful
 * coordinate for a distance guard, so the country is the guard): the one admin1 whose name
 * or ASCII name equals (folded) a name part, else whose alternate names (any language) hold
 * it; a name two admin1s share resolves to none.
 *
 * A region feature (type 2 or 5) is tried by its first name part, then its middle parts. A
 * city feature (type 3 or 4) that matchCity did not find is tried as a region too, because
 * GDELT types some regions as cities ("Andalusia, Spain", "Quebec, Canada"), but only by its
 * first part and only when each of its middle parts names the same admin1: "Saxony, Sachsen,
 * Germany" resolves to Saxony, "Guangdong, Jilin, China" (a feature in Jilin) to none. Null
 * when none.
 */
export function matchRegion(f: Feature, admin1: readonly GnAdmin1[], altById: ReadonlyMap<number, readonly AltName[]>): GnAdmin1 | null {
  const inCountry = admin1.filter((a) => a.cc === f.country);
  const { first, middle } = parts(f.name);
  if (f.type === 2 || f.type === 5) {
    for (const part of [first, ...middle]) {
      const a = admin1Named(foldName(part), inCountry, altById);
      if (a) return a;
    }
    return null;
  }
  const a = admin1Named(foldName(first), inCountry, altById);
  return a && middle.every((m) => admin1Named(foldName(m), inCountry, altById) === a) ? a : null;
}

/** A name written all in capitals (NSW, CDMX, D.C.): matched in capitals only by confirmStory. */
export const isCapsName = (s: string) => s === s.toUpperCase() && s !== s.toLowerCase();

/**
 * Whether an alternate name goes in the table: no links, codes or historic names; a name in a
 * feed language, or an unlabelled, abbr, short or colloquial name. Of the latter, a name of 4
 * letters or fewer in a script with word spaces is kept only when written all in capitals:
 * the rest are mostly abbreviations or common words (Rio, Wash, Man., mass, The D, Tan).
 */
export function keepAltName(a: AltName, langs: ReadonlySet<string>): boolean {
  if (CODE_LANGS.has(a.lang) || a.historic) return false;
  if (langs.has(a.lang.split("-")[0])) return true;
  if (!(a.lang === "" || a.lang === "abbr" || a.short || a.colloquial)) return false;
  const noSpace = (a.name.match(NO_SPACE_CHAR)?.length ?? 0) > 0;
  return noSpace || (a.name.match(/\p{L}/gu)?.length ?? 0) > 4 || isCapsName(a.name);
}

/** At least 3 letters, or 2 characters of a script written without spaces (重庆). */
export function nameOk(name: string): boolean {
  const noSpace = name.match(NO_SPACE_CHAR)?.length ?? 0;
  if (noSpace > 0) return noSpace >= 2;
  return (name.match(/\p{L}/gu)?.length ?? 0) >= 3;
}

/**
 * The names kept from `candidates`: nameOk, deduplicated by folded form (a spelling not all
 * in capitals is kept over one in capitals, then the first in code-unit order), without any
 * whose folded form is in `exclude` (the English name already in the cell name), sorted.
 */
export function tidyNames(candidates: Iterable<string>, exclude: Iterable<string>): string[] {
  const seen = new Set([...exclude].map(foldName));
  const out: string[] = [];
  // A spelling not in capitals first, so "Купянск" is kept over "КУПЯНСК" (which would match in capitals only).
  const order = (a: string, b: string) => Number(isCapsName(a)) - Number(isCapsName(b)) || (a < b ? -1 : a > b ? 1 : 0);
  for (const n of [...new Set([...candidates].map((s) => s.trim()))].sort(order)) {
    const k = foldName(n);
    if (!n || !nameOk(n) || seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out.sort();
}

export interface PlaceNamesEntry {
  /** The GeoNames id the feature resolved to (the city, or the region for a region feature). */
  g: number;
  /** Local names of the city (city features). */
  n: string[];
  /** Local names of its region: the city's admin1, or the region feature itself. */
  r: string[];
}

export interface PlaceNamesFile {
  source: "GeoNames (geonames.org)";
  licence: "CC BY 4.0";
  built: string;
  langs: string[];
  fid: Record<string, PlaceNamesEntry>;
}

export interface CrosswalkInputs {
  cities: CityIndex;
  admin1: readonly GnAdmin1[];
  /** Alternate names of every id the table may need (resolved cities and every admin1), any filter. */
  altById: ReadonlyMap<number, readonly AltName[]>;
  langs: ReadonlySet<string>;
}

export interface Resolution {
  fid: string;
  /**
   * city: matched in cities500; region: an admin1 (a region feature, or a city feature that
   * names one); in-region: a city feature not matched, whose GDELT region (a middle name part)
   * names an admin1, so only region names are known; none.
   */
  how: "city" | "region" | "in-region" | "none";
  /** The GeoNames id the names come from: the city, else the admin1. */
  g: number;
  /** The city's admin1 id, or the region's own; 0 when none. */
  region: number;
  km?: number;
}

/** Resolve one feature to GeoNames ids (no names yet). */
export function resolveFeature(f: Feature, inputs: Pick<CrosswalkInputs, "cities" | "admin1" | "altById">, admin1ByKey: ReadonlyMap<string, GnAdmin1>): Resolution {
  const hit = matchCity(f, inputs.cities);
  if (hit) {
    const adm = hit.city.adm1 ? admin1ByKey.get(`${hit.city.cc}.${hit.city.adm1}`) : undefined;
    return { fid: f.fid, how: "city", g: hit.city.id, region: adm?.id ?? 0, km: hit.km };
  }
  const reg = matchRegion(f, inputs.admin1, inputs.altById);
  if (reg) return { fid: f.fid, how: "region", g: reg.id, region: reg.id };
  // A city GeoNames does not have within CROSSWALK_KM ("Nagqu, Xizang, China" at a coordinate
  // 900 km from Nagqu): the region its own name gives, by the same admin1 name match.
  if (f.type === 3 || f.type === 4) {
    const within = inputs.admin1.filter((a) => a.cc === f.country);
    for (const m of parts(f.name).middle) {
      const a = admin1Named(foldName(m), within, inputs.altById);
      if (a) return { fid: f.fid, how: "in-region", g: a.id, region: a.id };
    }
  }
  return { fid: f.fid, how: "none", g: 0, region: 0 };
}

/** The table's names for a GeoNames id: kept alternate names plus its main and ASCII names. */
function namesOf(id: number, mainNames: readonly string[], inputs: CrosswalkInputs): string[] {
  const alt = (inputs.altById.get(id) ?? []).filter((a) => keepAltName(a, inputs.langs)).map((a) => a.name);
  return [...alt, ...mainNames];
}

/** The table entry of a resolved feature, or null when it has no name to add. */
export function entryOf(f: Feature, res: Resolution, inputs: CrosswalkInputs, admin1ById: ReadonlyMap<number, GnAdmin1>): PlaceNamesEntry | null {
  if (res.how === "none") return null;
  const { first, middle } = parts(f.name);
  const regionMain = (id: number) => {
    const a = admin1ById.get(id);
    return a ? [a.name, a.ascii] : [];
  };
  let n: string[] = [];
  if (res.how === "city") {
    const c = inputs.cities.byId.get(res.g);
    n = tidyNames(namesOf(res.g, c ? [c.name, c.ascii] : [], inputs), [first]);
  }
  const r = res.region ? tidyNames(namesOf(res.region, regionMain(res.region), inputs), [first, ...middle, ...n]) : [];
  if (n.length === 0 && r.length === 0) return null;
  return { g: res.g, n, r };
}

/** Parse a --fids line: "fid" alone, or "fid<TAB>type<TAB>FullName<TAB>FIPS country<TAB>lat<TAB>lon". */
export function parseFidLine(line: string, fipsToIso: ReadonlyMap<string, string>): { fid: string; feature?: Feature } | null {
  const t = line.replace(/\r$/, "").trim();
  if (!t || t.startsWith("#")) return null;
  const f = t.split("\t").map((s) => s.trim());
  const fid = f[0];
  if (f.length < 6) return { fid };
  const type = Number(f[1]);
  const [lat, lon] = [Number(f[4]), Number(f[5])];
  if ((type !== 2 && type !== 3 && type !== 4 && type !== 5) || !Number.isFinite(lat) || !Number.isFinite(lon) || !f[2]) return { fid };
  const country = fipsToIso.get(f[3]) ?? "";
  return { fid, feature: { fid, type, name: cleanPlaceName(f[2]), country, lat, lon } };
}

/** JSON of the table with one FeatureID per line, keys sorted, so the committed file diffs well. */
export function serializeTable(t: PlaceNamesFile): string {
  const keys = Object.keys(t.fid).sort();
  const head = JSON.stringify({ source: t.source, licence: t.licence, built: t.built, langs: t.langs }).slice(0, -1);
  const body = keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(t.fid[k])}`).join(",\n");
  return `${head},"fid":{\n${body}\n}}\n`;
}
