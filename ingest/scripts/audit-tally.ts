/**
 * Count a weekly audit's filled CSVs (docs/audits/README.md).
 *   npm run audit-tally -- 2026-10-31                      # the four files of docs/audits for that date
 *   npm run audit-tally -- ../docs/audits/2026-10-24-placement.csv [more files]
 * A file's kind is its name's suffix: -grouping, -top12, -headlines, anything else placement.
 * Placement: right / wrong / unclear, the wrong rate with its 95% Wilson interval (over every
 * judged story, unclear included), the same for the rows whose sample includes top20, the share
 * of headlines from a known outlet (source_known = "known"), and the causes of the wrong rows.
 * Grouping: the wrong rate with its interval. Top 12: the wrong placements and the known-outlet
 * share. Headlines: the known-outlet share with its interval. A date's missing file prints "–".
 * Exits 1 when a file has a row without a right / wrong / unclear label (placement, grouping,
 * top12) or without a known / small / aggregator source_known (top12, headlines).
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

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
const KINDS = ["placement", "grouping", "top12", "headlines"] as const;
type Kind = (typeof KINDS)[number];
const SOURCE_KNOWN = ["known", "small", "aggregator"];
const AUDITS_DIR = resolve(import.meta.dirname, "../../docs/audits");
let failed = false;

/** Wrong rate with its interval, "wrong 14.8% (95% Wilson 9.7 to 22.0%)". */
const rate = (what: string, k: number, n: number) => {
  const [lo, hi] = wilson(k, n);
  return `${what} ${pct(k / n)}% (95% Wilson ${pct(lo)} to ${pct(hi)}%)`;
};
const counts = (rows: Row[]) => LABELS.map((l) => rows.filter((r) => r.label === l).length);
const knownOf = (rows: Row[]) => {
  const k = rows.filter((r) => r.source_known === "known").length;
  return `known outlet ${k} of ${rows.length} (${pct(k / rows.length)}%)`;
};

function line(title: string, rows: Row[]) {
  const [right, wrong, unclear] = counts(rows);
  const n = rows.length;
  console.log(`${title}: ${n} stories  right ${right}  wrong ${wrong}  unclear ${unclear}  ${rate("wrong", wrong, n)}  ${knownOf(rows)}`);
}

/** Reads a CSV into rows, or reports why not; checks the columns and values each kind needs. */
function load(kind: Kind, file: string): Row[] | undefined {
  const report = (msg: string) => {
    console.log(`${kind}: ${msg}`);
    failed = true;
    return undefined;
  };
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return report(`cannot read ${file}`);
  }
  const [header, ...body] = parseCsv(text);
  const need = { placement: ["sample", "label", "source_known", "cause"], grouping: ["label"], top12: ["rank", "label", "source_known"], headlines: ["source_known"] }[kind];
  for (const col of need) if (!header.includes(col)) return report(`no "${col}" column in ${file}`);
  const rows: Row[] = body.filter((r) => r.some((f) => f !== "")).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
  if (rows.length === 0) return report(`no rows in ${file}`);
  const id = (r: Row) => r.idx ?? r.rank;
  if (need.includes("label")) {
    const bad = rows.filter((r) => !(LABELS as readonly string[]).includes(r.label));
    if (bad.length > 0) return report(`${bad.length} rows without a right / wrong / unclear label, first ${id(bad[0])}`);
  }
  if (kind === "top12" || kind === "headlines") {
    const bad = rows.filter((r) => !SOURCE_KNOWN.includes(r.source_known));
    if (bad.length > 0) return report(`${bad.length} rows without a known / small / aggregator source_known, first ${id(bad[0])}`);
  }
  return rows;
}

function placement(rows: Row[]) {
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
}

function grouping(rows: Row[]) {
  const [right, wrong, unclear] = counts(rows);
  console.log(`grouping: ${rows.length} articles  right ${right}  wrong ${wrong}  unclear ${unclear}  ${rate("wrong", wrong, rows.length)}`);
}

function top12(rows: Row[]) {
  const [right, wrong, unclear] = counts(rows);
  const which = rows.filter((r) => r.label === "wrong").map((r) => `#${r.rank} ${r.name}`).join("; ");
  console.log(`top 12: ${rows.length} entries  right ${right}  wrong ${wrong}  unclear ${unclear}${which ? ` (wrong: ${which})` : ""}  ${knownOf(rows)}`);
}

function headlines(rows: Row[]) {
  const k = rows.filter((r) => r.source_known === "known").length;
  const [lo, hi] = wilson(k, rows.length);
  console.log(`headlines: ${rows.length} stories  ${knownOf(rows)} (95% Wilson ${pct(lo)} to ${pct(hi)}%)`);
}

const SHOW: Record<Kind, (rows: Row[]) => void> = { placement, grouping, top12, headlines };
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: audit-tally <YYYY-MM-DD> | <file.csv> [<file.csv> ...]");
  process.exit(1);
}
// A date reads the four files of docs/audits that exist for it; paths are read as given, the
// kind from the name's -grouping / -top12 / -headlines suffix (anything else is placement).
const jobs: { kind: Kind; file: string | undefined }[] = /^\d{4}-\d{2}-\d{2}$/.test(args[0]) && args.length === 1
  ? KINDS.map((kind) => {
      const file = join(AUDITS_DIR, `${args[0]}-${kind}.csv`);
      return { kind, file: existsSync(file) ? file : undefined };
    })
  : args.map((a) => ({ kind: (a.match(/-(grouping|top12|headlines)\.csv$/)?.[1] ?? "placement") as Kind, file: resolve(a) }));
for (const { kind, file } of jobs) {
  if (!file) {
    console.log(`${kind}: – (no file ${args[0]}-${kind}.csv)`);
    continue;
  }
  const rows = load(kind, file);
  if (rows) SHOW[kind](rows);
}
process.exit(failed ? 1 : 0);
