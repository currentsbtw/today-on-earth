import assert from "node:assert/strict";
import { test } from "node:test";
import { captionText, captureTimeline, checkPlan, describeSegments, ffmpegArgs, frameName, MAX_BAD_SHARE, maxCellN, parseArgs, timelineUrl } from "../src/lib.mjs";

test("parseArgs: defaults, platform browser channel, validation", () => {
  const o = parseArgs(["--site", "https://currentsbtw.github.io/today-on-earth/", "--out", "out"], "linux");
  assert.deepEqual(o, {
    site: "https://currentsbtw.github.io/today-on-earth",
    out: "out",
    w: 1080,
    h: 1920,
    fps: 30,
    hook: 2,
    fly: 1.5,
    lapse: 7,
    card: 5,
    end: 3,
    hold: 1,
    slots: 3,
    music: "generated",
    channel: "chrome",
  });
  assert.equal(parseArgs(["--site=http://localhost:5173", "--out=o", "--w", "1920", "--h", "1080"], "win32").channel, "msedge");
  assert.throws(() => parseArgs(["--out", "o"]), /--site/);
  assert.throws(() => parseArgs(["--site", "ftp://x", "--out", "o"]), /http/);
  assert.throws(() => parseArgs(["--site", "http://x", "--out", "o", "--w", "1081"]), /even/);
  assert.throws(() => parseArgs(["--site", "http://x", "--out", "o", "--fps", "0"]), /fps/);
  assert.throws(() => parseArgs(["--site", "http://x", "--out", "o", "--page", "index"]), /unknown/);
  assert.throws(() => parseArgs(["--site", "http://x", "--out", "o", "--card", "-1"]), /card/);
  assert.throws(() => parseArgs(["--site", "http://x", "--out", "o", "--lapse", "0"]), /lapse/);
  assert.throws(() => parseArgs(["--site", "http://x", "--out", "o", "--slots", "1.5"]), /slots/);
  // --fly: at most 60 flight frames at the chosen fps (2 s at 30 fps).
  assert.equal(parseArgs(["--site", "http://x", "--out", "o", "--fly", "2"], "linux").fly, 2);
  assert.throws(() => parseArgs(["--site", "http://x", "--out", "o", "--fly", "2.1"]), /at most 60/);
  assert.equal(parseArgs(["--site", "http://x", "--out", "o", "--music", "none"], "linux").music, "none");
  assert.equal(parseArgs(["--site", "http://x", "--out", "o", "--music", "track.mp3"], "linux").music, "track.mp3");
});

test("timelineUrl: every timeline parameter, and the live heat max when there is one", () => {
  const o = parseArgs(["--site", "https://example.test/toe", "--out", "o"], "linux");
  assert.equal(timelineUrl(o, 1401), "https://example.test/toe/clip.html?timeline=1&w=1080&h=1920&fps=30&hook=2&fly=1.5&lapse=7&card=5&end=3&slots=3&max=1401");
  assert.equal(timelineUrl({ ...o, w: 540, h: 960, slots: 0 }, 0), "https://example.test/toe/clip.html?timeline=1&w=540&h=960&fps=30&hook=2&fly=1.5&lapse=7&card=5&end=3&slots=0");
  assert.equal(maxCellN({ cells: [{ n: 3 }, { n: 1401 }, { n: 12 }] }), 1401);
  assert.equal(maxCellN({ cells: [] }), 0);
  assert.equal(maxCellN(null), 0);
});

const goodPlan = () => ({
  fps: 30,
  frames: 69,
  date: "2026-10-22",
  lapse: { from: "2026-10-21T00:15:00Z", to: "2026-10-22T00:15:00Z", snapshots: 94 },
  poster: 41,
  hourMarks: [17, 27, 37],
  segments: [
    { kind: "hook", start: 0, frames: 6 },
    { kind: "pullback", start: 6, frames: 6 },
    { kind: "lapse", start: 12, frames: 30 },
    { kind: "flight", slot: "loudest", start: 42, frames: 6 },
    { kind: "card", slot: "loudest", start: 48, frames: 12 },
    { kind: "end", start: 60, frames: 9 },
  ],
});

