// The share image of a place page (DESIGN.md "Icons and share assets"): 1200x630, the dot grid
// on black, the world box in the map's Web Mercator with the country outlines in the rule grey,
// every place of the snapshot as a flat mark, the page's own place ringed by a hollow reticle,
// and the wordmark and the place's name and counts in 5x7 pixel caps on black blocks. Drawn
// into an indexed pixel buffer and encoded as an 8-bit palette PNG here (node:zlib, no
// dependency), so the same data always gives the same bytes. No antialiasing anywhere.
import { constants as zlibConstants, deflateRaw, deflateRawSync } from 'node:zlib';
import { promisify } from 'node:util';
import { heatWeight, LAT_NORTH, LAT_SOUTH, MARK_OPACITY, MARK_RADIUS, markStep, mercX, mercY } from '../src/projection.ts';

const WIDTH = 1200;
const HEIGHT = 630;
const ROW = WIDTH + 1; // one filter byte (0, None) before each row of palette indices
/** The zoom scale on MARK_RADIUS: the top step's 2.6 becomes a 7.5px radius at this size. */
const MARK_K = 2.9;
const MARGIN = 36;

// Palette ------------------------------------------------------------------------------

const BLACK = 0;
const GRID = 1; // the pages' dot grid: white at 0.18 over black
const RULE = 2; // #333, the rule grey: country outlines
const MUTED = 3; // #9a9a9a: the counts line
const WHITE = 4;
const GREYS = [
  [0, 0, 0],
  [46, 46, 46],
  [0x33, 0x33, 0x33],
  [0x9a, 0x9a, 0x9a],
  [255, 255, 255],
];
/** Each mark step's opacity as a flat grey level (white x opacity over black), one entry per level. */
const STEP_INDEX = MARK_OPACITY.map((a) => {
  const v = Math.round(255 * a);
  let i = GREYS.findIndex((g) => g[0] === v && g[1] === v && g[2] === v);
  if (i < 0) i = GREYS.push([v, v, v]) - 1;
  return i;
});
if (GREYS.length > 8) throw new Error(`share-image: palette has ${GREYS.length} entries, more than 8`);
const PLTE = Buffer.from(GREYS.flat());

// The 5x7 pixel caps (the lockup's letterforms): seven rows of five columns, 1 = ink ------

const GLYPHS = {
  A: '01110 10001 10001 11111 10001 10001 10001',
  B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110',
  D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 10000 11110 10000 10000 11111',
  F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111',
  H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110',
  J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001',
  L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001',
  N: '10001 11001 10101 10011 10001 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101',
  R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110',
  T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110',
  V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 10101 01010',
  X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 01010 00100 00100 00100 00100',
  Z: '11111 00001 00010 00100 01000 10000 11111',
  0: '01110 10001 10011 10101 11001 10001 01110',
  1: '00100 01100 00100 00100 00100 00100 01110',
  2: '01110 10001 00001 00010 00100 01000 11111',
  3: '11111 00010 00100 00010 00001 10001 01110',
  4: '00010 00110 01010 10010 11111 00010 00010',
  5: '11111 10000 11110 00001 00001 10001 01110',
  6: '00110 01000 10000 11110 10001 10001 01110',
  7: '11111 00001 00010 00100 01000 01000 01000',
  8: '01110 10001 10001 01110 10001 10001 01110',
  9: '01110 10001 10001 01111 00001 00010 01100',
  ',': '00000 00000 00000 00000 01100 00100 01000',
  '.': '00000 00000 00000 00000 00000 01100 01100',
  '-': '00000 00000 00000 01110 00000 00000 00000',
  "'": '00100 00100 01000 00000 00000 00000 00000',
  '&': '01100 10010 10100 01000 10101 10010 01101',
  '(': '00010 00100 01000 01000 01000 00100 00010',
  ')': '01000 00100 00010 00010 00010 00100 01000',
  '/': '00000 00001 00010 00100 01000 10000 00000',
  '·': '00000 00000 00000 00100 00000 00000 00000',
};
/** Ink cells of each glyph as [column, row] pairs. */
const INK = Object.fromEntries(
  Object.entries(GLYPHS).map(([ch, rows]) => [
    ch,
    rows.split(' ').flatMap((row, y) => [...row].flatMap((bit, x) => (bit === '1' ? [[x, y]] : []))),
  ]),
);
const SPACE_CELLS = 3; // a word space is 3 cells wide, plus the 1-cell gap after it

