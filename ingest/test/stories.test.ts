import assert from "node:assert/strict";
import { test } from "node:test";
import { isDeniedTheme, parseNames, parseOrgs, parseThemes, titleTokens } from "../src/entities.ts";
import { decodeState, encodeState } from "../src/state.ts";
import { buildStories, themeWords } from "../src/stories.ts";
import type { ArticleRecord } from "../src/types.ts";
import { gzipSync } from "node:zlib";

const CELL = "832aa8fffffffff";
function art(p: Partial<ArticleRecord> & { url: string; time: string }): ArticleRecord {
  return {
    title: "", source: "x.com", country: "US", lang: "en", tone: 0, image: "", lat: 38.9, lon: -77,
    cellId: CELL, locationName: "Washington", persons: [], orgs: [], themes: [], video: "", ...p,
  };
}
const t = (h: number, m = 0) => `2026-10-21T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;

// Story A: Acme recall, 5 articles, 4 outlets (wire.com has 3).
// Story B: Riverton flood, 4 articles.
// Noise: 3 unrelated articles.
const fixture: ArticleRecord[] = [
  art({ url: "https://wire.com/a1", time: t(1), source: "wire.com", title: "Acme recalls million cars over brake defect", persons: ["jane doe"], orgs: ["acme motors"], tone: -2 }),
  art({ url: "https://wire.com/a2", time: t(2), source: "wire.com", title: "Acme brake recall widens to trucks", persons: ["jane doe"], orgs: ["acme motors"], tone: -3 }),
  art({ url: "https://wire.com/a3", time: t(3), source: "wire.com", title: "Regulators question Acme over brake recall", orgs: ["acme motors", "transport safety board"], persons: ["jane doe"] }),
  art({ url: "https://daily.co.uk/a4", time: t(4), source: "daily.co.uk", country: "GB", title: "Acme brake recall: what owners need to know", persons: ["jane doe"], orgs: ["acme motors"] }),
  art({ url: "https://zeit.de/a5", time: t(5), source: "zeit.de", country: "DE", lang: "de", title: "Acme ruft Autos wegen Bremsen zurück", persons: ["jane doe"], orgs: ["acme motors"], tone: 1 }),
  art({ url: "https://local.com/b1", time: t(1, 30), source: "local.com", title: "Riverton flood forces evacuation of downtown", persons: ["john roe"], themes: ["natural_disaster_flood"] }),
  art({ url: "https://tv.com/b2", time: t(2, 30), source: "tv.com", title: "Riverton flood waters rise as evacuation expands", persons: ["john roe"], themes: ["natural_disaster_flood"] }),
  art({ url: "https://paper.com/b3", time: t(3, 30), source: "paper.com", title: "Mayor John Roe: Riverton flood worst in decades", persons: ["john roe"], themes: ["natural_disaster_flood"] }),
  art({ url: "https://radio.com/b4", time: t(4, 30), source: "radio.com", title: "", persons: ["john roe"], themes: ["natural_disaster_flood"] }),
  art({ url: "https://n1.com/x", time: t(2, 10), source: "n1.com", title: "Local bakery wins regional prize", persons: ["sam baker"] }),
  art({ url: "https://n2.com/y", time: t(3, 10), source: "n2.com", title: "Stadium renovation approved by council", orgs: ["city council"] }),
  art({ url: "https://n3.com/z", time: t(4, 10), source: "n3.com", title: "Weather: sunny weekend ahead" }),
];

test("stories: two obvious stories plus noise", () => {
  const { stories, unclustered } = buildStories(fixture);
  assert.equal(stories.length, 2);
  assert.equal(unclustered, 3);
  assert.equal(stories.reduce((s, x) => s + x.n, 0) + unclustered, fixture.length);

  const [a, b] = stories;
  assert.equal(a.n, 5);
  assert.equal(a.o, 3);
  assert.equal(a.c, 3); // US, GB, DE
  assert.equal(a.l, 2);
  assert.equal(a.t, -0.8); // mean(-2, -3, 0, 0, 1)
  assert.equal(a.first, t(1));
  assert.equal(a.last, t(5));
  assert.deepEqual(a.entities, ["acme motors", "jane doe", "transport safety board"]);
  // Medoid: the title sharing the most tokens with the others ("acme", "brake", "recall").
  assert.equal(a.headline, "Acme brake recall widens to trucks");
  assert.equal(a.headlineSource, "wire.com");
  assert.equal(a.headlineLang, "en");
  // Newest first, at most 2 per outlet: wire.com's oldest article is left out.
  assert.deepEqual(a.articles.map((x) => x.url), ["https://zeit.de/a5", "https://daily.co.uk/a4", "https://wire.com/a3", "https://wire.com/a2"]);

  assert.equal(b.n, 4);
  assert.deepEqual(b.entities, ["john roe", "natural disaster flood"]); // 1 person, so a theme tops up, as words
  assert.equal(b.headline, "Riverton flood forces evacuation of downtown");
  assert.equal(b.articles.length, 4);
});

test("stories: headline prefers a titled article; all untitled gives an empty headline", () => {
  const group = (titles: string[]) =>
    titles.map((title, i) => art({ url: `https://o${i}.com/s`, time: t(1, i), source: `o${i}.com`, title, persons: ["ann lee"], orgs: ["harbor authority"] }));
  const one = buildStories(group(["", "", "Harbor authority names Ann Lee chair"])).stories[0];
  assert.equal(one.n, 3);
  assert.equal(one.headline, "Harbor authority names Ann Lee chair");
  assert.equal(one.headlineSource, "o2.com");
  const none = buildStories(group(["", "", ""])).stories[0];
  assert.equal(none.headline, "");
  assert.equal(none.headlineSource, "o0.com"); // earliest article
});

