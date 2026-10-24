import assert from "node:assert/strict";
import { test } from "node:test";
import { isDeniedTheme, parseNames, parseOrgs, parseThemes, titleTokens } from "../src/entities.ts";
import { decodeState, encodeState } from "../src/state.ts";
import { isRepublisher, makeIsRepublisher, parseRepublishers } from "../src/domains.ts";
import { createKeyer } from "../src/reprints.ts";
import { FULL_STORIES, MAX_STORIES, buildStories, creditedCopy, themeWords } from "../src/stories.ts";
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
  assert.deepEqual(a.articles!.map((x) => x.url), ["https://zeit.de/a5", "https://daily.co.uk/a4", "https://wire.com/a3", "https://wire.com/a2"]);

  assert.equal(b.n, 4);
  assert.deepEqual(b.entities, ["john roe", "natural disaster flood"]); // 1 person, so a theme tops up, as words
  assert.equal(b.headline, "Riverton flood forces evacuation of downtown");
  assert.equal(b.articles!.length, 4);
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
  assert.deepEqual(story.articles!.map((a) => [a.url, a.reprints]), [["https://zeit.de/1", 0], ["https://abc.net.au/1", 2]]);
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

/** `count` clusters, cluster s with `size(s)` articles from distinct outlets, 2 persons and 2 organisations of its own. */
function clusters(count: number, size: (s: number) => number, from = 0): ArticleRecord[] {
  const out: ArticleRecord[] = [];
  let i = from;
  for (let s = 0; s < count; s++) {
    for (let k = 0; k < size(s); k++, i++) {
      out.push(art({ url: `https://s${s}.com/${k}`, time: t(1 + Math.floor(i / 60), i % 60), source: `o${k}.com`, title: `Story${s} alpha${s} bravo${s} charlie${s} delta${s}`, persons: [`person ${s}`, `second ${s}`], orgs: [`org ${s}`, `agency ${s}`] }));
    }
  }
  return out;
}

test("stories: the first 30 are full, the rest compact (no articles, at most 3 entities); sorted by n desc", () => {
  const many = clusters(34, (s) => 3 + (s % 4));
  const { stories, unclustered } = buildStories(many);
  assert.equal(stories.length, 34);
  assert.equal(unclustered, 0);
  for (const s of stories) assert.ok(s.n >= 3);
  for (let i = 1; i < stories.length; i++) assert.ok(stories[i - 1].n >= stories[i].n);
  stories.forEach((s, i) => {
    if (i < FULL_STORIES) {
      assert.ok(!("compact" in s));
      assert.equal(s.entities.length, 4);
      assert.ok(s.articles && s.articles.length > 0);
    } else {
      assert.equal(s.compact, true);
      assert.ok(!("articles" in s));
      assert.equal(s.entities.length, 3);
      assert.ok(s.headline.startsWith("Story"));
    }
  });
  assert.equal(stories.reduce((sum, s) => sum + s.n, 0) + unclustered, many.length);
});

test("stories: at most 200; clusters beyond the ceiling stay unclustered", () => {
  const many = clusters(MAX_STORIES + 5, () => 3);
  const { stories, unclustered } = buildStories(many);
  assert.equal(stories.length, MAX_STORIES);
  assert.equal(unclustered, 15);
  assert.equal(stories.filter((s) => s.compact).length, MAX_STORIES - FULL_STORIES);
  // Ties by earliest article: the last five clusters created are the ones left out.
  assert.ok(stories.every((s) => !/^Story20[0-4] /.test(s.headline)));
});

test("stories: a strict pair (two outlets, 2 shared names or 3 shared tokens) is a story", () => {
  const names = { persons: ["ann lee"], orgs: ["harbor authority"] };
  const byNames = buildStories([
    art({ ...names, url: "https://a.com/1", time: t(1), source: "a.com", title: "Port chief resigns after audit" }),
    art({ ...names, url: "https://b.com/1", time: t(2), source: "b.com", title: "Lee steps down from harbor board" }),
  ]);
  assert.equal(byNames.stories.length, 1);
  assert.equal(byNames.stories[0].n, 2);
  assert.equal(byNames.stories[0].o, 2);
  assert.equal(byNames.unclustered, 0);
  // One shared name and three shared title tokens.
  const byTokens = buildStories([
    art({ persons: ["ann lee"], url: "https://a.com/1", time: t(1), source: "a.com", title: "Harbor bridge collapse injures workers" }),
    art({ persons: ["ann lee"], url: "https://b.com/1", time: t(2), source: "b.com", title: "Harbor bridge collapse halts traffic" }),
  ]);
  assert.equal(byTokens.stories.length, 1);
  assert.equal(byTokens.stories[0].n, 2);
});

