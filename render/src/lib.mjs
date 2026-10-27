// Pure helpers for the clip renderer (kept separate so they can be unit-tested): options,
// the page URLs, the checks of the page's plans (v3 timeline, v4 newscast), the caption, the
// frame loop and the ffmpeg arguments (the newscast's audio mix and the encode).

/** @typedef {{ mode: "newscast" | "timeline", site: string, out: string, w: number, h: number, fps: number, hook: number, fly: number, lapse: number, card: number, end: number, hold: number, slots: number, music: string, channel: string, script: string | null, encode: boolean }} Options */

const DEFAULTS = { mode: "newscast", w: 1080, h: 1920, fps: 30, hook: 2, fly: 1.5, lapse: 7, card: 5, end: 3, hold: 1, slots: 3, music: "generated" };
const MODES = new Set(["newscast", "timeline"]);
/** Options that take no value. */
const FLAGS = new Set(["no-encode"]);

/** clip.html draws a flight of at most this many frames. */
export const MAX_FLY_FRAMES = 60;

/** Frames for `seconds` at `fps`: at least one when above 0, none at 0. */
export const framesFor = (seconds, fps) => (seconds > 0 ? Math.max(1, Math.round(seconds * fps)) : 0);

/**
 * Parse `--site <url> --out <dir> [--mode newscast|timeline] --w 1080 --h 1920 --fps 30 --hold 1
 * [--script <script.json>] [--no-encode] [--channel chrome|msedge]`, plus, for `--mode
 * timeline` (v3, kept for one release), `--hook 2 --fly 1.5 --lapse 7 --card 5 --end 3 --slots 3
 * --music generated`. `--mode newscast` (the default) builds and voices the script and lets
 * the page plan the frames from it; `--script` uses a script.json already voiced (its
 * `seconds` filled, its line WAVs in a `voice/` folder beside it) instead; `--no-encode` stops
 * before the video encode (frames, poster, script and audio are still written).
 * The timeline's seconds are its parts, passed to clip.html, which plans the frames: the
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
    if (FLAGS.has(key)) {
      if (inline !== undefined) throw new Error(`--${key} takes no value`);
      raw[key] = "1";
      continue;
    }
    const value = inline ?? argv[++i];
    if (value === undefined) throw new Error(`--${key} needs a value`);
    raw[key] = value;
  }
  const known = new Set(["mode", "site", "out", "w", "h", "fps", "hook", "fly", "lapse", "card", "end", "hold", "slots", "music", "channel", "script", ...FLAGS]);
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
  const mode = raw.mode ?? DEFAULTS.mode;
  if (!MODES.has(mode)) throw new Error(`--mode must be newscast or timeline, got ${mode}`);
  if (raw.script !== undefined && mode !== "newscast") throw new Error("--script needs --mode newscast");
  if (raw.script !== undefined && !raw.script.trim()) throw new Error("--script needs a file path");
  return {
    mode,
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
    script: raw.script ?? null,
    encode: raw["no-encode"] === undefined,
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

/**
 * The newscast's clip.html URL (v4): the page loads the snapshot and waits for the script
 * (window.__clipNewscast). `max` pins the heat scale as for the timeline.
 * @param {Options} opts
 */
export function newscastUrl(opts, max = 0) {
  const { site, w, h, fps } = opts;
  return `${site}/clip.html?newscast=1&w=${w}&h=${h}&fps=${fps}${max > 0 ? `&max=${max}` : ""}`;
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
 * `hourMarks` increasing frame indices of the whole clip that fall inside the lapse segment,
 * and `signals`, when present (older pages have none), entries with a string slot, label and
 * place, a 15-hex cell and an https page address. Anything else throws, so a page that
 * drifted from the contract fails the clip.
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
  checkSignals(plan, fail);
  return plan;
}

/** `signals`, when present: entries with a slot, label and place, a 15-hex cell and an https page. */
function checkSignals(plan, fail) {
  if (plan.signals === undefined) return;
  if (!Array.isArray(plan.signals)) fail("signals is not an array");
  plan.signals.forEach((g, k) => {
    const at = `signal ${k + 1}`;
    if (!g || typeof g !== "object") fail(`${at} is not an object`);
    for (const key of ["slot", "label", "place"]) if (typeof g[key] !== "string" || !g[key]) fail(`${at} has no ${key}`);
    if (typeof g.cell !== "string" || !/^[0-9a-f]{15}$/.test(g.cell)) fail(`${at} cell ${JSON.stringify(g.cell)} is not 15 lowercase hex`);
    if (typeof g.page !== "string" || !/^https:\/\/[^\s/]+\/\S*$/.test(g.page)) fail(`${at} page ${JSON.stringify(g.page)} is not an https address`);
  });
}

const NEWSCAST_KINDS = new Set(["open", "flight", "card", "close"]);

