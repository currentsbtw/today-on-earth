import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ASIDES,
  buildScript,
  clipDate,
  closeText,
  FRAME_VARIANTS,
  FRAMES,
  fnv1a32,
  GRIM_SHARE,
  isGrim,
  languageName,
  numberWords,
  onScreenLine,
  openText,
  ordinalWords,
  pick,
  pickFrame,
  planShow,
  seedHash,
  SIGN_OFF,
  SIGN_ON,
  spokenDate,
  spokenHeadline,
  spokenCount,
  spokenSeconds,
  storyText,
  UNREAD,
} from "../src/script.mjs";
import { captionText, checkScript } from "../src/lib.mjs";
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

test("buildScript: open (sign-on and date), six stories, close for a known date (no count line)", () => {
  const script = buildScript({ stories, date: "2026-10-24", heat, generatedAt: "2026-10-25T00:20:00Z" });
  assert.deepEqual(
    { ...script, lines: undefined },
    { date: "2026-10-24", generatedAt: "2026-10-25T00:20:00Z", voice: { engine: "kokoro", name: "af_heart", speed: 1.1 }, gap: 0.4, lines: undefined },
  );
  // The sign-on picked by "2026-10-24:open", a space, the fixed date line.
  assert.deepEqual(script.lines[0], {
    id: "open",
    kind: "open",
    text: "Today on Earth. One planet, one rotation, one count. The humans supplied the rest. The humans call this day Saturday, the twenty-fourth of October.",
    seconds: 0,
  });
  assert.equal(script.lines[0].text, openText("2026-10-24"));
  // No `g` in this stories.json: every story is grim (the gate fails closed), so no aside. No count line (v2.1).
  assert.deepEqual(script.lines.map((l) => l.id), ["open", "story-1", "story-2", "story-3", "story-4", "story-5", "story-6", "close"]);
  assert.deepEqual(script.lines.at(-1), {
    id: "close",
    kind: "close",
    text: "This has been Today on Earth. We remain in orbit, where it is quiet.",
    seconds: 0,
  });
  assert.equal(script.lines.at(-1).text, closeText("2026-10-24", articles, 6));
  // The voice label is never spoken (it is on the lockup and in the caption).
  assert.ok(!script.lines.some((l) => /synthetic voice/i.test(l.text)));
  assert.equal(spokenSeconds(script), 0);
  // Fewer stories than six: all of them.
  const two = buildScript({ stories: { stories: stories.stories.slice(0, 2) }, date: "2026-10-24", heat });
  assert.deepEqual(two.lines.map((l) => l.kind), ["open", "story", "story", "close"]);
  assert.ok(!script.lines.concat(two.lines).some((l) => l.kind === "count" || /We counted every one|pointed nowhere/.test(l.text)));
});

test("buildScript: no stories is the open (sign-on and date) and the close, and passes checkScript", () => {
  const none = buildScript({ stories: { stories: [] }, date: "2026-10-24", heat });
  assert.deepEqual(none.lines.map((l) => [l.id, l.kind]), [["open", "open"], ["close", "close"]]);
  assert.equal(none.lines[0].text, "Today on Earth. One planet, one rotation, one count. The humans supplied the rest. The humans call this day Saturday, the twenty-fourth of October.");
  assert.equal(none.lines[1].text, closeText("2026-10-24", articles, 0));
  assert.ok(!none.lines.some((l) => /pointed nowhere/.test(l.text)));
  // Voiced (seconds filled), it is a valid script for the page.
  none.lines.forEach((l) => (l.seconds = 3));
  assert.equal(checkScript(none), none);
  // A missing stories list is the same.
  assert.deepEqual(buildScript({ stories: {}, date: "2026-10-24", heat }).lines.map((l) => l.kind), ["open", "close"]);
});

