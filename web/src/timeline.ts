// The clip timeline's pure logic (clip.html?timeline=1): the parameters, the plan the renderer
// reads through window.__clipPlan() (segments, frame counts, poster, date, hour marks), the
// time-lapse's virtual clock, the two snapshots bracketing it and the linear interpolation of
// cells and totals between them. No DOM or MapLibre here, so node --test runs it directly
// (web/test/timeline.test.ts); clip.ts draws what it describes. The newscast's plan
// (clip.html?newscast=1) and its sentence and word timing are at the end of the file.

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

// The newscast (clip.html?newscast=1, docs/PLAN.md "Clip v4: the newscast"): the renderer
// synthesises every line of the script first, measures it, and hands the script to the page;
// the plan below lays the frames out from the lines' measured audio (a story's audio starts
// LINE_LEAD into its flight, the other lines' with their segment).

/** One story as the script carries it: its place, the outlet's headline and the counts. */
export interface NewscastStory {
  cell: string;
  /** The cell's name as the heat carries it ("Paris, France"). */
  place: string;
  lat: number;
  lon: number;
  headline: string;
  /** The outlet's domain. */
  source: string;
  /** The headline's language code ("en", "it"). */
  lang: string;
  url: string;
  n: number;
  o: number;
  l: number;
  i: number;
  confirmed: string;
  /** Whether the voice reads the headline (English only in v4.0). */
  spoken: boolean;
  /**
   * The headline exactly as the line's text carries it (an outlet or section label removed;
   * "" when not read). Absent in scripts before v4.0.1. Accepted and ignored by the page: the
   * card shows the whole headline from its first frame.
   */
  said?: string;
  /** Show mode v2 (docs/VOICE.md): the pool id of the frame the line used ("plain", "outlets", ...). Accepted and ignored by the page. */
  variant?: string;
  /** The story's grim share from stories.json (0..1), or null when absent. Accepted and ignored. */
  g?: number | null;
  /** Whether the grim gate gave the story the plain frame. Accepted and ignored. */
  grim?: boolean;
  /** The exact text of the line before the headline. Accepted and ignored. */
  frame?: string;
  /** The language whose voice reads the headline (v4.2 two-voice lines). Accepted and ignored. */
  readIn?: string;
  /**
   * v2.1: when the line reads the story's English title, the credited headline it replaced
   * (headline, source, lang, url above are then the English ones). Accepted and ignored.
   */
  original?: { headline: string; source: string; lang: string; url: string };
}

export interface NewscastLine {
  id: string;
  /**
   * Script v2.1 order: one `open` first, zero or more `story` lines, zero to two `aside` lines
   * between them (never first or last), one `close` last.
   */
  kind: 'open' | 'story' | 'aside' | 'close';
  /** What the voice says, verbatim. */
  text: string;
  /** The line's measured audio, in seconds. */
  seconds: number;
  /** Story lines: their place in the run (1-based) and the run's length. */
  n?: number;
  of?: number;
  story?: NewscastStory;
  /** Aside lines: the number (n) of the story the aside follows. */
  after?: number;
}

export interface NewscastScript {
  date: string;
  generatedAt: string;
  /** The synthesis the renderer used: engine "kokoro", voice name "af_heart", speed 1.1. */
  voice: { engine: string; name: string; speed: number };
  /** Silence after each line, in seconds. */
  gap: number;
  lines: NewscastLine[];
}

export type NewscastKind = 'open' | 'flight' | 'card' | 'close';

export interface NewscastSegment {
  kind: NewscastKind;
  /** The id of the script line the segment belongs to. */
  line: string;
  start: number;
  frames: number;
}

export interface NewscastPlan {
  fps: number;
  frames: number;
  date: string;
  /** The first card's last frame (its headline fully painted). */
  poster: number;
  segments: NewscastSegment[];
  /** Per line: the frame its audio starts at (a story's LINE_LEAD into its flight) and its audio's frames. */
  lines: { id: string; start: number; frames: number }[];
  signals?: ClipSignal[];
}

/** A story line's flight into its place, in seconds. */
export const NEWSCAST_FLIGHT = 1.2;
/**
 * Seconds into a story's flight at which its line's audio starts: the place is named as the
 * camera lands, and the headline begins with the card (NEWSCAST_FLIGHT - LINE_LEAD after the
 * line starts).
 */
