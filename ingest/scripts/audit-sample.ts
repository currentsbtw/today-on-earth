/**
 * Draw the placement audit's sample (docs/audits/README.md) from a snapshot.
 *   npm run audit-sample -- <dir>                       # reads <dir>/heat.json and <dir>/cells/*.json
 *   npm run audit-sample -- <dir> --seed 20261024       # seed: default is the snapshot's UTC date as YYYYMMDD
 *   npm run audit-sample -- <dir> --fetch               # first saves the live heat.json and the drawn cells into <dir>
 *   npm run audit-sample -- <dir> --out ../docs/audits/YYYY-MM-DD-placement.csv
 * Writes the CSV to stdout (or --out) with empty source_known, label, quality, cause and note
 * columns for the auditor; the seed, the snapshot time, the counts and every drawn cell and story
 * go to stderr.
 *
 * The rule, as the first audit (2026-10-24) ran it in Python:
 *   - cells with n >= 10, sorted by (-n, id); the first 20 are "top20";
 *   - 60 cells drawn by weight n without replacement (Efraimidis-Spirakis: key = U^(1/n), the 60
 *     largest keys; ties on the key go to the larger id); a drawn top-20 cell is "top20+weighted";
 *   - in each chosen cell, top 20 first and then the drawn cells in key order: the first story,
 *     plus one story chosen at random among the others with u >= 3, from the same generator.
 * The generator is Python's random.Random(seed) reimplemented below (MT19937 seeded by
 * init_by_array, random() from two 32-bit draws, choice() by rejection on getrandbits), so this
 * script draws exactly what the first audit's Python sampler drew. Math.pow and C pow can differ
 * in the last bit; that changes the draw only if two keys tie to 1 ulp.
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
  /** random.choice(seq) through _randbelow(len): getrandbits(bit_length) until below len. */
  choice<T>(seq: T[]): T {
    const n = seq.length;
    if (n === 0) throw new Error("choice from an empty list");
    const k = n.toString(2).length;
    let r = this.uint32() >>> (32 - k);
    while (r >= n) r = this.uint32() >>> (32 - k);
    return seq[r];
  }
}

interface HeatCell { id: string; n: number }
interface Story { headline?: string; headlineSource?: string; headlineLang?: string; u?: number }
interface CellFile { name?: string; home?: string; stories?: Story[] }

const csvField = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
const fail = (msg: string): never => {
  console.error(msg);
  process.exit(1);
};

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
  if (!dirArg) fail("usage: audit-sample <dir> [--seed YYYYMMDD] [--fetch] [--out file.csv]");
  const dir = resolve(dirArg!);
  const cellsDir = join(dir, "cells");
  mkdirSync(cellsDir, { recursive: true });
  const heatPath = join(dir, "heat.json");
  if (fetchLive) await fetchTo(`${SITE_DATA}/heat.json`, heatPath);
  if (!existsSync(heatPath)) fail(`no heat.json in ${dir}`);
  const heat = JSON.parse(readFileSync(heatPath, "utf8")) as { generatedAt: string; cells: HeatCell[] };

  const seedText = seedArg ?? heat.generatedAt.slice(0, 10).replaceAll("-", "");
  if (!/^\d{8}$/.test(seedText)) fail(`seed must be YYYYMMDD, got ${seedText}`);
  const rng = new PyRandom(Number(seedText));

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

  for (const { id } of chosen) {
    const path = join(cellsDir, `${id}.json`);
    if (existsSync(path)) continue;
    if (!fetchLive) fail(`missing ${path} (run with --fetch to save the live cells, right after the live heat.json)`);
    await fetchTo(`${SITE_DATA}/cells/${id}.json`, path);
  }

  console.error(`seed ${seedText}  snapshot ${heat.generatedAt}  cells with n >= ${MIN_N}: ${cells.length}  chosen: ${chosen.length}`);
  const lines = [COLUMNS.join(",")];
  let idx = 0;
  let stories = 0;
  let empty = 0;
  let blankHeadlines = 0;
  for (const { id, tag } of chosen) {
    const cf = JSON.parse(readFileSync(join(cellsDir, `${id}.json`), "utf8")) as CellFile;
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
      lines.push(row.map(csvField).join(","));
      idx++;
      stories++;
    }
  }
  console.error(`stories: ${stories}  cells without stories: ${empty}  empty headlines: ${blankHeadlines}`);
  const csv = lines.join("\n") + "\n";
  if (outArg) writeFileSync(resolve(outArg), csv);
  else process.stdout.write(csv);
}

await main();