/**
 * Text as the caps can draw it: NFKD with the combining marks stripped ("Zürich" -> ZURICH),
 * uppercase, everything the font has no glyph for dropped, runs of spaces collapsed.
 */
export function drawable(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .split('')
    .filter((ch) => ch === ' ' || INK[ch])
    .join('')
    .replace(/ +/g, ' ')
    .trim();
}

/** Width in px of drawable `text` at scale `s`: 6s per glyph, 4s per space, less the last gap. */
function textWidth(text, s) {
  if (!text) return 0;
  let w = 0;
  for (const ch of text) w += (ch === ' ' ? SPACE_CELLS + 1 : 6) * s;
  return w - s;
}

// Pixel buffer --------------------------------------------------------------------------

function set(buf, x, y, c) {
  if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) buf[y * ROW + 1 + x] = c;
}

function fillRect(buf, x, y, w, h, c) {
  const x0 = Math.max(0, x);
  const x1 = Math.min(WIDTH, x + w);
  for (let j = Math.max(0, y); j < Math.min(HEIGHT, y + h); j++) buf.fill(c, j * ROW + 1 + x0, j * ROW + 1 + x1);
}

function drawText(buf, text, x, y, s, c) {
  let cx = x;
  for (const ch of text) {
    if (ch === ' ') {
      cx += (SPACE_CELLS + 1) * s;
      continue;
    }
    for (const [gx, gy] of INK[ch]) fillRect(buf, cx + gx * s, y + gy * s, s, s, c);
    cx += 6 * s;
  }
}

/** Bresenham between two integer pixels. */
function line(buf, x0, y0, x1, y1, c) {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    set(buf, x0, y0, c);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** A flat mark: the disc to `r` in `c` and the 1px black hairline from `r` to `r + 1` (pixel centres). */
function mark(buf, x, y, r, c) {
  const out = (r + 1) * (r + 1);
  const r2 = r * r;
  for (let j = Math.floor(y - r - 1); j <= Math.ceil(y + r + 1); j++) {
    const dy = j + 0.5 - y;
    for (let i = Math.floor(x - r - 1); i <= Math.ceil(x + r + 1); i++) {
      const dx = i + 0.5 - x;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2) set(buf, i, j, c);
      else if (d2 <= out) set(buf, i, j, BLACK);
    }
  }
}

// The reticle: the map's hollow ring scaled to a share card, 11px inside, a 2px line, four
// 5px ticks pointing out. Over dense marks a white ring among white dots does not read, so the
// reticle and the place's own mark sit alone on a black disc reaching 2px past the ticks.
const RING_IN = 11;
const RING_OUT = 13;
const TICK = 5;
const HALO = 2;
const RETICLE_REACH = RING_OUT + TICK + HALO;

/** The ring from `inner` to `outer` (0 inner: a disc) and the four ticks `half` either side of the axes. */
function ringAndTicks(buf, x, y, inner, outer, half, to, c) {
  const lo = inner > 0 ? inner * inner : -1;
  const hi = outer * outer;
  const from = RING_OUT - 1;
  const reach = Math.max(outer, to) + 1;
  for (let j = Math.floor(y - reach); j <= Math.ceil(y + reach); j++) {
    const dy = j + 0.5 - y;
    for (let i = Math.floor(x - reach); i <= Math.ceil(x + reach); i++) {
      const dx = i + 0.5 - x;
      const d2 = dx * dx + dy * dy;
      // Ticks: the pixels whose centres lie within `half` of an axis, from the ring out to `to`.
      const vertical = dx >= -half && dx < half && Math.abs(dy) >= from && Math.abs(dy) < to;
      const horizontal = dy >= -half && dy < half && Math.abs(dx) >= from && Math.abs(dx) < to;
      if ((d2 > lo && d2 <= hi) || vertical || horizontal) set(buf, i, j, c);
    }
  }
}

/** The page's own mark `m` on top, ringed. */
function reticle(buf, m) {
  ringAndTicks(buf, m.x, m.y, 0, RETICLE_REACH, 0, 0, BLACK);
  mark(buf, m.x, m.y, m.r, m.c);
  ringAndTicks(buf, m.x, m.y, RING_IN, RING_OUT, 1, RING_OUT + TICK, WHITE);
}

// The world -------------------------------------------------------------------------------

/**
 * The world box (LAT_NORTH..LAT_SOUTH) contained in the card, centred: it is taller than
 * 630/1200 at full width (0.668 of its width), so it fills the height and leaves equal
 * margins at the sides, as the map's own contain-fit does in a landscape window.
 */
