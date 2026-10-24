import assert from "node:assert/strict";
import { test } from "node:test";
import { latLngToCell } from "h3-js";
import { buildSnapshot, selectArticles } from "../src/aggregate.ts";
import { createKeyer, learnTails, reprintKey } from "../src/reprints.ts";
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
    video: "",
    locationCountry: "",
    kinds: "",
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
  assert.deepEqual(heat.totals, { articles: 7, outlets: 5, countries: 4, cells: 2, unplaced: 0, reprints: 0 });
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
  assert.deepEqual(pc.topCountries, [["FR", 2], ["GB", 1]]); // "" is not a country: c entries
  assert.deepEqual(heat.topOutletCountries, [["FR", 2], ["NG", 2], ["AU", 1], ["GB", 1]]);
  assert.deepEqual(pc.languages, [["en", 2], ["fr", 2]]);
  assert.equal(pc.articles.length, 4);
});

test("reprint key: case, Unicode form, punctuation and a trailing outlet suffix are ignored", () => {
  const k = reprintKey("Storm hits coast, thousands without power - Reuters");
  assert.equal(k, "storm hits coast thousands without power");
  assert.equal(reprintKey("STORM hits coast: thousands without power | The Daily Star", "thedailystar.net"), k);
  assert.equal(reprintKey("Storm hits coast — thousands without power – AP News", "apnews.com"), k); // em dash is punctuation, en dash suffix goes
  assert.equal(reprintKey("Ｓｔｏｒｍ hits coast, thousands without power"), k); // NFKC folds full-width letters
  // Only the last suffix goes, and only when at least 20 characters remain.
  assert.equal(reprintKey("Live - Storm hits coast - Reuters"), "live storm hits coast");
  assert.equal(reprintKey("Short title - Reuters"), "short title reuters");
  assert.equal(reprintKey("Storm hits coast-wide areas today"), "storm hits coastwide areas today"); // no spaces: not a suffix
  assert.equal(reprintKey(""), "");
  assert.equal(reprintKey("!!! ..."), "");
});

test("reprint key: an em-dash outlet suffix is removed like the other separators", () => {
  assert.equal(
    reprintKey("Storm hits coast, thousands without power — Reuters"),
    reprintKey("Storm hits coast, thousands without power — The Daily Star", "thedailystar.net"),
  );
  assert.equal(reprintKey("Storm hits coast, thousands without power — Reuters", "reuters.com"), "storm hits coast thousands without power");
});

test("reprint key: a suffix goes only when it names the source outlet or is at most 2 words", () => {
  // A parenthetical dash clause from an unrelated source is not an outlet name: kept whole.
  assert.equal(
    reprintKey("Group assisting long-planned review of firearms — including SKS — has yet to meet", "cbc.ca"),
    "group assisting longplanned review of firearms including sks has yet to meet",
  );
  const head = "title here long enough";
  assert.equal(reprintKey("Title here long enough — The Globe and Mail", "theglobeandmail.com"), head); // label match
  assert.equal(reprintKey("Title here long enough — The Globe and Mail", "somesite.com"), head + " the globe and mail");
  assert.equal(reprintKey("Title here long enough — Reuters", "somesite.com"), head); // 2-word rule
  assert.equal(reprintKey("Title here long enough | NDTV Profit", "ndtv.com"), head); // label in tail (also only 2 words)
  assert.equal(reprintKey("Title here long enough – BBC News Online", "bbc.co.uk"), head); // label under co.uk
  assert.equal(reprintKey("Title here long enough - El País English Edition", "elpais.com"), head); // diacritics folded
});

