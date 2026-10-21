// The time scrubber: replays the frames in history/index.json. The last frame is the
// live snapshot (heat.json), so it never needs its own fetch.
import { loadFrame, loadHistoryIndex, type FrameRow, type HistoryFrame } from './data';
import { stampOf, utcTime } from './format';

const FPS = 6;
const PREFETCH_CONCURRENCY = 3;
const MIN_FRAMES = 4;

/** The span the frames cover, from the data: "6 hours", or "45 minutes" below an hour. */
export function spanLabel(firstAt: string, lastAt: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(lastAt) - Date.parse(firstAt)) / 60000));
  if (minutes < 60) return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

export interface FrameView {
  /** The frame the scrubber points at (what goes in the permalink). */
  index: number;
  /** True when that frame is the last one, i.e. live. */
  live: boolean;
  /** The frame actually drawn: the target, or the nearest loaded one while it loads. */
  shown: HistoryFrame;
  /** Rows of the drawn frame, or null when the drawn frame is the live snapshot. */
  rows: FrameRow[] | null;
}

export interface Replay {
  frames: HistoryFrame[];
  selectLive(): void;
  /** Selects a frame by its permalink stamp; returns false if no frame matches. */
  selectStamp(stamp: string): boolean;
  stamp(index: number): string;
  /** Rows of a frame once loaded; null for the live frame or a frame that failed to load. */
  rows(index: number): Promise<FrameRow[] | null>;
}

/** The live snapshot as heat.json describes it; the replay's last frame must be this moment. */
export interface LiveMoment {
  at: string;
  windowHours: number;
  totals: HistoryFrame['totals'];
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Loads the index and wires up the control. Resolves null (control stays hidden) if there is nothing to replay. */
export async function initReplay(live: LiveMoment, onFrame: (view: FrameView) => void): Promise<Replay | null> {
  let frames: HistoryFrame[];
  try {
    frames = await loadHistoryIndex();
  } catch {
    return null;
  }
  // heat.json and index.json are fetched separately, so a deploy or a stale cached copy in
  // between can make them disagree. heat.json is what the map draws: drop index entries
  // newer than it, and make sure the last frame is exactly its moment.
  const liveTime = Date.parse(live.at);
  frames = frames.filter((f) => Date.parse(f.at) <= liveTime);
  if (!frames.length || Date.parse(frames[frames.length - 1].at) !== liveTime) {
    frames.push({ at: live.at, file: '', windowHours: live.windowHours, totals: live.totals });
  }
  // Too few frames make a replay that says nothing; keep the control hidden until there are more.
  if (frames.length < MIN_FRAMES) return null;

  const root = $<HTMLElement>('scrubber');
  const range = $<HTMLInputElement>('scrub-range');
  const play = $<HTMLButtonElement>('scrub-play');
  const label = $<HTMLElement>('scrub-time');
  const liveTag = $<HTMLElement>('scrub-live');
  const ticks = $<HTMLElement>('scrub-ticks');

  const last = frames.length - 1;
  // Labels say the span the frames actually cover, not a fixed 24 hours.
  const span = spanLabel(frames[0].at, frames[last].at);
  const playLabel = `Play the last ${span}`;
  const cache = new Map<number, FrameRow[]>();
  const loading = new Map<number, Promise<void>>();
  const failed = new Set<number>();
  let target = last;
  let timer = 0;
  let prefetchCursor = last;
  let prefetching = false;

  const ready = (i: number) => i === last || cache.has(i);

  function fetchFrame(i: number): Promise<void> {
    if (ready(i) || failed.has(i)) return Promise.resolve();
    let p = loading.get(i);
    if (!p) {
      p = loadFrame(frames[i].file)
        .then((rows) => void cache.set(i, rows), () => void failed.add(i))
        .finally(() => {
          loading.delete(i);
          render();
        });
      loading.set(i, p);
    }
    return p;
  }

  function nearestReady(i: number): number {
    for (let d = 0; d <= last; d++) {
      if (i - d >= 0 && ready(i - d)) return i - d;
      if (i + d <= last && ready(i + d)) return i + d;
    }
    return last;
  }

  let drawn = -1;
  let drawnTarget = -1;
  function render() {
    const shown = nearestReady(target);
    // Skip redundant redraws when a background prefetch finishes.
    if (shown === drawn && target === drawnTarget) return;
    drawn = shown;
    drawnTarget = target;
    onFrame({ index: target, live: target === last, shown: frames[shown], rows: shown === last ? null : cache.get(shown)! });
  }

  function updateControl() {
    const time = utcTime(frames[target].at);
    range.value = String(target);
    label.textContent = time;
    liveTag.hidden = target !== last;
    range.setAttribute('aria-valuetext', target === last ? `${time}, live` : time);
    root.classList.toggle('is-live', target === last);
  }

  function go(i: number) {
    target = Math.max(0, Math.min(last, i));
    updateControl();
    void fetchFrame(target);
    render();
  }

  function setPlaying(on: boolean) {
    window.clearInterval(timer);
    timer = 0;
    play.classList.toggle('is-playing', on);
    play.setAttribute('aria-label', on ? 'Pause' : playLabel);
    if (!on) return;
    if (target === last) go(0);
    prefetchFrom(target);
    timer = window.setInterval(() => {
      const next = target + 1;
      // Wait for the next frame rather than skipping ahead: no stutter, just a pause.
      if (!ready(next) && !failed.has(next)) return void fetchFrame(next);
      go(next);
      if (next >= last) setPlaying(false);
    }, 1000 / FPS);
  }

  // One pool of workers sharing one cursor, however often play is pressed. A new play
  // moves the cursor back to the playhead and gives frames that failed another try.
  function prefetchFrom(start: number) {
    failed.clear();
    prefetchCursor = start;
    if (prefetching) return;
    prefetching = true;
    const worker = async () => {
      while (prefetchCursor < last) await fetchFrame(prefetchCursor++);
    };
    void Promise.all(Array.from({ length: PREFETCH_CONCURRENCY }, worker)).finally(() => {
      prefetching = false;
    });
  }

  // Faint hour ticks; a slightly taller one every six hours (00, 06, 12, 18 UTC).
  const hourOf = (i: number) => Math.floor(Date.parse(frames[i].at) / 3600000);
  for (let i = 1; i <= last; i++) {
    const hour = hourOf(i);
    if (Number.isNaN(hour) || hour === hourOf(i - 1)) continue;
    const tick = document.createElement('span');
    if (hour % 6 === 0) tick.className = 'major';
    tick.style.left = `${(i / last) * 100}%`;
    ticks.append(tick);
  }

  range.min = '0';
  range.max = String(last);
  range.step = '1';
  range.addEventListener('input', () => {
    setPlaying(false);
    go(Number(range.value));
  });
  range.addEventListener('keydown', (e) => {
    if (e.key === ' ') {
      e.preventDefault();
      setPlaying(!timer);
    }
  });
  play.addEventListener('click', () => setPlaying(!timer));

  play.setAttribute('aria-label', playLabel);
  root.setAttribute('aria-label', `Replay the last ${span}`);
  updateControl();
  root.hidden = false;

  return {
    frames,
    stamp: (i) => stampOf(frames[i].at),
    async rows(i) {
      await fetchFrame(i);
      return cache.get(i) ?? null;
    },
    selectLive() {
      setPlaying(false);
      go(last);
    },
    selectStamp(stamp) {
      const i = frames.findIndex((f) => stampOf(f.at) === stamp);
      if (i < 0) return false;
      setPlaying(false);
      go(i);
      return true;
    },
  };
}
