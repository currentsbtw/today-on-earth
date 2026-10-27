// The newscast's script, show mode v2 (docs/VOICE.md "Proposed: show mode, v2" for the pools,
// word for word, and "Implementation decisions (2026-10-27)" for the mechanism). Fixed sentences
// over the live snapshot, nothing written by us or an AI. Pure, so it can be unit-tested; the
// renderer synthesises each line (speech.mjs), fills `seconds`, hands the script to clip.html and
// writes it as script.json beside the clip.
//
// The one rule: a line's words never depend on a story's content. Every choice below is made by
// a rule that reads only the clip date, the line's position and the numbers the script already
// holds (counts, the grim share `g`), never the headline. Every pool line stands beside any
// headline.
//
// Lines, in order:
//   open   a sign-on (SIGN_ON, by `${date}:open`), a space, "The humans call this day {Weekday},
//          the {ordinal} of {month}."
//   count  always second: COUNT by band, heat.json totals.articles against articlesNormal (the
//          median daily total): loud above 1.15x, quiet below 0.85x, else ordinary; no-history
//          when articlesNormal is null or absent (or articlesNormalDays < 7). {N} is spokenCount.
//          No stories: "Their press pointed nowhere we could place." (v1's empty form). The
//          no-history line says "six headlines"; with 1 to 5 stories the number and its noun
//          agree with the stories read ("We read two headlines. Here they are."; one: "We read
//          one headline. Here it is.").
//   story  the first STORY_COUNT stories. `frame` + the headline as spoken (spokenHeadline, a full
//          stop added when it has no closing mark). The frame by:
//            grim (the entry's g >= GRIM_SHARE, or g missing: the gate fails closed) -> plain;
//              (g is on the stories.json entry, { rank, cell, story, confirmed, g }, not in story);
//            plain floor: at least two plain stories per show (grim ones count); if fewer,
//              `pick` over the remaining readable positions by `${date}:plain:${j}` (j from 0);
//            otherwise FRAME_VARIANTS (every frame but plain) by `${date}:story:${k}` (k from 1),
//              walking forward to the first unused variant whose condition holds (outlets
//              o >= 10, languages l >= 3, countries i >= 5, quote never on the first story
//              (k >= 2), unknown never on grim); plain only when none is eligible
//              (pickFrame). No variant repeats.
//          A headline in a language Kokoro has a voice for (VOICE_FOR_LANG in speech.mjs) is read
//          in two pieces split at `frame` (speech.mjs linePieces): the frame in English, the
//          headline in its language. Each variant takes the language as ", in {Language}" just
//          before the colon that ends the frame:
//            plain      "{Place}. The humans wrote, in {Language}: "
//            unedited   "{Place}. From the humans' press, unedited, in {Language}: "
//            theirs     "{Place}. Their words, not ours, in {Language}: "
//            outlets    "{Place}. {o} of the humans' outlets covered this. One of them wrote, in {Language}: "
//            countries  "{Place}. Heard in {i} countries that are not this one. The headline, in {Language}: "
//            quote      "Next, {Place}. The humans wrote, and we quote, in {Language}: "
//            unknown    "{Place}. We do not know what this means. The humans wrote, in {Language}: "
//            languages  not taken by a two-voice story ("We will read it in one" would be
//                       false: the frame is English, the headline another language).
//          A headline in any other language is not read: UNREAD by `${date}:story:${k}`; grim
//          ones take the fixed `unread`; `unread-theirs` at most once per show. Its `frame` is
//          the whole text (no headline follows).
//   aside  zero to two, candidates after story 2 and after story 4 (when that many stories exist
//          and that story is not grim), taken when seedHash(`${date}:aside:${k}`) % 2 === 0; the
//          text from ASIDES by the same seed, no repeat. `after: k`.
//   close  a sign-off (SIGN_OFF, by `${date}:close`); the "{N} articles, six headlines" one only
//          when six stories were read.
//
// The hash (seedHash) is FNV-1a, 32-bit, over the seed's UTF-8 bytes, followed by the MurmurHash3
// 32-bit finaliser; `pick` starts at seedHash % pool length.
// One snapshot always yields one script, byte for byte. The outlet is never spoken (its name on
// screen and in the caption is the credit), nor the address or the voice label (lib.mjs
// VOICE_NOTE).
import { VOICE_FOR_LANG, VOICE_SPEED } from "./speech.mjs";

