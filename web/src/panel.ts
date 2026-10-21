// The side panel (bottom sheet on narrow screens) listing every article for one cell.
import type { Article, CellDetail, HeatCell } from './data';
import { ago, count, host, plural, safeHref } from './format';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const panel = $<HTMLElement>('panel');
const title = $<HTMLHeadingElement>('panel-title');
const why = $<HTMLParagraphElement>('panel-why');
const state = $<HTMLParagraphElement>('panel-state');
const list = $<HTMLOListElement>('panel-list');
const closeButton = $<HTMLButtonElement>('panel-close');

let returnFocus: HTMLElement | null = null;
let onClose: () => void = () => {};

/** "412 articles · 150 outlets · 23 countries · 9 languages · last 24h" */
function whyLine(c: Pick<HeatCell, 'n' | 'o' | 'c' | 'l'>, windowHours: number): string {
  return [
    plural(c.n, 'article', 'articles'),
    plural(c.o, 'outlet', 'outlets'),
    plural(c.c, 'country', 'countries'),
    plural(c.l, 'language', 'languages'),
    `last ${windowHours}h`,
  ].join(' · ');
}

function setState(text: string) {
  state.textContent = text;
  state.hidden = !text;
}

/** Tone as a tick on a short neutral scale (-10 to +10). No words. */
function toneMarker(tone: number): HTMLElement {
  const scale = document.createElement('span');
  scale.className = 'tone';
  scale.setAttribute('role', 'img');
  scale.setAttribute('aria-label', `tone ${tone.toFixed(1)}`);
  scale.title = `tone ${tone.toFixed(1)}`;
  const tick = document.createElement('span');
  tick.className = 'tone-tick';
  tick.style.left = `${((Math.max(-10, Math.min(10, tone)) + 10) / 20) * 100}%`;
  scale.append(tick);
  return scale;
}

function articleItem(a: Article, now: number): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'article';
  const href = safeHref(a.url);
  const headline = document.createElement(href ? 'a' : 'span');
  headline.className = 'article-title';
  headline.textContent = a.title.trim() || host(a.url);
  if (href && headline instanceof HTMLAnchorElement) {
    headline.href = href;
    headline.target = '_blank';
    headline.rel = 'noopener';
  }
  const meta = document.createElement('p');
  meta.className = 'article-meta';
  const parts = [a.source || host(a.url), a.country, a.lang, ago(a.time, now)].filter(Boolean);
  for (const part of parts) {
    const span = document.createElement('span');
    span.textContent = part;
    meta.append(span);
  }
  meta.append(toneMarker(a.tone));
  li.append(headline, meta);
  return li;
}

function show() {
  if (panel.hidden) {
    const active = document.activeElement;
    returnFocus = active instanceof HTMLElement && !panel.contains(active) ? active : null;
    panel.hidden = false;
  }
  panel.scrollTop = 0;
  title.focus();
}

/** Opens the panel for a cell straight away, using the heat.json counts while the detail loads. */
export function openLoading(cell: HeatCell, windowHours: number) {
  title.textContent = cell.name;
  why.textContent = whyLine(cell, windowHours);
  list.replaceChildren();
  setState('loading');
  show();
}

export function showDetail(detail: CellDetail, windowHours: number) {
  title.textContent = detail.name;
  why.textContent = whyLine(detail, windowHours);
  const now = Date.now();
  list.replaceChildren(...detail.articles.map((a) => articleItem(a, now)));
  const shown = detail.articles.length;
  if (!shown) setState('No articles listed for this place.');
  else if (shown < detail.n) setState(`newest ${count(shown)} of ${count(detail.n)}`);
  else setState('');
}

export function showError() {
  list.replaceChildren();
  setState('Could not load the articles for this place.');
}

export function close() {
  if (panel.hidden) return;
  panel.hidden = true;
  onClose();
  returnFocus?.focus();
  returnFocus = null;
}

export function isOpen(): boolean {
  return !panel.hidden;
}

export function initPanel(handleClose: () => void) {
  onClose = handleClose;
  closeButton.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) close();
  });
}
