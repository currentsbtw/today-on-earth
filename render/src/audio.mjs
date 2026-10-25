// The clip's generated soundtrack, in the register of the visuals (sine tones and clicks,
// after Ryoji Ikeda's Datamatics): built from clip.html's plan, deterministic (no randomness),
// written as mono 16-bit PCM WAV. audioEvents() places the sounds in time; renderWav()
// synthesises them, fades in and out, and peak-normalises.
//
//   bed    55 + 110 Hz sines, about -20 dBFS, amplitude cycling over 10 s, the whole clip
//   click  2 kHz sine burst, 8 ms decay, about -16 dBFS, at each whole UTC hour the
//          time-lapse clock crosses (plan.hourMarks)
//   glide  sine rising 200 -> 800 Hz across each flight and the pull-back, about -18 dBFS
//   blip   880 + 1760 Hz, 120 ms decay, about -10 dBFS, at the first frame of each card
//   hit    110 Hz, 0.8 s decay, about -6 dBFS, at the first frame of the hook and the end
//
// A "decay" here is the time the envelope takes to fall 60 dB (exponential). The levels are
// absolute: the mix is only ever turned down (to a -1 dBFS peak) when sounds coincide and
// clip, never up, so a click stays a quiet tick and the hit is the loudest thing. An event's
// optional `db` turns that one sound down (or up) from its level above.
//
// The newscast (v4) uses only the bed, at about -26 dBFS, and a quiet glide (about -30 dBFS)
// under each flight, under the voice (newscastEvents); no clicks, blips or hits.

export const SAMPLE_RATE = 48_000;
const FADE_IN = 0.5;
const FADE_OUT = 1.5;
const PEAK = 10 ** (-1 / 20); // -1 dBFS
const db = (d) => 10 ** (d / 20);
const LN_1000 = Math.log(1000); // 60 dB
const TAU = 2 * Math.PI;

/**
 * The timed sounds of a clip, in seconds, sorted by start: one `bed` over the whole clip
 * (frames / fps + hold seconds), a `hit` at the hook and the end card, a `glide` under the
 * pull-back and each flight, a `blip` at each card, a `click` at each hour mark.
 * @param {{ fps: number, frames: number, hourMarks: number[], segments: { kind: string, start: number, frames: number }[] }} plan
 * @param {number} hold seconds the last frame is held after the timeline
 * @returns {{ kind: "bed" | "hit" | "glide" | "blip" | "click", t: number, dur: number }[]}
 */
export function audioEvents(plan, hold) {
  const at = (frame) => frame / plan.fps;
  const events = [{ kind: "bed", t: 0, dur: at(plan.frames) + hold }];
  for (const s of plan.segments) {
    if (s.kind === "hook" || s.kind === "end") events.push({ kind: "hit", t: at(s.start), dur: 0.8 });
    else if (s.kind === "pullback" || s.kind === "flight") events.push({ kind: "glide", t: at(s.start), dur: at(s.frames) });
    else if (s.kind === "card") events.push({ kind: "blip", t: at(s.start), dur: 0.12 });
  }
  for (const m of plan.hourMarks) events.push({ kind: "click", t: at(m), dur: 0.008 });
  return events.sort((a, b) => a.t - b.t);
}

/** dB of each newscast sound below its v3 level (bed -20 -> -26, glide -18 -> -30). */
export const NEWSCAST_BED_DB = -6;
export const NEWSCAST_GLIDE_DB = -12;

/**
 * The newscast's underlay, in seconds, sorted by start: one `bed` over the whole clip (frames
 * / fps + hold seconds) at about -26 dBFS and a quiet `glide` under each `flight` segment.
 * @param {{ fps: number, frames: number, segments: { kind: string, start: number, frames: number }[] }} plan
 * @param {number} hold
 * @returns {{ kind: "bed" | "glide", t: number, dur: number, db: number }[]}
 */
export function newscastEvents(plan, hold) {
  const at = (frame) => frame / plan.fps;
  const events = [{ kind: "bed", t: 0, dur: at(plan.frames) + hold, db: NEWSCAST_BED_DB }];
  for (const s of plan.segments) if (s.kind === "flight") events.push({ kind: "glide", t: at(s.start), dur: at(s.frames), db: NEWSCAST_GLIDE_DB });
  return events.sort((a, b) => a.t - b.t);
}

/** Add `f(dt)` for dt in [0, dur) seconds from `t` into `out` (clipped to its length). */
function add(out, rate, t, dur, f) {
  const from = Math.max(0, Math.round(t * rate));
  const to = Math.min(out.length, Math.round((t + dur) * rate));
  for (let i = from; i < to; i++) out[i] += f(i / rate - t);
}

/** Exponential decay falling 60 dB over `decay` seconds. */
const decayEnv = (dt, decay) => Math.exp((-LN_1000 * dt) / decay);

const VOICES = {
  bed: (dt) => (db(-20) / 2) * (0.65 + 0.35 * Math.sin((TAU * dt) / 10 - Math.PI / 2)) * (Math.sin(TAU * 55 * dt) + Math.sin(TAU * 110 * dt)),
  click: (dt, dur) => db(-16) * decayEnv(dt, dur) * Math.sin(TAU * 2000 * dt),
  blip: (dt, dur) => db(-10) * decayEnv(dt, dur) * (0.6 * Math.sin(TAU * 880 * dt) + 0.4 * Math.sin(TAU * 1760 * dt)),
  hit: (dt, dur) => db(-6) * decayEnv(dt, dur) * Math.sin(TAU * 110 * dt),
  glide: (dt, dur) => {
    // Linear sweep 200 -> 800 Hz: phase is the integral of the frequency. 30 ms attack, 120 ms release.
    const ramp = Math.min(1, dt / 0.03, (dur - dt) / 0.12);
    return db(-18) * Math.max(0, ramp) * Math.sin(TAU * (200 * dt + (600 * dt * dt) / (2 * dur)));
  },
};

/**
 * Synthesise `events` (audioEvents' shape) into a mono 16-bit PCM WAV `seconds` long: fade
 * in over 0.5 s and out over the last 1.5 s, turned down to a -1 dBFS peak if louder (never
 * up: the voices' levels are absolute), clamp.
 * @param {{ kind: string, t: number, dur: number, db?: number }[]} events
 * @param {number} seconds
 * @param {number} rate samples per second
 * @returns {Buffer}
 */
export function renderWav(events, seconds, rate = SAMPLE_RATE) {
  const n = Math.round(seconds * rate);
  const mix = new Float64Array(n);
  for (const e of events) {
    const voice = VOICES[e.kind];
    if (!voice) throw new Error(`unknown sound ${e.kind}`);
    // The decaying sounds ring for their decay time; the bed and glides last their duration.
    const level = db(e.db ?? 0);
    add(mix, rate, e.t, e.dur, (dt) => level * voice(dt, e.dur));
  }
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    mix[i] *= Math.min(1, t / FADE_IN, (seconds - t) / FADE_OUT);
    peak = Math.max(peak, Math.abs(mix[i]));
  }
  const gain = peak > PEAK ? PEAK / peak : 1;
  const wav = Buffer.alloc(44 + n * 2);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + n * 2, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16); // fmt chunk size
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28); // byte rate
  wav.writeUInt16LE(2, 32); // block align
  wav.writeUInt16LE(16, 34); // bits per sample
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mix[i] * gain)) * 32767), 44 + i * 2);
  return wav;
}
