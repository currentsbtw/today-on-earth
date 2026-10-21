// clip.html: one still frame of the map for a headless time-lapse renderer. No header,
// panel or controls. Three modes, all drawn at a fixed size and reporting readiness the
// same way:
//   ?t=<stamp>       the world fitted to the frame's aspect, the heat of one replay frame, a
//                    wordmark, the frame's date and time, and its counts;
//   ?signal=<slot>   one broadcast slot: the map zoomed to the slot's cell with the live
//                    heat, the slot label, its fixed sentence and the outlet's own headline;
//   ?end=1           the live snapshot's world with the counts and the site address.
// Nothing animates.
import './clip.css';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { loadBroadcast, signalLine, SLOT_IDS, SLOT_LABELS, type SlotId } from './broadcast';
import { loadFrame, loadHeat, loadHistoryIndex, siteUrl, type FrameRow, type Heat, type Totals } from './data';
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
// Cards keep their text out of the strips a 9:16 short's platform UI covers.
const safeTop = Math.round(H * 0.12);
const safeBottom = Math.round(H * 0.18);
const unit = Math.min(W, H) / 100;
// `dark=1` is the only theme for now; the parameter is accepted so renderer URLs stay stable.

const root = document.getElementById('clip')!;
root.style.width = `${W}px`;
root.style.height = `${H}px`;
root.style.setProperty('--u', `${unit}px`);
root.style.setProperty('--top-band', `${topBand}px`);
root.style.setProperty('--bottom-band', `${bottomBand}px`);
root.style.setProperty('--safe-top', `${safeTop}px`);
root.style.setProperty('--safe-bottom', `${safeBottom}px`);
root.classList.toggle('clip--portrait', portrait);

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const el = (id: string) => document.getElementById(id)!;

let marked = false;
function markReady(error?: string) {
  // First outcome wins: a late timeout must not flag a frame that already finished.
  if (marked) return;
  marked = true;
  if (error) document.body.dataset.error = error;
  (window as unknown as { __clipReady: boolean }).__clipReady = true;
  document.body.dataset.ready = '1';
}

function setTime(at: string) {
  el('clip-time').textContent = `${dateFormat.format(new Date(at))} · ${utcTime(at)}`;
}

function setCounts(totals: Totals) {
  el('clip-counts').textContent = [
    plural(totals.articles, 'article', 'articles'),
    plural(totals.outlets, 'outlet', 'outlets'),
    plural(totals.countries, 'country', 'countries'),
  ].join(' · ');
}

/**
 * `max=<n>` fixes the heat scale so every frame of a time-lapse (and its cards) uses the
 * same one; without it (or if invalid) the live snapshot's largest n is used, as in replay.
 */
function heatMax(heat: Heat): number {
  const requested = Number(params.get('max'));
  return Number.isFinite(requested) && requested >= 1 ? requested : Math.max(1, ...heat.cells.map((c) => c.n));
}

const idle = (map: MapLibreMap) => new Promise<void>((resolve) => map.once('idle', () => resolve()));

async function renderFrame() {
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
  const maxN = heatMax(heat);
  const cells: MapCell[] = rows
    ? rows.map(([id, lat, lon, n]) => ({ id, lat, lon, n, name: live.get(id)?.name ?? '' }))
    : heat.cells;

  setTime(at);
  setCounts(totals);

  const { map, setCells } = await createClipMap(el('clip-map'), {
    top: topBand,
    bottom: bottomBand,
    left: 0,
    right: 0,
  });
  setCells(cells, maxN);
  await idle(map);
  await document.fonts.ready;
  markReady();
}

/** Zoom of a signal card: 4 at 1080 px wide, scaled with the frame so the same region shows at any size. */
const signalZoom = () => Math.min(6, Math.max(2, 4 + Math.log2(W / 1080)));

/** The finer outlines the live site loads past zoom 3; on failure the 110m outlines stay. */
async function loadDetail(map: MapLibreMap) {
  const files: [source: string, path: string][] = [
    ['countries', 'geo/countries-50m.json'],
    ['admin1', 'geo/admin1-lines.json'],
  ];
  await Promise.all(
    files.map(([source, path]) =>
      fetch(siteUrl(path))
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`${res.status} ${path}`))))
        .then((data: GeoJSON.FeatureCollection) => void map.getSource<GeoJSONSource>(source)?.setData(data))
        .catch(() => {}),
    ),
  );
}

