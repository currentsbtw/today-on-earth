import assert from "node:assert/strict";
import { test } from "node:test";
import { latLngToCell } from "h3-js";
import { buildSnapshot } from "../src/aggregate.ts";
import { CarryLoadError } from "../src/carry.ts";
import {
  appendFrame,
  buildHistoryEntry,
  buildIndex,
  decodeHistory,
  encodeHistory,
  frameFileName,
  loadHistory,
  MAX_FRAMES,
  toFrame,
  type HistoryEntry,
} from "../src/history.ts";
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
    lat: 0, lon: 0, cellId: paris, locationName: "Paris, France", persons: [], orgs: [], themes: [], video: "", locationCountry: "",
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

