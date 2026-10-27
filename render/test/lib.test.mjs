import assert from "node:assert/strict";
import { test } from "node:test";
import { captionText, captureTimeline, checkNewscastPlan, checkPlan, checkScript, describeSegments, ffmpegArgs, frameName, MAX_BAD_SHARE, maxCellN, mixArgs, newscastUrl, parseArgs, timelineUrl } from "../src/lib.mjs";

test("parseArgs: defaults, platform browser channel, validation", () => {
  const o = parseArgs(["--site", "https://currentsbtw.github.io/today-on-earth/", "--out", "out"], "linux");
  assert.deepEqual(o, {
    mode: "newscast",
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
    script: null,
    encode: true,
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
  const head = ["Today On Earth · 22 October 2026", "One rotation of the humans' news, one dot per place. Counted, not read.", ""];
  const tail = "Today's broadcast: https://currentsbtw.github.io/today-on-earth/broadcast";
  // The repository's line follows the broadcast's address.
  const code = "The method and the code: github.com/currentsbtw/today-on-earth";
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
      code,
    ),
  );
  assert.equal(captionText({ ...goodPlan(), signals: [] }), lines(...head, tail, code));
  assert.equal(captionText(goodPlan()), lines(...head, tail, code));
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

test("parseArgs: --mode, --script and the --no-encode flag", () => {
  const base = ["--site", "http://x", "--out", "o"];
  assert.equal(parseArgs([...base, "--mode", "timeline"], "linux").mode, "timeline");
  assert.throws(() => parseArgs([...base, "--mode", "trailer"]), /--mode must be newscast or timeline/);
  const o = parseArgs([...base, "--no-encode", "--script", "out/script.json"], "linux");
  assert.deepEqual([o.mode, o.script, o.encode], ["newscast", "out/script.json", false]);
  assert.throws(() => parseArgs([...base, "--no-encode=1"]), /takes no value/);
  assert.throws(() => parseArgs([...base, "--mode", "timeline", "--script", "s.json"]), /--script needs --mode newscast/);
  assert.equal(newscastUrl(parseArgs(["--site", "https://example.test/toe/", "--out", "o"], "linux"), 1401), "https://example.test/toe/clip.html?newscast=1&w=1080&h=1920&fps=30&max=1401");
  assert.equal(newscastUrl({ site: "http://x", w: 540, h: 960, fps: 24 }), "http://x/clip.html?newscast=1&w=540&h=960&fps=24");
});

const voicedScript = () => ({
  date: "2026-10-24",
  generatedAt: "2026-10-25T00:20:00Z",
  voice: { engine: "kokoro", name: "af_heart" },
  gap: 0.4,
  lines: [
    { id: "open", kind: "open", text: "Today on Earth. The humans call this day Saturday, the twenty-fourth of October. Two places their press pointed at. We counted.", seconds: 9.9 },
    { id: "story-1", kind: "story", text: "Hebron. The humans wrote: Israeli PM pledges massive military operation.", seconds: 6.1, n: 1, of: 2, story: { source: "wamc.org", headline: "Israeli PM pledges massive military operation", spoken: true } },
    { id: "story-2", kind: "story", text: "Paris. The humans wrote this in Spanish. It is on your screen.", seconds: 4.2, n: 2, of: 2, story: { source: "eltiempo.com", headline: "Francia vive nueva jornada de protestas", spoken: false } },
    { id: "close", kind: "close", text: "That was today on Earth. Two hundred and forty-three thousand articles in one rotation. We did not read them. We counted them. We will count again tomorrow.", seconds: 9.0 },
  ],
});

/** A plan as the page would return it for voicedScript() at 10 fps (the 0.4 s gap is 4 frames). */
const newscastPlan = () => ({
  fps: 10,
  frames: 330,
  date: "2026-10-24",
  poster: 5,
  segments: [
    { kind: "open", line: "open", start: 0, frames: 103 },
    { kind: "flight", line: "story-1", start: 103, frames: 12 },
    { kind: "card", line: "story-1", start: 115, frames: 54 },
    { kind: "flight", line: "story-2", start: 169, frames: 12 },
    { kind: "card", line: "story-2", start: 181, frames: 35 },
    { kind: "close", line: "close", start: 216, frames: 114 },
  ],
  lines: [
    { id: "open", start: 0, frames: 99 },
    { id: "story-1", start: 103, frames: 61 },
    { id: "story-2", start: 169, frames: 42 },
    { id: "close", start: 216, frames: 90 },
  ],
});

test("checkScript: a voiced script passes; an unvoiced or misordered one throws", () => {
  const s = voicedScript();
  assert.equal(checkScript(s), s);
  const broken = (change, why) => {
    const p = voicedScript();
    change(p);
    assert.throws(() => checkScript(p), why);
  };
  broken((p) => (p.lines[1].seconds = 0), /story-1 has 0 seconds \(not voiced\)/);
  broken((p) => p.lines.reverse(), /is "close", expected open/);
  broken((p) => (p.lines[2].id = "story-1"), /story-1 repeated/);
  broken((p) => (p.date = "24 Oct"), /date/);
});

test("checkNewscastPlan: the contract's shape; lines in order, not overlapping, inside the frames, long enough", () => {
  const script = voicedScript();
  const plan = newscastPlan();
  assert.equal(checkNewscastPlan(plan, 10, script), plan);
  assert.equal(describeSegments(plan.segments), "open 103 · flight 12 · card 54 · flight 12 · card 35 · close 114");
  const broken = (change, why) => {
    const p = newscastPlan();
    change(p);
    assert.throws(() => checkNewscastPlan(p, 10, script), why);
  };
  assert.throws(() => checkNewscastPlan(newscastPlan(), 30, script), /fps 10, asked 30/);
  broken((p) => (p.date = "2026-10-23"), /date "2026-10-23", the script's is 2026-10-24/);
  broken((p) => (p.segments[0].kind = "hook"), /unknown segment kind "hook"/);
  broken((p) => (p.segments[2].start = 116), /card starts at 116, expected 115/);
  broken((p) => (p.frames = 331), /sum to 330/);
  broken((p) => (p.segments[1].line = "story-9"), /names line "story-9", not in the script/);
  broken((p) => (p.segments[3].line = "story-1"), /segment 4 \(flight\) names line story-1, expected story-2/);
  broken((p) => ([p.segments[1].kind, p.segments[2].kind] = ["card", "flight"]), /segment kinds open card flight/);
  broken((p) => p.lines.pop(), /3 lines, the script has 4/);
  broken((p) => ([p.lines[1], p.lines[2]] = [p.lines[2], p.lines[1]]), /line 2 is "story-2", expected story-1/);
  // Overlap: story-1 starts before the opening ends.
  broken((p) => (p.lines[1].start = 98), /story-1 starts at 98, before the previous line ends at 99/);
  // Past the end of the clip.
  broken((p) => (p.lines[3].frames = 115), /close ends at 331, after the clip's 330 frames/);
  // Shorter than its audio: 6.1 s at 10 fps needs 60 frames (one frame of rounding allowed).
  broken((p) => (p.lines[1].frames = 59), /story-1 has 59 frames for 6.10 s of audio/);
  const sixty = newscastPlan();
  sixty.lines[1].frames = 60;
  assert.equal(checkNewscastPlan(sixty, 10, script), sixty);
  broken((p) => (p.signals = [{}]), /signal 1 has no slot/);
});

test("captionText: the transcript after the links, each story's headline credit", () => {
  const broadcast = "Today's broadcast: https://currentsbtw.github.io/today-on-earth/broadcast";
  const code = "The method and the code: github.com/currentsbtw/today-on-earth";
  const transcript = [
    "Today on Earth. The humans call this day Saturday, the twenty-fourth of October. Two places their press pointed at. We counted.",
    "Hebron. The humans wrote: Israeli PM pledges massive military operation.",
    "Headline from wamc.org",
    "Paris. The humans wrote this in Spanish. It is on your screen.",
    "Headline from eltiempo.com: Francia vive nueva jornada de protestas",
    "That was today on Earth. Two hundred and forty-three thousand articles in one rotation. We did not read them. We counted them. We will count again tomorrow.",
    // The voice label: a note line after the transcript, not a spoken line.
    "Read by a synthetic voice from the outlets' own headlines.",
  ];
  assert.equal(
    captionText({ date: "2026-10-24" }, { script: voicedScript() }),
    `${["Today On Earth · 24 October 2026", "One rotation of the humans' news, one dot per place. Counted, not read.", "", broadcast, code, "", ...transcript].join("\n")}\n`,
  );
  // With signals, the transcript comes after the signal links and the broadcast line.
  const withSignals = captionText({ date: "2026-10-24", signals: signals().slice(0, 1) }, { script: voicedScript() }).split("\n");
  assert.deepEqual(withSignals.slice(3, 10), ["1/1 · MOST COVERED STORY · Paris", `${PAGE}831fb4fffffffff.html`, "", broadcast, code, "", transcript[0]]);
  // A headline read in Spanish (v4.2): the line as spoken, in Spanish, and the credit alone.
  const read = voicedScript();
  read.lines[2] = { ...read.lines[2], text: "Paris. The humans wrote, in Spanish: Francia vive nueva jornada de protestas.", story: { ...read.lines[2].story, spoken: true, said: "Francia vive nueva jornada de protestas", readIn: "es", frame: "Paris. The humans wrote, in Spanish: " } };
  const lines = captionText({ date: "2026-10-24" }, { script: read }).split("\n");
  assert.deepEqual(lines.slice(9, 11), ["Paris. The humans wrote, in Spanish: Francia vive nueva jornada de protestas.", "Headline from eltiempo.com"]);
});

test("checkNewscastPlan: a story line's audio may start inside its flight (the page's LINE_LEAD)", () => {
  // As web/src/timeline.ts lays it out: each story's audio 0.7 s (7 frames at 10 fps) into its
  // flight, the card from the flight's end to the audio's end + 0.5 s and the gap.
  const plan = {
    ...newscastPlan(),
    frames: 344,
    segments: [
      { kind: "open", line: "open", start: 0, frames: 103 },
      { kind: "flight", line: "story-1", start: 103, frames: 12 },
      { kind: "card", line: "story-1", start: 115, frames: 61 },
      { kind: "flight", line: "story-2", start: 176, frames: 12 },
      { kind: "card", line: "story-2", start: 188, frames: 42 },
      { kind: "close", line: "close", start: 230, frames: 114 },
    ],
    lines: [
      { id: "open", start: 0, frames: 99 },
      { id: "story-1", start: 110, frames: 61 },
      { id: "story-2", start: 183, frames: 42 },
      { id: "close", start: 230, frames: 90 },
    ],
  };
  assert.equal(checkNewscastPlan(plan, 10, voicedScript()), plan);
});

test("mixArgs: each voice line resampled to 48 kHz and delayed to its start, in samples, over the bed", () => {
  const args = mixArgs({ bed: "bed.wav", lines: [{ path: "line-open.wav", at: 0 }, { path: "line-story-1.wav", at: 10.3 }], output: "audio.wav" });
  const at = (a, flag) => a[a.indexOf(flag) + 1];
  assert.deepEqual(args.filter((a, i) => args[i - 1] === "-i"), ["bed.wav", "line-open.wav", "line-story-1.wav"]);
  assert.equal(
    at(args, "-filter_complex"),
    "[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono,adelay=delays=0S:all=1[v1];" +
      "[2:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono,adelay=delays=494400S:all=1[v2];" +
      "[0:a][v1][v2]amix=inputs=3:duration=first:dropout_transition=0:normalize=0[out]",
  );
  assert.deepEqual([at(args, "-map"), at(args, "-ar"), at(args, "-ac"), at(args, "-c:a"), args.at(-1)], ["[out]", "48000", "1", "pcm_s16le", "audio.wav"]);
  // No voice files: the bed alone.
  const bedOnly = mixArgs({ bed: "b.wav", lines: [], output: "o.wav" });
  assert.equal(at(bedOnly, "-filter_complex"), "[0:a]amix=inputs=1:duration=first:dropout_transition=0:normalize=0[out]");
});

/** voicedScript() as show mode v2 writes it: a count second, an aside after story 1 (not grim). */
const v2Script = () => {
  const s = voicedScript();
  s.lines[1].story.grim = false;
  s.lines.splice(1, 0, { id: "count", kind: "count", text: "Two hundred and forty-three thousand articles. We counted every one. We read two headlines. Here they are.", seconds: 5 });
  s.lines.splice(3, 0, { id: "aside-1", kind: "aside", text: "This has been the part of the programme where we read things. It is most of the programme.", seconds: 4, after: 1 });
  return s;
};

test("show mode v2: checkScript takes count and aside lines; captionText prints them as plain lines", () => {
  const s = v2Script();
  assert.equal(checkScript(s), s);
  const broken = (change, why) => {
    const p = v2Script();
    change(p);
    assert.throws(() => checkScript(p), why);
  };
  broken((p) => (p.lines[2].story.grim = true), /aside aside-1 follows a grim story \(story-1\)/);
  broken((p) => p.lines.splice(2, 1), /aside aside-1 follows a count line/);
  broken((p) => ([p.lines[1], p.lines[2]] = [p.lines[2], p.lines[1]]), /line count is "count", expected story or aside/);
  broken((p) => (p.lines[1].kind = "aside"), /aside count follows a open line/);
  broken((p) => (p.lines.at(-1).kind = "aside"), /expected close/);
  const lines = captionText({ date: "2026-10-24" }, { script: s }).split("\n");
  assert.deepEqual(lines.slice(6, 12), [s.lines[0].text, s.lines[1].text, s.lines[2].text, "Headline from wamc.org", s.lines[3].text, s.lines[4].text]);
});

test("show mode v2: checkNewscastPlan lays count and aside lines out as one open-type segment", () => {
  const script = v2Script();
  const plan = (name) => ({
    fps: 10,
    frames: 424,
    date: "2026-10-24",
    poster: 5,
    segments: [
      { kind: "open", line: "open", start: 0, frames: 103 },
      { kind: name ?? "count", line: "count", start: 103, frames: 54 },
      { kind: "flight", line: "story-1", start: 157, frames: 12 },
      { kind: "card", line: "story-1", start: 169, frames: 54 },
      { kind: name ?? "aside", line: "aside-1", start: 223, frames: 40 },
      { kind: "flight", line: "story-2", start: 263, frames: 12 },
      { kind: "card", line: "story-2", start: 275, frames: 35 },
      { kind: "close", line: "close", start: 310, frames: 114 },
    ],
    lines: [
      { id: "open", start: 0, frames: 99 },
      { id: "count", start: 103, frames: 50 },
      { id: "story-1", start: 157, frames: 61 },
      { id: "aside-1", start: 223, frames: 40 },
      { id: "story-2", start: 263, frames: 42 },
      { id: "close", start: 310, frames: 90 },
    ],
  });
  for (const name of [undefined, "open"]) assert.ok(checkNewscastPlan(plan(name), 10, script));
  const p = plan();
  p.segments[4].kind = "card";
  assert.throws(() => checkNewscastPlan(p, 10, script), /segment kinds open count flight card card flight card close, expected open count flight card aside flight card close/);
});
