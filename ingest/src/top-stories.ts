import { MIN_STORY_U, slotCell, slotStory, tieBreak } from "./broadcast.ts";
import { placeNames, type PlaceNamesTable } from "./placenames-table.ts";
import { reprintKey } from "./reprints.ts";
import type { CellFile, HeatCell, HeatFile, Story, TopStoriesFile, TopStory } from "./types.ts";

/**
 * The day's largest stories around the world (docs/DATA-CONTRACT.md "Top stories"), for the
 * narrated clip: the stories with the most distinct outlets across every place, one per place,
 * one per event (headline reprint key) and at most two per country, so the reading moves
 * around the planet. Nothing here writes text: an entry carries an outlet's own headline and
 * the story's counts, shaped exactly as a broadcast slot's. Every threshold lives here and the
 * contract quotes them.
 *
 * A story is listed only when its own text confirms its place (added 2026-10-24): its headline
 * or one of its saved article titles (a compact story has none) names the cell's city, a region of the cell's name, its
 * country, or a metonym of the capital (CAPITAL_METONYMS). The clip reads these aloud naming
 * the place, so a story GDELT placed at a same-name town elsewhere must not be read there.
 * The city and region may also be named in a local language (Купянск, 重庆): the place-names
 * table (placenames-table.ts, from GeoNames) adds names by the cell's FeatureID `fid`.
 */

/** At most this many entries. The clip reads the first 6 to 8 it can voice; the rest is slack. */
export const TOP_STORIES_MAX = 12;

/** At most this many entries per country (the cell's `home`). */
export const TOP_STORIES_PER_COUNTRY = 2;

/**
 * Cells whose `home` is unknown ("") share one bucket, separate from every country, and take at
 * most this many entries in total: an unknown home may be any country, including one already
 * taken twice.
 */
export const TOP_STORIES_UNKNOWN_HOME_MAX = 1;

/** Why an entry is listed: the first level of the cell's name that its text matched. */
export type Confirmation = TopStory["confirmed"];

/** The levels in the order they are tried; an entry's `confirmed` is the first that matched. */
export const CONFIRMATION_LEVELS: readonly Confirmation[] = ["city", "region", "country", "metonym"];

/**
 * A city, region or country name of 5+ letters also matches followed by up to 3 more letters
 * (Berlin -> Berliner), or with its last letter replaced by 1 to 3 letters (Bratislava ->
 * Bratislave, Ukraine -> Ukrainian); never shortened (China does not match "chin").
 */
export const CONFIRM_PREFIX_MIN_LETTERS = 5;
export const CONFIRM_PREFIX_MAX_EXTRA = 3;

/**
 * Names that stand for a capital in a headline ("the Kremlin said"), keyed by the cell's `home`
 * and city (the first comma-separated part of its `name`) as "home|City". Published in
 * docs/DATA-CONTRACT.md "Top stories"; change both together. Matched as whole words after the
 * same folding as place names, never by prefix; a name written all in capitals (WHO, NYPD,
 * UNHCR) is matched in capitals only, so the word "who" in a headline does not count.
 */
export const CAPITAL_METONYMS: Readonly<Record<string, readonly string[]>> = {
  "US|Washington": ["White House", "Pentagon", "Capitol Hill", "Congress", "Supreme Court", "Oval Office"],
  "RU|Moscow": ["Kremlin"],
  "GB|London": ["Downing Street", "Westminster", "No 10", "Number 10", "Whitehall", "Scotland Yard"],
  "FR|Paris": ["Élysée", "Elysee", "Matignon"],
  "DE|Berlin": ["Bundestag", "Kanzleramt"],
  "BE|Brussels": ["European Commission", "EU Commission"],
  "CN|Beijing": ["Zhongnanhai"],
  "US|New York": ["Wall Street", "Broadway", "NYPD", "Fifth Avenue"],
  "US|Manhattan": ["Wall Street", "Broadway", "NYPD", "Fifth Avenue"],
  "VA|Vatican": ["Vatican", "Holy See"],
  "VA|Vatican City": ["Vatican", "Holy See"],
  "IT|Rome": ["Vatican", "Holy See"],
  "CH|Geneva": ["WHO", "UNHCR"],
};

