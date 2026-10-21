/**
 * Which outlets have no known country, and how much each lookup source helps.
 *
 *   npx tsx scripts/unknown-outlets.ts <state.json.gz | data dir>
 *
 * - A state.json.gz (the carried ingest state, e.g. ingest/out/state.json.gz) gives every
 *   article in the current window: exact numbers.
 * - A data dir (e.g. ../web/public/data): uses <dir>/state.json.gz if present, else every
 *   cells/*.json's `topOutlets` (top outlets per cell only, placed articles only), so the
 *   numbers are approximate.
 *
 * Prints the share of articles and outlets with unknown country as each source is added
 * (2018 list alone = the old behaviour), then the top 50 domains no source knows, by article
 * count, for growing data/domain-country-overrides.txt by hand.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadCountrySources, makeDetailedCountryLookup, type DetailedCountryLookup } from "../src/domains.ts";
import { decodeState } from "../src/state.ts";

const TOP_N = 50;

function readCounts(input: string): { counts: Map<string, number>; note: string } {
  const counts = new Map<string, number>();
  const add = (domain: string, n: number) => {
    const d = domain.trim().toLowerCase();
    if (d) counts.set(d, (counts.get(d) ?? 0) + n);
  };
  let statePath = input;
  if (statSync(input).isDirectory()) {
    statePath = join(input, "state.json.gz");
    if (!existsSync(statePath)) {
      const cellsDir = join(input, "cells");
      const files = readdirSync(cellsDir).filter((f) => f.endsWith(".json"));
      for (const f of files) {
        const cell = JSON.parse(readFileSync(join(cellsDir, f), "utf8")) as { topOutlets?: [string, number][] };
        for (const [domain, n] of cell.topOutlets ?? []) add(domain, n);
      }
      return { counts, note: `${files.length} cells, topOutlets only (approximate: top outlets per cell, placed articles only)` };
    }
  }
  const state = decodeState(readFileSync(statePath));
  for (const r of state.records) add(r.source, 1);
  return { counts, note: `${statePath}: ${state.records.length} records (every article in the window)` };
}

const pct = (part: number, whole: number) => (whole ? ((100 * part) / whole).toFixed(1) : "0.0") + "%";

const input = process.argv[2];
if (!input) {
  console.error("usage: npx tsx scripts/unknown-outlets.ts <state.json.gz | data dir>");
  process.exit(2);
}
const { counts, note } = readCounts(input);
const totalArticles = [...counts.values()].reduce((a, b) => a + b, 0);
const totalOutlets = counts.size;

const all = loadCountrySources();
const stages: [string, DetailedCountryLookup][] = [
  ["before: GDELT 2018 list only", makeDetailedCountryLookup({ gdelt2018: all.gdelt2018, tld: false })],
  ["+ overrides", makeDetailedCountryLookup({ overrides: all.overrides, gdelt2018: all.gdelt2018, tld: false })],
  ["+ ccTLD fallback", makeDetailedCountryLookup({ overrides: all.overrides, gdelt2018: all.gdelt2018, tld: true })],
  ["after: + GDELT 2015-2021 list", makeDetailedCountryLookup(all)],
];

console.log(`input: ${note}`);
console.log(`articles with an outlet domain: ${totalArticles}, distinct outlets: ${totalOutlets}`);
console.log("");
console.log("unknown country".padEnd(32) + "articles".padStart(18) + "outlets".padStart(18));
for (const [label, lookup] of stages) {
  let a = 0;
  let o = 0;
  for (const [d, n] of counts) {
    if (!lookup(d).country) {
      a += n;
      o += 1;
    }
  }
  console.log(label.padEnd(32) + `${a} (${pct(a, totalArticles)})`.padStart(18) + `${o} (${pct(o, totalOutlets)})`.padStart(18));
}

const final = stages[stages.length - 1][1];
const bySource = new Map<string, [number, number]>();
const unknown: [string, number][] = [];
for (const [d, n] of counts) {
  const hit = final(d);
  const key = hit.source === "override" && !hit.country ? "override (forced unknown)" : hit.source || "none";
  const cur = bySource.get(key) ?? [0, 0];
  bySource.set(key, [cur[0] + n, cur[1] + 1]);
  if (!hit.source) unknown.push([d, n]);
}
console.log("");
console.log("answered by (after)".padEnd(32) + "articles".padStart(18) + "outlets".padStart(18));
for (const [k, [a, o]] of [...bySource].sort((x, y) => y[1][0] - x[1][0])) {
  console.log(k.padEnd(32) + `${a} (${pct(a, totalArticles)})`.padStart(18) + `${o} (${pct(o, totalOutlets)})`.padStart(18));
}

unknown.sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
console.log("");
console.log(`top ${TOP_N} domains no source knows (after), by article count:`);
unknown.slice(0, TOP_N).forEach(([d, n], i) => console.log(`${String(i + 1).padStart(3)}. ${String(n).padStart(6)}  ${d}`));