test("reprints: u counts distinct headlines, the list keeps the newest copy, untitled never match", () => {
  const wire = "Storm hits coast, thousands without power";
  const records = [
    rec({ url: "https://a/1", source: "a.com", title: wire + " - A", time: at(10, 0) }),
    rec({ url: "https://b/1", source: "b.com", title: wire + " | B News", time: at(11, 0) }),
    rec({ url: "https://c/1", source: "c.com", title: wire.toUpperCase(), time: at(9, 0) }),
    rec({ url: "https://d/1", source: "d.com", title: "Council approves budget", time: at(8, 0) }),
    rec({ url: "https://e/1", source: "e.com", title: "", time: at(7, 0) }),
    rec({ url: "https://e/2", source: "e.com", title: "", time: at(6, 0) }),
  ];
  const { heat, cells } = buildSnapshot(records, { now: new Date("2026-10-20T13:00:00Z"), windowHours: 24 });
  const [cell] = heat.cells;
  assert.equal(cell.n, 6); // every copy is from another outlet, so each counts
  assert.equal(cell.u, 4); // the wire story, the budget story, two untitled
  assert.equal(heat.totals.reprints, 2);
  assert.deepEqual(Object.keys(cell).slice(0, 5), ["id", "lat", "lon", "n", "u"]);
  const file = cells[0];
  assert.equal(file.u, 4);
  assert.deepEqual(file.articles.map((a) => [a.url, a.reprints]), [
    ["https://b/1", 2], // newest copy of the wire story, carrying the other two
    ["https://d/1", 0],
    ["https://e/1", 0],
    ["https://e/2", 0],
  ]);
});

test("reprints: a copy from an outlet already at its cap gives way to the next newest copy", () => {
  const records: ArticleRecord[] = [];
  // big.com fills its 5 with the newest articles; 11 other outlets keep the cap on.
  for (let i = 0; i < 6; i++) records.push(rec({ source: "big.com", title: `Big story number ${i} for today`, time: at(12, 50 + i) }));
  records.push(rec({ source: "big.com", title: "Shared wire headline about the floods", time: at(12, 40) }));
  records.push(rec({ source: "o0.com", title: "Shared wire headline about the floods - O0", time: at(12, 30) }));
  for (let o = 1; o <= 10; o++) records.push(rec({ source: `o${o}.com`, time: at(11, o) }));
  const picked = selectArticles(records);
  const copies = picked.filter((r) => r.title.startsWith("Shared wire"));
  assert.deepEqual(copies.map((r) => r.source), ["o0.com"]);
});

test("reprints: the older copy that replaces a capped outlet's copy appears once and keeps its count", () => {
  const records: ArticleRecord[] = [];
  // big.com's 5 newest articles fill its cap; its newest copy of the shared headline comes after.
  for (let i = 0; i < 5; i++) records.push(rec({ url: `https://big/${i}`, source: "big.com", title: `Big story number ${i} for today`, time: at(12, 50 + i) }));
  records.push(rec({ url: "https://big/wire", source: "big.com", title: "Shared wire headline about the floods - Big", time: at(12, 40) }));
  records.push(rec({ url: "https://o0/wire", source: "o0.com", title: "Shared wire headline about the floods | O0", time: at(12, 30) }));
  records.push(rec({ url: "https://o1/wire", source: "o1.com", title: "Shared wire headline about the floods", time: at(12, 20) }));
  for (let o = 2; o <= 10; o++) records.push(rec({ url: `https://o${o}/x`, source: `o${o}.com`, time: at(11, o) }));
  const { cells } = buildSnapshot(records, { now: new Date("2026-10-20T13:00:00Z"), windowHours: 24 });
  const copies = cells[0].articles.filter((a) => a.url.endsWith("/wire"));
  assert.deepEqual(copies.map((a) => [a.url, a.reprints]), [["https://o0/wire", 2]]);
  assert.equal(cells[0].articles.filter((a) => a.url.startsWith("https://big/")).length, 5);
});

