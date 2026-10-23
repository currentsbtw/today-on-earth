// clip.html: the daily clip's frames, drawn at a fixed size for a headless renderer. No header,
// panel or controls. The renderer drives the timeline mode; the other modes are single stills
// kept for debugging. Every mode reports readiness the same way (body[data-ready="1"], plus
// data-error="<reason>" on failure).
//   ?timeline=1&fps=30&hook=2&fly=1.5&lapse=7&card=5&end=3&slots=3   the whole clip as one
//                    timeline (values are the defaults; fps an integer 1..60, seconds 0..30,
//                    slots an integer 0..6, a flight at most 60 frames, else data-error). One
//                    map for the whole clip; window.__clipPlan() returns the plan
//                    { fps, frames, date, lapse: { from, to, snapshots }, poster, hourMarks,
//                    segments: [{ kind, slot?, start, frames }] } (web/src/timeline.ts), and
//                    window.__clipStep(i) draws frame i, resolving true once the map is idle
//                    and the fonts are ready (rejecting on failure or after 20 s). Each step
//                    sets the whole state of its frame, so a retry redraws the same frame.
//                    Frame 0 is drawn at ready. The segments, in order:
//                      hook      the camera on the first chosen slot's cell at the card zoom
//                                with its callout, the wordmark and date, and one caption: the
//                                live article count "in 24 hours" over the reading key;
//                      pullback  a flyTo-style flight from there to the time-lapse camera at
//                                the first snapshot's time, the caption still up, the dots
//                                running back from the live snapshot to the first (its last
//                                frame is the first time-lapse frame's camera and dots);
//                      lapse     the day's snapshots on a virtual clock running linearly from
//                                the first to the last; each cell's n and the totals
//                                interpolate between the two snapshots around it, and portrait
//                                frames centre local noon at that time. The article total
//                                stands at display size under the clock (the foot keeps the
//                                other three totals) and a square on the top rule walks from
//                                the first tick (the first snapshot) to the last (the live
//                                one). The time-lapse window is measured with that total on,
//                                and the hook, pull-back and flights use the same window;
//                      flight    per chosen slot (the first `slots` filled slots in file
//                                order): a flight from the previous camera captioned
//                                "N/M · <plain slot label> → <place>" (N the card's place
//                                among the chosen slots, M their count),
//                      card      then the slot's card held: the header "N/M · <plain slot
//                                label>", the place's short name, the ledger row of the
//                                story's counts, the outlet's headline and its credit;
//                      end       the end card.
//   ?t=<stamp>       the heat of one replay frame, a wordmark, the frame's date and time, a
//                    fixed line saying what a dot and its size mean, and its counts. Landscape
//                    frames fit the whole world. Portrait frames fill the map window's height
//                    with the world (about 60% of its width in view) and centre the longitude
//                    of local noon at the frame's time, so the camera turns once westward over
//                    the day;
//   ?signal=<slot>   one broadcast slot: the map at the slot's cell with the live heat, the
//                    cell's outline, reticle and name tag, and the card as in the timeline,
//                    its header counted "1/1". With `from=<ref>&fly=<F>` the page is a flight
//                    to that card instead: it opens on step 0 (the time-lapse layout at the
//                    `from` camera, captioned "1/1 · <plain slot label> → <place>") and
//                    window.__clipStep(i) moves it to step i of F; step F is the card;
//   ?end=1           the logo lockup, the site address and the live snapshot's totals.
// Nothing animates inside a frame: the renderer captures stills, and the camera, the dots and
// the clock move only between them. The look (Datamatics Field) lives in clip.css: black text
// bands with the dot grid above and below a tick-edged map window.
import './clip.css';
import type { FilterSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { loadBroadcast, PLAIN_LABELS, sentenceFacts, SLOT_IDS, type Broadcast, type SignalFact, type Slot, type SlotStory } from './broadcast';
import { loadFrame, loadHeat, loadHistoryIndex, siteUrl, type FrameRow, type Heat, type HistoryFrame, type Totals } from './data';
import { flightPath, wrapLon } from './flight';
import { count, shortName, stampOf, utcTime } from './format';
import { createClipMap, EMPTY, FILL_LAT, fillHeightZoom, fitWorldZoom, latOf, mercY, TILE, type ClipCamera, type MapCell } from './map';
import { bracket, buildPlan, framesFor, interpolateCells, interpolateTotals, lapseTime, pullbackFraction, readTimelineParams, segmentAt, type ClipPlan } from './timeline';

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
/** The reserved bands' window, where every page starts (and the end card's dot grid lines up). */
const bandWindow: Window = { top: topBand, bottom: H - bottomBand };
setEdges(bandWindow);
/** The tick length clip.css resolves for --tick. */
const tickLength = () => el('clip-edge-top').offsetHeight;
/** Map padding that centres the camera in a window spanning the full width. */
const paddingOf = (w: Window) => ({ top: w.top, bottom: H - w.bottom, left: 0, right: 0 });

const dateFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const el = (id: string) => document.getElementById(id)!;
/** The tick length (clip.css's --tick, max(5px, 1.1u)) on whole pixels: the progress marker's side. */
const tickPx = Math.round(Math.max(5, unit * 1.1));
root.style.setProperty('--tick-px', `${tickPx}px`);

/** The clip map, with the callout tag's type scaled with the frame (2.04u: 22 px at 1080 wide). */
const clipMap = (padding: ReturnType<typeof paddingOf>, view?: ClipCamera, wrap = false) =>
  createClipMap(el('clip-map'), padding, view, { wrap, tagSize: Math.round(unit * 2.04 * 100) / 100 });

let marked = false;
/** Put the pixel mark on whole device pixels (a fractional offset blurs its pixel rows). */
function snapMark() {
  const mark = el('clip-mark');
  const wordmark = mark.parentElement!;
  wordmark.style.left = '';
  wordmark.style.top = '';
  const r = mark.getBoundingClientRect();
  if (!r.width) return;
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

/** "WED 21 OCT 2026  19:30 UTC" (uppercased by CSS); `clock` false leaves the date alone. */
function setTime(at: string, clock = true) {
  const date = dateFormat.format(new Date(at)).replace(/,/g, '');
  const parts: HTMLElement[] = [Object.assign(document.createElement('span'), { textContent: date })];
  if (clock) parts.push(Object.assign(document.createElement('b'), { textContent: utcTime(at) }));
  el('clip-time').replaceChildren(...parts);
}

/** One figure in the totals' register: the number over its label. */
function countItem(n: number, one: string, many: string) {
  const item = Object.assign(document.createElement('div'), { className: 'clip-count' });
  item.append(Object.assign(document.createElement('b'), { textContent: count(n) }), Object.assign(document.createElement('span'), { textContent: n === 1 ? one : many }));
  return item;
}

/**
 * Totals along the foot: number over label; null clears them. The end card names the fourth
 * one as the map's places column does, OUTLET COUNTRIES. `articles` false leaves the article
 * total out (the timeline's time-lapse shows it under the clock instead).
 */
function setCounts(totals: Totals | null, outletCountries = false, articles = true) {
  const items: [n: number, one: string, many: string][] = totals
    ? [
        ...(articles ? [[totals.articles, 'article', 'articles'] as [number, string, string]] : []),
        [totals.cells, 'place', 'places'],
        [totals.outlets, 'outlet', 'outlets'],
        [totals.countries, outletCountries ? 'outlet country' : 'country', outletCountries ? 'outlet countries' : 'countries'],
      ]
    : [];
  const counts = el('clip-counts');
  counts.style.setProperty('--cols', String(Math.max(1, items.length)));
  counts.replaceChildren(...items.map(([n, one, many]) => countItem(n, one, many)));
}

/** The article total at display size under the clock (the timeline's time-lapse only); null hides it. */
function setTotal(articles: number | null) {
  el('clip-total').hidden = articles === null;
  if (articles === null) return;
  el('clip-total-n').textContent = count(articles);
  el('clip-total-label').textContent = articles === 1 ? 'article' : 'articles';
}

/**
 * The progress marker on the top rule (the timeline's time-lapse only): `fraction` of the day
 * elapsed, 0 on the first tick and 1 on the last, the square centred there on a whole pixel;
 * null hides it.
 */
function setProgress(fraction: number | null) {
  const marker = el('clip-progress');
  marker.hidden = fraction === null;
  if (fraction === null) return;
  const edge = el('clip-edge-top');
  const ticks = edge.querySelector('.clip-ticks')!.children;
  const first = ticks[0].getBoundingClientRect().left;
  const last = ticks[ticks.length - 1].getBoundingClientRect().left;
  const centre = first + 0.5 + Math.min(1, Math.max(0, fraction)) * (last - first);
  marker.style.left = `${Math.round(centre - tickPx / 2 - edge.getBoundingClientRect().left)}px`;
}

/** The reading key under the date ("One dot per place…"): time-lapse layouts only. */
const showKey = (on: boolean) => void (el('clip-key').hidden = !on);

/**
 * Shrink a one-line element's type (its --fit) until it fits its parent's width. When the
 * parent lays its children out in a row (the landscape end card's "Today's broadcast at" line
 * beside the address), the siblings and the gaps take their share of that width first.
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

/** Wait for a stepped frame to be drawn: fonts ready and the map idle, failing after 20 s. */
async function settle(map: MapLibreMap) {
  await document.fonts.ready;
  const done = idle(map);
  map.triggerRepaint();
  let timer = 0;
  await Promise.race([done, new Promise<never>((_, reject) => (timer = window.setTimeout(() => reject(new Error('step timeout')), 20_000)))]).finally(() => window.clearTimeout(timer));
}

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

/** The lowest zoom a flight may take: the time-lapse's own view of the world. */
function flightFloor(timelapse: Window) {
  const height = timelapse.bottom - timelapse.top;
  return portrait ? fillHeightZoom(height) : fitWorldZoom(W, height);
}

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

/** A replay frame's rows as map cells, named from the live snapshot where it knows the place. */
const rowCells = (rows: FrameRow[], names: Map<string, string>): MapCell[] => rows.map(([id, lat, lon, n]) => ({ id, lat, lon, n, name: names.get(id) ?? '' }));

async function renderFrame() {
  const [heat, frames] = await Promise.all([loadHeat(), loadHistoryIndex().catch(() => [])]);
  let at = heat.generatedAt;
  let totals: Totals = heat.totals;
  let rows: FrameRow[] | null = null;

  const t = params.get('t');
  if (t) ({ at, totals, rows } = await frameInfo(t, heat, frames, true));

  const maxN = heatMax(heat);
  const cells: MapCell[] = rows ? rowCells(rows, new Map(heat.cells.map((c) => [c.id, c.name]))) : heat.cells;

  setTime(at);
  setCounts(totals);
  showKey(true);
  await fontsLaidOut();
  const w = timelapseWindow();
  setEdges(w);

  const { map, setCells } = await clipMap(paddingOf(w), timelapseView(at, w), portrait);
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

type Callout = { id: string; outline: GeoJSON.Feature | null; tag: GeoJSON.Feature };

/** A slot's callout: its cell's id, its hexagon (when it can be drawn) and its tag. */
const slotCallout = async (slot: FilledSlot, heat: Heat): Promise<Callout> => ({ id: slot.cell.id, outline: await cellOutline(slot.cell.id).catch(() => null), tag: cellTag(slot.cell, heat) });

/** The heat layers that name a place; the callout's tag replaces its own label there. */
const HEAT_LABELS = ['cell-label-top', 'cell-label'];
/** Each clip map's own filters on those layers, read before the callout first changes them. */
const labelFilters = new WeakMap<MapLibreMap, Map<string, FilterSpecification | undefined>>();

/**
 * Light the cell's hexagon and its tag, or clear both (null). While the tag is on, the cell's
 * own heat label is filtered out, so the place is named once.
 */
function setCallout(map: MapLibreMap, callout: Callout | null) {
  map.getSource<GeoJSONSource>('selected')?.setData(callout?.outline ?? EMPTY);
  map.getSource<GeoJSONSource>('selected-tag')?.setData(callout?.tag ?? EMPTY);
  let base = labelFilters.get(map);
  if (!base) {
    base = new Map(HEAT_LABELS.map((id) => [id, (map.getFilter(id) ?? undefined) as FilterSpecification | undefined]));
    labelFilters.set(map, base);
  }
  for (const [id, filter] of base) {
    if (!map.getLayer(id)) continue;
    const others: FilterSpecification | null = callout ? ['!=', ['get', 'id'], callout.id] : null;
    const next = others && filter ? (['all', filter, others] as FilterSpecification) : (others ?? filter ?? null);
    map.setFilter(id, next);
  }
}

/** Shrink the card's type until it fits `maxHeight`; a headline still too long is clamped by CSS. */
function fitCard(card: HTMLElement, maxHeight: number) {
  for (let step = 0; step <= 8; step++) {
    card.style.setProperty('--fit', String(1 - step * 0.05));
    if (card.offsetHeight <= maxHeight) return;
  }
}

type FilledSlot = Slot & Required<Pick<Slot, 'cell' | 'story'>>;

/** A filled slot from the broadcast, or an error naming why it cannot be drawn. */
function filledSlot(broadcast: Broadcast, id: string): FilledSlot {
  if (!(SLOT_IDS as readonly string[]).includes(id)) throw new Error(`unknown slot ${id}`);
  const slot = broadcast.slots.find((s) => s.id === id);
  if (!slot) throw new Error(`slot ${id} missing`);
  if (!slot.available || !slot.cell || !slot.story) throw new Error(`slot ${id} unavailable`);
  return slot as FilledSlot;
}

/** The card's window (from under the top text to above the card), its header's top and its type scale. */
interface CardWindow extends Window {
  header: number;
  fit: string;
}

/** A card's place in the run: the n-th (1-based) of the chosen slots' count. */
interface RunPlace {
  n: number;
  of: number;
}

/** The single card of the ?signal= stills. */
const ONLY: RunPlace = { n: 1, of: 1 };

/** Each ledger fact: the story's count and its label. */
const LEDGER: Record<SignalFact, [value: (story: SlotStory) => number, one: string, many: string]> = {
  articles: [(s) => s.n, 'article', 'articles'],
  outlets: [(s) => s.o, 'outlet', 'outlets'],
  languages: [(s) => s.l, 'language', 'languages'],
  heardIn: [(s) => s.i, 'other country', 'other countries'],
};

/**
 * Put one slot's texts in the card at type scale `fit`: the header "N/M · plain label", the
 * place's short name, the ledger row (the counts the site's sentence states for the slot), the
 * headline and the outlet. A `caption` (a flight's) adds " → place" to the header.
 */
function fillCard(slot: FilledSlot, run: RunPlace, fit?: string, caption = false) {
  const { story, cell } = slot;
  const place = shortName(cell.name) || cell.name;
  el('clip-slot').textContent = `${run.n}/${run.of} · ${PLAIN_LABELS[slot.id]}${caption ? ` → ${place}` : ''}`;
  el('clip-place').textContent = place;
  el('clip-ledger').replaceChildren(
    ...sentenceFacts(slot.id).map((fact) => {
      const [value, one, many] = LEDGER[fact];
      return countItem(value(story), one, many);
    }),
  );
  const headline = el('clip-headline');
  el('clip-quote').hidden = !story.headline;
  headline.textContent = story.headline;
  headline.removeAttribute('lang');
  if (story.headlineLang) headline.lang = story.headlineLang;
  el('clip-outlet').textContent = story.headline ? story.headlineSource : '';
  if (fit !== undefined) el('clip-card').style.setProperty('--fit', fit);
}

/**
 * Fill the card with one slot and lay it out: the map window it leaves (from under the top
 * text to above the card, at least 22% of the frame), where its slot header sits and the type
 * scale it fitted.
 */
async function layoutCard(slot: FilledSlot, run: RunPlace): Promise<CardWindow> {
  const card = el('clip-card');
  fillCard(slot, run);
  card.classList.remove('clip-card--caption');
  card.hidden = false;
  // The card's window is measured without the key and the article total, which the card
  // layout hides, so a flight's arrival matches the direct card exactly.
  const key = el('clip-key');
  const total = el('clip-total');
  const shown = [!key.hidden, !total.hidden];
  key.hidden = true;
  total.hidden = true;
  await fontsLaidOut();
  const top = textTop();
  key.hidden = !shown[0];
  total.hidden = !shown[1];
  const gap = Math.round(unit * 3.6 + tickLength());
  fitCard(card, H - safeBottom - top - gap - Math.round(H * 0.22));
  const header = H - safeBottom - card.offsetHeight;
  return { top, bottom: header - gap, header, fit: card.style.getPropertyValue('--fit') };
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

// The layouts. Each sets everything its frame shows, starting from baseLayout(), so the
// timeline can draw any frame regardless of the one before it.

/** Undo what any layout changed: classes, hidden blocks, the map's visibility, the totals' place. */
function baseLayout() {
  root.classList.remove('clip--card', 'clip--signal', 'clip--end');
  el('clip-map').style.visibility = '';
  setTotal(null);
  setProgress(null);
  el('clip-hook').hidden = true;
  el('clip-end').hidden = true;
  const card = el('clip-card');
  card.hidden = true;
  card.classList.remove('clip-card--caption');
  const counts = el('clip-counts');
  if (counts.parentElement !== root) root.insertBefore(counts, card);
}

/**
 * The time-lapse layout: date and clock, reading key, totals, the time-lapse window. With
 * `progress` (the timeline's time-lapse frames: the share of the day elapsed) the article total
 * stands under the clock, the foot keeps the other three, and the marker walks the top rule.
 */
function lapseLayout(at: string, totals: Totals, timelapse: Window, progress: number | null = null) {
  baseLayout();
  const lapse = progress !== null;
  setTime(at);
  setTotal(lapse ? totals.articles : null);
  setCounts(totals, false, !lapse);
  showKey(true);
  setEdges(timelapse);
  setProgress(progress);
}

/**
 * A flight's layout: the time-lapse layout plus one caption, the card's slot header followed
 * by " → place", where the card will put its header; in portrait it is kept clear of the
 * totals on the window's lower rule.
 */
function flightLayout(slot: FilledSlot, run: RunPlace, at: string, totals: Totals, timelapse: Window, card: CardWindow) {
  lapseLayout(at, totals, timelapse);
  const cardEl = el('clip-card');
  fillCard(slot, run, card.fit, true);
  cardEl.classList.add('clip-card--caption');
  cardEl.hidden = false;
  const counts = el('clip-counts').getBoundingClientRect();
  const floor = portrait && counts.height ? counts.top : timelapse.bottom;
  const header = el('clip-slot').offsetHeight;
  cardEl.style.setProperty('--caption-top', `${Math.min(card.header, Math.round(floor - unit * 2.4 - header))}px`);
}

/** A slot's card: date and clock, no key or totals, the window ending above the card. */
function cardLayout(slot: FilledSlot, run: RunPlace, at: string, card: CardWindow) {
  baseLayout();
  root.classList.add('clip--card', 'clip--signal');
  setTime(at);
  setCounts(null);
  showKey(false);
  setEdges(card);
  fillCard(slot, run, card.fit);
  el('clip-card').hidden = false;
}

/** The hook: the date without the clock, no key or totals, and the caption block. */
function hookLayout(at: string, articles: number, timelapse: Window) {
  baseLayout();
  setTime(at, false);
  setCounts(null);
  showKey(false);
  setEdges(timelapse);
  el('clip-hook-lead').replaceChildren(Object.assign(document.createElement('span'), { textContent: `${count(articles)} articles in 24 hours.` }));
  el('clip-hook').hidden = false;
}

/** The end card: no map; the lockup, the address and the live totals. */
async function endLayout(heat: Heat) {
  baseLayout();
  root.classList.add('clip--card', 'clip--end');
  el('clip-map').style.visibility = 'hidden';
  setEdges(bandWindow);
  setTime(heat.generatedAt);
  setCounts(heat.totals, true);
  showKey(false);
  el('clip-end-text').prepend(el('clip-counts'));
  el('clip-end').hidden = false;
  // The lockup takes the centre of the dotted ground.
  await document.fonts.ready;
  fitWidth(el('clip-cta'));
  // Flex centring can land the lockup on a half pixel, which blurs its pixel rows; the block
  // centres its content, so padding it by twice the remainder moves the lockup down by it.
  const block = document.querySelector<HTMLElement>('.clip-lockup-block')!;
  block.style.paddingTop = '';
  const lockupTop = el('clip-lockup').getBoundingClientRect().top;
  const nudge = Math.ceil(lockupTop) - lockupTop;
  if (nudge > 0.001) block.style.paddingTop = `${2 * nudge}px`;
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
  const w = await layoutCard(slot, ONLY);
  cardLayout(slot, ONLY, broadcast.generatedAt, w);

  const { map, setCells } = await clipMap(paddingOf(w), { center: [cell.lon, cell.lat], zoom: signalZoom() });
  const [, callout] = await Promise.all([loadDetail(map), slotCallout(slot, heat)]);
  setCallout(map, callout);
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

/** The camera the map actually holds for `view` (after its world constraint); undefined fits the world. */
function held(map: MapLibreMap, view: ClipCamera | undefined): ClipCamera {
  map.jumpTo(view ?? { center: [10, 20], zoom: -2 });
  return { center: map.getCenter().toArray() as [number, number], zoom: map.getZoom() };
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
    startView = arrivalCamera(timelapse, await layoutCard(previous, ONLY), previous.cell);
  }
  const card = await layoutCard(slot, ONLY);
  const arrival = arrivalCamera(timelapse, card, slot.cell);
  const callout = await slotCallout(slot, heat);

  flightLayout(slot, ONLY, at, totals, timelapse, card);

  const { map, setCells } = await clipMap(paddingOf(timelapse), startView, portrait);
  setCells(heat.cells, maxN);

  // The path runs between the cameras the map actually holds (after its world constraint).
  const start = held(map, startView);
  const end = held(map, arrival);
  map.jumpTo(start);
  // Never zoom out past the time-lapse's own view of the world.
  const path = flightPath(start, end, fly, { width: W, height: H, minZoom: flightFloor(timelapse), wrap: portrait });

  // The finer outlines load once the camera is past zoom 3 (as on the live site) or on the card.
  let detail: Promise<void> | null = null;
  const ensureDetail = () => (detail ??= loadDetail(map));
  if (from.kind === 's') await ensureDetail();

  (window as unknown as { __clipStep: (i: number) => Promise<boolean> }).__clipStep = async (i: number) => {
    if (!Number.isInteger(i) || i < 1 || i > fly) throw new Error(`step ${i} outside 1..${fly}`);
    const arrived = i === fly;
    // The last step is the exact card camera a later flight's `from=s:` reproduces.
    map.jumpTo(arrived ? arrival : path[i]);
    if (arrived) cardLayout(slot, ONLY, broadcast.generatedAt, card);
    else flightLayout(slot, ONLY, at, totals, timelapse, card);
    setCallout(map, arrived ? callout : null);
    if (arrived || map.getZoom() >= 3) await ensureDetail();
    await settle(map);
    return true;
  };

  await idle(map);
  await document.fonts.ready;
  markReady();
}

async function renderEnd() {
  const heat = await loadHeat();
  await endLayout(heat);
  markReady();
}

/** Run `fn` over `items` with at most `limit` calls in flight; results keep the items' order. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** One snapshot of the time-lapse: its time (ms), totals and cells. */
interface Snapshot {
  at: number;
  totals: Totals;
  cells: MapCell[];
}

/**
 * The whole clip as one timeline (see the top of this file and web/src/timeline.ts). One map,
 * padded to the time-lapse window throughout: cards and the hook place their cell by
 * offsetting the camera, never by repadding.
 */
async function renderTimeline() {
  const options = readTimelineParams((name) => params.get(name));
  const [heat, index, broadcast] = await Promise.all([
    loadHeat(),
    loadHistoryIndex().catch(() => [] as HistoryFrame[]),
    // Without a broadcast the clip still runs, as with no filled slot.
    options.slots > 0 ? loadBroadcast().catch(() => null) : Promise.resolve(null),
  ]);
  const liveAt = heat.generatedAt;
  const liveMs = Date.parse(liveAt);
  const maxN = heatMax(heat);
  const names = new Map(heat.cells.map((c) => [c.id, c.name]));

  // Every index entry older than the live snapshot (the index's last entry is the live
  // snapshot itself, with no separate file), then the live heat. A frame that fails to load is
  // left out; the interpolation spans the gap.
  const past = index.filter((f) => f.file && Date.parse(f.at) < liveMs);
  const loaded = await mapLimit(past, 6, async (f): Promise<Snapshot | null> => {
    try {
      return { at: Date.parse(f.at), totals: f.totals, cells: rowCells(await loadFrame(f.file), names) };
    } catch (e) {
      console.warn(`frame ${f.file} left out`, e);
      return null;
    }
  });
  const snapshots: Snapshot[] = [...loaded.filter((s): s is Snapshot => s !== null), { at: liveMs, totals: heat.totals, cells: heat.cells }];
  const times = snapshots.map((s) => s.at);
  const live = snapshots.length - 1;

  const chosen = (broadcast?.slots ?? []).filter((s): s is FilledSlot => s.available && !!s.cell && !!s.story).slice(0, options.slots);
  const cardAt = broadcast?.generatedAt ?? liveAt;
  const plan: ClipPlan = buildPlan(options, chosen.map((s) => s.id), times);

  // Measure every layout once, with the fonts laid out: the time-lapse window (top text with
  // the clock, the article total and the key, so the hook, pull-back, time-lapse and flights
  // share one window and no camera path moves between them), each card's window, and the hook
  // caption's top.
  setTime(liveAt);
  setTotal(heat.totals.articles);
  setCounts(heat.totals, false, false);
  showKey(true);
  await fontsLaidOut();
  const timelapse = timelapseWindow();
  setTotal(null);
  setTime(cardAt);
  const runs: RunPlace[] = chosen.map((_, n) => ({ n: n + 1, of: chosen.length }));
  const cards: CardWindow[] = [];
  for (const [n, slot] of chosen.entries()) cards.push(await layoutCard(slot, runs[n]));
  hookLayout(liveAt, heat.totals.articles, timelapse);
  await fontsLaidOut();
  // The hook's cell is centred in the window above its caption.
  const hookWindow: Window = { top: timelapse.top, bottom: Math.round(el('clip-hook').getBoundingClientRect().top - unit * 2.4) };

  const { map, setCells } = await clipMap(paddingOf(timelapse), undefined, portrait);

  // Every camera as the map holds it, so the flights join them exactly.
  const fitted = held(map, undefined);
  const lapseView = (ms: number) => timelapseView(new Date(ms).toISOString(), timelapse) ?? fitted;
  const firstView = held(map, lapseView(times[0]));
  const lastView = held(map, lapseView(times[live]));
  const arrivals = chosen.map((slot, n) => held(map, arrivalCamera(timelapse, cards[n], slot.cell)));
  const hookView = chosen.length ? held(map, arrivalCamera(timelapse, hookWindow, chosen[0].cell)) : lastView;
  // A flight of F frames shows the inner cameras 1..F of an F+1 step path: the segment before
  // it holds the start, the card after it the end, so every frame of the move is new. The
  // pull-back instead ends on the time-lapse's first camera (cameras 1..F of an F step path), so
  // its last frame and the first time-lapse frame differ only by the layout.
  const flyFrames = framesFor(options.fly, options.fps);
  const minZoom = flightFloor(timelapse);
  const path = (a: ClipCamera, b: ClipCamera, steps = flyFrames + 1) => flightPath(a, b, steps, { width: W, height: H, minZoom, wrap: portrait });
  const pullback = path(hookView, firstView, flyFrames);
  const flights = chosen.map((_, n) => path(n ? arrivals[n - 1] : lastView, arrivals[n]));
  const callouts = await Promise.all(chosen.map((slot) => slotCallout(slot, heat)));
  const lapseFrames = plan.segments.find((s) => s.kind === 'lapse')?.frames ?? 0;

  // What the map holds now, so a step sends data only when its frame changes it.
  let shownCells: string | null = null;
  let shownCallout: number | null | undefined;
  const showCells = (key: string, cells: () => MapCell[]) => {
    if (shownCells === key) return;
    setCells(cells(), maxN);
    shownCells = key;
  };
  const showLive = () => showCells(`snap:${live}`, () => heat.cells);
  const showCallout = (n: number | null) => {
    if (shownCallout === n) return;
    setCallout(map, n === null ? null : callouts[n]);
    shownCallout = n;
  };

  let detail: Promise<void> | null = null;
  const ensureDetail = () => (detail ??= loadDetail(map));
  let lastStep = -1;

  const step = async (i: number): Promise<boolean> => {
    const at = Number.isInteger(i) ? segmentAt(plan, i) : null;
    if (!at) throw new Error(`step ${i} outside 0..${plan.frames - 1}`);
    // A retry redraws the frame from scratch.
    if (i === lastStep) {
      shownCells = null;
      shownCallout = undefined;
    }
    lastStep = i;
    const { segment, offset } = at;
    const n = segment.slot === undefined ? -1 : chosen.findIndex((s) => s.id === segment.slot);
    let closeUp = false;
    switch (segment.kind) {
      case 'hook':
        map.jumpTo(hookView);
        hookLayout(liveAt, heat.totals.articles, timelapse);
        showLive();
        showCallout(chosen.length ? 0 : null);
        closeUp = chosen.length > 0;
        break;
      case 'pullback': {
        // The dots run back from the live snapshot to the first, as the time-lapse interpolates
        // them; the last pull-back frame holds exactly the first snapshot.
        const f = pullbackFraction(offset, segment.frames);
        map.jumpTo(pullback[offset + 1]);
        hookLayout(liveAt, heat.totals.articles, timelapse);
        if (f >= 1) showCells('snap:0', () => snapshots[0].cells);
        else showCells(`pull:${offset}`, () => interpolateCells(snapshots[live].cells, snapshots[0].cells, f));
        showCallout(null);
        break;
      }
      case 'lapse': {
        const t = lapseTime(times[0], times[live], lapseFrames, offset);
        const { lo, hi, f } = bracket(times, t);
        map.jumpTo(lapseView(t));
        const progress = times[live] > times[0] ? (t - times[0]) / (times[live] - times[0]) : 1;
        lapseLayout(new Date(Math.round(t)).toISOString(), interpolateTotals(snapshots[lo].totals, snapshots[hi].totals, f), timelapse, progress);
        if (f === 0 || lo === hi) showCells(`snap:${lo}`, () => snapshots[lo].cells);
        else showCells(`lapse:${offset}`, () => interpolateCells(snapshots[lo].cells, snapshots[hi].cells, f));
        showCallout(null);
        break;
      }
      case 'flight':
        map.jumpTo(flights[n][offset + 1]);
        // The first flight keeps the last time-lapse frame's clock and totals; later ones the card's.
        flightLayout(chosen[n], runs[n], n === 0 ? liveAt : cardAt, heat.totals, timelapse, cards[n]);
        showLive();
        showCallout(null);
        break;
      case 'card':
        map.jumpTo(arrivals[n]);
        cardLayout(chosen[n], runs[n], cardAt, cards[n]);
        showLive();
        showCallout(n);
        closeUp = true;
        break;
      case 'end':
        await endLayout(heat);
        break;
    }
    if (segment.kind !== 'end' && (closeUp || map.getZoom() >= 3)) await ensureDetail();
    snapMark();
    await settle(map);
    return true;
  };

  const page = window as unknown as { __clipPlan: () => ClipPlan; __clipStep: (i: number) => Promise<boolean> };
  page.__clipPlan = () => structuredClone(plan);
  page.__clipStep = step;

  await step(0);
  // The renderer's own first step(0) is not a retry: what the map holds stays valid.
  lastStep = -1;
  markReady();
}

function render(): Promise<void> {
  if (params.get('timeline') === '1') return renderTimeline();
  const signal = params.get('signal');
  if (signal !== null) {
    const from = params.get('from');
    const fly = params.get('fly');
    return from !== null && fly !== null ? renderFlight(signal, from, fly) : renderSignal(signal);
  }
  if (params.get('end') === '1') return renderEnd();
  return renderFrame();
}

// A renderer waits for data-ready; on failure it also gets data-error so it never hangs. The
// timeline loads the day's ~100 snapshots first, so it gets longer (the renderer waits 60 s).
const TIMEOUT_MS = params.get('timeline') === '1' ? 50_000 : 20_000;
const timeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS));
Promise.race([render(), timeout]).catch((e: unknown) => markReady(e instanceof Error ? e.message : 'failed'));
