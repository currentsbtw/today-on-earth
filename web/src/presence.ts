// The observers count: how many browsers are on the site now, from the presence Worker
// (presence/README.md). Each tab sends only a random id it made for itself. Without a
// configured URL, or while the Worker cannot be reached, the label reads plain "Observers".
import { count } from './format';

const LABEL = 'Observers';
const INTERVAL_MS = 30_000;
const ID_KEY = 'toe.presenceId';

/** A random id for this tab, kept in sessionStorage so a reload is not counted twice. */
function sessionId(): string {
  const fresh = () => {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    // randomUUID needs a secure context; a LAN address on the dev server is not one.
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  };
  try {
    const kept = sessionStorage.getItem(ID_KEY);
    if (kept && /^[A-Za-z0-9_-]{8,64}$/.test(kept)) return kept;
    const id = fresh();
    sessionStorage.setItem(ID_KEY, id);
    return id;
  } catch {
    return fresh();
  }
}

export function initPresence(label: HTMLElement | null) {
  if (!label) return;
  label.textContent = LABEL;
  const base = String(import.meta.env.VITE_PRESENCE_URL ?? '').trim().replace(/\/+$/, '');
  if (!base) return;

  const id = sessionId();
  const body = JSON.stringify({ id });
  let timer = 0;
  let sent = 0; // pings sent; only the newest one's answer is shown
  let logged = false;

  const show = (n: number | null) => {
    label.textContent = n === null ? LABEL : `${LABEL} · ${count(n)}`;
  };

  const ping = async () => {
    const mine = ++sent;
    try {
      const res = await fetch(`${base}/ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        cache: 'no-store',
        credentials: 'omit',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const n = ((await res.json()) as { observers?: unknown }).observers;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) throw new Error('bad response');
      if (mine === sent) show(n);
    } catch (err) {
      if (mine === sent) show(null);
      if (!logged) {
        logged = true;
        console.debug('Observers count unavailable', err);
      }
    }
  };

  const stop = () => {
    window.clearInterval(timer);
    timer = 0;
  };
  const start = () => {
    stop();
    void ping();
    timer = window.setInterval(() => void ping(), INTERVAL_MS);
  };

  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  // Leaving: drop out of the count now rather than after the 75 s window. The beacon is
  // text/plain on purpose: a JSON beacon needs a CORS preflight, which fails because beacons
  // always carry credentials mode "include"; text/plain is a simple request and the Worker
  // parses the body whatever its type.
  window.addEventListener('pagehide', () => {
    stop();
    try {
      navigator.sendBeacon(`${base}/leave`, new Blob([body], { type: 'text/plain' }));
    } catch {
      // A browser that refuses the beacon simply ages out of the count.
    }
  });
  // Back from the back/forward cache: the leave was sent, so join again.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && !document.hidden) start();
  });
  if (!document.hidden) start();
}
