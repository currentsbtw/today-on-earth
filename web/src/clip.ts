// clip.html: one still frame of the map for a headless time-lapse renderer. No header,
// panel or controls. Three modes, all drawn at a fixed size and reporting readiness the
// same way:
//   ?t=<stamp>       the heat of one replay frame, a wordmark, the frame's date and time, a
//                    fixed line saying what a dot and its size mean, and its counts. Landscape frames fit the whole world. Portrait frames fill
//                    the map window's height with the world (about 60% of its width in view)
//                    and centre the longitude of local noon at the frame's time, so the camera
//                    turns once westward over the day;
//   ?signal=<slot>   one broadcast slot: the map at the slot's cell with the live heat, the
//                    cell's outline, reticle and name tag, the slot label, its fixed
//                    sentence and the outlet's own headline. With `from=<ref>&fly=<F>` the
//                    page is a flight to that card instead: it opens on step 0 (the
//                    time-lapse layout at the `from` camera, captioned with the slot label)
//                    and window.__clipStep(i) moves it to step i of F; step F is the card;
//   ?end=1           the logo lockup, the site address and the live snapshot's totals.
// Nothing animates: the renderer captures stills, and the camera moves only between them.
// The look (Datamatics Field) lives in clip.css: black text bands with the dot grid above
// and below a tick-edged map window.
import './clip.css';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { loadBroadcast, signalLine, SLOT_IDS, SLOT_LABELS, type Broadcast, type Slot, type SlotId } from './broadcast';
import { loadFrame, loadHeat, loadHistoryIndex, siteUrl, type FrameRow, type Heat, type HistoryFrame, type Totals } from './data';
import { flightPath, wrapLon } from './flight';
import { count, shortName, stampOf, utcTime } from './format';
import { createClipMap, EMPTY, FILL_LAT, fillHeightZoom, fitWorldZoom, latOf, mercY, TILE, type ClipCamera, type MapCell } from './map';

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
// The 8px dot grid of a 540 px wide frame, scaled with the frame.
root.style.setProperty('--dot', `${Math.max(8, Math.round(unit * 1.48))}px`);
for (const ticks of document.querySelectorAll('.clip-ticks')) ticks.replaceChildren(...Array.from({ length: 25 }, () => document.createElement('i')));

// The marks draw at whole multiples of their pixel grids so every pixel is the same size:
// the 24-grid mark at 2x on a 540 px frame and 3x at 1080; the 128-grid lockup at ~45% of
// the frame's shorter side.
root.style.setProperty('--mark', `${24 * Math.max(1, Math.round(Math.min(W, H) / 360))}px`);
root.style.setProperty('--lockup', `${128 * Math.max(1, Math.round((Math.min(W, H) * 0.45) / 128))}px`);

/** The map window: its top and bottom edge in px from the top of the frame. */
interface Window {
  top: number;
  bottom: number;
}

/** Where the map window starts and ends (px from the top); the bands and edges follow. */
function setEdges({ top, bottom }: Window) {
  root.style.setProperty('--edge-top', `${Math.round(top)}px`);
  root.style.setProperty('--edge-bottom', `${Math.round(bottom)}px`);
}
setEdges({ top: topBand, bottom: H - bottomBand });
/** The tick length clip.css resolves for --tick. */
const tickLength = () => el('clip-edge-top').offsetHeight;
/** Map padding that centres the camera in a window spanning the full width. */
const paddingOf = (w: Window) => ({ top: w.top, bottom: H - w.bottom, left: 0, right: 0 });

const dateFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const el = (id: string) => document.getElementById(id)!;

let marked = false;
/** Put the pixel mark on whole device pixels (a fractional offset blurs its pixel rows). */
function snapMark() {
  const mark = el('clip-mark');
  const r = mark.getBoundingClientRect();
  if (!r.width) return;
  const wordmark = mark.parentElement!;
  wordmark.style.position = 'relative';
  wordmark.style.left = `${Math.round(r.left) - r.left}px`;
  wordmark.style.top = `${Math.round(r.top) - r.top}px`;
}

function markReady(error?: string) {
  // First outcome wins: a late timeout must not flag a frame that already finished.
  if (marked) return;
  marked = true;
  snapMark();
  if (error) document.body.dataset.error = error;
  (window as unknown as { __clipReady: boolean }).__clipReady = true;
  document.body.dataset.ready = '1';
}

/** "WED 21 OCT 2026  19:30 UTC" (uppercased by CSS). */
function setTime(at: string) {
  const date = dateFormat.format(new Date(at)).replace(/,/g, '');
  el('clip-time').replaceChildren(Object.assign(document.createElement('span'), { textContent: date }), Object.assign(document.createElement('b'), { textContent: utcTime(at) }));
}

