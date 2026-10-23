// The embed (embed.html): the live map as one small page another site frames. The snapshot's
// marks drawn on a plain canvas in the pre-paint's way, over the country outlines, in the
// first camera fitted to the frame's own size. No MapLibre: this module must not import
// map.ts. The whole frame is one link to the site (or, with ?c=<cellId>, to that place).
import { count, shortName, utcTime } from './format';
import { isCellId, PAGE_MIN, siteUrl, type Heat, type HeatCell } from './data';
import { drawMarks, screenX, screenY, toMarks, viewOf, type Mark } from './prepaint';
import { heatWeight, MARK_RADIUS, MARK_STROKE, MARK_ZOOM_SCALE, markStep, mercX, mercY, zoomInterpolate } from './projection';

type Ring = [number, number][];

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const link = document.getElementById('frame') as HTMLAnchorElement;
const line = document.getElementById('line') as HTMLElement;

let outlines: Ring[] = [];
let marks: Mark[] = [];
let ringed: { x: number; y: number; step: number } | null = null;

/** The polygons' rings in world units, once, so a resize only re-projects. */
function ringsOf(geo: { features?: { geometry?: { type: string; coordinates: unknown } }[] }): Ring[] {
  const rings: Ring[] = [];
  for (const f of geo.features ?? []) {
    const g = f.geometry;
    if (!g) continue;
    const polys = (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []) as number[][][][];
    for (const poly of polys) for (const ring of poly) rings.push(ring.map(([lon, lat]) => [mercX(lon), mercY(lat)]));
  }
  return rings;
}

let drawnW = -1;
let drawnH = -1;
let drawnDpr = -1;
let dirty = true;

function draw(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  // The resize event also fires on a page zoom, which changes the pixel ratio.
  if (!dirty && w === drawnW && h === drawnH && dpr === drawnDpr) return;
  dirty = false;
  drawnW = w;
  drawnH = h;
  drawnDpr = dpr;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx || w <= 0 || h <= 0) return;
  // Transparent ground: the page's dot grid shows between the outlines.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const v = viewOf(w, h);

  // The outlines in the rule grey, 1 css px.
  ctx.lineWidth = 1;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#333333';
  ctx.beginPath();
  for (const ring of outlines) {
    for (let i = 0; i < ring.length; i++) {
      const x = screenX(v, ring[i][0]);
      const y = screenY(v, ring[i][1]);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
  }
  ctx.stroke();

  drawMarks(ctx, marks, v, dpr);

  // The map's selected-cell reticle, a hollow 1px white ring (circle-radius 3, stroke 1:
  // 3.5 at the line's middle). At the fitted world's zoom the largest marks are as wide as
  // it, so it is held 2px clear of the cell's own mark, with a black px either side so it
  // stays a ring among the neighbouring dots.
  if (ringed) {
    const mark = MARK_RADIUS[ringed.step] * zoomInterpolate(MARK_ZOOM_SCALE, v.zoom) + zoomInterpolate(MARK_STROKE, v.zoom);
    const x = screenX(v, ringed.x);
    const y = screenY(v, ringed.y);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(3.5, mark + 2.5), 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000000';
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }
}

const redraw = () => {
  dirty = true;
  draw();
};

async function json<T>(path: string): Promise<T> {
  const res = await fetch(siteUrl(path), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return (await res.json()) as T;
}

function start(): void {
  const c = new URLSearchParams(location.search).get('c') ?? '';
  link.href = new URL('./', location.href).href;
  draw();
  window.addEventListener('resize', () => draw());

  json<Parameters<typeof ringsOf>[0]>('geo/countries.json')
    .then((geo) => {
      outlines = ringsOf(geo);
      redraw();
    })
    .catch(() => {});

  json<Heat>('data/heat.json')
    .then((heat) => {
      const cells = Array.isArray(heat.cells) ? heat.cells : [];
      const maxN = Math.max(1, ...cells.map((x) => x.n));
      // The main page's first mode is "articles" unless the reader kept "vs. normal"; a frame
      // on another site has no reader preference, so it always draws articles.
      marks = toMarks(cells, maxN, 'articles');
      const cell: HeatCell | undefined = isCellId(c) ? cells.find((x) => x.id === c) : undefined;
      if (cell) {
        ringed = { x: mercX(cell.lon), y: mercY(cell.lat), step: markStep(heatWeight(cell, maxN, 'articles')) };
        line.textContent = `${shortName(cell.name).toUpperCase()} · ${count(cell.n)} ARTICLES`;
        if (cell.n >= PAGE_MIN) link.href = new URL(`place/${cell.id}.html`, location.href).href;
      } else {
        const time = utcTime(heat.generatedAt);
        line.textContent = `${count(heat.totals.articles)} ARTICLES${time ? ` · ${time}` : ''}`;
      }
      line.hidden = false;
      redraw();
    })
    .catch(() => {
      line.textContent = 'SNAPSHOT UNAVAILABLE';
      line.classList.add('muted');
      line.hidden = false;
      // Whatever was set before the failure (marks, a ring) is drawn, not left for a resize.
      redraw();
    });
}

start();
