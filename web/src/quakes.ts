// Opt-in earthquake layer from the USGS feed (M2.5+, past day). Nothing is fetched while
// the toggle is off; while on, the feed is fetched at most once every 10 minutes.
import { readPref, writePref } from './prefs';

const FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
const REFRESH_MS = 10 * 60 * 1000;
const PREF = 'toe.quakes';

export function initQuakes(button: HTMLButtonElement, draw: (data: GeoJSON.FeatureCollection | null) => void) {
  const state = button.querySelector<HTMLElement>('.layer-state')!;
  let on = readPref(PREF) === '1';
  let data: GeoJSON.FeatureCollection | null = null;
  let lastAttempt = 0;
  let loading = false;
  let timer = 0;

  const setUnavailable = (yes: boolean) => {
    button.classList.toggle('is-unavailable', yes);
    state.textContent = yes ? 'unavailable' : '';
  };

  async function refresh() {
    if (!on || loading) return;
    if (Date.now() - lastAttempt < REFRESH_MS) {
      if (data) draw(data);
      return;
    }
    loading = true;
    lastAttempt = Date.now();
    try {
      const res = await fetch(FEED);
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as GeoJSON.FeatureCollection;
      data = {
        type: 'FeatureCollection',
        features: (json.features ?? [])
          .filter((f) => f.geometry?.type === 'Point' && typeof f.properties?.mag === 'number')
          // Depth is the third coordinate; rendered features come back 2D, so keep it as a property.
          .map((f) => ({ ...f, properties: { ...f.properties, depth: (f.geometry as GeoJSON.Point).coordinates[2] ?? null } })),
      };
      setUnavailable(false);
      if (on) draw(data);
    } catch {
      setUnavailable(true);
    } finally {
      loading = false;
    }
  }

  function set(value: boolean) {
    on = value;
    writePref(PREF, on ? '1' : '0');
    button.setAttribute('aria-pressed', String(on));
    window.clearInterval(timer);
    if (on) {
      void refresh();
      timer = window.setInterval(() => void refresh(), REFRESH_MS);
    } else {
      draw(null);
      setUnavailable(false);
    }
  }

  button.addEventListener('click', () => set(!on));
  button.hidden = false;
  set(on);
}
