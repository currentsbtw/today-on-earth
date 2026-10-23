// Pure helpers for the clip renderer (kept separate so they can be unit-tested): options,
// the timeline URL, the check of the page's plan, the frame loop and the ffmpeg arguments.

/** @typedef {{ site: string, out: string, w: number, h: number, fps: number, hook: number, fly: number, lapse: number, card: number, end: number, hold: number, slots: number, music: string, channel: string }} Options */

const DEFAULTS = { w: 1080, h: 1920, fps: 30, hook: 2, fly: 1.5, lapse: 7, card: 5, end: 3, hold: 1, slots: 3, music: "generated" };

/** clip.html draws a flight of at most this many frames. */
export const MAX_FLY_FRAMES = 60;

/** Frames for `seconds` at `fps`: at least one when above 0, none at 0. */
export const framesFor = (seconds, fps) => (seconds > 0 ? Math.max(1, Math.round(seconds * fps)) : 0);

/**
 * Parse `--site <url> --out <dir> --w 1080 --h 1920 --fps 30 --hook 2 --fly 1.5 --lapse 7
 * --card 5 --end 3 --hold 1 --slots 3 --music generated [--channel chrome|msedge]`.
 * The seconds are the timeline's parts, passed to clip.html, which plans the frames: the
 * hook, each flight, the time-lapse, each signal card and the end card; `--slots` is the most
 * signal cards; `--hold` holds the last frame on top (added by ffmpeg). `--music` is
 * `generated` (the soundtrack built from the plan), `none` (a silent clip) or the path of an
 * audio file to use instead (the renderer checks that it exists).
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
  const known = new Set(["site", "out", "w", "h", "fps", "hook", "fly", "lapse", "card", "end", "hold", "slots", "music", "channel"]);
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
  const fps = int("fps", 1, 60);
  const fly = num("fly", 0, 30);
  if (framesFor(fly, fps) > MAX_FLY_FRAMES) throw new Error(`--fly x --fps must give at most ${MAX_FLY_FRAMES} frames, got ${framesFor(fly, fps)}`);
  const music = raw.music ?? DEFAULTS.music;
  if (!music.trim()) throw new Error("--music must be generated, none or an audio file path");
  return {
    site: site.href.replace(/\/+$/, ""),
    out: raw.out,
    w,
    h,
    fps,
    hook: num("hook", 0, 30),
    fly,
    lapse: num("lapse", 1, 60),
    card: num("card", 0, 30),
    end: num("end", 0, 30),
    hold: num("hold", 0, 30),
    slots: int("slots", 0, 8),
    music,
    channel: raw.channel ?? (platform === "win32" ? "msedge" : "chrome"),
  };
}

/**
 * The one clip.html URL the renderer loads: the whole timeline, stepped in-page. `max` (the
 * live heat.json's largest cell n, fetched once) pins the heat scale.
 * @param {Options} opts
 */
export function timelineUrl(opts, max = 0) {
  const { site, w, h, fps, hook, fly, lapse, card, end, slots } = opts;
  return `${site}/clip.html?timeline=1&w=${w}&h=${h}&fps=${fps}&hook=${hook}&fly=${fly}&lapse=${lapse}&card=${card}&end=${end}&slots=${slots}${max > 0 ? `&max=${max}` : ""}`;
}

/** Largest cell `n` in a heat.json body, 0 when there are no cells. */
export function maxCellN(heat) {
  const cells = Array.isArray(heat?.cells) ? heat.cells : [];
  return cells.reduce((m, c) => (Number.isInteger(c?.n) && c.n > m ? c.n : m), 0);
}

const SEGMENT_KINDS = new Set(["hook", "pullback", "lapse", "flight", "card", "end"]);

/**
 * Check the plan clip.html's `window.__clipPlan()` returned, and return it: `fps` as asked,
 * `frames` a positive integer, `date` a YYYY-MM-DD day, `poster` a frame index, `segments`
 * contiguous from frame 0 with known kinds and summing to `frames` (exactly one `lapse`), and
 * `hourMarks` increasing frame indices of the whole clip that fall inside the lapse segment.
 * Anything else throws, so a page that drifted from the contract fails the clip.
 * @param {any} plan
 * @param {number} fps
 */
export function checkPlan(plan, fps) {
  const fail = (why) => {
    throw new Error(`clip.html plan: ${why}`);
  };
  if (!plan || typeof plan !== "object") fail("not an object");
  if (plan.fps !== fps) fail(`fps ${plan.fps}, asked ${fps}`);
  if (!Number.isInteger(plan.frames) || plan.frames < 1) fail(`frames ${plan.frames}`);
  if (typeof plan.date !== "string" || !/^\d{4}-\d\d-\d\d$/.test(plan.date)) fail(`date ${JSON.stringify(plan.date)}`);
  if (!Number.isInteger(plan.poster) || plan.poster < 0 || plan.poster >= plan.frames) fail(`poster ${plan.poster} outside 0..${plan.frames - 1}`);
  if (!plan.lapse || typeof plan.lapse !== "object") fail("no lapse");
  if (!Array.isArray(plan.segments) || plan.segments.length === 0) fail("no segments");
  let next = 0;
  for (const s of plan.segments) {
    if (!SEGMENT_KINDS.has(s?.kind)) fail(`unknown segment kind ${JSON.stringify(s?.kind)}`);
    if (s.start !== next) fail(`segment ${s.kind} starts at ${s.start}, expected ${next}`);
    if (!Number.isInteger(s.frames) || s.frames < 1) fail(`segment ${s.kind} has ${s.frames} frames`);
    next += s.frames;
  }
  if (next !== plan.frames) fail(`segments sum to ${next}, frames is ${plan.frames}`);
  const lapses = plan.segments.filter((s) => s.kind === "lapse");
  if (lapses.length !== 1) fail(`${lapses.length} lapse segments`);
  const [lapse] = lapses;
  if (!Array.isArray(plan.hourMarks)) fail("no hourMarks");
  plan.hourMarks.forEach((m, k) => {
    if (!Number.isInteger(m) || m < lapse.start || m >= lapse.start + lapse.frames) fail(`hour mark ${m} outside the lapse (frames ${lapse.start}..${lapse.start + lapse.frames - 1})`);
    if (k > 0 && m <= plan.hourMarks[k - 1]) fail("hourMarks not increasing");
  });
  return plan;
}