const TOP = mercY(LAT_NORTH);
const SPAN = mercY(LAT_SOUTH) - TOP;
const SCALE = Math.min(WIDTH, HEIGHT / SPAN);
const OX = (WIDTH - SCALE) / 2;
const OY = (HEIGHT - SCALE * SPAN) / 2 - SCALE * TOP;
const MAX_LAT = 85.0511;
const px = (lon) => OX + mercX(lon) * SCALE;
const py = (lat) => OY + mercY(Math.max(-MAX_LAT, Math.min(MAX_LAT, lat))) * SCALE;

/** Every Polygon / MultiPolygon ring of a GeoJSON FeatureCollection. */
function rings(geo) {
  const out = [];
  for (const f of Array.isArray(geo?.features) ? geo.features : []) {
    const g = f?.geometry;
    if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) for (const ring of Array.isArray(poly) ? poly : []) if (Array.isArray(ring)) out.push(ring);
  }
  return out;
}

const markOf = (c, maxN) => {
  const step = markStep(heatWeight({ n: c.n }, maxN, 'articles'));
  return { x: px(c.lon), y: py(c.lat), r: MARK_RADIUS[step] * MARK_K, c: STEP_INDEX[step] };
};
const usable = (c) => c && Number.isFinite(c.lat) && Number.isFinite(c.lon) && Number.isFinite(c.n);

/** The picture every card shares: grid, outlines under the marks, every mark largest last. */
function basePicture(heat, geo) {
  const buf = Buffer.alloc(HEIGHT * ROW); // filter bytes and background are 0 (black)
  for (let y = 0; y < HEIGHT; y += 8) for (let x = 0; x < WIDTH; x += 8) set(buf, x, y, GRID);
  for (const ring of rings(geo)) {
    let prev = null;
    for (const pt of ring) {
      if (!Array.isArray(pt) || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) continue;
      const p = [Math.floor(px(pt[0])), Math.floor(py(pt[1]))];
      // A segment longer than half the world crosses the antimeridian: not drawn.
      if (prev && Math.abs(p[0] - prev[0]) < SCALE / 2) line(buf, prev[0], prev[1], p[0], p[1], RULE);
      prev = p;
    }
  }
  const cells = (Array.isArray(heat?.cells) ? heat.cells : []).filter(usable);
  const maxN = Math.max(1, ...cells.map((c) => c.n));
  const order = [...cells].sort((a, b) => a.n - b.n || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const c of order) {
    const m = markOf(c, maxN);
    mark(buf, m.x, m.y, m.r, m.c);
  }
  return { buf, maxN };
}


