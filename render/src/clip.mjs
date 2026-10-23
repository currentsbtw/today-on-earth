// Daily time-lapse clip: one screenshot per replay frame of the live site's clip.html, then
// one card per filled broadcast slot and an end card (clip.html?end=1), encoded to an H.264
// mp4 with ffmpeg. Each card is flown into: clip.html?signal=<id>&from=<ref>&fly=<F> is
// loaded once and stepped in-page (window.__clipStep(i), one screenshot per step i = 1..F,
// the last step being the card), starting from the last time-lapse frame's camera
// (from=t:<stamp>) or the previous card's (from=s:<slot>). `--fly 0` cuts to each card
// (clip.html?signal=<id>) as v1 did.
//
//   npm run clip -- --site <base url> --out <dir> --w 1080 --h 1920 --fps 8 --card 3 --end 3 --hold 1 --fly 1.5
//
// Uses a system browser through playwright-core (no browser download): Chrome on Linux
// (GitHub's ubuntu runners ship it), Edge on Windows. `--channel` overrides.
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import {
  availableSlots,
  captureCards,
  cardMoves,
  captureFrames,
  clipDate,
  endUrl,
  ffmpegArgs,
  frameName,
  frameUrl,
  MAX_BAD_SHARE,
  maxCellN,
  parseArgs,
  planCards,
  signalUrl,
  stillListed,
} from "./lib.mjs";

const READY_TIMEOUT_MS = 60_000;
const log = (msg) => process.stderr.write(`${msg}\n`);

async function fetchIndex(site) {
  const url = `${site}/data/history/index.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  const index = await res.json();
  if (!index || !Array.isArray(index.frames) || index.frames.length === 0) throw new Error(`${url} has no frames`);
  return index.frames.map((f) => f.at).filter((at) => typeof at === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(at));
}

/** `ats` without the frames a deploy since the start has dropped from the index; unchanged if the re-read fails. */
async function refreshFrames(site, ats) {
  try {
    const kept = stillListed(ats, await fetchIndex(site));
    if (kept.length < ats.length) log(`clip: ${ats.length - kept.length} frame(s) left the index since the start (a snapshot deploy landed); shooting ${kept.length}`);
    return kept;
  } catch (err) {
    log(`clip: could not re-read the index (${err.message}); shooting all ${ats.length} frames`);
    return ats;
  }
}

async function fetchMaxN(site) {
  const url = `${site}/data/heat.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  return maxCellN(await res.json());
}