test("international attention: home is the most common location country; i excludes it", () => {
  const where = { locationCountry: "FR" };
  const records = [
    rec({ ...where, country: "FR", source: "lemonde.fr" }),
    rec({ ...where, country: "FR", source: "lefigaro.fr" }),
    rec({ ...where, country: "GB", source: "bbc.co.uk" }),
    rec({ ...where, country: "US", source: "nytimes.com" }),
    rec({ locationCountry: "BE", country: "US", source: "wsj.com" }), // a stray location, outvoted
    rec({ ...where, country: "", source: "mystery.net" }),
  ];
  const now = new Date("2026-10-20T13:00:00Z");
  const { heat, cells } = buildSnapshot(records, { now, windowHours: 24 });
  assert.equal(heat.cells[0].c, 3);
  assert.equal(heat.cells[0].i, 2); // GB, US
  assert.equal(cells[0].home, "FR");
  assert.equal(cells[0].i, 2);
  // Records from an older state carry no location country: home is "" and i falls back to c.
  const old = buildSnapshot(records.map((r) => ({ ...r, locationCountry: "" })), { now, windowHours: 24 });
  assert.equal(old.cells[0].home, "");
  assert.equal(old.cells[0].i, 3);
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

test("learned tails: 3 distinct heads flag an outlet's tail, 2 do not, another outlet's tail does not apply", () => {
  const station = (head: string, source = "iheart.com") => rec({ source, title: `${head} | Sunny 102.3 FM` });
  const three = [station("Amy Winehouse tribute ends with one song"), station("Storm closes every school in the county"), station("Council approves the new stadium budget")];
  assert.deepEqual([...learnTails(three)], [["iheart.com", new Set(["sunny 1023 fm"])]]);
  const keyer = createKeyer(three);
  assert.equal(keyer.keyOf(three[0]), "amy winehouse tribute ends with one song");
  // The same head twice is one head: two distinct heads are not enough.
  const two = [station("Amy Winehouse tribute ends with one song"), station("Amy Winehouse tribute ends with one song"), station("Storm closes every school in the county")];
  assert.equal(learnTails(two).size, 0);
  assert.equal(createKeyer(two).keyOf(two[0]), "amy winehouse tribute ends with one song sunny 1023 fm");
  // Another outlet using the same tail once keeps it (a real headline half for that outlet).
  const other = station("Amy Winehouse tribute ends with one song", "other.com");
  const mixed = createKeyer([...three, other]);
  assert.equal(mixed.keyOf(other), "amy winehouse tribute ends with one song sunny 1023 fm");
  assert.equal(reprintKey(other.title, "other.com", new Set(["sunny 1023 fm"])), "amy winehouse tribute ends with one song");
});

test("learned tails: a network's hosts learn and strip together; their copies are one article", () => {
  const records = [
    rec({ source: "wkip.iheart.com", title: "Amy Winehouse tribute ends with one song | Sunny 102.3 FM" }),
    rec({ source: "kfi.iheart.com", title: "Storm closes every school in the county | Sunny 102.3 FM" }),
    rec({ source: "iheart.com", title: "Council approves the new stadium budget | Sunny 102.3 FM" }),
    rec({ source: "wkip.iheart.com", title: "Amy Winehouse tribute ends with one song" }),
    rec({ source: "local.com", title: "Local paper reports on the stadium budget" }),
  ];
  assert.deepEqual([...learnTails(records)], [["iheart.com", new Set(["sunny 1023 fm"])]]);
  const { heat, cells } = buildSnapshot(records, { now: new Date("2026-10-20T13:00:00Z"), windowHours: 24 });
  assert.equal(heat.cells[0].n, 4); // the tribute's two copies on two hosts are one article
  assert.equal(heat.cells[0].o, 2);
  assert.deepEqual(cells[0].topOutlets, [["iheart.com", 3], ["local.com", 1]]);
});

test("shown title drops exactly the suffix the key strips, with the original casing", () => {
  const records = [
    rec({ source: "iheart.com", title: "Amy Winehouse Tribute Ends With One Song | Sunny 102.3 FM" }),
    rec({ source: "iheart.com", title: "Storm Closes Every School In The County | Sunny 102.3 FM" }),
    rec({ source: "iheart.com", title: "Council Approves The New Stadium Budget | Sunny 102.3 FM" }),
    rec({ source: "reuters.com", title: "Storm hits coast, thousands without power - Reuters" }),
    rec({ source: "cbc.ca", title: "Group assisting long-planned review of firearms — including SKS — has yet to meet" }),
    rec({ source: "a.com", title: "Short title - Reuters" }),
    rec({ source: "a.com", title: "" }),
  ];
  const keyer = createKeyer(records);
  assert.deepEqual(records.map((r) => keyer.shownTitle(r)), [
    "Amy Winehouse Tribute Ends With One Song",
    "Storm Closes Every School In The County",
    "Council Approves The New Stadium Budget",
    "Storm hits coast, thousands without power",
    "Group assisting long-planned review of firearms — including SKS — has yet to meet",
    "Short title - Reuters",
    "",
  ]);
  for (const r of records) assert.equal(reprintKey(keyer.shownTitle(r), r.source), keyer.keyOf(r), r.title);
  const { cells } = buildSnapshot(records, { now: new Date("2026-10-20T13:00:00Z"), windowHours: 24 });
  assert.ok(cells[0].articles.some((a) => a.title === "Amy Winehouse Tribute Ends With One Song" && a.source === "iheart.com"));
});

test("shown title: the head minimum is measured before lowercasing, so a title is always shown", () => {
  // "İstanbul yangını xx" is 19 code points but 20 once lowercased ("i̇"): not cut, kept whole.
  const short = rec({ source: "hurriyet.com.tr", title: "İstanbul yangını xx - Hürriyet" });
  const long = rec({ source: "hurriyet.com.tr", title: "İstanbul yangını xyz - Hürriyet" });
  const keyer = createKeyer([short, long]);
  assert.equal(keyer.shownTitle(short), "İstanbul yangını xx - Hürriyet");
  assert.equal(keyer.keyOf(short), "i̇stanbul yangını xx hürriyet");
  assert.equal(keyer.shownTitle(long), "İstanbul yangını xyz");
  assert.equal(keyer.keyOf(long), "i̇stanbul yangını xyz");
  const { cells } = buildSnapshot([short, long], { now: new Date("2026-10-20T13:00:00Z"), windowHours: 24 });
  assert.ok(cells[0].articles.every((a) => typeof a.title === "string" && a.title !== ""));
});

test("repeated suffixes: \"X - Section | Outlet\" loses both, the same for the key and the shown title", () => {
  const r = rec({ source: "reuters.com", title: "Storm hits coast, thousands without power - World News | Reuters" });
  const plain = rec({ source: "b.com", title: "Storm hits coast, thousands without power" });
  const keyer = createKeyer([r, plain]);
  assert.equal(keyer.keyOf(r), "storm hits coast thousands without power");
  assert.equal(keyer.shownTitle(r), "Storm hits coast, thousands without power");
  assert.equal(reprintKey(keyer.shownTitle(r), r.source), keyer.keyOf(r));
  assert.equal(keyer.keyOf(r), keyer.keyOf(plain)); // so the two are reprints of one headline
});

test("units: an outlet's copies of one headline are one article; two outlets are two; untitled count each", () => {
  const wire = "Storm hits coast, thousands without power";
  const records = [
    rec({ url: "https://a/1", source: "a.com", title: wire, time: at(10, 0) }),
    rec({ url: "https://a/2", source: "a.com", title: `${wire} - A`, time: at(10, 5) }),
    rec({ url: "https://b/1", source: "b.com", title: wire, time: at(9, 0) }),
    rec({ url: "https://c/1", source: "c.com", title: "", time: at(8, 0) }),
    rec({ url: "https://c/2", source: "c.com", title: "", time: at(8, 5) }),
    rec({ url: "https://d/1", cellId: "", source: "d.com", title: "Unplaced headline about the summit", time: at(8, 0) }),
    rec({ url: "https://d/2", cellId: "", source: "d.com", title: "Unplaced headline about the summit", time: at(8, 1) }),
  ];
  const { heat, cells } = buildSnapshot(records, { now: new Date("2026-10-20T13:00:00Z"), windowHours: 24 });
  const [cell] = heat.cells;
  assert.equal(cell.n, 4); // a.com's two copies = 1, b.com = 1, two untitled
  assert.equal(cell.u, 3);
  assert.equal(cell.o, 3);
  assert.deepEqual(heat.totals, { articles: 5, outlets: 4, countries: 1, cells: 1, unplaced: 1, reprints: 1 });
  assert.deepEqual(cells[0].topOutlets, [["c.com", 2], ["a.com", 1], ["b.com", 1]]);
  // The newest copy is shown; its reprints count the other outlet only.
  assert.deepEqual(cells[0].articles.filter((a) => a.title === wire).map((a) => [a.url, a.reprints]), [["https://a/2", 1]]);
  // One outlet's copies of one headline alone make a cell of n = 1, which is dropped.
  const solo = buildSnapshot([rec({ source: "a.com", title: wire }), rec({ source: "a.com", title: wire })], { now: new Date("2026-10-20T13:00:00Z"), windowHours: 24 });
  assert.deepEqual([solo.heat.cells.length, solo.heat.totals.articles], [0, 1]);
});

test("networks: two Big News Network portals are one outlet; articles keep their own domain", () => {
  const records = [
    rec({ source: "japanherald.com", country: "", title: "Wire story about the trade talks in Tokyo" }),
    rec({ source: "asiabulletin.com", country: "", title: "Another wire story about the yen today" }),
    rec({ source: "japantimes.co.jp", country: "JP", title: "Local story about the city budget vote" }),
  ];
  const { heat, cells } = buildSnapshot(records, { now: new Date("2026-10-20T13:00:00Z"), windowHours: 24 });
  assert.equal(heat.cells[0].o, 2);
  assert.equal(heat.cells[0].n, 3);
  assert.equal(heat.totals.outlets, 2);
  assert.deepEqual(cells[0].topOutlets, [["bignewsnetwork.com", 2], ["japantimes.co.jp", 1]]);
  assert.deepEqual(cells[0].articles.map((a) => a.source).sort(), ["asiabulletin.com", "japanherald.com", "japantimes.co.jp"]);
  // The same headline on two portals is one article of one outlet.
  const same = buildSnapshot([records[0], { ...records[0], url: "https://asiabulletin.com/x", source: "asiabulletin.com" }, records[2]], { now: new Date("2026-10-20T13:00:00Z"), windowHours: 24 });
  assert.equal(same.heat.cells[0].n, 2);
});

test("topCountries lists every outlet country of the cell, by units then code; topOutlets stays at 10", () => {
  const codes = ["AR", "BR", "CA", "DE", "ES", "FR", "GB", "IN", "JP", "MX", "NG", "US"];
  const records: ArticleRecord[] = [];
  // Country k has 12 - k articles from its own outlet, except BR, which ties AR at 12.
  codes.forEach((cc, k) => {
    const count = cc === "BR" ? 12 : 12 - k;
    for (let j = 0; j < count; j++) records.push(rec({ source: `o${cc}.com`, country: cc, title: `${cc} story ${j}` }));
  });
  records.push(rec({ source: "mystery.net", country: "", title: "No country" }));
  const { cells } = buildSnapshot(records, { now: new Date("2026-10-20T13:00:00Z"), windowHours: 24 });
  const [cell] = cells;
  assert.equal(cell.c, 12);
  assert.equal(cell.topCountries.length, cell.c);
  assert.deepEqual(cell.topCountries.slice(0, 3), [["AR", 12], ["BR", 12], ["CA", 10]]); // tie by code
  assert.deepEqual(cell.topCountries.at(-1), ["US", 1]);
  assert.equal(cell.topOutlets.length, 10);
});

test("topOutletCountries: placed and unplaced units, a network is one outlet, countries as given", () => {
  const unplaced = { cellId: "", lat: 0, lon: 0, locationName: "" };
  const wire = "Wire story about the trade talks in Tokyo";
  const records = [
    // Paris: two Big News Network portals. One headline on both is one unit, from the earliest
    // copy's country (JP); another headline on the second portal counts for its own country.
    rec({ source: "japanherald.com", country: "JP", title: wire, time: at(9, 0) }),
    rec({ source: "asiabulletin.com", country: "SG", title: wire, time: at(9, 5) }),
    rec({ source: "asiabulletin.com", country: "SG", title: "Another wire story about the yen today" }),
    rec({ source: "lemonde.fr", country: "FR", title: "Paris budget vote" }),
    // Unplaced: an outlet's copies of one headline are one unit; "" is not a country.
    rec({ ...unplaced, source: "lefigaro.fr", country: "FR", title: "National strike" }),
    rec({ ...unplaced, source: "lefigaro.fr", country: "FR", title: "National strike" }),
    rec({ ...unplaced, source: "lefigaro.fr", country: "FR", title: "Senate reform" }),
    rec({ ...unplaced, source: "bbc.co.uk", country: "GB", title: "Election night" }),
    rec({ ...unplaced, source: "mystery.net", country: "", title: "Unknown" }),
    // A one-article cell is dropped from the map but still counted.
    rec({ cellId: latLngToCell(-33.9, 151.2, 3), source: "smh.com.au", country: "AU", locationName: "Sydney" }),
  ];
  const { heat } = buildSnapshot(records, { now: new Date("2026-10-20T13:00:00Z"), windowHours: 24 });
  assert.deepEqual(heat.topOutletCountries, [["FR", 3], ["AU", 1], ["GB", 1], ["JP", 1], ["SG", 1]]);
  // The same unit as totals.articles: the countries plus the one unknown add up to it.
  assert.equal(heat.topOutletCountries.reduce((s, [, n]) => s + n, 0) + 1, heat.totals.articles);

  // At most 20: of 22 countries, the two with the fewest units are left out.
  const many: ArticleRecord[] = [];
  for (let k = 0; k < 22; k++) {
    const cc = String.fromCharCode(65 + k) + "X";
    for (let j = 0; j <= k; j++) many.push(rec({ ...unplaced, source: `${cc}.com`, country: cc, title: `${cc} ${j}` }));
  }
  const top = buildSnapshot(many, { now: new Date("2026-10-20T13:00:00Z"), windowHours: 24 }).heat.topOutletCountries;
  assert.equal(top.length, 20);
  assert.deepEqual(top[0], ["VX", 22]);
  assert.deepEqual(top.at(-1), ["CX", 3]);
});

test("buildSnapshot: a cell's fid is the most common FeatureID among the records carrying its name", () => {
  const records: ArticleRecord[] = [];
  // 7 records named Paris (fid A x4, B x3) and 6 named Montrouge (fid C): the name is Paris,
  // so the fid is A, though C is the most common FeatureID in the cell.
  for (let i = 0; i < 4; i++) records.push(rec({ source: `a${i}.fr`, locationFid: "-1456928" }));
  for (let i = 0; i < 3; i++) records.push(rec({ source: `b${i}.fr`, locationFid: "-1456930" }));
  for (let i = 0; i < 6; i++) records.push(rec({ source: `c${i}.fr`, locationName: "Montrouge, France", locationFid: "-1449130" }));
  // A cell whose records carry no FeatureID writes none.
  for (let i = 0; i < 3; i++) records.push(rec({ cellId: LAGOS, source: `d${i}.ng`, locationName: "Lagos, Nigeria" }));
  const { cells } = buildSnapshot(records, { now: new Date("2026-10-20T13:00:00Z"), windowHours: 24 });
  const paris = cells.find((c) => c.id === PARIS)!;
  assert.equal(paris.name, "Paris, France");
  assert.equal(paris.fid, "-1456928");
  assert.deepEqual(Object.keys(paris).slice(0, 4), ["id", "name", "home", "fid"]);
  assert.ok(!("fid" in cells.find((c) => c.id === LAGOS)!));
});
