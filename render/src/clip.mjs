// Daily time-lapse clip: one screenshot per replay frame of the live site's clip.html,
// encoded to an H.264 mp4 with ffmpeg.
//
//   npm run clip -- --site <base url> --out <dir> --w 1080 --h 1920 --fps 8 --hold 2
//
// Uses a system browser through playwright-core (no browser download): Chrome on Linux
// (GitHub's ubuntu runners ship it), Edge on Windows. `--channel` overrides.
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { captureFrames, clipDate, ffmpegArgs, frameName, frameUrl, MAX_BAD_SHARE, maxCellN, parseArgs } from "./lib.mjs";

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

async function fetchMaxN(site) {
  const url = `${site}/data/heat.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  return maxCellN(await res.json());
}

/** Navigate and wait until the page says the frame is drawn. Throws on timeout or a page-reported error. */
async function loadFrame(page, opts, at, max) {
  const url = frameUrl(opts, at, max);
  const res = await page.goto(url, { waitUntil: "load", timeout: READY_TIMEOUT_MS });
  if (res && res.status() >= 400) throw new Error(`${url} returned HTTP ${res.status()}`);
  if (opts.page === "index") {
    // Development stand-in for clip.html: the scrubber exists once the history is loaded.
    await page.waitForSelector("input[type=range]", { timeout: READY_TIMEOUT_MS });
    await page.waitForTimeout(1500);
    return;
  }
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
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });

  const ats = await fetchIndex(opts.site);
  const max = await fetchMaxN(opts.site);
  log(`clip: ${ats.length} frames from ${opts.site} (${opts.page === "clip" ? "clip.html" : "index.html stand-in"}), ${opts.w}x${opts.h}, heat max ${max}, browser channel ${opts.channel}`);

  const browser = await chromium.launch({
    channel: opts.channel,
    headless: true,
    // Runners have no GPU: let MapLibre's WebGL fall back to SwiftShader.
    args: process.platform === "linux" ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] : [],
  });
  const started = Date.now();
  let result;
  try {
    const context = await browser.newContext({ viewport: { width: opts.w, height: opts.h }, deviceScaleFactor: 1, colorScheme: "dark" });
    const page = await context.newPage();
    const png = (n) => join(framesDir, frameName(n));
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
    await context.close();
  } finally {
    await browser.close();
  }
  const { written, bad } = result;
  log(`clip: ${written} frames written, ${bad} of ${ats.length} bad, in ${((Date.now() - started) / 1000).toFixed(1)}s`);
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
  log(`clip: wrote ${output} in ${((Date.now() - t0) / 1000).toFixed(1)}s (${written} frames at ${opts.fps} fps + ${opts.hold}s hold)`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    log(`clip: failed: ${err.stack ?? err}`);
    process.exit(1);
  },
);
