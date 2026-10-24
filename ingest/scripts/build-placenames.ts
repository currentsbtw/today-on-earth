/**
 * Build `ingest/data/placenames.json`: local-language names of the places the site shows,
 * from GeoNames (geonames.org, CC BY 4.0), keyed by GDELT FeatureID. top-stories.ts
 * confirmStory reads it so a story whose text names its city or region in its own language
 * (Купянск, 重庆, 西藏) is confirmed (docs/DATA-CONTRACT.md "Top stories", Confirmation).
 * Refreshed by hand, about monthly, and committed.
 *
 *   npm run placenames -- --state <carry dir | state.json.gz> [--top 500] [--geonames <dir>]...
 *   npm run placenames -- --fids <file> [--state <...>] [--geonames <dir>]...
 *
 * Which FeatureIDs: with --state alone, the FeatureID of each of the `--top` largest cells of
 * that state (the most common chosen FeatureID of its records, as the cell file's `fid`).
 * With --fids, the FeatureIDs listed in the file, one per line; a line may carry the feature
 * itself as tab-separated fields (FeatureID, GDELT type, FullName, FIPS country code, lat,
 * lon, as in GKG V2Locations); a bare FeatureID takes its feature from --state's candidates.
 *
 * --geonames: a directory holding the extracted dumps countryInfo.txt, admin1CodesASCII.txt,
 * cities500.txt and alternateNamesV2.txt (repeatable: each file is taken from the first
 * directory that has it). Without it the four files are downloaded from
 * download.geonames.org/export/dump/ into a new temporary directory (about 220 MB, the zips
 * extracted with fflate), and the script says where.
 *
 * --out (default ingest/data/placenames.json), --report <file> (a TSV of every FeatureID's
 * resolution, for checking).
 */
import { createReadStream, existsSync, mkdtempSync, openSync, closeSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import { Unzip, UnzipInflate } from "fflate";
import { fetchWithRetry } from "../src/fetch.ts";
import { resolvePlacement } from "../src/place.ts";
import { decodeState } from "../src/state.ts";
import { countSorted, placeFid } from "../src/stats.ts";
import type { ArticleRecord } from "../src/types.ts";
import {
  CityIndex, FEED_LANGS, altNameId, entryOf, parseAdmin1, parseAltNameLine, parseCountryInfo, parseFidLine, resolveFeature, serializeTable,
  type AltName, type Feature, type GnAdmin1, type PlaceNamesFile, type Resolution,
} from "./placenames-crosswalk.ts";

const log = (msg: string) => process.stderr.write(`${msg}\n`);
const DUMP = "https://download.geonames.org/export/dump/";
const FILES = ["countryInfo.txt", "admin1CodesASCII.txt", "cities500.txt", "alternateNamesV2.txt"] as const;

const { values: args } = parseArgs({
  options: {
    state: { type: "string" },
    fids: { type: "string" },
    top: { type: "string", default: "500" },
    geonames: { type: "string", multiple: true },
    out: { type: "string", default: fileURLToPath(new URL("../data/placenames.json", import.meta.url)) },
    report: { type: "string" },
  },
});
if (!args.state && !args.fids) {
  log("usage: npm run placenames -- (--state <carry dir | state.json.gz> | --fids <file>) [--geonames <dir>]... [--top 500] [--out <file>] [--report <file>]");
  process.exit(2);
}

/** Download one dump file into `dir`; a .zip is streamed through fflate and its `want` entry written out. */
async function download(dir: string, want: string): Promise<void> {
  const zipped = want === "cities500.txt" || want === "alternateNamesV2.txt";
  const url = `${DUMP}${zipped ? want.replace(/\.txt$/, ".zip") : want}`;
  log(`  downloading ${url}`);
  const res = await fetchWithRetry(url, 3, 30 * 60_000);
  if (!res?.body) throw new Error(`could not download ${url}`);
  const fd = openSync(join(dir, want), "w");
  try {
    if (!zipped) {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) writeSync(fd, chunk);
      return;
    }
    let error: Error | null = null;
    let found = false;
    const unzip = new Unzip();
    unzip.register(UnzipInflate);
    unzip.onfile = (file) => {
      if (file.name !== want) return;
      found = true;
      file.ondata = (err, data) => {
        if (err) error = err;
        else writeSync(fd, data);
      };
      file.start();
    };
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      unzip.push(chunk);
      if (error) throw error;
    }
    unzip.push(new Uint8Array(0), true);
    if (error) throw error;
    if (!found) throw new Error(`${want} not found in ${url}`);
  } finally {
    closeSync(fd);
  }
}

