import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { latLngToCell } from "h3-js";
import { buildSnapshot } from "../src/aggregate.ts";
import { CarryLoadError } from "../src/carry.ts";
import {
  appendFrame,
  arrivedUnits,
  buildHistoryEntry,
  buildIndex,
  decodeHistory,
  encodeHistory,
  frameFileName,
  loadHistory,
  MAX_FRAMES,
  previousFrame,
  stepArrivals,
  toFrame,
  type HistoryEntry,
} from "../src/history.ts";
import { createKeyer } from "../src/reprints.ts";
import type { ArticleRecord } from "../src/types.ts";

const totals = { articles: 10, outlets: 5, countries: 3, cells: 2, unplaced: 1 };
const entry = (at: string, n = 5): HistoryEntry => ({ at, windowHours: 24, totals, cells: [["832830fffffffff", 48.86, 2.35, n]] });
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

test("frame file name is `at` with punctuation removed", () => {
  assert.equal(frameFileName("2026-10-21T04:47:14Z"), "20261021T044714Z.json");
});

test("frame built from this run's cells: [id, lat, lon, n], n >= 2, sorted by n desc", () => {
  const paris = latLngToCell(48.8566, 2.3522, 3);
  const lagos = latLngToCell(6.45, 3.39, 3);
  const base: ArticleRecord = {
    url: "", title: "", source: "a.com", country: "FR", lang: "fr", time: "2026-10-21T04:00:00Z", tone: 0, image: "",
    lat: 0, lon: 0, cellId: paris, locationName: "Paris, France", persons: [], orgs: [], themes: [], video: "", locationCountry: "", kinds: "",
  };
  const records = [
    ...[1, 2, 3].map((i) => ({ ...base, url: `https://p/${i}` })),
    ...[1, 2].map((i) => ({ ...base, url: `https://l/${i}`, cellId: lagos })),
    { ...base, url: "https://lonely", cellId: latLngToCell(-33.9, 151.2, 3) }, // n = 1, dropped
    { ...base, url: "https://unplaced", cellId: "" },
  ];
  const { heat } = buildSnapshot(records, { now: new Date("2026-10-21T04:47:14.500Z"), windowHours: 6 });
  const e = buildHistoryEntry(heat);
  assert.equal(e.at, "2026-10-21T04:47:14Z");
  assert.equal(e.windowHours, 6);
  const { reprints: _copies, ...indexTotals } = heat.totals; // the index keeps the original five
  assert.deepEqual(e.totals, indexTotals);
  assert.deepEqual(toFrame(e), {
    at: "2026-10-21T04:47:14Z",
    cells: heat.cells.map((c) => [c.id, c.lat, c.lon, c.n]),
  });
  assert.deepEqual(e.cells.map((c) => [c[0], c[3]]), [[paris, 3], [lagos, 2]]);
  for (const [, lat, lon] of e.cells) {
    assert.equal(lat, Math.round(lat * 100) / 100);
    assert.equal(lon, Math.round(lon * 100) / 100);
  }
});

test("a run with no prior history yields exactly one frame", () => {
  const h = appendFrame([], entry("2026-10-21T04:47:14Z"));
  assert.equal(h.length, 1);
  assert.deepEqual(buildIndex(h).frames.map((f) => f.file), ["20261021T044714Z.json"]);
});

test("retention: frames older than 24h before this run are dropped; exactly 24h is kept", () => {
  const now = Date.parse("2026-10-21T12:00:00Z");
  const prev = [
    entry(iso(now - 24 * 3_600_000 - 1000)), // 24h and 1s old: dropped
    entry(iso(now - 24 * 3_600_000)), // exactly 24h: kept
    entry(iso(now - 3_600_000)),
  ];
  const h = appendFrame(prev, entry(iso(now)));
  assert.deepEqual(h.map((f) => f.at), ["2026-10-20T12:00:00Z", "2026-10-21T11:00:00Z", "2026-10-21T12:00:00Z"]);
});