/** Stories read per clip: the first entries of stories.json. */
export const STORY_COUNT = 6;
/** Seconds of silence between lines (the page lays the lines out with it). */
export const LINE_GAP = 0.4;
export const VOICE = Object.freeze({ engine: "kokoro", name: "af_heart", speed: VOICE_SPEED });

const UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** 1..999 in words, British style: 225 -> "two hundred and twenty-five", 40 -> "forty". */
function hundredsWords(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const rest = r < 20 ? UNITS[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? `-${UNITS[r % 10]}` : ""}`;
  if (!h) return rest;
  return r ? `${UNITS[h]} hundred and ${rest}` : `${UNITS[h]} hundred`;
}

/**
 * An integer from 0 to 99,999,999 in words, the first letter capitalised (it starts a
 * sentence): 225000 -> "Two hundred and twenty-five thousand", 1005 -> "One thousand and
 * five", 0 -> "No" (the close says "No articles in one rotation.", as the opening says "No").
 */
export function numberWords(n) {
  if (!Number.isInteger(n) || n < 0 || n > 99_999_999) throw new Error(`number ${n} outside 0..99,999,999`);
  if (n === 0) return "No";
  const groups = [
    [Math.floor(n / 1_000_000), " million"],
    [Math.floor(n / 1000) % 1000, " thousand"],
    [n % 1000, ""],
  ];
  const words = groups.filter(([g]) => g).map(([g, unit]) => `${hundredsWords(g)}${unit}`);
  // "One thousand and five": the British "and" before a last group under a hundred.
  if (n >= 1000 && n % 1000 > 0 && n % 1000 < 100) words.splice(-1, 1, `and ${words.at(-1)}`);
  const s = words.join(" ");
  return s[0].toUpperCase() + s.slice(1);
}

/**
 * A count of articles as the close speaks it: from 1,000 up rounded to the nearest thousand
 * (225169 -> "Two hundred and twenty-five thousand", 1500 -> "Two thousand"), below 1,000 the
 * exact number (999 -> "Nine hundred and ninety-nine"). 0 to 9,999,999.
 */
export function spokenCount(n) {
  if (!Number.isInteger(n) || n < 0 || n > 9_999_999) throw new Error(`article count ${JSON.stringify(n)} outside 0..9,999,999`);
  return numberWords(n < 1000 ? n : Math.round(n / 1000) * 1000);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth"];

/** 1..31 as an ordinal in words: 24 -> "twenty-fourth", 30 -> "thirtieth". */
export function ordinalWords(d) {
  if (!Number.isInteger(d) || d < 1 || d > 31) throw new Error(`day of month ${d}`);
  if (d <= 20) return ORDINALS[d - 1];
  if (d === 30) return "thirtieth";
  return `${d < 30 ? "twenty" : "thirty"}-${ORDINALS[(d % 10) - 1]}`;
}

/**
 * The UTC day the snapshot's window mostly covers (the middle of it), as v3's plan dates the
 * clip: a 00:15 UTC snapshot of the last 24 hours is the day before.
 * @param {{ generatedAt: string, windowHours?: number }} heat
 */
export function clipDate(heat) {
  const at = Date.parse(heat?.generatedAt);
  if (!Number.isFinite(at)) throw new Error(`heat.json generatedAt ${JSON.stringify(heat?.generatedAt)}`);
  const hours = Number.isFinite(heat.windowHours) ? heat.windowHours : 24;
  return new Date(at - (hours / 2) * 3_600_000).toISOString().slice(0, 10);
}

/** "2026-10-24" -> "Saturday, the twenty-fourth of October" (UTC). */
export function spokenDate(day) {
  if (typeof day !== "string" || !/^\d{4}-\d\d-\d\d$/.test(day)) throw new Error(`date ${JSON.stringify(day)}`);
  const d = new Date(`${day}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, the ${ordinalWords(d.getUTCDate())} of ${MONTHS[d.getUTCMonth()]}`;
}

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });

/** A language code's English name ("es" -> "Spanish"), the code itself when unknown. */
export function languageName(code) {
  if (typeof code !== "string" || !code) return "another language";
  try {
    const name = languageNames.of(code);
    return name && name.toLowerCase() !== code.toLowerCase() ? name : code;
  } catch {
    return code;
  }
}

/** Zero-width and other invisible characters: U+200B-U+200F, U+2060 (word joiner), U+FEFF (BOM). */
const INVISIBLE = /[​-‏⁠﻿]/gu;
/** `s` without invisible characters (the spoken text and the script's headline). */
export const visible = (s) => String(s ?? "").replace(INVISIBLE, "");

/** The place as spoken: the cell name up to the first comma ("Milan, Lombardia, Italy" -> "Milan"). */
export const shortPlace = (name) => String(name ?? "").split(",")[0].trim();

/** End a sentence with a full stop unless it already ends with one (or ! ? …, or the CJK and Devanagari marks). */
const sentence = (s) => {
  const t = s.trim();
  return /[.!?…。！？।]["'”’)」』]*$/u.test(t) ? t : `${t}.`;
};

/**
 * An outlet or section label at the start of a headline: 1 to 4 words, then " | ", " — ",
 * " – " or " :: " ("Arab News | ", "WATCH | ", "Opinion — "). HEADLINE_SUFFIX is the same form
 * at the end ("... | Arab News"), for a shown title the ingest's cleaning left one on.
 */
export const HEADLINE_PREFIX = /^(?:[^\s|—–]+ ){0,3}[^\s|—–]+ (?:\||—|–|::) /u;
export const HEADLINE_SUFFIX = / (?:\||—|–|::) (?:[^\s|—–]+ ){0,3}[^\s|—–]+$/u;
/** Never strip a label when what is left would be shorter than this (characters). */
const MIN_SPOKEN_HEADLINE = 20;

/** The headline as the voice reads it: a leading and a trailing label removed (the card shows it unchanged). */
export function spokenHeadline(headline) {
  let h = String(headline ?? "").trim();
  for (const label of [HEADLINE_PREFIX, HEADLINE_SUFFIX]) {
    const rest = h.replace(label, "").trim();
    if (rest !== h && rest.length >= MIN_SPOKEN_HEADLINE) h = rest;
  }
  return h;
}

/** Whether a headline in `lang` is read aloud: English, or a language with a voice in VOICE_FOR_LANG. */
export const readable = (lang) => lang === "en" || Object.hasOwn(VOICE_FOR_LANG, lang ?? "");

/** A story is grim for the show at this grim share or above (the "Ordinary life" slot's quarter). */
export const GRIM_SHARE = 0.25;
/** The count's bands against articlesNormal: loud above LOUD/100 x, quiet below QUIET/100 x (hundredths, compared exactly). */
export const LOUD = 115;
export const QUIET = 85;
/** articlesNormal is used only when it covers at least this many days. */
export const NORMAL_MIN_DAYS = 7;

/** Whether a story with grim share `g` is grim: g >= GRIM_SHARE; a missing or non-finite g fails closed (grim). */
export const isGrim = (g) => (typeof g === "number" && Number.isFinite(g) ? g >= GRIM_SHARE : true);

/** FNV-1a, 32-bit, over the UTF-8 bytes of `str`: "" -> 0x811c9dc5, "a" -> 0xe40c292c. */
export function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(String(str))) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h >>> 0;
}

/**
 * The hash every choice uses: fnv1a32 of the seed, then the MurmurHash3 32-bit finaliser (fmix32),
 * so every bit of the result depends on every byte (FNV-1a alone leaves the low bits, and so
 * `% 2` and `% 8`, decided by the low bits of the bytes only).
 */
export function seedHash(str) {
  let h = fnv1a32(str);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * The first item of `pool` from seedHash(seed) % pool.length forward (wrapping) that is not in
 * `used` (the item itself, or its `id`) and for which `ok(item)` holds. Throws when none is.
 * @template T
 * @param {readonly T[]} pool
 * @param {string} seed
 * @param {Set<unknown>} [used]
 * @param {(item: T) => boolean} [ok]
 * @returns {T}
 */
export function pick(pool, seed, used = new Set(), ok = () => true) {
  if (!pool.length) throw new Error(`pick: empty pool (seed ${seed})`);
  const start = seedHash(seed) % pool.length;
  for (let s = 0; s < pool.length; s++) {
    const item = pool[(start + s) % pool.length];
    const id = item !== null && typeof item === "object" ? /** @type {any} */ (item).id : undefined;
    if (!used.has(item) && (id === undefined || !used.has(id)) && ok(item)) return item;
  }
  throw new Error(`pick: nothing in the pool of ${pool.length} fits (seed ${seed})`);
}

const lowerFirst = (s) => s[0].toLowerCase() + s.slice(1);
const pool = (items) => Object.freeze(items.map((i) => Object.freeze(i)));

/** The sign-on, one per show by `${date}:open`. */
export const SIGN_ON = pool([
  { id: "only", text: "This is Today on Earth, the only news about this planet made by anyone who does not live on it." },
  { id: "orbit", text: "Today on Earth. We are in orbit. The humans are below, writing." },
  { id: "good-rotation", text: "Good rotation. This is Today on Earth. We have counted the humans' news so that you do not have to." },
  { id: "one-planet", text: "Today on Earth. One planet, one rotation, one count. The humans supplied the rest." },
  { id: "safe-distance", text: "You are watching Today on Earth, from a distance we consider safe." },
]);

/** The count line by band; `fn({ N, stories })`, N the spoken count, stories the number read. */
export const COUNT = pool([
  { id: "loud", fn: ({ N }) => `${N} articles. A loud rotation, even for them.` },
  { id: "quiet", fn: ({ N }) => `${N} articles. A quiet rotation. We checked the instrument. It is the humans.` },
  { id: "ordinary", fn: ({ N }) => `${N} articles. An ordinary rotation for the humans. We have no other kind.` },
  {
    id: "no-history",
    fn: ({ N, stories }) =>
      stories === STORY_COUNT
        ? `${N} articles. We counted every one. We read six headlines. Here they are.`
        : `${N} articles. We counted every one. We read ${numberWords(stories).toLowerCase()} ${stories === 1 ? "headline. Here it is." : "headlines. Here they are."}`,
  },
]);
/** The count line's text when no story was read (v1's empty opening). */
export const COUNT_NONE = "Their press pointed nowhere we could place.";

/** ", in {Language}" before a two-voice frame's colon, "" for an English one. */
const inLang = (s) => (s.language ? `, in ${s.language}` : "");

/**
 * Story frames, by `${date}:story:${k}`. `fn(s)` is the text before the headline (s: place, o, l,
 * i, language for a two-voice story); `ok(s)` the variant's condition (s also has k, the story's
 * position from 1, grim, readIn).
 */
export const FRAMES = pool([
  { id: "plain", fn: (s) => `${s.place}. The humans wrote${inLang(s)}: `, ok: () => true },
  { id: "unedited", fn: (s) => `${s.place}. From the humans' press, unedited${inLang(s)}: `, ok: () => true },
  { id: "theirs", fn: (s) => `${s.place}. Their words, not ours${inLang(s)}: `, ok: () => true },
  { id: "outlets", fn: (s) => `${s.place}. ${s.o} of the humans' outlets covered this. One of them wrote${inLang(s)}: `, ok: (s) => s.o >= 10 },
  { id: "languages", fn: (s) => `${s.place}. Read in ${s.l} languages. We will read it in one: `, ok: (s) => s.l >= 3 && !s.readIn },
  { id: "countries", fn: (s) => `${s.place}. Heard in ${s.i} countries that are not this one. The headline${inLang(s)}: `, ok: (s) => s.i >= 5 },
  { id: "quote", fn: (s) => `Next, ${s.place}. The humans wrote, and we quote${inLang(s)}: `, ok: (s) => s.k >= 2 },
  { id: "unknown", fn: (s) => `${s.place}. We do not know what this means. The humans wrote${inLang(s)}: `, ok: (s) => !s.grim },
]);
const PLAIN = FRAMES[0];
/** The hashed frame pool: every frame but `plain`, which is only for grim stories, the plain floor and the fallback. */
export const FRAME_VARIANTS = Object.freeze(FRAMES.slice(1));

