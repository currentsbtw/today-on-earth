import type { ArticleRecord } from "./types.ts";

/**
 * Reprint key (docs/DATA-CONTRACT.md "Reprints and international attention"): two articles
 * in the same cell with the same non-empty key are copies of one headline.
 *
 * 1. Unicode NFKC normalisation, then lowercase; whitespace collapsed and trimmed.
 * 2. A trailing outlet suffix is removed once, only when it looks like an outlet name.
 *    Candidate: the title ends in " - X", " | X", " – X" or " — X" (hyphen, pipe, en dash
 *    or em dash with a space on each side; X contains no further such separator), and what
 *    precedes that last separator (the head, trailing space trimmed) is at least 20 code
 *    points. Then:
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
 *    whitespace-separated words ("Reuters", "AP News"). Otherwise the title is kept whole.
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

export function reprintKey(title: string, source = ""): string {
  if (!title) return "";
  let t = title.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  const m = SUFFIX.exec(t);
  if (m) {
    // Greedy last separator: the lazy head plus a tail with no separator in it.
    const rest = m[1].trimEnd();
    if (Array.from(rest).length >= SUFFIX_MIN_REST && looksLikeOutlet(m[2], outletLabel(source))) t = rest;
  }
  return t.replace(/[\p{P}\p{S}]+/gu, "").replace(/\s+/g, " ").trim();
}

const cache = new WeakMap<ArticleRecord, string>();

/** reprintKey of a record's title and source, memoised per record object. */
export function keyOf(r: ArticleRecord): string {
  let k = cache.get(r);
  if (k === undefined) cache.set(r, (k = reprintKey(r.title, r.source)));
  return k;
}

/** How many records share each non-empty key. */
export function keyCounts(records: readonly ArticleRecord[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of records) {
    const k = keyOf(r);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/** Distinct items: distinct non-empty keys plus one per record with an empty key. */
export function distinctCount(records: readonly ArticleRecord[]): number {
  const keys = new Set<string>();
  let untitled = 0;
  for (const r of records) {
    const k = keyOf(r);
    if (k) keys.add(k);
    else untitled++;
  }
  return keys.size + untitled;
}
