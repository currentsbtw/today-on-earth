import assert from "node:assert/strict";
import { test } from "node:test";
import { MIN_STORY_U } from "../src/broadcast.ts";
import {
  CAPITAL_METONYMS, TOP_STORIES_MAX, TOP_STORIES_PER_COUNTRY, TOP_STORIES_UNKNOWN_HOME_MAX, buildTopStories, buildTopStoriesSafe, confirmStory,
} from "../src/top-stories.ts";
import type { CellArticle, CellFile, HeatCell, HeatFile, Story, TopStoriesFile } from "../src/types.ts";

const NOW = "2026-10-24T12:00:00Z";
const T = (h: number) => `2026-10-24T${String(h).padStart(2, "0")}:00:00Z`;

function art(title: string, lang = "en"): CellArticle {
  return { title, url: `https://y.com/${encodeURIComponent(title)}`, source: "y.com", country: "US", lang, time: T(2), tone: 0, image: "", video: "", reprints: 0 };
}

// Every fixture cell is named "Place <id>, Testland" and every fixture story carries a title naming
// Testland, so it is confirmed at the country level unless a test gives its own name or titles.
function story(name: string, p: Partial<Story>): Story {
  return {
    n: 10, u: 10, o: 5, c: 1, i: 0, l: 1, t: 0, countries: [["US", 10]], first: T(1), last: T(2),
    headline: name, headlineSource: "x.com", headlineLang: "en", headlineUrl: `https://x.com/${name}`, entities: ["ann lee"], articles: [art("News from Testland")], ...p,
  };
}

interface CellSpec {
  id: string;
  /** The cell's own country; "US" when not given. */
  home?: string;
  /** The cell's name; "Place <id>, Testland" when not given. */
  name?: string;
  stories: Story[];
}

const nameOf = (s: CellSpec) => s.name ?? `Place ${s.id}, Testland`;

function heatOf(specs: CellSpec[]): HeatFile {
  const heatCells: HeatCell[] = specs.map((s) => ({ id: s.id, lat: 1, lon: 2, n: 50, u: 50, o: 1, c: 1, i: 0, l: 1, t: 0, name: nameOf(s), b: 0 }));
  return {
    generatedAt: NOW, windowHours: 24, newestArticleAt: NOW, baselineDays: 0,
    totals: { articles: 0, outlets: 0, countries: 0, cells: specs.length, unplaced: 0, reprints: 0 }, articlesNormal: null, articlesNormalDays: 0, topOutletCountries: [], cells: heatCells,
  };
}