async function geonamesFiles(): Promise<Record<(typeof FILES)[number], string>> {
  let dirs = (args.geonames ?? []).map((d) => resolve(d));
  if (dirs.length === 0) {
    const dir = mkdtempSync(join(tmpdir(), "geonames-"));
    log(`no --geonames given: downloading the GeoNames dumps to ${dir} (about 830 MB extracted; they stay there: pass --geonames ${dir} to reuse them, delete the folder when done)`);
    for (const f of FILES) await download(dir, f);
    dirs = [dir];
  }
  const out = {} as Record<(typeof FILES)[number], string>;
  for (const f of FILES) {
    const dir = dirs.find((d) => existsSync(join(d, f)));
    if (!dir) throw new Error(`${f} not found in ${dirs.join(", ")}`);
    out[f] = join(dir, f);
  }
  return out;
}

function loadRecords(path: string): ArticleRecord[] {
  const file = existsSync(join(path, "state.json.gz")) ? join(path, "state.json.gz") : path;
  const { records } = decodeState(readFileSync(file));
  resolvePlacement(records);
  log(`state ${file}: ${records.length} records`);
  return records;
}

/** Each FeatureID's feature from the records' candidates: its most common tidied name (ties by name). */
function featuresOf(records: readonly ArticleRecord[]): Map<string, Feature> {
  const byFid = new Map<string, Map<string, Feature & { k: number }>>();
  for (const r of records) {
    for (const c of r.locs ?? []) {
      if (!c.fid) continue;
      let names = byFid.get(c.fid);
      if (!names) byFid.set(c.fid, (names = new Map()));
      const e = names.get(c.name);
      if (e) e.k++;
      else names.set(c.name, { fid: c.fid, type: c.type, name: c.name, country: c.country, lat: c.lat, lon: c.lon, k: 1 });
    }
  }
  const out = new Map<string, Feature>();
  for (const [fid, names] of byFid) {
    const best = [...names.values()].sort((a, b) => b.k - a.k || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))[0];
    out.set(fid, { fid, type: best.type, name: best.name, country: best.country, lat: best.lat, lon: best.lon });
  }
  return out;
}

/** The FeatureIDs of the `top` largest cells (by records), by the cell file's rule (stats.ts placeFid). */
function topCellFids(records: readonly ArticleRecord[], top: number): string[] {
  const byCell = new Map<string, ArticleRecord[]>();
  for (const r of records) {
    if (!r.cellId) continue;
    let list = byCell.get(r.cellId);
    if (!list) byCell.set(r.cellId, (list = []));
    list.push(r);
  }
  const cells = [...byCell.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1)).slice(0, top);
  const fids = cells.map(([, list]) => placeFid(list, countSorted(list.map((r) => r.locationName).filter(Boolean))[0]?.[0] ?? "")).filter(Boolean);
  return [...new Set(fids)];
}

