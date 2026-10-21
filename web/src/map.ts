// The map: a tile-free MapLibre style with country outlines, the heat layers and the
// selected-cell outline.
import {
  LngLat,
  Map as MapLibreMap,
  setWorkerUrl,
  type ExpressionSpecification,
  type FilterSpecification,
  type GeoJSONSource,
  type LayerSpecification,
  type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre 6 loads its worker from a sibling file; point it at the copy Vite emits.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { siteUrl, type HeatCell } from './data';
import { ago, count, placeKey, safeHref, shortName } from './format';

setWorkerUrl(workerUrl);

const MAX_ZOOM = 9;
// The world box the camera is held inside. Antarctica is not drawn, so stop short of it.
const LAT_NORTH = 84;
const LAT_SOUTH = -58;
const TILE = 512;

const LABEL_FONTS = ['system-ui', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'];
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

const mercX = (lng: number) => (lng + 180) / 360;
const mercY = (lat: number) =>
  (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
const lngOf = (x: number) => x * 360 - 180;
const latOf = (y: number) => (360 / Math.PI) * Math.atan(Math.exp(Math.PI * (1 - 2 * y))) - 90;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface Padding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}
const NO_PADDING: Padding = { top: 0, bottom: 0, left: 0, right: 0 };

export type HeatMode = 'articles' | 'normal';

/** Below this baseline a place counts as quiet, so a handful of articles cannot read as a surge. */
const BASELINE_FLOOR = 3;

/** How many times its normal a place is covered: (n + 1) / (max(b, floor) + 1). */
export const relativeRatio = (n: number, b: number) => (n + 1) / (Math.max(b, BASELINE_FLOOR) + 1);

/**
 * Brightness 0..1. "articles": log of n against the live snapshot's largest n.
 * "normal": log2 of the ratio to the place's own normal over 3, so 8x normal is full
 * brightness and anything at or below normal is dark.
 */
export function heatWeight(c: Pick<MapCell, 'n' | 'b'>, maxN: number, mode: HeatMode): number {
  // Without a live baseline (a replay-only cell) there is nothing to compare against, so
  // the cell keeps its absolute weight and shows no ratio (DATA-CONTRACT "Baseline").
  if (mode === 'normal' && hasBaseline(c)) return clamp(Math.log2(relativeRatio(c.n, c.b!)) / 3, 0, 1);
  return Math.min(1, Math.log1p(c.n) / Math.log1p(Math.max(1, maxN)));
}

/** "×2.4 normal" */
export const ratioLabel = (c: Pick<MapCell, 'n' | 'b'>) =>
  hasBaseline(c) ? `×${relativeRatio(c.n, c.b!).toFixed(1)} normal` : '';

/** Live cells carry `b`; replay-only cells do not. */
function hasBaseline(c: Pick<MapCell, 'b'>): boolean {
  return typeof c.b === 'number';
}

/** Point features for the heat source, shared by the map page and the clip page. */
/** The largest places by article count are named even at world zoom. */
const TOP_LABELS = 5;

export function heatFeatures(cells: MapCell[], maxN: number, mode: HeatMode): GeoJSON.Feature<GeoJSON.Point>[] {
  const top = new Set([...cells].sort((a, b) => b.n - a.n).slice(0, TOP_LABELS).map((c) => c.id));
  return cells.map((c) => {
    const short = c.name ? shortName(c.name) : '';
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
      properties: {
        id: c.id,
        n: c.n,
        label: mode === 'normal' && short && ratioLabel(c) ? `${short}\n${ratioLabel(c)}` : short,
        w: heatWeight(c, maxN, mode),
        top: top.has(c.id) ? 1 : 0,
      },
    };
  });
}

/**
 * Keeps the whole world box visible at the lowest zoom (contain, not cover) and never lets
 * the camera pan past its edges. MapLibre's default maxBounds behaviour zooms in until the
 * bounds cover the viewport, which would crop the world on load.
 */
function worldConstrain(container: HTMLElement, padding: () => Partial<Padding>) {
  const top = mercY(LAT_NORTH);
  const bottom = mercY(LAT_SOUTH);
  return (lngLat: LngLat, zoom: number) => {
    // With map padding (the phone sheet, or a clip page's reserved bands), MapLibre's
    // center is the middle of the unpadded area, so fit the world into that area.
    const pad = padding();
    const w = container.clientWidth - (pad.left ?? 0) - (pad.right ?? 0);
    const h = container.clientHeight - (pad.top ?? 0) - (pad.bottom ?? 0);
    if (w <= 0 || h <= 0) return { center: lngLat, zoom };
    const fitZoom = Math.log2(Math.min(w, h / (bottom - top)) / TILE);
    const z = clamp(zoom, fitZoom, MAX_ZOOM);
    const size = TILE * 2 ** z;
    const axis = (v: number, lo: number, hi: number, half: number) =>
      hi - lo <= 2 * half ? (lo + hi) / 2 : clamp(v, lo + half, hi - half);
    const x = axis(mercX(lngLat.lng) * size, 0, size, w / 2) / size;
    const y = axis(mercY(lngLat.lat) * size, top * size, bottom * size, h / 2) / size;
    return { center: new LngLat(lngOf(x), latOf(y)), zoom: z };
  };
}

/** Rank filters of the city label tiers; setCells adds "not a news label" on top. */
const PLACE_TIERS: Record<string, ExpressionSpecification> = {
  'place-label-minor': ['all', ['>=', ['get', 'rank'], 5], ['<=', ['get', 'rank'], 7]],
  'place-label-mid': ['all', ['>=', ['get', 'rank'], 3], ['<=', ['get', 'rank'], 4]],
  'place-label-major': ['<=', ['get', 'rank'], 2],
};

/** Cells get a news label from this weight up (see the cell-label layer). */
const CELL_LABEL_MIN_W = 0.4;

/** One tier of city labels: muted grey, capitals a little brighter, capitals first. */
function placeLabels(id: string, minzoom: number, filter: FilterSpecification): LayerSpecification {
  return {
    id,
    type: 'symbol',
    source: 'places',
    minzoom,
    filter,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': LABEL_FONTS,
      'text-size': 10.5,
      'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
      'text-radial-offset': 0.45,
      'text-padding': 3,
      'symbol-sort-key': ['-', ['get', 'rank'], ['*', 3, ['get', 'cap']]],
    },
    paint: {
      'text-color': ['case', ['==', ['get', 'cap'], 1], '#a3abb4', '#7c858f'],
      'text-halo-color': '#050608',
      'text-halo-width': 1,
    },
  };
}

