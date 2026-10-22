// The replay: the frames in history/index.json drawn as a field of 1px bars (articles per
// snapshot), a trend line and a table of recent frames. The last frame is the live snapshot
// (heat.json), so it never needs its own fetch. A range input stays as the keyboard and
// screen-reader scrubber (and what the clip renderer waits for).
import { loadFrame, loadHistoryIndex, type FrameRow, type HistoryFrame } from './data';
import { count, stampOf, utcTime } from './format';

const FPS = 6;
const PREFETCH_CONCURRENCY = 3;
const MIN_FRAMES = 4;
/** Frames on each side of the centre in the trend line's mean (9-frame window). */
const TREND_HALF = 4;
const RECENT_ROWS = 8;

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

const $ = <T extends Element>(id: string) => document.getElementById(id) as unknown as T;

/** Two-digit frame index: 00 … 95. */
const pad = (i: number) => String(i).padStart(2, '0');

/** "+11", "−45" (a true minus sign), "0". */
const signed = (d: number) => (d > 0 ? `+${count(d)}` : d < 0 ? `−${count(-d)}` : '0');

/**
 * The whole frame inverts for one painted frame at the moment the map returns to the live
 * snapshot or replay starts. Never under reduced motion.
 */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function invertOnce() {
  if (reducedMotion.matches) return;
  const root = document.documentElement;
  root.classList.add('invert');
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('invert')));
}

function showEmpty(text: string) {
  const empty = $<HTMLElement>('replay-empty');
  empty.textContent = text;
  empty.hidden = false;
}