test("stories: a loose pair (one outlet, or 1 shared name and 2 tokens, or themes only) is not a story", () => {
  const names = { persons: ["ann lee"], orgs: ["harbor authority"] };
  const sameOutlet = buildStories([
    art({ ...names, url: "https://a.com/1", time: t(1), source: "a.com", title: "Port chief resigns after audit" }),
    art({ ...names, url: "https://a.com/2", time: t(2), source: "a.com", title: "Lee steps down from harbor board" }),
  ]);
  assert.equal(sameOutlet.stories.length, 0);
  assert.equal(sameOutlet.unclustered, 2);
  const oneName = buildStories([
    art({ persons: ["ann lee"], url: "https://a.com/1", time: t(1), source: "a.com", title: "Harbor bridge reopens" }),
    art({ persons: ["ann lee"], url: "https://b.com/1", time: t(2), source: "b.com", title: "Harbor bridge tolls rise" }),
  ]);
  assert.equal(oneName.stories.length, 0);
  const themes = { themes: ["natural_disaster_flood", "env_climatechange"] };
  const byThemes = buildStories([
    art({ ...themes, url: "https://a.com/1", time: t(1), source: "a.com", title: "Rain closes schools" }),
    art({ ...themes, url: "https://b.com/1", time: t(2), source: "b.com", title: "Farmers count losses" }),
  ]);
  assert.equal(byThemes.stories.length, 0);
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
  assert.ok(story.articles!.some((a) => a.url === "https://loose.com/1"));
});

test("stories: the second pass reaches a compact story", () => {
  const records: ArticleRecord[] = [];
  let i = 0;
  const at = () => t(1 + Math.floor(i / 60), i++ % 60);
  // A loose article, oldest, with no tags: only the second pass can place it.
  records.push(art({ url: "https://loose.com/1", time: at(), source: "loose.com", title: "Harbor bridge collapse" }));
  // 30 clusters of 5 (the full stories), then a 31st of 3 sharing "harbor bridge collapse".
  for (let s = 0; s < 30; s++) {
    for (let k = 0; k < 5; k++) {
      records.push(art({ url: `https://s${s}.com/${k}`, time: at(), source: `o${k}.com`, title: `Kilo${s} lima${s} mike${s} november${s}`, persons: [`person ${s}`], orgs: [`org ${s}`] }));
    }
  }
  for (let k = 0; k < 3; k++) {
    records.push(art({ url: `https://x${k}.com/x`, time: at(), source: `x${k}.com`, title: `Harbor bridge collapse ${["zebra", "yonder", "xylophone"][k]}`, persons: ["person x"], orgs: ["org x"] }));
  }
  const { stories, unclustered } = buildStories(records);
  assert.equal(stories.length, 31);
  assert.equal(unclustered, 0);
  const tail = stories[30];
  assert.equal(tail.compact, true);
  assert.equal(tail.n, 4); // its three plus the loose article
  assert.equal(tail.first, t(1)); // the attached article counts in the dates
  assert.match(tail.headline, /^Harbor bridge collapse [a-z]+$/); // never the attached article
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
  assert.ok(stories[0].articles!.every((a) => !a.title.includes("Sunny")));
});

// Headline credit (added 2026-10-24): identical copies credit the earliest newsroom copy.
const ceasefire = "Melania Trump helps forge a ceasefire deal in a Russian-occupied Ukrainian city";
const copy = (source: string, h: number, title = ceasefire) =>
  art({ url: `https://${source}/${h}`, time: t(h), source, title, persons: ["melania trump"], orgs: ["white house"] });

test("headline credit: a republisher's earlier copy loses to a newsroom's identical copy; the text is the medoid's", () => {
  const records = [copy("kenyastar.com", 1), copy("aol.com", 2), copy("wral.com", 3), copy("newsday.com", 4)];
  const [s] = buildStories(records).stories;
  assert.equal(s.headline, ceasefire);
  assert.equal(s.headlineSource, "wral.com"); // the earliest copy that is not a republisher
  assert.equal(s.headlineUrl, "https://wral.com/3");
});

test("headline credit: when every copy is a republisher's, the earliest is credited", () => {
  const records = [copy("aol.com", 2), copy("kenyastar.com", 1), copy("netscape.com", 3)];
  const [s] = buildStories(records).stories;
  assert.equal(s.headlineSource, "kenyastar.com");
  assert.equal(s.headlineUrl, "https://kenyastar.com/1");
});

test("headline credit: a title with one copy keeps it, even from a republisher", () => {
  const records = [
    copy("aol.com", 1),
    copy("wral.com", 2, "First lady says she brokered a temporary ceasefire in a Ukrainian town"),
    copy("newsday.com", 3, "White House says Melania Trump secured a ceasefire for a Ukrainian city"),
  ];
  const [s] = buildStories(records).stories;
  const keyer = createKeyer(records);
  const medoid = records.find((r) => r.url === s.headlineUrl)!;
  assert.equal(s.headline, keyer.shownTitle(medoid));
  assert.equal(creditedCopy(records[0], records.map((r) => ({ r })), keyer), records[0]); // its only copy
});

test("republishers: listed domains, dotted subdomains and every domain of a listed network", () => {
  assert.equal(isRepublisher("aol.com"), true);
  assert.equal(isRepublisher("uk.news.yahoo.com"), true); // dotted entry
  assert.equal(isRepublisher("kenyastar.com"), true); // a Big News Network portal, via outlet-networks.txt
  assert.equal(isRepublisher("wral.com"), false);
  assert.equal(isRepublisher(""), false);
  const list = parseRepublishers("# header\nportal.com\ta portal\n.agg.net\tan aggregator\nnet.com\ta network\n");
  const outlet = (d: string) => (d.endsWith(".site.org") || d === "site.org" ? "net.com" : d);
  const is = makeIsRepublisher(list, outlet);
  assert.deepEqual(["portal.com", "x.portal.com", "agg.net", "a.agg.net", "site.org", "b.site.org", "own.com"].map(is), [true, false, true, true, true, true, false]);
  assert.throws(() => parseRepublishers("portal.com"), /line 1/); // no comment
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
