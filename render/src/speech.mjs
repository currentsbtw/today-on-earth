// The newscast's voice (clip v4, build contract item 2): kokoro-js (pinned) with the model
// onnx-community/Kokoro-82M-v1.0-ONNX in fp32 on the CPU, voice af_heart. One 24 kHz mono
// 16-bit WAV per script line (line-<id>.wav), read at VOICE_SPEED; the measured seconds (sample count / rate) go
// back into the script. Deterministic for the same text on the same machine (checked by the
// prototype: identical PCM across runs and processes).
//
// A story whose headline is read in another language (`story.readIn`, v4.2; VOICE_FOR_LANG)
// is two pieces in one line WAV: the frame, "{Place}. The humans wrote, in {Language}:" or any
// show-mode variant ending ", in {Language}:" (`story.frame`, as script.mjs built it), by af_heart (English phonemes, kokoro-js's own),
// PIECE_GAP of silence, then the headline by that language's voice. kokoro-js phonemises
// English only (its espeak-ng carries English data, and generate() refuses other voices), so
// the headline's phonemes come from render/py/phonemize.py (misaki on espeak-ng, cutlet, or
// jieba and pypinyin; run by uv in the locked environment of render/py, created in
// render/.cache/py) and go to the model through tts.tokenizer() and generate_from_ids(), as the
// Python kokoro package feeds its phonemes. One uv process phonemises every such line.
//
// The model (about 325 MB) is downloaded from Hugging Face on first use into the cache
// directory: $KOKORO_CACHE_DIR, else render/.cache/kokoro (gitignored). transformers.js reads no
// environment variable for this (not HF_HOME or TRANSFORMERS_CACHE; its default is a .cache
// folder inside node_modules), so the directory is set on its `env.cacheDir` here. The voice
// files ship inside the kokoro-js package and are read from it.
//
//   node src/speech.mjs --self-test     synthesises one English and one Spanish line, prints their seconds
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
export const DTYPE = "fp32";
export const SPEECH_RATE = 24_000;
/** kokoro-js's `speed` option for every line (1 is the model's own pace; owner's decision 2026-10-25). */
export const VOICE_SPEED = 1.1;
const RENDER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_CACHE_DIR = join(RENDER_DIR, ".cache", "kokoro");
/** kokoro-js tokenises with truncation at 512 tokens (about one phoneme per character). */
const LONG_LINE = 400;
/** The English voice: every line, and the frame of a headline read in another language. */
export const ENGLISH_VOICE = "af_heart";
/**
 * The Kokoro 1.0 voice that reads a headline in each language (owner 2026-10-27; female voices,
 * to match af_heart). A headline in any other language is "on screen" (script.mjs).
 */
