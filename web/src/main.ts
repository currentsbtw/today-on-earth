import './style.css';
import { loadCell, loadHeat, type Heat, type HeatCell } from './data';
import { count, plural, utcTime } from './format';
import { createMap } from './map';
import * as panel from './panel';

const status = document.getElementById('status')!;
const totals = document.getElementById('totals')!;
const snapshot = document.getElementById('snapshot')!;

function setStatus(text: string) {
  status.textContent = text;
  status.hidden = !text;
}

function showTotals(heat: Heat) {
  const t = heat.totals;
  totals.textContent = [
    plural(t.articles, 'article', 'articles'),
    plural(t.outlets, 'outlet', 'outlets'),
    plural(t.countries, 'country', 'countries'),
  ].join(' · ');
  const time = utcTime(heat.generatedAt);
  snapshot.textContent = time ? `snapshot ${time}` : '';
  if (heat.generatedAt) snapshot.title = heat.generatedAt;
  document.title = `Today On Earth · ${count(t.articles)} articles`;
}

async function start() {
  // The header fills in as soon as the snapshot arrives; the map catches up when ready.
  const heatPromise = loadHeat();
  heatPromise.then(showTotals, () => setStatus('Could not load the news snapshot.'));
  let windowHours = 24;
  let request = 0;

  const map = await createMap(
    document.getElementById('map')!,
    document.getElementById('tooltip')!,
    async (cell: HeatCell) => {
      const mine = ++request;
      panel.openLoading(cell, windowHours);
      void map.outline(cell.id);
      try {
        const detail = await loadCell(cell.id);
        if (mine === request && panel.isOpen()) panel.showDetail(detail, windowHours);
      } catch {
        if (mine === request && panel.isOpen()) panel.showError();
      }
    },
  );
  panel.initPanel(() => {
    request++;
    void map.outline(null);
  });

  const heat = await heatPromise.catch(() => null);
  if (!heat) return;
  windowHours = heat.windowHours || 24;
  map.setHeat(heat.cells);
  setStatus(heat.cells.length ? '' : 'No coverage in this snapshot.');
}

start().catch(() => setStatus('The map could not start in this browser.'));