test("retention: at most 100 frames, newest kept, current run last", () => {
  const now = Date.parse("2026-10-21T12:00:00Z");
  const prev: HistoryEntry[] = [];
  for (let i = 1; i <= 120; i++) prev.push(entry(iso(now - i * 60_000))); // one per minute, all within 24h
  const h = appendFrame(prev, entry(iso(now)));
  assert.equal(h.length, MAX_FRAMES);
  assert.equal(h.at(-1)!.at, iso(now));
  assert.equal(h[0].at, iso(now - 99 * 60_000));
});

test("index is oldest first, last entry is this run, and a rerun at the same `at` replaces its frame", () => {
  const prev = [entry("2026-10-21T04:30:00Z"), entry("2026-10-21T04:00:00Z"), entry("2026-10-21T04:15:00Z")];
  const h = appendFrame(prev, entry("2026-10-21T04:45:00Z", 9));
  const idx = buildIndex(h);
  assert.deepEqual(idx.frames.map((f) => f.at), ["2026-10-21T04:00:00Z", "2026-10-21T04:15:00Z", "2026-10-21T04:30:00Z", "2026-10-21T04:45:00Z"]);
  assert.deepEqual(idx.frames.at(-1), { at: "2026-10-21T04:45:00Z", file: "20261021T044500Z.json", windowHours: 24, totals });
  const again = appendFrame(h, entry("2026-10-21T04:45:00Z", 11));
  assert.equal(again.length, 4);
  assert.equal(again.at(-1)!.cells[0][3], 11);
});

test("decodeHistory drops frames whose `at` is not a strict ISO UTC stamp", () => {
  const good = entry("2026-10-21T04:00:00Z");
  const poisoned = ["../../../etc/passwd", "2026-10-21T04:00:00Z/../../x", "2026-10-21T04:00:00.000Z", "2026-10-21 04:00:00Z", "..\\evil", ""];
  const bytes = encodeHistory([good, ...poisoned.map((at) => entry(at))]);
  const decoded = decodeHistory(bytes);
  assert.deepEqual(decoded.map((f) => f.at), ["2026-10-21T04:00:00Z"]);
  for (const f of decoded) assert.match(frameFileName(f.at), /^\d{8}T\d{6}Z\.json$/);
});

test("history.json.gz round-trips and follows the state file's fetch rules", async () => {
  const h = appendFrame([entry("2026-10-21T04:00:00Z")], entry("2026-10-21T04:15:00Z"));
  assert.deepEqual(decodeHistory(encodeHistory(h)), h);
  const src = { kind: "url", url: "https://example.test/data/history.json.gz" } as const;
  const respond = (r: Response) => (async () => r) as unknown as typeof fetch;
  const quiet = () => {};
  assert.equal(await loadHistory(src, quiet, respond(new Response("", { status: 404 }))), null);
  assert.deepEqual(await loadHistory(src, quiet, respond(new Response(new Uint8Array(encodeHistory(h))))), h);
  await assert.rejects(loadHistory(src, quiet, respond(new Response("", { status: 503 }))), CarryLoadError);
  await assert.rejects(loadHistory(src, quiet, respond(new Response("{}"))), CarryLoadError);
});


// ---- arrivals per step: `newest`, `added` and the row element `a` ----

const PARIS = latLngToCell(48.8566, 2.3522, 3);
const LAGOS = latLngToCell(6.45, 3.39, 3);
const record = (url: string, time: string, cellId = PARIS): ArticleRecord => ({
  url, title: "", source: "a.com", country: "FR", lang: "fr", time, tone: 0, image: "",
  lat: 0, lon: 0, cellId, locationName: "Paris, France", persons: [], orgs: [], themes: [], video: "", locationCountry: "", kinds: "",
});
/** The previous run's carried window, and this run's window after merging new files. */
const previousWindow = (): ArticleRecord[] => [
  record("https://p/1", "2026-10-21T04:15:00Z"),
  record("https://p/2", "2026-10-21T04:30:00Z"),
  record("https://l/1", "2026-10-21T04:15:00Z", LAGOS),
  record("https://l/2", "2026-10-21T04:30:00Z", LAGOS),
];
const thisWindow = (): ArticleRecord[] => [
  ...previousWindow(),
  record("https://p/3", "2026-10-21T04:45:00Z"), // new URL: counted
  // A translingual file arriving late: GKG time older than the window's newest, still counted.
  record("https://p/late", "2026-10-21T03:30:00Z"),
  record("https://lonely", "2026-10-21T04:45:00Z", latLngToCell(-33.9, 151.2, 3)), // n = 1: in `added`, no row
  record("https://unplaced", "2026-10-21T04:45:00Z", ""), // unplaced: in `added`, no `a`
];
const urls = (records: readonly ArticleRecord[]) => new Set(records.map((r) => r.url));
const stepHeat = (records: readonly ArticleRecord[]) => buildSnapshot(records, { now: new Date("2026-10-21T04:47:14Z"), windowHours: 24 }).heat;
const prevFrame: HistoryEntry = { ...entry("2026-10-21T04:32:00Z"), newest: "2026-10-21T04:30:00Z" };