/**
 * Check a voiced script (from --script, or before it goes to the page): a YYYY-MM-DD date and
 * lines, each with a unique string id, a known kind, text and `seconds` > 0; the first line
 * `open`, the last `close`, `story` lines between. Returns the script.
 * @param {any} script
 */
export function checkScript(script) {
  const fail = (why) => {
    throw new Error(`script: ${why}`);
  };
  if (!script || typeof script !== "object") fail("not an object");
  if (typeof script.date !== "string" || !/^\d{4}-\d\d-\d\d$/.test(script.date)) fail(`date ${JSON.stringify(script.date)}`);
  if (!Array.isArray(script.lines) || script.lines.length < 2) fail("fewer than two lines");
  const ids = new Set();
  script.lines.forEach((l, k) => {
    if (!l || typeof l.id !== "string" || !l.id) fail(`line ${k + 1} has no id`);
    if (ids.has(l.id)) fail(`line id ${l.id} repeated`);
    ids.add(l.id);
    const want = k === 0 ? "open" : k === script.lines.length - 1 ? "close" : "story";
    if (l.kind !== want) fail(`line ${l.id} is ${JSON.stringify(l.kind)}, expected ${want}`);
    if (typeof l.text !== "string" || !l.text.trim()) fail(`line ${l.id} has no text`);
    if (!Number.isFinite(l.seconds) || l.seconds <= 0) fail(`line ${l.id} has ${l.seconds} seconds (not voiced)`);
  });
  return script;
}

/**
 * Check the plan clip.html's `window.__clipNewscast(script)` returned (v4 build contract item
 * 3), and return it: `fps` as asked, `frames` a positive integer, `date` the script's, `poster`
 * a frame index; `segments` contiguous from frame 0, summing to `frames`, kinds `open`, then a
 * `flight` and a `card` per story, then `close`, each naming its script line in `line`; `lines`
 * one entry per script line in the script's order, each `{ id, start, frames }` inside the
 * clip, in order and not overlapping, and at least as long as the line's audio (one frame of
 * rounding allowed) so a voice never runs into the next; `signals` as for the timeline.
 * @param {any} plan
 * @param {number} fps
 * @param {{ date: string, lines: { id: string, kind: string, seconds: number }[] }} script
 */
export function checkNewscastPlan(plan, fps, script) {
  const fail = (why) => {
    throw new Error(`clip.html newscast plan: ${why}`);
  };
  if (!plan || typeof plan !== "object") fail("not an object");
  if (plan.fps !== fps) fail(`fps ${plan.fps}, asked ${fps}`);
  if (!Number.isInteger(plan.frames) || plan.frames < 1) fail(`frames ${plan.frames}`);
  if (plan.date !== script.date) fail(`date ${JSON.stringify(plan.date)}, the script's is ${script.date}`);
  if (!Number.isInteger(plan.poster) || plan.poster < 0 || plan.poster >= plan.frames) fail(`poster ${plan.poster} outside 0..${plan.frames - 1}`);
  const lineIds = new Set(script.lines.map((l) => l.id));
  if (!Array.isArray(plan.segments) || plan.segments.length === 0) fail("no segments");
  let next = 0;
  for (const s of plan.segments) {
    if (!NEWSCAST_KINDS.has(s?.kind)) fail(`unknown segment kind ${JSON.stringify(s?.kind)}`);
    if (s.start !== next) fail(`segment ${s.kind} starts at ${s.start}, expected ${next}`);
    if (!Number.isInteger(s.frames) || s.frames < 1) fail(`segment ${s.kind} has ${s.frames} frames`);
    if (!lineIds.has(s.line)) fail(`segment ${s.kind} at ${s.start} names line ${JSON.stringify(s.line)}, not in the script`);
    next += s.frames;
  }
  if (next !== plan.frames) fail(`segments sum to ${next}, frames is ${plan.frames}`);
  const stories = script.lines.filter((l) => l.kind === "story");
  const want = ["open", ...stories.flatMap(() => ["flight", "card"]), "close"];
  const kinds = plan.segments.map((s) => s.kind);
  if (kinds.join(" ") !== want.join(" ")) fail(`segment kinds ${kinds.join(" ")}, expected ${want.join(" ")}`);
  const wantLines = [script.lines[0].id, ...stories.flatMap((l) => [l.id, l.id]), script.lines.at(-1).id];
  plan.segments.forEach((s, k) => {
    if (s.line !== wantLines[k]) fail(`segment ${k + 1} (${s.kind}) names line ${s.line}, expected ${wantLines[k]}`);
  });
  if (!Array.isArray(plan.lines) || plan.lines.length !== script.lines.length) fail(`${plan.lines?.length ?? "no"} lines, the script has ${script.lines.length}`);
  let end = 0;
  plan.lines.forEach((l, k) => {
    const s = script.lines[k];
    if (l?.id !== s.id) fail(`line ${k + 1} is ${JSON.stringify(l?.id)}, expected ${s.id}`);
    if (!Number.isInteger(l.start) || !Number.isInteger(l.frames) || l.frames < 1) fail(`line ${l.id} start ${l.start} frames ${l.frames}`);
    if (l.start < end) fail(`line ${l.id} starts at ${l.start}, before the previous line ends at ${end}`);
    if (l.start + l.frames > plan.frames) fail(`line ${l.id} ends at ${l.start + l.frames}, after the clip's ${plan.frames} frames`);
    if (l.frames + 1 < s.seconds * fps) fail(`line ${l.id} has ${l.frames} frames for ${s.seconds.toFixed(2)} s of audio`);
    end = l.start + l.frames;
  });
  checkSignals(plan, fail);
  return plan;
}

