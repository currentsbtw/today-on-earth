import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { buildSnapshot } from "../src/aggregate.ts";
import {
  ARTICLES_NORMAL_MIN_DAYS,
  advanceBaseline,
  articlesNormal,
  baselineView,
  completeDays,
  countNewRecords,
  countNewSlots,
  decodeBaseline,
  encodeBaseline,
  loadBaseline,
  recordDayTotal,
  trimDays,
  type Baseline,
  type BaselineDays,
  type BaselineSlots,
} from "../src/baseline.ts";
import { CarryLoadError } from "../src/carry.ts";
import { arrivedUnits } from "../src/history.ts";
import { createKeyer } from "../src/reprints.ts";
import type { ArticleRecord } from "../src/types.ts";
import { mergeRecords } from "../src/window.ts";

const FEEDS = ["english", "translingual"];
const rec = (url: string, time: string, cellId = "832aa8fffffffff"): ArticleRecord => ({
  url, title: "", source: "a.com", country: "", lang: "en", time, tone: 0, image: "", lat: 0, lon: 0,
  cellId, locationName: "", persons: [], orgs: [], themes: [], video: "", locationCountry: "", kinds: "",
});
const quiet = () => {};
const day = (offset: number) => new Date(Date.UTC(2026, 9, 21 + offset)).toISOString().slice(0, 10);
/** Full slot coverage (96 files per feed) for each given day. */
const fullSlots = (days: string[]): BaselineSlots => Object.fromEntries(days.map((d) => [d, { english: 96, translingual: 96 }]));
const baseline = (days: BaselineDays, since = ""): Baseline => ({ since, days, slots: fullSlots(Object.keys(days)), totals: {} });

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

test("arrived units: an outlet's later copy of a headline adds nothing to b, another outlet's copy does", () => {
  const titled = (url: string, time: string, source: string, title: string) => ({ ...rec(url, time), source, title });
  const previous = [titled("https://a/1", "2026-10-21T01:00:00Z", "a.com", "Storm hits coast, thousands without power")];
  let days = countNewRecords({}, arrivedUnits(previous, new Set(), createKeyer(previous)));
  const window = [
    ...previous,
    titled("https://a/2", "2026-10-21T02:00:00Z", "a.com", "Storm hits coast, thousands without power"),
    titled("https://b/1", "2026-10-21T02:00:00Z", "b.com", "Storm hits coast, thousands without power"),
    titled("https://b/2", "2026-10-22T00:10:00Z", "b.com", "Ferry service resumes after the storm"),
  ];
  days = countNewRecords(days, arrivedUnits(window, new Set(previous.map((r) => r.url)), createKeyer(window)));
  assert.deepEqual(days, { "2026-10-21": { "832aa8fffffffff": 2 }, "2026-10-22": { "832aa8fffffffff": 1 } });
});

test("advanceBaseline: a state that did not load discards the carried baseline", () => {
  const prev: Baseline = { since: "2026-10-15", days: { "2026-10-20": { a: 500 } }, slots: fullSlots(["2026-10-20"]), totals: { "2026-10-20": 9000 } };
  const cold = [rec("https://x/1", "2026-10-20T22:00:00Z", "a"), rec("https://x/2", "2026-10-21T01:00:00Z", "a")];
  const messages: string[] = [];
  const fresh = advanceBaseline({ prev, stateLoaded: false, firstMerged: cold, mergedStamps: { english: ["20261021001500"] }, today: "2026-10-21", log: (m) => messages.push(m) });
  assert.deepEqual(fresh, {
    since: "2026-10-21",
    days: { "2026-10-20": { a: 1 }, "2026-10-21": { a: 1 } }, // not 501: no double count
    slots: { "2026-10-21": { english: 1 } },
    totals: {}, // discarded with the rest
  });
  assert.match(messages[0], /discarded/);
  // With the state loaded, the carried baseline is extended (and not mutated in place).
  const warm = advanceBaseline({ prev, stateLoaded: true, firstMerged: cold.slice(1), mergedStamps: {}, today: "2026-10-21" });
  assert.deepEqual(warm.days, { "2026-10-20": { a: 500 }, "2026-10-21": { a: 1 } });
  assert.equal(warm.since, "2026-10-15");
  assert.deepEqual(warm.totals, { "2026-10-20": 9000 });
  assert.deepEqual(prev.days, { "2026-10-20": { a: 500 } });
});