test("stories: deterministic over shuffled input", () => {
  const base = JSON.stringify(buildStories(fixture));
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 5; i++) {
    const shuffled = [...fixture].sort(() => rand() - 0.5);
    assert.equal(JSON.stringify(buildStories(shuffled)), base);
  }
});

test("stories: at most 12, all n >= 3, sorted by n desc", () => {
  const many: ArticleRecord[] = [];
  for (let s = 0; s < 15; s++) {
    for (let k = 0; k < 3 + (s % 4); k++) {
      many.push(art({ url: `https://s${s}.com/${k}`, time: t(1, s * 3 + k), source: `o${k}.com`, title: `Story${s} alpha${s} bravo${s} charlie${s} delta${s}`, persons: [`person ${s}`], orgs: [`org ${s}`] }));
    }
  }
  const { stories, unclustered } = buildStories(many);
  assert.equal(stories.length, 12);
  for (const s of stories) assert.ok(s.n >= 3);
  for (let i = 1; i < stories.length; i++) assert.ok(stories[i - 1].n >= stories[i].n);
  assert.equal(stories.reduce((sum, s) => sum + s.n, 0) + unclustered, many.length);
});

test("deny-list: generic theme families and form themes are dropped, specific ones kept", () => {
  for (const th of ["TAX_FNCACT_PRESIDENT", "CRISISLEX_C07_SAFETY", "WB_696_PUBLIC_SECTOR_MANAGEMENT", "EPU_ECONOMY", "GENERAL_GOVERNMENT", "USPEC_POLICY1", "UNGP_FORESTS_RIVERS_OCEANS", "LEADER", "ARMEDCONFLICT"]) {
    assert.ok(isDeniedTheme(th), th);
  }
  for (const th of ["ECON_INFLATION", "NATURAL_DISASTER_FLOOD", "WHISTLEBLOWER"]) assert.ok(!isDeniedTheme(th), th);
  // Most-mentioned first, offsets stripped, lowercase, de-duplicated, at most 6.
  assert.deepEqual(
    parseThemes("TAX_FNCACT_PRESIDENT,1;ECON_INFLATION,25;WB_1104_X,30;ECON_INFLATION,183;FUELPRICES,973;LEADER,5;ECON_INFLATION,300"),
    ["econ_inflation", "fuelprices"],
  );
  assert.equal(parseThemes(Array.from({ length: 10 }, (_, i) => `THEME_${i},${i}`).join(";")).length, 6);
  assert.deepEqual(parseNames("Rob Wood,867;Sanjay Raja,1386;Rob Wood,900"), ["rob wood", "sanjay raja"]);
  assert.deepEqual(parseOrgs("Reuters,5;Deutsche Bank,1437;United States,9;Office For National Statistics,576"), ["deutsche bank", "office for national statistics"]);
});