export function style(): StyleSpecification {
  return {
    version: 8,
    projection: { type: 'mercator' },
    // No `glyphs`: labels are drawn with local system fonts, so no font server is needed.
    sources: {
      countries: { type: 'geojson', data: siteUrl('geo/countries.json') },
      // Detail for closer zooms; filled in by loadDetail() the first time zoom reaches 3.
      admin1: { type: 'geojson', data: EMPTY },
      places: { type: 'geojson', data: EMPTY },
      'country-labels': { type: 'geojson', data: EMPTY },
      heat: { type: 'geojson', data: EMPTY },
      selected: { type: 'geojson', data: EMPTY },
      quakes: { type: 'geojson', data: EMPTY },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#050608' } },
      { id: 'land', type: 'fill', source: 'countries', paint: { 'fill-color': '#0f141a' } },
      {
        id: 'admin1',
        type: 'line',
        source: 'admin1',
        minzoom: 3.5,
        paint: {
          'line-color': '#5d6b7a',
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 3.5, 0, 4.5, 0.14, 8, 0.22],
          'line-width': ['interpolate', ['linear'], ['zoom'], 3.5, 0.3, 8, 0.6],
        },
      },
      {
        id: 'borders',
        type: 'line',
        source: 'countries',
        paint: {
          'line-color': '#5d6b7a',
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.22, 6, 0.4],
          'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.4, 6, 0.9],
        },
      },
      // Base labels sit beneath every heat layer and stay grey, so they never compete with
      // the amber. Symbols are placed top layer first, so news cell labels (topmost) win
      // collisions, then country names, then cities by rank.
      {
        id: 'place-dot',
        type: 'circle',
        source: 'places',
        minzoom: 4.5,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4.5, 1.2, 8, 2],
          'circle-color': ['case', ['==', ['get', 'cap'], 1], '#a3abb4', '#6f7882'],
          // Dots appear with their label tier: rank 0-2, then 3-4 from 5.5, then 5-7 from 6.5.
          'circle-opacity': ['step', ['zoom'],
            ['case', ['<=', ['get', 'rank'], 2], 0.8, 0],
            5.5, ['case', ['<=', ['get', 'rank'], 4], 0.8, 0],
            6.5, 0.8],
        },
      },
      placeLabels('place-label-minor', 6.5, PLACE_TIERS['place-label-minor']),
      placeLabels('place-label-mid', 5.5, PLACE_TIERS['place-label-mid']),
      placeLabels('place-label-major', 4.5, PLACE_TIERS['place-label-major']),
      {
        id: 'country-label',
        type: 'symbol',
        source: 'country-labels',
        minzoom: 2.5,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': LABEL_FONTS,
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.16,
          'text-size': ['interpolate', ['linear'], ['zoom'], 2.5, 8.5, 6, 11],
          'text-max-width': 7,
          'text-padding': 4,
          'symbol-sort-key': ['get', 'rank'],
        },
        paint: {
          'text-color': '#5f6873',
          'text-halo-color': '#050608',
          'text-halo-width': 1,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 2.5, 0, 3, 1],
        },
      },
      {
        id: 'heat',
        type: 'heatmap',
        source: 'heat',
        maxzoom: 6,
        paint: {
          // Squaring the log weight keeps the mid-pack dim so only real peaks reach white.
          'heatmap-weight': ['^', ['get', 'w'], 2],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.9, 3, 1.4, 5, 2.2],
          'heatmap-radius': ['interpolate', ['exponential', 1.5], ['zoom'], 0, 8, 2, 15, 4, 30, 6, 56],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 3.5, 0.95, 5.5, 0],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0,0,0,0)',
            0.08, 'rgba(90,32,0,0.25)',
            0.25, 'rgba(150,62,4,0.6)',
            0.45, 'rgba(206,110,18,0.85)',
            0.7, 'rgba(246,170,64,0.95)',
            0.88, 'rgba(255,224,170,1)',
            1, 'rgba(255,250,240,1)',
          ],
        },
      },
      {
        id: 'cell-glow',
        type: 'circle',
        source: 'heat',
        minzoom: 3.5,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'],
            4, ['+', 5, ['*', ['get', 'w'], 16]],
            9, ['+', 10, ['*', ['get', 'w'], 48]]],
          'circle-color': '#e08a2a',
          'circle-blur': 1,
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 3.5, 0, 4.5, 0.32],
        },
      },
      {
        id: 'cell-dot',
        type: 'circle',
        source: 'heat',
        minzoom: 3.5,
        layout: { 'circle-sort-key': ['get', 'n'] },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'],
            4, ['+', 1.5, ['*', ['get', 'w'], 6]],
            9, ['+', 3, ['*', ['get', 'w'], 20]]],
          'circle-color': ['interpolate', ['linear'], ['get', 'w'],
            0, '#8a3d06', 0.5, '#e08a2a', 0.85, '#ffd79a', 1, '#fff6e6'],
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 3.5, 0, 4.5, 0.95],
        },
      },
      {
        // USGS earthquakes (opt-in layer): hollow rings in a cool grey-blue, never amber.
        id: 'quake-ring',
        type: 'circle',
        source: 'quakes',
        layout: { 'circle-sort-key': ['-', 0, ['get', 'mag']] },
        paint: {
          // Zoom must be the outermost input of a zoom-dependent expression.
          'circle-radius': ['interpolate', ['linear'], ['zoom'],
            1, ['interpolate', ['linear'], ['get', 'mag'], 2.5, 3, 5, 8, 7, 18, 9, 30],
            6, ['interpolate', ['linear'], ['get', 'mag'], 2.5, 5.4, 5, 14.4, 7, 32.4, 9, 54]],
          'circle-color': '#8fa8c8',
          'circle-opacity': 0,
          'circle-stroke-color': '#8fa8c8',
          'circle-stroke-width': ['interpolate', ['linear'], ['get', 'mag'], 2.5, 0.8, 6, 1.6],
          'circle-stroke-opacity': 0.85,
        },
      },
      {
        id: 'selected-fill',
        type: 'fill',
        source: 'selected',
        paint: { 'fill-color': '#ffd79a', 'fill-opacity': 0.06 },
      },
      {
        id: 'selected-line',
        type: 'line',
        source: 'selected',
        paint: { 'line-color': '#fff6e6', 'line-width': 1.25, 'line-opacity': 0.9 },
      },
      {
        id: 'cell-label-top',
        type: 'symbol',
        source: 'heat',
        maxzoom: 4,
        filter: ['==', ['get', 'top'], 1],
        layout: {
          'text-field': ['get', 'label'],
          'text-font': LABEL_FONTS,
          'text-size': 11,
          'text-anchor': 'top',
          'text-offset': [0, 0.8],
          'text-padding': 4,
          'symbol-sort-key': ['-', 0, ['get', 'n']],
        },
        paint: {
          'text-color': '#b9b2a6',
          'text-halo-color': '#050608',
          'text-halo-width': 1.2,
        },
      },
      {
        id: 'cell-label',
        type: 'symbol',
        source: 'heat',
        minzoom: 4,
        filter: ['>=', ['get', 'w'], CELL_LABEL_MIN_W],
        layout: {
          'text-field': ['get', 'label'],
          'text-font': LABEL_FONTS,
          'text-size': 11,
          'text-anchor': 'top',
          'text-offset': [0, 0.9],
          'text-padding': 6,
          'symbol-sort-key': ['-', 0, ['get', 'n']],
        },
        paint: {
          'text-color': '#b9b2a6',
          'text-halo-color': '#050608',
          'text-halo-width': 1.2,
        },
      },
      {
        // Invisible, generous hit targets so cells are clickable at every zoom.
        id: 'cell-hit',
        type: 'circle',
        source: 'heat',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'],
            0, ['+', 4, ['*', ['get', 'w'], 4]],
            4, ['+', 6, ['*', ['get', 'w'], 8]],
            9, ['+', 6, ['*', ['get', 'w'], 24]]],
          'circle-opacity': 0,
        },
      },
    ],
  };
}