/**
 * The frame for a non-grim read story `s` (place, o, l, i, k, grim, readIn) by `seed`: the first
 * unused FRAME_VARIANTS entry whose condition holds, or `plain` when none does (never throws).
 * @param {Set<unknown>} used
 */
export function pickFrame(s, seed, used) {
  try {
    return pick(FRAME_VARIANTS, seed, used, (f) => f.ok(s));
  } catch {
    return PLAIN;
  }
}

/** A story whose headline is not read (no voice for its language): the whole line. `unread` may repeat. */
export const UNREAD = pool([
  { id: "unread", fn: (s) => `${s.place}. The humans wrote this in ${s.language}. It is on your screen.` },
  { id: "unread-theirs", fn: (s) => `${s.place}. The humans wrote this in ${s.language}, which is one of theirs. It is on your screen.` },
]);

/**
 * Asides, by `${date}:aside:${k}`: `fn(a)` with a.N (the spoken count, lower-case), a.k (stories
 * read so far), a.most (the story with the most languages among those read: place, l); `ok(a)`.
 */
export const ASIDES = pool([
  {
    id: "ratio",
    fn: (a) => `We pause to note that the humans wrote ${a.N} articles today and we have read ${numberWords(a.k).toLowerCase()} headlines. The ratio is not in our favour.`,
    ok: () => true,
  },
  { id: "languages", fn: (a) => `The humans' press covered ${a.most.place} in ${a.most.l} languages. We work in one. We are doing our best.`, ok: (a) => (a.most?.l ?? 0) >= 10 },
  { id: "programme", fn: () => "This has been the part of the programme where we read things. It is most of the programme.", ok: () => true },
]);