/** The broadcast page's address, as the clip's end card shows it (with https://). */
export const BROADCAST_ADDRESS = "https://currentsbtw.github.io/today-on-earth/broadcast";
/** The synthetic-voice label: on the close's lockup and the transcript's last line, never spoken. */
export const VOICE_NOTE = "Read by a synthetic voice from the outlets' own headlines.";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The caption's second line, under the date. */
export const CAPTION_SITE_LINE = "One rotation of the humans' news, one dot per place. Counted, not read.";
/** The caption's line under the broadcast's address. */
export const CAPTION_CODE_LINE = "The method and the code: github.com/currentsbtw/today-on-earth";

/** "2026-10-23" -> "23 October 2026". */
export const longDate = (day) => {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

/**
 * The caption posted with the clip (caption-<date>.txt): the date line and the site's line
 * (CAPTION_SITE_LINE, the Observer's, docs/VOICE.md), then per signal "1/3 · MOST COVERED
 * STORY · Paris" with its place page's address on the next line, then the broadcast's address
 * and, under it, the repository's (CAPTION_CODE_LINE). Without signals (none filled, or an older page whose
 * plan has none) the signal block is left out. With the newscast's `script`, the transcript
 * follows after a blank line: each spoken line as spoken, and under each story line its
 * headline's credit, "Headline from wamc.org", with the headline itself when the voice did not
 * read it ("Headline from eltiempo.com: Francia vive…"), then VOICE_NOTE as the last line (a
 * note, not a spoken line). LF line ends and a trailing newline.
 * @param {{ date: string, signals?: { label: string, place: string, page: string }[] }} plan
 * @param {{ broadcast?: string, script?: { lines: { kind: string, text: string, story?: { source: string | null, headline: string, spoken: boolean } }[] } }} [opts]
 */
export function captionText(plan, { broadcast = BROADCAST_ADDRESS, script } = {}) {
  const signals = plan.signals ?? [];
  const lines = [`Today On Earth · ${longDate(plan.date)}`, CAPTION_SITE_LINE, ""];
  if (signals.length) {
    signals.forEach((g, k) => lines.push(`${k + 1}/${signals.length} · ${g.label.toUpperCase()} · ${g.place}`, g.page));
    lines.push("");
  }
  lines.push(`Today's broadcast: ${broadcast}`, CAPTION_CODE_LINE);
  if (script) {
    lines.push("");
    for (const l of script.lines) {
      lines.push(l.text);
      const st = l.story;
      if (l.kind === "story" && st) lines.push(`Headline from ${st.source || "an outlet"}${st.spoken ? "" : `: ${st.headline}`}`);
    }
    lines.push(VOICE_NOTE);
  }
  return `${lines.join("\n")}\n`;
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

/** The newscast's mixed soundtrack rate (the encode takes it as is). */
export const MIX_RATE = 48_000;

/**
 * ffmpeg arguments for the newscast's soundtrack (v4 build contract item 4): the bed WAV
 * (already the clip's length, at 48 kHz) with each voice line's 24 kHz WAV resampled to 48 kHz
 * (`aresample`) and delayed to its line's start (`adelay`, in samples,
 * so the placement is exact), summed without normalisation (`amix normalize=0`, so the bed
 * stays at its level and the voice at Kokoro's), as long as the bed (`duration=first`), written
 * as a 48 kHz mono 16-bit WAV.
 * @param {{ bed: string, lines: { path: string, at: number }[], output: string }} p `at` in seconds
 */
export function mixArgs({ bed, lines, output }) {
  const chains = lines.map((l, k) => `[${k + 1}:a]aresample=${MIX_RATE},aformat=sample_fmts=fltp:channel_layouts=mono,adelay=delays=${Math.round(l.at * MIX_RATE)}S:all=1[v${k + 1}]`);
  const inputs = ["[0:a]", ...lines.map((_, k) => `[v${k + 1}]`)].join("");
  const graph = [...chains, `${inputs}amix=inputs=${lines.length + 1}:duration=first:dropout_transition=0:normalize=0[out]`].join(";");
  return [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-i", bed,
    ...lines.flatMap((l) => ["-i", l.path]),
    "-filter_complex", graph,
    "-map", "[out]",
    "-ar", String(MIX_RATE),
    "-ac", "1",
    "-c:a", "pcm_s16le",
    output,
  ];
}