export const VOICE_FOR_LANG = Object.freeze({
  es: "ef_dora",
  fr: "ff_siwis",
  hi: "hf_alpha",
  it: "if_sara",
  ja: "jf_alpha",
  pt: "pf_dora",
  zh: "zf_xiaobei",
});
/** Seconds of silence between the frame (English) and the headline (its language) in one line. */
export const PIECE_GAP = 0.25;
/** The Python phonemiser's uv project; its environment is $UV_PROJECT_ENVIRONMENT, else render/.cache/py. */
export const PY_PROJECT = join(RENDER_DIR, "py");
const pyEnvironment = () => resolve(process.env.UV_PROJECT_ENVIRONMENT || join(RENDER_DIR, ".cache", "py"));

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
 * A line read in two pieces: the frame, "{Place}. The humans wrote, in {Language}:" or another
 * show-mode variant (English; `story.frame` as script.mjs built it, so a colon inside the headline never moves the split),
 * and the headline (the rest of the line's text), with the headline's language and voice.
 * `frame` is the English piece (the frame without its trailing space).
 * @param {{ id: string, text: string, story: { frame: string, readIn: string } }} line
 */
export function linePieces(line) {
  const { frame, readIn } = line.story;
  const voice = VOICE_FOR_LANG[readIn];
  if (!voice) throw new Error(`line ${line.id}: no voice for language ${JSON.stringify(readIn)}`);
  if (typeof frame !== "string" || !frame.trim()) throw new Error(`line ${line.id}: no frame for the English piece`);
  if (!line.text.startsWith(frame) || !line.text.slice(frame.length).trim()) throw new Error(`line ${line.id}: the text does not start with "${frame}" and a headline`);
  return { frame: frame.trim(), headline: line.text.slice(frame.length), lang: readIn, voice };
}

/** Seconds the phonemiser may take (a first uv sync included) before it is stopped. */
export const PHONEMIZE_TIMEOUT = 120;

/**
 * Phonemes for `{ id, lang, text }` items from render/py/phonemize.py, in one uv process.
 * Resolves `{ phonemes: { id: phonemes }, failed: { id: reason } }` (an item whose phonemes
 * come back empty or with an error is failed); rejects when the phonemiser cannot run at all:
 * uv missing, a failed sync or a crash (non-zero exit), PHONEMIZE_TIMEOUT, or
 * KOKORO_PHONEMIZER=none (set nowhere by default; it simulates the failure).
 * @param {{ id: string, lang: string, text: string }[]} items
 * @returns {Promise<{ phonemes: Record<string, string>, failed: Record<string, string> }>}
 */
export function phonemize(items) {
  if (process.env.KOKORO_PHONEMIZER === "none") return Promise.reject(new Error("KOKORO_PHONEMIZER=none"));
  const args = ["run", "--project", PY_PROJECT, "--locked", "--quiet", "python", "-I", join(PY_PROJECT, "phonemize.py")];
  return new Promise((done, reject) => {
    const child = spawn("uv", args, { env: { ...process.env, UV_PROJECT_ENVIRONMENT: pyEnvironment() }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`timed out after ${PHONEMIZE_TIMEOUT} s`));
    }, PHONEMIZE_TIMEOUT * 1000);
    child.stdout.setEncoding("utf8").on("data", (d) => (out += d));
    child.stderr.setEncoding("utf8").on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`cannot run uv (${e.code ?? e.message})`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`uv ${args.join(" ")} exited with ${code}: ${err.trim().split("\n").slice(-3).join(" | ")}`));
      const phonemes = {};
      const failed = {};
      for (const raw of out.split("\n")) {
        if (!raw.trim()) continue;
        let r;
        try {
          r = JSON.parse(raw);
        } catch {
          continue;
        }
        if (typeof r.phonemes === "string" && r.phonemes.trim()) phonemes[r.id] = r.phonemes;
        else failed[r.id] = r.error ?? "no phonemes";
      }
      for (const i of items) if (!(i.id in phonemes) && !(i.id in failed)) failed[i.id] = "no phonemes";
      done({ phonemes, failed });
    });
    child.stdin.on("error", () => {}); // a failed start is reported by "error" or "close"
    child.stdin.end(`${items.map((i) => JSON.stringify(i)).join("\n")}\n`, "utf8");
  });
}

/** Float samples of `text` (English, kokoro-js's phonemiser) or of `phonemes` (any voice). */
async function speak(tts, { text, phonemes, voice, speed, id }) {
  let audio;
  if (phonemes === undefined) {
    audio = await tts.generate(text, { voice, speed });
  } else {
    if (phonemes.length > 510) log(`speech: warning: line ${id} has ${phonemes.length} phonemes; kokoro-js truncates at 512 tokens`);
    const { input_ids } = tts.tokenizer(phonemes, { truncation: true });
    audio = await tts.generate_from_ids(input_ids, { voice, speed });
  }
  if (audio.sampling_rate !== SPEECH_RATE) throw new Error(`kokoro returned ${audio.sampling_rate} Hz, expected ${SPEECH_RATE}`);
  if (!audio.audio.length) throw new Error(`kokoro returned no audio for line ${id}`);
  return audio.audio;
}

/** Float sample arrays joined with `gap` seconds of silence between them. */
function joinPieces(pieces, gap) {
  const silence = Math.round(gap * SPEECH_RATE);
  const out = new Float32Array(pieces.reduce((n, p) => n + p.length, 0) + silence * (pieces.length - 1));
  let at = 0;
  for (const p of pieces) {
    out.set(p, at);
    at += p.length + silence;
  }
  return out;
}

/**
 * Synthesise every line into `outDir/line-<id>.wav` and return the measured seconds per line,
 * in order (also as `{ id: seconds }` on `byId`, and on `voices` the voice or voices that read
 * each line, "af_heart" or "af_heart + ef_dora"). A line whose story has `readIn` is read in two
 * pieces (linePieces), its headline from phonemize(). When the phonemiser cannot run, or gives
 * no phonemes for a line, that line is replaced by `onScreen(line)` (script.mjs onScreenLine,
 * the "on screen" form) and read by the English voice; the replacements are on `replaced`
 * (`{ id: line }`) for the caller to put in the script. Without `onScreen` such a failure
 * throws. Logs each line's seconds, voices, synthesis time and peak level.
 * @param {{ id: string, text: string, story?: { place: string, readIn?: string } }[]} lines
 * @param {{ outDir: string, voice?: string, speed?: number, onScreen?: (line: any) => any }} opts
 * @returns {Promise<number[] & { byId: Record<string, number>, voices: Record<string, string>, replaced: Record<string, any> }>}
 */
