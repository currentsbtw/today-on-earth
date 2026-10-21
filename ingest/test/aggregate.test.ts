import assert from "node:assert/strict";
import { test } from "node:test";
import { latLngToCell } from "h3-js";
import { buildSnapshot, selectArticles } from "../src/aggregate.ts";
import type { ArticleRecord } from "../src/types.ts";
import { coveredHours, mergeRecords, planSlots } from "../src/window.ts";

const PARIS = latLngToCell(48.8566, 2.3522, 3);
const LAGOS = latLngToCell(6.45, 3.39, 3);

let seq = 0;
function rec(p: Partial<ArticleRecord> = {}): ArticleRecord {
  seq++;
  const minute = String(seq % 60).padStart(2, "0");
  return {
    url: `https://example.org/${seq}`,
    title: `t${seq}`,
    source: "a.com",
    country: "FR",
    lang: "fr",
    time: `2026-10-20T10:${minute}:00Z`,
    tone: 0,
    image: "",
    lat: 48.8566,
    lon: 2.3522,
    cellId: PARIS,
    locationName: "Paris, France",
    persons: [],
    orgs: [],
    themes: [],
    ...p,
  };
}

const at = (h: number, m: number) => `2026-10-20T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;

test("fewer than 10 outlets: newest 50, no per-outlet cap", () => {
  const records: ArticleRecord[] = [];
  for (let i = 0; i < 60; i++) records.push(rec({ source: i < 55 ? "big.com" : `o${i}.com`, time: at(Math.floor(i / 60) + 1, i % 60) }));
  const picked = selectArticles(records);
  assert.equal(picked.length, 50);
  assert.ok(picked.filter((r) => r.source === "big.com").length > 5);
  for (let i = 1; i < picked.length; i++) assert.ok(picked[i - 1].time >= picked[i].time, "newest first");
  assert.equal(picked[0].time, at(1, 59));
});

test("10 or more outlets: no outlet contributes more than 5", () => {
  const records: ArticleRecord[] = [];
  // big.com publishes 40 newest articles; 12 other outlets publish 4 older ones each.
  for (let i = 0; i < 40; i++) records.push(rec({ source: "big.com", time: at(12, i) }));
  for (let o = 0; o < 12; o++) for (let k = 0; k < 4; k++) records.push(rec({ source: `o${o}.com`, time: at(9, o * 4 + k) }));
  const picked = selectArticles(records);
  assert.equal(picked.length, 50);
  const counts = new Map<string, number>();
  for (const r of picked) counts.set(r.source, (counts.get(r.source) ?? 0) + 1);
  assert.equal(counts.get("big.com"), 5);
  for (const n of counts.values()) assert.ok(n <= 5);
  // big.com's five are its newest five
  assert.deepEqual(picked.slice(0, 5).map((r) => r.time), [at(12, 39), at(12, 38), at(12, 37), at(12, 36), at(12, 35)]);
  for (let i = 1; i < picked.length; i++) assert.ok(picked[i - 1].time >= picked[i].time, "newest first");
});

test("outlet cap ignores empty source names, like o does", () => {
  // 9 named outlets plus articles with an empty source: o = 9, so no cap applies.
  const records: ArticleRecord[] = [];
  for (let i = 0; i < 20; i++) records.push(rec({ source: "big.com", time: at(12, i) }));
  for (let o = 0; o < 8; o++) records.push(rec({ source: "o" + o + ".com", time: at(9, o) }));
  for (let k = 0; k < 3; k++) records.push(rec({ source: "", time: at(8, k) }));
  const picked = selectArticles(records);
  assert.equal(picked.filter((r) => r.source === "big.com").length, 20);
  const { cells } = buildSnapshot(records, { now: new Date("2026-10-20T13:00:00Z"), windowHours: 24 });
  assert.equal(cells[0].o, 9);
});

test("selectArticles de-duplicates by URL", () => {
  const a = rec({ url: "https://dup", time: at(5, 0) });
  const b = rec({ url: "https://dup", time: at(4, 0) });
  assert.equal(selectArticles([a, b, rec()]).length, 2);
});

test("buildSnapshot: cell stats, sorting, drop n<2, totals", () => {
  const records = [
    rec({ source: "lemonde.fr", country: "FR", lang: "fr", tone: -2, locationName: "Paris, France" }),
    rec({ source: "lemonde.fr", country: "FR", lang: "fr", tone: -3, locationName: "Paris, France" }),
    rec({ source: "bbc.co.uk", country: "GB", lang: "en", tone: 1, locationName: "Ile-de-France, France" }),
    rec({ source: "mystery.net", country: "", lang: "en", tone: 0, locationName: "Paris, France" }),
    rec({ cellId: LAGOS, source: "punchng.com", country: "NG", lang: "en", tone: -1, locationName: "Lagos, Nigeria" }),
    rec({ cellId: LAGOS, source: "punchng.com", country: "NG", lang: "en", tone: -2, locationName: "Lagos, Nigeria" }),
    rec({ cellId: latLngToCell(-33.9, 151.2, 3), source: "smh.com.au", country: "AU", locationName: "Sydney" }),
  ];
  const { heat, cells } = buildSnapshot(records, { now: new Date("2026-10-20T19:30:00.123Z"), windowHours: 24 });
  assert.equal(heat.generatedAt, "2026-10-20T19:30:00Z");
  assert.equal(heat.windowHours, 24);
  assert.deepEqual(heat.totals, { articles: 7, outlets: 5, countries: 4, cells: 2, unplaced: 0 });
  assert.deepEqual(heat.cells.map((c) => c.id), [PARIS, LAGOS]); // n desc; Sydney (n=1) dropped
  const paris = heat.cells[0];
  assert.equal(paris.n, 4);
  assert.equal(paris.o, 3);
  assert.equal(paris.c, 2); // "" is not a country
  assert.equal(paris.l, 2);
  assert.equal(paris.t, -1); // mean(-2,-3,1,0)
  assert.equal(paris.name, "Paris, France");
  assert.equal(cells.length, 2);
  const pc = cells[0];
  assert.equal(pc.id, PARIS);
  assert.deepEqual(pc.topOutlets, [["lemonde.fr", 2], ["bbc.co.uk", 1], ["mystery.net", 1]]);
  assert.deepEqual(pc.topCountries, [["FR", 2], ["", 1], ["GB", 1]]);
  assert.deepEqual(pc.languages, [["en", 2], ["fr", 2]]);
  assert.equal(pc.articles.length, 4);
});

test("mergeRecords keeps the earliest sighting and drops records outside the window", () => {
  const merged = mergeRecords(
    [
      [rec({ url: "u1", time: at(10, 0), title: "first" }), rec({ url: "old", time: at(1, 0) })],
      [rec({ url: "u1", time: at(11, 0), title: "later" }), rec({ url: "u2", time: at(12, 0) })],
    ],
    at(2, 0),
  );
  assert.deepEqual(merged.map((r) => r.url), ["u2", "u1"]);
  assert.equal(merged[1].title, "first");
});

test("planSlots: cold start fetches the last N hours of intervals plus the next slot", () => {
  const now = Date.UTC(2026, 9, 20, 19, 37);
  const cold = planSlots({ nowMs: now, windowHours: 24, coldStartHours: 1, retryHours: 3, progress: null });
  // 18:45..19:30 cover 18:30-19:30; 19:45 is the next file, sometimes published early.
  assert.deepEqual(cold.slots, ["20261020184500", "20261020190000", "20261020191500", "20261020193000", "20261020194500"]);
  assert.equal(cold.from, "20261020184500");
});

test("coveredHours: span the data covers, capped at the window, at least 1", () => {
  const now = Date.UTC(2026, 9, 20, 19, 37);
  const cold6 = planSlots({ nowMs: now, windowHours: 24, coldStartHours: 6, retryHours: 3, progress: null });
  assert.equal(coveredHours(now, [cold6.from, cold6.from], 24), 6);
  // Two hours later the same state covers 8h.
  assert.equal(coveredHours(now + 2 * 3_600_000, [cold6.from], 24), 8);
  // The earliest feed wins.
  assert.equal(coveredHours(now, [cold6.from, "20261020180000"], 24), 6);
  // A full window says 24, never more.
  const full = planSlots({ nowMs: now, windowHours: 24, coldStartHours: 6, retryHours: 3, progress: { from: "20261001000000", done: [] } });
  assert.equal(coveredHours(now, [full.from], 24), 24);
  // Minimum 1, and no feeds falls back to the configured window.
  assert.equal(coveredHours(now, ["20261020193000"], 24), 1);
  assert.equal(coveredHours(now, [], 24), 24);
});

test("planSlots: warm start fetches new slots and retries recent gaps, never before `from`", () => {
  const now = Date.UTC(2026, 9, 20, 19, 37);
  const progress = {
    from: "20261020170000",
    done: ["20261020170000", "20261020171500", "20261020173000", "20261020174500", "20261020180000", "20261020181500", "20261020183000", "20261020190000"],
  };
  const warm = planSlots({ nowMs: now, windowHours: 24, coldStartHours: 1, retryHours: 3, progress });
  // 18:45 was not published last time and is retried; 19:15..19:45 are new. Nothing before
  // 17:00 even though the 3h retry window reaches back to 16:45.
  assert.deepEqual(warm.slots, ["20261020184500", "20261020191500", "20261020193000", "20261020194500"]);
  assert.equal(warm.from, "20261020170000");

  // A gap older than the retry window and older than the newest done slot is given up.
  const later = planSlots({ nowMs: Date.UTC(2026, 9, 20, 23, 7), windowHours: 24, coldStartHours: 1, retryHours: 3, progress: { from: progress.from, done: [...progress.done, "20261020230000"] } });
  assert.ok(!later.slots.includes("20261020184500"));
  assert.equal(later.slots[0], "20261020201500"); // retry window start: end slot 23:15 minus 3h

  // `from` slides forward with the window.
  const dayLater = planSlots({ nowMs: Date.UTC(2026, 9, 21, 19, 37), windowHours: 24, coldStartHours: 1, retryHours: 3, progress });
  assert.equal(dayLater.from, "20261020194500");
});
