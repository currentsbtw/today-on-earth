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
