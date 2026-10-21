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
  type MapLayerMouseEvent,
  type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre 6 loads its worker from a sibling file; point it at the copy Vite emits.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { siteUrl, type HeatCell } from './data';
import { count, placeKey, shortName } from './format';

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

/**
 * Keeps the whole world box visible at the lowest zoom (contain, not cover) and never lets
 * the camera pan past its edges. MapLibre's default maxBounds behaviour zooms in until the
 * bounds cover the viewport, which would crop the world on load.
 */
function worldConstrain(container: HTMLElement) {
  const top = mercY(LAT_NORTH);
  const bottom = mercY(LAT_SOUTH);
  return (lngLat: LngLat, zoom: number) => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return { center: lngLat, zoom };
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

function style(): StyleSpecification {
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
export type MapCell = Pick<HeatCell, 'id' | 'lat' | 'lon' | 'n' | 'name'>;

export interface WorldMap {
  /** `maxN` is the live snapshot's largest n, so every frame is scaled the same way. */
  setCells(cells: MapCell[], maxN: number): void;
  outline(id: string | null): Promise<void>;
}

export function createMap(
  container: HTMLElement,
  tooltip: HTMLElement,
  onSelect: (cell: MapCell) => void,
): Promise<WorldMap> {
  const map = new MapLibreMap({
    container,
    style: style(),
    center: [10, 20],
    zoom: -2,
    minZoom: -2,
    maxZoom: MAX_ZOOM,
    renderWorldCopies: false,
    transformConstrain: worldConstrain(container),
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxPitch: 0,
    attributionControl: { compact: true, customAttribution: 'Natural Earth · GDELT · <a href="./about.html">How it works</a>' },
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  // Dev builds only: a handle for headless checks. Stripped from production bundles.
  if (import.meta.env.DEV) (window as unknown as { __map: MapLibreMap }).__map = map;

  const byId = new Map<string, MapCell>();
  let outlineRequest = 0;

  const cellAt = (e: MapLayerMouseEvent): MapCell | undefined => {
    let best: MapCell | undefined;
    for (const f of e.features ?? []) {
      const cell = byId.get(String(f.properties?.id));
      if (cell && (!best || cell.n > best.n)) best = cell;
    }
    return best;
  };

  const hideTooltip = () => {
    tooltip.hidden = true;
    map.getCanvas().style.cursor = '';
  };

  map.on('mousemove', 'cell-hit', (e) => {
    const cell = cellAt(e);
    if (!cell) return hideTooltip();
    map.getCanvas().style.cursor = 'pointer';
    const articles = Object.assign(document.createElement('span'), { textContent: `${count(cell.n)} articles` });
    if (cell.name) {
      tooltip.replaceChildren(Object.assign(document.createElement('strong'), { textContent: cell.name }), articles);
    } else {
      tooltip.replaceChildren(articles);
    }
    tooltip.hidden = false;
    const x = Math.min(e.point.x + 14, container.clientWidth - tooltip.offsetWidth - 8);
    const y = e.point.y + 14 + tooltip.offsetHeight > container.clientHeight
      ? e.point.y - tooltip.offsetHeight - 10
      : e.point.y + 14;
    tooltip.style.transform = `translate(${Math.max(8, x)}px, ${y}px)`;
  });
  map.on('mouseleave', 'cell-hit', hideTooltip);
  map.on('movestart', hideTooltip);
  map.on('click', 'cell-hit', (e) => {
    const cell = cellAt(e);
    if (cell) onSelect(cell);
  });

  const api: WorldMap = {
    setCells(cells, maxN) {
      byId.clear();
      const max = Math.log1p(Math.max(1, maxN));
      const labelled = new Set<string>();
      const features: GeoJSON.Feature<GeoJSON.Point>[] = cells.map((c) => {
        byId.set(c.id, c);
        if (c.name && Math.log1p(c.n) / max >= CELL_LABEL_MIN_W) labelled.add(placeKey(c.name));
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
          properties: {
            id: c.id,
            n: c.n,
            label: c.name ? shortName(c.name) : '',
            w: Math.min(1, Math.log1p(c.n) / max),
          },
        };
      });
      map.getSource<GeoJSONSource>('heat')?.setData({ type: 'FeatureCollection', features });
      // A city with the same name as a news label would just repeat it: hide the city.
      const notNews: ExpressionSpecification = ['!', ['in', ['get', 'key'], ['literal', [...labelled]]]];
      for (const [layer, tier] of Object.entries(PLACE_TIERS)) map.setFilter(layer, ['all', tier, notNews]);
      map.setFilter('place-dot', notNews);
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

  return new Promise((resolve) =>
    map.once('load', () => {
      map.on('zoom', loadDetail);
      loadDetail();
      resolve(api);
    }),
  );
}