test("buildScript: without heat.json's total the script is not built", () => {
  for (const bad of [undefined, null, "242540", 2.5, -1, Number.NaN, 10_000_000]) {
    assert.throws(() => buildScript({ stories, date: "2026-10-24", heat: { ...heat, totals: { articles: bad } } }), /heat\.json totals\.articles/);
  }
  assert.throws(() => buildScript({ stories, date: "2026-10-24" }), /heat\.json totals\.articles is undefined/);
  // Also with no stories (a sign-off may speak the total).
  assert.throws(() => buildScript({ stories: { stories: [] }, date: "2026-10-24", heat: { ...heat, totals: {} } }), /heat\.json totals\.articles/);
  // heat.json's articlesNormal is no longer read: the same script with or without it.
  const at = (h) => JSON.stringify(buildScript({ stories, date: "2026-10-24", heat: h, generatedAt: "x" }));
  assert.equal(at({ ...heat, articlesNormal: 100_000, articlesNormalDays: 14 }), at(heat));
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
  const [, hebron, , atlanta, milan, kiev] = buildScript({ stories, date: "2026-10-24", heat }).lines;
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
    // No `g` in this stories.json: null, and grim (the gate fails closed), so the plain frame.
    g: null,
    grim: true,
    confirmed: "city",
    spoken: true,
    said: "Israeli PM pledges massive military operation after West Bank checkpoint attack",
    variant: "plain",
    frame: "Hebron. The humans wrote: ",
  });
  // A headline ending in ? or . keeps its own mark (and `said` carries it).
  assert.equal(atlanta.text, "Atlanta. The humans wrote: Six Flags says it will install seat belts?");
  assert.equal(atlanta.story.said, "Six Flags says it will install seat belts?");
  assert.equal(atlanta.story.place, "Atlanta");
  assert.equal(kiev.text, "Kiev. The humans wrote: Musk says he was behind Starlink speed restriction.");
  // An Italian headline is read in Italian (by if_sara), after the frame in English; an English story has no readIn.
  assert.equal(milan.text, "Milan. The humans wrote, in Italian: Cortei, da Milano a Roma.");
  assert.equal(milan.story.readIn, "it");
  assert.equal(milan.story.frame, "Milan. The humans wrote, in Italian: ");
  assert.ok(!("readIn" in hebron.story));
  assert.equal(hebron.text, hebron.story.frame + hebron.story.said + ".");
  assert.deepEqual(storyText({ place: "X", headline: "H", lang: "en" }), { text: "X. The humans wrote: H.", spoken: true, said: "H", frame: "X. The humans wrote: ", variant: "plain" });
  // Every story grim (no `g`): the plain frame for each, only the place and the headline vary.
  const frames = buildScript({ stories, date: "2026-10-24", heat }).lines.filter((l) => l.story?.lang === "en").map((l) => l.text.slice(l.story.place.length, l.text.lastIndexOf(l.story.said)));
  assert.equal(frames.length, 3);
  assert.deepEqual([...new Set(frames)], [". The humans wrote: "]);
});

test("invisible characters: out of the spoken text and the script's headline", () => {
  const zw = entry(1, "London, United Kingdom", { headline: "​Chris Brown⁠ avoids jail time﻿, given suspended‎ sentence", n: 323, o: 282, l: 6, i: 30 });
  const [, london] = buildScript({ stories: { stories: [zw] }, date: "2026-10-24", heat }).lines;
  assert.equal(london.story.headline, "Chris Brown avoids jail time, given suspended sentence");
  assert.equal(london.story.said, london.story.headline);
  assert.equal(london.text, "London. The humans wrote: Chris Brown avoids jail time, given suspended sentence.");
  assert.ok(!/[​-‏⁠﻿]/u.test(london.text));
});

