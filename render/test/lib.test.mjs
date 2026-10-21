import assert from "node:assert/strict";
import { test } from "node:test";
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
  stampOf,
} from "../src/lib.mjs";

test("parseArgs: defaults, platform browser channel, validation", () => {
  const o = parseArgs(["--site", "https://currentsbtw.github.io/today-on-earth/", "--out", "out"], "linux");
  assert.deepEqual(o, { site: "https://currentsbtw.github.io/today-on-earth", out: "out", w: 1080, h: 1920, fps: 8, hold: 2, card: 3, end: 3, channel: "chrome", page: "clip" });
  assert.equal(parseArgs(["--site=http://localhost:5173", "--out=o", "--w", "1920", "--h", "1080"], "win32").channel, "msedge");
  assert.throws(() => parseArgs(["--out", "o"]), /--site/);
  assert.throws(() => parseArgs(["--site", "ftp://x", "--out", "o"]), /http/);
  assert.throws(() => parseArgs(["--site", "http://x", "--out", "o", "--w", "1081"]), /even/);
  assert.throws(() => parseArgs(["--site", "http://x", "--out", "o", "--fps", "0"]), /fps/);
  assert.throws(() => parseArgs(["--site", "http://x", "--out", "o", "--bogus", "1"]), /unknown/);
  const cards = parseArgs(["--site", "http://x", "--out", "o", "--card", "1.5", "--end", "0", "--hold", "0"], "linux");
  assert.deepEqual([cards.card, cards.end, cards.hold], [1.5, 0, 0]);
  assert.throws(() => parseArgs(["--site", "http://x", "--out", "o", "--card", "-1"]), /card/);
});

test("frame URLs: clip.html with t, w, h; index.html stand-in uses the permalink hash", () => {
  const o = parseArgs(["--site", "https://example.test/toe", "--out", "o"], "linux");
  assert.equal(stampOf("2026-10-21T04:47:14Z"), "20261021T044714Z");
  assert.equal(frameUrl(o, "2026-10-21T04:47:14Z"), "https://example.test/toe/clip.html?t=20261021T044714Z&w=1080&h=1920");
  assert.equal(frameUrl({ ...o, page: "index" }, "2026-10-21T04:47:14Z"), "https://example.test/toe/index.html#t=20261021T044714Z");
});

test("clip date is the UTC day of the midpoint of the frames", () => {
  // A 00:20 run: frames from 00:15 yesterday to 00:15 today -> named after yesterday.
  assert.equal(clipDate(["2026-10-21T00:15:00Z", "2026-10-20T00:30:00Z", "2026-10-20T12:00:00Z"]), "2026-10-20");
  assert.equal(clipDate(["2026-10-21T05:30:25Z"]), "2026-10-21");
  assert.throws(() => clipDate([]));
});

test("ffmpeg arguments: H.264, yuv420p, fps, hold by cloning the last frame, faststart", () => {
  const args = ffmpegArgs({ framesPattern: "f/%04d.png", fps: 8, hold: 2, output: "clip-2026-10-20.mp4" });
  const at = (flag) => args[args.indexOf(flag) + 1];
  assert.equal(at("-framerate"), "8");
  assert.equal(at("-i"), "f/%04d.png");
  assert.equal(at("-vf"), "tpad=stop_mode=clone:stop_duration=2");
  assert.equal(at("-c:v"), "libx264");
  assert.equal(at("-pix_fmt"), "yuv420p");
  assert.equal(at("-r"), "8");
  assert.equal(at("-movflags"), "+faststart");
  assert.equal(args.at(-1), "clip-2026-10-20.mp4");
  assert.ok(!ffmpegArgs({ framesPattern: "f/%04d.png", fps: 8, hold: 0, output: "x.mp4" }).includes("-vf"));
  assert.equal(frameName(7), "0007.png");
});

test("frame URL carries the live heat max; maxCellN reads heat.json", () => {
  const o = parseArgs(["--site", "https://example.test/toe", "--out", "o"], "linux");
  assert.equal(frameUrl(o, "2026-10-21T04:47:14Z", 1401), "https://example.test/toe/clip.html?t=20261021T044714Z&w=1080&h=1920&max=1401");
  assert.equal(frameUrl(o, "2026-10-21T04:47:14Z", 0), "https://example.test/toe/clip.html?t=20261021T044714Z&w=1080&h=1920");
  assert.equal(maxCellN({ cells: [{ n: 3 }, { n: 1401 }, { n: 12 }] }), 1401);
  assert.equal(maxCellN({ cells: [] }), 0);
  assert.equal(maxCellN(null), 0);
});

/** Run captureFrames with a scripted loader: `fails` maps frame `at` -> number of failing attempts. */
async function simulate(ats, fails) {
  const files = new Map();
  const tries = new Map();
  const result = await captureFrames(ats, {
    load: async (at) => {
      const n = (tries.get(at) ?? 0) + 1;
      tries.set(at, n);
      if (n <= (fails[at] ?? 0)) throw new Error("timeout");
      files.current = at;
    },
    shoot: async (i) => files.set(i, files.current),
    repeat: async (from, to) => files.set(to, files.get(from)),
    log: () => {},
  });
  return { result, files: [...files.entries()].sort((a, b) => a[0] - b[0]).map(([, at]) => at), tries };
}

