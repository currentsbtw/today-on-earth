import { outletOf as defaultOutletOf } from "./domains.ts";
import type { ArticleRecord } from "./types.ts";

/**
 * Reprint key (docs/DATA-CONTRACT.md "Reprints and international attention"): two articles
 * in the same cell with the same non-empty key are copies of one headline.
 *
 * 1. Unicode NFKC normalisation, then lowercase; whitespace collapsed and trimmed.
 * 2. A trailing outlet suffix is removed only when it looks like an outlet name; the rule is
 *    then applied again to what remains, until it no longer applies ("X - Section | Outlet"
 *    loses both; every removal needs a head of 20+ code points, so it stops).
 *    Candidate: the title ends in " - X", " | X", " – X" or " — X" (hyphen, pipe, en dash
 *    or em dash with a space on each side; X contains no further such separator), and what
 *    precedes that last separator (the head, trailing space trimmed) is at least 20 code
 *    points. The candidate is found and measured on the NFKC, whitespace-collapsed title
 *    before lowercasing (lowercasing can change the code-point count, "İ" -> "i̇"), so the
 *    shown title can always be cut at the same place. Then:
 *    - tail = X decomposed (NFD) with every character that is not a letter or digit
 *      (Unicode L and N classes) removed, then a leading "the" removed
 *      ("The Star" -> "star", "BBC News" -> "bbcnews", "El País" -> "elpais").
 *    - label = the article's source domain, lowercased, split on "."; with 3 or more labels
 *      and the second-to-last one of com co net org gov edu ac or ne go, the third-to-last
 *      label, otherwise the second-to-last ("bbc.co.uk" -> "bbc", "news.ndtv.com" ->
 *      "ndtv"); then reduced like tail (non-letters/digits removed, leading "the"
 *      removed) and kept only if at least 3 characters, else "".
 *    The suffix is removed when (a) label is non-empty, tail is at least 3 characters,
 *    and tail contains label or label contains tail; or (b) X has at most 2
 *    whitespace-separated words ("Reuters", "AP News"); or (c) X, normalised like the key
 *    (steps 1 and 3), is one of the source's learned tails (learnTails: a tail that the same
 *    source puts on 3 or more distinct heads in the snapshot, e.g. a station name
 *    "| Sunny 102.3 FM" or a site slogan). Otherwise the title is kept whole.
 * 3. Punctuation and symbols (Unicode P and S classes) are deleted; whitespace is collapsed
 *    and trimmed again.
 *
 * An empty result (no title, or a title of punctuation only) is "": such an article never
 * matches anything and counts as its own item.
 */
export const SUFFIX_MIN_REST = 20;
/** Minimum length of a reduced outlet label or tail for the outlet-name match. */
const MIN_NAME = 3;
/** A suffix of at most this many words is removed whatever the source. */
const SHORT_SUFFIX_WORDS = 2;

const SUFFIX = /^(.*?)\s(?:-|\||–|—)\s((?:(?!\s(?:-|\||–|—)\s).)+)$/su;
const NATIONAL_SLDS: ReadonlySet<string> = new Set(["com", "co", "net", "org", "gov", "edu", "ac", "or", "ne", "go"]);

/** Letters and digits only (diacritics dropped via NFD), with a leading "the" removed. */
function reduceName(s: string): string {
  return s.normalize("NFD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").replace(/^the/, "");
}

/** The source domain's main label, reduced like a suffix; "" when shorter than 3. */
export function outletLabel(source: string): string {
  const labels = source.trim().toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length < 2) return "";
  const i = labels.length >= 3 && NATIONAL_SLDS.has(labels[labels.length - 2]) ? labels.length - 3 : labels.length - 2;
  const label = reduceName(labels[i]);
  return Array.from(label).length >= MIN_NAME ? label : "";
}

function looksLikeOutlet(suffix: string, label: string): boolean {
  if (suffix.trim().split(/\s+/).length <= SHORT_SUFFIX_WORDS) return true;
  const tail = reduceName(suffix);
  return label !== "" && Array.from(tail).length >= MIN_NAME && (tail.includes(label) || label.includes(tail));
}


