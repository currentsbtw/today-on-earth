import assert from "node:assert/strict";
import { test } from "node:test";
import { clipDate, ffmpegArgs, frameName, frameUrl, parseArgs, stampOf } from "../src/lib.mjs";

test("parseArgs: defaults, platform browser channel, validation", () => {
  const o = parseArgs(["--site", "https://currentsbtw.github.io/today-on-earth/", "--out", "out"], "linux");
  assert.deepEqual(o, { site: "https://currentsbtw.github.io/today-on-earth", out: "out", w: 1080, h: 1920, fps: 8, hold: 2, channel: "chrome", page: "clip" });
  assert.equal(parseArgs(["--site=http://localhost:5173", "--out=o", "--w", "1920", "--h", "1080"], "win32").channel, "msedge");
  assert.throws(() => parseArgs(["--out", "o"]), /--site/);
  assert.throws(() => parseArgs(["--site", "ftp://x", "--out", "o"]), /http/);
  assert.throws(() => parseArgs(["--site", "http://x", "--out", "o", "--w", "1081"]), /even/);
  assert.throws(() => parseArgs(["--site", "http://x", "--out", "o", "--fps", "0"]), /fps/);
  assert.throws(() => parseArgs(["--site", "http://x", "--out", "o", "--bogus", "1"]), /unknown/);
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
