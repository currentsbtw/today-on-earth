import { Unzip, UnzipInflate } from "fflate";

export const GDELT_BASE = "https://data.gdeltproject.org/gdeltv2/";
export const SLOT_MS = 15 * 60 * 1000;

/**
 * GDELT publishes two GKG streams every 15 minutes: the English one and the translingual one
 * (machine-translated articles from 65 languages, which is where `srclc:` TranslationInfo
 * appears). The translingual stream usually lags the English one by an hour or so.
 */
export interface Feed {
  name: string;
  suffix: string;
}
export const FEEDS: readonly Feed[] = [
  { name: "english", suffix: ".gkg.csv.zip" },
  { name: "translingual", suffix: ".translation.gkg.csv.zip" },
];

/** Epoch ms -> "YYYYMMDDHHMMSS" (UTC). */
export function toStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

/** "YYYYMMDDHHMMSS" -> epoch ms (UTC), NaN when malformed. */
export function fromStamp(s: string): number {
  if (!/^\d{14}$/.test(s)) return NaN;
  return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14));
}

export function floorSlot(ms: number): number {
  return Math.floor(ms / SLOT_MS) * SLOT_MS;
}

export function fileUrl(feed: Feed, stamp: string): string {
  return `${GDELT_BASE}${stamp}${feed.suffix}`;
}

export class HttpError extends Error {
  constructor(public status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
  }
}

/** fetch with timeout and retries on network errors / 5xx. Returns null on 404. */
export async function fetchWithRetry(url: string, attempts = 3, timeoutMs = 180_000): Promise<Response | null> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 404) return null;
      if (res.ok) return res;
      lastErr = new HttpError(res.status, url);
      await res.body?.cancel();
      if (res.status < 500 && res.status !== 429) throw lastErr;
    } catch (err) {
      if (err instanceof HttpError && err.status < 500 && err.status !== 429) throw err;
      lastErr = err;
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
  throw lastErr;
}

/**
 * Stream a single-entry .zip over HTTP and call `onLine` for every text line, without
 * holding the whole file in memory. Returns false when the file does not exist (404).
 */
export async function streamZipLines(url: string, onLine: (line: string) => void): Promise<boolean> {
  const res = await fetchWithRetry(url);
  if (!res) return false;
  if (!res.body) throw new Error(`empty body for ${url}`);

  const decoder = new TextDecoder("utf-8");
  let carry = "";
  let fileError: Error | null = null;
  let sawFile = false;

  const emit = (text: string) => {
    carry += text;
    let nl: number;
    while ((nl = carry.indexOf("\n")) >= 0) {
      const line = carry.slice(0, nl).replace(/\r$/, "");
      carry = carry.slice(nl + 1);
      if (line) onLine(line);
    }
  };

  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (file) => {
    if (sawFile) return; // GDELT zips hold exactly one CSV; ignore anything else
    sawFile = true;
    file.ondata = (err, data, final) => {
      if (err) {
        fileError = err;
        return;
      }
      emit(decoder.decode(data, { stream: !final }));
    };
    file.start();
  };

  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    unzip.push(chunk);
    if (fileError) throw fileError;
  }
  unzip.push(new Uint8Array(0), true);
  if (fileError) throw fileError;
  if (!sawFile) throw new Error(`no file inside zip ${url}`);
  emit(decoder.decode());
  if (carry) {
    onLine(carry.replace(/\r$/, ""));
    carry = "";
  }
  return true;
}

/** Run `fn` over `items` with at most `limit` in flight; results keep input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
