import assert from "node:assert/strict";
import { test } from "node:test";
import { audioEvents, newscastEvents, renderWav } from "../src/audio.mjs";

const plan = {
  fps: 30,
  frames: 111,
  hourMarks: [17, 27, 37],
  segments: [
    { kind: "hook", start: 0, frames: 6 },
    { kind: "pullback", start: 6, frames: 6 },
    { kind: "lapse", start: 12, frames: 30 },
    { kind: "flight", slot: "loudest", start: 42, frames: 6 },
    { kind: "card", slot: "loudest", start: 48, frames: 54 },
    { kind: "end", start: 102, frames: 9 },
  ],
};

test("audioEvents: bed over the clip and hold, hits, glides, blips and hour clicks at their frame times", () => {
  const events = audioEvents(plan, 1);
  const of = (kind) => events.filter((e) => e.kind === kind).map((e) => [e.t, e.dur]);
  assert.deepEqual(of("bed"), [[0, 111 / 30 + 1]]);
  assert.deepEqual(of("hit"), [[0, 0.8], [102 / 30, 0.8]]);
  assert.deepEqual(of("glide"), [[6 / 30, 6 / 30], [42 / 30, 6 / 30]]);
  assert.deepEqual(of("blip"), [[48 / 30, 0.12]]);
  assert.deepEqual(of("click").map(([t]) => t), [17 / 30, 27 / 30, 37 / 30]);
  // Sorted by start, and the same plan always gives the same events.
  assert.deepEqual(events.map((e) => e.t), [...events.map((e) => e.t)].sort((a, b) => a - b));
  assert.deepEqual(audioEvents(plan, 1), events);
});

/** Peak of |sample| / 32767 over [from, to) seconds of a 16-bit mono WAV at `rate`. */
function peakIn(wav, rate, from, to) {
  let peak = 0;
  for (let i = Math.round(from * rate); i < Math.round(to * rate); i++) peak = Math.max(peak, Math.abs(wav.readInt16LE(44 + i * 2)));
  return peak / 32767;
}

test("renderWav: RIFF/PCM header, length, peak under -1 dBFS, sound at an event and silence elsewhere, deterministic", () => {
  const rate = 8000;
  const wav = renderWav([{ kind: "click", t: 1, dur: 0.008 }, { kind: "blip", t: 2, dur: 0.12 }], 3, rate);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt32LE(4), wav.length - 8);
  assert.equal(wav.toString("ascii", 8, 16), "WAVEfmt ");
  assert.deepEqual([wav.readUInt16LE(20), wav.readUInt16LE(22), wav.readUInt32LE(24), wav.readUInt16LE(34)], [1, 1, rate, 16]);
  assert.equal(wav.toString("ascii", 36, 40), "data");
  assert.equal(wav.readUInt32LE(40), 3 * rate * 2);
  assert.equal(wav.length, 44 + 3 * rate * 2);
  // Levels are absolute and the mix is never turned up: the peak stays under -1 dBFS.
  const peak = peakIn(wav, rate, 0, 3);
  assert.ok(peak > 0.1 && peak <= 10 ** (-1 / 20), `peak ${peak}`);
  // The click at about -16 dBFS, the blip at about -10 dBFS.
  assert.ok(peakIn(wav, rate, 1, 1.01) > 0.1);
  assert.ok(peakIn(wav, rate, 2, 2.05) > 0.15);
  assert.equal(peakIn(wav, rate, 0, 0.99), 0);
  assert.ok(peakIn(wav, rate, 1.2, 1.9) < 0.001);
  assert.deepEqual(renderWav([{ kind: "click", t: 1, dur: 0.008 }, { kind: "blip", t: 2, dur: 0.12 }], 3, rate), wav);
  // The whole soundtrack: the bed fills the clip, faded to silence at both ends.
  const full = renderWav(audioEvents(plan, 1), 111 / 30 + 1, rate);
  assert.ok(peakIn(full, rate, 0.6, 3) > 0.05);
  assert.equal(full.readInt16LE(44), 0);
  assert.ok(peakIn(full, rate, 111 / 30 + 1 - 0.01, 111 / 30 + 1) < 0.01);
  assert.throws(() => renderWav([{ kind: "noise", t: 0, dur: 1 }], 1, rate), /unknown sound/);
});

test("newscastEvents: the bed at about -26 dBFS over the clip and hold, a quiet glide per flight, nothing else", () => {
  const news = {
    fps: 30,
    frames: 300,
    segments: [
      { kind: "open", line: "open", start: 0, frames: 120 },
      { kind: "flight", line: "story-1", start: 120, frames: 36 },
      { kind: "card", line: "story-1", start: 156, frames: 84 },
      { kind: "close", line: "close", start: 240, frames: 60 },
    ],
  };
  const events = newscastEvents(news, 1);
  assert.deepEqual(events, [
    { kind: "bed", t: 0, dur: 11, db: -6 },
    { kind: "glide", t: 4, dur: 1.2, db: -12 },
  ]);
  // The bed's peak: about -26 dBFS (the v3 bed's -20 turned down 6 dB), no clicks or blips.
  const rate = 8000;
  const wav = renderWav(events, 11, rate);
  const bedPeak = peakIn(wav, rate, 0.6, 3.9);
  assert.ok(bedPeak > 10 ** (-29 / 20) && bedPeak < 10 ** (-25 / 20), `bed peak ${(20 * Math.log10(bedPeak)).toFixed(1)} dBFS`);
  assert.ok(peakIn(wav, rate, 0, 11) < 10 ** (-20 / 20));
});
