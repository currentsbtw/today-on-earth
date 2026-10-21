/**
 * Tidy a GDELT location FullName for display without changing what place it names:
 *   "Washington, Washington, United States"   -> "Washington, United States"
 *   "Paris, France (General), France"         -> "Paris, France"
 *   "London, London, City Of, United Kingdom" -> "London, United Kingdom"
 * Steps, in order: split on ", "; strip a " (General)" suffix and drop bare "(General)"
 * parts; drop "City Of" parts; collapse consecutive duplicates (case-insensitive); drop a
 * middle part equal to the first part; join with ", ". Never returns an empty string: if
 * nothing would be left, the original is returned. Idempotent.
 */
export function cleanPlaceName(fullName: string): string {
  const parts: string[] = [];
  for (const raw of fullName.split(", ")) {
    let part = raw.trim().replace(/^,+|,+$/g, "").trim(); // ", " artefacts
    if (part === "(General)") continue;
    if (part.endsWith(" (General)")) part = part.slice(0, -" (General)".length).trim();
    if (!part || part.toLowerCase() === "city of") continue;
    // Consecutive duplicates: keep the first spelling.
    if (parts.length && parts[parts.length - 1].toLowerCase() === part.toLowerCase()) continue;
    parts.push(part);
  }
  // A middle part identical to the first part; then collapse any duplicates this exposes.
  const first = parts[0]?.toLowerCase();
  const out = parts
    .filter((p, i) => i === 0 || i === parts.length - 1 || p.toLowerCase() !== first)
    .filter((p, i, a) => i === 0 || a[i - 1].toLowerCase() !== p.toLowerCase());
  const cleaned = out.join(", ");
  return cleaned || fullName;
}
