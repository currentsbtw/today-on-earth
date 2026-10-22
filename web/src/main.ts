import './style.css';
import { loadBroadcast, type Broadcast, type Slot } from './broadcast';
import { isCellId, loadCell, loadHeat, type FrameRow, type HeatCell, type Totals } from './data';
import { count, plural, shortName, utcTime } from './format';
import type { HeatMode, MapCell, WorldMap } from './map';
import * as panel from './panel';
import { initPresence } from './presence';
import { readPref, writePref } from './prefs';
import { initQuakes } from './quakes';
import { initReplay, type FrameView, type Replay } from './replay';

// The snapshot is fetched first: the sentence and the totals need nothing else. The map
// module (MapLibre, the largest download) loads beside it and never holds them up.
const heatPromise = loadHeat();
const mapModule = import('./map');

/** Relative heat needs this many complete days of per-cell history (see DATA-CONTRACT "Baseline"). */
const MIN_BASELINE_DAYS = 3;
const MODE_PREF = 'toe.heatMode';
/** Set once someone has opened a place; until then a one-line hint says how. */
const SEEN_PREF = 'toe.seenCell';
const HINT = 'Open a dot to see who is covering it';
/** How many places the Places list and the places column show. */
const PLACES_MAX = 100;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const status = $('status');
const sentence = $('totals');
const snapshot = $('snapshot');
const colTotals = $('col-totals');
const selLine = $('sel-line');
const mapFrame = $('map-frame');

/** Wide: the three-column field with the place panel over the right column. Below it the page stacks. */
const wide = window.matchMedia('(min-width: 1100px)');

function setStatus(text: string) {
  status.textContent = text;
  status.hidden = !text;
}