test("buildScript: a headline in a language with a Kokoro voice is read in it; any other is on screen", () => {
  const lines = buildScript({ stories, date: "2026-10-24", heat }).lines;
  const paris = lines[2];
  // Spanish: the frame (English voice), then the headline (ef_dora), one line as for English.
  assert.equal(paris.text, "Paris. The humans wrote, in Spanish: Francia vive nueva jornada de protestas.");
  assert.equal(paris.story.spoken, true);
  assert.equal(paris.story.readIn, "es");
  assert.equal(paris.story.frame, "Paris. The humans wrote, in Spanish: ");
  assert.equal(paris.story.said, "Francia vive nueva jornada de protestas");
  assert.equal(paris.story.headline, "Francia vive nueva jornada de protestas");
  assert.equal(paris.story.source, "eltiempo.com");
  // Greek has no Kokoro voice: on screen, unread, no readIn; its frame is the whole text (no headline follows).
  const madrid = lines[6];
  assert.equal(madrid.text, "Madrid. The humans wrote this in Greek. It is on your screen.");
  assert.deepEqual([madrid.story.spoken, madrid.story.said, "readIn" in madrid.story, madrid.story.frame, madrid.story.variant], [false, "", false, madrid.text, "unread"]);
  assert.ok(!madrid.text.includes("Ισπανία"));
  assert.ok(!lines.some((l) => l.story?.place === "Tehran"), "the seventh entry is not read");
  // German stays on screen (no Kokoro 1.0 voice).
  assert.deepEqual(storyText({ place: "Berlin", headline: "Proteste in ganz Frankreich gehen weiter", lang: "de" }), {
    text: "Berlin. The humans wrote this in German. It is on your screen.",
    spoken: false,
    said: "",
    frame: "Berlin. The humans wrote this in German. It is on your screen.",
    variant: "unread",
  });
  // A read Spanish headline loses its outlet label like an English one; `said` is what is read.
  assert.deepEqual(storyText({ place: "Bogotá", headline: "El Tiempo | Francia vive nueva jornada de protestas", lang: "es" }), {
    text: "Bogotá. The humans wrote, in Spanish: Francia vive nueva jornada de protestas.",
    spoken: true,
    said: "Francia vive nueva jornada de protestas",
    frame: "Bogotá. The humans wrote, in Spanish: ",
    variant: "plain",
    readIn: "es",
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
  const kiev = buildScript({ stories, date: "2026-10-24", heat }).lines[5];
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
  const lines = buildScript({ stories, date: "2026-10-24", heat }).lines;
  const paris = lines[2];
  const back = onScreenLine(paris);
  assert.equal(back.text, "Paris. The humans wrote this in Spanish. It is on your screen.");
  assert.deepEqual([back.story.spoken, back.story.said, "readIn" in back.story, back.story.frame, back.story.variant], [false, "", false, back.text, "unread"]);
  // The rest of the line and story are kept; the original is not changed.
  assert.deepEqual({ ...back, text: undefined, story: undefined }, { ...paris, text: undefined, story: undefined });
  assert.equal(back.story.headline, paris.story.headline);
  assert.equal(back.story.source, "eltiempo.com");
  assert.equal(paris.story.readIn, "es");
  // As buildScript writes an unread story, and English or on-screen lines pass through unchanged.
  const unread = buildScript({ stories: { stories: [{ ...stories.stories[1], story: { ...stories.stories[1].story, headlineLang: "el" } }] }, date: "2026-10-24", heat }).lines[1];
  assert.deepEqual(back.story, { ...unread.story, lang: "es", frame: back.text });
  // A non-plain two-voice frame falls back the same way.
  const outlets = { ...paris, text: "Paris. 241 of the humans' outlets covered this. One of them wrote, in Spanish: Francia vive nueva jornada de protestas.", story: { ...paris.story, variant: "outlets", frame: "Paris. 241 of the humans' outlets covered this. One of them wrote, in Spanish: " } };
  assert.equal(onScreenLine(outlets).text, back.text);
  assert.equal(onScreenLine(outlets).story.variant, "unread");
  for (const l of [lines[0], lines[1], lines[6], lines.at(-1)]) assert.equal(onScreenLine(l), l);
});

test("linePieces: a story read in its language splits at its frame, not at a colon in the headline", () => {
  const colon = entry(1, "Washington, District of Columbia, United States", { headline: "Trump: las elecciones en Brasil fueron 'amañadas'", headlineLang: "es", n: 321, o: 266, l: 25, i: 60 });
  const [, line] = buildScript({ stories: { stories: [colon] }, date: "2026-10-24", heat }).lines;
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

// ---- Show mode v2 (docs/VOICE.md "Proposed: show mode, v2" and "Implementation decisions") ----

/** `stories` with grim shares `gs` on the first entries, as stories.json carries it: `g` on the entry (undefined leaves it out). */
const withG = (gs, list = stories.stories) => ({ stories: list.map((e, x) => (gs[x] === undefined ? e : { ...e, g: gs[x] })) });
/** Six English stories with large counts (every frame's condition holds), grim shares `gs`. */
const sixEnglish = (gs) =>
  withG(gs, ["Lima, Peru", "Oslo, Norway", "Accra, Ghana", "Hanoi, Vietnam", "Quito, Ecuador", "Riga, Latvia"].map((name, x) => entry(x + 1, name, { headline: `Headline number ${x + 1} about a place`, n: 300, o: 200, l: 12, i: 40 })));
/** planShow's input for a stories.json body. */
const showInput = (body) => body.stories.map((e) => ({ place: e.cell.name.split(",")[0], lang: e.story.headlineLang, o: e.story.o, l: e.story.l, i: e.story.i, g: e.g }));
const storyLines = (script) => script.lines.filter((l) => l.kind === "story");

test("seedHash: fnv1a32, then the MurmurHash3 32-bit finaliser", () => {
  // Computed independently (BigInt arithmetic) from FNV-1a and fmix32.
  assert.equal(seedHash(""), 0xab3e7c0b);
  assert.equal(seedHash("a"), 0x1a80b1b3);
  assert.equal(seedHash("2026-10-24:open"), 0xbeca78b0);
  // The aside coins: over the 365 days of 2026 the two candidates' parities differ on a substantial share.
  let differ = 0;
  for (let d = 0; d < 365; d++) {
    const date = new Date(Date.UTC(2026, 0, 1) + d * 86_400_000).toISOString().slice(0, 10);
    if (seedHash(`${date}:aside:2`) % 2 !== seedHash(`${date}:aside:4`) % 2) differ++;
  }
  assert.ok(differ >= 0.25 * 365, `${differ} of 365 days differ`);
  // Each of the 7 hashed frame variants (plain is not hashed) is the first pick on at least one day in a 120-day window.
  const first = new Set();
  for (let d = 0; d < 120; d++) {
    const date = new Date(Date.UTC(2026, 0, 1) + d * 86_400_000).toISOString().slice(0, 10);
    first.add(pick(FRAME_VARIANTS, `${date}:story:1`).id);
  }
  assert.deepEqual([...first].sort(), FRAME_VARIANTS.map((f) => f.id).sort());
  assert.equal(FRAME_VARIANTS.length, 7);
  assert.ok(!FRAME_VARIANTS.some((f) => f.id === "plain"));
});

test("the quote frame (\"Next, {Place}\") is never on the first story", () => {
  const quote = FRAMES.find((f) => f.id === "quote");
  assert.deepEqual([quote.ok({ k: 1 }), quote.ok({ k: 2 }), quote.ok({ k: 6 })], [false, true, true]);
  for (let d = 0; d < 120; d++) {
    const date = new Date(Date.UTC(2026, 0, 1) + d * 86_400_000).toISOString().slice(0, 10);
    assert.notEqual(storyLines(buildScript({ stories: sixEnglish([0, 0, 0, 0, 0, 0]), date, heat }))[0].story.variant, "quote", date);
  }
});

test("fnv1a32: FNV-1a 32-bit over UTF-8 bytes, the published vectors", () => {
  assert.equal(fnv1a32(""), 0x811c9dc5);
  assert.equal(fnv1a32("a"), 0xe40c292c);
  assert.equal(fnv1a32("foobar"), 0xbf9cf968);
  // UTF-8 bytes, not UTF-16 code units: "é" is 0xc3 0xa9.
  assert.equal(fnv1a32("é"), Math.imul((Math.imul(0x811c9dc5 ^ 0xc3, 0x01000193) >>> 0) ^ 0xa9, 0x01000193) >>> 0);
  for (const s of ["", "a", "2026-10-24:open", "é漢"]) assert.ok(Number.isInteger(fnv1a32(s)) && fnv1a32(s) >= 0 && fnv1a32(s) < 2 ** 32);
});

test("pick: the hashed start, forward and wrapping, skipping used and failing items; throws when none fits", () => {
  const p = ["a", "b", "c"];
  // "s3" hashes (seedHash) to 2 mod 3, "s1" to 0.
  assert.equal(seedHash("s3") % 3, 2);
  assert.equal(seedHash("s1") % 3, 0);
  assert.equal(pick(p, "s3"), "c");
  assert.equal(pick(p, "s1"), "a");
  // Deterministic: the same seed, the same item.
  assert.equal(pick(p, "2026-10-24:story:1"), pick(p, "2026-10-24:story:1"));
  // Wraps from the end to the start.
  assert.equal(pick(p, "s3", new Set(["c"])), "a");
  assert.equal(pick(p, "s3", new Set(["c", "a"])), "b");
  // The condition is skipped over the same way; used items may be given by id.
  assert.equal(pick(p, "s3", new Set(), (x) => x !== "c"), "a");
  const objs = [{ id: "x" }, { id: "y" }];
  assert.equal(pick(objs, "s1", new Set(["x"])).id, pick(objs, "s1", new Set([objs[0]])).id);
  assert.throws(() => pick(p, "s3", new Set(p)), /nothing in the pool/);
  assert.throws(() => pick(p, "s3", new Set(), () => false), /nothing in the pool/);
  assert.throws(() => pick([], "s3"), /empty pool/);
  // The no-repeat walk over a show's frames: never the same non-plain variant twice.
  const used = new Set();
  const got = [1, 2, 3, 4, 5, 6, 7].map((k) => {
    const v = pick(FRAMES.slice(1), `2026-10-24:story:${k}`, used);
    used.add(v.id);
    return v.id;
  });
  assert.equal(new Set(got).size, 7);
});

test("the pools: the text of docs/VOICE.md, character for character", () => {
  const ph = { place: "{Place}", o: "{o}", l: "{l}", i: "{i}" };
  assert.deepEqual(FRAMES.map((f) => `${f.fn(ph)}{h}`), [
    "{Place}. The humans wrote: {h}",
    "{Place}. From the humans' press, unedited: {h}",
    "{Place}. Their words, not ours: {h}",
    "{Place}. {o} of the humans' outlets covered this. One of them wrote: {h}",
    "{Place}. Read in {l} languages. We will read it in one: {h}",
    "{Place}. Heard in {i} countries that are not this one. The headline: {h}",
    "Next, {Place}. The humans wrote, and we quote: {h}",
    "{Place}. We do not know what this means. The humans wrote: {h}",
  ]);
  assert.deepEqual(FRAMES.map((f) => f.id), ["plain", "unedited", "theirs", "outlets", "languages", "countries", "quote", "unknown"]);
  assert.deepEqual(UNREAD.map((u) => u.fn({ place: "{Place}", language: "{Language}" })), [
    "{Place}. The humans wrote this in {Language}. It is on your screen.",
    "{Place}. The humans wrote this in {Language}, which is one of theirs. It is on your screen.",
  ]);
  assert.deepEqual(UNREAD.map((u) => u.id), ["unread", "unread-theirs"]);
  assert.deepEqual(SIGN_ON.map((s) => s.text), [
    "This is Today on Earth, the only news about this planet made by anyone who does not live on it.",
    "Today on Earth. We are in orbit. The humans are below, writing.",
    "Good rotation. This is Today on Earth. We have counted the humans' news so that you do not have to.",
    "Today on Earth. One planet, one rotation, one count. The humans supplied the rest.",
    "You are watching Today on Earth, from a distance we consider safe.",
  ]);
  assert.deepEqual(SIGN_OFF.map((s) => s.fn({ N: "{N}" })), [
    "That was today on Earth. The humans will write again tomorrow. We will count again tomorrow. Neither of us can stop.",
    "That was today on Earth. We did not read the articles. We counted them. It was easier.",
    "This has been Today on Earth. We remain in orbit, where it is quiet.",
    "That was today on Earth. {N} articles, six headlines, one planet. We will be back when it turns.",
    "That was today on Earth. If the humans write something tomorrow, and they will, we will count it.",
  ]);
  assert.deepEqual(ASIDES.map((a) => a.fn({ N: "{N}", k: 4, most: { place: "{Place}", l: "{l}" } })), [
    "We pause to note that the humans wrote {N} articles today and we have read four headlines. The ratio is not in our favour.",
    "The humans' press covered {Place} in {l} languages. We work in one. We are doing our best.",
    "This has been the part of the programme where we read things. It is most of the programme.",
  ]);
  for (const p of [FRAMES, UNREAD, SIGN_ON, ASIDES, SIGN_OFF]) assert.ok(Object.isFrozen(p) && p.every(Object.isFrozen));
});

test("the grim gate: kill-or-wound share g >= 0.5 is grim and plain; below is not; a missing g fails closed", () => {
  assert.equal(GRIM_SHARE, 0.5);
  assert.deepEqual([0.5, 0.49, 0.25, 0.9, 0, undefined, null, Number.NaN, Infinity, "0.1"].map(isGrim), [true, false, false, true, false, true, true, true, true, true]);
  const s = storyLines(buildScript({ stories: sixEnglish([0.5, 0.49, 0.49, 0.25, 0.49, undefined]), date: "2026-10-24", heat }));
  assert.deepEqual(s.map((l) => [l.story.g, l.story.grim]), [[0.5, true], [0.49, false], [0.49, false], [0.25, false], [0.49, false], [null, true]]);
  // Grim stories take the plain frame.
  assert.equal(s[0].story.variant, "plain");
  assert.equal(s[5].story.variant, "plain");
  assert.equal(s[0].text, "Lima. The humans wrote: Headline number 1 about a place.");
  // `g` is read from the entry, never from entry.story.
  const inStory = { stories: sixEnglish([]).stories.map((e) => ({ ...e, story: { ...e.story, g: 0 } })) };
  assert.ok(storyLines(buildScript({ stories: inStory, date: "2026-10-24", heat })).every((l) => l.story.grim && l.story.g === null));
  // The unknown frame's condition fails on a grim story.
  assert.equal(FRAMES.find((f) => f.id === "unknown").ok({ grim: true }), false);
  // A grim unread story takes the fixed unread form.
  const greek = storyLines(buildScript({ stories: withG([0.5], [stories.stories[5]]), date: "2026-10-24", heat }))[0];
  assert.equal(greek.story.variant, "unread");
});

test("the plain floor: at least two plain stories; grim ones count; the rest forced by `${date}:plain:${j}`", () => {
  for (const date of ["2026-10-20", "2026-10-21", "2026-10-24", "2026-10-27", "2026-11-03"]) {
    // None grim: two forced.
    const none = planShow(showInput(sixEnglish([0, 0, 0, 0, 0, 0])), date);
    assert.equal(none.forced.length, 2, date);
    const first = [1, 2, 3, 4, 5, 6][seedHash(`${date}:plain:0`) % 6];
    assert.equal(none.forced[0].k, first, date);
    const rest = [1, 2, 3, 4, 5, 6].filter((k) => k !== first);
    assert.equal(none.forced[1].k, rest[seedHash(`${date}:plain:1`) % 5], date);
    const script = buildScript({ stories: sixEnglish([0, 0, 0, 0, 0, 0]), date, heat });
    const plain = storyLines(script).filter((l) => l.story.variant === "plain").map((l) => l.n);
    assert.ok(plain.length >= 2, date);
    for (const { k } of none.forced) assert.ok(plain.includes(k), date);
    // One grim: it counts, one forced.
    assert.equal(planShow(showInput(sixEnglish([0, 0, 0.5, 0, 0, 0])), date).forced.length, 1, date);
    // Two grim: none forced.
    const two = planShow(showInput(sixEnglish([0.6, 0, 0, 0, 0.6, 0])), date);
    // Under the gate (0.3 < 0.5): not grim, so the floor forces two.
    assert.equal(planShow(showInput(sixEnglish([0.3, 0, 0, 0, 0.3, 0])), date).forced.length, 2, date);
    assert.deepEqual([two.forced, two.plain.slice(0, 2)], [[], [1, 5]], date);
  }
});

test("story frames: conditions hold, no variant twice in a show (plain excepted), over many dates", () => {
  // Small counts on some stories: outlets needs o >= 10, languages l >= 3, countries i >= 5.
  const list = [
    entry(1, "Lima, Peru", { headline: "First headline here, long enough", n: 9, o: 9, l: 2, i: 4 }),
    entry(2, "Oslo, Norway", { headline: "Second headline here, long enough", n: 300, o: 200, l: 12, i: 40 }),
    entry(3, "Accra, Ghana", { headline: "Third headline here, long enough", n: 12, o: 10, l: 3, i: 5 }),
    entry(4, "Hanoi, Vietnam", { headline: "Fourth headline here, long enough", headlineLang: "fr", n: 300, o: 200, l: 12, i: 40 }),
    entry(5, "Quito, Ecuador", { headline: "Fifth headline here, long enough", n: 300, o: 200, l: 12, i: 40 }),
    entry(6, "Riga, Latvia", { headline: "Sixth headline here, long enough", n: 300, o: 200, l: 12, i: 40 }),
  ];
  const seen = new Set();
  for (let d = 0; d < 120; d++) {
    const date = new Date(Date.UTC(2026, 0, 1) + d * 86_400_000).toISOString().slice(0, 10);
    const s = storyLines(buildScript({ stories: withG([0, 0, 0, 0, 0, 0], list), date, heat }));
    const variants = s.map((l) => l.story.variant).filter((v) => v !== "plain");
    assert.equal(new Set(variants).size, variants.length, `${date}: ${variants}`);
    for (const l of s) {
      const { o, l: langs, i, variant, readIn } = l.story;
      seen.add(variant);
      if (variant === "outlets") assert.ok(o >= 10, date);
      if (variant === "languages") assert.ok(langs >= 3 && !readIn, date);
      if (variant === "countries") assert.ok(i >= 5, date);
      if (variant === "quote") assert.ok(l.n >= 2, date);
      assert.ok(l.text.startsWith(l.story.frame), date);
      assert.equal(l.text, l.story.frame + l.story.said + ".", date);
    }
    assert.ok(s.filter((l) => l.story.variant === "plain").length >= 2, date);
  }
  seen.delete("plain");
  assert.deepEqual([...seen].sort(), [...FRAME_VARIANTS.map((f) => f.id)].sort());
});

test("plain is not hashed: a non-grim story outside the floor is never plain while a variant is eligible", () => {
  for (let d = 0; d < 365; d++) {
    const date = new Date(Date.UTC(2026, 0, 1) + d * 86_400_000).toISOString().slice(0, 10);
    for (const gs of [[0, 0, 0, 0, 0, 0], [0, 0.5, 0, 0, 0, 0], [0.5, 0, 0, 0.5, 0, 0]]) {
      const plan = planShow(showInput(sixEnglish(gs)), date);
      const forced = new Set(plan.forced.map((x) => x.k));
      for (const st of plan.stories) {
        if (st.grim) assert.equal(st.variant.id, "plain", date);
        else if (forced.has(st.k)) assert.equal(st.variant.id, "plain", date);
        else assert.notEqual(st.variant.id, "plain", `${date} story ${st.k}`);
      }
      // Exactly the floor: grim stories plus the forced ones, never more.
      assert.equal(plan.stories.filter((x) => x.variant.id === "plain").length, Math.max(2, gs.filter((g) => g >= GRIM_SHARE).length), date);
    }
  }
  // When no variant is eligible (all used or failing), pickFrame falls back to plain instead of throwing.
  const s = { place: "X", o: 1, l: 1, i: 1, k: 1, grim: false };
  assert.equal(pickFrame(s, "2026-10-24:story:1", new Set(FRAME_VARIANTS.map((f) => f.id))).id, "plain");
  assert.equal(pickFrame({ ...s, grim: true }, "2026-10-24:story:1", new Set(["unedited", "theirs"])).id, "plain");
  assert.notEqual(pickFrame(s, "2026-10-24:story:1", new Set()).id, "plain");
});

test("two-voice frames: every variant takes ', in {Language}' before its colon; languages is skipped", () => {
  const s = { place: "Paris", headline: "Francia vive nueva jornada de protestas", lang: "es", o: 241, l: 24, i: 49, grim: false };
  const want = {
    plain: "Paris. The humans wrote, in Spanish: ",
    unedited: "Paris. From the humans' press, unedited, in Spanish: ",
    theirs: "Paris. Their words, not ours, in Spanish: ",
    outlets: "Paris. 241 of the humans' outlets covered this. One of them wrote, in Spanish: ",
    countries: "Paris. Heard in 49 countries that are not this one. The headline, in Spanish: ",
    quote: "Next, Paris. The humans wrote, and we quote, in Spanish: ",
    unknown: "Paris. We do not know what this means. The humans wrote, in Spanish: ",
  };
  for (const f of FRAMES) {
    if (f.id === "languages") {
      assert.equal(f.ok({ ...s, readIn: "es" }), false);
      assert.equal(f.ok({ ...s, readIn: undefined }), true);
      continue;
    }
    const t = storyText(s, f);
    assert.deepEqual([t.frame, t.variant, t.readIn, t.text], [want[f.id], f.id, "es", `${want[f.id]}Francia vive nueva jornada de protestas.`]);
    const line = { id: "story-1", kind: "story", text: t.text, story: { ...t } };
    assert.deepEqual(linePieces(line), { frame: want[f.id].trim(), headline: "Francia vive nueva jornada de protestas.", lang: "es", voice: "ef_dora" });
  }
  // An English story's frames carry no language.
  assert.equal(storyText({ ...s, lang: "en" }, FRAMES[3]).frame, "Paris. 241 of the humans' outlets covered this. One of them wrote: ");
});

test("asides: after story 2 and 4 on an even hash, never after a grim story, never first or last", () => {
  // 2026-10-24: both candidates hash even; 2026-10-23: both odd; 2026-10-21: only the second even.
  const coin = (date, k) => seedHash(`${date}:aside:${k}`) % 2;
  assert.deepEqual([coin("2026-10-24", 2), coin("2026-10-24", 4), coin("2026-10-23", 2), coin("2026-10-23", 4), coin("2026-10-21", 2), coin("2026-10-21", 4)], [0, 0, 1, 1, 1, 0]);
  const even = buildScript({ stories: sixEnglish([0, 0, 0, 0, 0, 0]), date: "2026-10-24", heat });
  assert.deepEqual(even.lines.map((l) => l.id), ["open", "story-1", "story-2", "aside-2", "story-3", "story-4", "aside-4", "story-5", "story-6", "close"]);
  const asides = even.lines.filter((l) => l.kind === "aside");
  assert.deepEqual(asides.map((a) => [a.after, a.seconds]), [[2, 0], [4, 0]]);
  // The text: picked by the same seed, no repeat; each one from the pool with its numbers filled in.
  const plan = planShow(showInput(sixEnglish([0, 0, 0, 0, 0, 0])), "2026-10-24");
  const ids = plan.asides.map((a) => a.variant.id);
  assert.equal(new Set(ids).size, 2);
  assert.equal(ids[0], pick(ASIDES, "2026-10-24:aside:2").id);
  const texts = {
    ratio: (k) => `We pause to note that the humans wrote two hundred and forty-three thousand articles today and we have read ${k === 2 ? "two" : "four"} headlines. The ratio is not in our favour.`,
    languages: () => "The humans' press covered Lima in 12 languages. We work in one. We are doing our best.",
    programme: () => "This has been the part of the programme where we read things. It is most of the programme.",
  };
  asides.forEach((a, x) => assert.equal(a.text, texts[ids[x]](a.after)));
  // Odd hashes: no aside; one even: one aside.
  assert.ok(!buildScript({ stories: sixEnglish([0, 0, 0, 0, 0, 0]), date: "2026-10-23", heat }).lines.some((l) => l.kind === "aside"));
  assert.deepEqual(buildScript({ stories: sixEnglish([0, 0, 0, 0, 0, 0]), date: "2026-10-21", heat }).lines.filter((l) => l.kind === "aside").map((l) => l.after), [4]);
  // Never after a grim story.
  const grim2 = buildScript({ stories: sixEnglish([0, 0.6, 0, 0, 0, 0]), date: "2026-10-24", heat });
  assert.deepEqual(grim2.lines.filter((l) => l.kind === "aside").map((l) => l.after), [4]);
  const grim4 = buildScript({ stories: sixEnglish([0, 0, 0, undefined, 0, 0]), date: "2026-10-24", heat });
  assert.deepEqual(grim4.lines.filter((l) => l.kind === "aside").map((l) => l.after), [2]);
  // Only when that many stories exist; with two stories the aside comes before the close, never last.
  const two = buildScript({ stories: { stories: sixEnglish([0, 0]).stories.slice(0, 2) }, date: "2026-10-24", heat });
  assert.deepEqual(two.lines.map((l) => l.kind), ["open", "story", "story", "aside", "close"]);
  const one = buildScript({ stories: { stories: sixEnglish([0]).stories.slice(0, 1) }, date: "2026-10-24", heat });
  assert.deepEqual(one.lines.map((l) => l.kind), ["open", "story", "close"]);
  // The languages aside needs a story with l >= 10 among those read.
  assert.equal(ASIDES.find((a) => a.id === "languages").ok({ most: { l: 9 } }), false);
  assert.equal(ASIDES.find((a) => a.id === "languages").ok({ most: { l: 10 } }), true);
  for (const s of [even, grim2, grim4, two]) {
    assert.equal(s.lines[0].kind, "open");
    assert.equal(s.lines.at(-1).kind, "close");
    s.lines.forEach((l, x) => {
      if (l.kind === "aside") assert.ok(s.lines[x - 1].kind === "story" && !s.lines[x - 1].story.grim);
    });
  }
});

test("sign-on and sign-off: by date; the six-headlines sign-off only with six stories", () => {
  assert.equal(openText("2026-10-29"), "This is Today on Earth, the only news about this planet made by anyone who does not live on it. The humans call this day Thursday, the twenty-ninth of October.");
  const turns = SIGN_OFF.find((s) => s.id === "turns");
  // A date whose close hashes to "turns": with six stories it is spoken, with five the walk moves on.
  let date;
  for (let d = 1; !date; d++) {
    const day = `2026-11-${String(d).padStart(2, "0")}`;
    if (pick(SIGN_OFF, `${day}:close`) === turns) date = day;
  }
  assert.equal(closeText(date, articles, 6), "That was today on Earth. Two hundred and forty-three thousand articles, six headlines, one planet. We will be back when it turns.");
  assert.equal(closeText(date, articles, 5), SIGN_OFF[(SIGN_OFF.indexOf(turns) + 1) % SIGN_OFF.length].fn({}));
});

test("determinism: the same inputs give a byte-identical script", () => {
  const input = () => ({ stories: withG([0.1, 0.5, 0.1, 0.1, 0.5, 0.1]), date: "2026-10-24", heat, generatedAt: "2026-10-25T00:20:00Z" });
  const a = JSON.stringify(buildScript(input()));
  const b = JSON.stringify(buildScript(input()));
  assert.equal(a, b);
  // Another date, another show.
  assert.notEqual(JSON.stringify(buildScript({ ...input(), date: "2026-10-25" })).replace(/2026-10-25/g, "2026-10-24"), a);
});

// ---- v2.1: the English read (docs/VOICE.md "v2.1", item 3) ----

test("en: a Spanish story with an English title is read in English; the credited original is kept; the caption credits en.source", () => {
  const en = { headline: "France sees a new day of protests | Reuters", source: "reuters.com", url: "https://www.reuters.com/x" };
  const withEn = { stories: stories.stories.map((e, x) => (x === 1 ? { ...e, en } : e)) };
  const script = buildScript({ stories: withEn, date: "2026-10-24", heat });
  const paris = script.lines[2];
  assert.equal(paris.text, "Paris. The humans wrote: France sees a new day of protests.");
  // English voice: no readIn, so speech.mjs reads the whole line with af_heart.
  assert.ok(!("readIn" in paris.story));
  assert.deepEqual(
    [paris.story.headline, paris.story.source, paris.story.lang, paris.story.url, paris.story.said, paris.story.spoken, paris.story.frame, paris.story.variant],
    ["France sees a new day of protests | Reuters", "reuters.com", "en", "https://www.reuters.com/x", "France sees a new day of protests", true, "Paris. The humans wrote: ", "plain"],
  );
  assert.deepEqual(paris.story.original, { headline: "Francia vive nueva jornada de protestas", source: "eltiempo.com", lang: "es", url: "https://www.wamc.org/x" });
  // The other stories are as without en; an English story has no original.
  const plain = buildScript({ stories, date: "2026-10-24", heat });
  assert.deepEqual(script.lines.filter((l) => l.id !== "story-2"), plain.lines.filter((l) => l.id !== "story-2"));
  assert.ok(!("original" in script.lines[1].story));
  // onScreenLine leaves it alone (nothing to fall back from).
  assert.equal(onScreenLine(paris), paris);
  // The caption: the English line as spoken, credited to en.source.
  script.lines.forEach((l) => (l.seconds = 1));
  const caption = captionText({ date: "2026-10-24" }, { script }).split("\n");
  const at = caption.indexOf(paris.text);
  assert.ok(at > 0);
  assert.equal(caption[at + 1], "Headline from reuters.com");
  assert.ok(!caption.includes("Headline from eltiempo.com"));
  // A non-grim en story may take any variant, the languages frame included (no readIn).
  const open = buildScript({ stories: withG([0, 0, 0, 0, 0, 0], withEn.stories), date: "2026-10-24", heat }).lines.find((l) => l.id === "story-2");
  assert.ok(!("readIn" in open.story));
  assert.equal(open.story.lang, "en");
  assert.equal(open.text, open.story.frame + open.story.said + ".");
  assert.ok(!/, in Spanish/.test(open.text));
});

test("en: absent keeps the two-voice line; an unread language with en is read in English; a malformed en is ignored", () => {
  const paris = buildScript({ stories, date: "2026-10-24", heat }).lines[2];
  assert.equal(paris.text, "Paris. The humans wrote, in Spanish: Francia vive nueva jornada de protestas.");
  assert.equal(paris.story.readIn, "es");
  assert.equal(paris.story.source, "eltiempo.com");
  assert.ok(!("original" in paris.story));
  // Greek (no voice) with en: read in English instead of the on-screen form.
  const greek = { ...stories.stories[5], en: { headline: "Spain in the news", source: "ekathimerini.com", url: "https://www.ekathimerini.com/x" } };
  const [, madrid] = buildScript({ stories: { stories: [greek] }, date: "2026-10-24", heat }).lines;
  assert.equal(madrid.text, "Madrid. The humans wrote: Spain in the news.");
  assert.deepEqual([madrid.story.spoken, madrid.story.lang, madrid.story.source, madrid.story.original.lang, madrid.story.original.headline], [true, "en", "ekathimerini.com", "el", "Ισπανία"]);
  // An en without a usable headline is treated as absent.
  for (const bad of [null, "x", {}, { headline: "" }, { headline: "​ " }, { headline: 5, source: "a.com" }]) {
    const [, line] = buildScript({ stories: { stories: [{ ...stories.stories[1], en: bad }] }, date: "2026-10-24", heat }).lines;
    assert.equal(line.text, paris.text, JSON.stringify(bad));
    assert.ok(!("original" in line.story));
  }
  // en with no source or url: credited as null (the caption says "an outlet").
  const [, bare] = buildScript({ stories: { stories: [{ ...stories.stories[1], en: { headline: "France sees a new day of protests" } }] }, date: "2026-10-24", heat }).lines;
  assert.deepEqual([bare.story.source, bare.story.url, bare.story.original.source], [null, null, "eltiempo.com"]);
});
