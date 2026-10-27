import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScript, clipDate, CLOSE_TEXT, languageName, openText, ordinalWords, spokenDate, spokenHeadline, spokenSeconds, storyText } from "../src/script.mjs";

const heat = { generatedAt: "2026-10-25T00:15:00Z", windowHours: 24, totals: { articles: 242540, outlets: 10568, countries: 195, cells: 2797 } };

/** A stories.json entry as the ingest writes it (docs/DATA-CONTRACT.md "Top stories"). */
const entry = (rank, name, story, confirmed = "city") => ({
  rank,
  cell: { id: `83${String(rank).padStart(2, "0")}b2fffffffff`, name, lat: 31.25, lon: 35.5, home: "IL" },
  story: { headlineSource: "wamc.org", headlineLang: "en", headlineUrl: "https://www.wamc.org/x", u: 10, c: 5, t: -2, first: "2026-10-24T03:30:00Z", last: "2026-10-25T00:00:00Z", ...story },
  confirmed,
});

const stories = {
  generatedAt: heat.generatedAt,
  windowHours: 24,
  stories: [
    entry(1, "Hebron, Israel", { headline: "Israeli PM pledges massive military operation after West Bank checkpoint attack", n: 277, o: 245, l: 18, i: 46 }),
    entry(2, "Paris, France", { headline: "Francia vive nueva jornada de protestas", headlineLang: "es", headlineSource: "eltiempo.com", n: 343, o: 241, l: 24, i: 49 }, "country"),
    entry(3, "Atlanta, Georgia, United States", { headline: "Six Flags says it will install seat belts?", n: 74, o: 73, l: 1, i: 3 }, "region"),
    entry(4, "Milan, Lombardia, Italy", { headline: "Cortei, da Milano a Roma", headlineLang: "it", n: 1399, o: 1225, l: 26, i: 47 }),
    entry(5, "Kiev, Ukraine", { headline: "Arab News | Musk says he was behind Starlink speed restriction.", n: 121, o: 110, l: 8, i: 20 }),
    entry(6, "Madrid, Spain", { headline: "Ισπανία", headlineLang: "el", n: 86, o: 78, l: 20, i: 12 }),
    entry(7, "Tehran, Iran", { headline: "A seventh story", n: 86, o: 75, l: 22, i: 9 }),
  ],
};

test("dates in words: ordinals, the weekday and month in UTC, the clip's day from the snapshot", () => {
  assert.deepEqual([1, 2, 3, 11, 12, 13, 20, 21, 22, 23, 24, 30, 31].map(ordinalWords), [
    "first", "second", "third", "eleventh", "twelfth", "thirteenth", "twentieth", "twenty-first", "twenty-second", "twenty-third", "twenty-fourth", "thirtieth", "thirty-first",
  ]);
  assert.throws(() => ordinalWords(32), /day of month/);
  assert.equal(spokenDate("2026-10-24"), "Saturday, the twenty-fourth of October");
  assert.equal(spokenDate("2026-01-01"), "Thursday, the first of January");
  assert.throws(() => spokenDate("24 October"), /date/);
  // A 00:15 UTC snapshot of the last 24 hours is mostly the day before (as v3's plan dates it).
  assert.equal(clipDate(heat), "2026-10-24");
  assert.equal(clipDate({ generatedAt: "2026-10-24T14:00:00Z", windowHours: 24 }), "2026-10-24");
  assert.throws(() => clipDate({}), /generatedAt/);
});

test("buildScript: the opening for a known date, six stories, the close", () => {
  const script = buildScript({ stories, date: "2026-10-24", generatedAt: "2026-10-25T00:20:00Z" });
  assert.deepEqual(
    { ...script, lines: undefined },
    { date: "2026-10-24", generatedAt: "2026-10-25T00:20:00Z", voice: { engine: "kokoro", name: "af_heart", speed: 1.1 }, gap: 0.4, lines: undefined },
  );
  assert.deepEqual(script.lines[0], {
    id: "open",
    kind: "open",
    text: "Today on Earth. Saturday, the twenty-fourth of October. Six places the world's press pointed at.",
    seconds: 0,
  });
  assert.deepEqual(script.lines.map((l) => l.id), ["open", "story-1", "story-2", "story-3", "story-4", "story-5", "story-6", "close"]);
  assert.deepEqual(script.lines.at(-1), { id: "close", kind: "close", text: CLOSE_TEXT, seconds: 0 });
  assert.equal(CLOSE_TEXT, "That was today on Earth. Every place, every outlet, every day. Find us on GitHub.");
  // The voice label is never spoken (it is on the lockup and in the caption).
  assert.ok(!script.lines.some((l) => /synthetic voice/i.test(l.text)));
  assert.equal(spokenSeconds(script), 0);
  // Fewer stories than six: all of them, and the opening says how many; none: no third sentence.
  const two = buildScript({ stories: { stories: stories.stories.slice(0, 2) }, date: "2026-10-24" });
  assert.equal(two.lines.length, 4);
  assert.equal(two.lines[0].text, "Today on Earth. Saturday, the twenty-fourth of October. Two places the world's press pointed at.");
  assert.equal(openText("2026-10-24", 1), "Today on Earth. Saturday, the twenty-fourth of October. One place the world's press pointed at.");
  const none = buildScript({ stories: { stories: [] }, date: "2026-10-24" });
  assert.deepEqual(none.lines.map((l) => l.kind), ["open", "close"]);
  assert.equal(none.lines[0].text, "Today on Earth. Saturday, the twenty-fourth of October.");
});

