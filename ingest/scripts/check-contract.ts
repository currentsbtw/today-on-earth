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
import { isYouTubeVideoUrl } from "../src/gkg.ts";
import {
  BRIGHTEST_MIN_C, BRIGHTEST_MIN_N, BRIGHTEST_MIN_O, BROADCAST_MIN_BASELINE_DAYS, FAINT_MAX_B, FAINT_MIN_C, FAINT_MIN_O, ORDINARY_MIN_C,
  MIN_STORY_U, ORDINARY_MIN_O, PLANET_MIN_O, RISING_MIN_N, SLOT_ORDER, risingRatio, voices,
} from "../src/broadcast.ts";
import { reprintKey } from "../src/reprints.ts";
import { MAX_STORIES } from "../src/stories.ts";
import { CONFIRMATION_LEVELS, TOP_STORIES_MAX, TOP_STORIES_PER_COUNTRY, TOP_STORIES_UNKNOWN_HOME_MAX, confirmStory } from "../src/top-stories.ts";
import { MAX_TOPICS, TOPIC_MAX_CELLS, TOPIC_MIN_TOTAL, isJunkTopic } from "../src/topics.ts";
import { checkStepFields } from "./history-step-check.ts";

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
/** Country lists: [ISO alpha-2, units], sorted by units desc then code, no "" (added 2026-10-23). */
const ISO2 = /^[A-Z]{2}$/;
function countryPairs(where: string, v: unknown, max: number) {
  pairs(where, v, max, (k) => ISO2.test(k));
  if (!Array.isArray(v)) return;
  const codes = new Set<unknown>();
  v.forEach((p, i) => {
    if (!Array.isArray(p)) return;
    if (codes.has(p[0])) err(`${where}[${i}]`, `duplicate code ${JSON.stringify(p[0])}`);
    codes.add(p[0]);
    const q = v[i - 1];
    if (i > 0 && Array.isArray(q) && q[1] === p[1] && !(q[0] < p[0])) err(where, `tie not ordered by code at ${i}`);
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
exactKeys("heat", heat, ["generatedAt", "windowHours", "newestArticleAt", "baselineDays", "totals", "topOutletCountries", "cells"]);
if (typeof heat.generatedAt !== "string" || !ISO_UTC.test(heat.generatedAt)) err("heat.generatedAt", "not ISO 8601 UTC with Z");
if (typeof heat.newestArticleAt !== "string" || !ISO_UTC.test(heat.newestArticleAt)) err("heat.newestArticleAt", "not ISO 8601 UTC with Z");
int("heat.windowHours", heat.windowHours, 1);
int("heat.baselineDays", heat.baselineDays);
if (typeof heat.baselineDays === "number" && heat.baselineDays > 14) err("heat.baselineDays", "more than 14");
const totals = isObj(heat.totals) ? heat.totals : (err("heat.totals", "not an object"), {});
exactKeys("heat.totals", totals, ["articles", "outlets", "countries", "cells", "unplaced", "reprints"]);
for (const k of ["articles", "outlets", "countries", "cells", "unplaced", "reprints"]) int(`heat.totals.${k}`, totals[k]);
countryPairs("heat.topOutletCountries", heat.topOutletCountries, 20);
if (Array.isArray(heat.topOutletCountries) && typeof totals.articles === "number") {
  (heat.topOutletCountries as unknown[]).forEach((p, i) => {
    if (Array.isArray(p) && typeof p[1] === "number" && p[1] > (totals.articles as number)) err(`heat.topOutletCountries[${i}]`, `${p[1]} units > totals.articles ${totals.articles}`);
  });
}
const cells = Array.isArray(heat.cells) ? (heat.cells as unknown[]) : (err("heat.cells", "not an array"), []);
if (totals.cells !== cells.length) err("heat.totals.cells", `${String(totals.cells)} != cells.length ${cells.length}`);
const seenIds = new Set<string>();
cells.forEach((c, i) => {
  const w = `heat.cells[${i}]`;
  if (!isObj(c)) return err(w, "not an object");
  exactKeys(w, c, ["id", "lat", "lon", "n", "u", "o", "c", "i", "l", "t", "name", "b"]);
  cellId(`${w}.id`, c.id);
  if (seenIds.has(c.id as string)) err(`${w}.id`, "duplicate");
  seenIds.add(c.id as string);
  num(`${w}.lat`, c.lat, 2);
  num(`${w}.lon`, c.lon, 2);
  if (typeof c.lat === "number" && Math.abs(c.lat) > 90) err(`${w}.lat`, "out of range");
  if (typeof c.lon === "number" && (c.lon < -180 || c.lon > 180)) err(`${w}.lon`, "out of [-180, 180]");
  int(`${w}.n`, c.n, 1);
  int(`${w}.u`, c.u, 1);
  int(`${w}.o`, c.o);
  int(`${w}.c`, c.c);
  int(`${w}.i`, c.i);
  int(`${w}.l`, c.l);
  num(`${w}.t`, c.t, 1);
  num(`${w}.b`, c.b, 1);
  if (typeof c.u === "number" && typeof c.n === "number" && c.u > c.n) err(w, "u > n");
  if (typeof c.i === "number" && typeof c.c === "number" && c.i > c.c) err(w, "i > c");
  if (typeof c.b === "number" && c.b < 0) err(`${w}.b`, "negative");
  if (typeof heat.baselineDays === "number" && heat.baselineDays < 3 && c.b !== 0) err(`${w}.b`, "must be 0 while baselineDays < 3");
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
// Copies only exist in cells with n >= 2, which are all kept, so the sum is exact.
const copies = cells.reduce((s: number, c) => s + (isObj(c) && typeof c.n === "number" && typeof c.u === "number" ? c.n - c.u : 0), 0);
if (totals.reprints !== copies) err("heat.totals.reprints", `${String(totals.reprints)} != sum(n - u) = ${copies}`);
const bytes = heatBytes.length;
if (bytes > 1.5 * 1024 * 1024) err("heat.json", `size ${bytes} B exceeds the 1.5 MB target`);

// ---- cells/<id>.json ----
const cellsDir = join(dir, "cells");
const files = existsSync(cellsDir) ? readdirSync(cellsDir).filter((f) => f.endsWith(".json")) : [];
for (const id of seenIds) if (!files.includes(`${id}.json`)) err("cells", `missing cells/${id}.json`);
for (const f of files) if (!seenIds.has(f.slice(0, -5))) err("cells", `cells/${f} is not listed in heat.json`);

/** One article object as in a cell file's `articles` (also used inside stories). */
function checkArticle(aw: string, a: Record<string, unknown>) {
  exactKeys(aw, a, ["title", "url", "source", "country", "lang", "time", "video", "reprints"], ["tone", "image"]);
  int(`${aw}.reprints`, a.reprints);
  for (const k of ["title", "url", "source", "country", "lang", "time", "video"]) str(`${aw}.${k}`, a[k]);
  if (typeof a.video === "string" && a.video !== "" && !isYouTubeVideoUrl(a.video)) err(`${aw}.video`, `not a YouTube video URL: ${a.video}`);
  if ("image" in a) str(`${aw}.image`, a.image);
  if ("tone" in a) num(`${aw}.tone`, a.tone, 1);
  if (typeof a.title === "string" && Array.from(a.title).length > 160) err(`${aw}.title`, "longer than 160 chars");
  if (typeof a.url !== "string" || !/^https?:\/\//.test(a.url)) err(`${aw}.url`, "not an http(s) URL");
  if (typeof a.country === "string" && a.country !== "" && !/^[A-Z]{2}$/.test(a.country)) err(`${aw}.country`, `not ISO alpha-2: ${a.country}`);
  if (typeof a.time !== "string" || !ISO_UTC.test(a.time)) err(`${aw}.time`, "not ISO 8601 UTC with Z");
  if (typeof a.image === "string" && a.image !== "" && !/^https?:\/\//.test(a.image)) err(`${aw}.image`, "not an http(s) URL");
}

/** At most one article per non-empty reprint key in a list; reprints never exceed the cell's copies. */
function uniqueKey(aw: string, a: Record<string, unknown>, keys: Set<string>, cell: Record<string, unknown>) {
  const key = typeof a.title === "string" ? reprintKey(a.title, typeof a.source === "string" ? a.source : "") : "";
  if (key && keys.has(key)) err(aw, `reprint key shown twice: ${JSON.stringify(key)}`);
  if (key) keys.add(key);
  if (!key && a.reprints !== 0) err(`${aw}.reprints`, "untitled article with reprints");
  if (typeof a.reprints === "number" && typeof cell.n === "number" && typeof cell.u === "number" && a.reprints > cell.n - cell.u) {
    err(`${aw}.reprints`, `${a.reprints} > n - u`);
  }
}

/** `stories` and `unclustered` (contract section "Stories"). */
let storiesChecked = 0;
function checkStories(w: string, cell: Record<string, unknown>) {
  int(`${w}.unclustered`, cell.unclustered);
  const stories = Array.isArray(cell.stories) ? (cell.stories as unknown[]) : (err(`${w}.stories`, "not an array"), []);
  if (stories.length > MAX_STORIES) err(`${w}.stories`, `${stories.length} stories > ${MAX_STORIES}`);
  let sum = 0;
  const shownUrls = new Set<string>();
  stories.forEach((s, i) => {
    const sw = `${w}.stories[${i}]`;
    if (!isObj(s)) return err(sw, "not an object");
    storiesChecked++;
    exactKeys(sw, s, ["n", "u", "o", "c", "i", "l", "t", "countries", "first", "last", "headline", "headlineSource", "headlineLang", "headlineUrl", "entities", "articles"]);
    int(`${sw}.n`, s.n, 3);
    int(`${sw}.u`, s.u, 1);
    int(`${sw}.o`, s.o);
    int(`${sw}.c`, s.c);
    int(`${sw}.i`, s.i);
    if (typeof s.u === "number" && typeof s.n === "number" && s.u > s.n) err(sw, "u > n");
    if (typeof s.i === "number" && typeof s.c === "number" && s.i > s.c) err(sw, "i > c");
    countryPairs(`${sw}.countries`, s.countries, Infinity);
    if (Array.isArray(s.countries)) {
      const cs = s.countries as unknown[][];
      if (cs.length !== s.c) err(`${sw}.countries`, `length ${cs.length} != c ${String(s.c)}`);
      const abroad = cell.home === "" ? cs.length : cs.filter((p) => Array.isArray(p) && p[0] !== cell.home).length;
      if (abroad !== s.i) err(`${sw}.i`, `${String(s.i)} != countries other than home (${abroad})`);
    }
    int(`${sw}.l`, s.l);
    num(`${sw}.t`, s.t, 1);
    if (typeof s.n === "number") sum += s.n;
    if (typeof s.o === "number" && typeof s.n === "number" && s.o > s.n) err(sw, "o > n");
    for (const k of ["first", "last"]) if (typeof s[k] !== "string" || !ISO_UTC.test(s[k] as string)) err(`${sw}.${k}`, "not ISO 8601 UTC with Z");
    if (typeof s.first === "string" && typeof s.last === "string" && s.first > s.last) err(sw, "first > last");
    for (const k of ["headline", "headlineSource", "headlineLang", "headlineUrl"]) str(`${sw}.${k}`, s[k]);
    if (typeof s.headlineUrl === "string" && s.headlineUrl !== "" && !/^https?:\/\//.test(s.headlineUrl)) err(`${sw}.headlineUrl`, "not an http(s) URL");
    if (s.headlineUrl === "" && s.headline !== "") err(`${sw}.headlineUrl`, "empty while the headline is not");
    if (typeof s.headline === "string" && Array.from(s.headline).length > 160) err(`${sw}.headline`, "longer than 160 chars");
    const ents = Array.isArray(s.entities) ? (s.entities as unknown[]) : (err(`${sw}.entities`, "not an array"), []);
    if (ents.length > 5) err(`${sw}.entities`, `${ents.length} > 5`);
    for (const e of ents) if (typeof e !== "string" || e === "" || e !== e.toLowerCase()) err(`${sw}.entities`, `not a lowercase string: ${JSON.stringify(e)}`);
    const arts = Array.isArray(s.articles) ? (s.articles as unknown[]) : (err(`${sw}.articles`, "not an array"), []);
    if (arts.length > 6) err(`${sw}.articles`, `${arts.length} > 6`);
    if (arts.length === 0) err(`${sw}.articles`, "empty");
    if (typeof s.n === "number" && arts.length > s.n) err(`${sw}.articles`, "more articles than n");
    const perOutlet = new Map<string, number>();
    const keys = new Set<string>();
    arts.forEach((a, j) => {
      const aw = `${sw}.articles[${j}]`;
      if (!isObj(a)) return err(aw, "not an object");
      checkArticle(aw, a);
      uniqueKey(aw, a, keys, cell);
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
/** Every story of every cell file, for the broadcast checks. */
const allStories: { cell: Record<string, unknown>; pos: number; s: Record<string, unknown> }[] = [];
let articlesChecked = 0;
for (const f of files) {
  const id = f.slice(0, -5);
  const w = `cells/${f}`;
  const cell = JSON.parse(readFileSync(join(cellsDir, f), "utf8")) as Record<string, unknown>;
  exactKeys(w, cell, ["id", "name", "home", "n", "u", "o", "c", "i", "l", "t", "topOutlets", "topCountries", "languages", "articles", "videos", "stories", "unclustered"], ["fid"]);
  // The place's GDELT FeatureID (added 2026-10-24): absent, or a non-empty id without "|", ";" or spaces.
  if ("fid" in cell && (typeof cell.fid !== "string" || !/^[^|;\s]+$/.test(cell.fid))) err(`${w}.fid`, `not a FeatureID: ${JSON.stringify(cell.fid)}`);
  int(`${w}.videos`, cell.videos);
  if (typeof cell.videos === "number" && typeof cell.n === "number" && cell.videos > cell.n) err(`${w}.videos`, "more than n");
  if (Array.isArray(cell.articles) && typeof cell.videos === "number") {
    const shown = (cell.articles as Record<string, unknown>[]).filter((a) => isObj(a) && a.video).length;
    if (shown > cell.videos) err(`${w}.videos`, `${cell.videos} < ${shown} articles shown with a video`);
  }
  checkStories(w, cell);
  if (Array.isArray(cell.stories)) (cell.stories as unknown[]).forEach((s, pos) => isObj(s) && allStories.push({ cell, pos, s }));
  if (cell.id !== id) err(`${w}.id`, `does not match file name`);
  str(`${w}.name`, cell.name);
  int(`${w}.n`, cell.n, 1);
  int(`${w}.u`, cell.u, 1);
  int(`${w}.o`, cell.o);
  int(`${w}.c`, cell.c);
  int(`${w}.i`, cell.i);
  str(`${w}.home`, cell.home);
  if (typeof cell.home === "string" && cell.home !== "" && !/^[A-Z]{2}$/.test(cell.home)) err(`${w}.home`, `not ISO alpha-2: ${cell.home}`);
  if (cell.home === "" && cell.i !== cell.c) err(`${w}.i`, "must equal c when home is empty");
  int(`${w}.l`, cell.l);
  num(`${w}.t`, cell.t, 1);
  const h = heatById.get(id);
  if (h) for (const k of ["name", "n", "u", "o", "c", "i", "l", "t"]) if (h[k] !== cell[k]) err(`${w}.${k}`, `differs from heat.json (${String(h[k])} vs ${String(cell[k])})`);
  pairs(`${w}.topOutlets`, cell.topOutlets, 10, (k) => k.length > 0);
  countryPairs(`${w}.topCountries`, cell.topCountries, Infinity);
  if (Array.isArray(cell.topCountries) && cell.topCountries.length !== cell.c) err(`${w}.topCountries`, `length ${cell.topCountries.length} != c ${String(cell.c)}`);
  pairs(`${w}.languages`, cell.languages, 10, (k) => /^[a-z]{2,3}$/.test(k) || k === "");
  const arts = Array.isArray(cell.articles) ? (cell.articles as unknown[]) : (err(`${w}.articles`, "not an array"), []);
  if (arts.length > 50) err(`${w}.articles`, `${arts.length} > 50`);
  if (typeof cell.n === "number" && arts.length > cell.n) err(`${w}.articles`, "more articles than n");
  const urls = new Set<string>();
  const keys = new Set<string>();
  const perOutlet = new Map<string, number>();
  arts.forEach((a, i) => {
    const aw = `${w}.articles[${i}]`;
    if (!isObj(a)) return err(aw, "not an object");
    checkArticle(aw, a);
    uniqueKey(aw, a, keys, cell);
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
    exactKeys(w, f, ["at", "file", "windowHours", "totals"], ["newest", "added"]);
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
    // `newest`, `added` and the row element `a` (rows have 4 or 5 elements).
    for (const [where, msg] of checkStepFields(f, fcells)) err(where.startsWith("rows") ? `${fw}.${where.replace("rows", "cells")}` : `${w}.${where}`, msg);
    fcells.forEach((c, j) => {
      const cw = `${fw}.cells[${j}]`;
      if (!Array.isArray(c) || c.length < 4) return;
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
    if (last.newest !== heat.newestArticleAt) err("history/index last frame", `newest ${String(last.newest)} != heat.newestArticleAt ${String(heat.newestArticleAt)}`);
    // The index keeps the five original totals; heat.json also has `reprints`.
    const { reprints: _copies, ...indexTotals } = totals;
    if (JSON.stringify(last.totals) !== JSON.stringify(indexTotals)) err("history/index last frame", "totals differ from heat.json");
    if (typeof heat.generatedAt === "string") {
      const cutoff = Date.parse(heat.generatedAt) - 24 * 3_600_000;
      frames.forEach((f, i) => {
        if (isObj(f) && typeof f.at === "string" && Date.parse(f.at) < cutoff) err(`history/index.frames[${i}]`, `${f.at} is older than 24h`);
      });
      const lastFile = join(historyDir, `${heat.generatedAt.replace(/[-:]/g, "")}.json`);
      if (existsSync(lastFile)) {
        const lf = JSON.parse(readFileSync(lastFile, "utf8")) as { cells?: unknown };
        const expected = cells.filter(isObj).map((c) => [c.id, c.lat, c.lon, c.n]);
        const rows = Array.isArray(lf.cells) ? lf.cells.map((r) => (Array.isArray(r) ? r.slice(0, 4) : r)) : lf.cells;
        if (JSON.stringify(rows) !== JSON.stringify(expected)) err(`history/${lastFile}`, "current frame's cells differ from heat.json cells");
      }
    }
  }

  const onDisk = readdirSync(historyDir).filter((f) => f !== "index.json");
  for (const f of onDisk) if (!listed.has(f)) err("history", `${f} is not listed in index.json`);
}

// ---- broadcast.json (contract section "Broadcast") ----
let broadcastSummary = "missing";
const broadcastPath = join(dir, "broadcast.json");
if (!existsSync(broadcastPath)) {
  err("broadcast", "missing broadcast.json");
} else {
  const bc = JSON.parse(readFileSync(broadcastPath, "utf8")) as Record<string, unknown>;
  exactKeys("broadcast", bc, ["generatedAt", "windowHours", "baselineDays", "slots"]);
  for (const k of ["generatedAt", "windowHours", "baselineDays"]) if (bc[k] !== heat[k]) err(`broadcast.${k}`, `differs from heat.json (${String(bc[k])} vs ${String(heat[k])})`);
  const gated = typeof heat.baselineDays !== "number" || heat.baselineDays < BROADCAST_MIN_BASELINE_DAYS;
  const slots = Array.isArray(bc.slots) ? (bc.slots as unknown[]) : (err("broadcast.slots", "not an array"), []);
  if (slots.length !== SLOT_ORDER.length) err("broadcast.slots", `${slots.length} slots, expected ${SLOT_ORDER.length}`);

  type Cand = (typeof allStories)[number] & { h: Record<string, unknown> };
  const cands: Cand[] = allStories.flatMap((c) => {
    const h = heatById.get(c.cell.id as string);
    return h ? [{ ...c, h }] : [];
  });
  const keyOfCand = (c: Cand) => `${String(c.cell.id)}#${c.pos}`;
  const used = new Set<string>();
  const n = (o: Record<string, unknown>, k: string) => (typeof o[k] === "number" ? (o[k] as number) : NaN);
  // Each slot's qualifying rule and the measure it maximises (ordinary: the kinds share is
  // ingest-internal, so only its outlet and country thresholds can be checked here).
  // Metrics compare lexicographically (loudest: independent voices min(u, o), then outlets o).
  const rules: Record<string, { ok: (c: Cand) => boolean; metric: (c: Cand) => number[] } | undefined> = {
    loudest: { ok: () => true, metric: (c) => [voices({ u: n(c.s, "u"), o: n(c.s, "o") }), n(c.s, "o")] },
    planet: { ok: (c) => n(c.s, "o") >= PLANET_MIN_O && c.cell.home !== "", metric: (c) => [n(c.s, "i")] },
    brightest: {
      ok: (c) => n(c.s, "o") >= BRIGHTEST_MIN_O && n(c.s, "c") >= BRIGHTEST_MIN_C && n(c.s, "n") >= BRIGHTEST_MIN_N,
      metric: (c) => [n(c.s, "t")],
    },
    faint: { ok: (c) => n(c.h, "b") <= FAINT_MAX_B && n(c.s, "o") >= FAINT_MIN_O && n(c.s, "c") >= FAINT_MIN_C, metric: (c) => [n(c.s, "o")] },
  };
  /** a > b lexicographically. */
  const above = (a: number[], b: number[]) => {
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] > b[k];
    return false;
  };
  const filled: string[] = [];

  slots.forEach((slot, i) => {
    const w = `broadcast.slots[${i}]`;
    if (!isObj(slot)) return err(w, "not an object");
    const id = SLOT_ORDER[i];
    if (slot.id !== id) err(`${w}.id`, `expected "${id}" (fixed order), got ${JSON.stringify(slot.id)}`);
    if (typeof slot.available !== "boolean") err(`${w}.available`, "not a boolean");
    const baselineSlot = id === "rising" || id === "faint";
    // Unused stories that meet what every slot requires: u >= MIN_STORY_U and a headline.
    const free = cands.filter((c) => !used.has(keyOfCand(c)) && n(c.s, "u") >= MIN_STORY_U && c.s.headline !== "");

    if (slot.available !== true) {
      exactKeys(w, slot, ["id", "available", "reason"], slot.reason === "baseline" ? ["availableFrom"] : []);
      if (slot.reason !== "baseline" && slot.reason !== "none") err(`${w}.reason`, `expected "baseline" or "none", got ${JSON.stringify(slot.reason)}`);
      if (baselineSlot && gated && slot.reason !== "baseline") err(`${w}.reason`, "must be \"baseline\" while baselineDays < 3");
      if (slot.reason === "baseline" && (!baselineSlot || !gated)) err(`${w}.reason`, "\"baseline\" only for rising/faint while baselineDays < 3");
      if (slot.reason === "baseline" && (typeof slot.availableFrom !== "string" || !(slot.availableFrom === "" || /^\d{4}-\d{2}-\d{2}$/.test(slot.availableFrom)))) {
        err(`${w}.availableFrom`, `expected YYYY-MM-DD (or "" without a baseline), got ${JSON.stringify(slot.availableFrom)}`);
      }
      if (typeof slot.availableFrom === "string" && typeof heat.generatedAt === "string" && slot.availableFrom !== "" && slot.availableFrom <= heat.generatedAt.slice(0, 10)) {
        err(`${w}.availableFrom`, "not after today");
      }
      // "none" must be true: no unused story meets the rule.
      if (slot.reason === "none") {
        const rule = rules[id];
        if (rule && free.some(rule.ok)) err(w, `reason "none" but ${free.filter(rule.ok).length} unused stories qualify`);
        if (id === "rising" && free.some((c) => n(c.h, "n") >= RISING_MIN_N)) err(w, "reason \"none\" but a cell with n >= 20 has an unused story");
      }
      return;
    }

    const optional = id === "rising" ? ["ratio", "b"] : id === "faint" ? ["b"] : [];
    exactKeys(w, slot, ["id", "available", "cell", "story", ...optional]);
    if (baselineSlot && gated) err(w, "available while baselineDays < 3");
    const cell = isObj(slot.cell) ? slot.cell : (err(`${w}.cell`, "not an object"), {});
    const story = isObj(slot.story) ? slot.story : (err(`${w}.story`, "not an object"), {});
    exactKeys(`${w}.cell`, cell, ["id", "name", "lat", "lon", "home"]);
    exactKeys(`${w}.story`, story, ["headline", "headlineSource", "headlineLang", "headlineUrl", "n", "u", "o", "c", "i", "l", "t", "first", "last"]);
    const h = heatById.get(cell.id as string);
    if (!h) return err(`${w}.cell.id`, `${String(cell.id)} is not a cell of heat.json`);
    for (const k of ["lat", "lon", "name"]) if (cell[k] !== h[k]) err(`${w}.cell.${k}`, `differs from heat.json (${String(cell[k])} vs ${String(h[k])})`);
    const match = cands.find((c) => c.cell.id === cell.id && Object.keys(story).every((k) => c.s[k] === story[k]));
    if (!match) return err(`${w}.story`, "no story in that cell file matches it field for field");
    if (cell.home !== match.cell.home) err(`${w}.cell.home`, "differs from the cell file");
    if (used.has(keyOfCand(match))) err(`${w}.story`, "story already used by an earlier slot");
    used.add(keyOfCand(match));
    filled.push(id);
    const s = match.s;
    if (n(s, "u") < MIN_STORY_U) err(w, `story u ${String(s.u)} < ${MIN_STORY_U} (the floor for every slot)`);
    if (s.headline === "") err(`${w}.story.headline`, "empty; a filled slot must carry an outlet's headline");

    if (id === "rising") {
      if (h.n as number < RISING_MIN_N) err(w, `cell n ${String(h.n)} < ${RISING_MIN_N}`);
      if (slot.b !== h.b) err(`${w}.b`, `differs from heat.json b ${String(h.b)}`);
      if (slot.ratio !== risingRatio(h.n as number, h.b as number)) err(`${w}.ratio`, `expected ${risingRatio(h.n as number, h.b as number)}`);
      num(`${w}.ratio`, slot.ratio, 1);
      // No other cell with an unused story rises higher; within the cell, the most outlets.
      const top = Math.max(...free.filter((c) => n(c.h, "n") >= RISING_MIN_N).map((c) => risingRatio(n(c.h, "n"), n(c.h, "b"))));
      if (typeof slot.ratio === "number" && slot.ratio < top) err(`${w}.ratio`, `${slot.ratio} but a cell with an unused story reaches ${top}`);
      const inCell = Math.max(...free.filter((c) => c.cell.id === cell.id).map((c) => n(c.s, "o")));
      if (n(s, "o") < inCell) err(w, `story has o ${String(s.o)} but the cell has an unused story with o ${inCell}`);
    } else if (id === "ordinary") {
      if (n(s, "o") < ORDINARY_MIN_O || n(s, "c") < ORDINARY_MIN_C) err(w, `o ${String(s.o)} / c ${String(s.c)} below the ordinary thresholds`);
    } else {
      const rule = rules[id]!;
      if (!rule.ok(match)) err(w, "story does not meet the slot's thresholds");
      const better = free.find((c) => rule.ok(c) && above(rule.metric(c), rule.metric(match)));
      if (better) err(w, `[${rule.metric(match).join(", ")}] but an unused qualifying story reaches [${rule.metric(better).join(", ")}]`);
      if (id === "faint" && slot.b !== h.b) err(`${w}.b`, `differs from heat.json b ${String(h.b)}`);
      if (id === "faint") num(`${w}.b`, slot.b, 1);
    }
  });
  broadcastSummary = `${filled.length}/6 slots filled (${filled.join(", ") || "none"})`;
}

// ---- stories.json (contract section "Top stories") ----
let topStoriesSummary = "missing";
const topStoriesPath = join(dir, "stories.json");
if (!existsSync(topStoriesPath)) {
  err("stories", "missing stories.json");
} else {
  const tsBytes = readFileSync(topStoriesPath);
  const tf = JSON.parse(tsBytes.toString("utf8")) as Record<string, unknown>;
  exactKeys("stories", tf, ["generatedAt", "windowHours", "stories"]);
  for (const k of ["generatedAt", "windowHours"]) if (tf[k] !== heat[k]) err(`stories.${k}`, `differs from heat.json (${String(tf[k])} vs ${String(heat[k])})`);
  const list = Array.isArray(tf.stories) ? (tf.stories as unknown[]) : (err("stories.stories", "not an array"), []);
  if (list.length > TOP_STORIES_MAX) err("stories.stories", `${list.length} > ${TOP_STORIES_MAX}`);
  const n = (o: Record<string, unknown>, k: string) => (typeof o[k] === "number" ? (o[k] as number) : NaN);
  /** The first confirmation level a cell file's story text matches, or null (contract "Top stories", Confirmation). */
  const confirmedLevel = (cell: Record<string, unknown>, s: Record<string, unknown>) => {
    const articles = (Array.isArray(s.articles) ? (s.articles as unknown[]) : []).filter(isObj).map((a) => ({ title: String(a.title ?? ""), lang: String(a.lang ?? "") }));
    const text = { headline: String(s.headline ?? ""), headlineLang: String(s.headlineLang ?? ""), articles };
    // With the committed place-names table (ingest/data/placenames.json), as the ingest uses it.
    return confirmStory({ name: String(cell.name ?? ""), home: String(cell.home ?? ""), fid: typeof cell.fid === "string" ? cell.fid : undefined }, text)?.level ?? null;
  };
  const homes = new Map<string, number>();
  const ids = new Set<string>();
  /** Reprint key of each entry's headline -> its index (one per event). */
  const events = new Map<string, number>();
  const got: string[] = [];
  list.forEach((e, i) => {
    const w = `stories.stories[${i}]`;
    if (!isObj(e)) return err(w, "not an object");
    exactKeys(w, e, ["rank", "cell", "story", "confirmed"]);
    if (!(CONFIRMATION_LEVELS as readonly unknown[]).includes(e.confirmed)) err(`${w}.confirmed`, `expected one of ${CONFIRMATION_LEVELS.join(", ")}, got ${JSON.stringify(e.confirmed)}`);
    if (e.rank !== i + 1) err(`${w}.rank`, `expected ${i + 1}, got ${JSON.stringify(e.rank)}`);
    const cell = isObj(e.cell) ? e.cell : (err(`${w}.cell`, "not an object"), {});
    const story = isObj(e.story) ? e.story : (err(`${w}.story`, "not an object"), {});
    exactKeys(`${w}.cell`, cell, ["id", "name", "lat", "lon", "home"]);
    exactKeys(`${w}.story`, story, ["headline", "headlineSource", "headlineLang", "headlineUrl", "n", "u", "o", "c", "i", "l", "t", "first", "last"]);
    const id = String(cell.id);
    if (ids.has(id)) err(`${w}.cell.id`, `duplicate cell ${id} (one story per place)`);
    ids.add(id);
    const home = String(cell.home);
    homes.set(home, (homes.get(home) ?? 0) + 1);
    const h = heatById.get(id);
    if (!h) return err(`${w}.cell.id`, `${id} is not a cell of heat.json`);
    for (const k of ["lat", "lon", "name"]) if (cell[k] !== h[k]) err(`${w}.cell.${k}`, `differs from heat.json (${String(cell[k])} vs ${String(h[k])})`);
    if (n(story, "u") < MIN_STORY_U) err(`${w}.story.u`, `${String(story.u)} < ${MIN_STORY_U}`);
    if (typeof story.headline !== "string" || story.headline === "") err(`${w}.story.headline`, "empty; an entry must carry an outlet's headline");
    else {
      const key = reprintKey(story.headline, String(story.headlineSource ?? ""));
      const prior = events.get(key);
      if (key !== "" && prior !== undefined) err(`${w}.story.headline`, `same reprint key as entry ${prior + 1} (one story per event)`);
      else if (key !== "") events.set(key, i);
    }
    const match = allStories.find((c) => c.cell.id === id && Object.keys(story).every((k) => c.s[k] === story[k]));
    if (!match) return err(`${w}.story`, "no story in that cell file matches it field for field");
    if (cell.home !== match.cell.home) err(`${w}.cell.home`, "differs from the cell file");
    // Confirmation, recomputed from the cell file's name, home, headline and saved titles.
    const level = confirmedLevel(match.cell, match.s);
    if (level === null) err(`${w}.confirmed`, `unconfirmed: neither the headline nor a saved title names ${String(match.cell.name)}`);
    else if (e.confirmed !== level) err(`${w}.confirmed`, `${JSON.stringify(e.confirmed)} but the first level that matches is "${level}"`);
    got.push(`${id}#${match.pos}`);
  });
  for (const [home, k] of homes) {
    const cap = home === "" ? TOP_STORIES_UNKNOWN_HOME_MAX : TOP_STORIES_PER_COUNTRY;
    if (k > cap) err("stories.stories", `home ${JSON.stringify(home)} appears ${k} times, more than ${cap}`);
  }
  // The rule, recomputed from the cell files: rank by o desc, then n desc, first asc, cell id,
  // position; unconfirmed stories skipped first, then one per cell, one per event (non-empty
  // headline reprint key, checked before the country), at most two per country, one for all
  // unknown homes, at most 12.
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const ranked = allStories
    .filter((c) => heatById.has(c.cell.id as string) && n(c.s, "u") >= MIN_STORY_U && typeof c.s.headline === "string" && c.s.headline !== "")
    .sort((a, b) => n(b.s, "o") - n(a.s, "o") || n(b.s, "n") - n(a.s, "n") || cmp(String(a.s.first), String(b.s.first)) || cmp(String(a.cell.id), String(b.cell.id)) || a.pos - b.pos);
  const want: string[] = [];
  const wantCells = new Set<string>();
  const wantHomes = new Map<string, number>();
  const wantEvents = new Set<string>();
  for (const c of ranked) {
    if (want.length >= TOP_STORIES_MAX) break;
    if (confirmedLevel(c.cell, c.s) === null) continue;
    const home = String(c.cell.home);
    const had = wantHomes.get(home) ?? 0;
    const key = reprintKey(String(c.s.headline), String(c.s.headlineSource ?? ""));
    if (wantCells.has(String(c.cell.id)) || (key !== "" && wantEvents.has(key))) continue;
    if (had >= (home === "" ? TOP_STORIES_UNKNOWN_HOME_MAX : TOP_STORIES_PER_COUNTRY)) continue;
    wantCells.add(String(c.cell.id));
    if (key !== "") wantEvents.add(key);
    wantHomes.set(home, had + 1);
    want.push(`${String(c.cell.id)}#${c.pos}`);
  }
  if (got.length === list.length && got.join(",") !== want.join(",")) {
    const k = want.findIndex((x, j) => x !== got[j]);
    err("stories.stories", `does not follow the rule: entry ${k + 1} is ${got[k] ?? "(none)"}, expected ${want[k] ?? "(none)"} (${want.length} expected, ${got.length} given)`);
  }
  topStoriesSummary = `${tsBytes.length} bytes, ${list.length} stories`;
}

// ---- topics.json (contract section "Topics") ----
let topicsSummary = "missing";
const topicsPath = join(dir, "topics.json");
if (!existsSync(topicsPath)) {
  err("topics", "missing topics.json");
} else {
  const topicsBytes = readFileSync(topicsPath);
  const tf = JSON.parse(topicsBytes.toString("utf8")) as Record<string, unknown>;
  exactKeys("topics", tf, ["generatedAt", "topics"]);
  if (tf.generatedAt !== heat.generatedAt) err("topics.generatedAt", `differs from heat.json (${String(tf.generatedAt)} vs ${String(heat.generatedAt)})`);
  const list = Array.isArray(tf.topics) ? (tf.topics as unknown[]) : (err("topics.topics", "not an array"), []);
  if (list.length > MAX_TOPICS) err("topics.topics", `${list.length} > ${MAX_TOPICS}`);
  // n of (name, cell) recomputed from the cell files: the sum of n of the cell's stories carrying it.
  const storyN = new Map<string, number>();
  for (const { cell, s } of allStories) {
    if (!Array.isArray(s.entities) || typeof s.n !== "number") continue;
    for (const e of new Set(s.entities as string[])) {
      const k = `${String(cell.id)}
${e}`;
      storyN.set(k, (storyN.get(k) ?? 0) + s.n);
    }
  }
  const names = new Set<string>();
  let prev: [string, number] | null = null;
  list.forEach((t, i) => {
    const w = `topics.topics[${i}]`;
    if (!Array.isArray(t) || t.length !== 3 || typeof t[0] !== "string" || !Number.isInteger(t[1]) || !Array.isArray(t[2])) {
      return err(w, `expected [name, total, [[cellId, n], ...]], got ${JSON.stringify(t).slice(0, 120)}`);
    }
    const [name, total, tcells] = t as [string, number, unknown[]];
    if (names.has(name)) err(w, `duplicate name ${JSON.stringify(name)}`);
    names.add(name);
    if (name !== name.toLowerCase()) err(w, `name not lowercase: ${JSON.stringify(name)}`);
    if (isJunkTopic(name)) err(w, `junk name ${JSON.stringify(name)}`);
    if (total < TOPIC_MIN_TOTAL) err(w, `total ${total} < ${TOPIC_MIN_TOTAL}`);
    if (prev && (prev[1] < total || (prev[1] === total && prev[0] >= name))) err(w, "not sorted by total desc, then name");
    prev = [name, total];
    if (tcells.length === 0 || tcells.length > TOPIC_MAX_CELLS) err(w, `${tcells.length} cells, expected 1..${TOPIC_MAX_CELLS}`);
    let sum = 0;
    const ids = new Set<string>();
    tcells.forEach((p, j) => {
      const pw = `${w}[2][${j}]`;
      if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== "string" || !Number.isInteger(p[1]) || p[1] < 1) {
        return err(pw, `expected [cellId, positive int], got ${JSON.stringify(p)}`);
      }
      const [id, n] = p as [string, number];
      if (!heatById.has(id)) err(pw, `${id} is not a cell of heat.json`);
      if (ids.has(id)) err(pw, `duplicate cell ${id}`);
      ids.add(id);
      sum += n;
      const q = tcells[j - 1] as [string, number] | undefined;
      if (Array.isArray(q) && (q[1] < n || (q[1] === n && q[0] >= id))) err(pw, "cells not sorted by n desc, then id");
      const expected = storyN.get(`${id}
${name}`) ?? 0;
      if (n !== expected) err(pw, `n ${n} != ${expected}, the sum of n of that cell's stories carrying ${JSON.stringify(name)}`);
    });
    if (sum !== total) err(w, `total ${total} != sum of its cells ${sum}`);
  });
  topicsSummary = `${topicsBytes.length} bytes, ${list.length} topics`;
}

console.log(`checked ${dir}`);
console.log(`  heat.json: ${bytes} bytes, ${cells.length} cells`);
console.log(`  cell files: ${files.length}, articles checked: ${articlesChecked}, stories checked: ${storiesChecked}`);
console.log(`  history: ${frameCount} frames, largest frame ${largestFrame} bytes`);
console.log(`  broadcast: ${broadcastSummary}`);
console.log(`  stories: ${topStoriesSummary}`);
console.log(`  topics: ${topicsSummary}`);
for (const w of warnings) console.log(`  WARN ${w}`);
if (errors.length) {
  console.log(`FAIL: ${errors.length}${errors.length >= 200 ? "+" : ""} violations`);
  for (const e of errors) console.log(`  - ${e}`);
  process.exit(1);
}
console.log("OK: heat.json, every cell file, history/index.json, every frame, broadcast.json, stories.json and topics.json match docs/DATA-CONTRACT.md");