/** Loads the index and wires up the field. Resolves null (field stays hidden) if there is nothing to replay. */
export async function initReplay(live: LiveMoment, onFrame: (view: FrameView) => void): Promise<Replay | null> {
  let frames: HistoryFrame[];
  try {
    frames = await loadHistoryIndex();
  } catch {
    showEmpty('No replay history in this snapshot.');
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
  // Too few frames make a replay that says nothing: the field still draws the frames that
  // exist (on a 96-slot scale), but there is nothing to scrub, and a note says why.
  const tooFew = frames.length < MIN_FRAMES;

  const root = $<HTMLElement>('scrubber');
  const range = $<HTMLInputElement>('scrub-range');
  const play = $<HTMLButtonElement>('scrub-play');
  const label = $<HTMLElement>('scrub-time');
  const liveTag = $<HTMLElement>('scrub-live');
  const barsEl = $<HTMLElement>('bars');
  const barTag = $<HTMLElement>('bar-tag');
  const idx = $<HTMLElement>('bar-idx');
  const fieldCount = $<HTMLElement>('field-count');
  const trendLine = $<SVGPolylineElement>('trend-line');
  const trendMax = $<HTMLElement>('trend-max');
  const recent = $<HTMLTableSectionElement>('recent');

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

  // The field ------------------------------------------------------------------
  const articles = frames.map((f) => f.totals?.articles ?? 0);
  const max = Math.max(1, ...articles);
  const slots = tooFew ? 95 : Math.max(1, last);
  const frac = (i: number) => i / slots;
  const pos = (i: number) => `${frac(i) * 100}%`;

  const bars = articles.map((n, i) => {
    const bar = document.createElement('span');
    bar.className = 'bar';
    bar.style.left = pos(i);
    bar.style.setProperty('--h', `${Math.max(2, (n / max) * 100)}%`);
    return bar;
  });
  barsEl.replaceChildren(...bars);

  // Index labels every 12 frames (three hours), plus the last frame.
  const labels: HTMLElement[] = [];
  for (let i = 0; i <= last; i++) {
    if (i % 12 !== 0 && i !== last) continue;
    if (i !== last && last - i < 6) continue; // no label crowding the last one
    const tag = document.createElement('span');
    tag.textContent = pad(i);
    tag.style.left = pos(i);
    if (frac(i) > 0.97) tag.className = 'is-end';
    labels.push(tag);
  }
  idx.replaceChildren(...labels);

  // Trend: a 9-frame centred mean, as one polyline in a 1000 x 44 box.
  const means = articles.map((_, i) => {
    const a = Math.max(0, i - TREND_HALF);
    const b = Math.min(last, i + TREND_HALF);
    let sum = 0;
    for (let j = a; j <= b; j++) sum += articles[j];
    return sum / (b - a + 1);
  });
  trendLine.setAttribute(
    'points',
    means.map((m, i) => `${(frac(i) * 1000).toFixed(1)},${(43 - (m / max) * 41).toFixed(1)}`).join(' '),
  );
  trendMax.textContent = `${count(max)} max`;

  // Recent frames: the newest few, each a click away (the last one returns to live).
  const rows = Array.from({ length: Math.min(RECENT_ROWS, frames.length) }, () => {
    const tr = document.createElement('tr');
    for (let c = 0; c < 4; c++) tr.append(document.createElement('td'));
    tr.addEventListener('click', () => {
      const i = Number(tr.dataset.index);
      if (Number.isNaN(i) || tooFew) return;
      setPlaying(false);
      go(i);
    });
    recent.append(tr);
    return tr;
  });

  function updateField() {
    bars.forEach((bar, i) => {
      bar.classList.toggle('is-after', i > target);
      bar.classList.toggle('is-current', i === target);
    });
    barTag.textContent = pad(target);
    barTag.style.left = pos(target);
    barTag.classList.toggle('is-end', frac(target) > 0.97);
    barTag.classList.toggle('is-start', frac(target) < 0.03);
    fieldCount.textContent = `${pad(target)}/${pad(last)}`;
    // Always the newest frames, ending at live; the frame on screen is inverted when listed.
    rows.forEach((tr, r) => {
      const i = last - rows.length + 1 + r;
      const cells = tr.children;
      tr.dataset.index = String(i);
      cells[0].textContent = pad(i);
      cells[1].textContent = utcTime(frames[i].at).replace(' UTC', '');
      cells[2].textContent = count(articles[i]);
      cells[3].textContent = i > 0 ? signed(articles[i] - articles[i - 1]) : '';
      tr.classList.toggle('is-on', i === target);
      tr.title = i === last ? 'live snapshot' : '';
    });
  }

  if (tooFew) {
    updateField();
    root.classList.add('is-static');
    root.hidden = false;
    showEmpty(`Replay starts at ${MIN_FRAMES} snapshots. ${frames.length} so far.`);
    return null;
  }

  function updateControl() {
    const time = utcTime(frames[target].at);
    range.value = String(target);
    label.textContent = time;
    liveTag.hidden = target !== last;
    range.setAttribute('aria-valuetext', target === last ? `${time}, live` : time);
    root.classList.toggle('is-live', target === last);
    updateField();
  }

  function go(i: number) {
    const before = target;
    target = Math.max(0, Math.min(last, i));
    if (target === last && before !== last) invertOnce();
    updateControl();
    void fetchFrame(target);
    render();
  }

  function setPlaying(on: boolean) {
    window.clearInterval(timer);
    timer = 0;
    play.classList.toggle('is-playing', on);
    play.setAttribute('aria-label', on ? 'Pause' : playLabel);
    root.classList.toggle('is-playing', on);
    if (!on) return;
    invertOnce();
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

  // Pointer scrubbing on the bars: a press or a drag picks the nearest frame.
  const indexAt = (clientX: number) => {
    const box = barsEl.getBoundingClientRect();
    return Math.max(0, Math.min(last, Math.round(((clientX - box.left) / Math.max(1, box.width)) * last)));
  };
  let dragging = false;
  barsEl.addEventListener('pointerdown', (e) => {
    dragging = true;
    barsEl.setPointerCapture(e.pointerId);
    setPlaying(false);
    go(indexAt(e.clientX));
  });
  barsEl.addEventListener('pointermove', (e) => {
    if (dragging && indexAt(e.clientX) !== target) go(indexAt(e.clientX));
  });
  const stopDrag = () => (dragging = false);
  barsEl.addEventListener('pointerup', stopDrag);
  barsEl.addEventListener('pointercancel', stopDrag);

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
