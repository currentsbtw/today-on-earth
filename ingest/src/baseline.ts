import { gzipSync } from "node:zlib";
import { gunzipMaybe, loadCarried, type CarrySource } from "./carry.ts";
import type { ArticleRecord } from "./types.ts";

/**
 * Per-cell normal (docs/DATA-CONTRACT.md "Baseline"): a carried count of placed articles per
 * UTC day per cell, counted once when an article is first merged into the state, bucketed by
 * the article's GKG time. Days older than 14 days are dropped.
 *
 * A day counts as complete only when
 * - it is after `since`, the UTC day of the first run that counted anything (that day is
 *   partial, and so are any days a cold start back-filled before it),
 * - it is before today, and
 * - every feed has at least 90% of that day's 96 fifteen-minute files merged. The file keeps
 *   a per-day, per-feed count of merged files (`slots`) for this, because the state's own
 *   list of merged files only covers the last 24 hours.
 *
 * The file also keeps one window total per UTC day (`totals`, added 2026-10-27): every run
 * writes its snapshot's `totals.articles` under today, so once the day is over its entry holds
 * the day's last snapshot. heat.json's `articlesNormal` is the median of those totals over the
 * complete days above (articlesNormal below). The version is unchanged: a version 2 file
 * written before 2026-10-27 has no `totals` and loads with none, so the count of days with a
 * total starts from the first run of this code (and an older decoder ignores the key).
 */
export const BASELINE_VERSION = 2;
export const BASELINE_KEEP_DAYS = 14;
export const BASELINE_MEDIAN_DAYS = 7;
export const BASELINE_MIN_DAYS = 3;
export const SLOTS_PER_DAY = 96;
export const MIN_SLOT_SHARE = 0.9;
/** heat.json articlesNormal: median over the last up to this many complete days with a total... */
export const ARTICLES_NORMAL_DAYS = BASELINE_KEEP_DAYS;
/** ...and null until this many exist. */
export const ARTICLES_NORMAL_MIN_DAYS = 7;

/** day ("YYYY-MM-DD") -> cell id -> articles first merged that day. */
export type BaselineDays = Record<string, Record<string, number>>;
/** day -> feed name -> number of that day's 15-minute files merged. */
export type BaselineSlots = Record<string, Record<string, number>>;
/** day -> `totals.articles` of the last snapshot written on that UTC day (added 2026-10-27). */
export type BaselineTotals = Record<string, number>;

