/**
 * Draw the weekly audit's four samples (docs/audits/README.md) from a snapshot.
 *   npm run audit-sample -- <dir>                       # reads <dir>/heat.json, stories.json and cells/*.json
 *   npm run audit-sample -- <dir> --seed 20261024       # seed: default is the snapshot's UTC date as YYYYMMDD
 *   npm run audit-sample -- <dir> --fetch               # first saves the live heat.json, stories.json and every
 *                                                       # cell a sample reads into <dir>
 *   npm run audit-sample -- <dir> --out ../docs/audits  # writes YYYY-MM-DD-{placement,grouping,top12,headlines}.csv
 *   npm run audit-sample -- --fetch --out <dir>         # snapshot and CSVs in the same directory
 * YYYY-MM-DD is the seed's date. `--out x-placement.csv` writes the placement file there and the
 * others beside it as x-grouping.csv and so on. Without --out the placement CSV goes to stdout and
 * the others are not written. The columns for the auditor are empty; the seed, the snapshot time,
 * the counts and every drawn placement cell and story go to stderr.
 *
 * Placement, as the first audit (2026-10-24) ran it in Python:
 *   - cells with n >= 10, sorted by (-n, id); the first 20 are "top20";
 *   - 60 cells drawn by weight n without replacement (Efraimidis-Spirakis: key = U^(1/n), the 60
 *     largest keys; ties on the key go to the larger id); a drawn top-20 cell is "top20+weighted";
 *   - in each chosen cell, top 20 first and then the drawn cells in key order: the first story,
 *     plus one story chosen at random among the others with u >= 3, from the same generator.
 * The generator is Python's random.Random(seed) reimplemented below (MT19937 seeded by
 * init_by_array, random() from two 32-bit draws, choice() by rejection on getrandbits), so this
 * script draws exactly what the first audit's Python sampler drew. Math.pow and C pow can differ
 * in the last bit; that changes the draw only if two keys tie to 1 ulp.
 *
 * The other three (added 2026-10-27), each from a fresh generator on the same seed, so none
 * depends on another's draws:
 *   - grouping: in the six measured cells (MEASURED), every (story, article) pair of a full story
 *     whose article is not the headline's own copy (not its headlineUrl, not its title folded to
 *     letters and digits); GROUPING pairs drawn uniformly without replacement (sampleIndices),
 *     listed in cell, story and article order;
 *   - top12: every entry of stories.json, in rank order;
 *   - headlines: HEADLINES stories, full and compact, with a non-empty headline, from the six
 *     cells, drawn the same way.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const SITE_DATA = "https://currentsbtw.github.io/today-on-earth/data";
const MIN_N = 10;
const TOP = 20;
const DRAWN = 60;
const MIN_U = 3;
export const COLUMNS = [
  "idx", "cell_id", "name", "home", "sample", "pick", "cell_n", "headline", "source", "lang",
  "source_known", "label", "quality", "cause", "note",
];
/** The six cells grouping and headlines are measured on (docs/PLAN.md, bar 2). */
export const MEASURED = [
  { id: "831fb4fffffffff", label: "Paris" },
  { id: "83194afffffffff", label: "London" },
  { id: "832aa8fffffffff", label: "Washington" },
  { id: "832aacfffffffff", label: "New Jersey" },
  { id: "834ba0fffffffff", label: "Taipei" },
  { id: "833da1fffffffff", label: "New Delhi" },
];
const GROUPING = 100;
const HEADLINES = 60;
export const GROUPING_COLUMNS = [
  "idx", "cell_id", "name", "story_headline", "story_source", "article_title", "article_source", "article_lang",
  "article_url", "label", "note",
];
export const TOP12_COLUMNS = [
  "rank", "cell_id", "name", "home", "headline", "source", "lang", "confirmed", "label", "source_known", "note",
];
export const HEADLINES_COLUMNS = ["idx", "cell_id", "name", "headline", "source", "source_known", "note"];

