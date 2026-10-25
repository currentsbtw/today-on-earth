// Daily vertical clip.
//
// v4, the newscast (`--mode newscast`, the default; docs/PLAN.md "Clip v4: the newscast", the
// build contract): builds the script from the live data/stories.json and data/heat.json
// (script.mjs), voices each line with Kokoro (speech.mjs, one WAV per line in <out>/voice/),
// fills each line's seconds and writes <out>/script.json; opens
// clip.html?newscast=1&w&h&fps&max, hands the script to window.__clipNewscast(script) and
// checks the plan it returns (checkNewscastPlan), steps the frames as v3 does, then mixes the
// soundtrack with ffmpeg (mixArgs: each line's WAV placed at its line's start in the plan, over
// the bed from audio.mjs at about -26 dBFS with a quiet glide under each flight, 48 kHz mono,
// <out>/audio.wav) and encodes as v3 does. The caption gains the transcript.
//
//   npm run clip -- --site <base url> --out <dir> --w 1080 --h 1920 --fps 30 --hold 1
//   npm run clip -- ... --script <dir>/script.json   reuse a voiced script (WAVs in <dir>/voice/)
//   npm run clip -- ... --no-encode                  stop before the video encode
//
// v3, the timeline (`--mode timeline`, kept for one release): loads the live site's clip.html
// once in timeline mode (clip.html?timeline=1&w&h&fps&hook&fly&lapse&card&end&slots&max), reads
// the page's plan (window.__clipPlan(): frames, the clip's date, the poster frame, the
// time-lapse's hour marks and the segments hook, pull-back, time-lapse, flight + card per
// signal, end), then steps it frame by frame (window.__clipStep(i), one screenshot per frame),
// builds the soundtrack from the plan (audio.mjs; or `--music <file>`, or `--music none`) and
// encodes an H.264 + AAC mp4 with ffmpeg, the last frame held `--hold` seconds. Beside it,
// caption-<date>.txt is the text to post with the clip: each signal's place page address and
// the broadcast page's.
//
//   npm run clip -- --mode timeline --site <base url> --out <dir> --w 1080 --h 1920 --fps 30 --hook 2 --fly 1.5 --lapse 7 --card 5 --end 3 --hold 1 --slots 3 --music generated
//
// A step that fails is retried once; a frame that fails twice is replaced by the previous
// one, and more than 10% of such frames fail the clip. Uses a system browser through
// playwright-core (no browser download): Chrome on Linux (GitHub's ubuntu runners ship it),
// Edge on Windows. `--channel` overrides.
import { spawnSync } from "node:child_process";
import { access, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { audioEvents, newscastEvents, renderWav, SAMPLE_RATE } from "./audio.mjs";
import { captionText, captureTimeline, checkNewscastPlan, checkPlan, checkScript, describeSegments, ffmpegArgs, frameName, maxCellN, mixArgs, newscastUrl, parseArgs, timelineUrl } from "./lib.mjs";
import { buildScript, clipDate, spokenSeconds } from "./script.mjs";

const READY_TIMEOUT_MS = 60_000;
const STEP_TIMEOUT_MS = 30_000;
const log = (msg) => process.stderr.write(`${msg}\n`);

async function fetchJson(site, path) {
  const url = `${site}/${path}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  return res.json();
}

/** Open the timeline URL and wait for data-ready; a page-reported data-error throws. */
async function loadTimeline(page, url) {
  const res = await page.goto(url, { waitUntil: "load", timeout: READY_TIMEOUT_MS });
  if (res && res.status() >= 400) throw new Error(`${url} returned HTTP ${res.status()}`);
  await page.waitForSelector('body[data-ready="1"]', { state: "attached", timeout: READY_TIMEOUT_MS });
  const error = await page.evaluate(() => document.body.dataset.error ?? "");
  if (error) throw new Error(`clip.html reported: ${error}`);
}

/** Open the newscast URL and wait until the page offers __clipNewscast (or reports an error). */
async function loadNewscast(page, url) {
  const res = await page.goto(url, { waitUntil: "load", timeout: READY_TIMEOUT_MS });
  if (res && res.status() >= 400) throw new Error(`${url} returned HTTP ${res.status()}`);
  await page.waitForFunction(() => typeof window.__clipNewscast === "function" || Boolean(document.body?.dataset.error), null, { timeout: READY_TIMEOUT_MS });
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

function runFfmpeg(ffmpeg, args, what) {
  const run = spawnSync(ffmpeg, args, { stdio: ["ignore", "inherit", "inherit"] });
  if (run.status !== 0) throw new Error(`ffmpeg (${what}) exited with ${run.status}`);
}

function launchBrowser(opts) {
  return chromium.launch({
    channel: opts.channel,
    headless: true,
    // Runners have no GPU: let MapLibre's WebGL fall back to SwiftShader.
    args: process.platform === "linux" ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] : [],
  });
}

/** Step and shoot every frame of `plan` in `page`, the poster beside them. */
function captureFrames(page, plan, framesDir, posterPath) {
  const png = (n) => join(framesDir, frameName(n));
  return captureTimeline(plan, {
    step: (i) => stepFrame(page, i),
    shoot: (n) => page.screenshot({ path: png(n), type: "png" }),
    repeat: (from, to) => copyFile(png(from), png(to)),
    poster: () => page.screenshot({ path: posterPath, type: "jpeg", quality: 90 }),
    log,
  });
}

/** The voiced script: built from the live data and synthesised, or read from --script. */
async function voicedScript(opts, heat, outDir) {
  if (opts.script) {
    const path = resolve(opts.script);
    const script = checkScript(JSON.parse(await readFile(path, "utf8")));
    log(`clip: script from ${path} (${script.lines.length} lines, ${spokenSeconds(script).toFixed(2)} s spoken); no synthesis`);
    return { script, voiceDir: join(dirname(path), "voice") };
  }
  // Loaded only here: --script and --mode timeline never load the model.
  const { synthesise } = await import("./speech.mjs");
  const stories = await fetchJson(opts.site, "data/stories.json");
  const script = buildScript({ stories, heat, date: clipDate(heat) });
  const voiceDir = join(outDir, "voice");
  await rm(voiceDir, { recursive: true, force: true });
  const seconds = await synthesise(script.lines, { outDir: voiceDir, voice: script.voice.name });
  script.lines.forEach((l, k) => (l.seconds = Math.round(seconds[k] * 1e6) / 1e6));
  return { script: checkScript(script), voiceDir };
}

async function runNewscast(opts) {
  const outDir = resolve(opts.out);
  const framesDir = join(outDir, "frames");
  const posterPath = join(outDir, "poster.jpg");
  const bedPath = join(outDir, "bed.wav");
  const wavPath = join(outDir, "audio.wav");
  await mkdir(outDir, { recursive: true });
  const heat = await fetchJson(opts.site, "data/heat.json");
  const max = maxCellN(heat);
  const { script, voiceDir } = await voicedScript(opts, heat, outDir);
  const scriptPath = join(outDir, "script.json");
  // Written before the frames, so a failed render still has it.
  await writeFile(scriptPath, `${JSON.stringify(script, null, 2)}\n`, "utf8");
  log(`clip: wrote ${scriptPath} (${script.date}, ${script.lines.length} lines, ${spokenSeconds(script).toFixed(2)} s spoken)`);

  await rm(framesDir, { recursive: true, force: true });
  for (const p of [posterPath, bedPath, wavPath]) await rm(p, { force: true });
  await mkdir(framesDir, { recursive: true });
  const url = newscastUrl(opts, max);
  log(`clip: ${url}, heat max ${max}, browser channel ${opts.channel}`);

  const browser = await launchBrowser(opts);
  const started = Date.now();
  let plan;
  let result;
  try {
    const context = await browser.newContext({ viewport: { width: opts.w, height: opts.h }, deviceScaleFactor: 1, colorScheme: "dark" });
    const page = await context.newPage();
    try {
      await loadNewscast(page, url);
    } catch (err) {
      log(`clip: page load failed (${err.message}); retrying once`);
      await loadNewscast(page, url);
    }
    plan = checkNewscastPlan(await page.evaluate((s) => window.__clipNewscast(s), script), opts.fps, script);
    const error = await page.evaluate(() => document.body.dataset.error ?? "");
    if (error) throw new Error(`clip.html reported: ${error}`);
    log(`clip: newscast plan for ${plan.date}: ${plan.frames} frames at ${plan.fps} fps (${(plan.frames / plan.fps).toFixed(1)}s + ${opts.hold}s hold), poster at frame ${plan.poster}`);
    log(`clip: segments ${describeSegments(plan.segments)}`);
    const captionPath = join(outDir, `caption-${plan.date}.txt`);
    await writeFile(captionPath, captionText(plan, { script }), "utf8");
    log(`clip: wrote ${captionPath} (${plan.signals ? `${plan.signals.length} signal links` : "no signals in the plan"}, the transcript)`);
    result = await captureFrames(page, plan, framesDir, posterPath);
    await context.close();
  } finally {
    await browser.close();
  }
  const { written, bad, posterAt } = result;
  log(`clip: ${written} frames written, ${bad} of ${plan.frames} bad, in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (written === 0) throw new Error("no frames were written; not encoding");
  if (posterAt < 0) throw new Error(`no good frame at or after the poster frame ${plan.poster}; not encoding`);

  // The underlay is the plan's length plus the hold; the voice lines sit inside the plan.
  const audioSeconds = plan.frames / plan.fps + opts.hold;
  const events = newscastEvents(plan, opts.hold);
  await writeFile(bedPath, renderWav(events, audioSeconds, SAMPLE_RATE));
  log(`clip: wrote ${bedPath} (the bed and ${events.length - 1} flight glides, ${audioSeconds.toFixed(2)}s)`);
  const voices = [];
  for (const l of plan.lines) {
    const path = join(voiceDir, `line-${l.id}.wav`);
    if (await access(path).then(() => true, () => false)) voices.push({ path, at: l.start / plan.fps });
    else log(`clip: warning: ${path} not found; line ${l.id} is silent`);
  }
  const mix = mixArgs({ bed: bedPath, lines: voices, output: wavPath });
  const output = join(outDir, `clip-${plan.date}.mp4`);
  const seconds = written / plan.fps + opts.hold;
  const encode = ffmpegArgs({ framesPattern: join(framesDir, "%04d.png"), fps: plan.fps, hold: opts.hold, output, seconds, audio: { kind: "wav", path: wavPath } });
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) {
    log(`clip: ffmpeg not found on PATH; skipped the mix and the encode (frames, poster.jpg, script.json, bed.wav and the line WAVs are written). They would run: ffmpeg ${mix.join(" ")} ; ffmpeg ${encode.join(" ")}`);
    return 0;
  }
  let t0 = Date.now();
  runFfmpeg(ffmpeg, mix, "mix");
  log(`clip: wrote ${wavPath} in ${((Date.now() - t0) / 1000).toFixed(1)}s (${voices.length} voice lines over the bed, 48 kHz mono)`);
  if (!opts.encode) {
    log(`clip: --no-encode: skipped the encode. It would run: ffmpeg ${encode.join(" ")}`);
    return 0;
  }
  t0 = Date.now();
  runFfmpeg(ffmpeg, encode, "encode");
  log(`clip: wrote ${output} in ${((Date.now() - t0) / 1000).toFixed(1)}s (${written} frames at ${plan.fps} fps + ${opts.hold}s hold, ${seconds.toFixed(1)}s, the voice over the bed)`);
  return 0;
}

