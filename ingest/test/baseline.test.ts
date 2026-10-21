import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { buildSnapshot } from "../src/aggregate.ts";
import {
  advanceBaseline,
  baselineView,
  completeDays,
  countNewRecords,
  countNewSlots,
  decodeBaseline,
  encodeBaseline,
  loadBaseline,
  trimDays,
  type Baseline,
  type BaselineDays,
  type BaselineSlots,
} from "../src/baseline.ts";
import { CarryLoadError } from "../src/carry.ts";
import type { ArticleRecord } from "../src/types.ts";
import { mergeRecords } from "../src/window.ts";

const FEEDS = ["english", "translingual"];
const rec = (url: string, time: string, cellId = "832aa8fffffffff"): ArticleRecord => ({
  url, title: "", source: "a.com", country: "", lang: "en", time, tone: 0, image: "", lat: 0, lon: 0,
  cellId, locationName: "", persons: [], orgs: [], themes: [], video: "",
});
const quiet = () => {};
const day = (offset: number) => new Date(Date.UTC(2026, 9, 21 + offset)).toISOString().slice(0, 10);
/** Full slot coverage (96 files per feed) for each given day. */
const fullSlots = (days: string[]): BaselineSlots => Object.fromEntries(days.map((d) => [d, { english: 96, translingual: 96 }]));
const baseline = (days: BaselineDays, since = ""): Baseline => ({ since, days, slots: fullSlots(Object.keys(days)) });

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
  for (let i = 0; i <= 20; i++) days[day(-i)] = { x: 1 };
  days["2026-10-22"] = { x: 1 }; // future day (clock skew): dropped
  days["bogus"] = { x: 1 };
  const kept = Object.keys(trimDays(days, "2026-10-21"));
  assert.equal(kept.length, 15);
  assert.equal(kept[0], "2026-10-07");
  assert.equal(kept.at(-1), "2026-10-21");
});

test("baselineDays counts complete days strictly before today, capped at 14", () => {
  assert.equal(baselineView(baseline({ [day(0)]: { x: 5 } }), day(0), FEEDS).baselineDays, 0);
  assert.equal(baselineView(baseline({ [day(-1)]: { x: 5 }, [day(0)]: { x: 5 } }), day(0), FEEDS).baselineDays, 1);
  const many: BaselineDays = {};
  for (let i = 1; i <= 20; i++) many[day(-i)] = { x: 1 };
  assert.equal(baselineView(baseline(many), day(0), FEEDS).baselineDays, 14);
  assert.deepEqual(completeDays(baseline(many), day(0), FEEDS).slice(0, 2), [day(-1), day(-2)]);
});

test("the day the baseline started (and back-filled days before it) never count as complete", () => {
  const b = baseline({ "2026-10-20": { a: 40 }, "2026-10-21": { a: 100 } }, "2026-10-21");
  assert.equal(baselineView(b, "2026-10-21", FEEDS).baselineDays, 0); // tonight
  b.days["2026-10-22"] = { a: 300 };
  b.slots = fullSlots(Object.keys(b.days));
  assert.deepEqual(completeDays(b, "2026-10-23", FEEDS), ["2026-10-22"]);
});

test("a day missing more than 10% of a feed's 96 files is not complete", () => {
  const b = baseline({ [day(-3)]: { a: 1 }, [day(-2)]: { a: 1 }, [day(-1)]: { a: 1 } });
  b.slots[day(-2)] = { english: 96, translingual: 76 }; // 20 slots missing
  b.slots[day(-1)] = { english: 87, translingual: 96 }; // 9 missing: still >= 90%
  assert.deepEqual(completeDays(b, day(0), FEEDS), [day(-1), day(-3)]);
  delete b.slots[day(-3)]; // no coverage recorded at all (e.g. a v1 file)
  assert.deepEqual(completeDays(b, day(0), FEEDS), [day(-1)]);
});

test("merged file stamps are counted per day and feed", () => {
  const slots = countNewSlots({}, {
    english: ["20261020234500", "20261021000000", "20261021001500", "20261021001500"],
    translingual: ["20261021000000"],
  });
  assert.deepEqual(slots, { "2026-10-20": { english: 1 }, "2026-10-21": { english: 2, translingual: 1 } });
});

