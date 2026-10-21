/**
 * Today On Earth ingest: GDELT GKG (15-minute files) -> static heatmap files.
 * Output layout and field rules: docs/DATA-CONTRACT.md.
 *
 * Env:
 *   OUT_DIR           output directory for the site's data (default ingest/out)
 *   CARRY_DIR         where state.json.gz, history.json.gz and baseline.json.gz are read and written
 *                     (default OUT_DIR). In CI this folder travels between runs via the
 *                     Actions cache and is never part of the deployed site.
 *   STATE_URL         optional http(s) URL to read the previous state from instead of
 *                     CARRY_DIR (404 = cold start, any other failure fails the run)
 *   HISTORY_URL       same, for history.json.gz (baseline.json.gz is only read from CARRY_DIR)
 *   WINDOW_HOURS      rolling window (default 24)
 *   COLD_START_HOURS  hours of files to fetch when there is no state (default 6)
 *   RETRY_HOURS       how long to keep retrying files that were not published yet (default 3)
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSnapshot } from "./aggregate.ts";
import { buildBroadcastSafe } from "./broadcast.ts";
import { loadCountryLookup } from "./domains.ts";
import { FEEDS, fileUrl, mapLimit, streamZipLines, type Feed } from "./fetch.ts";
import { createRecordAssembler, parseGkgLine, type SkipReason } from "./gkg.ts";
import { advanceBaseline, baselineView, encodeBaseline, loadBaseline, utcDay, type Baseline } from "./baseline.ts";
import { CarryLoadError, resolveCarrySource } from "./carry.ts";
import { appendFrame, buildHistoryEntry, buildIndex, encodeHistory, frameFileName, loadHistory, toFrame, type HistoryEntry } from "./history.ts";
import { encodeState, loadState, type IngestState } from "./state.ts";
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
  const carryDir = resolve(process.env.CARRY_DIR?.trim() || outDir);
  const windowStartMs = now.getTime() - windowHours * 3_600_000;
  const windowStartIso = new Date(windowStartMs).toISOString().replace(/\.\d{3}Z$/, "Z");

  log(`ingest: now=${now.toISOString()} window=${windowHours}h out=${outDir} carry=${carryDir}`);

  // State and history are carried independently: a missing (404) state cold-starts the
  // window but keeps history, and vice versa. Any other load failure fails the run.
  const stateSource = resolveCarrySource(process.env.STATE_URL, carryDir, "state.json.gz", "STATE_URL", log);
  const historySource = resolveCarrySource(process.env.HISTORY_URL, carryDir, "history.json.gz", "HISTORY_URL", log);
  let prev: IngestState | null;
  let prevHistory: HistoryEntry[] | null;
  let prevBaseline: Baseline | null;
  try {
    prev = await loadState(stateSource, log);
    prevHistory = await loadHistory(historySource, log);
    // The baseline is only ever carried in CARRY_DIR (no URL variant).
    prevBaseline = await loadBaseline({ kind: "file", path: join(carryDir, "baseline.json.gz") }, log);
  } catch (err) {
    if (!(err instanceof CarryLoadError)) throw err;
    log(`ingest: ${err.message}`);
    log("ingest: refusing to start over existing data; failing this run so nothing is deployed");
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

  // Baseline: count each placed article once, when it first enters the state, by its UTC day.
  const today = utcDay(now.toISOString());
  const prevUrls = new Set((prev?.records ?? []).map((r) => r.url));
  const firstMerged = records.filter((r) => !prevUrls.has(r.url));
  const mergedStamps: Record<string, string[]> = {};
  for (const r of ok) (mergedStamps[r.feed.name] ??= []).push(r.stamp);
  const nextBaseline = advanceBaseline({ prev: prevBaseline, stateLoaded: prev !== null, firstMerged, mergedStamps, today, log });
  const baseline = baselineView(nextBaseline, today, FEEDS.map((f) => f.name));

  const snapshot = buildSnapshot(records, {
    now,
    windowHours: coveredHours(now.getTime(), Object.values(feedFrom), windowHours),
    baseline,
  });

  await mkdir(outDir, { recursive: true });
  const cellsDir = join(outDir, "cells");
  await rm(cellsDir, { recursive: true, force: true });
  await mkdir(cellsDir, { recursive: true });
  await mapLimit(snapshot.cells, 32, (cell) => writeFile(join(cellsDir, `${cell.id}.json`), JSON.stringify(cell)));
  const heatJson = JSON.stringify(snapshot.heat);
  await writeFile(join(outDir, "heat.json"), heatJson);
  const broadcast = buildBroadcastSafe({ heat: snapshot.heat, cells: snapshot.cells, storyTagged: snapshot.storyTagged, baselineSince: nextBaseline.since }, log);
  await writeFile(join(outDir, "broadcast.json"), JSON.stringify(broadcast));
  const stateBytes = encodeState({ feeds, records }, snapshot.heat.generatedAt);
  await mkdir(carryDir, { recursive: true });
  await writeFile(join(carryDir, "state.json.gz"), stateBytes);

  // Replay history: append this run's frame, trim, and re-emit every retained frame
  // (the Pages deploy replaces the whole site each run).
  const history = appendFrame(prevHistory ?? [], buildHistoryEntry(snapshot.heat));
  const historyDir = join(outDir, "history");
  await rm(historyDir, { recursive: true, force: true });
  await mkdir(historyDir, { recursive: true });
  let largestFrame = 0;
  for (const entry of history) {
    const json = JSON.stringify(toFrame(entry));
    largestFrame = Math.max(largestFrame, Buffer.byteLength(json));
    await writeFile(join(historyDir, frameFileName(entry.at)), json);
  }
  await writeFile(join(historyDir, "index.json"), JSON.stringify(buildIndex(history)));
  const historyBytes = encodeHistory(history);
  await writeFile(join(carryDir, "history.json.gz"), historyBytes);
  const baselineBytes = encodeBaseline(nextBaseline);
  await writeFile(join(carryDir, "baseline.json.gz"), baselineBytes);

  const t = snapshot.heat.totals;
  const storyCount = snapshot.cells.reduce((sum, c) => sum + c.stories.length, 0);
  log(`broadcast: ${broadcast.slots.map((s) => `${s.id}=${s.available ? "on" : s.reason}`).join(" ")}`);
  log(`stories: ${storyCount} stories across ${snapshot.cells.length} cells, grouped in ${(snapshot.storiesMs / 1000).toFixed(2)}s`);
  log(
    `ingest: files fetched=${ok.length} missing=${missing.length} failed=${failed.length}; ` +
      `new records=${ok.reduce((s, r) => s + r.records.length, 0)}; ` +
      `window articles=${t.articles} (unplaced=${t.unplaced}) outlets=${t.outlets} countries=${t.countries} cells=${t.cells}; ` +
      `heat.json=${Buffer.byteLength(heatJson)}B state.json.gz=${stateBytes.length}B; ` +
      `history frames=${history.length} largest frame=${largestFrame}B history.json.gz=${historyBytes.length}B; ` +
      `baseline days=${Object.keys(nextBaseline.days).length} complete=${baseline.baselineDays} new=${firstMerged.length} baseline.json.gz=${baselineBytes.length}B; ` +
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