/** Python's random.Random: MT19937 with CPython's seeding, random() and _randbelow(). */
export class PyRandom {
  private mt = new Uint32Array(624);
  private mti = 624;
  constructor(seed: number) {
    // random.seed(int): abs(seed) split into 32-bit words, least significant first.
    let n = BigInt(Math.abs(Math.trunc(seed)));
    const key: number[] = [];
    while (n > 0n) {
      key.push(Number(n & 0xffffffffn));
      n >>= 32n;
    }
    if (key.length === 0) key.push(0);
    this.initByArray(key);
  }
  private initGenrand(s: number) {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < 624; i++) mt[i] = (Math.imul(1812433253, mt[i - 1] ^ (mt[i - 1] >>> 30)) + i) >>> 0;
    this.mti = 624;
  }
  private initByArray(key: number[]) {
    const mt = this.mt;
    this.initGenrand(19650218);
    let i = 1;
    let j = 0;
    for (let k = Math.max(624, key.length); k > 0; k--) {
      mt[i] = ((mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1664525)) + key[j] + j) >>> 0;
      i++;
      j++;
      if (i >= 624) {
        mt[0] = mt[623];
        i = 1;
      }
      if (j >= key.length) j = 0;
    }
    for (let k = 623; k > 0; k--) {
      mt[i] = ((mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1566083941)) - i) >>> 0;
      i++;
      if (i >= 624) {
        mt[0] = mt[623];
        i = 1;
      }
    }
    mt[0] = 0x80000000;
  }
  uint32(): number {
    const mt = this.mt;
    if (this.mti >= 624) {
      const mix = (a: number, b: number, c: number) => {
        const y = (a & 0x80000000) | (b & 0x7fffffff);
        return (c ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0)) >>> 0;
      };
      let kk = 0;
      for (; kk < 624 - 397; kk++) mt[kk] = mix(mt[kk], mt[kk + 1], mt[kk + 397]);
      for (; kk < 623; kk++) mt[kk] = mix(mt[kk], mt[kk + 1], mt[kk + 397 - 624]);
      mt[623] = mix(mt[623], mt[0], mt[396]);
      this.mti = 0;
    }
    let y = mt[this.mti++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }
  /** random.random(): 53 bits from two draws. */
  random(): number {
    const a = this.uint32() >>> 5;
    const b = this.uint32() >>> 6;
    return (a * 67108864 + b) / 9007199254740992;
  }
  /** _randbelow(n) for 0 < n < 2^32: getrandbits(bit_length(n)) until below n. */
  randbelow(n: number): number {
    const k = n.toString(2).length;
    let r = this.uint32() >>> (32 - k);
    while (r >= n) r = this.uint32() >>> (32 - k);
    return r;
  }
  /** random.choice(seq) through _randbelow(len). */
  choice<T>(seq: T[]): T {
    const n = seq.length;
    if (n === 0) throw new Error("choice from an empty list");
    return seq[this.randbelow(n)];
  }
}

/**
 * k distinct indices below n, uniformly, by a partial Fisher-Yates shuffle with randbelow
 * (not Python's random.sample), returned ascending; all of them when n <= k.
 */