function run(specs: CellSpec[], storyGrim?: ReadonlyMap<Story, number>): TopStoriesFile {
  const cells: CellFile[] = specs.map((s) => ({
    id: s.id, name: nameOf(s), home: s.home ?? "US", n: 50, u: 50, o: 1, c: 1, i: 0, l: 1, t: 0,
    topOutlets: [], topCountries: [], languages: [], articles: [], videos: 0, stories: s.stories, unclustered: 0,
  }));
  return buildTopStories({ heat: heatOf(specs), cells, storyGrim });
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
    cell: { id: "b", name: "Place b, Testland", lat: 1, lon: 2, home: "FR" },
    story: {
      headline: "B-o40", headlineSource: "x.com", headlineLang: "en", headlineUrl: "https://x.com/B-o40",
      n: 45, u: 30, o: 40, c: 9, i: 8, l: 1, t: -2.5, first: T(1), last: T(2),
    },
    confirmed: "country",
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

// ---- Confirmation: the story's own text names its place ----

/** The level confirmStory gives a headline (and optional article titles) in a cell. */
const level = (name: string, home: string, headline: string, lang = "en", titles: [string, string?][] = []) =>
  confirmStory({ name, home }, { headline, headlineLang: lang, articles: titles.map(([t, l]) => art(t, l ?? "en")) })?.level ?? null;

test("top stories: confirmed by the city as a whole word, case-insensitive", () => {
  assert.equal(level("Lyon, France", "FR", "Fire in central LYON overnight"), "city");
  // Not inside another word, and no prefix form under 5 letters.
  assert.equal(level("Bari, Italy", "IT", "Barista wins award"), null);
  assert.equal(level("Lyon, Spainland", "", "Lyonnais fans march"), null);
  // An article title counts as the headline does.
  assert.equal(level("Lyon, Spainland", "", "Fans march", "en", [["Unrelated"], ["Lyon mayor speaks"]]), "city");
});

test("top stories: a name of 5+ letters also matches followed by up to 3 letters, or with its last letter replaced", () => {
  assert.equal(level("Berlin, Germany", "DE", "Berliner Senat beschließt Haushalt", "de"), "city");
  assert.equal(level("Bratislava, Slovakia", "SK", "Protest v Bratislave pokračuje", "sk"), "city");
  assert.equal(level("Kiev, Ukraine", "UA", "Ukrainian drones hit a refinery"), "country");
  // At most 3 letters more, and never shorter than the name.
  assert.equal(level("Berlin, Spainland", "", "Berlinerinnen feiern"), null);
  assert.equal(level("Shanghai, China", "", "A chin strap recall"), null);
});

test("top stories: diacritics are stripped on both sides", () => {
  assert.equal(level("Zürich, Switzerland", "CH", "Zurich airport closed by fog"), "city");
  assert.equal(level("Zurich, Switzerland", "CH", "Zürich: Flughafen wegen Nebel geschlossen", "de"), "city");
});

test("top stories: confirmed by a region of the cell name", () => {
  assert.equal(level("Lyon, Auvergne-Rhône-Alpes, France", "FR", "Storm warning for Auvergne-Rhone-Alpes"), "region");
  assert.equal(level("Springfield, Illinois, United States", "US", "Illinois lawmakers pass budget"), "region");
});

test("top stories: confirmed by the country, in English and in the title's own language", () => {
  assert.equal(level("Kassel, Hessen, Germany", "DE", "Germany votes on pensions"), "country");
  assert.equal(level("Kassel, Hessen, Germany", "DE", "Deutschland stimmt über Renten ab", "de"), "country");
  // The name in the title's language comes from Intl.DisplayNames: "Deutschland" is not an English name.
  assert.equal(level("Kassel, Hessen, Germany", "DE", "Deutschland stimmt über Renten ab", "en"), null);
  assert.equal(level("Lyon, Rhône, France", "FR", "França vai mobilizar mais de 70 mil policiais", "pt"), "country");
  // The ISO code is never matched, and a bad language tag is ignored.
  assert.equal(level("Kassel, Hessen, Germany", "DE", "DE sports roundup", "!!"), null);
  // The first level that matches is reported, whichever text it is in.
  assert.equal(level("Kassel, Hessen, Germany", "DE", "Germany votes", "en", [["Kassel turnout high"]]), "city");
});

test("top stories: confirmed by a capital's metonym from the published table", () => {
  assert.deepEqual(CAPITAL_METONYMS["US|Washington"], ["White House", "Pentagon", "Capitol Hill", "Congress", "Supreme Court", "Oval Office"]);
  assert.equal(level("Washington, United States", "US", "White House says talks will resume"), "metonym");
  assert.equal(level("Moscow, Moskva, Russia", "RU", "Kremlin denies the report"), "metonym");
  assert.equal(level("Paris, France", "FR", "L'Élysée dément", "fr"), "metonym");
  // Keyed by home and city: the White House does not confirm a Washington elsewhere.
  assert.equal(level("Washington, Tyne and Wear, United Kingdom", "GB", "White House says talks will resume"), null);
  // A name in capitals is matched in capitals: the word "who" is not the WHO.
  assert.equal(level("Geneva, Switzerland", "CH", "WHO warns of measles"), "metonym");
  assert.equal(level("Geneva, Spainland", "CH", "The man who sold the world"), null);
});

test("top stories: a title in a script without word spaces is matched by substring", () => {
  assert.equal(level("Tokyo, Japan", "JP", "Tokyo五輪の会場を公開", "ja"), "city");
  assert.equal(level("Tokyo, Kanto, Spainland", "JP", "日本の首相が会見", "ja"), "country");
  // The same name glued to letters in a spaced script is not a whole word.
  assert.equal(level("Tokyo, Kanto, Spainland", "", "Tokyoites celebrate"), null);
});

test("top stories: an unconfirmed story is skipped first and uses up nothing", () => {
  const off = (h: string, o: number) => story(h, { o, articles: [art("A story about somewhere else")] });
  const f = run([
    // us1's largest story does not name its place: us1 still gives its second story.
    { id: "us1", home: "US", stories: [off("Ohio senate race", 90), story("US1-b", { o: 20 })] },
    // us2's unconfirmed story is skipped before the country cap, so us3 and us4 take both US places.
    { id: "us2", home: "US", stories: [off("Off-us2", 80)] },
    { id: "us3", home: "US", stories: [story("US3", { o: 70 })] },
    { id: "us4", home: "US", stories: [story("US4", { o: 60 })] },
    // An unconfirmed repeat of an event does not take the event: the confirmed copy is listed.
    { id: "fr1", home: "FR", stories: [off("Strike closes the ports", 50)] },
    { id: "fr2", home: "FR", stories: [story("Strike closes the ports", { o: 40 })] },
  ]);
  assert.deepEqual(headlines(f), ["US3", "US4", "Strike closes the ports"]);
  assert.deepEqual(f.stories.map((e) => e.cell.id), ["us3", "us4", "fr2"]);
  assert.deepEqual(f.stories.map((e) => e.confirmed), ["country", "country", "country"]);
  const g = run([
    { id: "a", home: "GR", name: "Athens, Attiki, Greece", stories: [off("Ohio could decide control of the Senate", 99), story("Athens metro strike", { o: 10, articles: [] })] },
  ]);
  assert.deepEqual(g.stories.map((e) => [e.story.headline, e.confirmed]), [["Athens metro strike", "city"]]);
});

test("top stories: each entry carries its story's grim share g from the snapshot; none without one", () => {
  const war = story("War-o30", { o: 30 });
  const fair = story("Fair-o20", { o: 20 });
  const f = run([{ id: "a", home: "US", stories: [war] }, { id: "b", home: "FR", stories: [fair] }], new Map([[war, 0.62], [fair, 0]]));
  assert.deepEqual(f.stories.map((e) => [e.story.headline, e.g]), [["War-o30", 0.62], ["Fair-o20", 0]]);
  assert.deepEqual(Object.keys(f.stories[0]), ["rank", "cell", "story", "confirmed", "g"]);
  assert.ok(!("g" in f.stories[0].story)); // on the entry, not in the story (which stays the cell file's fields)
  // A story the map does not hold gets no g (readers treat a missing g as unknown).
  const none = run([{ id: "a", home: "US", stories: [story("Plain-o9", { o: 9 })] }], new Map());
  assert.ok(!("g" in none.stories[0]));
});
