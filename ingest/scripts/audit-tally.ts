/**
 * Count a filled placement-audit CSV (docs/audits/README.md).
 *   npm run audit-tally -- ../docs/audits/2026-10-24-placement.csv
 * Prints right / wrong / unclear, the wrong rate with its 95% Wilson interval (over every judged
 * story, unclear included), the same for the rows whose sample includes top20, the share of
 * headlines from a known outlet (source_known = "known"), and the causes of the wrong rows.
 * Exits 1 when a row has no label or a label other than right, wrong or unclear.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const LABELS = ["right", "wrong", "unclear"] as const;

/** RFC 4180: quoted fields, doubled quotes, CRLF or LF; a leading BOM is ignored. */
function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (t[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Wilson score interval for k of n at 95%. */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [c - h, c + h];
}

const pct = (x: number) => (100 * x).toFixed(1);
type Row = Record<string, string>;

function line(title: string, rows: Row[]) {
  const count = (l: string) => rows.filter((r) => r.label === l).length;
  const [right, wrong, unclear] = LABELS.map(count);
  const n = rows.length;
  const [lo, hi] = wilson(wrong, n);
  const known = rows.filter((r) => r.source_known === "known").length;
  console.log(
    `${title}: ${n} stories  right ${right}  wrong ${wrong}  unclear ${unclear}  ` +
      `wrong ${pct(wrong / n)}% (95% Wilson ${pct(lo)} to ${pct(hi)}%)  known outlet ${known} of ${n} (${pct(known / n)}%)`,
  );
}

const file = process.argv[2];
if (!file) {
  console.error("usage: audit-tally <file.csv>");
  process.exit(1);
}
const [header, ...body] = parseCsv(readFileSync(resolve(file), "utf8"));
for (const col of ["sample", "label", "source_known", "cause"]) {
  if (!header.includes(col)) {
    console.error(`no "${col}" column in ${file}`);
    process.exit(1);
  }
}
const rows: Row[] = body.filter((r) => r.some((f) => f !== "")).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
const bad = rows.filter((r) => !(LABELS as readonly string[]).includes(r.label));
if (bad.length > 0) {
  console.error(`${bad.length} rows without a right / wrong / unclear label, first idx ${bad[0].idx}`);
  process.exit(1);
}

line("all", rows);
line("top 20 cells", rows.filter((r) => r.sample.split("+").includes("top20")));
// A cause is a group, optionally with a detail after a colon ("other:border cell").
const groups = new Map<string, { k: number; details: Map<string, number> }>();
for (const r of rows) {
  if (r.label !== "wrong") continue;
  const [group, ...rest] = (r.cause || "(none)").split(":");
  const g = groups.get(group) ?? { k: 0, details: new Map<string, number>() };
  g.k++;
  const detail = rest.join(":").trim();
  if (detail) g.details.set(detail, (g.details.get(detail) ?? 0) + 1);
  groups.set(group, g);
}
const byCount = <T>(m: Map<string, T>, k: (v: T) => number) => [...m].sort((a, b) => k(b[1]) - k(a[1]) || (a[0] < b[0] ? -1 : 1));
console.log("causes of the wrong:");
for (const [group, g] of byCount(groups, (g) => g.k)) {
  const details = byCount(g.details, (n) => n).map(([d, n]) => `${d} ${n}`).join(", ");
  console.log(`  ${group} ${g.k}${details ? ` (${details})` : ""}`);
}