/** Totals along the foot: number over label; null clears them. */
function setCounts(totals: Totals | null) {
  const items: [n: number, one: string, many: string][] = totals
    ? [
        [totals.articles, 'article', 'articles'],
        [totals.cells, 'place', 'places'],
        [totals.outlets, 'outlet', 'outlets'],
        [totals.countries, 'country', 'countries'],
      ]
    : [];
  el('clip-counts').replaceChildren(
    ...items.map(([n, one, many]) => {
      const item = Object.assign(document.createElement('div'), { className: 'clip-count' });
      item.append(Object.assign(document.createElement('b'), { textContent: count(n) }), Object.assign(document.createElement('span'), { textContent: n === 1 ? one : many }));
      return item;
    }),
  );
}

/** The reading key under the date ("One dot per place…"): time-lapse layouts only. */
const showKey = (on: boolean) => void (el('clip-key').hidden = !on);

/**
 * Shrink a one-line element's type (its --fit) until it fits its parent's width. When the
 * parent lays its children out in a row (the landscape end card's "Open a dot at" line beside
 * the address), the siblings and the gaps take their share of that width first.
 */
function fitWidth(node: HTMLElement) {
  const parent = node.parentElement!;
  const style = getComputedStyle(parent);
  let room = parent.clientWidth;
  if (style.display.endsWith('flex') && style.flexDirection.startsWith('row')) {
    const gap = parseFloat(style.columnGap) || 0;
    for (const sibling of parent.children) {
      if (sibling !== node) room -= sibling.getBoundingClientRect().width + gap;
    }
  }
  for (let step = 0; step <= 10; step++) {
    node.style.setProperty('--fit', String(1 - step * 0.05));
    if (node.scrollWidth <= room) return;
  }
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

/** Lay the text out with its fonts loaded (reading a size forces the layout that starts their loads). */
async function fontsLaidOut() {
  void root.offsetHeight;
  await document.fonts.ready;
}

/**
 * Top of the map window under the top text block: the bottom of `.clip-top` + 2.4u + a tick.
 * Landscape keeps at least the reserved top band. Needs the fonts laid out.
 */
function textTop() {
  const bottom = document.querySelector<HTMLElement>('.clip-top')!.getBoundingClientRect().bottom;
  const top = Math.round(bottom + unit * 2.4 + tickLength());
  return portrait ? top : Math.max(topBand, top);
}

/**
 * The time-lapse window. Landscape: the reserved bands, the top one moved down to 2.4u plus a
 * tick under the reading key when the key would reach it. Portrait: from under the top text
 * to the top of the bottom safe strip (the totals sit inside it, on its lower rule).
 */
const timelapseWindow = (): Window => {
  if (portrait) return { top: textTop(), bottom: H - safeBottom };
  const key = el('clip-key');
  const top = key.hidden ? topBand : Math.round(key.getBoundingClientRect().bottom + unit * 2.4 + tickLength());
  return { top: Math.max(topBand, top), bottom: H - bottomBand };
};

/** Longitude of local noon at `at`: 180 - 15 x the UTC hour as a decimal, in [-180, 180). */
function noonLon(at: string) {
  const d = new Date(at);
  const hours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600 + d.getUTCMilliseconds() / 3_600_000;
  return wrapLon(180 - 15 * hours);
}

/**
 * The time-lapse camera at `at` in window `w`: portrait fills the window's height with the
 * world box and centres noon; landscape is undefined (the map fits the world on its own).
 */
const timelapseView = (at: string, w: Window): ClipCamera | undefined =>
  portrait ? { center: [noonLon(at), FILL_LAT], zoom: fillHeightZoom(w.bottom - w.top) } : undefined;

/** What a ?t frame shows: its time, totals and, unless it is the live snapshot, its own rows. */
async function frameInfo(t: string, heat: Heat, frames: HistoryFrame[], rowsToo: boolean) {
  const frame = frames.find((f) => stampOf(f.at) === t);
  if (!frame) throw new Error(`unknown frame ${t}`);
  // The last index entry is the live snapshot and has no separate frame to load.
  if (frame.file && Date.parse(frame.at) !== Date.parse(heat.generatedAt)) {
    return { at: frame.at, totals: frame.totals, rows: rowsToo ? await loadFrame(frame.file) : null };
  }
  return { at: heat.generatedAt, totals: heat.totals, rows: null as FrameRow[] | null };
}

async function renderFrame() {
  const [heat, frames] = await Promise.all([loadHeat(), loadHistoryIndex().catch(() => [])]);
  let at = heat.generatedAt;
  let totals: Totals = heat.totals;
  let rows: FrameRow[] | null = null;

  const t = params.get('t');
  if (t) ({ at, totals, rows } = await frameInfo(t, heat, frames, true));

  const live = new Map(heat.cells.map((c) => [c.id, c]));
  const maxN = heatMax(heat);
  const cells: MapCell[] = rows
    ? rows.map(([id, lat, lon, n]) => ({ id, lat, lon, n, name: live.get(id)?.name ?? '' }))
    : heat.cells;

  setTime(at);
  setCounts(totals);
  showKey(true);
  await fontsLaidOut();
  const w = timelapseWindow();
  setEdges(w);

  const { map, setCells } = await createClipMap(el('clip-map'), paddingOf(w), timelapseView(at, w), { wrap: portrait });
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
      // Bounded so a stalled connection cannot hang a flight step past settle()'s own timeout.
      fetch(siteUrl(path), { signal: AbortSignal.timeout(15_000) })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`${res.status} ${path}`))))
        .then((data: GeoJSON.FeatureCollection) => void map.getSource<GeoJSONSource>(source)?.setData(data))
        .catch(() => {}),
    ),
  );
}