const stripMarks = (s: string) => s.normalize("NFD").replace(/\p{M}+/gu, "");
/** Diacritics stripped (NFD, combining marks removed), then lower-cased: "Zürich" -> "zurich". */
export const foldText = (s: string) => stripMarks(s).toLowerCase();

/** Scripts written without spaces between words: a title containing one is matched by substring. */
const NO_SPACE_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRes = new Map<string, RegExp>();
/** Whole-word pattern of a folded name, with the prefix form when asked and the name has 5+ letters. */
function wordRe(name: string, prefix: boolean): RegExp {
  const key = `${prefix ? "p" : "w"}:${name}`;
  let re = wordRes.get(key);
  if (!re) {
    const letters = name.match(/\p{L}/gu)?.length ?? 0;
    const extra = `\\p{L}{1,${CONFIRM_PREFIX_MAX_EXTRA}}`;
    // The name, or (5+ letters ending in a letter) the name followed by up to 3 letters or the
    // name with its last letter replaced by 1 to 3 letters: Berliner, Bratislave, Milano.
    const body = prefix && letters >= CONFIRM_PREFIX_MIN_LETTERS && /\p{L}$/u.test(name)
      ? `(?:${escapeRe(name)}(?:${extra})?|${escapeRe(name.slice(0, -1))}${extra})`
      : escapeRe(name);
    re = new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, "u");
    wordRes.set(key, re);
  }
  return re;
}

const displayNames = new Map<string, Intl.DisplayNames | null>();
/** The name of country `home` in language `lang` (Intl.DisplayNames), "" when either is empty or not valid. */
export function countryNameIn(lang: string, home: string): string {
  if (home === "" || lang === "") return "";
  let dn = displayNames.get(lang);
  if (dn === undefined) {
    try {
      dn = new Intl.DisplayNames([lang], { type: "region", fallback: "none" });
    } catch {
      dn = null;
    }
    displayNames.set(lang, dn);
  }
  if (!dn) return "";
  try {
    return dn.of(home) ?? "";
  } catch {
    return "";
  }
}

/** A cell name split for confirmation: city (first comma-separated part), regions (the middle parts), country (the last). */
export function placeParts(name: string): { city: string; regions: string[]; country: string } {
  const parts = name.split(",").map((p) => p.trim()).filter((p) => p !== "");
  return { city: parts[0] ?? "", regions: parts.slice(1, -1), country: parts.length > 1 ? parts[parts.length - 1] : "" };
}

export interface ConfirmMatch {
  level: Confirmation;
  /** The name that matched, as written in the cell name, in the place-names table, in CAPITAL_METONYMS or by Intl.DisplayNames. */
  name: string;
  /** The text it was found in: the headline or an article title. */
  text: string;
}

type ConfirmText = { title: string; lang: string };

/**
 * Whether a story's own text names its place, and the first level that does; null when none.
 * The texts are the story's `headline` (in `headlineLang`) and the `title` of each of its
 * `articles` as written to the cell file (in its `lang`); a compact story has no `articles`,
 * so its headline alone confirms it. Each level is tried over every text
 * before the next level. The city and region levels also try the names `table` holds for the
 * cell's `fid` (`n` and `r`) by the same rules, except that a table name written all in
 * capitals is matched in capitals only and never by prefix, as a metonym is.
 */
export function confirmStory(
  cell: { name: string; home: string; fid?: string },
  story: { headline: string; headlineLang: string; articles?: readonly ConfirmText[] },
  table: PlaceNamesTable = placeNames(),
): ConfirmMatch | null {
  const texts = [{ title: story.headline, lang: story.headlineLang }, ...(story.articles ?? [])]
    .filter((t) => typeof t.title === "string" && t.title !== "")
    .map((t) => ({ text: t.title, lang: typeof t.lang === "string" ? t.lang : "", folded: foldText(t.title), unmarked: stripMarks(t.title), noSpace: NO_SPACE_SCRIPT.test(t.title) }));
  const { city, regions, country } = placeParts(cell.name);
  const metonyms = CAPITAL_METONYMS[`${cell.home}|${city}`] ?? [];
  const local = cell.fid ? table.get(cell.fid) : undefined;
  const localNames = new Set([...(local?.n ?? []), ...(local?.r ?? [])]);
  const names = (level: Confirmation, lang: string): readonly string[] => {
    if (level === "city") return [...(city === "" ? [] : [city]), ...(local?.n ?? [])];
    if (level === "region") return [...regions, ...(local?.r ?? [])];
    if (level === "country") return [country, countryNameIn(lang, cell.home)].filter((n) => n !== "");
    return metonyms;
  };
  for (const level of CONFIRMATION_LEVELS) {
    for (const t of texts) {
      for (const name of names(level, t.lang)) {
        // A metonym or table name written in capitals (WHO, NYC) is matched in capitals and never
        // by prefix; everything else case-folded.
        const caps = (level === "metonym" || localNames.has(name)) && name === name.toUpperCase() && name !== name.toLowerCase();
        const needle = caps ? stripMarks(name) : foldText(name);
        const hay = caps ? t.unmarked : t.folded;
        if (needle === "") continue;
        if (t.noSpace ? hay.includes(needle) : wordRe(needle, level !== "metonym" && !caps).test(hay)) return { level, name, text: t.text };
      }
    }
  }
  return null;
}

