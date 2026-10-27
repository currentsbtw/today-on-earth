import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScript, clipDate, closeText, languageName, numberWords, onScreenLine, openText, ordinalWords, spokenDate, spokenHeadline, spokenCount, spokenSeconds, storyText } from "../src/script.mjs";
import { linePieces, PIECE_GAP } from "../src/speech.mjs";

const heat = { generatedAt: "2026-10-25T00:15:00Z", windowHours: 24, totals: { articles: 242540, outlets: 10568, countries: 195, cells: 2797 } };
/** The snapshot total the close speaks (heat.json totals.articles). */
const articles = heat.totals.articles;

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
  const script = buildScript({ stories, date: "2026-10-24", articles: heat.totals.articles, generatedAt: "2026-10-25T00:20:00Z" });
  assert.deepEqual(
    { ...script, lines: undefined },
    { date: "2026-10-24", generatedAt: "2026-10-25T00:20:00Z", voice: { engine: "kokoro", name: "af_heart", speed: 1.1 }, gap: 0.4, lines: undefined },
  );
  assert.deepEqual(script.lines[0], {
    id: "open",
    kind: "open",
    text: "Today on Earth. The humans call this day Saturday, the twenty-fourth of October. Six places their press pointed at. We counted.",
    seconds: 0,
  });
  assert.deepEqual(script.lines.map((l) => l.id), ["open", "story-1", "story-2", "story-3", "story-4", "story-5", "story-6", "close"]);
  // The close speaks heat.json's total, rounded to the nearest thousand, in words.
  assert.deepEqual(script.lines.at(-1), {
    id: "close",
    kind: "close",
    text: "That was today on Earth. Two hundred and forty-three thousand articles in one rotation. We did not read them. We counted them. We will count again tomorrow.",
    seconds: 0,
  });
  assert.equal(closeText(225169), "That was today on Earth. Two hundred and twenty-five thousand articles in one rotation. We did not read them. We counted them. We will count again tomorrow.");
  // The voice label is never spoken (it is on the lockup and in the caption).
  assert.ok(!script.lines.some((l) => /synthetic voice/i.test(l.text)));
  assert.equal(spokenSeconds(script), 0);
  // Fewer stories than six: all of them, and the opening says how many; none: their press pointed nowhere.
  const two = buildScript({ stories: { stories: stories.stories.slice(0, 2) }, date: "2026-10-24", articles });
  assert.equal(two.lines.length, 4);
  assert.equal(two.lines[0].text, "Today on Earth. The humans call this day Saturday, the twenty-fourth of October. Two places their press pointed at. We counted.");
  assert.equal(openText("2026-10-24", 1), "Today on Earth. The humans call this day Saturday, the twenty-fourth of October. One place their press pointed at. We counted.");
  const none = buildScript({ stories: { stories: [] }, date: "2026-10-24", articles });
  assert.deepEqual(none.lines.map((l) => l.kind), ["open", "close"]);
  assert.equal(none.lines[0].text, "Today on Earth. The humans call this day Saturday, the twenty-fourth of October. Their press pointed nowhere we could place.");
});

test("buildScript: without heat.json's total the script is not built (the close needs its number)", () => {
  for (const bad of [undefined, null, "242540", 2.5, -1, Number.NaN, 10_000_000]) {
    assert.throws(() => buildScript({ stories, date: "2026-10-24", articles: bad }), /heat\.json totals\.articles/);
  }
  assert.throws(() => buildScript({ stories, date: "2026-10-24" }), /heat\.json totals\.articles is undefined/);
});

test("numbers in words: the close's count, rounded to the nearest thousand from 1,000 up", () => {
  assert.equal(spokenCount(225169), "Two hundred and twenty-five thousand");
  assert.equal(spokenCount(242540), "Two hundred and forty-three thousand");
  assert.equal(spokenCount(1000), "One thousand");
  assert.equal(spokenCount(1500), "Two thousand");
  assert.equal(spokenCount(1499), "One thousand");
  // Below 1,000 the exact number (999 is not rounded up to a thousand).
  assert.equal(spokenCount(999), "Nine hundred and ninety-nine");
  assert.equal(spokenCount(40), "Forty");
  assert.equal(spokenCount(1), "One");
  // Zero is "No" ("No articles in one rotation."), as the opening's count says "No".
  assert.equal(spokenCount(0), "No");
  assert.equal(spokenCount(1_234_567), "One million two hundred and thirty-five thousand");
  assert.equal(spokenCount(9_999_999), "Ten million");
  assert.equal(spokenCount(20_000), "Twenty thousand");
  assert.equal(spokenCount(110_600), "One hundred and eleven thousand");
  for (const bad of [-1, 1.5, 10_000_000, "5"]) assert.throws(() => spokenCount(bad), /article count/);
  // The exact words, as the rounding feeds them.
  assert.equal(numberWords(1005), "One thousand and five");
  assert.equal(numberWords(300_000), "Three hundred thousand");
  assert.equal(numberWords(2_005_000), "Two million five thousand");
  assert.equal(numberWords(17), "Seventeen");
  assert.equal(numberWords(70_000), "Seventy thousand");
});