test("baseline.json.gz round-trips, v1 files load without slots; missing starts empty, corrupt fails", async () => {
  const b: Baseline = { since: "2026-10-20", days: { "2026-10-20": { a: 3 }, "2026-10-21": { b: 1 } }, slots: fullSlots(["2026-10-20"]), totals: { "2026-10-20": 180000 } };
  assert.deepEqual(decodeBaseline(encodeBaseline(b)), b);
  const v1 = decodeBaseline(gzipSync(JSON.stringify({ v: 1, since: "2026-10-21", days: { "2026-10-21": { a: 2 } } })));
  assert.deepEqual(v1, { since: "2026-10-21", days: { "2026-10-21": { a: 2 } }, slots: {}, totals: {} });
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

/** Every 15-minute file stamp of a UTC day, as the ingest merges them. */
const dayStamps = (d: string) => Array.from({ length: 96 }, (_, k) => `${d.replaceAll("-", "")}${String(Math.floor(k / 4)).padStart(2, "0")}${String((k % 4) * 15).padStart(2, "0")}00`);

test("articlesNormal: one total per complete day, the day's last snapshot; null until 7 days; at most 14, a 15th drops the oldest", () => {
  // Daily runs from day(0) (the partial first day). Each day has a morning run (total 5) and a
  // last run (total 100 * day index), with every file merged, so every day after day(0) is complete.
  let prev: Baseline | null = null;
  const views: Record<number, ReturnType<typeof baselineView>> = {};
  for (let i = 0; i <= 16; i++) {
    for (const total of [5, 100 * (i + 1)]) {
      const today = day(i);
      const next = advanceBaseline({ prev, stateLoaded: true, firstMerged: [rec(`https://x/${i}-${total}`, `${today}T06:00:00Z`)], mergedStamps: { english: dayStamps(today), translingual: dayStamps(today) }, today });
      views[i] = baselineView(next, today, FEEDS);
      recordDayTotal(next, today, total);
      prev = decodeBaseline(encodeBaseline(next)); // carried between runs
    }
  }
  // Day 7: 6 complete days (day 1..6) have a total: still null, 0 days; the run log sees 6.
  assert.deepEqual([views[7].articlesNormal, views[7].articlesNormalDays, views[7].totalDays], [null, 0, 6]);
  // Day 8: day 1..7 recorded with their last runs' totals 200..800 (never the morning 5): median 500.
  assert.deepEqual([views[8].articlesNormal, views[8].articlesNormalDays], [500, ARTICLES_NORMAL_MIN_DAYS]);
  // Day 15: 14 complete days, day 1..14 (200..1500): median (800 + 900) / 2 = 850.
  assert.deepEqual([views[15].articlesNormal, views[15].articlesNormalDays], [850, 14]);
  // Day 16: a 15th complete day; day 1 is dropped, day 2..15 (300..1600): median 950.
  assert.deepEqual([views[16].articlesNormal, views[16].articlesNormalDays], [950, 14]);
  assert.equal(Object.hasOwn(prev!.totals, day(1)), false); // trimmed with the 14-day window
  assert.equal(prev!.totals[day(16)], 1700); // today: the last run so far
});

test("articlesNormal: even counts round the median to a whole number; days without a total or not complete do not count", () => {
  const days = Array.from({ length: 8 }, (_, k) => day(-1 - k)); // 8 days, newest first
  const totals = Object.fromEntries(days.map((d, k) => [d, 1000 + k])); // 1000..1007
  assert.deepEqual(articlesNormal({ totals }, days), { articlesNormal: 1004, articlesNormalDays: 8, totalDays: 8 }); // 1003.5
  // A complete day without a total (e.g. before 2026-10-27) is skipped, not counted as 0.
  const { [days[0]]: _dropped, ...fewer } = totals;
  assert.deepEqual(articlesNormal({ totals: fewer }, days), { articlesNormal: 1004, articlesNormalDays: 7, totalDays: 7 });
  // A total on a day that is not complete (here: today, or a partial day) never counts.
  const b: Baseline = { ...baseline(Object.fromEntries(days.slice(0, 6).map((d) => [d, { a: 1 }]))), totals: { ...totals, [day(0)]: 99 } };
  assert.deepEqual([baselineView(b, day(0), FEEDS).articlesNormal, baselineView(b, day(0), FEEDS).totalDays], [null, 6]);
  // recordDayTotal ignores what is not a positive whole count.
  assert.deepEqual(recordDayTotal({ ...baseline({}), totals: {} }, day(0), 0).totals, {});
});

test("articlesNormal: a baseline written before day totals existed loads with none, so the count starts at zero days", () => {
  // A version 2 file as written before 2026-10-27: 10 complete days, no `totals` key.
  const days = Object.fromEntries(Array.from({ length: 10 }, (_, k) => [day(-1 - k), { a: 5 }]));
  const old = decodeBaseline(gzipSync(JSON.stringify({ v: 2, since: day(-12), days, slots: fullSlots(Object.keys(days)) })));
  assert.deepEqual(old.totals, {});
  const v = baselineView(old, day(0), FEEDS);
  assert.equal(v.baselineDays, 10);
  assert.deepEqual([v.articlesNormal, v.articlesNormalDays, v.totalDays], [null, 0, 0]);
  // The next run records today's total; it counts once the day is complete.
  const next = recordDayTotal(advanceBaseline({ prev: old, stateLoaded: true, firstMerged: [], mergedStamps: {}, today: day(0) }), day(0), 4321);
  assert.deepEqual(next.totals, { [day(0)]: 4321 });
});

test("buildSnapshot writes articlesNormal and articlesNormalDays from the baseline; null and 0 without one", () => {
  const records = [rec("https://p/1", "2026-10-21T01:00:00Z"), rec("https://p/2", "2026-10-21T02:00:00Z")];
  const days = Array.from({ length: 7 }, (_, k) => day(-1 - k));
  const b: Baseline = { ...baseline(Object.fromEntries(days.map((d) => [d, { a: 1 }]))), totals: Object.fromEntries(days.map((d, k) => [d, 100 * (k + 1)])) };
  const { heat } = buildSnapshot(records, { now: new Date("2026-10-21T03:00:00Z"), windowHours: 3, baseline: baselineView(b, day(0), FEEDS) });
  assert.equal(heat.articlesNormal, 400);
  assert.equal(heat.articlesNormalDays, 7);
  const plain = buildSnapshot(records, { now: new Date("2026-10-21T03:00:00Z"), windowHours: 3 });
  assert.equal(plain.heat.articlesNormal, null);
  assert.equal(plain.heat.articlesNormalDays, 0);
  // Additive: the two keys sit after totals in heat.json.
  assert.deepEqual(Object.keys(plain.heat), ["generatedAt", "windowHours", "newestArticleAt", "baselineDays", "totals", "articlesNormal", "articlesNormalDays", "topOutletCountries", "cells"]);
});