/** What the heat layers draw: a live cell, or a replay row with the live name when known. */
export type MapCell = Pick<HeatCell, 'id' | 'lat' | 'lon' | 'n' | 'name'> & { b?: number };

export interface WorldMap {
  /** `maxN` is the live snapshot's largest n, so every frame is scaled the same way. */
  setCells(cells: MapCell[], maxN: number, mode: HeatMode): void;
  outline(id: string | null): Promise<void>;
  /** USGS feed features, or null to clear the layer. */
  setQuakes(data: GeoJSON.FeatureCollection | null): void;
  /**
   * Phone sheet: keep the map's usable area above it (bottom padding) and, when a point is
   * given, ease it into the middle of that area. 0 clears the padding.
   */
  setSheet(height: number, focus?: [lon: number, lat: number]): void;
  hideTooltip(): void;
}

/**
 * A non-interactive map for the clip page: same style, world fitted inside `padding`.
 * `view` moves the camera there instead (a signal card zoomed to one cell); the world box
 * still bounds it.
 */
export function createClipMap(
  container: HTMLElement,
  padding: Padding,
  view?: { center: [lon: number, lat: number]; zoom: number },
): Promise<{ map: MapLibreMap; setCells: (cells: MapCell[], maxN: number) => void }> {
  let ref: MapLibreMap | null = null;
  const map = new MapLibreMap({
    container,
    style: style(),
    center: [10, 20],
    zoom: -2,
    minZoom: -2,
    maxZoom: MAX_ZOOM,
    renderWorldCopies: false,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    transformConstrain: worldConstrain(container, () => (ref ? ref.getPadding() : padding)),
  });
  ref = map;
  map.setPadding(padding);
  map.jumpTo(view ?? { center: [10, 20], zoom: -2 });
  const setCells = (cells: MapCell[], maxN: number) =>
    map.getSource<GeoJSONSource>('heat')?.setData({ type: 'FeatureCollection', features: heatFeatures(cells, maxN, 'articles') });
  return new Promise((resolve) => map.once('load', () => resolve({ map, setCells })));
}