test("buildScript: a story line is the place and the headline (no counts), its story fields", () => {
  const [, hebron, , atlanta, milan, kiev] = buildScript({ stories, date: "2026-10-24", articles }).lines;
  assert.equal(hebron.text, "Hebron. The humans wrote: Israeli PM pledges massive military operation after West Bank checkpoint attack.");
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
  assert.equal(atlanta.text, "Atlanta. The humans wrote: Six Flags says it will install seat belts?");
  assert.equal(atlanta.story.said, "Six Flags says it will install seat belts?");
  assert.equal(atlanta.story.place, "Atlanta");
  assert.equal(kiev.text, "Kiev. The humans wrote: Musk says he was behind Starlink speed restriction.");
  // An Italian headline is read in Italian (by if_sara), after the frame in English; an English story has no readIn or frame.
  assert.equal(milan.text, "Milan. The humans wrote, in Italian: Cortei, da Milano a Roma.");
  assert.equal(milan.story.readIn, "it");
  assert.equal(milan.story.frame, "Milan. The humans wrote, in Italian: ");
  assert.ok(!("readIn" in hebron.story));
  assert.ok(!("frame" in hebron.story));
  assert.deepEqual(storyText({ place: "X", headline: "H", lang: "en" }), { text: "X. The humans wrote: H.", spoken: true, said: "H" });
  // The frame is the same for every story: only the place and the headline vary.
  const frames = buildScript({ stories, date: "2026-10-24", articles }).lines.filter((l) => l.story?.lang === "en").map((l) => l.text.slice(l.story.place.length, l.text.lastIndexOf(l.story.said)));
  assert.equal(frames.length, 3);
  assert.deepEqual([...new Set(frames)], [". The humans wrote: "]);
});

test("invisible characters: out of the spoken text and the script's headline", () => {
  const zw = entry(1, "London, United Kingdom", { headline: "​Chris Brown⁠ avoids jail time﻿, given suspended‎ sentence", n: 323, o: 282, l: 6, i: 30 });
  const [, london] = buildScript({ stories: { stories: [zw] }, date: "2026-10-24", articles }).lines;
  assert.equal(london.story.headline, "Chris Brown avoids jail time, given suspended sentence");
  assert.equal(london.story.said, london.story.headline);
  assert.equal(london.text, "London. The humans wrote: Chris Brown avoids jail time, given suspended sentence.");
  assert.ok(!/[​-‏⁠﻿]/u.test(london.text));
});

test("buildScript: a headline in a language with a Kokoro voice is read in it; any other is on screen", () => {
  const lines = buildScript({ stories, date: "2026-10-24", articles }).lines;
  const paris = lines[2];
  // Spanish: the frame (English voice), then the headline (ef_dora), one line as for English.
  assert.equal(paris.text, "Paris. The humans wrote, in Spanish: Francia vive nueva jornada de protestas.");
  assert.equal(paris.story.spoken, true);
  assert.equal(paris.story.readIn, "es");
  assert.equal(paris.story.frame, "Paris. The humans wrote, in Spanish: ");
  assert.equal(paris.story.said, "Francia vive nueva jornada de protestas");
  assert.equal(paris.story.headline, "Francia vive nueva jornada de protestas");
  assert.equal(paris.story.source, "eltiempo.com");
  // Greek has no Kokoro voice: on screen, unread, no readIn.
  const madrid = lines[6];
  assert.equal(madrid.text, "Madrid. The humans wrote this in Greek. It is on your screen.");
  assert.deepEqual([madrid.story.spoken, madrid.story.said, "readIn" in madrid.story, "frame" in madrid.story], [false, "", false, false]);
  assert.ok(!madrid.text.includes("Ισπανία"));
  assert.ok(!lines.some((l) => l.story?.place === "Tehran"), "the seventh entry is not read");
  // German stays on screen (no Kokoro 1.0 voice).
  assert.deepEqual(storyText({ place: "Berlin", headline: "Proteste in ganz Frankreich gehen weiter", lang: "de" }), {
    text: "Berlin. The humans wrote this in German. It is on your screen.",
    spoken: false,
    said: "",
  });
  // A read Spanish headline loses its outlet label like an English one; `said` is what is read.
  assert.deepEqual(storyText({ place: "Bogotá", headline: "El Tiempo | Francia vive nueva jornada de protestas", lang: "es" }), {
    text: "Bogotá. The humans wrote, in Spanish: Francia vive nueva jornada de protestas.",
    spoken: true,
    said: "Francia vive nueva jornada de protestas",
    readIn: "es",
    frame: "Bogotá. The humans wrote, in Spanish: ",
  });
  // Each voiced language is read; a CJK or Devanagari full stop is kept, not doubled.
  for (const lang of ["es", "fr", "it", "pt", "hi", "ja", "zh"]) assert.equal(storyText({ place: "X", headline: "H", lang }).readIn, lang);
  assert.equal(storyText({ place: "Tokyo", headline: "東京で震度5の地震。", lang: "ja" }).text, "Tokyo. The humans wrote, in Japanese: 東京で震度5の地震。");
  assert.equal(languageName("es"), "Spanish");
  assert.equal(languageName("zh"), "Chinese");
  assert.equal(languageName("qqq"), "qqq");
  assert.equal(languageName(undefined), "another language");
});

