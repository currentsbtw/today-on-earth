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
 * the first comma, without a trailing "d.c." / "city" / "metropolitan".
 * "Washington, D.C." -> "washington", "Zürich" -> "zurich", "Mexico City" -> "mexico".
 */
export function placeKey(name: string): string {
  return name
    .split(',')[0]
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+(d\.c\.|city|metropolitan)$/, '')
    .trim();
}

/**
 * The 11-character id of a YouTube video URL, or null. Accepts youtube.com/watch?v=<id>,
 * youtu.be/<id>, youtube.com/shorts/<id> and youtube.com/embed/<id>; rejects everything else.
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
  else if (host === 'youtube.com' && parts.length === 2 && (parts[0] === 'shorts' || parts[0] === 'embed')) id = parts[1];
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}
