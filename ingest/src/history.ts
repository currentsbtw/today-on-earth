import { gzipSync } from "node:zlib";
import { gunzipMaybe, loadCarried, type CarrySource } from "./carry.ts";
import type { ArticleRecord, HeatFile } from "./types.ts";

/**
 * Replay history (docs/DATA-CONTRACT.md: /data/history/index.json, /data/history/<file>.json,
 * /data/history.json.gz). Each run adds one compact frame of its heat cells; frames older
 * than 24h before the current run, or beyond the newest 100, are dropped.
 *
 * Each frame also says what arrived in its step: `added` (index) and the fifth row element
 * `a` count window articles whose URL was not in the previous run's carried window. Both
 * are absent when that is unknown: the state was cold-started this run, or there is no
 * previous retained frame. `newest` (the frame's newest article time) is recorded too.
 */
export const HISTORY_HOURS = 24;
export const MAX_FRAMES = 100;
/** 2 (2026-10-22): entries carry `newest`, `added` and the row element `a`. 1 still loads. */
export const HISTORY_VERSION = 2;

/** [id, lat, lon, n], or [id, lat, lon, n, a] when the step's new articles are known. */
export type FrameCell = [string, number, number, number] | [string, number, number, number, number];
/** The index keeps the original five totals; heat.json's `reprints` is not replayed. */
export type Totals = Omit<HeatFile["totals"], "reprints">;

/** `/data/history/<file>.json` */
export interface Frame {
  at: string;
  cells: FrameCell[];
}

/** One retained frame plus the metadata index.json lists for it. */
export interface HistoryEntry extends Frame {
  windowHours: number;
  /** That run's heat.json `newestArticleAt`; absent on entries carried from version 1. */
  newest?: string;
  /** Window articles that arrived in this step (see the module comment); absent when unknown. */
  added?: number;
  totals: Totals;
}

export interface HistoryIndexEntry {
  at: string;
  file: string;
  windowHours: number;
  newest?: string;
  added?: number;
  totals: Totals;
}

/** `/data/history/index.json` */
export interface HistoryIndex {
  frames: HistoryIndexEntry[];
}

/** "2026-10-21T04:47:14Z" -> "20261021T044714Z.json" */
export function frameFileName(at: string): string {
  return `${at.replace(/[-:]/g, "")}.json`;
}

/**
 * This run's frame: heat.json's cells (already n >= 2, sorted by n desc) reduced to
 * [id, lat, lon, n], plus `newest` = heat.newestArticleAt. With `arrived` (the window
 * articles whose URL was not in the previous run's carried window) the entry also gets
 * `added` = arrived.length (placed and unplaced, the unit of totals.articles) and each row a
 * fifth element `a` = the arrived articles in that row's cell. Without it (cold start, or
 * no previous frame) both stay absent: unknown, never 0 by assumption.
 */
export function buildHistoryEntry(heat: HeatFile, arrived?: readonly ArticleRecord[]): HistoryEntry {
  const entry: HistoryEntry = {
    at: heat.generatedAt,
    windowHours: heat.windowHours,
    totals: { articles: heat.totals.articles, outlets: heat.totals.outlets, countries: heat.totals.countries, cells: heat.totals.cells, unplaced: heat.totals.unplaced },
    cells: heat.cells.map((c) => [c.id, c.lat, c.lon, c.n]),
  };
  if (heat.newestArticleAt) entry.newest = heat.newestArticleAt;
  if (!arrived) return entry;
  const perCell = new Map<string, number>();
  for (const r of arrived) if (r.cellId) perCell.set(r.cellId, (perCell.get(r.cellId) ?? 0) + 1);
  entry.added = arrived.length;
  entry.cells = heat.cells.map((c) => [c.id, c.lat, c.lon, c.n, perCell.get(c.id) ?? 0]);
  return entry;
}

/** Window articles whose URL was not in the previous run's carried window (new to the state this run). */
export function arrivedArticles(window: readonly ArticleRecord[], previousUrls: ReadonlySet<string>): ArticleRecord[] {
  return window.filter((r) => !previousUrls.has(r.url));
}

