import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { baselineView, completeDays, countNewRecords, decodeBaseline, encodeBaseline, loadBaseline, trimDays, type BaselineDays } from "../src/baseline.ts";
import { buildSnapshot } from "../src/aggregate.ts";
import { CarryLoadError } from "../src/carry.ts";
import type { ArticleRecord } from "../src/types.ts";
import { mergeRecords } from "../src/window.ts";

const rec = (url: string, time: string, cellId = "832aa8fffffffff"): ArticleRecord => ({
  url, title: "", source: "a.com", country: "", lang: "en", time, tone: 0, image: "", lat: 0, lon: 0,
  cellId, locationName: "", persons: [], orgs: [], themes: [], video: "",
});
const quiet = () => {};

test("day bucketing uses the article's UTC GKG time, at the boundary too", () => {
  const days = countNewRecords({}, [
    rec("u1", "2026-10-20T23:59:59Z"),
    rec("u2", "2026-10-21T00:00:00Z"),
    rec("u3", "2026-10-21T00:15:00Z", "83194afffffffff"),
    rec("unplaced", "2026-10-21T01:00:00Z", ""),
  ]);
  assert.deepEqual(days, {
    "2026-10-20": { "832aa8fffffffff": 1 },
    "2026-10-21": { "832aa8fffffffff": 1, "83194afffffffff": 1 },
  });
});

test("14-day trim keeps today and the 14 days before it", () => {
  const days: BaselineDays = {};
  for (let i = 0; i <= 20; i++) days[new Date(Date.UTC(2026, 9, 21 - i)).toISOString().slice(0, 10)] = { x: 1 };
  days["2026-10-22"] = { x: 1 }; // future day (clock skew): dropped
  days["bogus"] = { x: 1 };
  const kept = Object.keys(trimDays(days, "2026-10-21"));
  assert.equal(kept.length, 15);
  assert.equal(kept[0], "2026-10-07");
  assert.equal(kept.at(-1), "2026-10-21");
});

test("baselineDays counts complete days strictly before today, capped at 14", () => {
  assert.equal(baselineView({ "2026-10-21": { x: 5 } }, "2026-10-21").baselineDays, 0);
  assert.equal(baselineView({ "2026-10-20": { x: 5 }, "2026-10-21": { x: 5 } }, "2026-10-21").baselineDays, 1);
  const many: BaselineDays = {};
  for (let i = 1; i <= 20; i++) many[new Date(Date.UTC(2026, 9, 21 - i)).toISOString().slice(0, 10)] = { x: 1 };
  assert.equal(baselineView(many, "2026-10-21").baselineDays, 14);
  assert.deepEqual(completeDays(many, "2026-10-21").slice(0, 2), ["2026-10-20", "2026-10-19"]);
});

test("the day the baseline started (and back-filled days before it) never count as complete", () => {
  // First run on 10-21 at 00:30 with a 6h cold start back-fills part of 10-20.
  const days: BaselineDays = { "2026-10-20": { a: 40 }, "2026-10-21": { a: 100 } };
  assert.equal(baselineView(days, "2026-10-21", "2026-10-21").baselineDays, 0); // tonight
  // Two days later: 10-21 (the partial start day) is excluded, 10-22 counts.
  days["2026-10-22"] = { a: 300 };
  assert.deepEqual(completeDays(days, "2026-10-23", "2026-10-21"), ["2026-10-22"]);
});