export interface Baseline {
  /** UTC day the baseline started counting (a partial day); "" before the first run. */
  since: string;
  days: BaselineDays;
  slots: BaselineSlots;
  totals: BaselineTotals;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export const utcDay = (iso: string) => iso.slice(0, 10);
const dayMinus = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) - n * DAY_MS).toISOString().slice(0, 10);
/** "YYYYMMDDHHMMSS" file stamp -> "YYYY-MM-DD". */
const stampDay = (stamp: string) => `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;

/**
 * Count placed records into their UTC day (from GKG time). Mutates and returns `days`. The
 * ingest passes one record per arrived article unit (history.ts arrivedUnits), so `b` is in
 * the unit of `n`: an outlet's later copy of a headline it already had adds nothing.
 */
export function countNewRecords(days: BaselineDays, newRecords: Iterable<ArticleRecord>): BaselineDays {
  for (const r of newRecords) {
    if (!r.cellId) continue; // unplaced articles have no cell
    const day = utcDay(r.time);
    const cells = (days[day] ??= {});
    cells[r.cellId] = (cells[r.cellId] ?? 0) + 1;
  }
  return days;
}

/** Count newly merged file stamps per day and feed. Mutates and returns `slots`. */
export function countNewSlots(slots: BaselineSlots, merged: Record<string, readonly string[]>): BaselineSlots {
  for (const [feed, stamps] of Object.entries(merged)) {
    for (const stamp of new Set(stamps)) {
      const day = stampDay(stamp);
      const feeds = (slots[day] ??= {});
      feeds[feed] = (feeds[feed] ?? 0) + 1;
    }
  }
  return slots;
}

/** Keep `today` and the 14 days before it; drop older, future and malformed days. */
export function trimDays<T>(days: Record<string, T>, today: string): Record<string, T> {
  const oldest = dayMinus(today, BASELINE_KEEP_DAYS);
  const out: Record<string, T> = {};
  for (const day of Object.keys(days).sort()) if (DAY.test(day) && day >= oldest && day <= today) out[day] = days[day];
  return out;
}

/** Complete UTC days (see the module comment), newest first, at most 14. */
export function completeDays(b: Baseline, today: string, feeds: readonly string[]): string[] {
  const need = Math.ceil(MIN_SLOT_SHARE * SLOTS_PER_DAY);
  return Object.keys(b.days)
    .filter((d) => d < today && d > b.since && feeds.every((f) => (b.slots[d]?.[f] ?? 0) >= need))
    .sort()
    .reverse()
    .slice(0, BASELINE_KEEP_DAYS);
}

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export interface ArticlesNormal {
  /** Median of the recorded daily totals, whole number; null while fewer than 7 days have one. */
  articlesNormal: number | null;
  /** Days the median covers; 0 when it is null. */
  articlesNormalDays: number;
  /** Complete days with a recorded total, also while fewer than 7 (for the run log). */
  totalDays: number;
}

export interface BaselineView extends ArticlesNormal {
  baselineDays: number;
  /** b for a cell: median over the last up to 7 complete days, 1 decimal. */
  b: (cellId: string) => number;
}

/**
 * heat.json's `articlesNormal` and `articlesNormalDays` (docs/DATA-CONTRACT.md "Baseline",
 * added 2026-10-27): the median of the daily totals recorded for the last up to 14 complete
 * days (`complete`, newest first, from completeDays) that have one, rounded to a whole number;
 * null, with 0 days, until 7 such days exist. A day after a cold start or with missed files is
 * not complete, so its partial total never counts.
 */
export function articlesNormal(b: Pick<Baseline, "totals">, complete: readonly string[]): ArticlesNormal {
  const recorded = complete.filter((d) => Object.hasOwn(b.totals, d)).slice(0, ARTICLES_NORMAL_DAYS);
  if (recorded.length < ARTICLES_NORMAL_MIN_DAYS) return { articlesNormal: null, articlesNormalDays: 0, totalDays: recorded.length };
  return { articlesNormal: Math.round(median(recorded.map((d) => b.totals[d]))), articlesNormalDays: recorded.length, totalDays: recorded.length };
}

/**
 * Record this run's snapshot total under `today`, replacing the earlier run's, so a past day
 * keeps its last snapshot's total. Mutates and returns `b`.
 */
export function recordDayTotal(b: Baseline, today: string, articles: number): Baseline {
  if (DAY.test(today) && Number.isInteger(articles) && articles > 0) b.totals[today] = articles;
  return b;
}

export function baselineView(b: Baseline, today: string, feeds: readonly string[]): BaselineView {
  const complete = completeDays(b, today, feeds);
  const baselineDays = complete.length;
  const recent = complete.slice(0, BASELINE_MEDIAN_DAYS);
  return {
    ...articlesNormal(b, complete),
    baselineDays,
    b: (cellId) => {
      if (baselineDays < BASELINE_MIN_DAYS) return 0;
      // No history for this cell on any of those days: brand new, b = 0.
      if (!recent.some((d) => cellId in b.days[d])) return 0;
      const m = Math.round(median(recent.map((d) => b.days[d][cellId] ?? 0)) * 10) / 10;
      return m === 0 ? 0 : m;
    },
  };
}

/**
 * This run's baseline: the carried one plus this run's arrived article units (`firstMerged`:
 * one record per unit new to the window, history.ts arrivedUnits) and merged files. When the state did not load (a cold start) the carried baseline is discarded, since
 * the cold start re-merges articles that were already counted into existing days.
 */
export function advanceBaseline(args: {
  prev: Baseline | null;
  stateLoaded: boolean;
  firstMerged: readonly ArticleRecord[];
  mergedStamps: Record<string, readonly string[]>;
  today: string;
  log?: (msg: string) => void;
}): Baseline {
  let prev = args.prev;
  if (prev && !args.stateLoaded) {
    args.log?.("baseline: the state did not load, so the carried baseline is discarded (a cold start would double count)");
    prev = null;
  }
  const since = prev?.since || args.today;
  const days = trimDays(countNewRecords(structuredClone(prev?.days ?? {}), args.firstMerged), args.today);
  const slots = trimDays(countNewSlots(structuredClone(prev?.slots ?? {}), args.mergedStamps), args.today);
  // Day totals are recorded after the snapshot (recordDayTotal); here they are carried and trimmed.
  const totals = trimDays({ ...prev?.totals }, args.today);
  return { since, days, slots, totals };
}

export function encodeBaseline(b: Baseline): Buffer {
  return gzipSync(JSON.stringify({ v: BASELINE_VERSION, since: b.since, days: b.days, slots: b.slots, totals: b.totals }), { level: 9 });
}

function cleanCounts(raw: unknown): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out;
  for (const [day, inner] of Object.entries(raw as Record<string, unknown>)) {
    if (!DAY.test(day) || typeof inner !== "object" || inner === null) continue;
    const clean: Record<string, number> = {};
    for (const [k, n] of Object.entries(inner as Record<string, unknown>)) if (Number.isInteger(n) && (n as number) > 0) clean[k] = n as number;
    out[day] = clean;
  }
  return out;
}

/** Day totals: a positive integer per valid day; anything else is dropped. */
function cleanTotals(raw: unknown): BaselineTotals {
  const out: BaselineTotals = {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out;
  for (const [day, n] of Object.entries(raw as Record<string, unknown>)) if (DAY.test(day) && Number.isInteger(n) && (n as number) > 0) out[day] = n as number;
  return out;
}

/**
 * Reads version 2, and version 1 (no `slots`: none of its days can be complete). A file
 * without `totals` (every file before 2026-10-27) loads with none.
 */
export function decodeBaseline(bytes: Uint8Array): Baseline {
  const parsed = JSON.parse(gunzipMaybe(bytes)) as { v?: number; since?: unknown; days?: unknown; slots?: unknown; totals?: unknown };
  const sinceOk = typeof parsed.since === "string" && (parsed.since === "" || DAY.test(parsed.since));
  const daysOk = typeof parsed.days === "object" && parsed.days !== null && !Array.isArray(parsed.days);
  if ((parsed.v !== 1 && parsed.v !== BASELINE_VERSION) || !sinceOk || !daysOk) {
    throw new Error(`unsupported baseline file (version ${String(parsed.v)})`);
  }
  return { since: parsed.since as string, days: cleanCounts(parsed.days), slots: cleanCounts(parsed.slots), totals: cleanTotals(parsed.totals) };
}

/** Load the carried baseline (null = start empty). Same rules as the state file. */
export function loadBaseline(source: CarrySource, log: (msg: string) => void, fetchImpl: typeof fetch = fetch): Promise<Baseline | null> {
  return loadCarried(source, "baseline", decodeBaseline, log, fetchImpl);
}
