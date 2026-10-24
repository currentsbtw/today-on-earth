import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The place-names table (`ingest/data/placenames.json`, built by scripts/build-placenames.ts
 * from GeoNames, CC BY 4.0): local-language names of a place, keyed by GDELT FeatureID, that
 * top-stories.ts confirmStory accepts besides the English names in the cell name
 * (docs/DATA-CONTRACT.md "Top stories", Confirmation).
 */

export interface LocalNames {
  /** City names. */
  n: readonly string[];
  /** Region names. */
  r: readonly string[];
}

export type PlaceNamesTable = ReadonlyMap<string, LocalNames>;

export const PLACENAMES_PATH = fileURLToPath(new URL("../data/placenames.json", import.meta.url));

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string" && s !== "");

/** The table from the file's parsed JSON; throws when it is not the shape the build writes. */
export function parsePlaceNames(json: unknown): Map<string, LocalNames> {
  const fid = (json as { fid?: unknown } | null)?.fid;
  if (typeof fid !== "object" || fid === null || Array.isArray(fid)) throw new Error('no "fid" object');
  const out = new Map<string, LocalNames>();
  for (const [k, v] of Object.entries(fid)) {
    const e = v as { g?: unknown; n?: unknown; r?: unknown } | null;
    if (!e || typeof e.g !== "number" || !isStrings(e.n) || !isStrings(e.r)) throw new Error(`malformed entry for FeatureID ${k}`);
    out.set(k, { n: e.n, r: e.r });
  }
  return out;
}

/**
 * Load the table. A missing or malformed file is logged and gives an empty table, so the
 * English names alone apply; this never throws.
 */
export function loadPlaceNames(path = PLACENAMES_PATH, log: (msg: string) => void = (m) => process.stderr.write(`${m}\n`)): PlaceNamesTable {
  try {
    return parsePlaceNames(JSON.parse(readFileSync(path, "utf8")));
  } catch (err) {
    log(`place names: ${path} not loaded (${(err as Error).message}); top stories are confirmed by the English names only`);
    return new Map();
  }
}

let shared: PlaceNamesTable | undefined;
/** The committed table, loaded once on first use (so a failure is logged once). */
export function placeNames(): PlaceNamesTable {
  return (shared ??= loadPlaceNames());
}
