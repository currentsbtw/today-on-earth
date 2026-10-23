// The pre-paint: the snapshot's dots on a plain canvas inside the map frame, drawn the moment
// heat.json is in, while the MapLibre chunk and its worker are still on their way. It uses
// the map's own camera (initialCamera) and mark vocabulary (projection.ts), so when the
// live map draws its first frame with the cells and this canvas is removed, the dots stay
// where they are and only the land and labels appear. One state, then the next: no motion.
// This module must not import MapLibre (or map.ts, which does).
import {
  heatWeight,
  initialCamera,
  MARK_OPACITY,
  MARK_RADIUS,
  MARK_STROKE,
  MARK_ZOOM_SCALE,
  markStep,
  mercX,
  mercY,
  TILE,
  zoomInterpolate,
  type HeatMode,
} from './projection';

export interface PrepaintCell {
  lat: number;
  lon: number;
  n: number;
  b?: number;
}

export interface Prepaint {
  remove(): void;
}

/**
 * Draws `cells` into a canvas over the map frame, sized to it at devicePixelRatio, and
 * redraws when the frame is resized. `maxN` and `mode` are what the live map's first
 * setCells will get, so every dot takes the same step.
 */
export function prepaint(frame: HTMLElement, cells: PrepaintCell[], maxN: number, mode: HeatMode): Prepaint {
  const canvas = document.createElement('canvas');
  canvas.className = 'prepaint';
  canvas.setAttribute('aria-hidden', 'true');
  // Largest last, as the map's circle-sort-key draws them.
  const marks = cells
    .map((c) => ({ x: mercX(c.lon), y: mercY(c.lat), n: c.n, step: markStep(heatWeight(c, maxN, mode)) }))
    .sort((a, b) => a.n - b.n);

  let drawnW = -1;
  let drawnH = -1;
  const draw = () => {
    // The map container fills the frame's padding box (.map-frame > .map, inset 0), and
    // MapLibre sizes itself from the container's client size, so this is the map's size.
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    if (w === drawnW && h === drawnH) return;
    drawnW = w;
    drawnH = h;
    const dpr = window.devicePixelRatio || 1;
    // As MapLibre sizes its canvas: floor(css px x ratio) backing pixels, css size in px.
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx || w <= 0 || h <= 0) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    const { center, zoom } = initialCamera(w, h);
    const size = TILE * 2 ** zoom;
    const cx = mercX(center[0]);
    const cy = mercY(center[1]);
    const k = zoomInterpolate(MARK_ZOOM_SCALE, zoom);
    const stroke = zoomInterpolate(MARK_STROKE, zoom);
    // MapLibre's circle shader antialiases each edge over the last device pixel inside it,
    // where a canvas path antialiases across the edge: so its edges sit half a device pixel in.
    const inset = 0.5 / dpr;
    ctx.lineWidth = stroke;
    ctx.strokeStyle = '#000000';
    for (const m of marks) {
      const x = (m.x - cx) * size + w / 2;
      const y = (m.y - cy) * size + h / 2;
      const r = MARK_RADIUS[m.step] * k;
      if (x < -r - stroke || x > w + r + stroke || y < -r - stroke || y > h + r + stroke) continue;
      // MapLibre's circle: the fill to `r`, the stroke from `r` out to `r + stroke`. One
      // path at the stroke's middle: the fill reaches it and the opaque stroke covers the rest.
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0, r - inset) + stroke / 2, 0, Math.PI * 2);
      ctx.globalAlpha = MARK_OPACITY[m.step];
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
    }
  };

  draw();
  // After the map container, so it sits over the map's canvas until removed (and under the
  // status line, which has its own stacking).
  const mapEl = frame.querySelector('.map');
  if (mapEl) mapEl.after(canvas);
  else frame.prepend(canvas);
  const observer = new ResizeObserver(draw);
  observer.observe(frame);

  return {
    remove() {
      observer.disconnect();
      canvas.remove();
    },
  };
}