test("checkPlan: accepts the contract's shape, rejects drift; describeSegments for the log", () => {
  const plan = goodPlan();
  assert.equal(checkPlan(plan, 30), plan);
  assert.equal(describeSegments(plan.segments), "hook 6 · pullback 6 · lapse 30 · flight 6 · card 12 · end 9");
  const broken = (change, why) => {
    const p = goodPlan();
    change(p);
    assert.throws(() => checkPlan(p, 30), why);
  };
  assert.throws(() => checkPlan(goodPlan(), 8), /fps 30, asked 8/);
  assert.throws(() => checkPlan(null, 30), /not an object/);
  broken((p) => (p.frames = 70), /sum to 69/);
  broken((p) => (p.segments[2].start = 13), /lapse starts at 13/);
  broken((p) => (p.segments[1].kind = "zoom"), /unknown segment kind/);
  broken((p) => (p.poster = 69), /poster 69/);
  broken((p) => (p.date = "20261022"), /date/);
  broken((p) => (p.hourMarks = [5, 15]), /hour mark 5 outside the lapse/);
  broken((p) => (p.hourMarks = [27, 17]), /not increasing/);
  broken((p) => p.segments.splice(2, 1, { kind: "card", start: 12, frames: 30 }), /0 lapse segments/);
});

const PAGE = "https://currentsbtw.github.io/today-on-earth/place/";
const signals = () => [
  { slot: "loudest", label: "Most covered story", place: "Paris", cell: "831fb4fffffffff", page: `${PAGE}831fb4fffffffff.html` },
  { slot: "planet", label: "Covered in the most countries", place: "Moscow", cell: "8311aafffffffff", page: `${PAGE}8311aafffffffff.html` },
  { slot: "brightest", label: "The most positive story", place: "Vancouver", cell: "8328d4fffffffff", page: `${PAGE}8328d4fffffffff.html` },
];

test("checkPlan: accepts a plan's signals, rejects a malformed entry", () => {
  const plan = { ...goodPlan(), signals: signals() };
  assert.equal(checkPlan(plan, 30), plan);
  assert.equal(checkPlan({ ...goodPlan(), signals: [] }, 30).signals.length, 0);
  const broken = (change, why) => {
    const p = { ...goodPlan(), signals: signals() };
    change(p);
    assert.throws(() => checkPlan(p, 30), why);
  };
  broken((p) => (p.signals = {}), /signals is not an array/);
  broken((p) => (p.signals[1] = null), /signal 2 is not an object/);
  broken((p) => delete p.signals[0].place, /signal 1 has no place/);
  broken((p) => (p.signals[2].cell = "8328D4FFFFFFFFF"), /signal 3 cell "8328D4FFFFFFFFF" is not 15 lowercase hex/);
  broken((p) => (p.signals[0].page = "place/831fb4fffffffff.html"), /signal 1 page .* is not an https address/);
  broken((p) => (p.signals[0].page = "http://currentsbtw.github.io/x"), /not an https address/);
});

test("captionText: date, one line and address per signal, the broadcast line", () => {
  const lines = (...l) => `${l.join("\n")}\n`;
  const head = ["Today On Earth · 22 October 2026", "The last 24 hours of the world's news, one dot per place.", ""];
  const tail = "Today's broadcast: https://currentsbtw.github.io/today-on-earth/broadcast";
  assert.equal(
    captionText({ ...goodPlan(), signals: signals() }),
    lines(
      ...head,
      "1/3 · MOST COVERED STORY · Paris",
      `${PAGE}831fb4fffffffff.html`,
      "2/3 · COVERED IN THE MOST COUNTRIES · Moscow",
      `${PAGE}8311aafffffffff.html`,
      "3/3 · THE MOST POSITIVE STORY · Vancouver",
      `${PAGE}8328d4fffffffff.html`,
      "",
      tail,
    ),
  );
  assert.equal(captionText({ ...goodPlan(), signals: [] }), lines(...head, tail));
  assert.equal(captionText(goodPlan()), lines(...head, tail));
  assert.match(captionText({ date: "2026-01-05" }), /^Today On Earth · 5 January 2026\n/);
});

