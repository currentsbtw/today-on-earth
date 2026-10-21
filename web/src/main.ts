import './style.css';
import { isCellId, loadCell, loadHeat, type HeatCell, type Totals } from './data';
import { count, plural, utcTime } from './format';
import { createMap, type MapCell } from './map';
import * as panel from './panel';
import { initReplay, type FrameView, type Replay } from './replay';

const status = document.getElementById('status')!;
const totals = document.getElementById('totals')!;
const snapshot = document.getElementById('snapshot')!;

function setStatus(text: string) {
  status.textContent = text;
  status.hidden = !text;
}

/** Header counts for the live snapshot, or for a replay frame (marked "replay"). */
function showTotals(t: Totals, at: string, replay: boolean) {
  const parts = [
    plural(t.articles, 'article', 'articles'),
    plural(t.outlets, 'outlet', 'outlets'),
    plural(t.countries, 'country', 'countries'),
  ];
  // Articles that only name a country have no place on the map. Saying so is part of
  // showing the coverage gap rather than hiding it.
  if (t.unplaced) parts.push(`${count(t.unplaced)} not placed on the map`);
  totals.textContent = parts.join(' · ');
  totals.title = t.unplaced
    ? `${count(t.unplaced)} articles mention only a country, so they are counted but not drawn anywhere.`
    : '';
  const time = utcTime(at);
  if (replay) {
    snapshot.replaceChildren(Object.assign(document.createElement('span'), { className: 'replay-tag', textContent: 'replay' }), ` ${time}`);
  } else {
    snapshot.textContent = time ? `snapshot ${time}` : '';
    document.title = `Today On Earth · ${count(t.articles)} articles`;
  }
  snapshot.title = at;
}

async function start() {
  // The header fills in as soon as the snapshot arrives; the map catches up when ready.
  const heatPromise = loadHeat();
  heatPromise.then((h) => showTotals(h.totals, h.generatedAt, false), () => setStatus('Could not load the news snapshot.'));

  const live = new Map<string, HeatCell>();
  let liveCells: HeatCell[] = [];
  let liveMax = 1;
  let windowHours = 24;
  let request = 0;
  let selected: string | null = null; // cell shown in the panel
  let selectedIsLive = false; // whether the panel shows a live detail file
  let replay: Replay | null = null;
  let frame = { index: 0, live: true };

  // Permalink: #c=<cellId>&t=<frame stamp>, keys at their default are dropped.
  const writeHash = () => {
    const params = new URLSearchParams();
    if (selected) params.set('c', selected);
    if (replay && !frame.live) params.set('t', replay.stamp(frame.index));
    const hash = params.toString();
    const url = location.pathname + location.search + (hash ? `#${hash}` : '');
    if (url !== location.pathname + location.search + location.hash) history.replaceState(null, '', url);
  };

  const updateNote = () =>
    panel.setNote(selectedIsLive && !frame.live ? 'Details are for the current snapshot.' : '');

  const openCell = async (cell: MapCell) => {
    const mine = ++request;
    selected = cell.id;
    void map.outline(cell.id);
    // Detail files describe the current snapshot only, whichever frame is on screen.
    const current = live.get(cell.id);
    selectedIsLive = !!current;
    if (current) panel.openLoading(current, windowHours);
    else panel.openMissing(cell.n);
    updateNote();
    writeHash();
    if (!current) return;
    try {
      const detail = await loadCell(cell.id);
      if (mine === request && panel.isOpen()) panel.showDetail(detail, windowHours);
    } catch {
      if (mine === request && panel.isOpen()) panel.showError();
    }
  };

  const map = await createMap(document.getElementById('map')!, document.getElementById('tooltip')!, openCell);
  panel.initPanel(() => {
    request++;
    selected = null;
    selectedIsLive = false;
    void map.outline(null);
    writeHash();
  });

  const heat = await heatPromise.catch(() => null);
  if (!heat) return;
  liveCells = heat.cells;
  for (const c of liveCells) live.set(c.id, c);
  liveMax = Math.max(1, ...liveCells.map((c) => c.n));
  windowHours = heat.windowHours || 24;
  map.setCells(liveCells, liveMax);
  setStatus(liveCells.length ? '' : 'No coverage in this snapshot.');

  const showFrame = (view: FrameView) => {
    frame = view;
    if (view.rows) {
      // Past frame: live names where the cell still exists, otherwise just counts.
      const cells = view.rows.map(([id, lat, lon, n]) => ({ id, lat, lon, n, name: live.get(id)?.name ?? '' }));
      map.setCells(cells, liveMax);
    } else {
      map.setCells(liveCells, liveMax);
    }
    if (view.live) showTotals(heat.totals, heat.generatedAt, false);
    else showTotals(view.shown.totals, view.shown.at, true);
    updateNote();
    writeHash();
  };
  replay = await initReplay(
    { at: heat.generatedAt, windowHours: heat.windowHours, totals: heat.totals },
    showFrame,
  );

  // An absent key means its default (live frame, no cell); an unknown value is ignored.
  const applyHash = async () => {
    const params = new URLSearchParams(location.hash.slice(1));
    const t = params.get('t');
    if (replay && !t) {
      if (!frame.live) replay.selectLive();
    } else if (replay && t) {
      replay.selectStamp(t);
    }
    const c = params.get('c');
    if (!c) return panel.close();
    if (!isCellId(c) || c === selected) return;
    const cell = live.get(c);
    if (cell) return void openCell(cell);
    // A cell that exists only in the selected past frame: open it once that frame's rows
    // arrive (no detail file exists for it), unless the frame changed meanwhile.
    if (!replay || frame.live) return;
    const index = frame.index;
    const row = (await replay.rows(index))?.find((r) => r[0] === c);
    if (row && frame.index === index && selected !== c) {
      void openCell({ id: row[0], lat: row[1], lon: row[2], n: row[3], name: '' });
    }
  };
  void applyHash();
  // Fires when someone edits or pastes a link into this tab; replaceState never triggers it.
  window.addEventListener('hashchange', () => void applyHash());
}

start().catch(() => setStatus('The map could not start in this browser.'));