/** The cell's hexagon, or null for one crossing the antimeridian (it would band the whole map). */
async function cellOutline(id: string): Promise<GeoJSON.Feature | null> {
  const { cellToBoundary } = await import('h3-js');
  const ring = cellToBoundary(id, true);
  const lngs = ring.map((p) => p[0]);
  if (Math.max(...lngs) - Math.min(...lngs) > 180) return null;
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} };
}

/**
 * The live site's callout at the cell's centre: the reticle and a tag with the place's name
 * only. No count: beside the card's sentence the place's total would read as the story's.
 */
function cellTag(cell: NonNullable<Slot['cell']>, heat: Heat): GeoJSON.Feature {
  const live = heat.cells.find((c) => c.id === cell.id);
  const label = shortName(live?.name || cell.name);
  return { type: 'Feature', geometry: { type: 'Point', coordinates: [cell.lon, cell.lat] }, properties: { label } };
}

/** Light the cell's hexagon and its tag, or clear both (null). */
function setCallout(map: MapLibreMap, callout: { outline: GeoJSON.Feature | null; tag: GeoJSON.Feature } | null) {
  map.getSource<GeoJSONSource>('selected')?.setData(callout?.outline ?? EMPTY);
  map.getSource<GeoJSONSource>('selected-tag')?.setData(callout?.tag ?? EMPTY);
}

/** Shrink the card's type until it fits `maxHeight`; a headline still too long is clamped by CSS. */
function fitCard(card: HTMLElement, maxHeight: number) {
  for (let step = 0; step <= 8; step++) {
    card.style.setProperty('--fit', String(1 - step * 0.05));
    if (card.offsetHeight <= maxHeight) return;
  }
}

/** A filled slot from the broadcast, or an error naming why it cannot be drawn. */
function filledSlot(broadcast: Broadcast, id: string): Slot & Required<Pick<Slot, 'cell' | 'story'>> {
  if (!(SLOT_IDS as readonly string[]).includes(id)) throw new Error(`unknown slot ${id}`);
  const slot = broadcast.slots.find((s) => s.id === id);
  if (!slot) throw new Error(`slot ${id} missing`);
  if (!slot.available || !slot.cell || !slot.story) throw new Error(`slot ${id} unavailable`);
  return slot as Slot & Required<Pick<Slot, 'cell' | 'story'>>;
}

/**
 * Fill the card with one slot and lay it out: the map window it leaves (from under the top
 * text to above the card, at least 22% of the frame) and where its slot header sits.
 */
async function layoutCard(slot: ReturnType<typeof filledSlot>): Promise<Window & { header: number }> {
  const { story } = slot;
  const card = el('clip-card');
  el('clip-slot').textContent = SLOT_LABELS[slot.id as SlotId];
  el('clip-line').textContent = signalLine(slot);
  const headline = el('clip-headline');
  const quote = el('clip-quote');
  quote.hidden = !story.headline;
  headline.textContent = story.headline;
  headline.removeAttribute('lang');
  if (story.headlineLang) headline.lang = story.headlineLang;
  el('clip-outlet').textContent = story.headline ? story.headlineSource : '';
  card.classList.remove('clip-card--caption');
  card.hidden = false;
  // The card's window is measured without the key, which the card layout hides, so a flight's
  // arrival matches the direct card exactly.
  const key = el('clip-key');
  const keyShown = !key.hidden;
  key.hidden = true;
  await fontsLaidOut();
  const top = textTop();
  key.hidden = !keyShown;
  const gap = Math.round(unit * 3.6 + tickLength());
  fitCard(card, H - safeBottom - top - gap - Math.round(H * 0.22));
  const header = H - safeBottom - card.offsetHeight;
  return { top, bottom: header - gap, header };
}

