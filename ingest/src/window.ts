import { floorSlot, fromStamp, SLOT_MS, toStamp } from "./fetch.ts";
import type { ArticleRecord } from "./types.ts";

/** Per-feed bookkeeping kept in the state file. */
export interface FeedProgress {
  /** First slot ever planned for this feed (moves forward as the window slides). */
  from: string;
  /** Slots whose files were fetched and merged. */
  done: string[];
}

export interface SlotPlanInput {
  nowMs: number;
  windowHours: number;
  coldStartHours: number;
  /** Unpublished (404) files are retried for this long; the translingual feed lags ~1h. */
  retryHours: number;
  /** This feed's progress from the previous run, or null on a cold start. */
  progress: FeedProgress | null;
}

export interface SlotPlan {
  /** Stamps to fetch, oldest first. */
  slots: string[];
  /** The feed's `from` to persist. */
  from: string;
}

/**
 * Which 15-minute file stamps to fetch for one feed.
 *
 * GDELT names a file after the end of its 15-minute interval, so the newest file can carry
 * a stamp slightly ahead of the wall clock; the plan therefore runs to the next slot.
 * - Cold start: the last `coldStartHours` worth of slots.
 * - Warm: every unfetched slot newer than the newest fetched one, plus unfetched slots from
 *   the last `retryHours` (files that were not published yet last time). Never earlier than
 *   the feed's `from`, so a cold start is not silently widened by later runs.
 */
export function planSlots(input: SlotPlanInput): SlotPlan {
  const end = floorSlot(input.nowMs) + SLOT_MS;
  const firstInWindow = floorSlot(input.nowMs - input.windowHours * 3_600_000) + SLOT_MS;
  // The last N hours of intervals ending at or before now, plus the next slot (often
  // published slightly early). The earliest file's interval starts N hours before
  // floorSlot(now), so coveredHours() reports N after a cold start.
  const coldFrom = Math.max(firstInWindow, floorSlot(input.nowMs) - Math.max(0, Math.round(input.coldStartHours * 4) - 1) * SLOT_MS);

  const p = input.progress;
  const prevFrom = p ? fromStamp(p.from) : NaN;
  const from = Number.isFinite(prevFrom) ? Math.max(prevFrom, firstInWindow) : coldFrom;
  const done = new Set(p?.done ?? []);
  const newest = (p?.done ?? []).reduce((m, s) => (s > m ? s : m), "");
  const newestMs = newest ? fromStamp(newest) : -Infinity;
  const retryFrom = end - Math.round(input.retryHours * 4) * SLOT_MS;

  const slots: string[] = [];
  for (let s = from; s <= end; s += SLOT_MS) {
    const stamp = toStamp(s);
    if (done.has(stamp)) continue;
    if (s > newestMs || s >= retryFrom) slots.push(stamp);
  }
  return { slots, from: toStamp(from) };
}

/**
 * Hours of news the data actually covers, for heat.json's `windowHours`:
 * floor(min(configured window, now - start of the earliest planned interval)), at least 1.
 * A file stamped S covers the 15 minutes ending at S, so the earliest interval starts at
 * the earliest feed `from` minus one slot.
 */
export function coveredHours(nowMs: number, feedFroms: readonly string[], windowHours: number): number {
  const starts = feedFroms.map(fromStamp).filter(Number.isFinite);
  if (starts.length === 0) return Math.max(1, Math.floor(windowHours));
  const spanHours = (nowMs - (Math.min(...starts) - SLOT_MS)) / 3_600_000;
  return Math.max(1, Math.floor(Math.min(windowHours, spanHours)));
}

/**
 * Merge records, keeping the earliest sighting of each URL, and drop anything older than
 * the window start. Output order is newest first.
 */
export function mergeRecords(groups: Iterable<readonly ArticleRecord[]>, windowStartIso: string): ArticleRecord[] {
  const byUrl = new Map<string, ArticleRecord>();
  for (const group of groups) {
    for (const r of group) {
      if (r.time < windowStartIso) continue;
      const prev = byUrl.get(r.url);
      if (!prev || r.time < prev.time) byUrl.set(r.url, r);
    }
  }
  return [...byUrl.values()].sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : a.url < b.url ? -1 : 1));
}

/** Keep only stamps still inside the window. */
export function pruneProcessed(stamps: Iterable<string>, windowStartMs: number): string[] {
  const cutoff = toStamp(floorSlot(windowStartMs));
  return [...new Set(stamps)].filter((s) => s >= cutoff).sort();
}