test("arrivals: a URL in the previous carried window is not counted, a new URL is, whatever its GKG time", () => {
  const arrived = arrivedUnits(thisWindow(), urls(previousWindow()), createKeyer(thisWindow()));
  assert.deepEqual(arrived.map((r) => r.url), ["https://p/3", "https://p/late", "https://lonely", "https://unplaced"]);
  assert.deepEqual(arrivedUnits(previousWindow(), urls(previousWindow()), createKeyer(previousWindow())), []);
});

test("added counts arrivals placed and unplaced; `a` counts them per cell, only for cells in the frame", () => {
  const records = thisWindow();
  const heat = stepHeat(records);
  const e = buildHistoryEntry(heat, stepArrivals(arrivedUnits(records, urls(previousWindow()), createKeyer(records)), true, prevFrame));
  assert.equal(e.newest, "2026-10-21T04:45:00Z"); // still the newest article time
  assert.equal(e.added, 4);
  assert.deepEqual(e.cells.map((c) => [c[0], c[3], c[4]]), [[PARIS, 4, 2], [LAGOS, 2, 0]]);
  assert.ok(e.cells.every((c) => c.length === 5));
  assert.deepEqual(toFrame(e).cells[0], [PARIS, e.cells[0][1], e.cells[0][2], 4, 2]);
  // Nothing arrived is 0, not absent.
  const quiet = buildHistoryEntry(stepHeat(previousWindow()), stepArrivals(arrivedUnits(previousWindow(), urls(previousWindow()), createKeyer(previousWindow())), true, prevFrame));
  assert.equal(quiet.added, 0);
  assert.ok(quiet.cells.every((c) => c.length === 5 && c[4] === 0));
});

test("arrived units: an outlet's later copy adds 0, another outlet's copy adds 1, a new headline adds 1", () => {
  const wire = "Storm hits coast, thousands without power";
  const titled = (url: string, source: string, title: string, cellId = PARIS) => ({ ...record(url, "2026-10-21T04:45:00Z", cellId), source, title });
  const previous = [
    { ...titled("https://a/1", "a.com", wire), time: "2026-10-21T04:00:00Z" },
    { ...titled("https://x/1", "x.com", "Council approves the new stadium budget"), time: "2026-10-21T04:00:00Z" },
  ];
  const window = [
    ...previous,
    titled("https://a/2", "a.com", `${wire} - A`), // a.com's copy of a headline it already had: 0
    titled("https://b/1", "b.com", wire), // a second outlet's copy: 1
    titled("https://c/1", "c.com", "Ferry service resumes after the storm"), // a new headline: 1
    titled("https://c/2", "c.com", "Ferry service resumes after the storm"), // its copy in the same step: still 1
    titled("https://d/1", "d.com", wire, LAGOS), // the same headline in another place: 1 there
    titled("https://d/2", "d.com", "Lagos port reopens after the storm", LAGOS),
  ];
  const keyer = createKeyer(window);
  const arrived = arrivedUnits(window, urls(previous), keyer);
  assert.deepEqual(arrived.map((r) => r.url).sort(), ["https://b/1", "https://c/1", "https://d/1", "https://d/2"]);
  const heat = buildSnapshot(window, { now: new Date("2026-10-21T04:47:14Z"), windowHours: 24, keyer }).heat;
  const e = buildHistoryEntry(heat, stepArrivals(arrived, true, prevFrame));
  assert.equal(e.added, 4);
  assert.deepEqual(e.cells.map((c) => [c[0], c[3], c[4]]), [[PARIS, 4, 2], [LAGOS, 2, 2]]); // a <= n
  assert.ok(e.added! <= heat.totals.articles);
});

