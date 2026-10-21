import { BASELINE_MIN_DAYS } from "./baseline.ts";
import { round } from "./stats.ts";
import type { BroadcastFile, CellFile, HeatCell, HeatFile, Slot, SlotId, Story } from "./types.ts";

/**
 * The daily broadcast (docs/DATA-CONTRACT.md "Broadcast"): six fixed slots, each filled by a
 * published rule from the stories this snapshot already holds. Nothing here writes text: a slot
 * carries an outlet's own headline and the story's counts. Every threshold lives here and the
 * contract quotes them.
 */
export const SLOT_ORDER: readonly SlotId[] = ["loudest", "planet", "rising", "brightest", "ordinary", "faint"];

/** Baseline-gated slots (rising, faint) need this many complete days, as the "vs. normal" view. */
export const BROADCAST_MIN_BASELINE_DAYS = BASELINE_MIN_DAYS;

/**
 * Every slot: a story needs at least this many distinct headlines (`u`). Fewer is one report
 * echoed, not a signal.
 */
export const MIN_STORY_U = 3;

/**
 * Independent voices of a story, min(u, o): distinct headlines, counting at most one per outlet.
 * Neither a syndication network (many outlets, one headline) nor one outlet's many copies (many
 * headlines, one outlet) can win "loudest". ("Reports" is kept for articles, as in the frame
 * sentence.)
 */
export const voices = (s: { u: number; o: number }) => Math.min(s.u, s.o);

export const PLANET_MIN_O = 10;

export const RISING_MIN_N = 20;
/** ratio = n / max(b, RISING_B_FLOOR), so a cell that is usually near-empty does not win on 1 -> 20. */
export const RISING_B_FLOOR = 3;

export const BRIGHTEST_MIN_O = 10;
export const BRIGHTEST_MIN_C = 3;
export const BRIGHTEST_MIN_N = 10;

/** At most this share of the story's articles may carry any kind (conflict, politics, crime, disaster). */
export const ORDINARY_MAX_TAGGED_SHARE = 0.25;
export const ORDINARY_MIN_O = 10;
export const ORDINARY_MIN_C = 2;

export const FAINT_MAX_B = 3;
export const FAINT_MIN_O = 5;
export const FAINT_MIN_C = 2;

interface Candidate {
  cell: CellFile;
  heat: HeatCell;
  story: Story;
  /** Position of the story in its cell's `stories` (last tie-break). */
  pos: number;
  /** How many of the story's articles carry any kind. */
  tagged: number;
}

