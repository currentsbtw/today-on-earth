import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { MIN_STORY_U, availableFrom, buildBroadcast, buildBroadcastSafe, risingRatio, voices } from "../src/broadcast.ts";
import { loadCountryLookup } from "../src/domains.ts";
import { parseGkgLine } from "../src/gkg.ts";
import { parseKinds, themeKinds } from "../src/kinds.ts";
import { buildStories } from "../src/stories.ts";
import type { ArticleRecord, BroadcastFile, CellFile, HeatCell, HeatFile, Story } from "../src/types.ts";

const NOW = "2026-10-21T12:00:00Z";
const T = (h: number) => `2026-10-21T${String(h).padStart(2, "0")}:00:00Z`;

function story(name: string, p: Partial<Story>): Story {
  return {
    n: 10, u: Math.min(p.n ?? 10, 10), o: 5, c: 1, i: 0, l: 1, t: 0, countries: [["US", 10]], first: T(1), last: T(2),
    headline: name, headlineSource: "x.com", headlineLang: "en", headlineUrl: `https://x.com/${name}`, entities: [], articles: [], ...p,
  };
}

interface CellSpec {
  id: string;
  n: number;
  b: number;
  /** The cell's own country; "US" when not given. */
  home?: string;
  /** [story, tagged articles] */
  stories: [Story, number][];
}

function run(specs: CellSpec[], baselineDays = 5, since = "2026-10-01"): BroadcastFile {
  const heatCells: HeatCell[] = specs.map((s) => ({ id: s.id, lat: 1, lon: 2, n: s.n, u: s.n, o: 1, c: 1, i: 0, l: 1, t: 0, name: `Place ${s.id}`, b: s.b }));
  const cells: CellFile[] = specs.map((s) => ({
    id: s.id, name: `Place ${s.id}`, home: s.home ?? "US", n: s.n, u: s.n, o: 1, c: 1, i: 0, l: 1, t: 0,
    topOutlets: [], topCountries: [], languages: [], articles: [], videos: 0,
    stories: s.stories.map(([st]) => st), unclustered: 0,
  }));
  const storyTagged = new Map<Story, number>();
  for (const s of specs) for (const [st, tagged] of s.stories) storyTagged.set(st, tagged);
  const heat: HeatFile = {
    generatedAt: NOW, windowHours: 24, newestArticleAt: NOW, baselineDays,
    totals: { articles: 0, outlets: 0, countries: 0, cells: specs.length, unplaced: 0, reprints: 0 }, articlesNormal: null, articlesNormalDays: 0, topOutletCountries: [], cells: heatCells,
  };
  return buildBroadcast({ heat, cells, storyTagged, baselineSince: since });
}

const pick = (b: BroadcastFile, id: string) => b.slots.find((s) => s.id === id)!;
const headline = (b: BroadcastFile, id: string) => pick(b, id).story?.headline ?? `(${pick(b, id).reason})`;

// One fixture that exercises every rule.
const fixture: CellSpec[] = [
  { id: "a", n: 300, b: 100, stories: [
    [story("A1-loud", { n: 60, o: 50, c: 6, i: 5, t: -3 }), 60],
    [story("A2-planet", { n: 40, o: 30, c: 26, i: 25, t: -1 }), 40],
  ] },
  { id: "b", n: 40, b: 2, stories: [
    [story("B1-rising", { n: 20, o: 8, c: 2, i: 1 }), 20],
    [story("B2-faint", { n: 12, o: 6, c: 3, i: 2, t: 0.5 }), 12],
  ] },
  { id: "c", n: 100, b: 50, stories: [
    [story("C1-bright", { n: 12, o: 12, c: 4, i: 3, t: 3.5 }), 12],
    [story("C2-ordinary", { n: 25, o: 20, c: 3, i: 2, t: 0.5 }), 6], // 24% tagged
    [story("C3-too-tagged", { n: 30, o: 25, c: 3, i: 10, t: 0.2 }), 8], // 26.7% tagged
    [story("C4-bright-but-thin", { n: 9, o: 9, c: 5, i: 4, t: 8 }), 0], // under every threshold of brightest
  ] },
  { id: "d", n: 5, b: 0, stories: [[story("D1-new-but-fewer-outlets", { n: 5, o: 5, c: 2, i: 1, t: 9 }), 0]] },
];

