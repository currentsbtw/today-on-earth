// The map: a tile-free MapLibre style with country outlines, the heat layers and the
// selected-cell outline with its tag.
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
import {
  constrainCamera,
  hasBaseline,
  heatWeight,
  MARK_OPACITY,
  MARK_RADIUS,
  MARK_STEPS,
  MARK_STROKE,
  MARK_ZOOM_SCALE,
  MAP_START,
  MAX_ZOOM,
  relativeRatio,
  startCamera,
  type HeatMode,
} from './projection';

// The projection, camera and mark helpers live in projection.ts (no MapLibre there, so the
// pre-paint can use them before this chunk arrives); the clip page imports them from here.
export {
  FILL_LAT,
  fillHeightZoom,
  fitWorldZoom,
  heatWeight,
  latOf,
  lngOf,
  MARK_OPACITY,
  MARK_RADIUS,
  MARK_STEPS,
  MARK_ZOOM_SCALE,
  mercX,
  mercY,
  relativeRatio,
  TILE,
  type HeatMode,
} from './projection';

setWorkerUrl(workerUrl);

// The map plate's palette (Datamatics Field): black ocean, near-black land read by its
// coastlines, white marks. Greys live only here, inside the map. Hardcoded rather than read
// from tokens.css: the style is built before any stylesheet is guaranteed to have applied
// (the clip page), and MapLibre needs literal colours. MAP_HEAT is the same white as tokens.css --fg.
export const MAP_OCEAN = '#000000';
export const MAP_LAND = '#0d0d0d';
/** Country borders, which also draw the coasts: the planet reads by these lines. */
export const MAP_BORDER = '#2f2f2f';
/** Admin-1 lines (zoomed in): thinner than borders, so a step lighter to stay visible. */
export const MAP_ADMIN = '#3a3a3a';
export const MAP_HEAT = '#ffffff';
/** Base labels (cities, countries): white at reduced alpha over a black halo. */
export const MAP_LABEL = 'rgba(255,255,255,0.8)';
export const MAP_LABEL_MINOR = 'rgba(255,255,255,0.56)';

/** A per-step value: ['step', w, v1, 0.2, v2, ...]. */
const byStep = (values: number[]): ExpressionSpecification =>
  ['step', ['get', 'w'], values[0], ...MARK_STEPS.flatMap((t, i) => [t, values[i + 1]])] as ExpressionSpecification;

// Labels draw from local fonts (no glyph server); MapLibre waits for the web font to load.
const LABEL_FONTS = ['Azeret Mono', 'ui-monospace', 'Consolas', 'monospace'];
export const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

interface Padding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}
const NO_PADDING: Padding = { top: 0, bottom: 0, left: 0, right: 0 };

/** "×2.4 normal" */
export const ratioLabel = (c: Pick<MapCell, 'n' | 'b'>) =>
  hasBaseline(c) ? `×${relativeRatio(c.n, c.b!).toFixed(1)} normal` : '';

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
 * bounds cover the viewport, which would crop the world on load. `wrap` (a map that renders
 * world copies) leaves the longitude free so the camera can pan round the globe; latitude
 * and zoom are held as before.
 */