// The clock ---------------------------------------------------------------------
// UTC with seconds, ticking on the second. Only the text changes.
const clockTime = $<HTMLTimeElement>('clock');
const clockDate = $('clock-date');
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const two = (n: number) => String(n).padStart(2, '0');
function tick() {
  const d = new Date();
  clockTime.textContent = `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())} UTC`;
  clockTime.dateTime = d.toISOString();
  const date = `${DAYS[d.getUTCDay()]} ${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;
  if (clockDate.textContent !== date) clockDate.textContent = date;
}
tick();
window.setTimeout(() => {
  tick();
  window.setInterval(tick, 1000);
}, 1000 - (Date.now() % 1000));

// The observers count under the right column (off unless VITE_PRESENCE_URL is set at build time).
initPresence(document.getElementById('observer-label'));

/** <div><dt>label</dt><dd>value</dd></div> rows for a description list. */
function dlRows(target: HTMLElement, rows: [label: string, value: string][]) {
  target.replaceChildren(
    ...rows.map(([label, value]) => {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = value;
      row.append(dt, dd);
      return row;
    }),
  );
}

/** The sentence, the clock's snapshot line and the column totals for the live snapshot or a replay frame. */
function showTotals(t: Totals, at: string, replay: boolean) {
  const verb = replay ? 'were' : 'are';
  sentence.textContent = `${plural(t.articles, 'article', 'articles')} ${verb} pointing at ${plural(t.cells, 'place', 'places')}.`;
  const time = utcTime(at);
  document.body.classList.toggle('is-replay', replay);
  if (replay) {
    snapshot.replaceChildren(Object.assign(document.createElement('span'), { className: 'replay-tag', textContent: 'replay' }), ` ${time}`);
  } else {
    snapshot.textContent = time ? `snapshot ${time}` : '';
    document.title = `Today On Earth · ${count(t.articles)} articles`;
  }
  snapshot.title = at;

  // Every figure is printed once: articles and places in the sentence, the rest here (the
  // foot carries only the source). Articles that only name a country have no place on the
  // map; saying so is part of showing the coverage gap rather than hiding it.
  const col: [string, string][] = [['Places with articles', count(t.cells)]];
  if (t.reprints !== undefined) col.push(['Reprints collapsed', count(t.reprints)]);
  if (t.unplaced !== undefined) col.push(['Not placed', count(t.unplaced)]);
  col.push(['Outlets', count(t.outlets)], ['Outlet countries', count(t.countries)]);
  dlRows(colTotals, col);
  colTotals.title = t.unplaced
    ? `${count(t.unplaced)} articles mention only a country, so they are counted but not drawn anywhere.`
    : '';
}

/** One row of the places column. */
interface PlaceRow {
  id: string;
  /** The place name, or its coordinates when no name is known (replay-only cells). */
  name: string;
  /** "412 articles · 150 outlets · 23 countries", or just the articles on past frames. */
  counts: string;
  /** Articles; outlets and outlet countries exist only for the live snapshot. */
  n: number;
  o?: number;
  c?: number;
}

// The places column ----------------------------------------------------------------
// The ranked places as mono rows (name, articles, outlets, outlet countries) with a strip
// as long as the row's share of the top count. One tab stop; arrows move between rows.

const colList = $<HTMLOListElement>('places-col-list');
const colFilter = $<HTMLInputElement>('places-col-filter');
const colEmpty = $('places-col-empty');
const colSection = $('places-col');
let colRows: PlaceRow[] = [];
let colSelected: string | null = null;
let colPick: (id: string) => void = () => {};

const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

function renderCol() {
  const q = fold(colFilter.value.trim());
  const shown = q ? colRows.filter((r) => fold(r.name).includes(q)) : colRows;
  const top = Math.max(1, ...colRows.map((r) => r.n));
  const dash = '–';
  colList.replaceChildren(
    ...shown.map((r) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'rank-row';
      button.dataset.id = r.id;
      button.tabIndex = -1;
      button.title = r.name;
      button.setAttribute('aria-label', `${r.name}, ${r.counts}`);
      const cells = [shortName(r.name) || r.name, String(r.n), r.o === undefined ? dash : String(r.o), r.c === undefined ? dash : String(r.c)];
      cells.forEach((text, i) => {
        const span = document.createElement('span');
        span.className = i ? 'rank-n' : 'rank-name';
        span.textContent = text;
        button.append(span);
      });
      const strip = document.createElement('span');
      strip.className = 'rank-strip';
      strip.setAttribute('aria-hidden', 'true');
      strip.style.width = `${Math.max(2, (r.n / top) * 100)}%`;
      button.append(strip);
      button.addEventListener('click', () => colPick(r.id));
      li.append(button);
      return li;
    }),
  );
  colEmpty.hidden = !!shown.length || !colRows.length;
  colEmpty.textContent = q ? `No place matches "${colFilter.value.trim()}".` : '';
  markCol();
}

/** Pulls the selected place's row to white and gives the list its one tab stop. */
function markCol() {
  const buttons = [...colList.querySelectorAll<HTMLButtonElement>('.rank-row')];
  let stop: HTMLButtonElement | undefined;
  for (const b of buttons) {
    const on = b.dataset.id === colSelected;
    b.classList.toggle('is-selected', on);
    if (on) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');
    if (on) stop = b;
  }
  stop ??= buttons[0];
  for (const b of buttons) b.tabIndex = b === stop ? 0 : -1;
  colList.classList.toggle('has-selection', !!colSelected && buttons.some((b) => b.dataset.id === colSelected));
  // Keep the selected row in view inside the column (never scrolls the page).
  if (colSelected && wide.matches) {
    const row = buttons.find((b) => b.dataset.id === colSelected);
    if (row) {
      const top = row.offsetTop - colList.offsetTop;
      if (top < colList.scrollTop || top + row.offsetHeight > colList.scrollTop + colList.clientHeight) {
        colList.scrollTop = Math.max(0, top - colList.clientHeight / 3);
      }
    }
  }
}

colList.addEventListener('scroll', () => colList.classList.toggle('is-scrolled', colList.scrollTop > 0), { passive: true });
colFilter.addEventListener('input', renderCol);
colFilter.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const first = colList.querySelector<HTMLButtonElement>('.rank-row');
    if (first) {
      e.preventDefault();
      first.click();
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    colList.querySelector<HTMLButtonElement>('.rank-row')?.focus();
  }
});
colList.addEventListener('keydown', (e) => {
  const buttons = [...colList.querySelectorAll<HTMLButtonElement>('.rank-row')];
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (at < 0) return;
  let next = -1;
  if (e.key === 'ArrowDown') next = Math.min(buttons.length - 1, at + 1);
  else if (e.key === 'ArrowUp') next = at - 1;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = buttons.length - 1;
  else return;
  e.preventDefault();
  if (next < 0) return colFilter.focus();
  for (const b of buttons) b.tabIndex = -1;
  buttons[next].tabIndex = 0;
  buttons[next].focus();
});

// The right column ------------------------------------------------------------------
// Wide screens: the column shows Signals (the default) or Replay, chosen in the nav; a
// selected place overlays it, and closing the place brings back what was there. Below
// 1100px the column is a run of sections under the map (Signals, Places, Replay); the nav
// items jump to them and the one in view is marked.

type View = 'signals' | 'replay';
const side = $('side');
const stamp = $('side-stamp');
const signalsButton = $<HTMLButtonElement>('signals-button');
const placesButton = $<HTMLButtonElement>('places-button');
const replayButton = $<HTMLButtonElement>('replay-button');
const sections: [HTMLElement, HTMLButtonElement][] = [
  [$('signals-col'), signalsButton],
  [$('places-col'), placesButton],
  [$('replay-col'), replayButton],
];

/** "LIVE · 14:27 UTC", or "REPLAY · 05:16 UTC · 38/95" while a past frame is on screen. */
function setStamp(at: string, frameTag = '') {
  const tag = Object.assign(document.createElement('span'), {
    className: frameTag ? 'replay-tag' : 'live-tag',
    textContent: frameTag ? 'replay' : 'live',
  });
  stamp.replaceChildren(tag, ` ${utcTime(at)}${frameTag ? ` · ${frameTag}` : ''}`);
}

/** Which nav item is current while the sections stack: the one crossing a band near the top. */
const inBand = new Set<HTMLElement>();
const markStacked = () => {
  const current = sections.find(([section]) => inBand.has(section))?.[1];
  for (const [, button] of sections) {
    if (button === current) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  }
};
const bandObserver = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) inBand.add(e.target as HTMLElement);
      else inBand.delete(e.target as HTMLElement);
    }
    if (!wide.matches) markStacked();
  },
  { rootMargin: '-30% 0px -60% 0px' },
);
for (const [section] of sections) bandObserver.observe(section);

async function start() {
  // The header fills in as soon as the snapshot arrives; the map catches up when ready.
  heatPromise.then(
    (h) => {
      showTotals(h.totals, h.generatedAt, false);
      setStamp(h.generatedAt);
    },
    () => {
      sentence.textContent = 'The news snapshot could not be loaded.';
      setStatus('Could not load the news snapshot.');
    },
  );

  const live = new Map<string, HeatCell>();
  let liveCells: HeatCell[] = [];
  let liveMax = 1;
  let windowHours = 24;
  let request = 0;
  let selected: string | null = null; // cell shown in the panel
  let selectedIsLive = false; // whether the panel shows a live detail file
  let replay: Replay | null = null;
  let frame = { index: 0, live: true };
  let view: View = 'signals';

  // Permalink: "replay" while the column shows the replay, then c=<cellId> and t=<frame
  // stamp>; keys at their default are dropped, so the Signals state with nothing selected
  // has no hash at all.
  const writeHash = () => {
    const params = new URLSearchParams();
    if (selected) params.set('c', selected);
    if (replay && !frame.live) params.set('t', replay.stamp(frame.index));
    const hash = [view === 'replay' ? 'replay' : '', params.toString()].filter(Boolean).join('&');
    const url = location.pathname + location.search + (hash ? `#${hash}` : '');
    if (url !== location.pathname + location.search + location.hash) history.replaceState(null, '', url);
  };

  /** Wide screens: the view's nav item is current unless a place covers the column. */
  const syncNav = () => {
    if (!wide.matches) return markStacked();
    for (const [, button] of sections) {
      const on = !panel.isOpen() && button.getAttribute('aria-controls') === `${view}-col`;
      if (on) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    }
  };
  const setView = (next: View) => {
    view = next;
    side.dataset.view = next;
    syncNav();
    writeHash();
  };
  wide.addEventListener('change', syncNav);

  const updateNote = () =>
    panel.setNote(selectedIsLive && !frame.live ? 'Details are for the current snapshot.' : '');

  let hintShown = false;
  let broadcast: Broadcast | null = null; // the daily broadcast, once loaded

  /** The selection under the map and in the places column. */
  const showSelection = () => {
    colSelected = selected;
    markCol();
    const cell = selected ? live.get(selected) : undefined;
    if (!cell) return void (selLine.textContent = '');
    // The same counts as the panel's summary line, after the place name.
    selLine.textContent = `${shortName(cell.name) || cell.name} · ${panel.summaryLine(cell)}`;
  };

  /**
   * Phones: how much of the map the bottom sheet covers. The page scrolls, so the map frame
   * is brought to the top first and only the overlap is padded.
   */
  const sheetPad = (height: number) => {
    if (!height) return 0;
    const r = mapFrame.getBoundingClientRect();
    return Math.max(0, Math.min(r.height * 0.75, r.bottom - (window.innerHeight - height)));
  };
  const mapToTop = () => {
    const top = mapFrame.getBoundingClientRect().top + window.scrollY - 8;
    if (Math.abs(window.scrollY - top) > 1) window.scrollTo({ top, behavior: 'instant' });
  };

  /** Set once the map is up; until then a place picked from the list waits for it. */
  let mapNow: WorldMap | null = null;

  const openCell = async (cell: MapCell) => {
    const map = mapNow ?? (await mapReady.catch(() => null));
    if (!map) return;
    const mine = ++request;
    map.hideTooltip();
    if (hintShown) {
      hintShown = false;
      setStatus('');
    }
    writePref(SEEN_PREF, '1');
    selected = cell.id;
    void map.outline(cell.id);
    // Detail files describe the current snapshot only, whichever frame is on screen.
    const current = live.get(cell.id);
    selectedIsLive = !!current;
    if (current) panel.openLoading(current, windowHours);
    else panel.openMissing(cell.n);
    showSelection();
    syncNav();
    // Phones: keep the map's usable area above the bottom sheet and bring the cell into it.
    const sheet = panel.sheetHeight();
    if (sheet) {
      mapToTop();
      map.setSheet(sheetPad(sheet), [cell.lon, cell.lat]);
    }
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

  // The map and what hangs off it (the panel, the quake layer), as soon as its module is in.
  const mapReady = mapModule.then(async ({ createMap }) => {
    const map = await createMap($('map'), $('tooltip'), openCell);
    panel.initPanel(() => {
      request++;
      selected = null;
      selectedIsLive = false;
      void map.outline(null);
      map.setSheet(0);
      showSelection();
      syncNav();
      writeHash();
    }, (height) => map.setSheet(sheetPad(height)));
    initQuakes($<HTMLButtonElement>('quake-toggle'), (data) => map.setQuakes(data));
    mapNow = map;
    return map;
  });
  // A failure is reported where start() awaits the map, not as an unhandled rejection before.
  mapReady.catch(() => {});

  // The snapshot's own parts (the places column, the legend) fill in before the map is up.
  const heat = await heatPromise.catch(() => null);
  let shownRows: FrameRow[] | null = null; // rows of the frame on screen; null = live
  // Places: the cells on screen (this frame's, names from live where known) as the ranked
  // column, the keyboard path to every place.
  const shownCells = (): MapCell[] =>
    shownRows ? shownRows.map(([id, lat, lon, n]) => ({ id, lat, lon, n, name: live.get(id)?.name ?? '' })) : liveCells;
  const coords = (lat: number, lon: number) =>
    `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;
  const placeRows = (): PlaceRow[] =>
    [...shownCells()]
      .sort((a, b) => b.n - a.n)
      .slice(0, PLACES_MAX)
      .map((c) => {
        // Outlet and country counts exist only for the live snapshot.
        const now = shownRows ? undefined : live.get(c.id);
        const parts = [plural(c.n, 'article', 'articles')];
        if (now) parts.push(plural(now.o, 'outlet', 'outlets'), plural(now.c, 'country', 'countries'));
        return { id: c.id, name: c.name || coords(c.lat, c.lon), counts: parts.join(' · '), n: c.n, o: now?.o, c: now?.c };
      });
  const refreshCol = () => {
    colRows = placeRows();
    renderCol();
  };
  if (heat) {
    liveCells = heat.cells;
    for (const c of liveCells) live.set(c.id, c);
    liveMax = Math.max(1, ...liveCells.map((c) => c.n));
    windowHours = heat.windowHours || 24;
    $('legend-max').textContent = count(liveMax);
    colPick = (id: string) => {
      const cell = shownCells().find((c) => c.id === id);
      if (cell) void openCell(cell);
    };
    refreshCol();
    colSection.hidden = !liveCells.length;
  }

  const map = await mapReady;

  // Nav: wide screens switch the column (closing a place over it); stacked layouts scroll to
  // the section. Focus stays on the nav item either way.
  for (const [section, button] of sections) {
    button.addEventListener('click', () => {
      if (wide.matches) {
        if (panel.isOpen()) panel.close();
        const next = button === replayButton ? 'replay' : 'signals';
        if (next !== view) setView(next);
        button.focus();
        return;
      }
      if (panel.isOpen()) panel.close();
      section.scrollIntoView({ block: 'start' });
      button.focus({ preventScroll: true });
    });
  }
  if (!heat) return;

  // The daily broadcast: fetched once the snapshot is in, never in the map's way. A missing
  // file (older deploys) or any failure says so in the Signals column.
  const signalsEmpty = $('signals-empty');
  // A slot's cell, from the live snapshot when it is there (the broadcast is built from it).
  const pickSignal = (slot: Slot) => {
    if (!slot.cell) return;
    const { id, lat, lon, name } = slot.cell;
    void openCell(live.get(id) ?? { id, lat, lon, name, n: slot.story?.n ?? 0 });
  };
  const noBroadcast = () => {
    signalsEmpty.textContent = 'No broadcast in this snapshot.';
    signalsEmpty.hidden = false;
  };
  loadBroadcast().then((b) => {
    if (!b || typeof b !== 'object' || !Array.isArray(b.slots)) return noBroadcast();
    broadcast = b;
    panel.renderSignals($('signals-list'), $('signals-when'), broadcast, pickSignal);
  }, noBroadcast);

  // Brightness mode: absolute article counts, or each place against its own normal. The
  // relative view only exists once the ingest has enough days of per-cell history.
  const modeControl = $('mode');
  const modeNote = $('mode-note');
  const relativeAvailable = (heat.baselineDays ?? 0) >= MIN_BASELINE_DAYS;
  let mode: HeatMode = relativeAvailable && readPref(MODE_PREF) === 'normal' ? 'normal' : 'articles';

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
  if (liveCells.length && readPref(SEEN_PREF) !== '1' && !panel.isOpen()) {
    hintShown = true;
    setStatus(HINT);
  }

  const showFrame = (fv: FrameView) => {
    frame = fv;
    // Past frame: live names where the cell still exists, otherwise just counts.
    shownRows = fv.rows;
    redraw();
    refreshCol();
    if (fv.live) {
      showTotals(heat.totals, heat.generatedAt, false);
      setStamp(heat.generatedAt);
    } else {
      showTotals(fv.shown.totals, fv.shown.at, true);
      const last = replay ? replay.frames.length - 1 : fv.index;
      setStamp(fv.shown.at, `${String(fv.index).padStart(2, '0')}/${String(last).padStart(2, '0')}`);
    }
    updateNote();
    writeHash();
  };
  replay = await initReplay(
    { at: heat.generatedAt, windowHours: heat.windowHours, totals: heat.totals },
    showFrame,
  );

  // An absent key means its default (Signals, live frame, no cell); an unknown value is
  // ignored. A frame stamp implies the replay.
  const applyHash = async () => {
    const params = new URLSearchParams(location.hash.slice(1));
    const t = params.get('t');
    const nextView: View = params.has('replay') || t ? 'replay' : 'signals';
    if (nextView !== view) setView(nextView);
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
  syncNav();
  void applyHash();
  // Fires when someone edits or pastes a link into this tab; replaceState never triggers it.
  window.addEventListener('hashchange', () => void applyHash());
}

start().catch(() => setStatus('The map could not start in this browser.'));