/** The sign-off, one per show by `${date}:close`; `fn({ N, stories })`. */
export const SIGN_OFF = pool([
  { id: "stop", fn: () => "That was today on Earth. The humans will write again tomorrow. We will count again tomorrow. Neither of us can stop.", ok: () => true },
  { id: "easier", fn: () => "That was today on Earth. We did not read the articles. We counted them. It was easier.", ok: () => true },
  { id: "quiet-orbit", fn: () => "This has been Today on Earth. We remain in orbit, where it is quiet.", ok: () => true },
  { id: "turns", fn: ({ N }) => `That was today on Earth. ${N} articles, six headlines, one planet. We will be back when it turns.`, ok: ({ stories }) => stories === STORY_COUNT },
  { id: "tomorrow", fn: () => "That was today on Earth. If the humans write something tomorrow, and they will, we will count it.", ok: () => true },
]);

/** The opening line: the sign-on for `day`, then "The humans call this day {Weekday}, the {ordinal} of {month}." */
export function openText(day) {
  const date = spokenDate(day);
  return `${pick(SIGN_ON, `${day}:open`).text} The humans call this day ${date}.`;
}

/**
 * The count's band: "loud" (articles > 1.15 x normal), "quiet" (< 0.85 x), "ordinary", or
 * "no-history" when `normal` is not a positive number, or `days` is given and under
 * NORMAL_MIN_DAYS.
 */