/** Run captureTimeline with a scripted page: `fails` maps step i -> number of failing attempts. */
async function simulate(frames, poster, fails) {
  const files = new Map();
  const tries = new Map();
  const logs = [];
  let drawn = -1;
  let posterOf = null;
  const run = captureTimeline({ frames, poster }, {
    step: async (i) => {
      const n = (tries.get(i) ?? 0) + 1;
      tries.set(i, n);
      if (n <= (fails[i] ?? 0)) throw new Error("step failed");
      drawn = i;
    },
    shoot: async (n) => files.set(n, drawn),
    repeat: async (from, to) => files.set(to, files.get(from)),
    poster: async () => (posterOf = drawn),
    log: (m) => logs.push(m),
  }, 5);
  const result = await run.catch((err) => err);
  return { result, files: [...files.entries()].sort((a, b) => a[0] - b[0]).map(([, i]) => i), tries, posterOf, logs };
}

test("captureTimeline: retry once, repeat the previous frame, skip a bad first frame, poster, fail past 10%", async () => {
  // Step 3 fails once (the retry draws it); step 5 fails twice (frame 4 repeated); poster at 7.
  const one = await simulate(10, 7, { 3: 1, 5: 2 });
  assert.deepEqual(one.result, { written: 10, bad: 1, posterAt: 7 });
  assert.deepEqual(one.files, [0, 1, 2, 3, 4, 4, 6, 7, 8, 9]);
  assert.equal(one.tries.get(5), 2);
  assert.equal(one.posterOf, 7);
  // Progress every 5 frames plus the failures, not one line per frame.
  assert.equal(one.logs.filter((m) => m.includes("frames,")).length, 2);
  // A bad first frame is skipped; a bad poster frame moves the poster to the next good one.
  const two = await simulate(20, 2, { 0: 2, 2: 2 });
  assert.deepEqual(two.result, { written: 19, bad: 2, posterAt: 3 });
  assert.deepEqual(two.files.slice(0, 3), [1, 1, 3]);
  assert.equal(two.posterOf, 3);
  // More than 10% bad: the loop stops at the bad frame that crosses the line.
  const three = await simulate(20, 19, { 4: 2, 9: 2, 14: 2 });
  assert.match(three.result.message, /3 of 20 frames failed/);
  assert.equal(three.tries.has(15), false);
  assert.equal(MAX_BAD_SHARE, 0.1);
  assert.equal(frameName(7), "0007.png");
});

test("ffmpegArgs: H.264 + AAC with the generated wav, a looped and faded music file, or no audio", () => {
  const base = { framesPattern: "f/%04d.png", fps: 30, hold: 1, output: "clip-2026-10-22.mp4", seconds: 37 };
  const at = (args, flag) => args[args.indexOf(flag) + 1];
  const wav = ffmpegArgs({ ...base, audio: { kind: "wav", path: "audio.wav" } });
  assert.deepEqual(wav.slice(wav.indexOf("-framerate"), wav.indexOf("-vf")), ["-framerate", "30", "-i", "f/%04d.png", "-i", "audio.wav"]);
  assert.equal(at(wav, "-vf"), "tpad=stop_mode=clone:stop_duration=1");
  assert.deepEqual([at(wav, "-c:v"), at(wav, "-pix_fmt"), at(wav, "-r"), at(wav, "-c:a"), at(wav, "-b:a"), at(wav, "-movflags")], ["libx264", "yuv420p", "30", "aac", "128k", "+faststart"]);
  assert.ok(wav.includes("-shortest") && !wav.includes("-stream_loop") && !wav.includes("-af"));
  assert.deepEqual(wav.filter((a, i) => wav[i - 1] === "-map"), ["0:v:0", "1:a:0"]);
  assert.equal(wav.at(-1), "clip-2026-10-22.mp4");
  const music = ffmpegArgs({ ...base, audio: { kind: "music", path: "track.mp3" } });
  assert.deepEqual(music.slice(music.indexOf("-stream_loop"), music.indexOf("-stream_loop") + 4), ["-stream_loop", "-1", "-i", "track.mp3"]);
  assert.equal(at(music, "-af"), "afade=t=out:st=35.5:d=1.5");
  assert.ok(music.includes("-shortest"));
  const none = ffmpegArgs({ ...base, hold: 0, audio: { kind: "none" } });
  assert.ok(!none.includes("-c:a") && !none.includes("-shortest") && !none.includes("-vf") && !none.includes("1:a:0"));
  assert.equal(none.filter((a) => a === "-i").length, 1);
});
