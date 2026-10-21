import { gzipSync } from "node:zlib";
import { gunzipMaybe, loadCarried, type CarrySource } from "./carry.ts";
import type { ArticleRecord } from "./types.ts";

/**
 * Per-cell normal (docs/DATA-CONTRACT.md "Baseline"): a carried count of placed articles per
 * UTC day per cell, counted once when an article is first merged into the state, bucketed by
 * the article's GKG time. Days older than 14 days are dropped.
 *
 * The file also records `since`, the UTC day of the first run that counted anything. That day
 * is partial (the job started mid-day), and so are any days a cold start back-filled before
 * it, so only days after `since` and before today count as complete.
 */
export const BASELINE_VERSION = 1;
export const BASELINE_KEEP_DAYS = 14;
export const BASELINE_MEDIAN_DAYS = 7;
export const BASELINE_MIN_DAYS = 3;

/** day ("YYYY-MM-DD") -> cell id -> articles first merged that day. */
export type BaselineDays = Record<string, Record<string, number>>;

export interface Baseline {
  /** UTC day the baseline started counting (a partial day); "" before the first run. */
  since: string;
  days: BaselineDays;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export const utcDay = (iso: string) => iso.slice(0, 10);
const dayMinus = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) - n * DAY_MS).toISOString().slice(0, 10);

/** Count placed records into their UTC day (from GKG time). Mutates and returns `days`. */
export function countNewRecords(days: BaselineDays, newRecords: Iterable<ArticleRecord>): BaselineDays {
  for (const r of newRecords) {
    if (!r.cellId) continue; // unplaced articles have no cell
    const day = utcDay(r.time);
    const cells = (days[day] ??= {});
    cells[r.cellId] = (cells[r.cellId] ?? 0) + 1;
  }
  return days;
}

/** Keep `today` and the 14 days before it; drop older, future and malformed days. */
export function trimDays(days: BaselineDays, today: string): BaselineDays {
  const oldest = dayMinus(today, BASELINE_KEEP_DAYS);
  const out: BaselineDays = {};
  for (const day of Object.keys(days).sort()) if (DAY.test(day) && day >= oldest && day <= today) out[day] = days[day];
  return out;
}

/** Complete UTC days present (after `since`, strictly before today), newest first, at most 14. */
export function completeDays(days: BaselineDays, today: string, since = ""): string[] {
  return Object.keys(days)
    .filter((d) => d < today && d > since)
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

export function baselineView(days: BaselineDays, today: string, since = ""): BaselineView {
  const complete = completeDays(days, today, since);
  const baselineDays = complete.length;
  const recent = complete.slice(0, BASELINE_MEDIAN_DAYS);
  return {
    baselineDays,
    b: (cellId) => {
      if (baselineDays < BASELINE_MIN_DAYS) return 0;
      // No history for this cell on any of those days: brand new, b = 0.
      if (!recent.some((d) => cellId in days[d])) return 0;
      const m = Math.round(median(recent.map((d) => days[d][cellId] ?? 0)) * 10) / 10;
      return m === 0 ? 0 : m;
    },
  };
}

export function encodeBaseline(b: Baseline): Buffer {
  return gzipSync(JSON.stringify({ v: BASELINE_VERSION, since: b.since, days: b.days }), { level: 9 });
}

export function decodeBaseline(bytes: Uint8Array): Baseline {
  const parsed = JSON.parse(gunzipMaybe(bytes)) as { v?: number; since?: unknown; days?: unknown };
  const sinceOk = typeof parsed.since === "string" && (parsed.since === "" || DAY.test(parsed.since));
  if (parsed.v !== BASELINE_VERSION || !sinceOk || typeof parsed.days !== "object" || parsed.days === null || Array.isArray(parsed.days)) {
    throw new Error(`unsupported baseline file (version ${String(parsed.v)})`);
  }
  const days: BaselineDays = {};
  for (const [day, cells] of Object.entries(parsed.days as Record<string, unknown>)) {
    if (!DAY.test(day) || typeof cells !== "object" || cells === null) continue;
    const clean: Record<string, number> = {};
    for (const [id, n] of Object.entries(cells as Record<string, unknown>)) if (Number.isInteger(n) && (n as number) > 0) clean[id] = n as number;
    days[day] = clean;
  }
  return { since: parsed.since as string, days };
}

/** Load the carried baseline (null = start empty). Same rules as the state file. */
export function loadBaseline(source: CarrySource, log: (msg: string) => void, fetchImpl: typeof fetch = fetch): Promise<Baseline | null> {
  return loadCarried(source, "baseline", decodeBaseline, log, fetchImpl);
}
