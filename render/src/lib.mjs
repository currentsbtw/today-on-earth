// Pure helpers for the clip renderer (kept separate so they can be unit-tested).

/** @typedef {{ site: string, out: string, w: number, h: number, fps: number, hold: number, card: number, end: number, fly: number, channel: string, page: string }} Options */

const DEFAULTS = { w: 1080, h: 1920, fps: 8, hold: 2, card: 3, end: 3, fly: 1.5, page: "clip" };

/** clip.html draws a flight of at most this many stills. */
export const MAX_FLY_FRAMES = 60;

/** Frames for `seconds` at `fps`: at least one when above 0, none at 0. */
export const framesFor = (seconds, fps) => (seconds > 0 ? Math.max(1, Math.round(seconds * fps)) : 0);

/**
 * Parse `--site <url> --out <dir> --w 1080 --h 1920 --fps 8 --card 3 --end 3 --hold 2 --fly 1.5 [--channel chrome|msedge] [--page clip|index]`.
 * `--card` and `--end` are seconds per broadcast signal card and for the end card (0 leaves
 * them out); `--hold` holds the last frame (the end card, if any) on top. `--fly` is the
 * seconds of the flight into each signal card (0: the card cuts in, as in v1).
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
  const known = new Set(["site", "out", "w", "h", "fps", "hold", "card", "end", "fly", "channel", "page"]);
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
  const fps = int("fps", 1, 60);
  const fly = num("fly", 0, 30);
  if (framesFor(fly, fps) > MAX_FLY_FRAMES) throw new Error(`--fly x --fps must give at most ${MAX_FLY_FRAMES} frames, got ${framesFor(fly, fps)}`);
  return {
    site: site.href.replace(/\/+$/, ""),
    out: raw.out,
    w,
    h,
    fps,
    hold: num("hold", 0, 30),
    card: num("card", 0, 30),
    end: num("end", 0, 30),
    fly,
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

/**
 * clip.html URL of one broadcast slot's card, at the time-lapse's heat scale. With `flight`
 * ({ from, fly }, fly > 0) it is the flight into that card: `from` is `t:<frame stamp>` or
 * `s:<slot id>`, `fly` the number of flight stills.
 */
export function signalUrl(opts, slotId, max = 0, flight = null) {
  const fly = flight && flight.fly > 0 ? `&from=${encodeURIComponent(flight.from)}&fly=${flight.fly}` : "";
  return `${opts.site}/clip.html?signal=${encodeURIComponent(slotId)}${fly}&w=${opts.w}&h=${opts.h}${max > 0 ? `&max=${max}` : ""}`;
}

/**
 * Where a flight starts: the card of the last slot actually rendered, or the last time-lapse
 * frame (`t:<its stamp>`) when none was.
 * @param {string} lastAt the last time-lapse frame's ISO time
 * @param {string | null} lastSlot the last slot rendered, if any
 */
export const flightFrom = (lastAt, lastSlot) => (lastSlot ? `s:${lastSlot}` : `t:${stampOf(lastAt)}`);

/** clip.html URL of the end card. */
export function endUrl(opts, max = 0) {
  return `${opts.site}/clip.html?end=1&w=${opts.w}&h=${opts.h}${max > 0 ? `&max=${max}` : ""}`;
}

/**
 * Ids of the broadcast.json slots that are filled, in the file's order. Anything malformed
 * (an old deploy, a partial file) yields no cards rather than a bad URL.
 * @returns {string[]}
 */
export function availableSlots(broadcast) {
  const slots = Array.isArray(broadcast?.slots) ? broadcast.slots : [];
  return slots.filter((s) => s?.available === true && typeof s.id === "string" && /^[a-z]+$/.test(s.id)).map((s) => s.id);
}

/**
 * What follows the time-lapse: one card per filled slot held `card` seconds, each flown into
 * over `fly` seconds (that many flight stills, the last of them the card, then `card` seconds
 * of copies of it), then the end card held `end` seconds (each at least one frame when its
 * seconds are above 0, none at 0), and `hold` seconds of the last frame added by ffmpeg. The
 * first flight starts from the last time-lapse frame (`lastAt`), each later one from the
 * card before it (captureCards re-chains past a card that fails).
 * @param {{ timelapse: number, slots: string[], fps: number, card: number, end: number, hold: number, fly?: number, lastAt?: string }} p
 * @returns {{ steps: { kind: "signal" | "end", id: string, frames: number, fly: number, from: string }[], frames: number, seconds: number }}
 */