/**
 * The arrivals a frame counts, or undefined (unknown) when the state was cold-started this
 * run (there is no previous window to compare with) or there is no previous retained frame.
 */
export function stepArrivals(arrived: readonly ArticleRecord[], stateLoaded: boolean, previous: HistoryEntry | null): readonly ArticleRecord[] | undefined {
  return stateLoaded && previous ? arrived : undefined;
}

/**
 * The retained frame before a run at `at`: the newest entry older than `at` that
 * appendFrame keeps (no older than 24h before `at`). A frame with the same `at` is the one
 * this run replaces, not the previous one. null when there is none.
 */
export function previousFrame(entries: readonly HistoryEntry[], at: string): HistoryEntry | null {
  const cutoff = retentionCutoff(at);
  let prev: HistoryEntry | null = null;
  for (const e of entries) if (e.at < at && e.at >= cutoff && (!prev || e.at > prev.at)) prev = e;
  return prev;
}

function retentionCutoff(at: string): string {
  return new Date(Date.parse(at) - HISTORY_HOURS * 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Append `entry` (replacing any frame with the same `at`), then keep frames whose `at` is
 * no older than 24h before `entry.at`, at most the newest 100, oldest first.
 */
export function appendFrame(previous: readonly HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const cutoff = retentionCutoff(entry.at);
  const kept = previous.filter((f) => f.at !== entry.at && f.at >= cutoff && f.at <= entry.at);
  kept.push(entry);
  kept.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return kept.slice(-MAX_FRAMES);
}

export function buildIndex(entries: readonly HistoryEntry[]): HistoryIndex {
  return {
    frames: entries.map((e) => ({
      at: e.at,
      file: frameFileName(e.at),
      windowHours: e.windowHours,
      ...(e.newest !== undefined ? { newest: e.newest } : {}),
      ...(e.added !== undefined ? { added: e.added } : {}),
      totals: e.totals,
    })),
  };
}

export function toFrame(entry: HistoryEntry): Frame {
  return { at: entry.at, cells: entry.cells };
}

export function encodeHistory(entries: readonly HistoryEntry[]): Buffer {
  return gzipSync(JSON.stringify({ v: HISTORY_VERSION, frames: entries }), { level: 9 });
}

export function decodeHistory(bytes: Uint8Array): HistoryEntry[] {
  const parsed = JSON.parse(gunzipMaybe(bytes)) as { v?: number; frames?: unknown };
  if ((parsed.v !== 1 && parsed.v !== HISTORY_VERSION) || !Array.isArray(parsed.frames)) {
    throw new Error(`unsupported history version ${String(parsed.v)}`);
  }
  // `at` becomes a file name under history/, so only strict ISO UTC stamps are accepted:
  // a poisoned cache entry must not be able to write outside that folder.
  const frames = (parsed.frames as HistoryEntry[]).filter(
    (f) =>
      f &&
      typeof f.at === "string" &&
      AT_PATTERN.test(f.at) &&
      Array.isArray(f.cells) &&
      typeof f.windowHours === "number" &&
      typeof f.totals === "object",
  );
  return frames.map((f) => {
    // Version 1 recorded neither `newest` nor `a`: its frames load as unknown. A version 2
    // entry whose `added` is unusable is unknown too, rows and all.
    const newest = parsed.v === 1 || typeof f.newest !== "string" || !AT_PATTERN.test(f.newest) ? undefined : f.newest;
    const known = parsed.v !== 1 && Number.isInteger(f.added) && (f.added as number) >= 0;
    const { newest: _n, added: _a, ...rest } = f;
    return {
      ...rest,
      ...(newest !== undefined ? { newest } : {}),
      ...(known ? { added: f.added } : {}),
      cells: known ? f.cells : f.cells.map((c) => (c.length > 4 ? (c.slice(0, 4) as FrameCell) : c)),
    };
  });
}

const AT_PATTERN = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;

/** Load carried history (null = start empty). Same fetch rules as the state file. */
export function loadHistory(source: CarrySource, log: (msg: string) => void, fetchImpl: typeof fetch = fetch): Promise<HistoryEntry[] | null> {
  return loadCarried(source, "history", decodeHistory, log, fetchImpl);
}