/** Step 1: NFKC, lowercase, whitespace collapsed and trimmed. */
function normalise(title: string): string {
  return title.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Step 1 without the lowercasing: where suffixes are found, measured and cut. */
function nfkc(title: string): string {
  return title.normalize("NFKC").replace(/\s+/g, " ").trim();
}

/** Step 3: punctuation and symbols deleted, whitespace collapsed and trimmed. */
function finish(t: string): string {
  return t.replace(/[\p{P}\p{S}]+/gu, "").replace(/\s+/g, " ").trim();
}

/**
 * The suffix candidate of step 2: the title split at its last " - ", " | ", " – " or " — "
 * into `head` (trailing space trimmed, at least 20 code points) and `tail` (X). Null when
 * there is no such separator or the head is too short. Works on the string as given.
 */
export function splitSuffix(title: string): { head: string; tail: string } | null {
  // Greedy last separator: the lazy head plus a tail with no separator in it.
  const m = SUFFIX.exec(title);
  if (!m) return null;
  const head = m[1].trimEnd();
  return Array.from(head).length >= SUFFIX_MIN_REST ? { head, tail: m[2] } : null;
}

/** Learned tails per outlet (outletOf of the source): normalised tails (step 1 + step 3 form). */
export type LearnedTails = ReadonlyMap<string, ReadonlySet<string>>;

/** A tail must occur on at least this many distinct heads of one outlet to be learned. */
export const LEARNED_TAIL_MIN_HEADS = 3;

/**
 * For each outlet (outletOf of a non-empty `source`, so a network's hosts learn together), the
 * tails that occur on 3 or more distinct heads of that outlet's titles (heads and tails
 * compared after the key's normalisation). One pass. Keyed by outlet.
 */
export function learnTails(
  records: readonly ArticleRecord[],
  outletOf: (source: string) => string = defaultOutletOf,
): Map<string, Set<string>> {
  const heads = new Map<string, Map<string, Set<string> | null>>(); // outlet -> tail -> heads (null once learned)
  const out = new Map<string, Set<string>>();
  for (const r of records) {
    if (!r.title || !r.source) continue;
    const outlet = outletOf(r.source);
    const sp = splitSuffix(nfkc(r.title));
    if (!sp) continue;
    const tail = finish(sp.tail.toLowerCase());
    if (!tail) continue;
    let bySource = heads.get(outlet);
    if (!bySource) heads.set(outlet, (bySource = new Map()));
    let seen = bySource.get(tail);
    if (seen === null) continue; // already learned
    if (!seen) bySource.set(tail, (seen = new Set()));
    seen.add(finish(sp.head.toLowerCase()));
    if (seen.size >= LEARNED_TAIL_MIN_HEADS) {
      bySource.set(tail, null);
      let set = out.get(outlet);
      if (!set) out.set(outlet, (set = new Set()));
      set.add(tail);
    }
  }
  return out;
}

/**
 * The key rule, decided once on the NFKC title (not lowercased): the key, how many suffixes
 * were removed, and the NFKC title with them removed (`head`).
 */
function keyParts(title: string, source: string, tails?: ReadonlySet<string>): { key: string; strips: number; head: string } {
  if (!title) return { key: "", strips: 0, head: "" };
  let t = nfkc(title);
  const label = outletLabel(source);
  let strips = 0;
  for (let sp = splitSuffix(t); sp; sp = splitSuffix(t)) {
    if (!(looksLikeOutlet(sp.tail, label) || (tails !== undefined && tails.has(finish(sp.tail.toLowerCase()))))) break;
    t = sp.head;
    strips++;
  }
  return { key: finish(t.toLowerCase()), strips, head: t };
}

/** The reprint key of a title from `source`; `tails` are its outlet's learned tails. */
export function reprintKey(title: string, source = "", tails?: ReadonlySet<string>): string {
  return keyParts(title, source, tails).key;
}

/**
 * The title as shown: the original title with the suffix the key rule strips removed
 * (original casing and punctuation, trimmed), else the title unchanged.
 */
function shownOf(title: string, parts: { strips: number; head: string }): string {
  if (!parts.strips) return title;
  // Cut the original (whitespace collapsed) the same number of times. It splits the same way
  // unless NFKC changed a separator or a length (full-width forms, ligatures); then the NFKC
  // head the key rule cut, which always exists, is shown instead.
  let own: string | null = title.replace(/\s+/g, " ").trim();
  for (let i = 0; i < parts.strips && own !== null; i++) own = splitSuffix(own)?.head ?? null;
  return own !== null && finish(normalise(own)) === finish(normalise(parts.head)) ? own.trim() : parts.head;
}

/** Per-snapshot reprint keys and shown titles, with the snapshot's learned outlet tails. */
export interface Keyer {
  keyOf(r: ArticleRecord): string;
  shownTitle(r: ArticleRecord): string;
}

/** Learns the outlet tails of `records` once; keys and shown titles are memoised per record. */
export function createKeyer(records: readonly ArticleRecord[]): Keyer {
  const tails = learnTails(records);
  const memo = new Map<ArticleRecord, { key: string; strips: number; head: string }>();
  const parts = (r: ArticleRecord) => {
    let p = memo.get(r);
    if (!p) memo.set(r, (p = keyParts(r.title, r.source, tails.get(defaultOutletOf(r.source)))));
    return p;
  };
  return {
    keyOf: (r) => parts(r).key,
    shownTitle: (r) => shownOf(r.title, parts(r)),
  };
}

/**
 * Article units of `records`: copies of one headline (non-empty key) by one outlet are one
 * unit; every untitled record is its own unit. `outletOf` maps a source to its outlet.
 * Each unit lists its records in input order.
 */
export function unitsOf(records: readonly ArticleRecord[], keyer: Keyer, outletOf: (source: string) => string): ArticleRecord[][] {
  const byPair = new Map<string, ArticleRecord[]>();
  const units: ArticleRecord[][] = [];
  for (const r of records) {
    const key = keyer.keyOf(r);
    if (!key) {
      units.push([r]);
      continue;
    }
    const pair = outletOf(r.source) + "\u0000" + key;
    const u = byPair.get(pair);
    if (u) u.push(r);
    else {
      const fresh = [r];
      byPair.set(pair, fresh);
      units.push(fresh);
    }
  }
  return units;
}

/**
 * How many article units share each non-empty key (distinct outlets carrying the headline).
 * An article's `reprints` is this count minus one.
 */
export function keyCounts(records: readonly ArticleRecord[], keyer: Keyer, outletOf: (source: string) => string): Map<string, number> {
  const m = new Map<string, number>();
  const pairs = new Set<string>();
  for (const r of records) {
    const k = keyer.keyOf(r);
    if (!k) continue;
    const pair = outletOf(r.source) + "\u0000" + k;
    if (pairs.has(pair)) continue;
    pairs.add(pair);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/** Distinct items: distinct non-empty keys plus one per record with an empty key. */
export function distinctCount(records: readonly ArticleRecord[], keyer: Keyer): number {
  const keys = new Set<string>();
  let untitled = 0;
  for (const r of records) {
    const k = keyer.keyOf(r);
    if (k) keys.add(k);
    else untitled++;
  }
  return keys.size + untitled;
}
