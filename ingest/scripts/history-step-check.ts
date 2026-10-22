/**
 * The contract's rules for a history frame's step fields (docs/DATA-CONTRACT.md "New
 * articles per step"), as a pure function so check-contract.ts and the tests share them.
 */
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
/** GDELT publishes a 15-minute slot a few minutes before its stamp, so `newest` may lead `at`. */
export const NEWEST_LEAD_MS = 20 * 60_000;

/**
 * `entry` is one index.json frame entry, `rows` that frame's `cells`. Returns [where, message]
 * pairs; `where` is "newest", "added", "rows" or "rows[j]".
 */
export function checkStepFields(entry: Record<string, unknown>, rows: readonly unknown[]): [string, string][] {
  const errors: [string, string][] = [];
  const e = (where: string, msg: string) => errors.push([where, msg]);
  if ("newest" in entry) {
    const { newest, at } = entry;
    if (typeof newest !== "string" || !ISO_UTC.test(newest)) e("newest", "not ISO 8601 UTC with Z");
    else if (typeof at === "string" && Date.parse(newest) > Date.parse(at) + NEWEST_LEAD_MS) e("newest", `more than 20 minutes after at (${newest} vs ${at})`);
  }
  const hasAdded = "added" in entry;
  const added = entry.added;
  const articles = (entry.totals as Record<string, unknown> | undefined)?.articles;
  const addedOk = typeof added === "number" && Number.isInteger(added) && added >= 0;
  if (hasAdded) {
    if (!addedOk) e("added", `expected integer >= 0, got ${JSON.stringify(added)}`);
    else if (typeof articles === "number" && added > articles) e("added", `${added} exceeds totals.articles ${articles}`);
  }
  // Rows carry the fifth element `a` exactly when the entry has `added`.
  const length = hasAdded ? 5 : 4;
  let sumA = 0;
  rows.forEach((row, j) => {
    if (!Array.isArray(row) || row.length !== length) {
      return e(`rows[${j}]`, `expected ${hasAdded ? "[id, lat, lon, n, a]" : "[id, lat, lon, n]"}, got ${JSON.stringify(row)}`);
    }
    if (!hasAdded) return;
    const [, , , n, a] = row as unknown[];
    if (typeof a !== "number" || !Number.isInteger(a) || a < 0) return e(`rows[${j}]`, `a: expected integer >= 0, got ${JSON.stringify(a)}`);
    if (typeof n === "number" && a > n) e(`rows[${j}]`, `a ${a} exceeds n ${n}`);
    sumA += a;
  });
  if (addedOk && sumA > (added as number)) e("rows", `sum of a ${sumA} exceeds added ${added}`);
  return errors;
}