/** Filled broadcast slot ids, or none (logged) when broadcast.json is missing or unreadable. */
async function fetchSlots(site) {
  const url = `${site}/data/broadcast.json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return availableSlots(await res.json());
  } catch (err) {
    log(`clip: no broadcast cards (${url}: ${err.message})`);
    return [];
  }
}

/** Navigate and wait until the page says the frame is drawn. Throws on timeout or a page-reported error. */
async function loadFrame(page, opts, at, max) {
  if (opts.page === "index") {
    // Development stand-in for clip.html: the scrubber exists once the history is loaded.
    const url = frameUrl(opts, at, max);
    const res = await page.goto(url, { waitUntil: "load", timeout: READY_TIMEOUT_MS });
    if (res && res.status() >= 400) throw new Error(`${url} returned HTTP ${res.status()}`);
    await page.waitForSelector("input[type=range]", { timeout: READY_TIMEOUT_MS });
    await page.waitForTimeout(1500);
    return;
  }
  await loadClipPage(page, frameUrl(opts, at, max));
}

/** Open one clip.html URL and wait for data-ready; a page-reported data-error throws. */
async function loadClipPage(page, url) {
  const res = await page.goto(url, { waitUntil: "load", timeout: READY_TIMEOUT_MS });
  if (res && res.status() >= 400) throw new Error(`${url} returned HTTP ${res.status()}`);
  await page.waitForSelector('body[data-ready="1"]', { state: "attached", timeout: READY_TIMEOUT_MS });
  const error = await page.evaluate(() => document.body.dataset.error ?? "");
  if (error) throw new Error(`clip.html reported: ${error}`);
}

function findFfmpeg() {
  const probe = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  return probe.status === 0 ? "ffmpeg" : null;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const outDir = resolve(opts.out);
  const framesDir = join(outDir, "frames");
  // Cards are shot first (see below) into their own directory, then moved after the frames.
  const cardsDir = join(outDir, "cards");
  await rm(framesDir, { recursive: true, force: true });
  await rm(cardsDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });
  await mkdir(cardsDir, { recursive: true });

  let ats = await fetchIndex(opts.site);
  const max = await fetchMaxN(opts.site);
  // The index.html stand-in has no card modes.
  const slots = opts.page === "clip" ? await fetchSlots(opts.site) : [];
  log(`clip: ${ats.length} frames from ${opts.site} (${opts.page === "clip" ? "clip.html" : "index.html stand-in"}), ${opts.w}x${opts.h}, heat max ${max}, browser channel ${opts.channel}`);

  const browser = await chromium.launch({
    channel: opts.channel,
    headless: true,
    // Runners have no GPU: let MapLibre's WebGL fall back to SwiftShader.
    args: process.platform === "linux" ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] : [],
  });
  const started = Date.now();
  let result;
  let cardResult = { written: 0, cards: 0, skipped: 0 };
  try {
    const context = await browser.newContext({ viewport: { width: opts.w, height: opts.h }, deviceScaleFactor: 1, colorScheme: "dark" });
    const page = await context.newPage();
    const png = (n) => join(framesDir, frameName(n));
    const cardPng = (n) => join(cardsDir, frameName(n));
    // Cards first: they read the live broadcast.json and heat.json, so shooting them before
    // the minutes of time-lapse frames keeps them on the snapshot the clip was planned from
    // (a deploy landing mid-clip could otherwise empty a slot or change its numbers).
    if (opts.page === "clip") {
      const plan = planCards({ timelapse: ats.length, slots, fps: opts.fps, card: opts.card, end: opts.end, hold: opts.hold, fly: opts.fly, lastAt: ats.at(-1) });
      const flyFrames = plan.steps.find((s) => s.kind === "signal")?.fly ?? 0;
      log(`clip: ${slots.length} signal card(s) ${slots.length ? `(${slots.join(", ")}) ` : ""}${flyFrames ? `flown into over ${flyFrames} frames each ` : ""}and ${opts.end > 0 ? "an" : "no"} end card, captured first`);
      cardResult = await captureCards(plan.steps, 0, {
        load: (step) => loadClipPage(page, step.kind === "end" ? endUrl(opts, max) : signalUrl(opts, step.id, max, step.fly > 0 ? step : null)),
        // A step resolves true once drawn and rejects on failure (which retries the whole card).
        step: async (i) => {
          const done = await page.evaluate((n) => window.__clipStep(n), i);
          if (done !== true) throw new Error(`flight step ${i} did not finish`);
        },
        shoot: (n) => page.screenshot({ path: cardPng(n), type: "png" }),
        repeat: (from, to) => copyFile(cardPng(from), cardPng(to)),
        log,
      });
    }
    // The cards took about 40 s; drop any frame a deploy has since retired.
    ats = await refreshFrames(opts.site, ats);
    result = await captureFrames(ats, {
      load: (at) => loadFrame(page, opts, at, max),
      shoot: (n) => page.screenshot({ path: png(n), type: "png" }),
      repeat: (from, to) => copyFile(png(from), png(to)),
      log,
    });
    if (result.written > 0) {
      // Poster: the last good frame as JPEG (needs no ffmpeg). Re-open it if the page has
      // since moved on to a frame that failed.
      if (result.lastGood !== ats.at(-1)) await loadFrame(page, opts, result.lastGood, max);
      await page.screenshot({ path: join(outDir, "poster.jpg"), type: "jpeg", quality: 90 });
    }
    // The output order stays frames, cards, end card: the cards follow the frames actually
    // written (a bad first frame is skipped, so that can be fewer than ats.length).
    if (result.written > 0) {
      for (const [from, to] of cardMoves(cardResult.written, result.written)) await rename(cardPng(from), png(to));
    }
    await context.close();
  } finally {
    await browser.close();
  }
  await rm(cardsDir, { recursive: true, force: true });
  const { written, bad } = result;
  log(`clip: ${written} frames written, ${bad} of ${ats.length} bad, in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (cardResult.cards || cardResult.skipped) log(`clip: ${cardResult.cards} card(s) placed after the frames (${cardResult.written} frames), ${cardResult.skipped} skipped`);
  const total = written + (written > 0 ? cardResult.written : 0);
  if (written === 0 || bad > MAX_BAD_SHARE * ats.length) {
    throw new Error(`${bad} of ${ats.length} frames failed (more than ${MAX_BAD_SHARE * 100}% allowed); not encoding`);
  }

  const output = join(outDir, `clip-${clipDate(ats)}.mp4`);
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) {
    log("clip: ffmpeg not found on PATH; skipped the encode (frames and poster.jpg are written)");
    return 0;
  }
  const args = ffmpegArgs({ framesPattern: join(framesDir, "%04d.png"), fps: opts.fps, hold: opts.hold, output });
  const t0 = Date.now();
  const run = spawnSync(ffmpeg, args, { stdio: ["ignore", "inherit", "inherit"] });
  if (run.status !== 0) throw new Error(`ffmpeg exited with ${run.status}`);
  log(`clip: wrote ${output} in ${((Date.now() - t0) / 1000).toFixed(1)}s (${total} frames at ${opts.fps} fps + ${opts.hold}s hold, ${(total / opts.fps + opts.hold).toFixed(1)}s)`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    log(`clip: failed: ${err.stack ?? err}`);
    process.exit(1);
  },
);