/** "hook 60 · pullback 45 · lapse 210 · flight 45 · card 150 · …" */
export const describeSegments = (segments) => segments.map((s) => `${s.kind} ${s.frames}`).join(" · ");

/** A clip fails when more than 10% of its frames could not be rendered. */
export const MAX_BAD_SHARE = 0.1;

/**
 * Step and shoot every frame of the plan in order: `io.step(i)` draws frame i, `io.shoot(n)`
 * writes file n (numbered contiguously from 1). A frame is tried twice (the page redraws the
 * same frame on a retry); if both fail, the previous file is copied in its place (or, with
 * nothing before it, the frame is skipped) and counted bad, and once more than MAX_BAD_SHARE
 * of the frames are bad the clip fails without going on. `io.poster()` is called right after
 * the first good frame at or after `poster` (normally that frame). Progress is logged every
 * `every` frames and on each failure, not per frame.
 * @param {{ frames: number, poster: number }} plan
 * @param {{ step: (i: number) => Promise<void>, shoot: (n: number) => Promise<void>, repeat: (from: number, to: number) => Promise<void>,
 *           poster: () => Promise<void>, log: (msg: string) => void }} io
 * @returns {Promise<{ written: number, bad: number, posterAt: number }>} posterAt is -1 when no poster was saved
 */
export async function captureTimeline({ frames, poster }, io, every = 30) {
  const t0 = Date.now();
  let written = 0;
  let bad = 0;
  let posterAt = -1;
  for (let i = 0; i < frames; i++) {
    const name = `frame ${i + 1}/${frames} (step ${i})`;
    let ok = false;
    for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
      try {
        await io.step(i);
        await io.shoot(written + 1);
        ok = true;
      } catch (err) {
        // Playwright puts the page's stack in the message; the first line says what failed.
        io.log(`  ${name}: attempt ${attempt} failed: ${String(err.message).split("\n")[0]}`);
      }
    }
    if (ok) {
      written++;
      if (posterAt < 0 && i >= poster) {
        await io.poster();
        posterAt = i;
        if (i !== poster) io.log(`  poster: frame ${poster} was bad, used frame ${i}`);
      }
    } else {
      bad++;
      if (written > 0) {
        await io.repeat(written, written + 1);
        written++;
        io.log(`  ${name}: BAD, repeated the previous frame`);
      } else {
        io.log(`  ${name}: BAD, skipped (no earlier frame to repeat)`);
      }
      if (bad > MAX_BAD_SHARE * frames) throw new Error(`${bad} of ${frames} frames failed (more than ${MAX_BAD_SHARE * 100}% allowed); not encoding`);
    }
    if ((i + 1) % every === 0 || i + 1 === frames) io.log(`  ${i + 1}/${frames} frames, ${bad} bad, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  return { written, bad, posterAt };
}

/**
 * ffmpeg arguments: PNG sequence -> H.264 yuv420p mp4 at `fps`, the last frame held `hold`
 * seconds (tpad), faststart, with the audio track `audio`: `{ kind: "none" }`, `{ kind: "wav",
 * path }` (the generated soundtrack, already the clip's length) or `{ kind: "music", path }`
 * (any audio file, looped, and faded out over the last 1.5 s of the `seconds`-long clip).
 * AAC at 128k; `-shortest` stops a looped track with the video.
 * @param {{ framesPattern: string, fps: number, hold: number, output: string, seconds: number, audio: { kind: "none" | "wav" | "music", path?: string } }} p
 */
export function ffmpegArgs({ framesPattern, fps, hold, output, seconds, audio }) {
  const sound = audio.kind !== "none";
  const music = audio.kind === "music";
  const fadeAt = Math.max(0, Math.round((seconds - 1.5) * 1000) / 1000);
  return [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-framerate", String(fps),
    "-i", framesPattern,
    ...(music ? ["-stream_loop", "-1"] : []),
    ...(sound ? ["-i", audio.path] : []),
    ...(hold > 0 ? ["-vf", `tpad=stop_mode=clone:stop_duration=${hold}`] : []),
    ...(music ? ["-af", `afade=t=out:st=${fadeAt}:d=1.5`] : []),
    // Explicit maps: a music file's cover art must not become the video stream.
    "-map", "0:v:0",
    ...(sound ? ["-map", "1:a:0"] : []),
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-r", String(fps),
    ...(sound ? ["-c:a", "aac", "-b:a", "128k", "-shortest"] : []),
    "-movflags", "+faststart",
    output,
  ];
}

/** Zero-padded frame file name, 1-based: 1 -> "0001.png". */
export const frameName = (i) => `${String(i).padStart(4, "0")}.png`;