export function countBand(articles, normal, days) {
  if (typeof normal !== "number" || !Number.isFinite(normal) || normal <= 0) return "no-history";
  if (days !== undefined && days !== null && !(Number.isFinite(days) && days >= NORMAL_MIN_DAYS)) return "no-history";
  if (articles * 100 > normal * LOUD) return "loud";
  if (articles * 100 < normal * QUIET) return "quiet";
  return "ordinary";
}

/** The count line's text: the band's line, or COUNT_NONE when no story was read. */
export function countText({ articles, normal, days, stories }) {
  if (stories === 0) return COUNT_NONE;
  const band = countBand(articles, normal, days);
  return COUNT.find((c) => c.id === band).fn({ N: spokenCount(articles), stories });
}

/** The closing line for `day`: a sign-off, the "{N} articles, six headlines" one only with six stories. */
export function closeText(day, articles, stories) {
  const s = { N: spokenCount(articles), stories };
  return pick(SIGN_OFF, `${day}:close`, new Set(), (v) => v.ok(s)).fn(s);
}

/**
 * A story line's text and fields with frame variant `variant` (a FRAMES or UNREAD entry; the
 * plain or the fixed unread one by default): `frame`, the exact text before the headline (an
 * unread story's whole text), `said` (the headline as the text carries it, before the added full
 * stop; "" when not read), `spoken`, `variant` (the id used) and `readIn` for a headline read in
 * another language. Invisible characters are removed from all of it. A FRAMES variant given for
 * an unread story becomes `unread`, an UNREAD one for a read story `plain`.
 * @param {{ place: string, headline: string, lang?: string, o?: number, l?: number, i?: number, grim?: boolean }} s
 * @param {any} [variant]
 */
