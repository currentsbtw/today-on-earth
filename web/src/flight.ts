// The clip's flight from one camera to another, as stills: the zoom-out, travel, zoom-in
// path MapLibre's flyTo follows (van Wijk & Nuij 2003, curve rho 1.42, its default easing on
// the parameter), sampled at fixed steps so the same input always gives the same frames.
// Ported from maplibre-gl 6 (src/ui/camera.ts flyTo, mercator_camera_helper handleFlyTo).
import { latOf, lngOf, mercX, mercY, TILE, type ClipCamera } from './map';

/** Cubic bezier easing (the unitbezier solver MapLibre uses); defaultEasing is (0.25, 0.1, 0.25, 1). */
function bezier(p1x: number, p1y: number, p2x: number, p2y: number) {
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;
  return (x: number, epsilon = 1e-6) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const x2 = ((ax * t + bx) * t + cx) * t - x;
      if (Math.abs(x2) < epsilon) return ((ay * t + by) * t + cy) * t;
      const d2 = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(d2) < 1e-6) break;
      t -= x2 / d2;
    }
    let t0 = 0;
    let t1 = 1;
    t = x;
    for (let i = 0; i < 20; i++) {
      const x2 = ((ax * t + bx) * t + cx) * t;
      if (Math.abs(x2 - x) < epsilon) break;
      if (x > x2) t0 = t;
      else t1 = t;
      t = (t0 + t1) * 0.5;
    }
    return ((ay * t + by) * t + cy) * t;
  };
}

const easing = bezier(0.25, 0.1, 0.25, 1);
const CURVE = 1.42;
const { sinh, cosh, tanh } = Math;
/** Longitude into [-180, 180). */
export const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

/**
 * `steps + 1` cameras from `from` (index 0) to `to` (index `steps`, exactly `to`).
 * `width` x `height` is the frame; `minZoom` bounds the zoom-out as flyTo's minZoom does.
 * `wrap` (a map with world copies) takes the shorter way round the globe.
 */
export function flightPath(from: ClipCamera, to: ClipCamera, steps: number, frame: { width: number; height: number; minZoom: number; wrap: boolean }): ClipCamera[] {
  const x0 = mercX(from.center[0]);
  const y0 = mercY(from.center[1]);
  let x1 = mercX(to.center[0]);
  const y1 = mercY(to.center[1]);
  if (frame.wrap) x1 += Math.round(x0 - x1);
  const startSize = TILE * 2 ** from.zoom;
  const dx = x1 - x0;
  const dy = y1 - y0;

  // w0: visible span at the start; w1: at the end, in start pixels; u1: path length.
  const w0 = Math.max(frame.width, frame.height);
  const w1 = w0 / 2 ** (to.zoom - from.zoom);
  const u1 = Math.hypot(dx, dy) * startSize;
  // The zoom-out is bounded as flyTo bounds it (by limiting the curve), then held at the floor.
  const floor = Math.min(frame.minZoom, from.zoom, to.zoom);
  const wMax = w0 / 2 ** (floor - from.zoom);
  const rho = Math.min(CURVE, Math.sqrt((wMax / u1) * 2));
  const rho2 = rho * rho;
  const zoomOutFactor = (descent: boolean) => {
    const b = (w1 * w1 - w0 * w0 + (descent ? -1 : 1) * rho2 * rho2 * u1 * u1) / (2 * (descent ? w1 : w0) * rho2 * u1);
    return Math.log(Math.sqrt(b * b + 1) - b);
  };
  const r0 = zoomOutFactor(false);
  let w = (s: number) => cosh(r0) / cosh(r0 + rho * s);
  let u = (s: number) => (w0 * ((cosh(r0) * tanh(r0 + rho * s) - sinh(r0)) / rho2)) / u1;
  let S = (zoomOutFactor(true) - r0) / rho;
  let still = false;
  if (Math.abs(u1) < 0.000002 || !Number.isFinite(S)) {
    if (Math.abs(w0 - w1) < 0.000001) {
      still = true;
    } else {
      const k = w1 < w0 ? -1 : 1;
      S = Math.abs(Math.log(w1 / w0)) / rho;
      u = () => 0;
      w = (s) => Math.exp(k * rho * s);
    }
  }

  const path: ClipCamera[] = [];
  for (let i = 0; i <= steps; i++) {
    if (i === 0) {
      path.push({ center: [...from.center], zoom: from.zoom });
      continue;
    }
    if (i === steps || still) {
      path.push({ center: [...to.center], zoom: to.zoom });
      continue;
    }
    const k = easing(i / steps);
    const s = k * S;
    const f = u(s);
    const lon = lngOf(x0 + dx * f);
    path.push({ center: [frame.wrap ? wrapLon(lon) : lon, latOf(y0 + dy * f)], zoom: Math.max(floor, from.zoom + Math.log2(1 / w(s))) });
  }
  return path;
}
