import assert from "node:assert/strict";
import { test } from "node:test";
import { MIN_STORY_U } from "../src/broadcast.ts";
import { TOP_STORIES_MAX, TOP_STORIES_PER_COUNTRY, TOP_STORIES_UNKNOWN_HOME_MAX, buildTopStories, buildTopStoriesSafe } from "../src/top-stories.ts";
import type { CellFile, HeatCell, HeatFile, Story, TopStoriesFile } from "../src/types.ts";

const NOW = "2026-10-24T12:00:00Z";
const T = (h: number) => `2026-10-24T${String(h).padStart(2, "0")}:00:00Z`;

function story(name: string, p: Partial<Story>): Story {
  return {
    n: 10, u: 10, o: 5, c: 1, i: 0, l: 1, t: 0, countries: [["US", 10]], first: T(1), last: T(2),
    headline: name, headlineSource: "x.com", headlineLang: "en", headlineUrl: `https://x.com/${name}`, entities: ["ann lee"], articles: [], ...p,
  };
}

interface CellSpec {
  id: string;
  /** The cell's own country; "US" when not given. */
  home?: string;
  stories: Story[];
}

function heatOf(specs: CellSpec[]): HeatFile {
  const heatCells: HeatCell[] = specs.map((s) => ({ id: s.id, lat: 1, lon: 2, n: 50, u: 50, o: 1, c: 1, i: 0, l: 1, t: 0, name: `Place ${s.id}`, b: 0 }));
  return {
    generatedAt: NOW, windowHours: 24, newestArticleAt: NOW, baselineDays: 0,
    totals: { articles: 0, outlets: 0, countries: 0, cells: specs.length, unplaced: 0, reprints: 0 }, topOutletCountries: [], cells: heatCells,
  };
}

function run(specs: CellSpec[]): TopStoriesFile {
  const cells: CellFile[] = specs.map((s) => ({
    id: s.id, name: `Place ${s.id}`, home: s.home ?? "US", n: 50, u: 50, o: 1, c: 1, i: 0, l: 1, t: 0,
    topOutlets: [], topCountries: [], languages: [], articles: [], videos: 0, stories: s.stories, unclustered: 0,
  }));
  return buildTopStories({ heat: heatOf(specs), cells });
}

const headlines = (f: TopStoriesFile) => f.stories.map((e) => e.story.headline);

test("top stories: ranked by distinct outlets; entries shaped as the broadcast's cell and story", () => {
  const f = run([
    { id: "a", home: "US", stories: [story("A-o20", { o: 20 })] },
    { id: "b", home: "FR", stories: [story("B-o40", { o: 40, n: 45, u: 30, c: 9, i: 8, t: -2.5 })] },
    { id: "c", home: "JP", stories: [story("C-o30", { o: 30 })] },
  ]);
  assert.equal(f.generatedAt, NOW);
  assert.equal(f.windowHours, 24);
  assert.deepEqual(headlines(f), ["B-o40", "C-o30", "A-o20"]);
  assert.deepEqual(f.stories.map((e) => e.rank), [1, 2, 3]);
  assert.deepEqual(f.stories[0], {
    rank: 1,
    cell: { id: "b", name: "Place b", lat: 1, lon: 2, home: "FR" },
    story: {
      headline: "B-o40", headlineSource: "x.com", headlineLang: "en", headlineUrl: "https://x.com/B-o40",
      n: 45, u: 30, o: 40, c: 9, i: 8, l: 1, t: -2.5, first: T(1), last: T(2),
    },
  });
});

test("top stories: ties go to higher n, then earlier first, then cell id, then position", () => {
  const top = (specs: CellSpec[]) => headlines(run(specs))[0];
  assert.equal(top([{ id: "a", stories: [story("small", { o: 9, n: 10 })] }, { id: "b", stories: [story("big", { o: 9, n: 11 })] }]), "big");
  assert.equal(top([{ id: "a", stories: [story("late", { o: 9, first: T(3) })] }, { id: "b", stories: [story("early", { o: 9, first: T(2) })] }]), "early");
  assert.equal(top([{ id: "z", stories: [story("in-z", { o: 9 })] }, { id: "m", stories: [story("in-m", { o: 9 })] }]), "in-m");
  assert.equal(top([{ id: "a", stories: [story("first", { o: 9 }), story("second", { o: 9 })] }]), "first");
});

test("top stories: one story per place", () => {
  const f = run([
    { id: "a", home: "US", stories: [story("A1", { o: 50 }), story("A2", { o: 45 })] },
    { id: "b", home: "FR", stories: [story("B1", { o: 10 })] },
  ]);
  assert.deepEqual(headlines(f), ["A1", "B1"]);
});

