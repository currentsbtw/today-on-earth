// The newscast's voice (clip v4, build contract item 2): kokoro-js (pinned) with the model
// onnx-community/Kokoro-82M-v1.0-ONNX in fp32 on the CPU, voice af_heart. One 24 kHz mono
// 16-bit WAV per script line (line-<id>.wav), read at VOICE_SPEED; the measured seconds (sample count / rate) go
// back into the script. Deterministic for the same text on the same machine (checked by the
// prototype: identical PCM across runs and processes).
//
// The model (about 325 MB) is downloaded from Hugging Face on first use into the cache
// directory: $KOKORO_CACHE_DIR, else render/.cache/kokoro (gitignored). transformers.js reads no
// environment variable for this (not HF_HOME or TRANSFORMERS_CACHE; its default is a .cache
// folder inside node_modules), so the directory is set on its `env.cacheDir` here. The voice
// files ship inside the kokoro-js package and are read from it.
//
//   node src/speech.mjs --self-test     synthesises one short line and prints its seconds
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
export const DTYPE = "fp32";
export const SPEECH_RATE = 24_000;
/** kokoro-js's `speed` option for every line (1 is the model's own pace; owner's decision 2026-10-25). */
export const VOICE_SPEED = 1.1;
export const DEFAULT_CACHE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".cache", "kokoro");
/** kokoro-js tokenises with truncation at 512 tokens (about one phoneme per character). */
const LONG_LINE = 400;

const log = (msg) => process.stderr.write(`${msg}\n`);

/** The model cache directory: $KOKORO_CACHE_DIR or render/.cache/kokoro. */
export const cacheDir = () => resolve(process.env.KOKORO_CACHE_DIR || DEFAULT_CACHE_DIR);

let loading = null;

/** Load the model once per process. */
export function loadVoice() {
  loading ??= (async () => {
    const { env } = await import("@huggingface/transformers");
    const { KokoroTTS } = await import("kokoro-js");
    env.cacheDir = cacheDir();
    await mkdir(env.cacheDir, { recursive: true });
    const t0 = performance.now();
    const tts = await KokoroTTS.from_pretrained(MODEL, { dtype: DTYPE, device: "cpu" });
    log(`speech: loaded ${MODEL} (${DTYPE}) from ${env.cacheDir} in ${Math.round(performance.now() - t0)} ms`);
    return tts;
  })();
  return loading;
}

/** Float samples in [-1, 1] -> a mono 16-bit PCM WAV. */
export function pcm16Wav(samples, rate) {
  const n = samples.length;
  const wav = Buffer.alloc(44 + n * 2);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + n * 2, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return wav;
}

/** The WAV file a line is written to. */
export const lineWav = (outDir, id) => join(outDir, `line-${id}.wav`);

/**
 * Synthesise every line into `outDir/line-<id>.wav` and return the measured seconds per line,
 * in order (also as `{ id: seconds }` on `byId`). Logs each line's seconds, synthesis time and
 * peak level.
 * @param {{ id: string, text: string }[]} lines
 * @param {{ outDir: string, voice?: string, speed?: number }} opts
 * @returns {Promise<number[] & { byId: Record<string, number> }>}
 */
export async function synthesise(lines, { outDir, voice = "af_heart", speed = VOICE_SPEED }) {
  await mkdir(outDir, { recursive: true });
  const tts = await loadVoice();
  const seconds = /** @type {number[] & { byId: Record<string, number> }} */ ([]);
  seconds.byId = {};
  const t0 = performance.now();
  for (const line of lines) {
    if (line.text.length > LONG_LINE) log(`speech: warning: line ${line.id} is ${line.text.length} characters; kokoro-js truncates at 512 tokens`);
    const t = performance.now();
    const audio = await tts.generate(line.text, { voice, speed });
    const samples = audio.audio;
    if (audio.sampling_rate !== SPEECH_RATE) throw new Error(`kokoro returned ${audio.sampling_rate} Hz, expected ${SPEECH_RATE}`);
    if (!samples.length) throw new Error(`kokoro returned no audio for line ${line.id}`);
    let peak = 0;
    for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
    await writeFile(lineWav(outDir, line.id), pcm16Wav(samples, SPEECH_RATE));
    const s = samples.length / SPEECH_RATE;
    seconds.push(s);
    seconds.byId[line.id] = s;
    log(`speech: ${line.id}: ${s.toFixed(2)} s of audio in ${Math.round(performance.now() - t)} ms, peak ${(20 * Math.log10(peak || 1e-9)).toFixed(1)} dBFS`);
  }
  const total = seconds.reduce((a, b) => a + b, 0);
  log(`speech: ${lines.length} lines, ${total.toFixed(2)} s of audio in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  return seconds;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  if (!process.argv.includes("--self-test")) {
    log("usage: node src/speech.mjs --self-test");
    process.exit(2);
  }
  const outDir = resolve(process.env.KOKORO_SELF_TEST_OUT || join(cacheDir(), "..", "self-test"));
  const t0 = performance.now();
  synthesise([{ id: "self-test", text: "Today on Earth. This is a test of the synthetic voice." }], { outDir }).then(
    ([s]) => {
      console.log(`self-test: ${s.toFixed(3)} s of audio, ${Math.round(performance.now() - t0)} ms including the model load, written to ${lineWav(outDir, "self-test")}`);
    },
    (err) => {
      log(`self-test: failed: ${err.stack ?? err}`);
      process.exit(1);
    },
  );
}