export const LINE_LEAD = 0.7;
/** How long a card holds after its line ends, in seconds. */
export const NEWSCAST_CARD_HOLD = 0.5;
/** How long the close's lockup holds after the voice ends, in seconds. */
export const NEWSCAST_CLOSE_HOLD = 1.0;

/**
 * Check that `value` is a newscast script (the build contract's shape, script.json v2.1): a
 * YYYY-MM-DD date, a gap of 0..5 s, at least two lines with unique ids, kinds, text and
 * 0 < seconds <= 120, one open first, at most two asides (never first or last; `after`, when
 * present, the number of stories before it), one close last, and story lines with n/of and a
 * story whose place, coordinates, headline, counts, language and `spoken` are usable (the v2
 * story fields `variant`, `g`, `grim`, `frame` and v2.1's `original` of the right type when
 * present). Open and close alone (no stories) pass. A `count` line (script v2 before v2.1)
 * fails as an unknown kind. Throws an Error naming the first problem.
 */
export function checkNewscastScript(value: unknown): NewscastScript {
  const fail = (why: string): never => {
    throw new Error(`bad script: ${why}`);
  };
  const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
  const isText = (x: unknown): x is string => typeof x === 'string' && x.trim() !== '';
  const isCount = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;
  if (!isObject(value)) return fail('not an object');
  if (typeof value.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) fail('date');
  if (typeof value.gap !== 'number' || !Number.isFinite(value.gap) || value.gap < 0 || value.gap > 5) fail('gap');
  const lines = value.lines;
  if (!Array.isArray(lines) || lines.length < 2) return fail('lines');
  const ids = new Set<string>();
  const kinds = new Set(['open', 'story', 'aside', 'close']);
  let stories = 0;
  let asides = 0;
  lines.forEach((line: unknown, k: number) => {
    const where = `line ${k}`;
    if (!isObject(line)) return fail(where);
    if (!isText(line.id) || ids.has(line.id)) fail(`${where} id`);
    ids.add(line.id as string);
    if (typeof line.kind !== 'string' || !kinds.has(line.kind)) fail(`${where} kind`);
    if (!isText(line.text)) fail(`${where} text`);
    if (typeof line.seconds !== 'number' || !Number.isFinite(line.seconds) || line.seconds <= 0 || line.seconds > 120) fail(`${where} seconds`);
    if (line.kind === 'aside' && (k === 0 || k === lines.length - 1)) fail(`${where} kind (an aside, never first or last)`);
    if ((line.kind === 'open') !== (k === 0)) fail(`${where} kind (one open, first)`);
    if ((line.kind === 'close') !== (k === lines.length - 1)) fail(`${where} kind (one close, last)`);
    if (line.kind === 'aside') {
      if (++asides > 2) fail(`${where} kind (at most two asides)`);
      if (line.after !== undefined && line.after !== stories) fail(`${where} after`);
    }
    if (line.kind !== 'story') return;
    stories += 1;
    if (!isCount(line.n) || !isCount(line.of) || line.n < 1 || line.n > line.of) fail(`${where} n/of`);
    const story = line.story;
    if (!isObject(story)) return fail(`${where} story`);
    if (!isText(story.cell) || !isText(story.place) || !isText(story.headline) || typeof story.source !== 'string') fail(`${where} story text`);
    if (typeof story.lat !== 'number' || typeof story.lon !== 'number' || Math.abs(story.lat) > 90 || Math.abs(story.lon) > 180) fail(`${where} story lat/lon`);
    if (!isCount(story.n) || !isCount(story.o) || !isCount(story.l)) fail(`${where} story counts`);
    if (typeof story.spoken !== 'boolean' || typeof story.lang !== 'string') fail(`${where} story spoken/lang`);
    if (story.said !== undefined && typeof story.said !== 'string') fail(`${where} story said`);
    if (story.variant !== undefined && typeof story.variant !== 'string') fail(`${where} story variant`);
    if (story.g !== undefined && story.g !== null && (typeof story.g !== 'number' || !(story.g >= 0 && story.g <= 1))) fail(`${where} story g`);
    if (story.grim !== undefined && typeof story.grim !== 'boolean') fail(`${where} story grim`);
    if (story.frame !== undefined && typeof story.frame !== 'string') fail(`${where} story frame`);
    const original = story.original;
    if (original !== undefined && (!isObject(original) || !isText(original.headline) || typeof original.source !== 'string' || typeof original.lang !== 'string' || typeof original.url !== 'string')) fail(`${where} story original`);
  });
  return value as unknown as NewscastScript;
}

