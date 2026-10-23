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
    cellId: CELL, locationName: "Washington", persons: [], orgs: [], themes: [], video: "", locationCountry: "", kinds: "", ...p,
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

test("stories: u, i against the cell's home, one article per reprint key", () => {
  const tags = { persons: ["jane doe"], orgs: ["acme motors"], locationCountry: "US" };
  const wire = "Acme recalls million cars over brake defect";
  const records = [
    art({ ...tags, url: "https://ap.org/1", time: t(1), source: "ap.org", country: "US", title: wire }),
    art({ ...tags, url: "https://guardian.co.uk/1", time: t(2), source: "guardian.co.uk", country: "GB", title: `${wire} - The Guardian` }),
    art({ ...tags, url: "https://abc.net.au/1", time: t(3), source: "abc.net.au", country: "AU", title: `${wire} | ABC News` }),
    art({ ...tags, url: "https://zeit.de/1", time: t(4), source: "zeit.de", country: "DE", title: "Acme ruft Autos wegen Bremsen zurück" }),
  ];
  const [story] = buildStories(records).stories;
  assert.equal(story.n, 4);
  assert.equal(story.u, 2);
  assert.equal(story.c, 4);
  assert.equal(story.i, 3); // GB, AU, DE; US is the place's own country
  assert.deepEqual(story.articles.map((a) => [a.url, a.reprints]), [["https://zeit.de/1", 0], ["https://abc.net.au/1", 2]]);
  // A home passed in by the cell wins over the story's own.
  assert.equal(buildStories(records, undefined, "DE").stories[0].i, 3);
  assert.equal(buildStories(records, undefined, "").stories[0].i, 4);
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

test("stories: at most 30, all n >= 3, sorted by n desc", () => {
  const many: ArticleRecord[] = [];
  for (let s = 0; s < 34; s++) {
    for (let k = 0; k < 3 + (s % 4); k++) {
      many.push(art({ url: `https://s${s}.com/${k}`, time: t(1 + Math.floor((s * 6 + k) / 60), (s * 6 + k) % 60), source: `o${k}.com`, title: `Story${s} alpha${s} bravo${s} charlie${s} delta${s}`, persons: [`person ${s}`], orgs: [`org ${s}`] }));
    }
  }
  const { stories, unclustered } = buildStories(many);
  assert.equal(stories.length, 30);
  for (const s of stories) assert.ok(s.n >= 3);
  for (let i = 1; i < stories.length; i++) assert.ok(stories[i - 1].n >= stories[i].n);
  assert.equal(stories.reduce((sum, s) => sum + s.n, 0) + unclustered, many.length);
});

test("stories: second pass attaches a loose article by 3 shared title tokens; it is never the headline", () => {
  const tags = { persons: ["ann lee"], orgs: ["harbor authority"] };
  const records = [
    // Loose: no tags, oldest, and its title is nothing but the story's three main tokens, so
    // it would win the medoid if it could. Three shared tokens do not join in the first pass.
    art({ url: "https://loose.com/1", time: t(1), source: "loose.com", title: "Harbor bridge collapse" }),
    art({ ...tags, url: "https://o1.com/1", time: t(2), source: "o1.com", title: "Harbor bridge collapse injures workers" }),
    art({ ...tags, url: "https://o2.com/1", time: t(3), source: "o2.com", title: "Harbor bridge collapse halts traffic" }),
    art({ ...tags, url: "https://o3.com/1", time: t(4), source: "o3.com", title: "Harbor bridge collapse inquiry opens" }),
    art({ url: "https://o4.com/1", time: t(5), source: "o4.com", title: "Harbor festival returns this weekend" }), // 1 token: stays loose
  ];
  const { stories, unclustered } = buildStories(records);
  assert.equal(stories.length, 1);
  const [story] = stories;
  assert.equal(story.n, 4);
  assert.equal(story.o, 4);
  assert.equal(story.first, t(1)); // the attached article counts in the dates
  assert.equal(unclustered, 1);
  assert.equal(story.headline, "Harbor bridge collapse injures workers");
  assert.ok(story.articles.some((a) => a.url === "https://loose.com/1"));
});

test("stories: the 30-story cap comes before the second pass, so a dropped cluster's article can attach", () => {
  const records: ArticleRecord[] = [];
  let i = 0;
  const at = () => t(1 + Math.floor(i / 60), i++ % 60);
  // 31st cluster (3 articles, so dropped by the cap): shares "harbor bridge collapse" with story 29.
  for (let k = 0; k < 3; k++) {
    records.push(art({ url: `https://x${k}.com/x`, time: at(), source: `x${k}.com`, title: `Harbor bridge collapse ${["zebra", "yonder", "xylophone"][k]}`, persons: ["person x"], orgs: ["org x"] }));
  }
  // 30 clusters of 4; story 29 is the latest, so it comes last before the second pass.
  for (let s = 0; s < 30; s++) {
    for (let k = 0; k < 4; k++) {
      const extra = s === 29 ? "harbor bridge collapse " : "";
      records.push(art({ url: `https://s${s}.com/${k}`, time: at(), source: `o${k}.com`, title: `${extra}Kilo${s} lima${s} mike${s} november${s}`, persons: [`person ${s}`], orgs: [`org ${s}`] }));
    }
  }
  const { stories, unclustered } = buildStories(records);
  assert.equal(stories.length, 30);
  assert.equal(unclustered, 0); // the 31st cluster's three articles all attached
  assert.equal(stories[0].n, 7); // story 29 plus the three, re-sorted first
  assert.match(stories[0].headline, /Kilo29/); // the attached articles never become the headline
  assert.ok(stories.slice(1).every((s) => s.n === 4));
});

test("stories: re-sorted by n after the second pass when attachments change the order", () => {
  const a = { persons: ["ann lee"], orgs: ["harbor authority"] };
  const b = { persons: ["bob ray"], orgs: ["ferry union"] };
  const records = [
    ...[0, 1, 2, 3].map((k) => art({ ...a, url: `https://a${k}.com/1`, time: t(1, k), source: `a${k}.com`, title: `Harbor authority names chair ${["alpha", "bravo", "charlie", "delta"][k]}` })),
    ...[0, 1, 2].map((k) => art({ ...b, url: `https://b${k}.com/1`, time: t(2, k), source: `b${k}.com`, title: `Ferry workers strike again ${["echo", "foxtrot", "golf"][k]}` })),
    // Loose: 3 shared tokens with the ferry story, no tags, so only the second pass takes them.
    art({ url: "https://l1.com/1", time: t(3), source: "l1.com", title: "Ferry workers strike Monday" }),
    art({ url: "https://l2.com/1", time: t(3, 5), source: "l2.com", title: "Ferry workers strike Tuesday" }),
  ];
  const { stories } = buildStories(records);
  assert.deepEqual(stories.map((s) => s.n), [5, 4]);
  assert.match(stories[0].headline, /^Ferry workers strike again/);
});

test("stories: one outlet's copies of a headline are one article; the headline is the shown title", () => {
  const tags = { persons: ["amy winehouse"], orgs: ["roundhouse"] };
  const station = (i: number, head: string, own = tags) => art({ ...own, url: `https://s${i}.iheart.com/x`, time: t(1, i), source: "iheart.com", title: `${head} | Sunny 102.3 FM` });
  const tribute = "Amy Winehouse tribute ends with every star singing";
  const records = [
    ...[0, 1, 2, 3, 4].map((i) => station(i, tribute)),
    station(5, "Roundhouse announces new winter concert season"),
    station(6, "Storm closes every school in the county today", { persons: [], orgs: [] }),
    art({ ...tags, url: "https://bbc.co.uk/1", time: t(2), source: "bbc.co.uk", title: "Amy Winehouse tribute: stars sing together at Roundhouse" }),
  ];
  const { stories, unclustered } = buildStories(records);
  // iheart's five copies of the tribute are one article: 2 tribute units + 1 Roundhouse unit.
  assert.equal(stories.length, 1);
  assert.equal(stories[0].n, 3);
  assert.equal(stories[0].u, 3);
  assert.equal(unclustered, 1);
  assert.ok(!stories[0].headline.includes("Sunny"));
  assert.ok(stories[0].articles.every((a) => !a.title.includes("Sunny")));
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

test("state v5 stores entity lists, video, location country and kinds; v4, v3, v2 and v1 state still load", () => {
  const rec = { ...fixture[0], video: "https://youtu.be/dQw4w9WgXcQ", locationCountry: "US", kinds: "ck" };
  const round = decodeState(encodeState({ feeds: {}, records: [rec] }, t(6)));
  assert.deepEqual(round.records[0], rec);
  const v1Fields = [rec.url, rec.title, rec.source, rec.country, rec.lang, rec.time, rec.tone, rec.image, rec.lat, rec.lon, rec.cellId, rec.locationName];
  const v1 = gzipSync(JSON.stringify({ v: 1, savedAt: t(6), feeds: {}, records: [v1Fields] }));
  const old = decodeState(v1).records[0];
  assert.deepEqual([old.persons, old.orgs, old.themes, old.video], [[], [], [], ""]);
  assert.equal(old.url, rec.url);
  const v2 = gzipSync(JSON.stringify({ v: 2, savedAt: t(6), feeds: {}, records: [[...v1Fields, "jane doe", "acme motors", ""]] }));
  const mid = decodeState(v2).records[0];
  assert.deepEqual([mid.persons, mid.orgs, mid.themes, mid.video, mid.locationCountry], [["jane doe"], ["acme motors"], [], "", ""]);
  // A v3 record (no location country) loads with "" instead of forcing a cold start.
  const v3 = gzipSync(JSON.stringify({ v: 3, savedAt: t(6), feeds: {}, records: [[...v1Fields, "jane doe", "", "", rec.video]] }));
  const prev = decodeState(v3).records[0];
  assert.deepEqual([prev.persons, prev.video, prev.locationCountry], [["jane doe"], rec.video, ""]);
  // A v4 record (no kinds) loads with kinds ""; a malformed kinds value is cleared.
  const v4 = gzipSync(JSON.stringify({ v: 4, savedAt: t(6), feeds: {}, records: [[...v1Fields, "", "", "", "", "US"]] }));
  const v4r = decodeState(v4).records[0];
  assert.deepEqual([v4r.locationCountry, v4r.kinds], ["US", ""]);
  assert.equal(decodeState(encodeState({ feeds: {}, records: [{ ...rec, kinds: "kc" }] }, t(6))).records[0].kinds, "");
  assert.throws(() => decodeState(gzipSync(JSON.stringify({ v: 7, feeds: {}, records: [] }))));
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

test("stories: countries lists every outlet country of the story, attached units included; c and i follow it", () => {
  const tags = { persons: ["ann lee"], orgs: ["harbor authority"] };
  const records = [
    art({ url: "https://loose.jp/1", time: t(1), source: "loose.jp", country: "JP", title: "Harbor bridge collapse" }), // attached
    art({ ...tags, url: "https://o1.com/1", time: t(2), source: "o1.com", country: "US", title: "Harbor bridge collapse injures workers" }),
    art({ ...tags, url: "https://o2.co.uk/1", time: t(3), source: "o2.co.uk", country: "GB", title: "Harbor bridge collapse halts traffic" }),
    art({ ...tags, url: "https://o3.co.uk/1", time: t(4), source: "o3.co.uk", country: "GB", title: "Harbor bridge collapse inquiry opens" }),
    art({ ...tags, url: "https://o4.net/1", time: t(5), source: "o4.net", country: "", title: "Harbor bridge collapse: divers search river" }),
  ];
  const [story] = buildStories(records, undefined, "US").stories;
  assert.equal(story.n, 5);
  assert.deepEqual(story.countries, [["GB", 2], ["JP", 1], ["US", 1]]); // "" left out; tie by code
  assert.equal(story.c, story.countries.length);
  assert.equal(story.i, story.countries.filter(([cc]) => cc !== "US").length);
});
