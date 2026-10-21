import './style.css';
import { isCellId, loadCell, loadHeat, type FrameRow, type HeatCell, type Totals } from './data';
import { count, plural, utcTime } from './format';
import { createMap, type HeatMode, type MapCell } from './map';
import * as panel from './panel';
import { readPref, writePref } from './prefs';
import { initQuakes } from './quakes';
import { initReplay, type FrameView, type Replay } from './replay';

/** Relative heat needs this many complete days of per-cell history (see DATA-CONTRACT "Baseline"). */
const MIN_BASELINE_DAYS = 3;
const MODE_PREF = 'toe.heatMode';

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
    // Phones: keep the map's usable area above the bottom sheet and bring the cell into it.
    const sheet = panel.sheetHeight();
    if (sheet) map.setSheet(sheet, [cell.lon, cell.lat]);
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
    map.setSheet(0);
    writeHash();
  }, (height) => map.setSheet(height));
  initQuakes(document.getElementById('quake-toggle') as HTMLButtonElement, (data) => map.setQuakes(data));

  const heat = await heatPromise.catch(() => null);
  if (!heat) return;
  liveCells = heat.cells;
  for (const c of liveCells) live.set(c.id, c);
  liveMax = Math.max(1, ...liveCells.map((c) => c.n));
  windowHours = heat.windowHours || 24;

  // Brightness mode: absolute article counts, or each place against its own normal. The
  // relative view only exists once the ingest has enough days of per-cell history.
  const modeControl = document.getElementById('mode')!;
  const modeNote = document.getElementById('mode-note')!;
  const relativeAvailable = (heat.baselineDays ?? 0) >= MIN_BASELINE_DAYS;
  let mode: HeatMode = relativeAvailable && readPref(MODE_PREF) === 'normal' ? 'normal' : 'articles';
  let shownRows: FrameRow[] | null = null; // rows of the frame on screen; null = live

  const redraw = () => {
    if (shownRows) {
      // Replay frames carry no baseline, so a past frame borrows the live `b` of the same
      // cell. A cell absent from the live snapshot has no `b`: it keeps its absolute weight
      // and shows no ratio (DATA-CONTRACT "Baseline").
      const cells = shownRows.map(([id, lat, lon, n]) => {
        const now = live.get(id);
        return { id, lat, lon, n, name: now?.name ?? '', b: now?.b };
      });
      map.setCells(cells, liveMax, mode);
    } else {
      map.setCells(liveCells, liveMax, mode);
    }
  };

  const setMode = (next: HeatMode) => {
    mode = next;
    for (const b of modeControl.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    modeNote.hidden = mode !== 'normal';
    redraw();
  };
  if (relativeAvailable) {
    modeControl.hidden = false;
    modeControl.addEventListener('click', (e) => {
      const next = (e.target as HTMLElement).closest('button')?.dataset.mode as HeatMode | undefined;
      if (!next || next === mode) return;
      writePref(MODE_PREF, next);
      setMode(next);
    });
  }
  setMode(mode);
  setStatus(liveCells.length ? '' : 'No coverage in this snapshot.');

  const showFrame = (view: FrameView) => {
    frame = view;
    // Past frame: live names where the cell still exists, otherwise just counts.
    shownRows = view.rows;
    redraw();
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