test("cold start of the state, or no previous frame: `added` and `a` absent, rows keep four elements", () => {
  const records = thisWindow();
  const arrived = arrivedUnits(records, new Set(), createKeyer(records)); // a cold start merges everything as new
  for (const known of [stepArrivals(arrived, false, prevFrame), stepArrivals(arrived, true, null)]) {
    assert.equal(known, undefined);
    const e = buildHistoryEntry(stepHeat(records), known);
    assert.equal(e.newest, "2026-10-21T04:45:00Z");
    assert.equal("added" in e, false);
    assert.ok(e.cells.every((c) => c.length === 4));
  }
});

test("previousFrame: the newest retained entry before this run; a same-`at` frame is skipped", () => {
  const h = [
    entry("2026-10-20T04:00:00Z"), // older than 24h before the run: not retained
    entry("2026-10-21T04:15:00Z"),
    entry("2026-10-21T04:30:00Z"), // the frame a rerun at 04:30 replaces
  ];
  assert.equal(previousFrame(h, "2026-10-21T04:45:00Z")?.at, "2026-10-21T04:30:00Z");
  assert.equal(previousFrame(h, "2026-10-21T04:30:00Z")?.at, "2026-10-21T04:15:00Z");
  assert.equal(previousFrame(h, "2026-10-21T04:15:00Z"), null); // only the >24h one is older
  assert.equal(previousFrame([], "2026-10-21T04:15:00Z"), null);
});

test("index entries carry `newest` and `added` only when known", () => {
  const records = thisWindow();
  const heat = stepHeat(records);
  const second = buildHistoryEntry(heat, stepArrivals(arrivedUnits(records, urls(previousWindow()), createKeyer(records)), true, prevFrame));
  const idx = buildIndex(appendFrame([entry("2026-10-21T03:45:00Z"), prevFrame], second));
  assert.deepEqual(Object.keys(idx.frames[0]), ["at", "file", "windowHours", "totals"]); // carried from version 1
  assert.deepEqual(Object.keys(idx.frames[1]), ["at", "file", "windowHours", "newest", "totals"]); // first frame after a cold start
  assert.deepEqual(idx.frames[2], {
    at: "2026-10-21T04:47:14Z",
    file: "20261021T044714Z.json",
    windowHours: 24,
    newest: "2026-10-21T04:45:00Z",
    added: 4,
    totals: second.totals,
  });
});

test("version 1 history loads as unknown: no `newest`, no `added`, four-element rows", () => {
  const v1 = gzipSync(JSON.stringify({ v: 1, frames: [entry("2026-10-21T04:00:00Z"), { ...entry("2026-10-21T04:15:00Z"), newest: "2026-10-21T04:00:00Z", added: 3, cells: [["832830fffffffff", 48.86, 2.35, 5, 2]] }] }));
  const decoded = decodeHistory(v1);
  assert.deepEqual(decoded, [entry("2026-10-21T04:00:00Z"), entry("2026-10-21T04:15:00Z")]);
  // A version 1 frame is still a previous frame: the first run after the upgrade counts arrivals.
  const records = thisWindow();
  const heat = stepHeat(records);
  const e = buildHistoryEntry(heat, stepArrivals(arrivedUnits(records, urls(previousWindow()), createKeyer(records)), true, previousFrame(decoded, heat.generatedAt)));
  assert.equal(e.added, 4);
  // Version 2 round-trips `newest`, `added` and `a`; a version 2 entry with an unusable `added` is unknown.
  const h = appendFrame(decoded, e);
  assert.deepEqual(decodeHistory(encodeHistory(h)), h);
  const [b] = decodeHistory(gzipSync(JSON.stringify({ v: 2, frames: [{ ...e, added: -1 }] })));
  assert.equal("added" in b, false);
  assert.ok(b.cells.every((c) => c.length === 4));
  assert.throws(() => decodeHistory(gzipSync(JSON.stringify({ v: 3, frames: [] }))), /unsupported history version 3/);
});