interface Candidate {
  cell: CellFile;
  heat: HeatCell;
  story: Story;
  /**
   * Reprint key of the headline (one per event). The headline is already the shown title, its
   * outlet suffix cut by the same rule, so no learned tails are needed. "" matches nothing.
   */
  key: string;
  /** Position of the story in its cell's `stories` (last tie-break). */
  pos: number;
}

/** Ranking: more distinct outlets `o`, then the broadcast's tie order (higher n, earlier first, cell id, position). */
const byOutlets = (a: Candidate, b: Candidate) => b.story.o - a.story.o || tieBreak(a, b);

export function buildTopStories(args: { heat: HeatFile; cells: readonly CellFile[] }): TopStoriesFile {
  const { heat, cells } = args;
  const heatById = new Map(heat.cells.map((c) => [c.id, c]));
  const all: Candidate[] = [];
  for (const cell of cells) {
    const h = heatById.get(cell.id);
    if (!h) continue;
    cell.stories.forEach((story, pos) => {
      // As every broadcast slot: the u floor, and an outlet's own headline to read.
      if (story.u >= MIN_STORY_U && story.headline !== "") all.push({ cell, heat: h, story, key: reprintKey(story.headline, story.headlineSource), pos });
    });
  }
  all.sort(byOutlets);

  const takenCells = new Set<string>();
  /** Reprint keys of the headlines taken (one per event); an empty key is never added. */
  const takenEvents = new Set<string>();
  /** Entries per country; the unknown home is keyed separately from every ISO code. */
  const perCountry = new Map<string, number>();
  const stories: TopStoriesFile["stories"] = [];
  for (const c of all) {
    if (stories.length >= TOP_STORIES_MAX) break;
    // First of all: a story whose own text does not name its place is skipped and uses up nothing.
    const confirmed = confirmStory(c.cell, c.story);
    if (!confirmed) continue;
    if (takenCells.has(c.cell.id)) continue;
    // Before the country check, so a repeat of a taken event does not use up a country place.
    if (c.key !== "" && takenEvents.has(c.key)) continue;
    const key = c.cell.home === "" ? "(unknown)" : c.cell.home;
    const cap = c.cell.home === "" ? TOP_STORIES_UNKNOWN_HOME_MAX : TOP_STORIES_PER_COUNTRY;
    const had = perCountry.get(key) ?? 0;
    if (had >= cap) continue;
    takenCells.add(c.cell.id);
    if (c.key !== "") takenEvents.add(c.key);
    perCountry.set(key, had + 1);
    stories.push({ rank: stories.length + 1, cell: slotCell(c.cell, c.heat), story: slotStory(c.story), confirmed: confirmed.level });
  }
  return { generatedAt: heat.generatedAt, windowHours: heat.windowHours, stories };
}

/**
 * buildTopStories, isolated: an error is logged and an empty list is returned instead, so the
 * snapshot (heat.json, cells) still deploys.
 */
export function buildTopStoriesSafe(args: Parameters<typeof buildTopStories>[0], log: (msg: string) => void): TopStoriesFile {
  try {
    return buildTopStories(args);
  } catch (err) {
    log(`top stories: FAILED, writing stories.json with an empty list: ${(err as Error).stack ?? String(err)}`);
    return { generatedAt: args.heat.generatedAt, windowHours: args.heat.windowHours, stories: [] };
  }
}