/** Light the cell's own hexagon as the live site does for a selected cell. */
async function outlineCell(map: MapLibreMap, id: string) {
  const { cellToBoundary } = await import('h3-js');
  const ring = cellToBoundary(id, true);
  const lngs = ring.map((p) => p[0]);
  // A cell crossing the antimeridian would draw a band across the whole map; skip it.
  if (Math.max(...lngs) - Math.min(...lngs) > 180) return;
  map.getSource<GeoJSONSource>('selected')?.setData({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} });
}

/** Shrink the card's type until it fits `maxHeight`; a headline still too long is clamped by CSS. */
function fitCard(card: HTMLElement, maxHeight: number) {
  for (let step = 0; step <= 8; step++) {
    card.style.setProperty('--fit', String(1 - step * 0.05));
    if (card.offsetHeight <= maxHeight) return;
  }
}

async function renderSignal(id: string) {
  if (!(SLOT_IDS as readonly string[]).includes(id)) throw new Error(`unknown slot ${id}`);
  const [heat, broadcast] = await Promise.all([loadHeat(), loadBroadcast()]);
  const slot = broadcast.slots.find((s) => s.id === id);
  if (!slot) throw new Error(`slot ${id} missing`);
  if (!slot.available || !slot.cell || !slot.story) throw new Error(`slot ${id} unavailable`);
  const { cell, story } = slot;

  root.classList.add('clip--card', 'clip--signal');
  setTime(broadcast.generatedAt);
  el('clip-slot').textContent = SLOT_LABELS[id as SlotId];
  el('clip-line').textContent = signalLine(slot);
  if (story.headline) {
    const headline = el('clip-headline');
    headline.textContent = story.headline;
    if (story.headlineLang) headline.lang = story.headlineLang;
    el('clip-outlet').textContent = story.headlineSource;
  } else {
    el('clip-quote').hidden = true;
  }
  const card = el('clip-card');
  card.hidden = false;
  el('clip-scrim-top').hidden = false;
  el('clip-scrim').hidden = false;

  // Lay the text out before the map so the cell can be centred in the area left between the
  // wordmark and the card; at least 22% of the frame stays map.
  await document.fonts.ready;
  const textTop = Math.max(topBand, Math.round(document.querySelector<HTMLElement>('.clip-top')!.getBoundingClientRect().bottom + unit * 2));
  fitCard(card, H - safeBottom - textTop - Math.round(H * 0.22));
  const cardTop = H - safeBottom - card.offsetHeight;
  el('clip-scrim-top').style.height = `${textTop + Math.round(unit * 6)}px`;
  el('clip-scrim').style.height = `${H - cardTop + Math.round(unit * 12)}px`;

  const { map, setCells } = await createClipMap(
    el('clip-map'),
    { top: textTop, bottom: H - cardTop, left: 0, right: 0 },
    { center: [cell.lon, cell.lat], zoom: signalZoom() },
  );
  await Promise.all([loadDetail(map), outlineCell(map, cell.id).catch(() => {})]);
  setCells(heat.cells, heatMax(heat));
  await idle(map);
  markReady();
}

async function renderEnd() {
  const heat = await loadHeat();
  root.classList.add('clip--card', 'clip--end');
  setTime(heat.generatedAt);
  setCounts(heat.totals);
  const end = el('clip-end');
  end.prepend(el('clip-counts'));
  end.hidden = false;

  // Same framing as the last frame of the time-lapse: the live snapshot's whole world.
  const { map, setCells } = await createClipMap(el('clip-map'), {
    top: topBand,
    bottom: bottomBand,
    left: 0,
    right: 0,
  });
  setCells(heat.cells, heatMax(heat));
  await idle(map);
  await document.fonts.ready;
  markReady();
}

function render(): Promise<void> {
  const signal = params.get('signal');
  if (signal !== null) return renderSignal(signal);
  if (params.get('end') === '1') return renderEnd();
  return renderFrame();
}

// A renderer waits for data-ready; on failure it also gets data-error so it never hangs.
const TIMEOUT_MS = 20_000;
const timeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS));
Promise.race([render(), timeout]).catch((e: unknown) => markReady(e instanceof Error ? e.message : 'failed'));