export function storyText(s, variant) {
  const spoken = readable(s.lang);
  if (!spoken) {
    const v = UNREAD.includes(variant) ? variant : UNREAD[0];
    const text = visible(v.fn({ place: s.place, language: languageName(s.lang) }));
    return { text, spoken, said: "", frame: text, variant: v.id };
  }
  const v = FRAMES.includes(variant) ? variant : PLAIN;
  const said = spokenHeadline(visible(s.headline));
  const readIn = s.lang === "en" ? undefined : s.lang;
  const frame = visible(v.fn({ ...s, language: readIn ? languageName(readIn) : undefined }));
  return { text: `${frame}${sentence(said)}`, spoken, said, frame, variant: v.id, ...(readIn ? { readIn } : {}) };
}

/**
 * A story line whose headline was to be read in another language, in the fixed "on screen"
 * form instead: "{Place}. The humans wrote this in {Language}. It is on your screen.", spoken
 * false, said "", variant `unread`, frame the whole text, no readIn (the renderer's fallback
 * when the phonemiser cannot give its phonemes). A new line; any other line is returned unchanged.
 * @param {any} line
 */
export function onScreenLine(line) {
  if (line?.kind !== "story" || !line.story?.readIn) return line;
  const { readIn, ...story } = line.story;
  const text = visible(UNREAD[0].fn({ place: story.place, language: languageName(story.lang ?? readIn) }));
  return { ...line, text, story: { ...story, spoken: false, said: "", variant: UNREAD[0].id, frame: text } };
}

/**
 * The show's choices for `stories` (each { place, lang, o, l, i, g }) on `date`, without any
 * text: per story the variant and whether it is grim, the plain positions and the floor's forced
 * ones, the aside decisions, the story with the most languages. Pure; buildScript uses it, and
 * it is exported for tests and inspection.
 * @param {{ place: string, lang?: string|null, o: number, l: number, i: number, g?: number|null }[]} stories
 * @param {string} date
 */
export function planShow(stories, date) {
  const s = stories.map((e, x) => ({ ...e, k: x + 1, grim: isGrim(e.g), read: readable(e.lang), readIn: readable(e.lang) && e.lang !== "en" ? e.lang : undefined }));
  // The plain floor: grim read stories are plain; force more over the remaining read positions.
  const plain = new Set(s.filter((e) => e.read && e.grim).map((e) => e.k));
  const remaining = s.filter((e) => e.read && !e.grim).map((e) => e.k);
  const forced = [];
  for (let j = 0; plain.size < 2 && remaining.length; j++) {
    const k = pick(remaining, `${date}:plain:${j}`);
    remaining.splice(remaining.indexOf(k), 1);
    plain.add(k);
    forced.push({ j, k });
  }
  // Frames: no repeat within the show (`plain`, the fallback, and the fixed `unread` excepted).
  const used = new Set();
  const variants = s.map((e) => {
    const seed = `${date}:story:${e.k}`;
    let v;
    if (!e.read) v = e.grim ? UNREAD[0] : pick(UNREAD, seed, used);
    else if (plain.has(e.k)) v = PLAIN;
    else v = pickFrame(e, seed, used);
    if (v !== PLAIN && v !== UNREAD[0]) used.add(v.id);
    return v;
  });
  // Asides: after story 2 and story 4, when it exists and is not grim, on an even hash.
  // The story with the most languages among those read so far (never one the show has not reached).
  const mostUpTo = (k) => s.filter((e) => e.k <= k).reduce((m, e) => (!m || e.l > m.l ? e : m), null);
  const asides = [];
  const asideUsed = new Set();
  for (const k of [2, 4]) {
    const seed = `${date}:aside:${k}`;
    const hash = seedHash(seed);
    const most = mostUpTo(k);
    const d = { k, seed, hash, taken: false, most: most && { place: most.place, l: most.l } };
    if (s.length < k) d.why = `only ${s.length} stories`;
    else if (s[k - 1].grim) d.why = `story ${k} is grim`;
    else if (hash % 2 !== 0) d.why = "odd hash";
    else {
      const a = pick(ASIDES, seed, asideUsed, (v) => v.ok({ most }));
      asideUsed.add(a.id);
      Object.assign(d, { taken: true, variant: a });
    }
    asides.push(d);
  }
  return { stories: s.map((e, x) => ({ k: e.k, grim: e.grim, variant: variants[x] })), plain: [...plain].sort((a, b) => a - b), forced, asides };
}

