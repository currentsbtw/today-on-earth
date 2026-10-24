/**
 * Tidy a GDELT location FullName for display without changing what place it names:
 *   "Washington, Washington, United States"   -> "Washington, United States"
 *   "Paris, France (General), France"         -> "Paris, France"
 *   "London, London, City Of, United Kingdom" -> "London, United Kingdom"
 *   "Ad Daw?Ah, Ad Daw?Ah, Qatar"            -> "Ad Dawah, Qatar"
 *   "Sao Paulo, SãPaulo, Brazil"              -> "Sao Paulo, Brazil"
 *   "Amman, (Jo11), Jordan"                   -> "Amman, Jordan"
 * Steps, in order: split on ", "; in each part remove the "?" GDELT writes for characters it
 * could not encode, and where a "?" (or a run of them) sat between two letters, lowercase the
 * uppercase letter after it ("Daw?Ah" -> "Dawah"); strip a " (General)" suffix and drop bare
 * "(General)" parts; drop "City Of" parts; drop parts that are a bare code: an ADM1 code in
 * parentheses ("(Jo11)", "(Pl67)") or digits alone ("00", "92"); collapse consecutive
 * duplicates (case-insensitive); drop a middle part equal to the first part; drop a middle
 * part that is garbled (below); join with ", ".
 *
 * Garbled middle parts: GDELT transliterates the place name (the first part) and writes the
 * country (the last part) in English, but its region names (the middle parts) come from a
 * table that loses characters after every non-ASCII letter, as sent in the raw files:
 * "SãPaulo" (São Paulo), "RegióEtropolitana" (Región Metropolitana), "Baden-WüBerg"
 * (Baden-Württemberg), "Genè" (Genève), "AndalucíSp" (Andalucía, with a code fragment), or
 * writes "?" for what it could not encode ("Ha N?I", Hà Nội). The lost letters cannot be
 * recovered from the string, so a middle part with a non-ASCII character or a "?" is dropped.
 * The first and last parts are never dropped for this. Never returns an empty string: if
 * nothing would be left, the original is returned. Idempotent.
 */
export function cleanPlaceName(fullName: string): string {
  const parts: { text: string; garbled: boolean }[] = [];
  for (const raw of fullName.split(", ")) {
    const garbled = GARBLED.test(raw);
    let part = raw.includes("?")
      ? raw
          .replace(/(?<=\p{L})\?+(\p{Lu})/gu, (_, next: string) => next.toLowerCase())
          .replace(/\?/g, "")
          .replace(/ {2,}/g, " ")
      : raw;
    part = part.trim().replace(/^,+|,+$/g, "").trim(); // ", " artefacts
    if (part === "(General)") continue;
    if (part.endsWith(" (General)")) part = part.slice(0, -" (General)".length).trim();
    if (!part || part.toLowerCase() === "city of" || BARE_CODE.test(part)) continue;
    // Consecutive duplicates: keep the first spelling.
    if (parts.length && parts[parts.length - 1].text.toLowerCase() === part.toLowerCase()) continue;
    parts.push({ text: part, garbled });
  }
  // A middle part identical to the first part, or garbled; then collapse any duplicates this
  // exposes.
  const first = parts[0]?.text.toLowerCase();
  const last = parts.length - 1;
  const out = parts
    .filter((p, i) => i === 0 || i === last || (p.text.toLowerCase() !== first && !p.garbled))
    .map((p) => p.text)
    .filter((p, i, a) => i === 0 || a[i - 1].toLowerCase() !== p.toLowerCase());
  const cleaned = out.join(", ");
  return cleaned || fullName;
}

/** A non-ASCII character or GDELT's "?" placeholder. */
const GARBLED = /[^\x00-\x7f]|\?/;
/**
 * "(Jo11)": an ADM1 code in parentheses where GDELT had no name (a digit is required, so a
 * parenthesised word stays); "00", "92": digits alone.
 */
const BARE_CODE = /^\((?=[^)]*\d)\w{1,6}\)$|^\d{1,6}$/;