/**
 * The camera of a slot's card, under the time-lapse window's map padding: the cell at the
 * card zoom, its centre placed at the centre of the card's map window by offsetting the
 * camera rather than repadding (the padding never changes during a flight).
 */
function arrivalCamera(timelapse: Window, card: Window, cell: { lon: number; lat: number }): ClipCamera {
  const zoom = signalZoom();
  const dy = (card.top + card.bottom) / 2 - (timelapse.top + timelapse.bottom) / 2;
  return { center: [cell.lon, latOf(mercY(cell.lat) - dy / (TILE * 2 ** zoom))], zoom };
}

/** The card drawn directly (a cut, no flight): the map padded to the card's window. */
async function renderSignal(id: string) {
  const [heat, broadcast] = await Promise.all([loadHeat(), loadBroadcast()]);
  const slot = filledSlot(broadcast, id);
  const { cell } = slot;

  root.classList.add('clip--card', 'clip--signal');
  setTime(broadcast.generatedAt);
  // Lay the text out before the map so the cell can be centred in the window left between
  // the wordmark's band and the card's band.
  const w = await layoutCard(slot);
  setEdges(w);

  const { map, setCells } = await createClipMap(el('clip-map'), paddingOf(w), { center: [cell.lon, cell.lat], zoom: signalZoom() });
  const [, outline] = await Promise.all([loadDetail(map), cellOutline(cell.id).catch(() => null)]);
  setCallout(map, { outline, tag: cellTag(cell, heat) });
  setCells(heat.cells, heatMax(heat));
  await idle(map);
  markReady();
}

/** `from=t:<frame stamp>` (a time-lapse frame's camera) or `from=s:<slot id>` (a slot's card camera). */
function parseFrom(from: string): { kind: 't'; stamp: string } | { kind: 's'; id: string } {
  const t = /^t:(\d{8}T\d{6}Z)$/.exec(from);
  if (t) return { kind: 't', stamp: t[1] };
  const s = /^s:([a-z]+)$/.exec(from);
  if (s && (SLOT_IDS as readonly string[]).includes(s[1])) return { kind: 's', id: s[1] };
  throw new Error(`bad from ${from}`);
}

/**
 * A flight into a slot's card, `fly` stills long. Step 0 (drawn on load) is the time-lapse
 * layout at the `from` camera with the slot label as a caption; window.__clipStep(i) moves
 * the camera to step i of a flyTo-style path; step `fly` is the card's camera, where the
 * layout switches in one step to the card with the cell's callout.
 */