// PNG --------------------------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; ) {
    const end = Math.min(bytes.length, i + 5552); // the most bytes before b can overflow
    for (; i < end; i++) {
      a += bytes[i];
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function ihdr() {
  const d = Buffer.alloc(13);
  d.writeUInt32BE(WIDTH, 0);
  d.writeUInt32BE(HEIGHT, 4);
  d[8] = 8; // bit depth
  d[9] = 3; // colour type: indexed
  return d; // compression, filter and interlace 0
}
const IHDR = chunk('IHDR', ihdr());
const PLTE_CHUNK = chunk('PLTE', PLTE);
const IEND = chunk('IEND', Buffer.alloc(0));

// The zlib stream is deflated in bands of BAND rows, each ended by a full flush so it stands on
// its own: a card's band that matches the shared picture's reuses that band's bytes (deflated
// once, at level 9), and only the bands its own reticle and name block touch are deflated
// again, at level 6. Measured on the 2026-10-22 snapshot: one level-9 deflate of a whole card
// costs ~150 ms; level 9 on the changed bands too makes the cards 2% smaller and 3x slower.
const BAND = 32;
const SHARED_LEVEL = { level: 9, finishFlush: zlibConstants.Z_FULL_FLUSH };
const OWN_LEVEL = { level: 6, finishFlush: zlibConstants.Z_FULL_FLUSH };
const ZLIB_HEAD = Buffer.from([0x78, 0xda]); // deflate, 32K window, maximum compression
const FINAL = deflateRawSync(Buffer.alloc(0)); // an empty final block
const bandsOf = (buf) => Array.from({ length: Math.ceil(HEIGHT / BAND) }, (_, i) => buf.subarray(i * BAND * ROW, Math.min(HEIGHT, (i + 1) * BAND) * ROW));
const deflateRawAsync = promisify(deflateRaw);

function idat(buf, parts) {
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(adler32(buf), 0);
  return Buffer.concat([ZLIB_HEAD, ...parts, FINAL, sum]);
}
const png = (data) => Buffer.concat([SIGNATURE, IHDR, PLTE_CHUNK, chunk('IDAT', data), IEND]);

// The card ---------------------------------------------------------------------------------

const WORD = 'TODAY ON EARTH';
const WORD_BLOCK = { x: MARGIN, y: MARGIN, w: textWidth(WORD, 3) + 24, h: 7 * 3 + 24 };
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const wordmark = (buf, x) => {
  fillRect(buf, x, WORD_BLOCK.y, WORD_BLOCK.w, WORD_BLOCK.h, BLACK);
  drawText(buf, WORD, x + 12, WORD_BLOCK.y + 12, 3, WHITE);
};

/**
 * What every card starts from, drawn once per (heat, geo): `map` (grid, outlines, marks),
 * `shared` (the map with the wordmark top-left) and the shared picture's bands, raw and deflated.
 */
let cache = null;
function base(heat, geo) {
  if (cache && cache.heat === heat && cache.geo === geo) return cache;
  const { buf: map, maxN } = basePicture(heat, geo);
  const shared = Buffer.from(map);
  wordmark(shared, WORD_BLOCK.x);
  const raw = bandsOf(shared);
  cache = { heat, geo, map, shared, maxN, raw, deflated: raw.map((band) => deflateRawSync(band, SHARED_LEVEL)) };
  return cache;
}

/** The scanlines (filter byte + indices) of one place's card, and the shared picture it came from. */
function picture({ heat, cell, geo, names, counts }) {
  const b = base(heat, geo);
  const buf = Buffer.from(b.shared);
  const own = usable(cell) ? markOf(cell, b.maxN) : null;
  const ring = own ? { x: own.x - RETICLE_REACH, y: own.y - RETICLE_REACH, w: 2 * RETICLE_REACH, h: 2 * RETICLE_REACH } : null;

  // The wordmark moves top-right when the reticle would sit under it.
  if (ring && overlaps(ring, WORD_BLOCK)) {
    for (let y = WORD_BLOCK.y; y < WORD_BLOCK.y + WORD_BLOCK.h; y++) {
      const at = y * ROW + 1 + WORD_BLOCK.x;
      b.map.copy(buf, at, at, at + WORD_BLOCK.w);
    }
    wordmark(buf, WIDTH - MARGIN - WORD_BLOCK.w);
  }
  if (own) reticle(buf, own);

  // Name and counts bottom-left (bottom-right when the reticle would sit under it).
  const maxW = WIDTH - 2 * MARGIN - 32;
  let name = names.map(drawable).find((t) => /[A-Z0-9]/.test(t)) ?? '';
  let s = 6;
  while (s > 4 && textWidth(name, s) > maxW) s--;
  while (name && textWidth(name, s) > maxW) name = name.slice(0, -1).trimEnd();
  let line2 = drawable(counts);
  while (line2 && textWidth(line2, 3) > maxW) line2 = line2.slice(0, -1).trimEnd();
  const h = 16 + 7 * s + (line2 ? 12 + 21 : 0) + 16;
  const w = Math.max(textWidth(name, s), textWidth(line2, 3)) + 32;
  const block = { x: MARGIN, y: HEIGHT - MARGIN - h, w, h };
  if (ring && overlaps(ring, block)) block.x = WIDTH - MARGIN - w;
  fillRect(buf, block.x, block.y, block.w, block.h, BLACK);
  drawText(buf, name, block.x + 16, block.y + 16, s, WHITE);
  if (line2) drawText(buf, line2, block.x + 16, block.y + 16 + 7 * s + 12, 3, MUTED);
  return { buf, b };
}

/**
 * One place's share card as PNG bytes. `heat`: the snapshot (its cells are every mark);
 * `cell`: the place's heat.json row ({ id, lat, lon, n }); `geo`: the country outlines
 * (GeoJSON); `names`: the name candidates in order (short name, full name, cell id), the
 * first with a letter or digit after `drawable` is drawn; `counts`: "412 articles · ...".
 * Resolves to the same bytes for the same arguments; the changed bands are deflated on libuv's
 * thread pool, so several cards can be in flight at once.
 */
export async function sharePng(args) {
  const { buf, b } = picture(args);
  const parts = await Promise.all(bandsOf(buf).map((band, i) => (band.equals(b.raw[i]) ? b.deflated[i] : deflateRawAsync(band, OWN_LEVEL))));
  return png(idat(buf, parts));
}
