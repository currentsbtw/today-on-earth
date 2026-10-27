// The newscast's script (clip v4, docs/PLAN.md "Clip v4: the newscast", build contract item 1):
// fixed sentences over the live snapshot, nothing written by us or an AI. Pure, so it can be
// unit-tested; the renderer synthesises each line (speech.mjs), fills `seconds` and hands the
// script to clip.html, and writes it as script.json beside the clip.
//
//   open   "Today on Earth. {Weekday}, the {ordinal} of {month}. Six places the world's press
//          pointed at."  (the number of stories read, in words)
//   story  "{Place}. {headline}."  (the headline as spoken, spokenHeadline; the counts are on
//          the card's ledger row, not spoken), or for a headline not in English:
//          "{Place}. The headline is in {Language}, on screen."
//   close  "That was today on Earth. Every place, every outlet, every day. Find us on GitHub."
//
// The outlet is never spoken (its name on screen and in the caption is the credit), nor the
// address or the voice label: both stand on the close's lockup, and the label is the caption
// transcript's last line (lib.mjs VOICE_NOTE), not a spoken line.
import { VOICE_SPEED } from "./speech.mjs";

/** Stories read per clip: the first entries of stories.json. */
export const STORY_COUNT = 6;
/** Seconds of silence between lines (the page lays the lines out with it). */
export const LINE_GAP = 0.4;
export const VOICE = Object.freeze({ engine: "kokoro", name: "af_heart", speed: VOICE_SPEED });

export const CLOSE_TEXT =
  "That was today on Earth. Every place, every outlet, every day. Find us on GitHub.";

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

/** End a sentence with a full stop unless it already ends with one (or ! ? …). */
const sentence = (s) => {
  const t = s.trim();
  return /[.!?…]["'”’)]*$/.test(t) ? t : `${t}.`;
};

/** The opening line's text for `stories` stories read ("Six places", "One place"; none: no third sentence). */
export function openText(day, stories) {
  if (!Number.isInteger(stories) || stories < 0 || stories >= NUMBER_WORDS.length) throw new Error(`story count ${stories}`);
  const places = stories === 0 ? "" : ` ${NUMBER_WORDS[stories]} ${stories === 1 ? "place" : "places"} the world's press pointed at.`;
  return `Today on Earth. ${spokenDate(day)}.${places}`;
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

/**
 * A story line's text, whether its headline is spoken (English only in v4.0) and `said`, the
 * headline exactly as the text carries it (after spokenHeadline, before the added full stop;
 * "" when not read). Invisible characters are removed from all of it.
 */
export function storyText({ place, headline, lang }) {
  const spoken = lang === "en";
  if (!spoken) return { text: visible(`${place}. The headline is in ${languageName(lang)}, on screen.`), spoken, said: "" };
  const said = spokenHeadline(visible(headline));
  return { text: visible(`${place}. ${sentence(said)}`), spoken, said };
}

/**
 * The newscast script from the live stories.json body: the opening, the first STORY_COUNT
 * stories (fewer if fewer), the close. `seconds` are 0 until synthesised.
 * @param {{ stories: any, date: string, generatedAt?: string }} p
 */
export function buildScript({ stories, date, generatedAt = new Date().toISOString() }) {
  const entries = Array.isArray(stories?.stories) ? stories.stories.slice(0, STORY_COUNT) : [];
  const lines = [{ id: "open", kind: "open", text: openText(date, entries.length), seconds: 0 }];
  entries.forEach((e, k) => {
    const { cell, story } = e ?? {};
    if (!cell?.id || !cell?.name || !story?.headline) throw new Error(`stories.json entry ${k + 1} has no cell or headline`);
    for (const f of ["n", "o", "l", "i"]) {
      if (!Number.isFinite(story[f])) throw new Error(`stories.json entry ${k + 1} story.${f} is ${JSON.stringify(story[f])}`);
    }
    const place = shortPlace(cell.name);
    const { text, spoken, said } = storyText({ place, headline: story.headline, lang: story.headlineLang });
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
      },
    });
  });
  lines.push({ id: "close", kind: "close", text: CLOSE_TEXT, seconds: 0 });
  return { date, generatedAt, voice: { ...VOICE }, gap: LINE_GAP, lines };
}

/** Seconds of speech in a script (the lines' own durations, no gaps). */
export const spokenSeconds = (script) => script.lines.reduce((s, l) => s + l.seconds, 0);