test("spoken headlines: an outlet or section label is not read; the card keeps the shown title", () => {
  const kiev = buildScript({ stories, date: "2026-10-24", articles }).lines[5];
  assert.equal(kiev.text, "Kiev. The humans wrote: Musk says he was behind Starlink speed restriction.");
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
  assert.equal(storyText({ place: "X", headline: "WATCH | Firefighters battle a wildfire", lang: "en" }).text, "X. The humans wrote: Firefighters battle a wildfire.");
});

test("onScreenLine: a read story falls back to its on-screen form (the phonemiser failed)", () => {
  const lines = buildScript({ stories, date: "2026-10-24", articles }).lines;
  const paris = lines[2];
  const back = onScreenLine(paris);
  assert.equal(back.text, "Paris. The humans wrote this in Spanish. It is on your screen.");
  assert.deepEqual([back.story.spoken, back.story.said, "readIn" in back.story, "frame" in back.story], [false, "", false, false]);
  // The rest of the line and story are kept; the original is not changed.
  assert.deepEqual({ ...back, text: undefined, story: undefined }, { ...paris, text: undefined, story: undefined });
  assert.equal(back.story.headline, paris.story.headline);
  assert.equal(back.story.source, "eltiempo.com");
  assert.equal(paris.story.readIn, "es");
  // As buildScript writes an unread story, and English or on-screen lines pass through unchanged.
  const unread = buildScript({ stories: { stories: [{ ...stories.stories[1], story: { ...stories.stories[1].story, headlineLang: "el" } }] }, date: "2026-10-24", articles }).lines[1];
  assert.deepEqual(back.story, { ...unread.story, lang: "es" });
  for (const l of [lines[0], lines[1], lines[6], lines.at(-1)]) assert.equal(onScreenLine(l), l);
});

test("linePieces: a story read in its language splits at its frame, not at a colon in the headline", () => {
  const colon = entry(1, "Washington, District of Columbia, United States", { headline: "Trump: las elecciones en Brasil fueron 'amañadas'", headlineLang: "es", n: 321, o: 266, l: 25, i: 60 });
  const [, line] = buildScript({ stories: { stories: [colon] }, date: "2026-10-24", articles }).lines;
  assert.equal(line.text, "Washington. The humans wrote, in Spanish: Trump: las elecciones en Brasil fueron 'amañadas'.");
  assert.deepEqual(linePieces(line), {
    frame: "Washington. The humans wrote, in Spanish:",
    headline: "Trump: las elecciones en Brasil fueron 'amañadas'.",
    lang: "es",
    voice: "ef_dora",
    // PIECE_GAP of silence goes between the two pieces in the line's WAV.
  });
  assert.equal(PIECE_GAP, 0.25);
  // A line whose text does not start with its frame, or has no frame or no headline, is refused.
  assert.throws(() => linePieces({ ...line, text: "Washington. Trump: las elecciones." }), /does not start with/);
  assert.throws(() => linePieces({ ...line, text: line.story.frame }), /does not start with/);
  assert.throws(() => linePieces({ ...line, story: { ...line.story, frame: undefined } }), /no frame/);
  assert.throws(() => linePieces({ ...line, story: { ...line.story, readIn: "de" } }), /no voice for language "de"/);
});