export function createMap(
  container: HTMLElement,
  tooltip: HTMLElement,
  onSelect: (cell: MapCell) => void,
): Promise<WorldMap> {
  let mapRef: MapLibreMap | null = null;
  const map = new MapLibreMap({
    container,
    style: style(),
    center: [10, 20],
    zoom: -2,
    minZoom: -2,
    maxZoom: MAX_ZOOM,
    renderWorldCopies: false,
    // The map does not exist yet while its constructor runs the first constrain.
    transformConstrain: worldConstrain(container, () => (mapRef ? mapRef.getPadding() : NO_PADDING)),
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxPitch: 0,
    attributionControl: { compact: true, customAttribution: 'Natural Earth · GDELT · USGS · <a href="./about.html">How it works</a>' },
  });
  mapRef = map;
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  // Dev builds only: a handle for headless checks. Stripped from production bundles.
  if (import.meta.env.DEV) (window as unknown as { __map: MapLibreMap }).__map = map;

  const byId = new Map<string, MapCell>();
  let outlineRequest = 0;
  let heatMode: HeatMode = 'articles';
  let sheetPadding = 0; // bottom padding last asked for by setSheet

  const span = (text: string, className = '') => Object.assign(document.createElement('span'), { textContent: text, className });

  const placeTooltip = (point: { x: number; y: number }) => {
    tooltip.hidden = false;
    const x = Math.min(point.x + 14, container.clientWidth - tooltip.offsetWidth - 8);
    const y = point.y + 14 + tooltip.offsetHeight > container.clientHeight ? point.y - tooltip.offsetHeight - 10 : point.y + 14;
    tooltip.style.transform = `translate(${Math.max(8, x)}px, ${y}px)`;
  };

  const hideTooltip = () => {
    tooltip.hidden = true;
    map.getCanvas().style.cursor = '';
  };

  /** What is under the pointer: a quake ring wins over a news cell (it sits on top). */
  const hit = (point: { x: number; y: number }) => {
    let cell: MapCell | undefined;
    for (const f of map.queryRenderedFeatures([point.x, point.y], { layers: ['cell-hit'] })) {
      const c = byId.get(String(f.properties?.id));
      if (c && (!cell || c.n > cell.n)) cell = c;
    }
    if (cell) return { cell };
    // The news cell wins; a quake ring only answers where no cell is hit.
    return { quake: map.queryRenderedFeatures([point.x, point.y], { layers: ['quake-ring'] })[0] };
  };

  map.on('mousemove', (e) => {
    const { quake, cell } = hit(e.point);
    if (quake) {
      const p = quake.properties ?? {};
      const depth = p.depth == null ? NaN : Number(p.depth);
      // "M 5.1 · 32 km · 3h ago · <place>": numbers and the place as USGS gives it.
      const parts = [
        `M ${Number(p.mag).toFixed(1)}`,
        Number.isFinite(depth) ? `${Math.round(depth)} km` : '',
        Number.isFinite(p.time) ? ago(new Date(p.time).toISOString()) : '',
        String(p.place ?? ''),
      ].filter(Boolean);
      tooltip.replaceChildren(span(parts.join(' · '), 'quake-tip'));
    } else if (cell) {
      const lines = [span(`${count(cell.n)} articles`)];
      if (heatMode === 'normal' && ratioLabel(cell)) lines.push(span(ratioLabel(cell)));
      if (cell.name) lines.unshift(Object.assign(document.createElement('strong'), { textContent: cell.name }));
      tooltip.replaceChildren(...lines);
    } else {
      return hideTooltip();
    }
    map.getCanvas().style.cursor = 'pointer';
    placeTooltip(e.point);
  });
  map.on('mouseout', hideTooltip);
  map.on('movestart', hideTooltip);
  map.on('click', (e) => {
    hideTooltip();
    const { quake, cell } = hit(e.point);
    if (quake) {
      // USGS event pages only over https.
      const href = safeHref(String(quake.properties?.url ?? ''));
      if (href?.startsWith('https://')) window.open(href, '_blank', 'noopener');
    } else if (cell) {
      onSelect(cell);
    }
  });

  const api: WorldMap = {
    setCells(cells, maxN, mode) {
      heatMode = mode;
      byId.clear();
      const features = heatFeatures(cells, maxN, mode);
      const labelled = new Set<string>();
      cells.forEach((c, i) => {
        byId.set(c.id, c);
        if (c.name && (features[i].properties!.w as number) >= CELL_LABEL_MIN_W) labelled.add(placeKey(c.name));
      });
      map.getSource<GeoJSONSource>('heat')?.setData({ type: 'FeatureCollection', features });
      // A city with the same name as a news label would just repeat it: hide the city.
      const notNews: ExpressionSpecification = ['!', ['in', ['get', 'key'], ['literal', [...labelled]]]];
      for (const [layer, tier] of Object.entries(PLACE_TIERS)) map.setFilter(layer, ['all', tier, notNews]);
      map.setFilter('place-dot', notNews);
    },

    hideTooltip,

    setQuakes(data) {
      map.getSource<GeoJSONSource>('quakes')?.setData(data ?? EMPTY);
    },

    setSheet(height, focus) {
      const bottom = Math.max(0, Math.round(height));
      // Resize reports repeat the same height; easing again would cut short a focus ease.
      if (!focus && bottom === sheetPadding) return;
      sheetPadding = bottom;
      const padding = { ...NO_PADDING, bottom };
      if (focus) map.easeTo({ center: focus, padding, duration: 450 });
      else map.easeTo({ padding, duration: 300 });
    },

    async outline(id) {
      const source = map.getSource<GeoJSONSource>('selected');
      const mine = ++outlineRequest;
      if (!id) return void source?.setData(EMPTY);
      // h3-js is only needed after a click, so it loads lazily.
      const { cellToBoundary } = await import('h3-js');
      // A close or a newer click may have happened while the chunk loaded.
      if (mine !== outlineRequest) return;
      const ring = cellToBoundary(id, true);
      const lngs = ring.map((p) => p[0]);
      // A cell crossing the antimeridian would draw a band across the whole map; skip it.
      const wraps = Math.max(...lngs) - Math.min(...lngs) > 180;
      source?.setData(wraps ? EMPTY : {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: {},
      });
    },
  };

  // First paint uses only the 110m outlines. The first time the camera reaches zoom 3,
  // fetch the finer outlines, admin-1 lines and label points once. Each file is fetched
  // on the main thread so a failure leaves what is there (the 110m outlines) in place.
  let detailRequested = false;
  const loadDetail = () => {
    if (detailRequested || map.getZoom() < 3) return;
    detailRequested = true;
    map.off('zoom', loadDetail);
    const files: [source: string, path: string][] = [
      ['countries', 'geo/countries-50m.json'],
      ['admin1', 'geo/admin1-lines.json'],
      ['places', 'geo/places.json'],
      ['country-labels', 'geo/country-labels.json'],
    ];
    for (const [source, path] of files) {
      fetch(siteUrl(path))
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`${res.status} ${path}`))))
        .then((data: GeoJSON.FeatureCollection) => {
          // Cities carry a match key so setCells can hide those named like a news label.
          if (source === 'places') for (const f of data.features) f.properties!.key = placeKey(String(f.properties?.name ?? ''));
          map.getSource<GeoJSONSource>(source)?.setData(data);
        })
        .catch(() => {});
    }
  };

  // Portrait screens: start with the world filling the height (the width then overflows, so
  // no world edge shows); the contain-fit stays the minimum zoom.
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (h > w && w > 0) map.jumpTo({ center: [15, 20], zoom: Math.log2(h / (mercY(LAT_SOUTH) - mercY(LAT_NORTH)) / TILE) });

  return new Promise((resolve) =>
    map.once('load', () => {
      map.on('zoom', loadDetail);
      loadDetail();
      resolve(api);
    }),
  );
}
