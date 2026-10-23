import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSnapshot } from "../src/aggregate.ts";
import { MAX_TOPICS, TOPIC_MAX_CELLS, buildTopics, isJunkTopic } from "../src/topics.ts";
import type { ArticleRecord, CellFile, Story } from "../src/types.ts";

const NOW = "2026-10-23T12:00:00Z";

function story(n: number, entities: string[]): Story {
  return {
    n, u: n, o: n, c: 1, i: 0, l: 1, t: 0, first: NOW, last: NOW,
    headline: "", headlineSource: "", headlineLang: "", headlineUrl: "", entities, articles: [],
  };
}

function cell(id: string, stories: Story[]): CellFile {
  const n = stories.reduce((s, x) => s + x.n, 0);
  return {
    id, name: `Place ${id}`, home: "US", n, u: n, o: 1, c: 1, i: 0, l: 1, t: 0,
    topOutlets: [], topCountries: [], languages: [], articles: [], videos: 0, stories, unclustered: 0,
  };
}

/** Every entity of every story is a name unless `names` says otherwise. */
function run(cells: CellFile[], names = new Map<Story, number>()) {
  const all = new Map<Story, number>();
  for (const c of cells) for (const s of c.stories) all.set(s, names.get(s) ?? s.entities.length);
  return buildTopics(cells, NOW, all);
}

test("topics: a name's n per cell sums the stories carrying it; totals equal the sums", () => {
  const out = run([
    cell("a", [story(8, ["jane doe", "acme motors"]), story(5, ["jane doe", "city council"]), story(3, ["sam baker", "x corp"])]),
    cell("b", [story(6, ["jane doe", "acme motors"])]),
  ]);
  assert.equal(out.generatedAt, NOW);
  assert.deepEqual(out.topics, [
    ["jane doe", 19, [["a", 13], ["b", 6]]],
    ["acme motors", 14, [["a", 8], ["b", 6]]],
  ]);
  for (const [, total, cells] of out.topics) assert.equal(total, cells.reduce((s, [, n]) => s + n, 0));
});

test("topics: theme words that top a story up never enter the index", () => {
  // One name, then theme words (displayEntities with fewer than 2 names); none of the themes count.
  const s1 = story(20, ["john roe", "natural disaster flood", "evacuation"]);
  const s2 = story(15, ["natural disaster flood", "evacuation"]); // no names at all
  const out = run([cell("a", [s1, s2])], new Map([[s1, 1], [s2, 0]]));
  assert.deepEqual(out.topics, [["john roe", 20, [["a", 20]]]]);
});

test("topics: the snapshot records which leading entities are names", () => {
  const art = (i: number, p: Partial<ArticleRecord>): ArticleRecord => ({
    url: `https://o${i}.com/${i}`, title: `Riverton flood update number ${i}`, source: `o${i}.com`, country: "US", lang: "en",
    time: `2026-10-23T0${i % 10}:00:00Z`, tone: 0, image: "", lat: 38.9, lon: -77, cellId: "832aa8fffffffff",
    locationName: "Riverton", locationCountry: "US", persons: [], orgs: [], themes: [], video: "", kinds: "", ...p,
  });
  const records = Array.from({ length: 12 }, (_, i) => art(i, { persons: ["john roe"], themes: ["natural_disaster_flood", "evacuation"] }));
  const snap = buildSnapshot(records, { now: new Date(NOW), windowHours: 24 });
  const [s] = snap.cells[0].stories;
  assert.deepEqual(s.entities, ["john roe", "evacuation", "natural disaster flood"]);
  assert.equal(snap.storyNames.get(s), 1);
  const out = buildTopics(snap.cells, NOW, snap.storyNames);
  assert.deepEqual(out.topics.map((t) => t[0]), ["john roe"]);
});

test("topics: junk is filtered", () => {
  for (const junk of ["eu", "bbc", "a prosecution national terrorism", "an agency", "the ministry", "police", "government", "young", "2026", "...", "12-34"]) {
    assert.equal(isJunkTopic(junk), true, junk);
  }
  for (const ok of ["nato", "donald trump", "hague court", "police scotland", "théo", "anthropic", "theresa may"]) {
    assert.equal(isJunkTopic(ok), false, ok);
  }
  const out = run([cell("a", [story(30, ["police", "the ministry", "nato", "abc"])])]);
  assert.deepEqual(out.topics.map((t) => t[0]), ["nato"]);
});

test("topics: an entity needs a total of 10 or more", () => {
  const out = run([cell("a", [story(6, ["jane doe", "sam baker"])]), cell("b", [story(4, ["jane doe", "kim lee"])])]);
  assert.deepEqual(out.topics.map((t) => [t[0], t[1]]), [["jane doe", 10]]);
});

test("topics: at most 60 cells per entity, largest n first, ties by cell id; total over the kept cells", () => {
  const cells = Array.from({ length: 70 }, (_, i) => cell(`c${String(i).padStart(2, "0")}`, [story(i < 5 ? 10 : 2, ["jane doe", "acme"])]));
  const [jane] = run(cells).topics;
  assert.equal(jane[2].length, TOPIC_MAX_CELLS);
  assert.deepEqual(jane[2].slice(0, 6), [["c00", 10], ["c01", 10], ["c02", 10], ["c03", 10], ["c04", 10], ["c05", 2]]);
  assert.equal(jane[2][59][0], "c59"); // c60..c69 tie at 2 and lose by id
  assert.equal(jane[1], 5 * 10 + 55 * 2);
});

test("topics: at most 5,000 entities, largest total first, ties by name", () => {
  const stories = Array.from({ length: MAX_TOPICS + 10 }, (_, i) => story(i < 3 ? 50 : 10, [`name ${String(i).padStart(5, "0")}`, "zz filler"]));
  const out = run([cell("a", stories)]);
  assert.equal(out.topics.length, MAX_TOPICS);
  assert.deepEqual(out.topics.slice(0, 4).map((t) => t[0]), ["zz filler", "name 00000", "name 00001", "name 00002"]);
  assert.equal(out.topics[3][1], 50);
  assert.equal(out.topics[4][0], "name 00003");
  assert.equal(out.topics.at(-1)![0], `name ${String(MAX_TOPICS - 2).padStart(5, "0")}`);
});

test("topics: deterministic regardless of cell and story order", () => {
  const a = cell("a", [story(7, ["jane doe", "acme motors"]), story(9, ["kim lee", "acme motors"])]);
  const b = cell("b", [story(7, ["jane doe", "kim lee"]), story(4, ["acme motors", "kim lee"])]);
  const one = JSON.stringify(run([a, b]));
  const two = JSON.stringify(run([cell("b", [...b.stories].reverse()), cell("a", [...a.stories].reverse())]));
  assert.equal(one, two);
  assert.equal(one, JSON.stringify(run([a, b])));
});
