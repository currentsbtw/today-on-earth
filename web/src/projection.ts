// The map's projection, camera and mark vocabulary as plain numbers, with no MapLibre in
// sight: map.ts builds its style and camera from these, and the pre-paint (prepaint.ts)
// draws the snapshot with them before the MapLibre chunk has arrived. map.ts re-exports
// everything here, so the clip page and flight.ts import from './map' as before.

export const MAX_ZOOM = 9;
// The world box the camera is held inside. Antarctica is not drawn, so stop short of it.
export const LAT_NORTH = 84;
export const LAT_SOUTH = -58;
export const TILE = 512;

/**
 * The coverage marks: one flat white circle per place, quantised into five steps of the
 * log weight `w` (heatWeight, against a fixed maxN, so replay frames and clip frames share
 * one scale; in "vs. normal" mode `w` is the ratio weight and the steps read it the same).
 * MARK_STEPS are the lower bounds of steps 2-5. Radii are screen px at zoom 0 and grow
 * with zoom by MARK_ZOOM_SCALE; the faint steps are white at reduced opacity (grey). The
 * top radius is held small so neighbouring cells in dense regions stay separate dots.
 */
export const MARK_STEPS = [0.2, 0.4, 0.6, 0.8];
export const MARK_RADIUS = [0.6, 0.85, 1.25, 1.9, 2.6];
export const MARK_OPACITY = [0.5, 0.7, 0.85, 1, 1];
/** [zoom, radius multiplier]: 1x at zoom 0, 3.5x at zoom 4, 8x at zoom 9. */
export const MARK_ZOOM_SCALE: [number, number][] = [[0, 1], [4, 3.5], [9, 8]];
/** [zoom, px]: the black hairline round each mark. */
export const MARK_STROKE: [number, number][] = [[0, 0.6], [4, 1]];

/** Web Mercator in world units (0..1 across the world square). */
export const mercX = (lng: number) => (lng + 180) / 360;
export const mercY = (lat: number) =>
  (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
export const lngOf = (x: number) => x * 360 - 180;
export const latOf = (y: number) => (360 / Math.PI) * Math.atan(Math.exp(Math.PI * (1 - 2 * y))) - 90;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export type HeatMode = 'articles' | 'normal';

/** Below this baseline a place counts as quiet, so a handful of articles cannot read as a surge. */
const BASELINE_FLOOR = 3;

/** How many times its normal a place is covered: (n + 1) / (max(b, floor) + 1). */
export const relativeRatio = (n: number, b: number) => (n + 1) / (Math.max(b, BASELINE_FLOOR) + 1);

/** Live cells carry `b`; replay-only cells do not. */
export function hasBaseline(c: { b?: number }): boolean {
  return typeof c.b === 'number';
}

/**
 * Brightness 0..1. "articles": log of n against the live snapshot's largest n.
 * "normal": log2 of the ratio to the place's own normal over 3, so 8x normal is full
 * brightness and anything at or below normal is dark.
 */
export function heatWeight(c: { n: number; b?: number }, maxN: number, mode: HeatMode): number {
  // Without a live baseline (a replay-only cell) there is nothing to compare against, so
  // the cell keeps its absolute weight and shows no ratio (DATA-CONTRACT "Baseline").
  if (mode === 'normal' && hasBaseline(c)) return clamp(Math.log2(relativeRatio(c.n, c.b!)) / 3, 0, 1);
  return Math.min(1, Math.log1p(c.n) / Math.log1p(Math.max(1, maxN)));
}

/** Which of the five mark steps a weight falls in (0..4), as the map's 'step' expression reads it. */
export const markStep = (w: number) => MARK_STEPS.filter((t) => w >= t).length;

/** MapLibre's linear 'interpolate' on ['zoom'] over [zoom, value] stops, clamped at the ends. */
export function zoomInterpolate(stops: [number, number][], zoom: number): number {
  if (zoom <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [z1, v1] = stops[i];
    if (zoom <= z1) {
      const [z0, v0] = stops[i - 1];
      return v0 + ((v1 - v0) * (zoom - z0)) / (z1 - z0);
    }
  }
  return stops[stops.length - 1][1];
}

/** Zoom at which the world box (LAT_NORTH..LAT_SOUTH) exactly fills a window `height` px tall. */
export const fillHeightZoom = (height: number) => Math.log2(height / (mercY(LAT_SOUTH) - mercY(LAT_NORTH)) / TILE);
/** Latitude of the world box's middle in Mercator: the centre of a height-filled view. */
export const FILL_LAT = latOf((mercY(LAT_NORTH) + mercY(LAT_SOUTH)) / 2);
/** Zoom at which the whole world box fits inside a w x h window (the clip map's fitted world). */
export const fitWorldZoom = (w: number, h: number) => Math.log2(Math.min(w, h / (mercY(LAT_SOUTH) - mercY(LAT_NORTH))) / TILE);

export interface Camera {
  center: [lon: number, lat: number];
  zoom: number;
}

/**
 * The world constraint as numbers (map.ts's worldConstrain wraps it for MapLibre): keeps
 * the whole world box visible at the lowest zoom (contain, not cover) and never lets the
 * camera pan past its edges, in a `w` x `h` window (the map's size less its padding).
 * `wrap` leaves the longitude free.
 */
export function constrainCamera(lng: number, lat: number, zoom: number, w: number, h: number, wrap = false): Camera {
  const top = mercY(LAT_NORTH);
  const bottom = mercY(LAT_SOUTH);
  const fitZoom = Math.log2(Math.min(w, h / (bottom - top)) / TILE);
  const z = clamp(zoom, fitZoom, MAX_ZOOM);
  const size = TILE * 2 ** z;
  const axis = (v: number, lo: number, hi: number, half: number) =>
    hi - lo <= 2 * half ? (lo + hi) / 2 : clamp(v, lo + half, hi - half);
  const y = axis(mercY(lat) * size, top * size, bottom * size, h / 2) / size;
  if (wrap) return { center: [lng, latOf(y)], zoom: z };
  const x = axis(mercX(lng) * size, 0, size, w / 2) / size;
  return { center: [lngOf(x), latOf(y)], zoom: z };
}

/** The camera the live map is constructed with, before the constraint applies. */
export const MAP_START: Camera = { center: [10, 20], zoom: -2 };

/**
 * Where the live map's camera is asked to go once it exists, for a w x h container:
 * portrait screens start with the world filling the height (the width then overflows, so no
 * world edge shows; the contain-fit stays the minimum zoom); others keep the start camera,
 * which the constraint turns into the fitted world.
 */
export function startCamera(w: number, h: number): Camera {
  return h > w && w > 0 ? { center: [15, 20], zoom: fillHeightZoom(h) } : MAP_START;
}

/**
 * The camera the live map first draws with in a w x h container (no padding at start): the
 * start camera after the world constraint. The pre-paint projects with this, so its dots sit
 * where the map's will.
 */
export function initialCamera(w: number, h: number): Camera {
  const { center, zoom } = startCamera(w, h);
  return constrainCamera(center[0], center[1], zoom, w, h);
}