async function main(): Promise<number> {
  const t0 = performance.now();
  const files = await geonamesFiles();
  const fipsToIso = parseCountryInfo(readFileSync(files["countryInfo.txt"], "utf8"));

  // The features to resolve.
  const records = args.state ? loadRecords(args.state) : [];
  const fromState = featuresOf(records);
  const features = new Map<string, Feature>();
  let missing = 0;
  if (args.fids) {
    for (const line of readFileSync(args.fids, "utf8").split("\n")) {
      const p = parseFidLine(line, fipsToIso);
      if (!p) continue;
      const f = p.feature ?? fromState.get(p.fid);
      if (f) features.set(p.fid, f);
      else missing++;
    }
  } else {
    for (const fid of topCellFids(records, Number(args.top))) features.set(fid, fromState.get(fid)!);
  }
  log(`features: ${features.size}${missing ? ` (${missing} listed FeatureIDs had no feature details and were skipped)` : ""}`);

  // GeoNames: cities, admin1, then one pass over the alternate names for the ids needed.
  const cities = CityIndex.fromText(readFileSync(files["cities500.txt"], "utf8"));
  const admin1 = parseAdmin1(readFileSync(files["admin1CodesASCII.txt"], "utf8"));
  const admin1ByKey = new Map<string, GnAdmin1>(admin1.map((a) => [a.key, a]));
  const admin1ById = new Map<number, GnAdmin1>(admin1.map((a) => [a.id, a]));
  log(`geonames: ${cities.byId.size} cities500 rows, ${admin1.length} admin1 rows`);
  const noAlt = new Map<number, AltName[]>();
  const firstPass = [...features.values()].map((f) => resolveFeature(f, { cities, admin1, altById: noAlt }, admin1ByKey));
  const needed = new Set<number>(admin1.map((a) => a.id));
  for (const r of firstPass) if (r.how === "city") needed.add(r.g);
  const altById = new Map<number, AltName[]>();
  const rl = createInterface({ input: createReadStream(files["alternateNamesV2.txt"], "utf8"), crlfDelay: Infinity });
  let scanned = 0;
  for await (const line of rl) {
    scanned++;
    const id = altNameId(line);
    if (!needed.has(id)) continue;
    const a = parseAltNameLine(line);
    if (!a) continue;
    let list = altById.get(id);
    if (!list) altById.set(id, (list = []));
    list.push(a);
  }
  log(`alternate names: ${scanned} rows scanned, ${[...altById.values()].reduce((s, l) => s + l.length, 0)} kept for ${altById.size} ids`);

  // Regions resolve with the admin1 alternate names; cities resolved already.
  const inputs = { cities, admin1, altById, langs: new Set(FEED_LANGS) };
  const resolutions: Resolution[] = [...features.values()].map((f, i) => (firstPass[i].how === "city" ? firstPass[i] : resolveFeature(f, inputs, admin1ByKey)));
  const fid: PlaceNamesFile["fid"] = {};
  let names = 0;
  [...features.values()].forEach((f, i) => {
    const e = entryOf(f, resolutions[i], inputs, admin1ById);
    if (!e) return;
    fid[f.fid] = e;
    names += e.n.length + e.r.length;
  });
  const table: PlaceNamesFile = {
    source: "GeoNames (geonames.org)",
    licence: "CC BY 4.0",
    built: new Date().toISOString().slice(0, 10),
    langs: [...FEED_LANGS],
    fid,
  };
  const json = serializeTable(table);
  writeFileSync(args.out!, json);
  const tally = (how: Resolution["how"]) => resolutions.filter((r) => r.how === how).length;
  const raw = Buffer.byteLength(json);
  const gz = gzipSync(json, { level: 9 }).length;
  log(`resolved: ${tally("city")} cities, ${tally("region")} regions, ${tally("in-region")} cities by their region only, ${tally("none")} not found`);
  log(`wrote ${args.out}: ${Object.keys(fid).length} FeatureIDs, ${names} names, ${(raw / 1024).toFixed(1)} KB raw, ${(gz / 1024).toFixed(1)} KB gzipped (${((performance.now() - t0) / 1000).toFixed(0)} s)`);

  if (args.report) {
    const rows = [...features.values()].map((f, i) => {
      const r = resolutions[i];
      const e = fid[f.fid];
      return [f.fid, f.type, f.name, f.country, r.how, r.g || "", r.region || "", r.km === undefined ? "" : r.km.toFixed(1), e?.n.length ?? 0, e?.r.length ?? 0].join("\t");
    });
    writeFileSync(args.report, ["fid\ttype\tname\tcountry\thow\tg\tregion\tkm\tn\tr", ...rows].join("\n") + "\n");
    log(`report: ${args.report}`);
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    log(`placenames: FAILED ${(err as Error).stack ?? String(err)}`);
    process.exit(1);
  },
);
