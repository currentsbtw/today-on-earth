// Small display helpers. Every string here is a label or a count, never commentary.

const numberFormat = new Intl.NumberFormat('en-US');

export function count(n: number): string {
  return numberFormat.format(n);
}

export function plural(n: number, one: string, many: string): string {
  return `${count(n)} ${n === 1 ? one : many}`;
}

/** "19:30 UTC" */
export function utcTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm} UTC`;
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const dayKey = (d: Date) => Math.floor(d.getTime() / 86_400_000);
const hourMinute = (d: Date) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;

/**
 * The one rule for times that may cross midnight: "14:30", or "WED 14:30" when the time falls
 * on a different UTC day than `ref` (an ISO time or epoch ms; default now; null forces the
 * weekday). No unit; "" for an unreadable time. Story spans, the replay stamps, the PLAY
 * readout and the recent-frames table all say the day through this.
 */
export function utcDayTime(iso: string, ref: string | number | null = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const r = ref === null ? null : new Date(ref);
  const same = r !== null && !Number.isNaN(r.getTime()) && dayKey(r) === dayKey(d);
  return same ? hourMinute(d) : `${WEEKDAYS[d.getUTCDay()]} ${hourMinute(d)}`;
}

/**
 * A story's time span: "01:15–04:30 UTC" within one UTC day, "WED 14:30 – THU 14:15 UTC"
 * across midnight, one time when the first and last article coincide.
 */
export function utcSpan(first: string, last: string): string {
  const a = utcDayTime(first, first);
  const b = utcDayTime(last, last);
  if (!a || !b) return a || b ? `${a || b} UTC` : '';
  if (utcDayTime(last, first) !== b) return `${utcDayTime(first, null)} – ${utcDayTime(last, null)} UTC`;
  return a === b ? `${b} UTC` : `${a}–${b} UTC`;
}

/** "just now", "12m ago", "2h ago", "3d ago" */
export function ago(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const minutes = Math.max(0, Math.round((now - t) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Only http(s) links are rendered as links. */
export function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

/** First part of a GDELT full name: "Paris, Ile-de-France, France" -> "Paris". */
export function shortName(name: string): string {
  return name.split(',')[0].trim();
}

/**
 * Key for matching a city to a news place name: lowercase, no diacritics, the part before
 * the first comma, without a trailing "d.c." / "metropolitan". "City" stays, because
 * Kansas City is not Kansas.
 * "Washington, D.C." -> "washington", "Zürich" -> "zurich", "Kansas City" -> "kansas city".
 */
export function placeKey(name: string): string {
  return name
    .split(',')[0]
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+(d\.c\.|metropolitan)$/, '')
    .trim();
}

/**
 * The 11-character id of a YouTube video URL, or null. Accepts youtube.com/watch?v=<id>,
 * youtu.be/<id>, and youtube.com/shorts/, /embed/, /live/ and /v/<id>; rejects everything else.
 */
export function youtubeId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.replace(/^(www|m)\./, '');
  const parts = u.pathname.split('/').filter(Boolean);
  let id: string | null = null;
  if (host === 'youtu.be' && parts.length === 1) id = parts[0];
  else if (host === 'youtube.com' && parts.length === 1 && parts[0] === 'watch') id = u.searchParams.get('v');
  else if (host === 'youtube.com' && parts.length === 2 && ['shorts', 'embed', 'live', 'v'].includes(parts[0])) id = parts[1];
  // "videoseries" is a playlist path that happens to be 11 characters, not a video id.
  return id && id !== 'videoseries' && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

/** Permalink / clip stamp of a frame time: "2026-10-21T04:47:14Z" -> "20261021T044714Z" */
export const stampOf = (at: string) => at.replace(/[-:.]/g, '');

/** English names for ISO codes; null where the browser has no Intl.DisplayNames. */
const displayNames = (type: 'region' | 'language') => {
  try {
    return new Intl.DisplayNames(['en'], { type, fallback: 'none' });
  } catch {
    return null;
  }
};
const regionNames = displayNames('region');
const languageNames = displayNames('language');

/**
 * The English name of an ISO 3166-1 alpha-2 region ("GR" -> "Greece") or an ISO 639 language
 * ("el" -> "Greek"); "" when the code is empty, malformed or unknown to the browser, so the
 * caller shows the code alone.
 */
export function codeName(code: string, type: 'region' | 'language'): string {
  const names = type === 'region' ? regionNames : languageNames;
  const ok = type === 'region' ? /^[A-Za-z]{2}$/.test(code) : /^[A-Za-z]{2,3}$/.test(code);
  if (!names || !ok) return '';
  try {
    const name = names.of(type === 'region' ? code.toUpperCase() : code.toLowerCase()) ?? '';
    return name.toLowerCase() === code.toLowerCase() ? '' : name;
  } catch {
    return '';
  }
}

/** How many of the largest news countries the site names (heat.json's topOutletCountries). */
export const LARGEST_SHOWN = 12;

/**
 * The silent ones: the codes among the first `k` of `largest` (heat.json's topOutletCountries,
 * largest first) that are not in `covered` (the outlet countries of a place or a story) and
 * are not `home` (the place's own country, never a gap). In `largest`'s order.
 */
export function silentAmong(covered: Iterable<string>, largest: [string, number][], home: string, k = LARGEST_SHOWN): string[] {
  const seen = new Set<string>();
  for (const cc of covered) seen.add(cc.toUpperCase());
  const own = home.toUpperCase();
  return largest
    .slice(0, k)
    .map(([cc]) => cc.toUpperCase())
    .filter((cc) => cc && cc !== own && !seen.has(cc));
}

/**
 * "silent: none of the 12 largest news countries" for an empty list, else "silent:" (the
 * caller sets the codes after it, with their names). `k`: how many largest countries were
 * looked at, fewer than 12 when the snapshot lists fewer.
 */
export function silentLine(codes: string[], k = LARGEST_SHOWN): string {
  return codes.length ? 'silent:' : `silent: none of the ${k} largest news countries`;
}

/**
 * The place's normal in words: "usually about 37 articles a day · today ×2.4", where `ratio`
 * is projection.ts's relativeRatio(n, b) (floor 3; passed in so this file stays import-free
 * for scripts/build-places.mjs); "usually no articles on most days" when `b` is 0; "" below 3
 * baseline days.
 */
export function normalLine(b: number, n: number, baselineDays: number, ratio: (n: number, b: number) => number): string {
  if (!(baselineDays >= 3) || !Number.isFinite(b) || b < 0) return '';
  if (b === 0) return 'usually no articles on most days';
  const usual = Math.round(b);
  return `usually about ${plural(usual, 'article', 'articles')} a day · today ×${ratio(n, b).toFixed(1)}`;
}
