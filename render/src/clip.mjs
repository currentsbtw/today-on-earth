// Daily vertical clip (v3): loads the live site's clip.html once in timeline mode
// (clip.html?timeline=1&w&h&fps&hook&fly&lapse&card&end&slots&max), reads the page's plan
// (window.__clipPlan(): frames, the clip's date, the poster frame, the time-lapse's hour
// marks and the segments hook, pull-back, time-lapse, flight + card per signal, end), then
// steps it frame by frame (window.__clipStep(i), one screenshot per frame), builds the
// soundtrack from the plan (audio.mjs; or `--music <file>`, or `--music none`) and encodes an
// H.264 + AAC mp4 with ffmpeg, the last frame held `--hold` seconds.
//
//   npm run clip -- --site <base url> --out <dir> --w 1080 --h 1920 --fps 30 --hook 2 --fly 1.5 --lapse 7 --card 5 --end 3 --hold 1 --slots 3 --music generated
//
// A step that fails is retried once; a frame that fails twice is replaced by the previous
// one, and more than 10% of such frames fail the clip. Uses a system browser through
// playwright-core (no browser download): Chrome on Linux (GitHub's ubuntu runners ship it),
// Edge on Windows. `--channel` overrides.
import { spawnSync } from "node:child_process";
import { access, copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { audioEvents, renderWav, SAMPLE_RATE } from "./audio.mjs";
import { captureTimeline, checkPlan, describeSegments, ffmpegArgs, frameName, maxCellN, parseArgs, timelineUrl } from "./lib.mjs";

const READY_TIMEOUT_MS = 60_000;
const STEP_TIMEOUT_MS = 30_000;
const log = (msg) => process.stderr.write(`${msg}\n`);

async function fetchMaxN(site) {
  const url = `${site}/data/heat.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  return maxCellN(await res.json());
}

/** Open the timeline URL and wait for data-ready; a page-reported data-error throws. */
async function loadTimeline(page, url) {
  const res = await page.goto(url, { waitUntil: "load", timeout: READY_TIMEOUT_MS });
  if (res && res.status() >= 400) throw new Error(`${url} returned HTTP ${res.status()}`);
  await page.waitForSelector('body[data-ready="1"]', { state: "attached", timeout: READY_TIMEOUT_MS });
  const error = await page.evaluate(() => document.body.dataset.error ?? "");
  if (error) throw new Error(`clip.html reported: ${error}`);
}

/** Draw frame i in the page; throws unless __clipStep resolves true within the timeout. */
async function stepFrame(page, i) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`step timed out after ${STEP_TIMEOUT_MS / 1000}s`)), STEP_TIMEOUT_MS);
  });
  try {
    const done = await Promise.race([page.evaluate((n) => window.__clipStep(n), i), timeout]);
    if (done !== true) throw new Error(`__clipStep(${i}) returned ${JSON.stringify(done)}`);
  } finally {
    clearTimeout(timer);
  }
}

function findFfmpeg() {
  const probe = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  return probe.status === 0 ? "ffmpeg" : null;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const outDir = resolve(opts.out);
  const framesDir = join(outDir, "frames");
  const posterPath = join(outDir, "poster.jpg");
  const wavPath = join(outDir, "audio.wav");
  let music = null;
  if (opts.music !== "generated" && opts.music !== "none") {
    music = resolve(opts.music);
    await access(music).catch(() => {
      throw new Error(`--music file not found: ${music}`);
    });
  }
  await rm(framesDir, { recursive: true, force: true });
  await rm(posterPath, { force: true });
  // A previous run's soundtrack, unless it is the --music file itself.
  if (music?.toLowerCase() !== wavPath.toLowerCase()) await rm(wavPath, { force: true });
  await mkdir(framesDir, { recursive: true });

  const max = await fetchMaxN(opts.site);
  const url = timelineUrl(opts, max);
  log(`clip: ${url}, heat max ${max}, browser channel ${opts.channel}`);

  const browser = await chromium.launch({
    channel: opts.channel,
    headless: true,
    // Runners have no GPU: let MapLibre's WebGL fall back to SwiftShader.
    args: process.platform === "linux" ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] : [],
  });
  const started = Date.now();
  let plan;
  let result;
  try {
    const context = await browser.newContext({ viewport: { width: opts.w, height: opts.h }, deviceScaleFactor: 1, colorScheme: "dark" });
    const page = await context.newPage();
    try {
      await loadTimeline(page, url);
    } catch (err) {
      log(`clip: page load failed (${err.message}); retrying once`);
      await loadTimeline(page, url);
    }
    plan = checkPlan(await page.evaluate(() => window.__clipPlan()), opts.fps);
    log(`clip: plan for ${plan.date}: ${plan.frames} frames at ${plan.fps} fps (${(plan.frames / plan.fps).toFixed(1)}s + ${opts.hold}s hold), time-lapse ${plan.lapse.from} to ${plan.lapse.to} over ${plan.lapse.snapshots} snapshots, ${plan.hourMarks.length} hour marks, poster at frame ${plan.poster}`);
    log(`clip: segments ${describeSegments(plan.segments)}`);
    const png = (n) => join(framesDir, frameName(n));
    result = await captureTimeline(plan, {
      step: (i) => stepFrame(page, i),
      shoot: (n) => page.screenshot({ path: png(n), type: "png" }),
      repeat: (from, to) => copyFile(png(from), png(to)),
      poster: () => page.screenshot({ path: posterPath, type: "jpeg", quality: 90 }),
      log,
    });
    await context.close();
  } finally {
    await browser.close();
  }
  const { written, bad, posterAt } = result;
  log(`clip: ${written} frames written, ${bad} of ${plan.frames} bad, in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (written === 0) throw new Error("no frames were written; not encoding");
  if (posterAt < 0) throw new Error(`no good frame at or after the poster frame ${plan.poster}; not encoding`);

  const seconds = written / plan.fps + opts.hold;
  let audio = { kind: "none" };
  if (music) {
    audio = { kind: "music", path: music };
  } else if (opts.music === "generated") {
    const events = audioEvents(plan, opts.hold);
    await writeFile(wavPath, renderWav(events, plan.frames / plan.fps + opts.hold, SAMPLE_RATE));
    audio = { kind: "wav", path: wavPath };
    log(`clip: wrote ${wavPath} (${events.length} sounds, ${(plan.frames / plan.fps + opts.hold).toFixed(2)}s)`);
  }
  const audioName = audio.kind === "none" ? "no audio" : audio.kind === "wav" ? "generated soundtrack" : `music ${music}`;

  const output = join(outDir, `clip-${plan.date}.mp4`);
  const args = ffmpegArgs({ framesPattern: join(framesDir, "%04d.png"), fps: plan.fps, hold: opts.hold, output, seconds, audio });
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) {
    log(`clip: ffmpeg not found on PATH; skipped the encode (${audio.kind === "wav" ? "frames, poster.jpg and audio.wav" : "frames and poster.jpg"} are written). It would run: ffmpeg ${args.join(" ")}`);
    return 0;
  }
  const t0 = Date.now();
  const run = spawnSync(ffmpeg, args, { stdio: ["ignore", "inherit", "inherit"] });
  if (run.status !== 0) throw new Error(`ffmpeg exited with ${run.status}`);
  log(`clip: wrote ${output} in ${((Date.now() - t0) / 1000).toFixed(1)}s (${written} frames at ${plan.fps} fps + ${opts.hold}s hold, ${seconds.toFixed(1)}s, ${audioName})`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    log(`clip: failed: ${err.stack ?? err}`);
    process.exit(1);
  },
);
