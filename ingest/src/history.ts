import { gzipSync } from "node:zlib";
import { gunzipMaybe, loadCarried, type CarrySource } from "./carry.ts";
import type { HeatFile } from "./types.ts";

/**
 * Replay history (docs/DATA-CONTRACT.md: /data/history/index.json, /data/history/<file>.json,
 * /data/history.json.gz). Each run adds one compact frame of its heat cells; frames older
 * than 24h before the current run, or beyond the newest 100, are dropped.
 */
export const HISTORY_HOURS = 24;
export const MAX_FRAMES = 100;
export const HISTORY_VERSION = 1;

/** [id, lat, lon, n] */
export type FrameCell = [string, number, number, number];
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
  totals: Totals;
}

export interface HistoryIndexEntry {
  at: string;
  file: string;
  windowHours: number;
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

/** This run's frame: heat.json's cells (already n >= 2, sorted by n desc) reduced to [id, lat, lon, n]. */
export function buildHistoryEntry(heat: HeatFile): HistoryEntry {
  return {
    at: heat.generatedAt,
    windowHours: heat.windowHours,
    totals: { articles: heat.totals.articles, outlets: heat.totals.outlets, countries: heat.totals.countries, cells: heat.totals.cells, unplaced: heat.totals.unplaced },
    cells: heat.cells.map((c) => [c.id, c.lat, c.lon, c.n]),
  };
}

/**
 * Append `entry` (replacing any frame with the same `at`), then keep frames whose `at` is
 * no older than 24h before `entry.at`, at most the newest 100, oldest first.
 */
export function appendFrame(previous: readonly HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const cutoff = new Date(Date.parse(entry.at) - HISTORY_HOURS * 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const kept = previous.filter((f) => f.at !== entry.at && f.at >= cutoff && f.at <= entry.at);
  kept.push(entry);
  kept.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return kept.slice(-MAX_FRAMES);
}

export function buildIndex(entries: readonly HistoryEntry[]): HistoryIndex {
  return {
    frames: entries.map((e) => ({ at: e.at, file: frameFileName(e.at), windowHours: e.windowHours, totals: e.totals })),
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
  if (parsed.v !== HISTORY_VERSION || !Array.isArray(parsed.frames)) {
    throw new Error(`unsupported history version ${String(parsed.v)}`);
  }
  // `at` becomes a file name under history/, so only strict ISO UTC stamps are accepted:
  // a poisoned cache entry must not be able to write outside that folder.
  return (parsed.frames as HistoryEntry[]).filter(
    (f) =>
      f &&
      typeof f.at === "string" &&
      AT_PATTERN.test(f.at) &&
      Array.isArray(f.cells) &&
      typeof f.windowHours === "number" &&
      typeof f.totals === "object",
  );
}

const AT_PATTERN = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;

/** Load carried history (null = start empty). Same fetch rules as the state file. */
export function loadHistory(source: CarrySource, log: (msg: string) => void, fetchImpl: typeof fetch = fetch): Promise<HistoryEntry[] | null> {
  return loadCarried(source, "history", decodeHistory, log, fetchImpl);
}