test("broadcast: each rule picks its story; six slots in fixed order", () => {
  const b = run(fixture);
  assert.deepEqual(b.slots.map((s) => s.id), ["loudest", "planet", "rising", "brightest", "ordinary", "faint"]);
  assert.deepEqual(
    b.slots.map((s) => s.story?.headline),
    ["A1-loud", "A2-planet", "B1-rising", "C1-bright", "C2-ordinary", "B2-faint"],
  );
  const rising = pick(b, "rising");
  assert.equal(rising.ratio, 13.3); // 40 / max(2, 3)
  assert.equal(rising.b, 2);
  assert.equal(pick(b, "faint").b, 2);
  assert.ok(!("ratio" in pick(b, "faint")));
  for (const id of ["loudest", "planet", "brightest", "ordinary"]) {
    assert.ok(!("ratio" in pick(b, id)) && !("b" in pick(b, id)), id);
  }
  assert.deepEqual(pick(b, "loudest").cell, { id: "a", name: "Place a", lat: 1, lon: 2, home: "US" });
  assert.equal(pick(b, "loudest").story!.headlineUrl, "https://x.com/A1-loud");
  assert.equal(risingRatio(7, 0), 2.3);
});

test("broadcast: a story fills at most one slot; empty slots say none", () => {
  const b = run([
    { id: "x", n: 80, b: 70, stories: [
      [story("S-everything", { n: 50, o: 50, c: 10, i: 40, t: 5 }), 0],
      [story("R-second", { n: 20, o: 20, c: 3, i: 10, t: 1 }), 0],
    ] },
  ]);
  assert.equal(headline(b, "loudest"), "S-everything");
  assert.equal(headline(b, "planet"), "R-second"); // S is taken
  assert.equal(headline(b, "rising"), "(none)"); // ratio 80/70 qualifies, but the cell has no story left
  assert.deepEqual(pick(b, "brightest"), { id: "brightest", available: false, reason: "none" });
  assert.equal(headline(b, "ordinary"), "(none)");
  assert.equal(headline(b, "faint"), "(none)"); // b = 70
});

test("broadcast: rising moves to the next cell when the top cell's stories are taken", () => {
  const b = run([
    { id: "hot", n: 90, b: 3, stories: [[story("H-loud", { n: 30, o: 30, c: 2 }), 0]] }, // ratio 30, taken by loudest
    { id: "warm", n: 40, b: 4, stories: [[story("W1", { n: 10, o: 6, c: 1 }), 0], [story("W2", { n: 9, o: 7, c: 1 }), 0]] }, // ratio 10
  ]);
  assert.equal(headline(b, "loudest"), "H-loud");
  assert.equal(pick(b, "rising").cell!.id, "warm");
  assert.equal(headline(b, "rising"), "W2"); // the cell's story with the most outlets
  assert.equal(pick(b, "rising").ratio, 10);
});

test("broadcast: ties go to higher n, then earlier first, then cell id", () => {
  const tie = (specs: CellSpec[]) => headline(run(specs), "loudest");
  assert.equal(tie([{ id: "a", n: 50, b: 0, stories: [[story("small", { n: 10, o: 9 }), 0], [story("big", { n: 11, o: 9 }), 0]] }]), "big");
  assert.equal(tie([{ id: "a", n: 50, b: 0, stories: [[story("late", { o: 9, first: T(3) }), 0], [story("early", { o: 9, first: T(2) }), 0]] }]), "early");
  assert.equal(
    tie([
      { id: "z", n: 50, b: 0, stories: [[story("in-z", { o: 9 }), 0]] },
      { id: "m", n: 50, b: 0, stories: [[story("in-m", { o: 9 }), 0]] },
    ]),
    "in-m",
  );
});

test("broadcast: rising and faint wait for 3 complete baseline days", () => {
  const b = run(fixture, 2, "2026-10-19");
  assert.deepEqual(pick(b, "rising"), { id: "rising", available: false, reason: "baseline", availableFrom: "2026-10-23" });
  assert.deepEqual(pick(b, "faint"), { id: "faint", available: false, reason: "baseline", availableFrom: "2026-10-23" });
  // The other slots fill as before.
  assert.deepEqual([headline(b, "loudest"), headline(b, "planet"), headline(b, "brightest"), headline(b, "ordinary")], ["A1-loud", "A2-planet", "C1-bright", "C2-ordinary"]);
  assert.equal(pick(run(fixture, 0, ""), "rising").availableFrom, "");
});

