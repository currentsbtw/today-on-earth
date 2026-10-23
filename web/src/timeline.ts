// The clip timeline's pure logic (clip.html?timeline=1): the parameters, the plan the renderer
// reads through window.__clipPlan() (segments, frame counts, poster, date, hour marks), the
// time-lapse's virtual clock, the two snapshots bracketing it and the linear interpolation of
// cells and totals between them. No DOM or MapLibre here, so node --test runs it directly
// (web/test/timeline.test.ts); clip.ts draws what it describes.

export type SegmentKind = 'hook' | 'pullback' | 'lapse' | 'flight' | 'card' | 'end';

export interface Segment {
  kind: SegmentKind;
  /** The broadcast slot id, on flight and card segments only. */
  slot?: string;
  /** First frame of the segment (frames are contiguous from 0). */
  start: number;
  frames: number;
}

export interface ClipPlan {
  fps: number;
  frames: number;
  /** UTC day (YYYY-MM-DD) of the midpoint between the first and last snapshot. */
  date: string;
  lapse: { from: string; to: string; snapshots: number };
  /** Index of the last time-lapse frame (the live snapshot). */
  poster: number;
  /** Time-lapse frame indices at which the virtual clock first crosses a whole UTC hour. */
  hourMarks: number[];
  segments: Segment[];
  /** The chosen slots in order, for the caption posted with the clip (absent on older pages). */
  signals?: ClipSignal[];
}

/** One signal card of the clip: its slot, plain label, place and the place page's address. */
export interface ClipSignal {
  slot: string;
  label: string;
  /** The cell's short name (the full name when it has none). */
  place: string;
  cell: string;
  /** Absolute address of the place page on the live site. */
  page: string;
}

/** Durations in seconds (fps in frames per second), as the page's query gives them. */
export interface TimelineParams {
  fps: number;
  hook: number;
  fly: number;
  lapse: number;
  card: number;
  end: number;
  /** How many filled broadcast slots to show, at most. */
  slots: number;
}

export const TIMELINE_DEFAULTS: TimelineParams = { fps: 30, hook: 2, fly: 1.5, lapse: 7, card: 5, end: 3, slots: 3 };

const NUMBER = /^\s*\d+(\.\d+)?\s*$/;

/**
 * Read and validate the timeline's query (absent values take the defaults): fps an integer
 * 1..60, seconds 0..30, slots an integer 0..6, and a flight at most 60 frames. Throws an
 * Error naming the first bad value.
 */
export function readTimelineParams(get: (name: string) => string | null): TimelineParams {
  const read = (name: keyof TimelineParams, ok: (n: number) => boolean) => {
    const raw = get(name);
    if (raw === null) return TIMELINE_DEFAULTS[name];
    const n = Number(raw);
    if (!NUMBER.test(raw) || !Number.isFinite(n) || !ok(n)) throw new Error(`bad ${name} ${raw}`);
    return n;
  };
  const seconds = (n: number) => n >= 0 && n <= 30;
  const p: TimelineParams = {
    fps: read('fps', (n) => Number.isInteger(n) && n >= 1 && n <= 60),
    hook: read('hook', seconds),
    fly: read('fly', seconds),
    lapse: read('lapse', seconds),
    card: read('card', seconds),
    end: read('end', seconds),
    slots: read('slots', (n) => Number.isInteger(n) && n >= 0 && n <= 6),
  };
  if (framesFor(p.fly, p.fps) > 60) throw new Error(`bad fly ${p.fly} (over 60 frames at ${p.fps} fps)`);
  return p;
}

/** Frames for `seconds` at `fps`: rounded, and at least one whenever seconds > 0. */
export const framesFor = (seconds: number, fps: number): number => (seconds > 0 ? Math.max(1, Math.round(seconds * fps)) : 0);

const HOUR = 3_600_000;

/** Virtual time (ms) of time-lapse frame k of `frames`: linear from `from` to `to`; one frame is `to`. */
export function lapseTime(from: number, to: number, frames: number, k: number): number {
  return frames > 1 ? from + ((to - from) * k) / (frames - 1) : to;
}

/**
 * The plan for `slots` (the chosen slot ids, in order) over snapshots at `times` (ms,
 * ascending, at least one). Segments with no frames are left out.
 */
