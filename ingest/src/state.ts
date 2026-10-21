import { gzipSync } from "node:zlib";
import { gunzipMaybe, loadCarried, type CarrySource } from "./carry.ts";
import { isYouTubeVideoUrl } from "./gkg.ts";
import type { ArticleRecord } from "./types.ts";
import type { FeedProgress } from "./window.ts";

/**
 * Ingest-internal state carried between runs (`/data/state.json.gz`).
 *
 * Records are stored as positional arrays to keep the file compact:
 *   [url, title, source, country, lang, time, tone, image, lat, lon, cellId, locationName,
 *    persons, orgs, themes, video]   (persons/orgs/themes are ";"-joined lists; GKG never puts
 *    ";" in a name)
 * Older files still load, so a deploy does not fail on the state already in the cache:
 * version 2 (15 fields, no video) gets video ""; version 1 (12 fields) also gets empty lists.
 * `feeds` holds, per GDELT feed, the 15-minute file stamps already merged into `records`
 * (so files are never counted twice) and the first stamp ever planned (so late files can be
 * retried without widening the window backwards).
 */
export const STATE_VERSION = 3;
/** Record length per readable version. */
const RECORD_LENGTH: Record<number, number> = { 1: 12, 2: 15, 3: 16 };

type PackedRecordV1 = [string, string, string, string, string, string, number, string, number, number, string, string];
type PackedRecordV2 = [...PackedRecordV1, string, string, string];
type PackedRecord = [...PackedRecordV2, string];

interface PackedState {
  v: number;
  savedAt: string;
  feeds: Record<string, FeedProgress>;
  records: (PackedRecord | PackedRecordV2 | PackedRecordV1)[];
}

export interface IngestState {
  feeds: Record<string, FeedProgress>;
  records: ArticleRecord[];
}

function pack(r: ArticleRecord): PackedRecord {
  return [
    r.url, r.title, r.source, r.country, r.lang, r.time, r.tone, r.image, r.lat, r.lon, r.cellId, r.locationName,
    r.persons.join(";"), r.orgs.join(";"), r.themes.join(";"), r.video,
  ];
}

const list = (s: string | undefined) => (s ? s.split(";") : []);

function unpack(p: PackedRecord | PackedRecordV2 | PackedRecordV1): ArticleRecord {
  const [url, title, source, country, lang, time, tone, image, lat, lon, cellId, locationName] = p;
  // Re-check stored videos so URLs accepted by an older, looser rule are cleared.
  const video = p[15] && isYouTubeVideoUrl(p[15]) ? p[15] : "";
  return { url, title, source, country, lang, time, tone, image, lat, lon, cellId, locationName, persons: list(p[12]), orgs: list(p[13]), themes: list(p[14]), video };
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