const DAY_MS = 86_400_000;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
/** "YYYY-MM-DD" naming a real calendar day ("2026-02-30" and "2026-13-01" are not). */
const isRealDay = (day: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === day;
};
const cmpStr =(a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Shared tie-break: higher n, then earlier first, then cell id ascending, then story position. */
function tieBreak(a: Candidate, b: Candidate): number {
  return b.story.n - a.story.n || cmpStr(a.story.first, b.story.first) || cmpStr(a.cell.id, b.cell.id) || a.pos - b.pos;
}

/** The candidate with the highest `metric`, then `second` (when given), then tieBreak; or null. */
function best(cands: Iterable<Candidate>, metric: (c: Candidate) => number, second?: (c: Candidate) => number): Candidate | null {
  let top: Candidate | null = null;
  for (const c of cands) {
    if (!top) top = c;
    else {
      const d = metric(c) - metric(top) || (second ? second(c) - second(top) : 0);
      if (d > 0 || (d === 0 && tieBreak(c, top) < 0)) top = c;
    }
  }
  return top;
}

/**
 * The first UTC day on which `BROADCAST_MIN_BASELINE_DAYS` complete days can exist. Complete
 * days are strictly after `since` and before today, so the third one (since + 3) has passed
 * on since + 4. When some days turned out incomplete (missed files), it is never earlier than
 * today + the days still missing. "" when no baseline exists yet.
 */
export function availableFrom(since: string, today: string, baselineDays: number): string {
  if (!isRealDay(since) || !isRealDay(today)) return "";
  const fromSince = addDays(since, BROADCAST_MIN_BASELINE_DAYS + 1);
  const fromToday = addDays(today, Math.max(1, BROADCAST_MIN_BASELINE_DAYS - baselineDays));
  return fromSince > fromToday ? fromSince : fromToday;
}

/** Rising ratio of a cell: n / max(b, 3), 1 decimal. */
export const risingRatio = (n: number, b: number) => round(n / Math.max(b, RISING_B_FLOOR), 1);

export function buildBroadcast(args: {
  heat: HeatFile;
  cells: readonly CellFile[];
  /** Per story: how many of its articles carry any kind (Snapshot.storyTagged). */
  storyTagged: ReadonlyMap<Story, number>;
  /** The carried baseline's `since` ("" when none). */
  baselineSince: string;
}): BroadcastFile {
  const { heat, cells, storyTagged } = args;
  const heatById = new Map(heat.cells.map((c) => [c.id, c]));
  const all: Candidate[] = [];
  for (const cell of cells) {
    const h = heatById.get(cell.id);
    if (!h) continue;
    cell.stories.forEach((story, pos) => all.push({ cell, heat: h, story, pos, tagged: storyTagged.get(story) ?? 0 }));
  }
  const used = new Set<Candidate>();
  // Every slot: the u floor, and an outlet's own headline to show.
  const free = (pred: (c: Candidate) => boolean) =>
    all.filter((c) => !used.has(c) && c.story.u >= MIN_STORY_U && c.story.headline !== "" && pred(c));
  const gated = heat.baselineDays < BROADCAST_MIN_BASELINE_DAYS;
  const today = heat.generatedAt.slice(0, 10);

  const fill = (id: SlotId, pick: Candidate | null, extra: Partial<Slot> = {}): Slot => {
    if (!pick) return { id, available: false, reason: "none" };
    used.add(pick);
    const { cell, heat: h, story: s } = pick;
    return {
      id,
      available: true,
      cell: { id: cell.id, name: cell.name, lat: h.lat, lon: h.lon, home: cell.home },
      story: {
        headline: s.headline, headlineSource: s.headlineSource, headlineLang: s.headlineLang, headlineUrl: s.headlineUrl,
        n: s.n, u: s.u, o: s.o, c: s.c, i: s.i, l: s.l, t: s.t, first: s.first, last: s.last,
      },
      ...extra,
    };
  };
  const waiting = (id: SlotId): Slot => ({ id, available: false, reason: "baseline", availableFrom: availableFrom(args.baselineSince, today, heat.baselineDays) });

  const slots: Slot[] = [];
  // 1. loudest: most independent voices, min(u, o); ties: more outlets.
  slots.push(fill("loudest", best(free(() => true), (c) => voices(c.story), (c) => c.story.o)));
  // 2. planet: most outlet countries other than the place's own (which must be known).
  slots.push(fill("planet", best(free((c) => c.story.o >= PLANET_MIN_O && c.cell.home !== ""), (c) => c.story.i)));
  // 3. rising: the cell most above its normal; its story with the most outlets.
  if (gated) slots.push(waiting("rising"));
  else {
    const risers = heat.cells
      .filter((h) => h.n >= RISING_MIN_N)
      .map((h) => ({ h, ratio: risingRatio(h.n, h.b) }))
      .sort((a, b) => b.ratio - a.ratio || b.h.n - a.h.n || cmpStr(a.h.id, b.h.id));
    let slot: Slot | null = null;
    for (const { h, ratio } of risers) {
      const pick = best(free((c) => c.cell.id === h.id), (c) => c.story.o);
      if (pick) {
        slot = fill("rising", pick, { ratio, b: h.b });
        break;
      }
    }
    slots.push(slot ?? fill("rising", null));
  }
  // 4. brightest: highest mean tone with real coverage.
  slots.push(
    fill(
      "brightest",
      best(free((c) => c.story.o >= BRIGHTEST_MIN_O && c.story.c >= BRIGHTEST_MIN_C && c.story.n >= BRIGHTEST_MIN_N), (c) => c.story.t),
    ),
  );
  // 5. ordinary: most outlets among stories mostly outside conflict, politics, crime, disaster.
  slots.push(
    fill(
      "ordinary",
      best(
        free((c) => c.tagged <= ORDINARY_MAX_TAGGED_SHARE * c.story.n && c.story.o >= ORDINARY_MIN_O && c.story.c >= ORDINARY_MIN_C),
        (c) => c.story.o,
      ),
    ),
  );
  // 6. faint: most outlets from a usually quiet cell.
  if (gated) slots.push(waiting("faint"));
  else {
    const pick = best(free((c) => c.heat.b <= FAINT_MAX_B && c.story.o >= FAINT_MIN_O && c.story.c >= FAINT_MIN_C), (c) => c.story.o);
    slots.push(fill("faint", pick, pick ? { b: pick.heat.b } : {}));
  }

  return { generatedAt: heat.generatedAt, windowHours: heat.windowHours, baselineDays: heat.baselineDays, slots };
}

/** All six slots unavailable ("none"): what is written when building the broadcast fails. */
export function emptyBroadcast(heat: Pick<HeatFile, "generatedAt" | "windowHours" | "baselineDays">): BroadcastFile {
  return {
    generatedAt: heat.generatedAt,
    windowHours: heat.windowHours,
    baselineDays: heat.baselineDays,
    slots: SLOT_ORDER.map((id) => ({ id, available: false, reason: "none" })),
  };
}

/**
 * buildBroadcast, isolated: an error is logged and the all-"none" file is returned instead, so
 * the snapshot (heat.json, cells) still deploys.
 */
export function buildBroadcastSafe(args: Parameters<typeof buildBroadcast>[0], log: (msg: string) => void): BroadcastFile {
  try {
    return buildBroadcast(args);
  } catch (err) {
    log(`broadcast: FAILED, writing all six slots as "none": ${(err as Error).stack ?? String(err)}`);
    return emptyBroadcast(args.heat);
  }
}
