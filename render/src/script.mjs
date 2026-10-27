// The newscast's script (clip v4, docs/PLAN.md "Clip v4: the newscast", build contract item 1):
// fixed sentences over the live snapshot, nothing written by us or an AI. Pure, so it can be
// unit-tested; the renderer synthesises each line (speech.mjs), fills `seconds` and hands the
// script to clip.html, and writes it as script.json beside the clip.
//
// The lines are the Observer's (docs/VOICE.md "The newscast"): the frame is its voice, the
// headline the outlet's words, and nothing in any line says anything about a story.
//
//   open   "Today on Earth. The humans call this day {Weekday}, the {ordinal} of {month}. Six
//          places their press pointed at. We counted."  (the number of stories read, in words;
//          one: "One place their press pointed at. We counted."; none: "... {month}. Their press
//          pointed nowhere we could place.")
//   story  "{Place}. The humans wrote: {headline}."  (the headline as spoken, spokenHeadline;
//          the counts are on the card's ledger row, not spoken; the frame is the same for every
//          story). A headline in a language Kokoro has a voice for (VOICE_FOR_LANG in
//          speech.mjs: es fr hi it ja pt zh) is "{Place}. The humans wrote, in {Language}:
//          {headline}.", the frame read by the English voice and the headline by that
//          language's; the story carries `readIn: '<lang>'` (v4.2) and `frame`, the English
//          piece exactly as it starts the text (speech.mjs linePieces splits there).
//          For any other language: "{Place}. The humans wrote this in {Language}. It is on your
//          screen."
//   close  "That was today on Earth. {N} articles in one rotation. We did not read them. We
//          counted them. We will count again tomorrow."  ({N}: heat.json totals.articles in
//          words, rounded to the nearest thousand from 1,000 up, spokenCount)
//
// The outlet is never spoken (its name on screen and in the caption is the credit), nor the
// address or the voice label: both stand on the close's lockup, and the label is the caption
// transcript's last line (lib.mjs VOICE_NOTE), not a spoken line.
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

/** The closing line for a snapshot of `articles` articles (heat.json totals.articles). */
export function closeText(articles) {
  return `That was today on Earth. ${spokenCount(articles)} articles in one rotation. We did not read them. We counted them. We will count again tomorrow.`;
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

const NUMBER_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];

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

/** The opening line's text for `stories` stories read ("Six places", "One place"; none: "Their press pointed nowhere we could place."). */
export function openText(day, stories) {
  if (!Number.isInteger(stories) || stories < 0 || stories >= NUMBER_WORDS.length) throw new Error(`story count ${stories}`);
  const places =
    stories === 0
      ? "Their press pointed nowhere we could place."
      : `${NUMBER_WORDS[stories]} ${stories === 1 ? "place" : "places"} their press pointed at. We counted.`;
  return `Today on Earth. The humans call this day ${spokenDate(day)}. ${places}`;
}

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

/** The unread story line: "{Place}. The humans wrote this in {Language}. It is on your screen." */
const unreadText = (place, lang) => visible(`${place}. The humans wrote this in ${languageName(lang)}. It is on your screen.`);

/**
 * A story line's text, whether its headline is spoken, `said`, the headline exactly as the text
 * carries it (after spokenHeadline, before the added full stop; "" when not read), and for a
 * headline read in another language `readIn`, its language code, and `frame`, the English
 * piece the text starts with ("Paris. The humans wrote, in Spanish: "), after which the
 * headline is read by the language's voice. The frame is the same for every story. Invisible
 * characters are removed from all of it.
 */
export function storyText({ place, headline, lang }) {
  const spoken = readable(lang);
  if (!spoken) return { text: unreadText(place, lang), spoken, said: "" };
  const said = spokenHeadline(visible(headline));
  if (lang === "en") return { text: visible(`${place}. The humans wrote: ${sentence(said)}`), spoken, said };
  const frame = visible(`${place}. The humans wrote, in ${languageName(lang)}: `);
  return { text: `${frame}${sentence(said)}`, spoken, said, readIn: lang, frame };
}

/**
 * A story line whose headline was to be read in another language, in its "on screen" form
 * instead: "{Place}. The humans wrote this in {Language}. It is on your screen.", spoken false,
 * said "", no readIn or frame (the renderer's fallback when the phonemiser cannot give its
 * phonemes). A new line; any other line is returned unchanged.
 * @param {any} line
 */
export function onScreenLine(line) {
  if (line?.kind !== "story" || !line.story?.readIn) return line;
  const { readIn, frame, ...story } = line.story;
  return { ...line, text: unreadText(story.place, story.lang ?? readIn), story: { ...story, spoken: false, said: "" } };
}

/**
 * The newscast script from the live stories.json body: the opening, the first STORY_COUNT
 * stories (fewer if fewer), the close. `seconds` are 0 until synthesised. `articles` is the
 * snapshot's total (heat.json totals.articles), spoken in the close; without it (not an
 * integer in 0..9,999,999) this throws, as for a malformed stories.json: the close is not
 * shipped without its number.
 * @param {{ stories: any, date: string, articles: number, generatedAt?: string }} p
 */
export function buildScript({ stories, date, articles, generatedAt = new Date().toISOString() }) {
  if (!Number.isInteger(articles) || articles < 0 || articles > 9_999_999) throw new Error(`heat.json totals.articles is ${JSON.stringify(articles)}; the close needs it`);
  const entries = Array.isArray(stories?.stories) ? stories.stories.slice(0, STORY_COUNT) : [];
  const lines = [{ id: "open", kind: "open", text: openText(date, entries.length), seconds: 0 }];
  entries.forEach((e, k) => {
    const { cell, story } = e ?? {};
    if (!cell?.id || !cell?.name || !story?.headline) throw new Error(`stories.json entry ${k + 1} has no cell or headline`);
    for (const f of ["n", "o", "l", "i"]) {
      if (!Number.isFinite(story[f])) throw new Error(`stories.json entry ${k + 1} story.${f} is ${JSON.stringify(story[f])}`);
    }
    const place = shortPlace(cell.name);
    const { text, spoken, said, readIn, frame } = storyText({ place, headline: story.headline, lang: story.headlineLang });
    lines.push({
      id: `story-${k + 1}`,
      kind: "story",
      text,
      seconds: 0,
      n: k + 1,
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
        confirmed: e.confirmed ?? null,
        spoken,
        said,
        ...(readIn ? { readIn, frame } : {}),
      },
    });
  });
  lines.push({ id: "close", kind: "close", text: closeText(articles), seconds: 0 });
  return { date, generatedAt, voice: { ...VOICE }, gap: LINE_GAP, lines };
}

/** Seconds of speech in a script (the lines' own durations, no gaps). */
export const spokenSeconds = (script) => script.lines.reduce((s, l) => s + l.seconds, 0);