/**
 * The newscast script from the live stories.json and heat.json bodies: open, count, the first
 * STORY_COUNT stories (fewer if fewer) with asides between, close. `seconds` are 0 until
 * synthesised. heat.totals.articles is spoken (count, some sign-offs and asides); without it (not
 * an integer in 0..9,999,999) this throws, as for a malformed stories.json. heat.articlesNormal
 * and heat.articlesNormalDays choose the count's band; missing or null is the no-history line.
 * @param {{ stories: any, heat: any, date: string, generatedAt?: string }} p
 */
export function buildScript({ stories, heat, date, generatedAt = new Date().toISOString() }) {
  const articles = heat?.totals?.articles;
  if (!Number.isInteger(articles) || articles < 0 || articles > 9_999_999) throw new Error(`heat.json totals.articles is ${JSON.stringify(articles)}; the script needs it`);
  const entries = Array.isArray(stories?.stories) ? stories.stories.slice(0, STORY_COUNT) : [];
  const read = entries.map((e, k) => {
    const { cell, story } = e ?? {};
    if (!cell?.id || !cell?.name || !story?.headline) throw new Error(`stories.json entry ${k + 1} has no cell or headline`);
    for (const f of ["n", "o", "l", "i"]) {
      if (!Number.isFinite(story[f])) throw new Error(`stories.json entry ${k + 1} story.${f} is ${JSON.stringify(story[f])}`);
    }
    // `g` is on the entry, beside cell and story (story stays the cell file's fields); absent on older files.
    const g = typeof e.g === "number" && Number.isFinite(e.g) ? e.g : null;
    return { e, cell, story, g, place: shortPlace(cell.name) };
  });
  const show = planShow(read.map((r) => ({ place: r.place, lang: r.story.headlineLang, o: r.story.o, l: r.story.l, i: r.story.i, g: r.g })), date);
  const N = spokenCount(articles);
  const lines = [
    { id: "open", kind: "open", text: openText(date), seconds: 0 },
    { id: "count", kind: "count", text: countText({ articles, normal: heat.articlesNormal, days: heat.articlesNormalDays, stories: entries.length }), seconds: 0 },
  ];
  read.forEach(({ e, cell, story, g, place }, x) => {
    const k = x + 1;
    const { grim, variant } = show.stories[x];
    const { text, spoken, said, frame, readIn } = storyText({ place, headline: story.headline, lang: story.headlineLang, o: story.o, l: story.l, i: story.i, grim }, variant);
    lines.push({
      id: `story-${k}`,
      kind: "story",
      text,
      seconds: 0,
      n: k,
      of: entries.length,
      story: {
        cell: cell.id,
        place,
        lat: cell.lat,
        lon: cell.lon,
        headline: visible(story.headline).trim(),
        source: story.headlineSource ?? null,
        lang: story.headlineLang ?? null,
        url: story.headlineUrl ?? null,
        n: story.n,
        o: story.o,
        l: story.l,
        i: story.i,
        g,
        grim,
        confirmed: e.confirmed ?? null,
        spoken,
        said,
        variant: variant.id,
        frame,
        ...(readIn ? { readIn } : {}),
      },
    });
    const aside = show.asides.find((a) => a.k === k && a.taken);
    if (aside) lines.push({ id: `aside-${k}`, kind: "aside", text: aside.variant.fn({ N: lowerFirst(N), k, most: aside.most }), seconds: 0, after: k });
  });
  lines.push({ id: "close", kind: "close", text: closeText(date, articles, entries.length), seconds: 0 });
  return { date, generatedAt, voice: { ...VOICE }, gap: LINE_GAP, lines };
}

/** Seconds of speech in a script (the lines' own durations, no gaps). */
export const spokenSeconds = (script) => script.lines.reduce((s, l) => s + l.seconds, 0);