async function runTimeline(opts) {
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

  const max = maxCellN(await fetchJson(opts.site, "data/heat.json"));
  const url = timelineUrl(opts, max);
  log(`clip: ${url}, heat max ${max}, browser channel ${opts.channel}`);

  const browser = await launchBrowser(opts);
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
    // The text to post with the clip, written before the frames so a failed render still has it.
    const captionPath = join(outDir, `caption-${plan.date}.txt`);
    await writeFile(captionPath, captionText(plan), "utf8");
    log(`clip: wrote ${captionPath} (${plan.signals ? `${plan.signals.length} signal links` : "no signals in the plan"})`);
    result = await captureFrames(page, plan, framesDir, posterPath);
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
  if (!ffmpeg || !opts.encode) {
    log(`clip: ${ffmpeg ? "--no-encode" : "ffmpeg not found on PATH"}; skipped the encode (${audio.kind === "wav" ? "frames, poster.jpg and audio.wav" : "frames and poster.jpg"} are written). It would run: ffmpeg ${args.join(" ")}`);
    return 0;
  }
  const t0 = Date.now();
  runFfmpeg(ffmpeg, args, "encode");
  log(`clip: wrote ${output} in ${((Date.now() - t0) / 1000).toFixed(1)}s (${written} frames at ${plan.fps} fps + ${opts.hold}s hold, ${seconds.toFixed(1)}s, ${audioName})`);
  return 0;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  return opts.mode === "timeline" ? runTimeline(opts) : runNewscast(opts);
}

main().then(
  (code) => process.exit(code),
  (err) => {
    log(`clip: failed: ${err.stack ?? err}`);
    process.exit(1);
  },
);