function worldConstrain(container: HTMLElement, padding: () => Partial<Padding>, wrap = false) {
  return (lngLat: LngLat, zoom: number) => {
    // With map padding (the phone sheet, or a clip page's reserved bands), MapLibre's
    // center is the middle of the unpadded area, so fit the world into that area.
    const pad = padding();
    const w = container.clientWidth - (pad.left ?? 0) - (pad.right ?? 0);
    const h = container.clientHeight - (pad.top ?? 0) - (pad.bottom ?? 0);
    if (w <= 0 || h <= 0) return { center: lngLat, zoom };
    // The arithmetic is shared with the pre-paint's initialCamera (projection.ts).
    const c = constrainCamera(lngLat.lng, lngLat.lat, zoom, w, h, wrap);
    return { center: new LngLat(c.center[0], c.center[1]), zoom: c.zoom };
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

/** One tier of city labels: mono uppercase, capitals brighter and placed first. */
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
      'text-size': 9.5,
      'text-transform': 'uppercase',
      'text-letter-spacing': 0.08,
      'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
      'text-radial-offset': 0.45,
      'text-padding': 3,
      'symbol-sort-key': ['-', ['get', 'rank'], ['*', 3, ['get', 'cap']]],
    },
    paint: {
      'text-color': ['case', ['==', ['get', 'cap'], 1], MAP_LABEL, MAP_LABEL_MINOR],
      'text-halo-color': MAP_OCEAN,
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
      // The selected cell's centre: its reticle and its "NAME · n" tag.
      'selected-tag': { type: 'geojson', data: EMPTY },
      quakes: { type: 'geojson', data: EMPTY },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': MAP_OCEAN } },
      { id: 'land', type: 'fill', source: 'countries', paint: { 'fill-color': MAP_LAND } },
      {
        id: 'admin1',
        type: 'line',
        source: 'admin1',
        minzoom: 3.5,
        paint: {
          'line-color': MAP_ADMIN,
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 3.5, 0, 4.5, 0.8, 8, 1],
          'line-width': ['interpolate', ['linear'], ['zoom'], 3.5, 0.3, 8, 0.6],
        },
      },
      {
        id: 'borders',
        type: 'line',
        source: 'countries',
        paint: {
          'line-color': MAP_BORDER,
          'line-opacity': 1,
          'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.4, 6, 0.9],
        },
      },
      // Base labels sit beneath every heat layer and stay grey, so they never compete with
      // the white heat. Symbols are placed top layer first, so news cell labels (topmost) win
      // collisions, then country names, then cities by rank.
      {
        id: 'place-dot',
        type: 'circle',
        source: 'places',
        minzoom: 4.5,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4.5, 1.2, 8, 2],
          'circle-color': ['case', ['==', ['get', 'cap'], 1], MAP_LABEL, MAP_LABEL_MINOR],
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
          'text-size': ['interpolate', ['linear'], ['zoom'], 2.5, 8, 6, 10.5],
          'text-max-width': 7,
          'text-padding': 4,
          'symbol-sort-key': ['get', 'rank'],
        },
        paint: {
          'text-color': MAP_LABEL_MINOR,
          'text-halo-color': MAP_OCEAN,
          'text-halo-width': 1,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 2.5, 0, 3, 1],
        },
      },
      {
        // The coverage marks: crisp, unblurred, stepped. The largest places draw last, and a
        // black hairline keeps neighbours in dense regions apart instead of fusing.
        id: 'cell-dot',
        type: 'circle',
        source: 'heat',
        layout: { 'circle-sort-key': ['get', 'n'] },
        paint: {
          // Zoom must be the outermost input of a zoom-dependent expression.
          'circle-radius': ['interpolate', ['linear'], ['zoom'],
            ...MARK_ZOOM_SCALE.flatMap(([z, k]) => [z, byStep(MARK_RADIUS.map((r) => r * k))])] as ExpressionSpecification,
          'circle-color': MAP_HEAT,
          'circle-blur': 0,
          'circle-opacity': byStep(MARK_OPACITY),
          'circle-stroke-color': MAP_OCEAN,
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], ...MARK_STROKE.flat()] as ExpressionSpecification,
        },
      },
      {
        // USGS earthquakes (opt-in layer): hollow white hairline rings, no fill.
        id: 'quake-ring',
        type: 'circle',
        source: 'quakes',
        layout: { 'circle-sort-key': ['-', 0, ['get', 'mag']] },
        paint: {
          // Zoom must be the outermost input of a zoom-dependent expression.
          'circle-radius': ['interpolate', ['linear'], ['zoom'],
            1, ['interpolate', ['linear'], ['get', 'mag'], 2.5, 3, 5, 8, 7, 18, 9, 30],
            6, ['interpolate', ['linear'], ['get', 'mag'], 2.5, 5.4, 5, 14.4, 7, 32.4, 9, 54]],
          'circle-color': MAP_HEAT,
          'circle-opacity': 0,
          'circle-stroke-color': MAP_HEAT,
          'circle-stroke-width': 1,
          'circle-stroke-opacity': 0.9,
        },
      },
      {
        id: 'selected-fill',
        type: 'fill',
        source: 'selected',
        paint: { 'fill-color': MAP_HEAT, 'fill-opacity': 0.06 },
      },
      {
        id: 'selected-line',
        type: 'line',
        source: 'selected',
        paint: { 'line-color': MAP_HEAT, 'line-width': 1, 'line-opacity': 1 },
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
          'text-size': 10,
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.08,
          'text-anchor': 'top',
          'text-offset': [0, 0.8],
          'text-padding': 4,
          'symbol-sort-key': ['-', 0, ['get', 'n']],
        },
        paint: {
          'text-color': MAP_HEAT,
          'text-halo-color': MAP_OCEAN,
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
          'text-size': 10,
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.08,
          'text-anchor': 'top',
          'text-offset': [0, 0.9],
          'text-padding': 6,
          'symbol-sort-key': ['-', 0, ['get', 'n']],
        },
        paint: {
          'text-color': MAP_HEAT,
          'text-halo-color': MAP_OCEAN,
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
      {
        // A 6px hollow reticle at the selected cell's centre.
        id: 'selected-reticle',
        type: 'circle',
        source: 'selected-tag',
        paint: {
          'circle-radius': 3,
          'circle-opacity': 0,
          'circle-stroke-color': MAP_HEAT,
          'circle-stroke-width': 1,
        },
      },
      {
        // Topmost symbol layer: placed first, so base and news labels that would collide
        // with the tag are dropped rather than drawn under it.
        id: 'selected-tag',
        type: 'symbol',
        source: 'selected-tag',
        layout: {
          'text-field': ['get', 'label'],
          'text-font': LABEL_FONTS,
          'text-size': 11,
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.06,
          'text-anchor': 'top-left',
          'text-offset': [0.6, 1.9],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': MAP_HEAT,
          'text-halo-color': MAP_OCEAN,
          'text-halo-width': 2,
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
   * given, move it to the middle of that area in one step. 0 clears the padding.
   */
  setSheet(height: number, focus?: [lon: number, lat: number]): void;
  hideTooltip(): void;
  /**
   * Resolves after the first frame the map has drawn with the cells of its first setCells
   * on screen (the heat source loaded, then a render): the moment the pre-paint can go.
   */
  whenDrawn(): Promise<void>;
}

export interface ClipCamera {
  center: [lon: number, lat: number];
  zoom: number;
}

/**
 * A non-interactive map for the clip page: same style, world fitted inside `padding`.
 * `view` moves the camera there instead (a signal card zoomed to one cell); the world box
 * still bounds it. `wrap` renders world copies and frees the longitude (the portrait
 * time-lapse pans round the globe); latitude and zoom stay bounded. `tagSize` sets the callout
 * tag's text size in px (the live map keeps 11; the clip scales it with the frame).
 */
export function createClipMap(
  container: HTMLElement,
  padding: Padding,
  view?: ClipCamera,
  options: { wrap?: boolean; tagSize?: number } = {},
): Promise<{ map: MapLibreMap; setCells: (cells: MapCell[], maxN: number) => void }> {
  let ref: MapLibreMap | null = null;
  const clipStyle = style();
  const tag = clipStyle.layers.find((layer) => layer.id === 'selected-tag');
  if (options.tagSize && tag?.type === 'symbol') tag.layout = { ...tag.layout, 'text-size': options.tagSize };
  const map = new MapLibreMap({
    container,
    style: clipStyle,
    center: [10, 20],
    zoom: -2,
    minZoom: -2,
    maxZoom: MAX_ZOOM,
    renderWorldCopies: options.wrap ?? false,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    transformConstrain: worldConstrain(container, () => (ref ? ref.getPadding() : padding), options.wrap ?? false),
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
    center: MAP_START.center,
    zoom: MAP_START.zoom,
    minZoom: -2,
    maxZoom: MAX_ZOOM,
    renderWorldCopies: false,
    // The map does not exist yet while its constructor runs the first constrain.
    transformConstrain: worldConstrain(container, () => (mapRef ? mapRef.getPadding() : NO_PADDING)),
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxPitch: 0,
    // Labels snap in and out with the camera, like every other state (Stepped-Motion rule).
    fadeDuration: 0,
    // The canvas is the map's landmark (MapLibre gives it role=region): name it for what it shows.
    locale: { 'Map.Title': 'World map of news coverage' },
    attributionControl: { compact: true, customAttribution: 'Natural Earth · GDELT · USGS · <a href="./about.html">Method</a>' },
  });
  mapRef = map;
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  // Dev builds only: a handle for headless checks. Stripped from production bundles.
  if (import.meta.env.DEV) (window as unknown as { __map: MapLibreMap }).__map = map;

  const byId = new Map<string, MapCell>();
  let outlineRequest = 0;
  let selectedId: string | null = null; // the outlined cell, whose tag follows setCells

  /** The selected cell's reticle and "NAME · n" tag, from the cells last given to setCells. */
  const drawTag = () => {
    const source = map.getSource<GeoJSONSource>('selected-tag');
    const cell = selectedId ? byId.get(selectedId) : undefined;
    if (!cell) return void source?.setData(EMPTY);
    const label = cell.name ? `${shortName(cell.name)} · ${count(cell.n)}` : count(cell.n);
    source?.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [cell.lon, cell.lat] }, properties: { label } });
  };
  let heatMode: HeatMode = 'articles';
  let sheetPadding = 0; // bottom padding last asked for by setSheet

  // whenDrawn: after the first setCells, the first render that ends with the heat source
  // loaded (its worker update done and its tiles in) has the dots on screen. The render
  // event fires at the end of the frame's draw, so those tiles were in that frame.
  let cellsGiven = false;
  let drawnResolve: () => void = () => {};
  const drawn = new Promise<void>((resolve) => (drawnResolve = resolve));
  const checkDrawn = () => {
    if (!cellsGiven || !map.isSourceLoaded('heat')) return;
    map.off('render', checkDrawn);
    drawnResolve();
  };
  map.on('render', checkDrawn);

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
      drawTag();
      cellsGiven = true;
    },

    whenDrawn: () => drawn,

    hideTooltip,

    setQuakes(data) {
      map.getSource<GeoJSONSource>('quakes')?.setData(data ?? EMPTY);
    },

    setSheet(height, focus) {
      const bottom = Math.max(0, Math.round(height));
      // Resize reports repeat the same height; nothing to do then.
      if (!focus && bottom === sheetPadding) return;
      sheetPadding = bottom;
      const padding = { ...NO_PADDING, bottom };
      // One step to the end state, no ease (Stepped-Motion rule).
      if (focus) map.jumpTo({ center: focus, padding });
      else map.jumpTo({ padding });
    },

    async outline(id) {
      const source = map.getSource<GeoJSONSource>('selected');
      const mine = ++outlineRequest;
      selectedId = id;
      drawTag();
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

  // Portrait screens start with the world filling the height (startCamera, projection.ts);
  // the pre-paint projects with the same camera after the constraint (initialCamera).
  const start = startCamera(container.clientWidth, container.clientHeight);
  if (start !== MAP_START) map.jumpTo(start);

  return new Promise((resolve) =>
    map.once('load', () => {
      map.on('zoom', loadDetail);
      loadDetail();
      resolve(api);
    }),
  );
}
