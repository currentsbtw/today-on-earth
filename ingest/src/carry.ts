import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

/**
 * Loading of files carried between runs (state.json.gz, history.json.gz): the previous
 * run's copy on the live site, or a local file for local runs.
 */
export type CarrySource = { kind: "url"; url: string } | { kind: "file"; path: string };

/** Thrown when a remote carried file exists (or may exist) but could not be read. */
export class CarryLoadError extends Error {}

/**
 * Pick the source for a carried file: `url` when it is http(s) (a trailing slash on
 * SITE_URL is tolerated), else `<outDir>/<fileName>`.
 */
export function resolveCarrySource(
  url: string | undefined,
  outDir: string,
  fileName: string,
  envName: string,
  log: (msg: string) => void,
): CarrySource {
  const u = (url?.trim() ?? "").replace(/([^:/])\/{2,}/g, "$1/");
  if (/^https?:\/\/[^/]+/i.test(u)) return { kind: "url", url: u };
  if (u) log(`${envName} "${u}" is not an http(s) URL, ignoring it`);
  return { kind: "file", path: join(outDir, fileName) };
}

/** gunzip if the bytes are gzip (some hosts serve .gz with Content-Encoding and fetch inflates it). */
export function gunzipMaybe(bytes: Uint8Array): string {
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  return (isGzip ? gunzipSync(bytes) : Buffer.from(bytes)).toString("utf8");
}

/**
 * Load and decode a carried file. Returns null when there is nothing to carry.
 *
 * - URL source: only HTTP 404 (nothing deployed yet) means null. Any other failure
 *   (non-404 status, timeout, network error, undecodable content) throws CarryLoadError,
 *   so the run fails instead of deploying over good data.
 * - File source (CARRY_DIR, local runs and CI): only a missing file (ENOENT) means null.
 *   A file that exists but cannot be read, decoded, or has the wrong version throws
 *   CarryLoadError, like the URL path.
 */
export async function loadCarried<T>(
  source: CarrySource,
  what: string,
  decode: (bytes: Uint8Array) => T,
  log: (msg: string) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<T | null> {
  if (source.kind === "url") {
    let bytes: Uint8Array;
    try {
      const res = await fetchImpl(source.url, { signal: AbortSignal.timeout(120_000) });
      if (res.status === 404) {
        log(`${what}: ${source.url} returned HTTP 404 (nothing deployed yet)`);
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      bytes = new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      throw new CarryLoadError(`could not fetch ${what} from ${source.url}: ${(err as Error).message}`);
    }
    try {
      const value = decode(bytes);
      log(`${what}: loaded from ${source.url}`);
      return value;
    } catch (err) {
      throw new CarryLoadError(`${what} at ${source.url} is unreadable: ${(err as Error).message}`);
    }
  }

  let bytes: Uint8Array;
  try {
    bytes = await readFile(source.path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      log(`${what}: no file at ${source.path}`);
      return null;
    }
    throw new CarryLoadError(`could not read ${what} at ${source.path}: ${(err as Error).message}`);
  }
  try {
    const value = decode(bytes);
    log(`${what}: loaded from ${source.path}`);
    return value;
  } catch (err) {
    throw new CarryLoadError(
      `${what} at ${source.path} is unreadable: ${(err as Error).message} (delete it, or clear the Actions cache, to cold-start)`,
    );
  }
}
