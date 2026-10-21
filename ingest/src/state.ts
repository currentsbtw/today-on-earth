import { readFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
import type { ArticleRecord } from "./types.ts";
import type { FeedProgress } from "./window.ts";

/**
 * Ingest-internal state carried between runs (`/data/state.json.gz`).
 *
 * Records are stored as positional arrays to keep the file compact:
 *   [url, title, source, country, lang, time, tone, image, lat, lon, cellId, locationName]
 * `feeds` holds, per GDELT feed, the 15-minute file stamps already merged into `records`
 * (so files are never counted twice) and the first stamp ever planned (so late files can be
 * retried without widening the window backwards).
 */
export const STATE_VERSION = 1;

type PackedRecord = [string, string, string, string, string, string, number, string, number, number, string, string];

interface PackedState {
  v: number;
  savedAt: string;
  feeds: Record<string, FeedProgress>;
  records: PackedRecord[];
}

export interface IngestState {
  feeds: Record<string, FeedProgress>;
  records: ArticleRecord[];
}

function pack(r: ArticleRecord): PackedRecord {
  return [r.url, r.title, r.source, r.country, r.lang, r.time, r.tone, r.image, r.lat, r.lon, r.cellId, r.locationName];
}

function unpack(p: PackedRecord): ArticleRecord {
  const [url, title, source, country, lang, time, tone, image, lat, lon, cellId, locationName] = p;
  return { url, title, source, country, lang, time, tone, image, lat, lon, cellId, locationName };
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
  // Some hosts serve .gz with Content-Encoding: gzip and fetch() already inflated it.
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  const json = (isGzip ? gunzipSync(bytes) : Buffer.from(bytes)).toString("utf8");
  const parsed = JSON.parse(json) as PackedState;
  if (parsed.v !== STATE_VERSION || !Array.isArray(parsed.records) || typeof parsed.feeds !== "object") {
    throw new Error(`unsupported state version ${String(parsed.v)}`);
  }
  return {
    feeds: parsed.feeds ?? {},
    records: parsed.records.filter((p) => Array.isArray(p) && p.length === 12).map(unpack),
  };
}

export type StateSource = { kind: "url"; url: string } | { kind: "file"; path: string };

/** Thrown when a remote state exists (or may exist) but could not be read. */
export class StateLoadError extends Error {}

/**
 * Load the previous state. Returns null for a cold start.
 *
 * - URL source: only HTTP 404 (nothing deployed yet) means cold start. Any other failure
 *   (non-404 status, timeout, network error, bad gzip/JSON, version mismatch) throws
 *   StateLoadError, so the run fails instead of deploying a short cold-start window over a
 *   good 24h state.
 * - File source (local runs): a missing or unreadable file means cold start.
 */
export async function loadState(
  source: StateSource,
  log: (msg: string) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<IngestState | null> {
  if (source.kind === "url") {
    let bytes: Uint8Array;
    try {
      const res = await fetchImpl(source.url, { signal: AbortSignal.timeout(120_000) });
      if (res.status === 404) {
        log(`state: ${source.url} returned HTTP 404 (no state deployed yet)`);
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      bytes = new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      throw new StateLoadError(`could not fetch state from ${source.url}: ${(err as Error).message}`);
    }
    let state: IngestState;
    try {
      state = decodeState(bytes);
    } catch (err) {
      throw new StateLoadError(`state at ${source.url} is unreadable: ${(err as Error).message}`);
    }
    log(`state: loaded ${state.records.length} records from ${source.url}`);
    return state;
  }

  try {
    const state = decodeState(await readFile(source.path));
    log(`state: loaded ${state.records.length} records from ${source.path}`);
    return state;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    log(code === "ENOENT" ? `state: no file at ${source.path}` : `state: could not load ${source.path}: ${(err as Error).message}`);
    return null;
  }
}
