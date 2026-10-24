import { gzipSync } from "node:zlib";
import { gunzipMaybe, loadCarried, type CarrySource } from "./carry.ts";
import { isYouTubeVideoUrl } from "./gkg.ts";
import { KINDS_PATTERN } from "./kinds.ts";
import { cleanPlaceName } from "./placename.ts";
import type { ArticleRecord, LocationCandidate } from "./types.ts";
import type { FeedProgress } from "./window.ts";

/**
 * Ingest-internal state carried between runs (`/data/state.json.gz`).
 *
 * Records are stored as positional arrays to keep the file compact:
 *   [url, title, source, country, lang, time, tone, image, lat, lon, cellId, locationName,
 *    persons, orgs, themes, video, locationCountry, kinds, locs]   (persons/orgs/themes are ";"-joined lists;
 *    GKG never puts ";" in a name; locs is the candidate list, see packLocs)
 * Older files still load, so a deploy does not fail on the state already in the cache:
 * version 5 (18 fields, no locs) gets no candidates, so its stored placement is kept as is; version 4 (17 fields, no kinds) gets kinds ""; version 3 (16 fields, no locationCountry) also gets
 * locationCountry ""; version 2 (15 fields, no video) also gets video ""; version 1 (12 fields)
 * also gets empty lists.
 * A record's locationFid is not stored: place.ts resolves it from `locs` with the rest of the
 * placement at snapshot time (added 2026-10-24, the version unchanged).
 * `feeds` holds, per GDELT feed, the 15-minute file stamps already merged into `records`
 * (so files are never counted twice) and the first stamp ever planned (so late files can be
 * retried without widening the window backwards).
 */
export const STATE_VERSION = 6;
/** Record length per readable version. */
const RECORD_LENGTH: Record<number, number> = { 1: 12, 2: 15, 3: 16, 4: 17, 5: 18, 6: 19 };

type PackedRecordV1 = [string, string, string, string, string, string, number, string, number, number, string, string];
type PackedRecordV2 = [...PackedRecordV1, string, string, string];
type PackedRecordV3 = [...PackedRecordV2, string];
type PackedRecordV4 = [...PackedRecordV3, string];
type PackedRecordV5 = [...PackedRecordV4, string];
type PackedRecord = [...PackedRecordV5, string];

type AnyPackedRecord = PackedRecord | PackedRecordV5 | PackedRecordV4 | PackedRecordV3 | PackedRecordV2 | PackedRecordV1;

interface PackedState {
  v: number;
  savedAt: string;
  feeds: Record<string, FeedProgress>;
  records: AnyPackedRecord[];
}

export interface IngestState {
  feeds: Record<string, FeedProgress>;
  records: ArticleRecord[];
}

/**
 * Candidates as one string: candidates joined by ";", each "type|name|country|lat|lon|n|at|fid".
 * Names and FeatureIDs never contain "|" or ";" (gkg.ts replaces them at parse time).
 */
export function packLocs(locs: readonly LocationCandidate[] | undefined): string {
  return (locs ?? []).map((c) => [c.type, c.name, c.country, c.lat, c.lon, c.n, c.at, c.fid].join("|")).join(";");
}

/** Inverse of packLocs; malformed candidates are dropped. */
export function unpackLocs(s: unknown): LocationCandidate[] {
  if (typeof s !== "string" || s === "") return [];
  const out: LocationCandidate[] = [];
  for (const part of s.split(";")) {
    const f = part.split("|");
    if (f.length !== 8) continue;
    const type = Number(f[0]);
    const [lat, lon, n, at] = [Number(f[3]), Number(f[4]), Number(f[5]), Number(f[6])];
    if (type !== 2 && type !== 3 && type !== 4 && type !== 5) continue;
    if (!f[1] || ![lat, lon, n, at].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || n < 1) continue;
    out.push({ type, name: f[1], country: /^[A-Z]{2}$/.test(f[2]) ? f[2] : "", lat, lon, n, at, fid: f[7] });
  }
  return out;
}

function pack(r: ArticleRecord): PackedRecord {
  return [
    r.url, r.title, r.source, r.country, r.lang, r.time, r.tone, r.image, r.lat, r.lon, r.cellId, r.locationName,
    r.persons.join(";"), r.orgs.join(";"), r.themes.join(";"), r.video, r.locationCountry, r.kinds, packLocs(r.locs),
  ];
}

const list = (s: string | undefined) => (s ? s.split(";") : []);

function unpack(p: AnyPackedRecord): ArticleRecord {
  const [url, title, source, country, lang, time, tone, image, lat, lon, cellId, locationName] = p;
  // Re-check stored videos so URLs accepted by an older, looser rule are cleared.
  const video = p[15] && isYouTubeVideoUrl(p[15]) ? p[15] : "";
  // Only an ISO alpha-2 code survives; older states have none and get "" (the cell's home
  // country then resolves itself as new records arrive).
  const locationCountry = typeof p[16] === "string" && /^[A-Z]{2}$/.test(p[16]) ? p[16] : "";
  // Older states have no kinds: "" (the story's kinds share then counts them as untagged).
  const kinds = typeof p[17] === "string" && KINDS_PATTERN.test(p[17]) ? p[17] : "";
  // Versions before 6 have no candidates (place.ts then keeps the stored placement); an empty
  // list is left out, as parseGkgLine leaves it out for country-only articles.
  const locs = unpackLocs(p[18]);
  // Older states hold raw GDELT names; tidy them on load so no raw name survives.
  return { url, title, source, country, lang, time, tone, image, lat, lon, cellId, locationName: locationName && cleanPlaceName(locationName), persons: list(p[12]), orgs: list(p[13]), themes: list(p[14]), video, locationCountry, kinds, ...(locs.length ? { locs } : {}) };
}

export function encodeState(state: IngestState, savedAt: string): Buffer {
  const packed: PackedState = {
    v: STATE_VERSION,
    savedAt,
    feeds: state.feeds,
    records: state.records.map(pack),
  };
  return gzipSync(JSON.stringify(packed), { level: 9 });
}

export function decodeState(bytes: Uint8Array): IngestState {
  const parsed = JSON.parse(gunzipMaybe(bytes)) as PackedState;
  if (!(parsed.v in RECORD_LENGTH) || !Array.isArray(parsed.records) || typeof parsed.feeds !== "object") {
    throw new Error(`unsupported state version ${String(parsed.v)}`);
  }
  return {
    feeds: parsed.feeds ?? {},
    records: parsed.records.filter((p) => Array.isArray(p) && p.length === RECORD_LENGTH[parsed.v]).map(unpack),
  };
}

/** Load the previous state (null = cold start). Fetch rules: see loadCarried in carry.ts. */
export function loadState(source: CarrySource, log: (msg: string) => void, fetchImpl: typeof fetch = fetch): Promise<IngestState | null> {
  return loadCarried(source, "state", decodeState, log, fetchImpl);
}
