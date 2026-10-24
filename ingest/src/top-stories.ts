import { MIN_STORY_U, slotCell, slotStory, tieBreak } from "./broadcast.ts";
import type { CellFile, HeatCell, HeatFile, Story, TopStoriesFile } from "./types.ts";

/**
 * The day's largest stories around the world (docs/DATA-CONTRACT.md "Top stories"), for the
 * narrated clip: the stories with the most distinct outlets across every place, one per place
 * and at most two per country, so the reading moves around the planet. Nothing here writes
 * text: an entry carries an outlet's own headline and the story's counts, shaped exactly as a
 * broadcast slot's. Every threshold lives here and the contract quotes them.
 */

/** At most this many entries. The clip reads the first 6 to 8 it can voice; the rest is slack. */
export const TOP_STORIES_MAX = 12;

/** At most this many entries per country (the cell's `home`). */
export const TOP_STORIES_PER_COUNTRY = 2;

/**
 * Cells whose `home` is unknown ("") share one bucket, separate from every country, and take at
 * most this many entries in total: an unknown home may be any country, including one already
 * taken twice.
 */
export const TOP_STORIES_UNKNOWN_HOME_MAX = 1;

interface Candidate {
  cell: CellFile;
  heat: HeatCell;
  story: Story;
  /** Position of the story in its cell's `stories` (last tie-break). */
  pos: number;
}

/** Ranking: more distinct outlets `o`, then the broadcast's tie order (higher n, earlier first, cell id, position). */
const byOutlets = (a: Candidate, b: Candidate) => b.story.o - a.story.o || tieBreak(a, b);

export function buildTopStories(args: { heat: HeatFile; cells: readonly CellFile[] }): TopStoriesFile {
  const { heat, cells } = args;
  const heatById = new Map(heat.cells.map((c) => [c.id, c]));
  const all: Candidate[] = [];
  for (const cell of cells) {
    const h = heatById.get(cell.id);
    if (!h) continue;
    cell.stories.forEach((story, pos) => {
      // As every broadcast slot: the u floor, and an outlet's own headline to read.
      if (story.u >= MIN_STORY_U && story.headline !== "") all.push({ cell, heat: h, story, pos });
    });
  }
  all.sort(byOutlets);

  const takenCells = new Set<string>();
  /** Entries per country; the unknown home is keyed separately from every ISO code. */
  const perCountry = new Map<string, number>();
  const stories: TopStoriesFile["stories"] = [];
  for (const c of all) {
    if (stories.length >= TOP_STORIES_MAX) break;
    if (takenCells.has(c.cell.id)) continue;
    const key = c.cell.home === "" ? "(unknown)" : c.cell.home;
    const cap = c.cell.home === "" ? TOP_STORIES_UNKNOWN_HOME_MAX : TOP_STORIES_PER_COUNTRY;
    const had = perCountry.get(key) ?? 0;
    if (had >= cap) continue;
    takenCells.add(c.cell.id);
    perCountry.set(key, had + 1);
    stories.push({ rank: stories.length + 1, cell: slotCell(c.cell, c.heat), story: slotStory(c.story) });
  }
  return { generatedAt: heat.generatedAt, windowHours: heat.windowHours, stories };
}

/**
 * buildTopStories, isolated: an error is logged and an empty list is returned instead, so the
 * snapshot (heat.json, cells) still deploys.
 */
export function buildTopStoriesSafe(args: Parameters<typeof buildTopStories>[0], log: (msg: string) => void): TopStoriesFile {
  try {
    return buildTopStories(args);
  } catch (err) {
    log(`top stories: FAILED, writing stories.json with an empty list: ${(err as Error).stack ?? String(err)}`);
    return { generatedAt: args.heat.generatedAt, windowHours: args.heat.windowHours, stories: [] };
  }
}
