// Pure helpers for the clip renderer (kept separate so they can be unit-tested).

/** @typedef {{ site: string, out: string, w: number, h: number, fps: number, hold: number, channel: string, page: string }} Options */

const DEFAULTS = { w: 1080, h: 1920, fps: 8, hold: 2, page: "clip" };

/**
 * Parse `--site <url> --out <dir> --w 1080 --h 1920 --fps 8 --hold 2 [--channel chrome|msedge] [--page clip|index]`.
 * `--page index` is a development stand-in: it drives `index.html#t=<stamp>` instead of clip.html.
 * @param {string[]} argv
 * @param {string} platform
 * @returns {Options}
 */
export function parseArgs(argv, platform = process.platform) {
  /** @type {Record<string, string>} */
  const raw = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`unexpected argument "${a}"`);
    const [key, inline] = a.slice(2).split("=", 2);
    const value = inline ?? argv[++i];
    if (value === undefined) throw new Error(`--${key} needs a value`);
    raw[key] = value;
  }
  const known = new Set(["site", "out", "w", "h", "fps", "hold", "channel", "page"]);
  for (const k of Object.keys(raw)) if (!known.has(k)) throw new Error(`unknown option --${k}`);
  if (!raw.site) throw new Error("--site <base url> is required");
  if (!raw.out) throw new Error("--out <dir> is required");
  let site;
  try {
    site = new URL(raw.site);
  } catch {
    throw new Error(`--site is not a URL: ${raw.site}`);
  }
  if (site.protocol !== "https:" && site.protocol !== "http:") throw new Error("--site must be http(s)");
  const int = (k, min, max) => {
    const v = raw[k] === undefined ? DEFAULTS[k] : Number(raw[k]);
    if (!Number.isInteger(v) || v < min || v > max) throw new Error(`--${k} must be an integer in [${min}, ${max}], got ${raw[k]}`);
    return v;
  };
  const num = (k, min, max) => {
    const v = raw[k] === undefined ? DEFAULTS[k] : Number(raw[k]);
    if (!Number.isFinite(v) || v < min || v > max) throw new Error(`--${k} must be a number in [${min}, ${max}], got ${raw[k]}`);
    return v;
  };
  const w = int("w", 320, 4096);
  const h = int("h", 320, 4096);
  if (w % 2 || h % 2) throw new Error("--w and --h must be even (H.264 with yuv420p)");
  const page = raw.page ?? DEFAULTS.page;
  if (page !== "clip" && page !== "index") throw new Error("--page must be clip or index");
  return {
    site: site.href.replace(/\/+$/, ""),
    out: raw.out,
    w,
    h,
    fps: int("fps", 1, 60),
    hold: num("hold", 0, 30),
    channel: raw.channel ?? (platform === "win32" ? "msedge" : "chrome"),
    page,
  };
}

/** "2026-10-21T04:47:14Z" -> "20261021T044714Z" (the contract's frame stamp / permalink `t`). */
export const stampOf = (at) => at.replace(/[-:.]/g, "");

/**
 * URL of one frame for the page being driven. `max` (the live heat.json's largest cell n,
 * fetched once per clip) pins the heat scale so it cannot jump when a deploy lands mid-clip.
 */
export function frameUrl(opts, at, max = 0) {
  const t = encodeURIComponent(stampOf(at));
  if (opts.page === "index") return `${opts.site}/index.html#t=${t}`;
  return `${opts.site}/clip.html?t=${t}&w=${opts.w}&h=${opts.h}${max > 0 ? `&max=${max}` : ""}`;
}

/** Largest cell `n` in a heat.json body, 0 when there are no cells. */
export function maxCellN(heat) {
  const cells = Array.isArray(heat?.cells) ? heat.cells : [];
  return cells.reduce((m, c) => (Number.isInteger(c?.n) && c.n > m ? c.n : m), 0);
}

/** A clip fails when more than 10% of its frames could not be rendered. */
export const MAX_BAD_SHARE = 0.1;

/**
 * Capture every frame. A frame is tried twice; if both fail, the previous good frame is
 * repeated in its place (or it is skipped when nothing good came before), so one bad frame
 * cannot abort the clip. Output files are numbered contiguously from 1 for ffmpeg.
 * @param {string[]} ats
 * @param {{ load: (at: string) => Promise<void>, shoot: (index: number) => Promise<void>,
 *           repeat: (fromIndex: number, toIndex: number) => Promise<void>, log: (msg: string) => void }} io
 * @returns {Promise<{ written: number, bad: number, lastGood: string }>}
 */
export async function captureFrames(ats, io) {
  let written = 0;
  let bad = 0;
  let lastGood = "";
  for (let i = 0; i < ats.length; i++) {
    const at = ats[i];
    const t0 = Date.now();
    let ok = false;
    for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
      try {
        await io.load(at);
        ok = true;
      } catch (err) {
        io.log(`  frame ${i + 1}/${ats.length} ${at}: attempt ${attempt} failed: ${err.message}`);
      }
    }
    if (ok) {
      await io.shoot(++written);
      lastGood = at;
      io.log(`  frame ${i + 1}/${ats.length} ${at}: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } else {
      bad++;
      if (written > 0) {
        await io.repeat(written, written + 1);
        written++;
        io.log(`  frame ${i + 1}/${ats.length} ${at}: BAD, repeated the previous frame`);
      } else {
        io.log(`  frame ${i + 1}/${ats.length} ${at}: BAD, skipped (no earlier frame to repeat)`);
      }
    }
  }
  return { written, bad, lastGood };
}

/**
 * Date the clip is named after: the UTC day of the midpoint between the first and last
 * frame. A run at 00:20 UTC covers ~00:15 yesterday to ~00:15 today, so the clip is named
 * after yesterday, the day it shows.
 * @param {string[]} ats ISO times, any order
 */
export function clipDate(ats) {
  if (!ats.length) throw new Error("no frames");
  const ms = ats.map((a) => Date.parse(a));
  const mid = (Math.min(...ms) + Math.max(...ms)) / 2;
  return new Date(mid).toISOString().slice(0, 10);
}

/** ffmpeg arguments: PNG sequence -> H.264 yuv420p mp4, last frame held `hold` seconds, faststart. */
export function ffmpegArgs({ framesPattern, fps, hold, output }) {
  const vf = hold > 0 ? [`tpad=stop_mode=clone:stop_duration=${hold}`] : [];
  return [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-framerate", String(fps),
    "-i", framesPattern,
    ...(vf.length ? ["-vf", vf.join(",")] : []),
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-r", String(fps),
    "-movflags", "+faststart",
    output,
  ];
}

/** Zero-padded frame file name, 1-based: 1 -> "0001.png". */
export const frameName = (i) => `${String(i).padStart(4, "0")}.png`;