test("availableFrom: the day the third complete day has passed, never in the past", () => {
  // First run today: complete days are 22, 23, 24, all before today on the 25th.
  assert.equal(availableFrom("2026-10-21", "2026-10-21", 0), "2026-10-25");
  assert.equal(availableFrom("2026-10-21", "2026-10-23", 1), "2026-10-25");
  // Days lost to missed files: the remaining days still have to pass.
  assert.equal(availableFrom("2026-10-10", "2026-10-21", 2), "2026-10-22");
  assert.equal(availableFrom("2026-10-10", "2026-10-21", 0), "2026-10-24");
  assert.equal(availableFrom("", "2026-10-21", 0), "");
});

test("kinds: raw themes map to sorted letters; broad non-topic themes do not count", () => {
  assert.equal(parseKinds("NATURAL_DISASTER_FLOODS,9;LEADER,40;ARMEDCONFLICT,12;CRIME_ILLEGAL_DRUGS,3;ARMEDCONFLICT,80"), "cdkp");
  assert.equal(parseKinds("UNREST_POLICEBRUTALITY,1"), "c");
  assert.equal(parseKinds("GOV_DIVISIONOFPOWER,4;EPU_POLICY_GOVERNMENT,5"), "p");
  assert.equal(parseKinds("kill,3"), "c"); // case-insensitive
  assert.equal(parseKinds("MANMADE_DISASTER_IMPLIED,1;MANMADE_DISASTER_POWER_OUTAGE,9"), "d");
  assert.equal(parseKinds("MANMADE_DISASTER_IMPLIED,1;CRISISLEX_CRISISLEXREC,2;CRISISLEX_T03_DEAD,4;KILLER_WHALE,5;TAX_FNCACT_POLICE,3"), "");
  assert.equal(parseKinds(""), "");
  assert.deepEqual(themeKinds("SOC_GENERALCRIME"), ["k"]);
  assert.deepEqual(themeKinds("EVACUATION"), ["d"]);
});

test("kinds: parsed from the raw themes, before the grouping deny list drops them", () => {
  const line = readFileSync(new URL("./fixtures/gkg-sample.tsv", import.meta.url), "utf8").split("\n").filter(Boolean)[0].split("\t");
  line[8] = "ARMEDCONFLICT,10;ELECTION,40;ENV_CLIMATECHANGE,3";
  const r = parseGkgLine(line.join("\t"), loadCountryLookup());
  assert.ok(r.ok);
  assert.equal(r.record.kinds, "cp");
  assert.deepEqual(r.record.themes, ["env_climatechange"]); // ARMEDCONFLICT and ELECTION are denied for grouping
});

test("kinds: buildStories counts each story's tagged articles", () => {
  const art = (i: number, kinds: string): ArticleRecord => ({
    url: `https://o${i}.com/a`, title: `Harvest festival opens in Riverton square ${i}`, source: `o${i}.com`, country: "US", lang: "en",
    time: T(i), tone: 0, image: "", lat: 0, lon: 0, cellId: "832aa8fffffffff", locationName: "Riverton", persons: ["ann lee"],
    orgs: ["riverton council"], themes: [], video: "", locationCountry: "US", kinds,
  });
  const { stories, tagged } = buildStories([art(1, ""), art(2, "p"), art(3, ""), art(4, "")]);
  assert.equal(stories.length, 1);
  assert.deepEqual(tagged, [1]);
  assert.ok(!("tagged" in stories[0]));
  assert.match(stories[0].headlineUrl, /^https:\/\/o\d\.com\/a$/);
});

test("broadcast: loudest counts independent voices, min(u, o), so syndication and one outlet's copies lose", () => {
  const syndicated = story("syndicated-53-copies", { n: 53, u: 5, o: 53, c: 1 }); // one wire copy on 53 network sites
  const wide = story("wide-18-headlines", { n: 25, u: 18, o: 20, c: 4 });
  const b = run([
    { id: "a", n: 60, b: 0, stories: [[syndicated, 0]] },
    { id: "b", n: 30, b: 0, stories: [[wide, 0]] },
  ]);
  assert.equal(headline(b, "loudest"), "wide-18-headlines");
  // One outlet's station-suffixed copies: 26 distinct headlines but a single outlet.
  const oneOutlet = story("iheart-53-copies", { n: 53, u: 26, o: 1, c: 1 });
  const b2 = run([
    { id: "a", n: 60, b: 0, stories: [[oneOutlet, 0]] },
    { id: "b", n: 30, b: 0, stories: [[{ ...wide }, 0]] },
  ]);
  assert.equal(headline(b2, "loudest"), "wide-18-headlines");
  assert.deepEqual([voices(oneOutlet), voices(syndicated), voices(wide)], [1, 5, 18]);
  // Same voices (9): more outlets wins.
  const tie = run([{ id: "a", n: 60, b: 0, stories: [[story("u9-o12", { n: 20, u: 9, o: 12 }), 0], [story("u9-o15", { n: 15, u: 9, o: 15 }), 0]] }]);
  assert.equal(headline(tie, "loudest"), "u9-o15");
});