export async function synthesise(lines, { outDir, voice = ENGLISH_VOICE, speed = VOICE_SPEED, onScreen }) {
  await mkdir(outDir, { recursive: true });
  const read = new Map(lines.filter((l) => l.story?.readIn).map((l) => [l.id, linePieces(l)]));
  let phonemes = {};
  /** @type {Record<string, any>} */
  const replaced = {};
  if (read.size) {
    const tp = performance.now();
    let failed = {};
    try {
      ({ phonemes, failed } = await phonemize([...read].map(([id, p]) => ({ id, lang: p.lang, text: p.headline }))));
    } catch (err) {
      failed = Object.fromEntries([...read.keys()].map((id) => [id, err.message]));
      log(`speech: the phonemiser failed (${err.message}); ${[...read].map(([id, p]) => `${id} ${p.lang}`).join(", ")} fall back to the on-screen form`);
    }
    const bad = Object.keys(failed).filter((id) => read.has(id));
    if (bad.length && Object.keys(phonemes).length) log(`speech: no phonemes for ${bad.map((id) => `${id} (${failed[id]})`).join(", ")}; the on-screen form`);
    if (bad.length && !onScreen) throw new Error(`phonemize: ${bad.map((id) => `${id}: ${failed[id]}`).join("; ")}`);
    for (const id of bad) {
      read.delete(id);
      replaced[id] = onScreen(lines.find((l) => l.id === id));
    }
    if (read.size) log(`speech: phonemised ${read.size} headline${read.size === 1 ? "" : "s"} (${[...read].map(([id, p]) => `${id} ${p.lang}`).join(", ")}) in ${Math.round(performance.now() - tp)} ms`);
  }
  const tts = await loadVoice();
  const seconds = /** @type {number[] & { byId: Record<string, number>, voices: Record<string, string>, replaced: Record<string, any> }} */ ([]);
  seconds.byId = {};
  seconds.voices = {};
  seconds.replaced = replaced;
  const t0 = performance.now();
  for (const original of lines) {
    const line = replaced[original.id] ?? original;
    if (line.text.length > LONG_LINE) log(`speech: warning: line ${line.id} is ${line.text.length} characters; kokoro-js truncates at 512 tokens`);
    const t = performance.now();
    const two = read.get(line.id);
    let samples;
    if (two) {
      const frame = await speak(tts, { text: two.frame, voice, speed, id: line.id });
      const headline = await speak(tts, { phonemes: phonemes[line.id], voice: two.voice, speed, id: line.id });
      samples = joinPieces([frame, headline], PIECE_GAP);
      seconds.voices[line.id] = `${voice} + ${two.voice}`;
    } else {
      samples = await speak(tts, { text: line.text, voice, speed, id: line.id });
      seconds.voices[line.id] = voice;
    }
    let peak = 0;
    for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
    await writeFile(lineWav(outDir, line.id), pcm16Wav(samples, SPEECH_RATE));
    const s = samples.length / SPEECH_RATE;
    seconds.push(s);
    seconds.byId[line.id] = s;
    log(`speech: ${line.id}: ${s.toFixed(2)} s of audio (${seconds.voices[line.id]}) in ${Math.round(performance.now() - t)} ms, peak ${(20 * Math.log10(peak || 1e-9)).toFixed(1)} dBFS`);
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
  const said = "Francia vive nueva jornada de protestas";
  const lines = [
    { id: "self-test", text: "Today on Earth. This is a test of the synthetic voice." },
    { id: "self-test-es", kind: "story", text: `Madrid. The humans wrote, in Spanish: ${said}.`, story: { place: "Madrid", headline: said, lang: "es", spoken: true, said, readIn: "es", frame: "Madrid. The humans wrote, in Spanish: " } },
  ];
  // KOKORO_PHONEMIZER=none simulates a phonemiser failure: the Spanish line falls back to the on-screen form.
  import("./script.mjs")
    .then(({ onScreenLine }) => synthesise(lines, { outDir, onScreen: onScreenLine }))
    .then(
    (seconds) => {
      for (const l of lines) console.log(`self-test: ${l.id}: ${seconds.byId[l.id].toFixed(3)} s of audio (${seconds.voices[l.id]}): "${(seconds.replaced[l.id] ?? l).text}", written to ${lineWav(outDir, l.id)}`);
      console.log(`self-test: ${Math.round(performance.now() - t0)} ms in all, including the model load and the phonemiser`);
    },
    (err) => {
      log(`self-test: failed: ${err.stack ?? err}`);
      process.exit(1);
    },
  );
}