/**
 * The newscast's plan at `fps`: per line in order, with `script.gap` seconds after each,
 * `open` and `aside` -> one open-type segment (kind `open`, naming its line) of the
 * line's seconds; `story` -> a flight of NEWSCAST_FLIGHT,
 * the line's audio starting LINE_LEAD into it, then a card from the flight's end until the
 * audio ends plus NEWSCAST_CARD_HOLD (LINE_LEAD + seconds + NEWSCAST_CARD_HOLD -
 * NEWSCAST_FLIGHT); `close` -> one close segment of seconds + NEWSCAST_CLOSE_HOLD. The gap is
 * held by the line's last segment, so segments stay contiguous. Segment edges and line starts
 * are rounded from the running time in seconds (not summed from rounded lengths), so nothing
 * drifts from the audio by more than half a frame; every segment keeps at least one frame.
 * `lines[].start` is where the line's audio starts and `lines[].frames` is its audio.
 */
export function buildNewscastPlan(script: NewscastScript, fps: number): NewscastPlan {
  const segments: NewscastSegment[] = [];
  const lines: NewscastPlan['lines'] = [];
  let t = 0;
  let frame = 0;
  const add = (kind: NewscastKind, line: string, seconds: number) => {
    t += Math.max(0, seconds);
    const end = Math.max(frame + 1, Math.round(t * fps));
    segments.push({ kind, line, start: frame, frames: end - frame });
    frame = end;
  };
  for (const line of script.lines) {
    const start = line.kind === 'story' ? Math.round((t + LINE_LEAD) * fps) : frame;
    lines.push({ id: line.id, start, frames: framesFor(line.seconds, fps) });
    if (line.kind === 'open' || line.kind === 'aside') add('open', line.id, line.seconds + script.gap);
    else if (line.kind === 'close') add('close', line.id, line.seconds + NEWSCAST_CLOSE_HOLD + script.gap);
    else {
      add('flight', line.id, NEWSCAST_FLIGHT);
      add('card', line.id, LINE_LEAD + line.seconds + NEWSCAST_CARD_HOLD - NEWSCAST_FLIGHT + script.gap);
    }
  }
  const card = segments.find((s) => s.kind === 'card');
  return { fps, frames: frame, date: script.date, poster: card ? card.start + card.frames - 1 : Math.max(0, frame - 1), segments, lines };
}

/** The newscast segment holding frame i and i's offset into it, or null outside the plan. */
export function newscastSegmentAt(plan: NewscastPlan, i: number): { segment: NewscastSegment; offset: number } | null {
  for (const segment of plan.segments) {
    if (i >= segment.start && i < segment.start + segment.frames) return { segment, offset: i - segment.start };
  }
  return null;
}

/**
 * The time (seconds from the line's start) at which the voice reaches character `offset` of
 * `text`, read at an even rate over `seconds`: seconds x offset / length.
 */
export const spokenAt = (text: string, offset: number, seconds: number): number => (text.length ? (seconds * Math.min(Math.max(0, offset), text.length)) / text.length : 0);

/** A sentence end: ., ! or ? (and any closing quote) and the space after it, before a capital, a digit or a quote. */
const SENTENCE_END = /[.!?]["'”’)\]]*\s+(?=[A-Z0-9"'“‘(])/g;

/** `text` split at its sentence ends, each sentence with the time the voice reaches it at an even rate. */
export function sentenceTimes(text: string, seconds: number): { text: string; at: number }[] {
  const out: { text: string; at: number }[] = [];
  let from = 0;
  for (const m of text.matchAll(SENTENCE_END)) {
    const cut = (m.index ?? 0) + m[0].trimEnd().length;
    out.push({ text: text.slice(from, cut), at: spokenAt(text, from, seconds) });
    from = (m.index ?? 0) + m[0].length;
  }
  if (from < text.length) out.push({ text: text.slice(from).trim(), at: spokenAt(text, from, seconds) });
  return out.filter((s) => s.text);
}

/** How many of `times` (ascending) have been reached at `t` seconds; an epsilon absorbs float error. */
export const reached = (times: readonly number[], t: number): number => times.filter((at) => at <= t + 1e-9).length;