test("top stories: at most two per country", () => {
  assert.equal(TOP_STORIES_PER_COUNTRY, 2);
  const f = run([
    { id: "us1", home: "US", stories: [story("US1", { o: 60 })] },
    { id: "us2", home: "US", stories: [story("US2", { o: 50 })] },
    { id: "us3", home: "US", stories: [story("US3", { o: 40 })] },
    { id: "fr1", home: "FR", stories: [story("FR1", { o: 10 })] },
  ]);
  assert.deepEqual(headlines(f), ["US1", "US2", "FR1"]);
});

test("top stories: one story per event (headline reprint key), skipped before the country cap", () => {
  const closure = "Israel orders closure of the West Bank";
  const f = run([
    { id: "heb", home: "PS", stories: [story(closure, { o: 60 })] },
    // The same headline from another outlet, its " - Reuters" suffix stripped by the key.
    { id: "gaz", home: "PS", stories: [story(`${closure} - Reuters`, { o: 50, headlineSource: "reuters.com" })] },
    { id: "ram", home: "PS", stories: [story("PS-other", { o: 40 })] },
    { id: "fr1", home: "FR", stories: [story("FR1", { o: 30 })] },
  ]);
  // gaz is skipped and does not use up a PS place, so ram takes the second one.
  assert.deepEqual(headlines(f), [closure, "PS-other", "FR1"]);
  assert.deepEqual(f.stories.map((e) => e.cell.id), ["heb", "ram", "fr1"]);
  // A headline whose key is empty (punctuation only) matches nothing: both are listed.
  assert.deepEqual(headlines(run([
    { id: "a", home: "US", stories: [story("…!", { o: 20 })] },
    { id: "b", home: "FR", stories: [story("…!", { o: 10 })] },
  ])), ["…!", "…!"]);
});

test("top stories: unknown-home cells share one bucket of one, apart from every country", () => {
  assert.equal(TOP_STORIES_UNKNOWN_HOME_MAX, 1);
  const f = run([
    { id: "x1", home: "", stories: [story("X1", { o: 70 })] },
    { id: "x2", home: "", stories: [story("X2", { o: 65 })] },
    { id: "us1", home: "US", stories: [story("US1", { o: 60 })] },
    { id: "us2", home: "US", stories: [story("US2", { o: 50 })] },
  ]);
  // The unknown home does not use up a US place, and the second unknown cell is skipped.
  assert.deepEqual(headlines(f), ["X1", "US1", "US2"]);
  assert.equal(f.stories[0].cell.home, "");
});

test("top stories: a story needs u >= 3 and a headline", () => {
  assert.equal(MIN_STORY_U, 3);
  const f = run([
    { id: "a", home: "US", stories: [story("echo", { o: 90, u: 2 }), story("", { o: 80, u: 40 }), story("A-titled", { o: 5, u: 3 })] },
    { id: "b", home: "FR", stories: [story("B", { o: 4 })] },
  ]);
  // The echoed and untitled stories are not candidates, so cell a still has A-titled to give.
  assert.deepEqual(headlines(f), ["A-titled", "B"]);
});

test("top stories: at most 12 entries", () => {
  assert.equal(TOP_STORIES_MAX, 12);
  const specs: CellSpec[] = Array.from({ length: 20 }, (_, k) => ({
    id: `c${String(k).padStart(2, "0")}`, home: `Q${String.fromCharCode(65 + k)}`, stories: [story(`S${k}`, { o: 100 - k })],
  }));
  const f = run(specs);
  assert.equal(f.stories.length, 12);
  assert.deepEqual(headlines(f), Array.from({ length: 12 }, (_, k) => `S${k}`));
  assert.equal(f.stories[11].rank, 12);
  assert.deepEqual(run([]).stories, []);
});

test("top stories: a failure is isolated; the file still has an empty list", () => {
  const heat = heatOf([{ id: "a", stories: [] }]);
  const broken = [{ id: "a", stories: null }] as unknown as CellFile[];
  const logged: string[] = [];
  assert.throws(() => buildTopStories({ heat, cells: broken }));
  const f = buildTopStoriesSafe({ heat, cells: broken }, (m) => logged.push(m));
  assert.deepEqual(f, { generatedAt: NOW, windowHours: 24, stories: [] });
  assert.equal(logged.length, 1);
  assert.match(logged[0], /top stories: FAILED/);
});
