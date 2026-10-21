import { gzipSync } from "node:zlib";
import { gunzipMaybe, loadCarried, type CarrySource } from "./carry.ts";
import { isYouTubeVideoUrl } from "./gkg.ts";
import { KINDS_PATTERN } from "./kinds.ts";
import { cleanPlaceName } from "./placename.ts";
import type { ArticleRecord } from "./types.ts";
import type { FeedProgress } from "./window.ts";

/**
 * Ingest-internal state carried between runs (`/data/state.json.gz`).
 *
 * Records are stored as positional arrays to keep the file compact:
 *   [url, title, source, country, lang, time, tone, image, lat, lon, cellId, locationName,
 *    persons, orgs, themes, video, locationCountry, kinds]   (persons/orgs/themes are ";"-joined lists;
 *    GKG never puts ";" in a name)
 * Older files still load, so a deploy does not fail on the state already in the cache:
 * version 4 (17 fields, no kinds) gets kinds ""; version 3 (16 fields, no locationCountry) also gets
 * locationCountry ""; version 2 (15 fields, no video) also gets video ""; version 1 (12 fields)
 * also gets empty lists.
 * `feeds` holds, per GDELT feed, the 15-minute file stamps already merged into `records`
 * (so files are never counted twice) and the first stamp ever planned (so late files can be
 * retried without widening the window backwards).
 */
export const STATE_VERSION = 5;
/** Record length per readable version. */
const RECORD_LENGTH: Record<number, number> = { 1: 12, 2: 15, 3: 16, 4: 17, 5: 18 };

type PackedRecordV1 = [string, string, string, string, string, string, number, string, number, number, string, string];
type PackedRecordV2 = [...PackedRecordV1, string, string, string];
type PackedRecordV3 = [...PackedRecordV2, string];
type PackedRecordV4 = [...PackedRecordV3, string];
type PackedRecord = [...PackedRecordV4, string];

type AnyPackedRecord = PackedRecord | PackedRecordV4 | PackedRecordV3 | PackedRecordV2 | PackedRecordV1;

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

function pack(r: ArticleRecord): PackedRecord {
  return [
    r.url, r.title, r.source, r.country, r.lang, r.time, r.tone, r.image, r.lat, r.lon, r.cellId, r.locationName,
    r.persons.join(";"), r.orgs.join(";"), r.themes.join(";"), r.video, r.locationCountry, r.kinds,
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
  // Older states hold raw GDELT names; tidy them on load so no raw name survives.
  return { url, title, source, country, lang, time, tone, image, lat, lon, cellId, locationName: locationName && cleanPlaceName(locationName), persons: list(p[12]), orgs: list(p[13]), themes: list(p[14]), video, locationCountry, kinds };
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