test("buildScript: a story line is the place and the headline (no counts), its story fields", () => {
  const [, hebron, , atlanta, milan, kiev] = buildScript({ stories, date: "2026-10-24" }).lines;
  assert.equal(hebron.text, "Hebron. Israeli PM pledges massive military operation after West Bank checkpoint attack.");
  assert.deepEqual([hebron.n, hebron.of], [1, 6]);
  // The counts stay in the story object (the card's ledger row), only out of the voice.
  assert.deepEqual(hebron.story, {
    cell: "8301b2fffffffff",
    place: "Hebron",
    lat: 31.25,
    lon: 35.5,
    headline: "Israeli PM pledges massive military operation after West Bank checkpoint attack",
    source: "wamc.org",
    lang: "en",
    url: "https://www.wamc.org/x",
    n: 277,
    o: 245,
    l: 18,
    i: 46,
    confirmed: "city",
    spoken: true,
    said: "Israeli PM pledges massive military operation after West Bank checkpoint attack",
  });
  // A headline ending in ? or . keeps its own mark (and `said` carries it).
  assert.equal(atlanta.text, "Atlanta. Six Flags says it will install seat belts?");
  assert.equal(atlanta.story.said, "Six Flags says it will install seat belts?");
  assert.equal(atlanta.story.place, "Atlanta");
  assert.equal(kiev.text, "Kiev. Musk says he was behind Starlink speed restriction.");
  // An unread headline has said "".
  assert.equal(milan.text, "Milan. The headline is in Italian, on screen.");
  assert.equal(milan.story.said, "");
  assert.deepEqual(storyText({ place: "X", headline: "H", lang: "en" }), { text: "X. H.", spoken: true, said: "H" });
});

test("invisible characters: out of the spoken text and the script's headline", () => {
  const zw = entry(1, "London, United Kingdom", { headline: "​Chris Brown⁠ avoids jail time﻿, given suspended‎ sentence", n: 323, o: 282, l: 6, i: 30 });
  const [, london] = buildScript({ stories: { stories: [zw] }, date: "2026-10-24" }).lines;
  assert.equal(london.story.headline, "Chris Brown avoids jail time, given suspended sentence");
  assert.equal(london.story.said, london.story.headline);
  assert.equal(london.text, "London. Chris Brown avoids jail time, given suspended sentence.");
  assert.ok(!/[​-‏⁠﻿]/u.test(london.text));
});

test("buildScript: a non-English headline is on screen, not spoken", () => {
  const lines = buildScript({ stories, date: "2026-10-24" }).lines;
  const paris = lines[2];
  assert.equal(paris.text, "Paris. The headline is in Spanish, on screen.");
  assert.equal(paris.story.spoken, false);
  assert.equal(paris.story.headline, "Francia vive nueva jornada de protestas");
  assert.equal(paris.story.source, "eltiempo.com");
  assert.equal(lines[6].text, "Madrid. The headline is in Greek, on screen.");
  assert.ok(!lines.some((l) => l.story?.place === "Tehran"), "the seventh entry is not read");
  // The headline itself never reaches the spoken text.
  assert.ok(!paris.text.includes("Francia"));
  assert.equal(languageName("es"), "Spanish");
  assert.equal(languageName("zh"), "Chinese");
  assert.equal(languageName("qqq"), "qqq");
  assert.equal(languageName(undefined), "another language");
});

test("spoken headlines: an outlet or section label is not read; the card keeps the shown title", () => {
  const kiev = buildScript({ stories, date: "2026-10-24" }).lines[5];
  assert.equal(kiev.text, "Kiev. Musk says he was behind Starlink speed restriction.");
  assert.equal(kiev.story.headline, "Arab News | Musk says he was behind Starlink speed restriction.");
  assert.equal(kiev.story.said, "Musk says he was behind Starlink speed restriction.");
  assert.equal(spokenHeadline("Arab News | Musk says he was behind Starlink speed restriction"), "Musk says he was behind Starlink speed restriction");
  assert.equal(spokenHeadline("WATCH | Firefighters battle a wildfire near Los Angeles"), "Firefighters battle a wildfire near Los Angeles");
  assert.equal(spokenHeadline("Opinion — Why the Senate race in Ohio matters"), "Why the Senate race in Ohio matters");
  assert.equal(spokenHeadline("The Yeshiva World :: France braces for protests tonight"), "France braces for protests tonight");
  // A trailing label of the same form, and both at once.
  assert.equal(spokenHeadline("Musk says Starlink restricted speeds – Reuters"), "Musk says Starlink restricted speeds");
  assert.equal(spokenHeadline("Arab News | Musk says Starlink restricted speeds | Arab News"), "Musk says Starlink restricted speeds");
  // No label: unchanged; five words before the bar is not a label.
  const plain = "Israeli PM pledges massive military operation after West Bank checkpoint attack";
  assert.equal(spokenHeadline(plain), plain);
  assert.equal(spokenHeadline("Five words here are many | Headline that is long enough"), "Five words here are many | Headline that is long enough");
  // Never stripped when what is left would be under 20 characters.
  assert.equal(spokenHeadline("Arab News | Short one here"), "Arab News | Short one here");
  assert.equal(storyText({ place: "X", headline: "WATCH | Firefighters battle a wildfire", lang: "en" }).text, "X. Firefighters battle a wildfire.");
});
