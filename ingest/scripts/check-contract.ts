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

/** One article object as in a cell file's `articles` (also used inside stories). */
function checkArticle(aw: string, a: Record<string, unknown>) {
  exactKeys(aw, a, ["title", "url", "source", "country", "lang", "time"], ["tone", "image"]);
  for (const k of ["title", "url", "source", "country", "lang", "time"]) str(`${aw}.${k}`, a[k]);
  if ("image" in a) str(`${aw}.image`, a.image);
  if ("tone" in a) num(`${aw}.tone`, a.tone, 1);
  if (typeof a.title === "string" && Array.from(a.title).length > 160) err(`${aw}.title`, "longer than 160 chars");
  if (typeof a.url !== "string" || !/^https?:\/\//.test(a.url)) err(`${aw}.url`, "not an http(s) URL");
  if (typeof a.country === "string" && a.country !== "" && !/^[A-Z]{2}$/.test(a.country)) err(`${aw}.country`, `not ISO alpha-2: ${a.country}`);
  if (typeof a.time !== "string" || !ISO_UTC.test(a.time)) err(`${aw}.time`, "not ISO 8601 UTC with Z");
  if (typeof a.image === "string" && a.image !== "" && !/^https?:\/\//.test(a.image)) err(`${aw}.image`, "not an http(s) URL");
}

/** `stories` and `unclustered` (contract section "Stories"). */
let storiesChecked = 0;
function checkStories(w: string, cell: Record<string, unknown>) {
  int(`${w}.unclustered`, cell.unclustered);
  const stories = Array.isArray(cell.stories) ? (cell.stories as unknown[]) : (err(`${w}.stories`, "not an array"), []);
  if (stories.length > 12) err(`${w}.stories`, `${stories.length} stories > 12`);
  let sum = 0;
  const shownUrls = new Set<string>();
  stories.forEach((s, i) => {
    const sw = `${w}.stories[${i}]`;
    if (!isObj(s)) return err(sw, "not an object");
    storiesChecked++;
    exactKeys(sw, s, ["n", "o", "c", "l", "t", "first", "last", "headline", "headlineSource", "headlineLang", "entities", "articles"]);
    int(`${sw}.n`, s.n, 3);
    int(`${sw}.o`, s.o);
    int(`${sw}.c`, s.c);
    int(`${sw}.l`, s.l);
    num(`${sw}.t`, s.t, 1);
    if (typeof s.n === "number") sum += s.n;
    if (typeof s.o === "number" && typeof s.n === "number" && s.o > s.n) err(sw, "o > n");
    for (const k of ["first", "last"]) if (typeof s[k] !== "string" || !ISO_UTC.test(s[k] as string)) err(`${sw}.${k}`, "not ISO 8601 UTC with Z");
    if (typeof s.first === "string" && typeof s.last === "string" && s.first > s.last) err(sw, "first > last");
    for (const k of ["headline", "headlineSource", "headlineLang"]) str(`${sw}.${k}`, s[k]);
    if (typeof s.headline === "string" && Array.from(s.headline).length > 160) err(`${sw}.headline`, "longer than 160 chars");
    const ents = Array.isArray(s.entities) ? (s.entities as unknown[]) : (err(`${sw}.entities`, "not an array"), []);
    if (ents.length > 5) err(`${sw}.entities`, `${ents.length} > 5`);
    for (const e of ents) if (typeof e !== "string" || e === "" || e !== e.toLowerCase()) err(`${sw}.entities`, `not a lowercase string: ${JSON.stringify(e)}`);
    const arts = Array.isArray(s.articles) ? (s.articles as unknown[]) : (err(`${sw}.articles`, "not an array"), []);
    if (arts.length > 6) err(`${sw}.articles`, `${arts.length} > 6`);
    if (arts.length === 0) err(`${sw}.articles`, "empty");
    if (typeof s.n === "number" && arts.length > s.n) err(`${sw}.articles`, "more articles than n");
    const perOutlet = new Map<string, number>();
    arts.forEach((a, j) => {
      const aw = `${sw}.articles[${j}]`;
      if (!isObj(a)) return err(aw, "not an object");
      checkArticle(aw, a);
      if (shownUrls.has(a.url as string)) err(`${aw}.url`, "URL shown more than once across the stories");
      shownUrls.add(a.url as string);
      perOutlet.set(a.source as string, (perOutlet.get(a.source as string) ?? 0) + 1);
      const prev = arts[j - 1] as Record<string, string> | undefined;
      if (prev && typeof a.time === "string" && prev.time < a.time) err(aw, "articles not newest first");
      if (typeof a.time === "string" && typeof s.first === "string" && typeof s.last === "string" && (a.time < s.first || a.time > s.last)) {
        err(aw, "time outside the story's first..last");
      }
    });
    for (const [src, k] of perOutlet) if (k > 2) err(`${sw}.articles`, `outlet ${src} contributes ${k} > 2`);
    const prev = stories[i - 1] as Record<string, number> | undefined;
    if (prev && typeof s.n === "number" && prev.n < s.n) err(sw, "stories not sorted by n desc");
  });
  if (typeof cell.n === "number" && typeof cell.unclustered === "number" && sum + cell.unclustered !== cell.n) {
    err(`${w}.unclustered`, `sum(stories.n)=${sum} + unclustered=${cell.unclustered} != n=${cell.n}`);
  }
}

const heatById = new Map(cells.filter(isObj).map((c) => [c.id as string, c]));
let articlesChecked = 0;
for (const f of files) {
  const id = f.slice(0, -5);
  const w = `cells/${f}`;
  const cell = JSON.parse(readFileSync(join(cellsDir, f), "utf8")) as Record<string, unknown>;
  exactKeys(w, cell, ["id", "name", "n", "o", "c", "l", "t", "topOutlets", "topCountries", "languages", "articles", "stories", "unclustered"]);
  checkStories(w, cell);
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
    checkArticle(aw, a);
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

// ---- history/index.json and history/<file>.json ----
const FRAME_TARGET_BYTES = 150 * 1024;
const warnings: string[] = [];
const historyDir = join(dir, "history");
const indexPath = join(historyDir, "index.json");
let frameCount = 0;
let largestFrame = 0;
if (!existsSync(indexPath)) {
  err("history", "missing history/index.json");
} else {
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as Record<string, unknown>;
  exactKeys("history/index", index, ["frames"]);
  const frames = Array.isArray(index.frames) ? (index.frames as unknown[]) : (err("history/index.frames", "not an array"), []);
  frameCount = frames.length;
  if (frames.length === 0) err("history/index.frames", "empty; the current run must be the last entry");
  if (frames.length > 100) err("history/index.frames", `${frames.length} frames > 100`);
  const listed = new Set<string>();
  const totalKeys = ["articles", "outlets", "countries", "cells", "unplaced"];
  frames.forEach((f, i) => {
    const w = `history/index.frames[${i}]`;
    if (!isObj(f)) return err(w, "not an object");
    exactKeys(w, f, ["at", "file", "windowHours", "totals"]);
    if (typeof f.at !== "string" || !ISO_UTC.test(f.at)) return err(`${w}.at`, "not ISO 8601 UTC with Z");
    const expectedFile = `${f.at.replace(/[-:]/g, "")}.json`;
    if (f.file !== expectedFile) err(`${w}.file`, `expected ${expectedFile}, got ${JSON.stringify(f.file)}`);
    int(`${w}.windowHours`, f.windowHours, 1);
    const t = isObj(f.totals) ? f.totals : (err(`${w}.totals`, "not an object"), {});
    exactKeys(`${w}.totals`, t, totalKeys);
    for (const k of totalKeys) int(`${w}.totals.${k}`, t[k]);
    const prev = frames[i - 1] as Record<string, string> | undefined;
    if (prev && !(prev.at < f.at)) err(w, "frames not strictly oldest first");
    listed.add(expectedFile);

    // The frame file itself.
    const path = join(historyDir, expectedFile);
    if (!existsSync(path)) return err(w, `file ${expectedFile} does not exist`);
    const raw = readFileSync(path);
    largestFrame = Math.max(largestFrame, raw.length);
    if (raw.length > FRAME_TARGET_BYTES) warnings.push(`history/${expectedFile}: ${raw.length} B exceeds the 150 KB target`);
    const frame = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
    const fw = `history/${expectedFile}`;
    exactKeys(fw, frame, ["at", "cells"]);
    if (frame.at !== f.at) err(`${fw}.at`, `does not match index (${String(frame.at)} vs ${f.at})`);
    const fcells = Array.isArray(frame.cells) ? (frame.cells as unknown[]) : (err(`${fw}.cells`, "not an array"), []);
    if (isObj(f.totals) && f.totals.cells !== fcells.length) err(fw, `cells.length ${fcells.length} != totals.cells ${String(f.totals.cells)}`);
    const ids = new Set<string>();
    fcells.forEach((c, j) => {
      const cw = `${fw}.cells[${j}]`;
      if (!Array.isArray(c) || c.length !== 4) return err(cw, `expected [id, lat, lon, n], got ${JSON.stringify(c)}`);
      const [id, lat, lon, n] = c as [unknown, unknown, unknown, unknown];
      cellId(`${cw}[0]`, id);
      if (ids.has(id as string)) err(`${cw}[0]`, "duplicate cell id");
      ids.add(id as string);
      num(`${cw}[1]`, lat, 2);
      num(`${cw}[2]`, lon, 2);
      if (typeof lat === "number" && Math.abs(lat) > 90) err(`${cw}[1]`, "lat out of range");
      if (typeof lon === "number" && (lon < -180 || lon > 180)) err(`${cw}[2]`, "lon out of [-180, 180]");
      int(`${cw}[3]`, n, 2);
      const p = fcells[j - 1] as unknown[] | undefined;
      if (p && typeof n === "number" && (p[3] as number) < n) err(fw, "cells not sorted by n desc");
    });
  });

  // 24h retention and "last entry is the current snapshot".
  const last = frames.at(-1);
  if (isObj(last)) {
    if (last.at !== heat.generatedAt) err("history/index last frame", `at ${String(last.at)} != heat.generatedAt ${String(heat.generatedAt)}`);
    if (last.windowHours !== heat.windowHours) err("history/index last frame", "windowHours differs from heat.json");
    if (JSON.stringify(last.totals) !== JSON.stringify(heat.totals)) err("history/index last frame", "totals differ from heat.json");
    if (typeof heat.generatedAt === "string") {
      const cutoff = Date.parse(heat.generatedAt) - 24 * 3_600_000;
      frames.forEach((f, i) => {
        if (isObj(f) && typeof f.at === "string" && Date.parse(f.at) < cutoff) err(`history/index.frames[${i}]`, `${f.at} is older than 24h`);
      });
      const lastFile = join(historyDir, `${heat.generatedAt.replace(/[-:]/g, "")}.json`);
      if (existsSync(lastFile)) {
        const lf = JSON.parse(readFileSync(lastFile, "utf8")) as { cells?: unknown };
        const expected = cells.filter(isObj).map((c) => [c.id, c.lat, c.lon, c.n]);
        if (JSON.stringify(lf.cells) !== JSON.stringify(expected)) err(`history/${lastFile}`, "current frame's cells differ from heat.json cells");
      }
    }
  }

  const onDisk = readdirSync(historyDir).filter((f) => f !== "index.json");
  for (const f of onDisk) if (!listed.has(f)) err("history", `${f} is not listed in index.json`);
}

console.log(`checked ${dir}`);
console.log(`  heat.json: ${bytes} bytes, ${cells.length} cells`);
console.log(`  cell files: ${files.length}, articles checked: ${articlesChecked}, stories checked: ${storiesChecked}`);
console.log(`  history: ${frameCount} frames, largest frame ${largestFrame} bytes`);
for (const w of warnings) console.log(`  WARN ${w}`);
if (errors.length) {
  console.log(`FAIL: ${errors.length}${errors.length >= 200 ? "+" : ""} violations`);
  for (const e of errors) console.log(`  - ${e}`);
  process.exit(1);
}
console.log("OK: heat.json, every cell file, history/index.json and every frame match docs/DATA-CONTRACT.md");