test("captureFrames: retry once, repeat the previous frame for a bad one, skip a bad first frame", async () => {
  const ats = ["a", "b", "c", "d"];
  // b fails once (retry succeeds); c fails twice (repeated from b).
  const one = await simulate(ats, { b: 1, c: 2 });
  assert.deepEqual(one.result, { written: 4, bad: 1, lastGood: "d" });
  assert.deepEqual(one.files, ["a", "b", "b", "d"]);
  assert.equal(one.tries.get("c"), 2);
  // A bad first frame is skipped, numbering stays contiguous.
  const two = await simulate(ats, { a: 2, d: 2 });
  assert.deepEqual(two.result, { written: 3, bad: 2, lastGood: "c" });
  assert.deepEqual(two.files, ["b", "c", "c"]);
  assert.equal(MAX_BAD_SHARE, 0.1);
});

test("card URLs and filled slots from broadcast.json", () => {
  const o = parseArgs(["--site", "https://example.test/toe", "--out", "o"], "linux");
  assert.equal(signalUrl(o, "loudest", 1401), "https://example.test/toe/clip.html?signal=loudest&w=1080&h=1920&max=1401");
  assert.equal(endUrl(o, 1401), "https://example.test/toe/clip.html?end=1&w=1080&h=1920&max=1401");
  assert.equal(endUrl(o), "https://example.test/toe/clip.html?end=1&w=1080&h=1920");
  const broadcast = { slots: [{ id: "loudest", available: true }, { id: "planet", available: false }, { id: "rising", available: true }, { id: "../x", available: true }, null] };
  assert.deepEqual(availableSlots(broadcast), ["loudest", "rising"]);
  assert.deepEqual(availableSlots({}), []);
  assert.deepEqual(availableSlots(null), []);
});

test("planCards: card and end frames at fps x seconds, zero cards, hold on top", () => {
  // 4 cards x 3 s and a 3 s end card at 8 fps after 96 time-lapse frames.
  const four = planCards({ timelapse: 96, slots: ["loudest", "planet", "brightest", "ordinary"], fps: 8, card: 3, end: 3, hold: 0 });
  assert.deepEqual(four.steps.map((s) => [s.kind, s.id, s.frames]), [
    ["signal", "loudest", 24],
    ["signal", "planet", 24],
    ["signal", "brightest", 24],
    ["signal", "ordinary", 24],
    ["end", "end", 24],
  ]);
  assert.equal(four.frames, 96 + 5 * 24);
  assert.equal(four.seconds, 27);
  // No filled slots (or no broadcast.json): only the end card.
  const none = planCards({ timelapse: 96, slots: [], fps: 8, card: 3, end: 3, hold: 0 });
  assert.deepEqual(none.steps, [{ kind: "end", id: "end", frames: 24 }]);
  // --card 0 --end 0 and a hold: the old clip, held after the last time-lapse frame.
  const old = planCards({ timelapse: 96, slots: ["loudest"], fps: 8, card: 0, end: 0, hold: 2 });
  assert.deepEqual(old, { steps: [], frames: 96, seconds: 14 });
  // A short card still gets at least one frame; the hold adds to the duration only.
  const short = planCards({ timelapse: 10, slots: ["faint"], fps: 8, card: 0.05, end: 1, hold: 1.5 });
  assert.deepEqual(short.steps.map((s) => s.frames), [1, 8]);
  assert.equal(short.seconds, 19 / 8 + 1.5);
});

test("captureCards: a card is shot once and copied, a failing card is skipped, numbering stays contiguous", async () => {
  const files = new Map();
  let current = "";
  const logs = [];
  const steps = [
    { kind: "signal", id: "loudest", frames: 3 },
    { kind: "signal", id: "planet", frames: 3 },
    { kind: "end", id: "end", frames: 2 },
  ];
  const result = await captureCards(steps, 5, {
    load: async (step) => {
      if (step.id === "planet") throw new Error("slot planet unavailable");
      current = step.id;
    },
    shoot: async (i) => files.set(i, current),
    repeat: async (from, to) => files.set(to, files.get(from)),
    log: (m) => logs.push(m),
  });
  assert.deepEqual(result, { written: 10, cards: 2, skipped: 1 });
  assert.deepEqual([...files.entries()].sort((a, b) => a[0] - b[0]), [[6, "loudest"], [7, "loudest"], [8, "loudest"], [9, "end"], [10, "end"]]);
  assert.ok(logs.some((m) => m.includes("card planet: skipped")));
});

test("cardMoves: cards shot first land right after the frames actually written", () => {
  assert.deepEqual(cardMoves(3, 96), [[1, 97], [2, 98], [3, 99]]);
  // A bad first frame was skipped: 95 frames, the cards follow on with no gap.
  assert.deepEqual(cardMoves(2, 95), [[1, 96], [2, 97]]);
  assert.deepEqual(cardMoves(0, 96), []);
});