export function planCards({ timelapse, slots, fps, card, end, hold, fly = 0, lastAt = "" }) {
  const steps = [];
  const cardFrames = framesFor(card, fps);
  const flyFrames = cardFrames > 0 ? framesFor(fly, fps) : 0;
  if (flyFrames > 0 && slots.length > 0 && !lastAt) throw new Error("planCards: flights need lastAt (the last time-lapse frame)");
  if (cardFrames > 0) {
    slots.forEach((id, i) =>
      steps.push({ kind: "signal", id, frames: flyFrames + cardFrames, fly: flyFrames, from: flyFrames ? flightFrom(lastAt, i ? slots[i - 1] : null) : "" }),
    );
  }
  if (framesFor(end, fps) > 0) steps.push({ kind: "end", id: "end", frames: framesFor(end, fps), fly: 0, from: "" });
  const frames = timelapse + steps.reduce((sum, s) => sum + s.frames, 0);
  return { steps, frames, seconds: frames / fps + hold };
}

/**
 * Capture the cards, numbered on from `written` (the renderer passes 0 and shoots them before
 * the time-lapse, then moves them after it with cardMoves). A signal step with `fly` > 0 is a
 * flight: one load (the page opens on step 0), then `io.step(i)` and a screenshot for each
 * i = 1..fly; the last flight still is the card. A card or flight (load, steps, screenshots)
 * is tried twice; if both fail it is left out (logged), never failing the clip, and the next
 * flight starts from the last card actually rendered (or from the time-lapse when none was).
 * A good card is copied for the rest of its frames; numbering stays contiguous.
 * @param {{ kind: string, id: string, frames: number, fly?: number, from?: string }[]} steps
 * @param {number} written frames already on disk
 * @param {{ load: (step: { kind: string, id: string, fly: number, from: string }) => Promise<void>, step?: (i: number) => Promise<void>,
 *           shoot: (index: number) => Promise<void>, repeat: (fromIndex: number, toIndex: number) => Promise<void>, log: (msg: string) => void }} io
 * @returns {Promise<{ written: number, cards: number, skipped: number }>}
 */
export async function captureCards(steps, written, io) {
  let cards = 0;
  let skipped = 0;
  // Where the first flight starts (the last time-lapse frame), and the last slot drawn since.
  const origin = steps.find((s) => s.kind === "signal" && s.fly > 0)?.from ?? "";
  let lastSlot = null;
  for (const planned of steps) {
    const fly = planned.kind === "signal" ? (planned.fly ?? 0) : 0;
    const step = { ...planned, fly, from: fly > 0 ? (lastSlot ? `s:${lastSlot}` : origin) : "" };
    const name = step.kind === "end" ? "end card" : `card ${step.id}`;
    const first = written + 1;
    // The still that is the card: the last flight still, or the one shot of a cut.
    const cardAt = first + Math.max(0, fly - 1);
    let ok = false;
    for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
      try {
        await io.load(step);
        if (fly > 0) {
          for (let i = 1; i <= fly; i++) {
            await io.step(i);
            await io.shoot(first + i - 1);
          }
        } else {
          await io.shoot(first);
        }
        ok = true;
      } catch (err) {
        io.log(`  ${name}: attempt ${attempt} failed: ${err.message}`);
      }
    }
    if (!ok) {
      skipped++;
      io.log(`  ${name}: skipped`);
      continue;
    }
    written = cardAt;
    if (step.kind === "signal") lastSlot = step.id;
    try {
      while (written - first + 1 < step.frames) {
        await io.repeat(cardAt, written + 1);
        written++;
      }
    } catch (err) {
      io.log(`  ${name}: copying the card failed after ${written - first + 1} frames: ${err.message}`);
    }
    cards++;
    io.log(fly > 0 ? `  ${name}: ${fly} flight frames from ${step.from} + ${written - cardAt} card frames` : `  ${name}: ${written - first + 1} frames`);
  }
  return { written, cards, skipped };
}

/**
 * Where the cards, shot first and numbered 1..`cardFrames`, go in the output sequence: right
 * after the `timelapse` frames actually written. Pairs of [card file number, frame number].
 * @returns {[number, number][]}
 */
export function cardMoves(cardFrames, timelapse) {
  return Array.from({ length: cardFrames }, (_, i) => [i + 1, timelapse + i + 1]);
}

/** Largest cell `n` in a heat.json body, 0 when there are no cells. */
export function maxCellN(heat) {
  const cells = Array.isArray(heat?.cells) ? heat.cells : [];
  return cells.reduce((m, c) => (Number.isInteger(c?.n) && c.n > m ? c.n : m), 0);
}

/**
 * The planned frames the re-read index `listed` still has, in their order. A snapshot deploy
 * that lands while the cards are shot drops the oldest frame from the index (and its file
 * from the site), so clip.html would report it unknown. Frames added since are not taken:
 * the flights already start from the last planned frame. If none are still listed, `ats`
 * is returned unchanged and the frame loop reports the failures.
 * @param {string[]} ats
 * @param {string[]} listed
 */
export function stillListed(ats, listed) {
  const live = new Set(listed);
  const kept = ats.filter((at) => live.has(at));
  return kept.length ? kept : ats;
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
