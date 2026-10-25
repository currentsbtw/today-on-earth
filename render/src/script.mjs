// The newscast's script (clip v4, docs/PLAN.md "Clip v4: the newscast", build contract item 1):
// fixed sentences over the live snapshot, nothing written by us or an AI. Pure, so it can be
// unit-tested; the renderer synthesises each line (speech.mjs), fills `seconds` and hands the
// script to clip.html, and writes it as script.json beside the clip.
//
//   open   "Today on Earth, {weekday} the {ordinal} of {month}. {articles} articles from
//          {outlets} outlets in {countries} countries. Here is where the world's press pointed."
//   story  "{Place}. {n} articles from {o} outlets in {l} languages. {headline}."  (the
//          languages clause only when l >= 2), or for a headline not in English:
//          "{Place}. {n} articles from {o} outlets. A headline in {Language}, on screen."
//   close  "That was today on Earth. The full broadcast at currents B T W dot github dot I O
//          slash today on earth. Read by a synthetic voice from the outlets' own headlines."
//
// The outlet is never spoken (its name on screen and in the caption is the credit).

/** Stories read per clip: the first entries of stories.json. */
export const STORY_COUNT = 6;
/** Seconds of silence between lines (the page lays the lines out with it). */
export const LINE_GAP = 0.4;
export const VOICE = Object.freeze({ engine: "kokoro", name: "af_heart" });

export const CLOSE_TEXT =
  "That was today on Earth. The full broadcast at currents B T W dot github dot I O slash today on earth. Read by a synthetic voice from the outlets' own headlines.";

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

/** Digits with thousands separators: 242540 -> "242,540". */
export const count = (v) => Math.round(v).toLocaleString("en-US");

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

/** "2026-10-24" -> "Saturday the twenty-fourth of October" (UTC). */
export function spokenDate(day) {
  if (typeof day !== "string" || !/^\d{4}-\d\d-\d\d$/.test(day)) throw new Error(`date ${JSON.stringify(day)}`);
  const d = new Date(`${day}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} the ${ordinalWords(d.getUTCDate())} of ${MONTHS[d.getUTCMonth()]}`;
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

/** The place as spoken: the cell name up to the first comma ("Milan, Lombardia, Italy" -> "Milan"). */
export const shortPlace = (name) => String(name ?? "").split(",")[0].trim();

/** End a sentence with a full stop unless it already ends with one (or ! ? …). */
const sentence = (s) => {
  const t = s.trim();
  return /[.!?…]["'”’)]*$/.test(t) ? t : `${t}.`;
};

/** The opening line's text. */
export function openText(day, totals) {
  return `Today on Earth, ${spokenDate(day)}. ${count(totals.articles)} articles from ${count(totals.outlets)} outlets in ${count(totals.countries)} countries. Here is where the world's press pointed.`;
}

/** A story line's text and whether its headline is spoken (English only in v4.0). */
export function storyText({ place, n, o, l, headline, lang }) {
  const spoken = lang === "en";
  const counts = `${count(n)} articles from ${count(o)} outlets`;
  if (!spoken) return { text: `${place}. ${counts}. A headline in ${languageName(lang)}, on screen.`, spoken };
  return { text: `${place}. ${counts}${l >= 2 ? ` in ${count(l)} languages` : ""}. ${sentence(headline)}`, spoken };
}

/**
 * The newscast script from the live stories.json and heat.json bodies: the opening, the first
 * STORY_COUNT stories (fewer if fewer), the close. `seconds` are 0 until synthesised.
 * @param {{ stories: any, heat: any, date: string, generatedAt?: string }} p
 */
export function buildScript({ stories, heat, date, generatedAt = new Date().toISOString() }) {
  const totals = heat?.totals;
  for (const k of ["articles", "outlets", "countries"]) {
    if (!Number.isFinite(totals?.[k])) throw new Error(`heat.json totals.${k} is ${JSON.stringify(totals?.[k])}`);
  }
  const entries = Array.isArray(stories?.stories) ? stories.stories.slice(0, STORY_COUNT) : [];
  const lines = [{ id: "open", kind: "open", text: openText(date, totals), seconds: 0 }];
  entries.forEach((e, k) => {
    const { cell, story } = e ?? {};
    if (!cell?.id || !cell?.name || !story?.headline) throw new Error(`stories.json entry ${k + 1} has no cell or headline`);
    for (const f of ["n", "o", "l", "i"]) {
      if (!Number.isFinite(story[f])) throw new Error(`stories.json entry ${k + 1} story.${f} is ${JSON.stringify(story[f])}`);
    }
    const place = shortPlace(cell.name);
    const { text, spoken } = storyText({ place, n: story.n, o: story.o, l: story.l, headline: story.headline, lang: story.headlineLang });
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
        headline: story.headline,
        source: story.headlineSource ?? null,
        lang: story.headlineLang ?? null,
        url: story.headlineUrl ?? null,
        n: story.n,
        o: story.o,
        l: story.l,
        i: story.i,
        confirmed: e.confirmed ?? null,
        spoken,
      },
    });
  });
  lines.push({ id: "close", kind: "close", text: CLOSE_TEXT, seconds: 0 });
  return { date, generatedAt, voice: { ...VOICE }, gap: LINE_GAP, lines };
}

/** Seconds of speech in a script (the lines' own durations, no gaps). */
export const spokenSeconds = (script) => script.lines.reduce((s, l) => s + l.seconds, 0);
