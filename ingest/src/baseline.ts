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
 */
export const BASELINE_VERSION = 2;
export const BASELINE_KEEP_DAYS = 14;
export const BASELINE_MEDIAN_DAYS = 7;
export const BASELINE_MIN_DAYS = 3;
export const SLOTS_PER_DAY = 96;
export const MIN_SLOT_SHARE = 0.9;

/** day ("YYYY-MM-DD") -> cell id -> articles first merged that day. */
export type BaselineDays = Record<string, Record<string, number>>;
/** day -> feed name -> number of that day's 15-minute files merged. */
export type BaselineSlots = Record<string, Record<string, number>>;

export interface Baseline {
  /** UTC day the baseline started counting (a partial day); "" before the first run. */
  since: string;
  days: BaselineDays;
  slots: BaselineSlots;
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

export interface BaselineView {
  baselineDays: number;
  /** b for a cell: median over the last up to 7 complete days, 1 decimal. */
  b: (cellId: string) => number;
}

export function baselineView(b: Baseline, today: string, feeds: readonly string[]): BaselineView {
  const complete = completeDays(b, today, feeds);
  const baselineDays = complete.length;
  const recent = complete.slice(0, BASELINE_MEDIAN_DAYS);
  return {
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
  return { since, days, slots };
}

export function encodeBaseline(b: Baseline): Buffer {
  return gzipSync(JSON.stringify({ v: BASELINE_VERSION, since: b.since, days: b.days, slots: b.slots }), { level: 9 });
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

/** Reads version 2, and version 1 (no `slots`: none of its days can be complete). */
export function decodeBaseline(bytes: Uint8Array): Baseline {
  const parsed = JSON.parse(gunzipMaybe(bytes)) as { v?: number; since?: unknown; days?: unknown; slots?: unknown };
  const sinceOk = typeof parsed.since === "string" && (parsed.since === "" || DAY.test(parsed.since));
  const daysOk = typeof parsed.days === "object" && parsed.days !== null && !Array.isArray(parsed.days);
  if ((parsed.v !== 1 && parsed.v !== BASELINE_VERSION) || !sinceOk || !daysOk) {
    throw new Error(`unsupported baseline file (version ${String(parsed.v)})`);
  }
  return { since: parsed.since as string, days: cleanCounts(parsed.days), slots: cleanCounts(parsed.slots) };
}

/** Load the carried baseline (null = start empty). Same rules as the state file. */
export function loadBaseline(source: CarrySource, log: (msg: string) => void, fetchImpl: typeof fetch = fetch): Promise<Baseline | null> {
  return loadCarried(source, "baseline", decodeBaseline, log, fetchImpl);
}