test("b: median over the last up to 7 complete days, missing days as 0, brand new cells 0, nothing before 3 days", () => {
  const b = baseline({
    "2026-10-12": { a: 1000 }, // 9 days back: outside the last 7 complete days
    "2026-10-14": { a: 10, b: 2 },
    "2026-10-15": { a: 20 },
    "2026-10-16": { a: 30 },
    "2026-10-17": { a: 40, b: 4 },
    "2026-10-18": { a: 50 },
    "2026-10-19": { a: 60 },
    "2026-10-20": { a: 70, b: 6 },
    "2026-10-21": { a: 999, c: 50 }, // today: never part of the baseline
  });
  const v = baselineView(b, "2026-10-21", FEEDS);
  assert.equal(v.baselineDays, 8);
  assert.equal(v.b("a"), 40); // median of 10..70
  assert.equal(v.b("b"), 0); // [2,0,0,4,0,0,6] -> median 0
  assert.equal(v.b("c"), 0); // only seen today: brand new
  assert.equal(v.b("zzz"), 0);

  const even = baselineView(baseline({ "2026-10-18": { a: 1 }, "2026-10-19": { a: 2 }, "2026-10-20": { a: 3 }, "2026-10-17": { b: 9 } }), "2026-10-21", FEEDS);
  assert.equal(even.b("a"), 1.5); // [3,2,1,0] -> (1+2)/2
  const short = baselineView(baseline({ "2026-10-19": { a: 5 }, "2026-10-20": { a: 5 } }), "2026-10-21", FEEDS);
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

test("advanceBaseline: a state that did not load discards the carried baseline", () => {
  const prev: Baseline = { since: "2026-10-15", days: { "2026-10-20": { a: 500 } }, slots: fullSlots(["2026-10-20"]) };
  const cold = [rec("https://x/1", "2026-10-20T22:00:00Z", "a"), rec("https://x/2", "2026-10-21T01:00:00Z", "a")];
  const messages: string[] = [];
  const fresh = advanceBaseline({ prev, stateLoaded: false, firstMerged: cold, mergedStamps: { english: ["20261021001500"] }, today: "2026-10-21", log: (m) => messages.push(m) });
  assert.deepEqual(fresh, {
    since: "2026-10-21",
    days: { "2026-10-20": { a: 1 }, "2026-10-21": { a: 1 } }, // not 501: no double count
    slots: { "2026-10-21": { english: 1 } },
  });
  assert.match(messages[0], /discarded/);
  // With the state loaded, the carried baseline is extended (and not mutated in place).
  const warm = advanceBaseline({ prev, stateLoaded: true, firstMerged: cold.slice(1), mergedStamps: {}, today: "2026-10-21" });
  assert.deepEqual(warm.days, { "2026-10-20": { a: 500 }, "2026-10-21": { a: 1 } });
  assert.equal(warm.since, "2026-10-15");
  assert.deepEqual(prev.days, { "2026-10-20": { a: 500 } });
});

test("baseline.json.gz round-trips, v1 files load without slots; missing starts empty, corrupt fails", async () => {
  const b: Baseline = { since: "2026-10-20", days: { "2026-10-20": { a: 3 }, "2026-10-21": { b: 1 } }, slots: fullSlots(["2026-10-20"]) };
  assert.deepEqual(decodeBaseline(encodeBaseline(b)), b);
  const v1 = decodeBaseline(gzipSync(JSON.stringify({ v: 1, since: "2026-10-21", days: { "2026-10-21": { a: 2 } } })));
  assert.deepEqual(v1, { since: "2026-10-21", days: { "2026-10-21": { a: 2 } }, slots: {} });
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
  const b = baseline({ "2026-10-18": { "832aa8fffffffff": 4 }, "2026-10-19": { "832aa8fffffffff": 6 }, "2026-10-20": { "832aa8fffffffff": 5 } });
  const { heat, cells } = buildSnapshot(records, { now: new Date("2026-10-21T03:00:00Z"), windowHours: 3, baseline: baselineView(b, "2026-10-21", FEEDS) });
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
