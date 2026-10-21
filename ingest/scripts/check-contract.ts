/**
 * Validate ingest output against docs/DATA-CONTRACT.md, field by field.
 *   npm run check                 # checks ingest/out (or $OUT_DIR)
 *   npm run check -- <dir>        # checks <dir>
 * Exits 1 and lists every violation when something does not match.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getResolution, isValidCell } from "h3-js";

const dir = resolve(process.argv[2] ?? process.env.OUT_DIR ?? join(fileURLToPath(new URL("..", import.meta.url)), "out"));
const errors: string[] = [];
const err = (where: string, msg: string) => {
  if (errors.length < 200) errors.push(`${where}: ${msg}`);
};

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const decimals = (x: number) => (Number.isInteger(x) ? 0 : String(x).split(".")[1]?.length ?? 0);

function exactKeys(where: string, o: Record<string, unknown>, required: string[], optional: string[] = []) {
  for (const k of required) if (!(k in o)) err(where, `missing key "${k}"`);
  for (const k of Object.keys(o)) if (!required.includes(k) && !optional.includes(k)) err(where, `unexpected key "${k}"`);
  for (const [k, v] of Object.entries(o)) if (v === null || v === undefined) err(where, `"${k}" is null`);
}
function str(where: string, v: unknown) {
  if (typeof v !== "string") err(where, `expected string, got ${typeof v}`);
}
function int(where: string, v: unknown, min = 0) {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min) err(where, `expected integer >= ${min}, got ${JSON.stringify(v)}`);
}
function num(where: string, v: unknown, maxDecimals: number) {
  if (typeof v !== "number" || !Number.isFinite(v)) return err(where, `expected number, got ${JSON.stringify(v)}`);
  if (decimals(v) > maxDecimals) err(where, `more than ${maxDecimals} decimals: ${v}`);
}
function cellId(where: string, v: unknown) {
  if (typeof v !== "string" || !isValidCell(v) || getResolution(v) !== 3) err(where, `not an H3 res-3 cell: ${JSON.stringify(v)}`);
}
function pairs(where: string, v: unknown, max: number, keyCheck: (k: string) => boolean) {
  if (!Array.isArray(v)) return err(where, "expected array");
  if (v.length > max) err(where, `more than ${max} entries`);
  v.forEach((p, i) => {
    if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== "string" || !Number.isInteger(p[1]) || p[1] < 1) {
      err(`${where}[${i}]`, `expected [string, positive int], got ${JSON.stringify(p)}`);
    } else if (!keyCheck(p[0])) err(`${where}[${i}]`, `bad key ${JSON.stringify(p[0])}`);
    if (i > 0 && Array.isArray(v[i - 1]) && v[i - 1][1] < p[1]) err(where, "not sorted by count desc");
  });
}

const heatPath = join(dir, "heat.json");
if (!existsSync(heatPath)) {
  console.error(`no heat.json in ${dir}`);
  process.exit(1);
}
const heatBytes = readFileSync(heatPath);
const heat = JSON.parse(heatBytes.toString("utf8")) as Record<string, unknown>;

// ---- heat.json ----
exactKeys("heat", heat, ["generatedAt", "windowHours", "newestArticleAt", "totals", "cells"]);
if (typeof heat.generatedAt !== "string" || !ISO_UTC.test(heat.generatedAt)) err("heat.generatedAt", "not ISO 8601 UTC with Z");
if (typeof heat.newestArticleAt !== "string" || !ISO_UTC.test(heat.newestArticleAt)) err("heat.newestArticleAt", "not ISO 8601 UTC with Z");
int("heat.windowHours", heat.windowHours, 1);
const totals = isObj(heat.totals) ? heat.totals : (err("heat.totals", "not an object"), {});
exactKeys("heat.totals", totals, ["articles", "outlets", "countries", "cells", "unplaced"]);
for (const k of ["articles", "outlets", "countries", "cells", "unplaced"]) int(`heat.totals.${k}`, totals[k]);
const cells = Array.isArray(heat.cells) ? (heat.cells as unknown[]) : (err("heat.cells", "not an array"), []);
if (totals.cells !== cells.length) err("heat.totals.cells", `${String(totals.cells)} != cells.length ${cells.length}`);
const seenIds = new Set<string>();
cells.forEach((c, i) => {
  const w = `heat.cells[${i}]`;
  if (!isObj(c)) return err(w, "not an object");
  exactKeys(w, c, ["id", "lat", "lon", "n", "o", "c", "l", "t", "name"]);
  cellId(`${w}.id`, c.id);
  if (seenIds.has(c.id as string)) err(`${w}.id`, "duplicate");
  seenIds.add(c.id as string);
  num(`${w}.lat`, c.lat, 2);
  num(`${w}.lon`, c.lon, 2);
  if (typeof c.lat === "number" && Math.abs(c.lat) > 90) err(`${w}.lat`, "out of range");
  if (typeof c.lon === "number" && (c.lon < -180 || c.lon > 180)) err(`${w}.lon`, "out of [-180, 180]");
  int(`${w}.n`, c.n, 1);
  int(`${w}.o`, c.o);
  int(`${w}.c`, c.c);
  int(`${w}.l`, c.l);
  num(`${w}.t`, c.t, 1);
  str(`${w}.name`, c.name);
  if (typeof c.o === "number" && typeof c.n === "number" && c.o > c.n) err(w, "o > n");
  const prev = cells[i - 1] as Record<string, number> | undefined;
  if (prev && typeof c.n === "number" && prev.n < c.n) err(w, "cells not sorted by n desc");
});
// Placed articles (sum of n over kept cells) plus unplaced can never exceed all articles;
// the difference is articles in dropped n < 2 cells.
const placed = cells.reduce((s: number, c) => s + (isObj(c) && typeof c.n === "number" ? c.n : 0), 0);
if (typeof totals.unplaced === "number" && typeof totals.articles === "number" && placed + totals.unplaced > totals.articles) {
  err("heat.totals.unplaced", `sum(n)=${placed} + unplaced=${totals.unplaced} > articles=${totals.articles}`);
}
const bytes = heatBytes.length;
if (bytes > 1.5 * 1024 * 1024) err("heat.json", `size ${bytes} B exceeds the 1.5 MB target`);

// ---- cells/<id>.json ----
const cellsDir = join(dir, "cells");
const files = existsSync(cellsDir) ? readdirSync(cellsDir).filter((f) => f.endsWith(".json")) : [];
for (const id of seenIds) if (!files.includes(`${id}.json`)) err("cells", `missing cells/${id}.json`);
for (const f of files) if (!seenIds.has(f.slice(0, -5))) err("cells", `cells/${f} is not listed in heat.json`);

const heatById = new Map(cells.filter(isObj).map((c) => [c.id as string, c]));
let articlesChecked = 0;
for (const f of files) {
  const id = f.slice(0, -5);
  const w = `cells/${f}`;
  const cell = JSON.parse(readFileSync(join(cellsDir, f), "utf8")) as Record<string, unknown>;
  exactKeys(w, cell, ["id", "name", "n", "o", "c", "l", "t", "topOutlets", "topCountries", "languages", "articles"]);
  if (cell.id !== id) err(`${w}.id`, `does not match file name`);
  str(`${w}.name`, cell.name);
  int(`${w}.n`, cell.n, 1);
  int(`${w}.o`, cell.o);
  int(`${w}.c`, cell.c);
  int(`${w}.l`, cell.l);
  num(`${w}.t`, cell.t, 1);
  const h = heatById.get(id);
  if (h) for (const k of ["name", "n", "o", "c", "l", "t"]) if (h[k] !== cell[k]) err(`${w}.${k}`, `differs from heat.json (${String(h[k])} vs ${String(cell[k])})`);
  pairs(`${w}.topOutlets`, cell.topOutlets, 10, (k) => k.length > 0);
  pairs(`${w}.topCountries`, cell.topCountries, 10, (k) => k === "" || /^[A-Z]{2}$/.test(k));
  pairs(`${w}.languages`, cell.languages, 10, (k) => /^[a-z]{2,3}$/.test(k) || k === "");
  const arts = Array.isArray(cell.articles) ? (cell.articles as unknown[]) : (err(`${w}.articles`, "not an array"), []);
  if (arts.length > 50) err(`${w}.articles`, `${arts.length} > 50`);
  if (typeof cell.n === "number" && arts.length > cell.n) err(`${w}.articles`, "more articles than n");
  const urls = new Set<string>();
  const perOutlet = new Map<string, number>();
  arts.forEach((a, i) => {
    const aw = `${w}.articles[${i}]`;
    if (!isObj(a)) return err(aw, "not an object");
    exactKeys(aw, a, ["title", "url", "source", "country", "lang", "time"], ["tone", "image"]);
    for (const k of ["title", "url", "source", "country", "lang", "time"]) str(`${aw}.${k}`, a[k]);
    if ("image" in a) str(`${aw}.image`, a.image);
    if ("tone" in a) num(`${aw}.tone`, a.tone, 1);
    if (typeof a.title === "string" && Array.from(a.title).length > 160) err(`${aw}.title`, "longer than 160 chars");
    if (typeof a.url !== "string" || !/^https?:\/\//.test(a.url)) err(`${aw}.url`, "not an http(s) URL");
    if (typeof a.country === "string" && a.country !== "" && !/^[A-Z]{2}$/.test(a.country)) err(`${aw}.country`, `not ISO alpha-2: ${a.country}`);
    if (typeof a.time !== "string" || !ISO_UTC.test(a.time)) err(`${aw}.time`, "not ISO 8601 UTC with Z");
    if (typeof a.image === "string" && a.image !== "" && !/^https?:\/\//.test(a.image)) err(`${aw}.image`, "not an http(s) URL");
    if (urls.has(a.url as string)) err(`${aw}.url`, "duplicate URL in cell");
    urls.add(a.url as string);
    perOutlet.set(a.source as string, (perOutlet.get(a.source as string) ?? 0) + 1);
    const prev = arts[i - 1] as Record<string, string> | undefined;
    if (prev && typeof a.time === "string" && prev.time < a.time) err(aw, "articles not newest first");
    articlesChecked++;
  });
  // Outlet-spread rule: with >= 10 outlets in the cell, no outlet has more than 5 of the list.
  if (typeof cell.o === "number" && cell.o >= 10) {
    for (const [src, k] of perOutlet) if (k > 5) err(`${w}.articles`, `outlet ${src} contributes ${k} > 5`);
  }
}

console.log(`checked ${dir}`);
console.log(`  heat.json: ${bytes} bytes, ${cells.length} cells`);
console.log(`  cell files: ${files.length}, articles checked: ${articlesChecked}`);
if (errors.length) {
  console.log(`FAIL: ${errors.length}${errors.length >= 200 ? "+" : ""} violations`);
  for (const e of errors) console.log(`  - ${e}`);
  process.exit(1);
}
console.log("OK: heat.json and every cell file match docs/DATA-CONTRACT.md");