export function sampleIndices(rng: PyRandom, n: number, k: number): number[] {
  const pool = Array.from({ length: n }, (_, i) => i);
  const m = Math.min(k, n);
  for (let i = 0; i < m; i++) {
    const j = i + rng.randbelow(n - i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, m).sort((a, b) => a - b);
}

interface HeatCell { id: string; n: number }
interface Article { title?: string; url?: string; source?: string; lang?: string }
interface Story {
  headline?: string; headlineSource?: string; headlineLang?: string; headlineUrl?: string; u?: number;
  compact?: boolean; articles?: Article[];
}
interface CellFile { name?: string; home?: string; stories?: Story[] }
interface TopStories {
  generatedAt?: string;
  stories?: { rank: number; cell: { id: string; name?: string; home?: string }; story: Story; confirmed?: string }[];
}

const csvField = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
const csvLine = (row: string[]) => row.map(csvField).join(",");
const fail = (msg: string): never => {
  console.error(msg);
  process.exit(1);
};
/** Folded form for "is this the headline's own copy": lowercase letters and digits only. */
const fold = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

async function fetchTo(url: string, path: string) {
  const res = await fetch(url);
  if (!res.ok) fail(`${url}: HTTP ${res.status}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const args = process.argv.slice(2);
  let dirArg: string | undefined;
  let seedArg: string | undefined;
  let outArg: string | undefined;
  let fetchLive = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--seed") seedArg = args[++i];
    else if (args[i] === "--out") outArg = args[++i];
    else if (args[i] === "--fetch") fetchLive = true;
    else if (!dirArg) dirArg = args[i];
    else fail(`unexpected argument ${args[i]}`);
  }
  const outIsCsv = outArg !== undefined && outArg.endsWith(".csv");
  // The snapshot directory: the argument, else an --out directory.
  const snapArg = dirArg ?? (outArg !== undefined && !outIsCsv ? outArg : undefined);
  if (!snapArg) fail("usage: audit-sample [<dir>] [--seed YYYYMMDD] [--fetch] [--out <dir> | <YYYY-MM-DD-placement.csv>]");
  const dir = resolve(snapArg!);
  const cellsDir = join(dir, "cells");
  mkdirSync(cellsDir, { recursive: true });
  const heatPath = join(dir, "heat.json");
  const storiesPath = join(dir, "stories.json");
  if (fetchLive) {
    await fetchTo(`${SITE_DATA}/heat.json`, heatPath);
    await fetchTo(`${SITE_DATA}/stories.json`, storiesPath);
  }
  if (!existsSync(heatPath)) fail(`no heat.json in ${dir}`);
  const heat = JSON.parse(readFileSync(heatPath, "utf8")) as { generatedAt: string; cells: HeatCell[] };

  const seedText = seedArg ?? heat.generatedAt.slice(0, 10).replaceAll("-", "");
  if (!/^\d{8}$/.test(seedText)) fail(`seed must be YYYYMMDD, got ${seedText}`);
  const seed = Number(seedText);
  const date = `${seedText.slice(0, 4)}-${seedText.slice(4, 6)}-${seedText.slice(6)}`;
  const rng = new PyRandom(seed);

  const cells = heat.cells.filter((c) => c.n >= MIN_N);
  cells.sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const byId = new Map(cells.map((c) => [c.id, c]));
  const keyed = cells.map((c) => ({ key: rng.random() ** (1 / c.n), id: c.id }));
  keyed.sort((a, b) => b.key - a.key || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));

  const chosen: { id: string; tag: string }[] = cells.slice(0, TOP).map((c) => ({ id: c.id, tag: "top20" }));
  for (const { id } of keyed.slice(0, DRAWN)) {
    const hit = chosen.find((c) => c.id === id);
    if (hit) hit.tag += "+weighted";
    else chosen.push({ id, tag: "weighted" });
  }

  let top: TopStories | undefined;
  if (existsSync(storiesPath)) {
    top = JSON.parse(readFileSync(storiesPath, "utf8")) as TopStories;
    if (top.generatedAt !== heat.generatedAt) {
      fail(`stories.json is of ${top.generatedAt}, heat.json of ${heat.generatedAt}: a run landed between the fetches; fetch again`);
    }
  }

  // Every cell file a sample reads. With --fetch they are all saved fresh, so a reused
  // directory never mixes snapshots; without it, a missing placement cell is an error and a
  // missing measured cell drops grouping and headlines (top-12 cells are saved for judging).
  const wanted = [...new Set([...chosen.map((c) => c.id), ...MEASURED.map((m) => m.id), ...(top?.stories ?? []).map((e) => e.cell.id)])];
  if (fetchLive) for (const id of wanted) await fetchTo(`${SITE_DATA}/cells/${id}.json`, join(cellsDir, `${id}.json`));
  const readCell = (id: string) => {
    const path = join(cellsDir, `${id}.json`);
    return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as CellFile) : undefined;
  };
  for (const { id } of chosen) {
    if (!readCell(id)) fail(`missing ${join(cellsDir, `${id}.json`)} (run with --fetch to save the live cells, right after the live heat.json)`);
  }

  // Placement: unchanged from the first audit.
  console.error(`seed ${seedText}  snapshot ${heat.generatedAt}  cells with n >= ${MIN_N}: ${cells.length}  chosen: ${chosen.length}`);
  const lines = [COLUMNS.join(",")];
  let idx = 0;
  let stories = 0;
  let empty = 0;
  let blankHeadlines = 0;
  for (const { id, tag } of chosen) {
    const cf = readCell(id)!;
    const st = cf.stories ?? [];
    const cellN = byId.get(id)!.n;
    if (st.length === 0) {
      console.error(`  ${tag.padEnd(14)} ${id} n=${cellN} ${cf.name ?? ""}: no stories`);
      idx++;
      empty++;
      continue;
    }
    const picks: [string, Story][] = [["first", st[0]]];
    const rest = st.slice(1).filter((s) => (s.u ?? 0) >= MIN_U);
    if (rest.length > 0) picks.push(["random", rng.choice(rest)]);
    console.error(`  ${tag.padEnd(14)} ${id} n=${cellN} ${cf.name ?? ""}`);
    for (const [pick, s] of picks) {
      const headline = s.headline ?? "";
      if (!headline) blankHeadlines++;
      console.error(`      ${pick.padEnd(6)} ${s.headlineSource ?? ""}: ${headline}`);
      const row = [String(idx), id, cf.name ?? "", cf.home ?? "", tag, pick, String(cellN), headline,
        s.headlineSource ?? "", s.headlineLang ?? "", "", "", "", "", ""];
      lines.push(csvLine(row));
      idx++;
      stories++;
    }
  }
  console.error(`placement: ${stories} stories  cells without stories: ${empty}  empty headlines: ${blankHeadlines}`);
  const outputs: [string, string[]][] = [["placement", lines]];

  // The six measured cells, in the order of MEASURED; grouping and headlines are drawn only
  // when all six are in the snapshot (a snapshot taken before 2026-10-27 may lack some).
  const missing = MEASURED.filter((m) => !readCell(m.id));
  const measured = missing.length > 0 ? [] : MEASURED.map((m) => ({ id: m.id, cf: readCell(m.id)! }));
  if (missing.length > 0) console.error(`grouping, headlines: not drawn, no cell file for ${missing.map((m) => m.label).join(", ")}`);

  // Grouping: (story, article) pairs of full stories, the headline's own copy left out,
  // GROUPING drawn uniformly with a generator of its own on the same seed.
  if (measured.length > 0) {
    const pairs: string[][] = [];
    for (const { id, cf } of measured) {
      for (const s of cf.stories ?? []) {
        if (s.compact || !Array.isArray(s.articles)) continue;
        const own = fold(s.headline ?? "");
        for (const a of s.articles) {
          if ((s.headlineUrl && a.url === s.headlineUrl) || (own !== "" && fold(a.title ?? "") === own)) continue;
          pairs.push([id, cf.name ?? "", s.headline ?? "", s.headlineSource ?? "", a.title ?? "", a.source ?? "", a.lang ?? "", a.url ?? ""]);
        }
      }
    }
    const pick = sampleIndices(new PyRandom(seed), pairs.length, GROUPING);
    const g = [GROUPING_COLUMNS.join(",")];
    pick.forEach((p, i) => g.push(csvLine([String(i), ...pairs[p], "", ""])));
    console.error(`grouping: ${pick.length} of ${pairs.length} grouped non-headline articles in ${measured.length} cells`);
    outputs.push(["grouping", g]);
  }

  // Top 12: every entry of stories.json.
  if (top) {
    const t = [TOP12_COLUMNS.join(",")];
    for (const e of top.stories ?? []) {
      t.push(csvLine([String(e.rank), e.cell.id, e.cell.name ?? "", e.cell.home ?? "", e.story.headline ?? "",
        e.story.headlineSource ?? "", e.story.headlineLang ?? "", e.confirmed ?? "", "", "", ""]));
    }
    console.error(`top12: ${t.length - 1} entries`);
    outputs.push(["top12", t]);
  } else console.error("top12: no stories.json in the snapshot, not drawn");

  // Headlines: HEADLINES stories with a headline from the six cells, full and compact.
  if (measured.length > 0) {
    const all: string[][] = [];
    for (const { id, cf } of measured) {
      for (const s of cf.stories ?? []) if (s.headline) all.push([id, cf.name ?? "", s.headline, s.headlineSource ?? ""]);
    }
    const pick = sampleIndices(new PyRandom(seed), all.length, HEADLINES);
    const h = [HEADLINES_COLUMNS.join(",")];
    pick.forEach((p, i) => h.push(csvLine([String(i), ...all[p], "", ""])));
    console.error(`headlines: ${pick.length} of ${all.length} headlined stories in ${measured.length} cells`);
    outputs.push(["headlines", h]);
  }

  const csv = (rows: string[]) => rows.join("\n") + "\n";
  if (outArg === undefined) {
    process.stdout.write(csv(lines));
    if (outputs.length > 1) console.error(`(--out <dir> also writes ${outputs.slice(1).map(([k]) => `${date}-${k}.csv`).join(", ")})`);
    return;
  }
  // --out <dir>: <dir>/YYYY-MM-DD-<kind>.csv; --out <x>-placement.csv: the others beside it as <x>-<kind>.csv.
  const pathOf = (kind: string) => {
    if (!outIsCsv) return join(resolve(outArg!), `${date}-${kind}.csv`);
    return kind === "placement" ? resolve(outArg!) : resolve(outArg!.replace(/(-placement)?\.csv$/, `-${kind}.csv`));
  };
  if (!outIsCsv) mkdirSync(resolve(outArg), { recursive: true });
  for (const [kind, rows] of outputs) {
    writeFileSync(pathOf(kind), csv(rows));
    console.error(`wrote ${pathOf(kind)} (${rows.length - 1} rows)`);
  }
}

await main();