test("broadcast: every slot needs u >= 3", () => {
  assert.equal(MIN_STORY_U, 3);
  // An echoed story that would win every slot (most u/o/i, brightest tone, untagged, quiet cell).
  const echo = story("echo", { n: 60, u: 2, o: 60, c: 12, i: 11, t: 9 });
  const b = run([{ id: "q", n: 60, b: 1, stories: [[echo, 0]] }]);
  for (const s of b.slots) assert.deepEqual(s, { id: s.id, available: false, reason: "none" }, s.id);
  // At u = 3 it qualifies (and fills loudest; nothing is left for the rest).
  const ok = run([{ id: "q", n: 60, b: 1, stories: [[{ ...echo, u: 3 }, 0]] }]);
  assert.equal(headline(ok, "loudest"), "echo");
});

test("broadcast: a story without a headline never fills a slot", () => {
  const untitled = story("", { n: 60, u: 40, o: 50, c: 12, i: 11, t: 9 });
  const titled = story("titled", { n: 20, u: 15, o: 15, c: 4, i: 3 });
  const b = run([{ id: "a", n: 80, b: 1, stories: [[untitled, 0], [titled, 0]] }]);
  assert.equal(headline(b, "loudest"), "titled");
  for (const s of b.slots) assert.notEqual(s.story?.headline, "", s.id);
  assert.deepEqual(b.slots.filter((s) => s.available).map((s) => s.id), ["loudest"]); // the untitled one fills nothing else
});

test("broadcast: planet needs the place's own country to be known", () => {
  const unknownHome = story("unknown-home", { n: 30, u: 20, o: 25, c: 20, i: 20 }); // i == c: own country counted
  const knownHome = story("known-home", { n: 20, u: 15, o: 15, c: 9, i: 8 });
  const loud = story("loud", { n: 90, u: 60, o: 60, c: 2, i: 1 });
  const b = run([
    { id: "a", n: 100, b: 50, home: "", stories: [[loud, 0], [unknownHome, 0]] },
    { id: "b", n: 30, b: 50, home: "FR", stories: [[knownHome, 0]] },
  ]);
  assert.equal(headline(b, "loudest"), "loud");
  assert.equal(headline(b, "planet"), "known-home");
  assert.equal(pick(b, "planet").cell!.home, "FR");
});

test("broadcast: a failure is isolated; the file still has six 'none' slots", () => {
  const heat: HeatFile = {
    generatedAt: NOW, windowHours: 24, newestArticleAt: NOW, baselineDays: 5,
    totals: { articles: 0, outlets: 0, countries: 0, cells: 1, unplaced: 0, reprints: 0 },
    articlesNormal: null,
    articlesNormalDays: 0,
    topOutletCountries: [],
    cells: [{ id: "a", lat: 0, lon: 0, n: 5, u: 5, o: 1, c: 1, i: 0, l: 1, t: 0, name: "A", b: 0 }],
  };
  const broken = [{ id: "a", stories: null }] as unknown as CellFile[];
  const logged: string[] = [];
  assert.throws(() => buildBroadcast({ heat, cells: broken, storyTagged: new Map(), baselineSince: "" }));
  const b = buildBroadcastSafe({ heat, cells: broken, storyTagged: new Map(), baselineSince: "" }, (m) => logged.push(m));
  assert.deepEqual(b, {
    generatedAt: NOW, windowHours: 24, baselineDays: 5,
    slots: ["loudest", "planet", "rising", "brightest", "ordinary", "faint"].map((id) => ({ id, available: false, reason: "none" })),
  });
  assert.equal(logged.length, 1);
  assert.match(logged[0], /broadcast: FAILED/);
});

test("availableFrom: a since that looks like a date but is not one gives \"\"", () => {
  assert.equal(availableFrom("2026-13-45", "2026-10-21", 0), "");
  assert.equal(availableFrom("2026-02-30", "2026-10-21", 0), "");
  assert.equal(availableFrom("2026-10-21", "not-a-day", 0), "");
});
