/**
 * Today On Earth ingest: GDELT GKG (15-minute files) -> static heatmap files.
 * Output layout and field rules: docs/DATA-CONTRACT.md.
 *
 * Env:
 *   STATE_URL         previous run's /data/state.json.gz (live site). If unset or not an
 *                     http(s) URL, OUT_DIR/state.json.gz is tried instead.
 *   OUT_DIR           output directory (default ingest/out)
 *   WINDOW_HOURS      rolling window (default 24)
 *   COLD_START_HOURS  hours of files to fetch when there is no state (default 6)
 *   RETRY_HOURS       how long to keep retrying files that were not published yet (default 3)
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSnapshot } from "./aggregate.ts";
import { loadCountryLookup } from "./domains.ts";
import { FEEDS, fileUrl, mapLimit, streamZipLines, type Feed } from "./fetch.ts";
import { createRecordAssembler, parseGkgLine, type SkipReason } from "./gkg.ts";
import { encodeState, loadState, StateLoadError, type IngestState, type StateSource } from "./state.ts";
import type { ArticleRecord } from "./types.ts";
import { coveredHours, mergeRecords, planSlots, pruneProcessed, type FeedProgress } from "./window.ts";

const FETCH_CONCURRENCY = 4;
const INGEST_DIR = fileURLToPath(new URL("..", import.meta.url));

const log = (msg: string) => process.stderr.write(`${msg}\n`);

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) throw new Error(`${name} must be a positive number, got "${raw}"`);
  return v;
}

interface FileResult {
  feed: Feed;
  stamp: string;
  status: "ok" | "missing" | "error";
  records: ArticleRecord[];
}

async function main(): Promise<number> {
  const started = Date.now();
  const now = new Date();
  const windowHours = numEnv("WINDOW_HOURS", 24);
  const coldStartHours = numEnv("COLD_START_HOURS", 6);
  const retryHours = numEnv("RETRY_HOURS", 3);
  const outDir = resolve(process.env.OUT_DIR?.trim() || join(INGEST_DIR, "out"));
  const windowStartMs = now.getTime() - windowHours * 3_600_000;
  const windowStartIso = new Date(windowStartMs).toISOString().replace(/\.\d{3}Z$/, "Z");

  log(`ingest: now=${now.toISOString()} window=${windowHours}h out=${outDir}`);

  // Tolerate a trailing slash on SITE_URL ("https://x.github.io/repo/" + "/data/...").
  const stateUrl = (process.env.STATE_URL?.trim() ?? "").replace(/([^:/])\/{2,}/g, "$1/");
  let source: StateSource;
  if (/^https?:\/\/[^/]+/i.test(stateUrl)) {
    source = { kind: "url", url: stateUrl };
  } else {
    if (stateUrl) log(`state: STATE_URL "${stateUrl}" is not an http(s) URL, ignoring it`);
    source = { kind: "file", path: join(outDir, "state.json.gz") };
  }
  let prev: IngestState | null;
  try {
    prev = await loadState(source, log);
  } catch (err) {
    if (!(err instanceof StateLoadError)) throw err;
    log(`ingest: ${err.message}`);
    log("ingest: refusing to cold-start over an existing state; failing this run so nothing is deployed");
    return 1;
  }
  if (!prev) log(`state: cold start, fetching the last ${coldStartHours}h of files`);

  const countryOf = loadCountryLookup();

  const tasks: { feed: Feed; stamp: string }[] = [];
  const feedFrom: Record<string, string> = {};
  for (const feed of FEEDS) {
    const progress = prev?.feeds[feed.name] ?? null;
    const plan = planSlots({ nowMs: now.getTime(), windowHours, coldStartHours, retryHours, progress });
    feedFrom[feed.name] = plan.from;
    for (const stamp of plan.slots) tasks.push({ feed, stamp });
  }
  log(`fetch: ${tasks.length} candidate files across ${FEEDS.length} feeds`);

  const results = await mapLimit(tasks, FETCH_CONCURRENCY, async ({ feed, stamp }): Promise<FileResult> => {
    const records: ArticleRecord[] = [];
    const skipped: Record<SkipReason, number> = { columns: 0, collection: 0, url: 0, date: 0, location: 0 };
    let rows = 0;
    const assembler = createRecordAssembler((row) => {
      rows++;
      const r = parseGkgLine(row, countryOf);
      if (r.ok) records.push(r.record);
      else skipped[r.reason]++;
    });
    try {
      const found = await streamZipLines(fileUrl(feed, stamp), (line) => assembler.push(line));
      if (!found) {
        log(`  ${feed.name} ${stamp}: not published (404), skipped`);
        return { feed, stamp, status: "missing", records: [] };
      }
      assembler.end();
      const skips = Object.entries(skipped).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`).join(" ");
      log(`  ${feed.name} ${stamp}: ${rows} rows, ${records.length} kept${skips ? `, skipped ${skips}` : ""}`);
      return { feed, stamp, status: "ok", records };
    } catch (err) {
      log(`  ${feed.name} ${stamp}: FAILED ${(err as Error).message}`);
      return { feed, stamp, status: "error", records: [] };
    }
  });

  const ok = results.filter((r) => r.status === "ok");
  const failed = results.filter((r) => r.status === "error");
  const missing = results.filter((r) => r.status === "missing");

  const records = mergeRecords([prev?.records ?? [], ...ok.map((r) => r.records)], windowStartIso);

  const feeds: Record<string, FeedProgress> = {};
  for (const feed of FEEDS) {
    const stamps = [...(prev?.feeds[feed.name]?.done ?? []), ...ok.filter((r) => r.feed === feed).map((r) => r.stamp)];
    feeds[feed.name] = { from: feedFrom[feed.name], done: pruneProcessed(stamps, windowStartMs) };
  }

  if (records.length === 0) {
    log("ingest: no articles in the window; refusing to write an empty snapshot");
    return 1;
  }

  const snapshot = buildSnapshot(records, { now, windowHours: coveredHours(now.getTime(), Object.values(feedFrom), windowHours) });

  await mkdir(outDir, { recursive: true });
  const cellsDir = join(outDir, "cells");
  await rm(cellsDir, { recursive: true, force: true });
  await mkdir(cellsDir, { recursive: true });
  await mapLimit(snapshot.cells, 32, (cell) => writeFile(join(cellsDir, `${cell.id}.json`), JSON.stringify(cell)));
  const heatJson = JSON.stringify(snapshot.heat);
  await writeFile(join(outDir, "heat.json"), heatJson);
  const stateBytes = encodeState({ feeds, records }, snapshot.heat.generatedAt);
  await writeFile(join(outDir, "state.json.gz"), stateBytes);

  const t = snapshot.heat.totals;
  log(
    `ingest: files fetched=${ok.length} missing=${missing.length} failed=${failed.length}; ` +
      `new records=${ok.reduce((s, r) => s + r.records.length, 0)}; ` +
      `window articles=${t.articles} (unplaced=${t.unplaced}) outlets=${t.outlets} countries=${t.countries} cells=${t.cells}; ` +
      `heat.json=${Buffer.byteLength(heatJson)}B state.json.gz=${stateBytes.length}B; ` +
      `${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    log(`ingest: fatal: ${(err as Error).stack ?? String(err)}`);
    process.exit(1);
  },
);