export function buildPlan(params: Omit<TimelineParams, 'slots'>, slots: readonly string[], times: readonly number[]): ClipPlan {
  if (!times.length) throw new Error('no snapshots');
  const { fps } = params;
  const from = times[0];
  const to = times[times.length - 1];
  const segments: Segment[] = [];
  let start = 0;
  const add = (kind: SegmentKind, frames: number, slot?: string) => {
    if (frames <= 0) return;
    segments.push(slot === undefined ? { kind, start, frames } : { kind, slot, start, frames });
    start += frames;
  };
  add('hook', framesFor(params.hook, fps));
  add('pullback', framesFor(params.fly, fps));
  const lapseStart = start;
  const lapseFrames = framesFor(params.lapse, fps);
  add('lapse', lapseFrames);
  for (const slot of slots) {
    add('flight', framesFor(params.fly, fps), slot);
    add('card', framesFor(params.card, fps), slot);
  }
  add('end', framesFor(params.end, fps));

  const hourMarks: number[] = [];
  for (let k = 0; k < lapseFrames; k++) {
    const t = lapseTime(from, to, lapseFrames, k);
    const crossed = k === 0 ? t % HOUR === 0 : Math.floor(t / HOUR) > Math.floor(lapseTime(from, to, lapseFrames, k - 1) / HOUR);
    if (crossed) hourMarks.push(lapseStart + k);
  }

  return {
    fps,
    frames: start,
    date: new Date(Math.round((from + to) / 2)).toISOString().slice(0, 10),
    lapse: { from: new Date(from).toISOString(), to: new Date(to).toISOString(), snapshots: times.length },
    poster: lapseFrames > 0 ? lapseStart + lapseFrames - 1 : Math.max(0, lapseStart - 1),
    hourMarks,
    segments,
  };
}

/**
 * How far pull-back frame `offset` of `frames` has run back from the live snapshot towards the
 * first: 1/frames on its first frame, 1 (exactly the first snapshot) on its last.
 */
export const pullbackFraction = (offset: number, frames: number): number => (frames > 0 ? Math.min(1, (offset + 1) / frames) : 1);

/** The segment holding frame i and i's offset into it, or null outside the plan. */
export function segmentAt(plan: ClipPlan, i: number): { segment: Segment; offset: number } | null {
  for (const segment of plan.segments) {
    if (i >= segment.start && i < segment.start + segment.frames) return { segment, offset: i - segment.start };
  }
  return null;
}

/**
 * The snapshots around `t` in `times` (ms, ascending): lo <= t <= hi and f, the fraction of
 * the way from lo to hi (0 at lo). Times outside the span clamp to its ends.
 */
export function bracket(times: readonly number[], t: number): { lo: number; hi: number; f: number } {
  const last = times.length - 1;
  if (last <= 0 || t <= times[0]) return { lo: 0, hi: 0, f: 0 };
  if (t >= times[last]) return { lo: last, hi: last, f: 0 };
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  const span = times[hi] - times[lo];
  return { lo, hi, f: span > 0 ? (t - times[lo]) / span : 0 };
}

/**
 * Cells between two snapshots, `f` of the way from `a` to `b`: the union of ids, each n
 * interpolated linearly (a cell missing on one side counts 0 there), rounded, zeros dropped.
 * Other fields come from the side that has the cell (a's first).
 */
export function interpolateCells<C extends { id: string; n: number }>(a: readonly C[], b: readonly C[], f: number): C[] {
  if (f <= 0) return a.filter((c) => c.n > 0);
  if (f >= 1) return b.filter((c) => c.n > 0);
  const inB = new Map(b.map((c) => [c.id, c]));
  const out: C[] = [];
  const push = (cell: C, n: number) => {
    if (n > 0) out.push({ ...cell, n });
  };
  for (const cell of a) {
    const other = inB.get(cell.id);
    push(cell, Math.round(cell.n * (1 - f) + (other ? other.n : 0) * f));
  }
  const inA = new Set(a.map((c) => c.id));
  for (const cell of b) {
    if (!inA.has(cell.id)) push(cell, Math.round(cell.n * f));
  }
  return out;
}

/** The four totals a frame shows. */
export interface Counts {
  articles: number;
  cells: number;
  outlets: number;
  countries: number;
}

/** Totals `f` of the way from `a` to `b`, each rounded. */
export function interpolateTotals(a: Counts, b: Counts, f: number): Counts {
  const at = (x: number, y: number) => Math.round(x * (1 - f) + y * f);
  return { articles: at(a.articles, b.articles), cells: at(a.cells, b.cells), outlets: at(a.outlets, b.outlets), countries: at(a.countries, b.countries) };
}