test("b: median over the last up to 7 complete days, missing days as 0, brand new cells 0, nothing before 3 days", () => {
  const days: BaselineDays = {
    "2026-10-12": { a: 1000 }, // 9 days back: outside the last 7 complete days
    "2026-10-14": { a: 10, b: 2 },
    "2026-10-15": { a: 20 },
    "2026-10-16": { a: 30 },
    "2026-10-17": { a: 40, b: 4 },
    "2026-10-18": { a: 50 },
    "2026-10-19": { a: 60 },
    "2026-10-20": { a: 70, b: 6 },
    "2026-10-21": { a: 999, c: 50 }, // today: never part of the baseline
  };
  const v = baselineView(days, "2026-10-21");
  assert.equal(v.baselineDays, 8);
  assert.equal(v.b("a"), 40); // median of 10..70
  assert.equal(v.b("b"), 0); // [2,0,0,4,0,0,6] -> median 0
  assert.equal(v.b("c"), 0); // only seen today: brand new
  assert.equal(v.b("zzz"), 0);

  const even = baselineView({ "2026-10-18": { a: 1 }, "2026-10-19": { a: 2 }, "2026-10-20": { a: 3 }, "2026-10-17": { b: 9 } }, "2026-10-21");
  assert.equal(even.b("a"), 1.5); // [3,2,1,0] -> (1+2)/2
  const short = baselineView({ "2026-10-19": { a: 5 }, "2026-10-20": { a: 5 } }, "2026-10-21");
  assert.equal(short.b("a"), 0); // baselineDays < 3
});

test("re-merging the same URL does not double count", () => {
  const prevRecords = [rec("https://x/1", "2026-10-21T01:00:00Z")];
  let days = countNewRecords({}, prevRecords);
  // Next run: the same URL arrives again (re-crawled), plus one new article.
  const merged = mergeRecords([prevRecords, [rec("https://x/1", "2026-10-21T02:00:00Z"), rec("https://x/2", "2026-10-21T02:00:00Z")]], "2026-10-20T00:00:00Z");
  const prevUrls = new Set(prevRecords.map((r) => r.url));
  days = countNewRecords(days, merged.filter((r) => !prevUrls.has(r.url)));
  assert.deepEqual(days, { "2026-10-21": { "832aa8fffffffff": 2 } });
});

test("baseline.json.gz round-trips; a missing file starts empty, a corrupt one fails", async () => {
  const days: BaselineDays = { "2026-10-20": { a: 3 }, "2026-10-21": { b: 1 } };
  assert.deepEqual(decodeBaseline(encodeBaseline({ since: "2026-10-20", days })), { since: "2026-10-20", days });
  const dir = await mkdtemp(join(tmpdir(), "toe-baseline-"));
  try {
    assert.equal(await loadBaseline({ kind: "file", path: join(dir, "none.json.gz") }, quiet), null);
    const bad = join(dir, "bad.json.gz");
    await writeFile(bad, "not json");
    await assert.rejects(loadBaseline({ kind: "file", path: bad }, quiet), CarryLoadError);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("buildSnapshot writes baselineDays, per-cell b, and per-cell videos", () => {
  const records = [
    rec("https://p/1", "2026-10-21T01:00:00Z"),
    { ...rec("https://p/2", "2026-10-21T02:00:00Z"), video: "https://youtu.be/dQw4w9WgXcQ" },
    rec("https://q/1", "2026-10-21T01:00:00Z", "83194afffffffff"),
    rec("https://q/2", "2026-10-21T02:00:00Z", "83194afffffffff"),
  ];
  const days: BaselineDays = { "2026-10-18": { "832aa8fffffffff": 4 }, "2026-10-19": { "832aa8fffffffff": 6 }, "2026-10-20": { "832aa8fffffffff": 5 } };
  const { heat, cells } = buildSnapshot(records, { now: new Date("2026-10-21T03:00:00Z"), windowHours: 3, baseline: baselineView(days, "2026-10-21") });
  assert.equal(heat.baselineDays, 3);
  const byId = Object.fromEntries(heat.cells.map((c) => [c.id, c]));
  assert.equal(byId["832aa8fffffffff"].b, 5);
  assert.equal(byId["83194afffffffff"].b, 0); // no history: brand new
  assert.deepEqual(Object.fromEntries(cells.map((c) => [c.id, c.videos])), { "832aa8fffffffff": 1, "83194afffffffff": 0 });
  const withVideo = cells.find((c) => c.id === "832aa8fffffffff")!.articles.find((a) => a.url === "https://p/2")!;
  assert.equal(withVideo.video, "https://youtu.be/dQw4w9WgXcQ");
  // Without a baseline: zeros.
  const plain = buildSnapshot(records, { now: new Date("2026-10-21T03:00:00Z"), windowHours: 3 });
  assert.equal(plain.heat.baselineDays, 0);
  assert.ok(plain.heat.cells.every((c) => c.b === 0));
});