test("title tokens: lowercase, punctuation stripped, short and stop words dropped, outlet suffix removed", () => {
  assert.deepEqual(titleTokens("Trump says: the WHISTLEBLOWER program, worth $25M, starts today - Fox News"), ["trump", "whistleblower", "program", "worth", "starts"]);
  assert.deepEqual(titleTokens("Acme ruft Autos wegen Bremsen zurück"), ["acme", "ruft", "autos", "wegen", "bremsen", "zurück"]);
  assert.deepEqual(titleTokens(""), []);
});

test("state v3 stores entity lists and video; v2 and v1 state still load", () => {
  const rec = { ...fixture[0], video: "https://youtu.be/dQw4w9WgXcQ" };
  const round = decodeState(encodeState({ feeds: {}, records: [rec] }, t(6)));
  assert.deepEqual(round.records[0], rec);
  const v1Fields = [rec.url, rec.title, rec.source, rec.country, rec.lang, rec.time, rec.tone, rec.image, rec.lat, rec.lon, rec.cellId, rec.locationName];
  const v1 = gzipSync(JSON.stringify({ v: 1, savedAt: t(6), feeds: {}, records: [v1Fields] }));
  const old = decodeState(v1).records[0];
  assert.deepEqual([old.persons, old.orgs, old.themes, old.video], [[], [], [], ""]);
  assert.equal(old.url, rec.url);
  const v2 = gzipSync(JSON.stringify({ v: 2, savedAt: t(6), feeds: {}, records: [[...v1Fields, "jane doe", "acme motors", ""]] }));
  const mid = decodeState(v2).records[0];
  assert.deepEqual([mid.persons, mid.orgs, mid.themes, mid.video], [["jane doe"], ["acme motors"], [], ""]);
  assert.throws(() => decodeState(gzipSync(JSON.stringify({ v: 4, feeds: {}, records: [] }))));
  // A raw GDELT place name stored by older code is tidied on load.
  const raw = { ...rec, locationName: "London, London, City Of, United Kingdom" };
  assert.equal(decodeState(encodeState({ feeds: {}, records: [raw] }, t(6))).records[0].locationName, "London, United Kingdom");
  // A video stored under the older, looser rule is cleared on load.
  const loose = { ...rec, video: "https://youtube.com/embed/videoseries?list=PL1" };
  assert.equal(decodeState(encodeState({ feeds: {}, records: [loose] }, t(6))).records[0].video, "");
});

test("displayed entities: persons and orgs only when there are 2+, themes as words otherwise", () => {
  const story = (who: { persons?: string[]; orgs?: string[]; themes?: string[] }) =>
    buildStories(
      [0, 1, 2].map((i) =>
        art({ url: `https://o${i}.com/e`, time: t(2, i), source: `o${i}.com`, title: `Climate summit opens in Bonn ${i}`, ...who }),
      ),
    ).stories[0];
  const three = story({ persons: ["antonio guterres"], orgs: ["united nations", "unfccc"], themes: ["env_climatechange", "env_coal"] });
  assert.equal(three.n, 3);
  assert.deepEqual(three.entities, ["antonio guterres", "unfccc", "united nations"]);
  const one = story({ orgs: ["unfccc"], themes: ["env_climatechange", "env_coal", "natural_disaster_flood", "wb_678_digital_government"] });
  assert.equal(one.n, 3);
  assert.deepEqual(one.entities, ["unfccc", "climatechange", "coal", "natural disaster flood", "678 digital government"]); // ties by theme code
  assert.equal(themeWords("ECON_INFLATION"), "inflation");
  assert.equal(themeWords("natural_disaster_flood"), "natural disaster flood");
  assert.equal(themeWords("whistleblower"), "whistleblower");
});