async function renderFlight(id: string, fromParam: string, flyParam: string) {
  const fly = Number(flyParam);
  if (!Number.isInteger(fly) || fly < 1 || fly > 60) throw new Error(`bad fly ${flyParam}`);
  const from = parseFrom(fromParam);
  const [heat, broadcast, frames] = await Promise.all([loadHeat(), loadBroadcast(), from.kind === 't' ? loadHistoryIndex() : Promise.resolve([])]);
  const slot = filledSlot(broadcast, id);
  const maxN = heatMax(heat);

  // The flight keeps the clock and totals of where it starts: the time-lapse frame's, or the
  // live snapshot's after a card. The heat is always the live snapshot's.
  let at = broadcast.generatedAt;
  let totals: Totals = heat.totals;
  if (from.kind === 't') ({ at, totals } = await frameInfo(from.stamp, heat, frames, false));
  setTime(at);
  setCounts(totals);
  showKey(true);
  await fontsLaidOut();
  const timelapse = timelapseWindow();

  // The previous card's camera (a chained flight starts where it arrived), then this card.
  let startView: ClipCamera | undefined;
  if (from.kind === 't') {
    startView = timelapseView(at, timelapse);
  } else {
    const previous = filledSlot(broadcast, from.id);
    startView = arrivalCamera(timelapse, await layoutCard(previous), previous.cell);
  }
  const card = await layoutCard(slot);
  const arrival = arrivalCamera(timelapse, card, slot.cell);
  const outline = await cellOutline(slot.cell.id).catch(() => null);
  const callout = { outline, tag: cellTag(slot.cell, heat) };

  // The caption: the card's slot header alone, where the card will put it; in portrait it is
  // kept clear of the totals on the window's lower rule.
  const cardEl = el('clip-card');
  const flightLayout = () => {
    root.classList.remove('clip--card', 'clip--signal');
    setTime(at);
    setCounts(totals);
    showKey(true);
    setEdges(timelapse);
    cardEl.classList.add('clip-card--caption');
    const counts = el('clip-counts').getBoundingClientRect();
    const floor = portrait && counts.height ? counts.top : timelapse.bottom;
    const header = el('clip-slot').offsetHeight;
    cardEl.style.setProperty('--caption-top', `${Math.min(card.header, Math.round(floor - unit * 2.4 - header))}px`);
  };
  const cardLayout = () => {
    root.classList.add('clip--card', 'clip--signal');
    setTime(broadcast.generatedAt);
    setCounts(null);
    showKey(false);
    setEdges(card);
    cardEl.classList.remove('clip-card--caption');
  };
  flightLayout();

  const { map, setCells } = await createClipMap(el('clip-map'), paddingOf(timelapse), startView, { wrap: portrait });
  setCells(heat.cells, maxN);

  // The path runs between the cameras the map actually holds (after its world constraint).
  const start: ClipCamera = { center: map.getCenter().toArray() as [number, number], zoom: map.getZoom() };
  map.jumpTo(arrival);
  const end: ClipCamera = { center: map.getCenter().toArray() as [number, number], zoom: map.getZoom() };
  map.jumpTo(startView ?? { center: [10, 20], zoom: -2 });
  // Never zoom out past the time-lapse's own view of the world.
  const height = timelapse.bottom - timelapse.top;
  const minZoom = portrait ? fillHeightZoom(height) : fitWorldZoom(W, height);
  const path = flightPath(start, end, fly, { width: W, height: H, minZoom, wrap: portrait });

  // The finer outlines load once the camera is past zoom 3 (as on the live site) or on the card.
  let detail: Promise<void> | null = null;
  const ensureDetail = () => (detail ??= loadDetail(map));
  if (from.kind === 's') await ensureDetail();

  const settle = async () => {
    await document.fonts.ready;
    const done = idle(map);
    map.triggerRepaint();
    let timer = 0;
    await Promise.race([done, new Promise<never>((_, reject) => (timer = window.setTimeout(() => reject(new Error('step timeout')), 20_000)))]).finally(() => window.clearTimeout(timer));
  };

  (window as unknown as { __clipStep: (i: number) => Promise<boolean> }).__clipStep = async (i: number) => {
    if (!Number.isInteger(i) || i < 1 || i > fly) throw new Error(`step ${i} outside 1..${fly}`);
    const arrived = i === fly;
    // The last step is the exact card camera a later flight's `from=s:` reproduces.
    map.jumpTo(arrived ? arrival : path[i]);
    if (arrived) cardLayout();
    else flightLayout();
    setCallout(map, arrived ? callout : null);
    if (arrived || map.getZoom() >= 3) await ensureDetail();
    await settle();
    return true;
  };

  await idle(map);
  await document.fonts.ready;
  markReady();
}

async function renderEnd() {
  const heat = await loadHeat();
  root.classList.add('clip--card', 'clip--end');
  setTime(heat.generatedAt);
  setCounts(heat.totals);
  el('clip-end-text').prepend(el('clip-counts'));
  el('clip-end').hidden = false;
  // No map: the lockup takes the centre of the dotted ground.
  await document.fonts.ready;
  fitWidth(el('clip-cta'));
  // Flex centring can land the lockup on a half pixel, which blurs its pixel rows; the block
  // centres its content, so padding it by twice the remainder moves the lockup down by it.
  const lockupTop = el('clip-lockup').getBoundingClientRect().top;
  const nudge = Math.ceil(lockupTop) - lockupTop;
  if (nudge > 0.001) document.querySelector<HTMLElement>('.clip-lockup-block')!.style.paddingTop = `${2 * nudge}px`;
  markReady();
}

function render(): Promise<void> {
  const signal = params.get('signal');
  if (signal !== null) {
    const from = params.get('from');
    const fly = params.get('fly');
    return from !== null && fly !== null ? renderFlight(signal, from, fly) : renderSignal(signal);
  }
  if (params.get('end') === '1') return renderEnd();
  return renderFrame();
}

// A renderer waits for data-ready; on failure it also gets data-error so it never hangs.
const TIMEOUT_MS = 20_000;
const timeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS));
Promise.race([render(), timeout]).catch((e: unknown) => markReady(e instanceof Error ? e.message : 'failed'));
