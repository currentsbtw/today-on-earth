// clip.html: one still frame of the map for a headless time-lapse renderer. No header,
// panel or controls; the world fitted to the frame's aspect, the heat of one replay frame,
// a wordmark, the frame's date and time, and its counts. Nothing animates.
import './clip.css';
import { loadFrame, loadHeat, loadHistoryIndex, type FrameRow, type Totals } from './data';
import { plural, stampOf, utcTime } from './format';
import { createClipMap, type MapCell } from './map';

const params = new URLSearchParams(location.search);
const size = (value: string | null, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 320 && n <= 4096 ? Math.round(n) : fallback;
};
const W = size(params.get('w'), 1920);
const H = size(params.get('h'), 1080);
const portrait = H > W;
// Reserved bands for the text: portrait leaves the top ~25% and bottom ~20% to text.
const topBand = Math.round(H * (portrait ? 0.25 : 0.17));
const bottomBand = Math.round(H * (portrait ? 0.2 : 0.12));
// `dark=1` is the only theme for now; the parameter is accepted so renderer URLs stay stable.

const root = document.getElementById('clip')!;
root.style.width = `${W}px`;
root.style.height = `${H}px`;
root.style.setProperty('--u', `${Math.min(W, H) / 100}px`);
root.style.setProperty('--top-band', `${topBand}px`);
root.style.setProperty('--bottom-band', `${bottomBand}px`);

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

let marked = false;
function markReady(error?: string) {
  // First outcome wins: a late timeout must not flag a frame that already finished.
  if (marked) return;
  marked = true;
  if (error) document.body.dataset.error = error;
  (window as unknown as { __clipReady: boolean }).__clipReady = true;
  document.body.dataset.ready = '1';
}

async function render() {
  const [heat, frames] = await Promise.all([loadHeat(), loadHistoryIndex().catch(() => [])]);
  let at = heat.generatedAt;
  let totals: Totals = heat.totals;
  let rows: FrameRow[] | null = null;

  const t = params.get('t');
  if (t) {
    const frame = frames.find((f) => stampOf(f.at) === t);
    if (!frame) throw new Error(`unknown frame ${t}`);
    // The last index entry is the live snapshot and has no separate frame to load.
    if (frame.file && Date.parse(frame.at) !== Date.parse(heat.generatedAt)) {
      rows = await loadFrame(frame.file);
      at = frame.at;
      totals = frame.totals;
    }
  }

  const live = new Map(heat.cells.map((c) => [c.id, c]));
  const maxN = Math.max(1, ...heat.cells.map((c) => c.n));
  const cells: MapCell[] = rows
    ? rows.map(([id, lat, lon, n]) => ({ id, lat, lon, n, name: live.get(id)?.name ?? '' }))
    : heat.cells;

  const when = new Date(at);
  document.getElementById('clip-time')!.textContent = `${dateFormat.format(when)} · ${utcTime(at)}`;
  document.getElementById('clip-counts')!.textContent = [
    plural(totals.articles, 'article', 'articles'),
    plural(totals.outlets, 'outlet', 'outlets'),
    plural(totals.countries, 'country', 'countries'),
  ].join(' · ');

  const { map, setCells } = await createClipMap(document.getElementById('clip-map')!, {
    top: topBand,
    bottom: bottomBand,
    left: 0,
    right: 0,
  });
  setCells(cells, maxN);
  await new Promise<void>((resolve) => map.once('idle', () => resolve()));
  await document.fonts.ready;
  markReady();
}

// A renderer waits for data-ready; on failure it also gets data-error so it never hangs.
const TIMEOUT_MS = 20_000;
const timeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS));
Promise.race([render(), timeout]).catch((e: unknown) => markReady(e instanceof Error ? e.message : 'failed'));
