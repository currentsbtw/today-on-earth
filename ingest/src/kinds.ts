/**
 * Article kinds for the broadcast's "ordinary" slot (docs/DATA-CONTRACT.md "Broadcast"):
 * whether an article carries any GDELT theme of the conflict, politics, crime or disaster
 * families; and, for stories.json's grim share `g` (stories.ts GRIM_KINDS), kind h (harm):
 * exactly the themes KILL and WOUND (added 2026-10-27 evening, VOICE.md "v2.1": the
 * kill-or-wound share measured in "Gate calibration, measured"). KILL and WOUND stay in c too,
 * so h never changes whether an article has any kind. Computed at parse time from the RAW
 * V2Themes field (every theme, before the grouping deny list in entities.ts drops the broad
 * families, KILL and WOUND among them). Ingest-internal.
 *
 * CRISISLEX_ themes are deliberately not mapped: they are crisis-lexicon word matches, not
 * topics. Measured 2026-10-21 on 10,652 placed articles (4 files of each feed):
 * CRISISLEX_CRISISLEXREC tagged 35%, CRISISLEX_C07_SAFETY 28%, and 5.4% of articles were tagged
 * by a CRISISLEX_C* or CRISISLEX_T* theme alone (restaurant reviews, earnings calls, a celebrity
 * quote). With them the share of articles with any kind was 74.5%, without them 67.1%.
 *
 * A rule is an exact theme name, or a prefix when it ends in "*". Matching is on the
 * uppercase theme name.
 */
export type Kind = "c" | "p" | "k" | "d" | "h";

export const KIND_RULES: Readonly<Record<Kind, readonly string[]>> = {
  // conflict
  c: [
    "ARMEDCONFLICT", "MILITARY", "TERROR", "WMD", "REBELLION", "REBELS", "SEIGE", "BLOCKADE", "CEASEFIRE", "KILL",
    "WOUND", "UNREST_*",
  ],
  // politics
  p: [
    "ELECTION", "LEGISLATION", "GENERAL_GOVERNMENT", "LEADER", "GOV_*", "USPEC_POLITICS_GENERAL1", "POLITICAL_TURMOIL",
    "RESIGNATION", "APPOINTMENT", "CONSTITUTIONAL", "DEMOCRACY", "NEGOTIATIONS", "ALLIANCE", "SANCTIONS", "SOVEREIGNTY",
  ],
  // crime
  k: [
    "ARREST", "TRIAL", "SOC_GENERALCRIME", "CRIME_*", "KIDNAP", "RAPE", "DRUG_TRADE", "ORGANIZED_CRIME", "CORRUPTION",
    "CYBER_ATTACK",
  ],
  // disaster
  d: ["NATURAL_DISASTER_*", "MANMADE_DISASTER_*", "DISASTER_*", "EVACUATION"],
  // harm: exact names only, no prefixes (KILLER_WHALE is not KILL)
  h: ["KILL", "WOUND"],
};

/** Themes never mapped even when a prefix above matches them. */
export const KIND_EXCLUDED: readonly string[] = ["MANMADE_DISASTER_IMPLIED"];

const KINDS: readonly Kind[] = ["c", "d", "h", "k", "p"]; // output order: sorted letters
const exact = new Map<string, Kind[]>();
const prefixes: [string, Kind][] = [];
for (const kind of KINDS) {
  for (const rule of KIND_RULES[kind]) {
    if (rule.endsWith("*")) prefixes.push([rule.slice(0, -1), kind]);
    else (exact.get(rule) ?? exact.set(rule, []).get(rule)!).push(kind);
  }
}
const excluded = new Set(KIND_EXCLUDED);

/** Kinds of one raw theme name (uppercase or not), [] when none. */
export function themeKinds(theme: string): Kind[] {
  const t = theme.trim().toUpperCase();
  if (!t || excluded.has(t)) return [];
  const out = new Set<Kind>(exact.get(t) ?? []);
  for (const [p, k] of prefixes) if (t.startsWith(p)) out.add(k);
  return [...out];
}

/**
 * Kinds of an article from its raw GKG V2Themes field (`THEME,offset;THEME,offset`): the
 * sorted, de-duplicated letters among c, d, h, k, p, or "" when none.
 */
export function parseKinds(v2Themes: string): string {
  if (!v2Themes) return "";
  const seen = new Set<Kind>();
  const done = new Set<string>();
  for (const item of v2Themes.split(";")) {
    const comma = item.lastIndexOf(",");
    const name = (comma < 0 ? item : item.slice(0, comma)).trim();
    if (!name || done.has(name)) continue;
    done.add(name);
    for (const k of themeKinds(name)) seen.add(k);
    if (seen.size === KINDS.length) break;
  }
  return KINDS.filter((k) => seen.has(k)).join("");
}

/** A valid `kinds` value: sorted distinct letters among c, d, h, k, p. */
export const KINDS_PATTERN = /^c?d?h?k?p?$/;
