// The side panel (bottom sheet on narrow screens) listing every article for one cell.
import type { Article, CellDetail, HeatCell, Story } from './data';
import { ago, count, host, plural, safeHref, utcTime } from './format';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const panel = $<HTMLElement>('panel');
const title = $<HTMLHeadingElement>('panel-title');
const why = $<HTMLParagraphElement>('panel-why');
const state = $<HTMLParagraphElement>('panel-state');
const note = $<HTMLParagraphElement>('panel-note');
const list = $<HTMLOListElement>('panel-list');
const stories = $<HTMLDivElement>('panel-stories');
const closeButton = $<HTMLButtonElement>('panel-close');

let returnFocus: HTMLElement | null = null;
let onClose: () => void = () => {};

type Counts = Pick<HeatCell, 'n' | 'o' | 'c' | 'l'>;

/** "412 articles · 150 outlets · 23 countries · 9 languages" */
function countsLine(c: Counts): string {
  return [
    plural(c.n, 'article', 'articles'),
    plural(c.o, 'outlet', 'outlets'),
    plural(c.c, 'country', 'countries'),
    plural(c.l, 'language', 'languages'),
  ].join(' · ');
}

/** The counts plus the window: "… · 9 languages · last 24h" */
function whyLine(c: Counts, windowHours: number): string {
  return `${countsLine(c)} · last ${windowHours}h`;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const STORY_PREVIEW = 3;
let storySeq = 0;

/** "01:15–04:30 UTC", or one time when the story's first and last article coincide. */
function span(first: string, last: string): string {
  const a = utcTime(first).replace(' UTC', '');
  const b = utcTime(last);
  if (!a || !b) return b || utcTime(first);
  return a === b.replace(' UTC', '') ? b : `${a}–${b}`;
}

/** One story: the outlet's own headline, its counts, time span, entities and newest articles. */
function storyCard(story: Story, now: number): HTMLElement {
  const card = el('article', 'story');
  const id = `story-${++storySeq}`;
  card.setAttribute('aria-labelledby', `${id}-h`);

  const head = el('h4', 'story-headline');
  head.id = `${id}-h`;
  // The headline is an outlet's title, verbatim; link it to that article when we have it.
  const source = story.articles.find((a) => a.title === story.headline && a.source === story.headlineSource);
  const href = source ? safeHref(source.url) : null;
  const text = story.headline.trim();
  if (text) {
    const words = href ? el('a', 'story-link', text) : el('span', '', text);
    if (words instanceof HTMLAnchorElement && href) {
      words.href = href;
      words.target = '_blank';
      words.rel = 'noopener';
    }
    head.append(words);
  }
  const attribution = [story.headlineSource, story.headlineLang].filter(Boolean).join(' · ');
  if (attribution) head.append(el('span', 'story-source', `${text ? ' — ' : ''}${attribution}`));

  const meta = el('p', 'story-meta');
  meta.append(el('span', 'story-counts', countsLine(story)), el('span', '', span(story.first, story.last)), toneMarker(story.t));

  card.append(head, meta);

  if (story.entities.length) {
    const chips = el('ul', 'chips');
    chips.setAttribute('aria-label', 'shared tags');
    for (const e of story.entities) chips.append(el('li', 'chip', e));
    card.append(chips);
  }

  const items = el('ol', 'articles story-articles');
  items.id = `${id}-list`;
  story.articles.forEach((a, i) => {
    const item = articleItem(a, now);
    item.hidden = i >= STORY_PREVIEW;
    items.append(item);
  });
  card.append(items);

  const extra = story.articles.length - STORY_PREVIEW;
  if (extra > 0) {
    const more = el('button', 'story-more', `show ${extra} more`);
    more.type = 'button';
    more.setAttribute('aria-expanded', 'false');
    more.setAttribute('aria-controls', items.id);
    more.addEventListener('click', () => {
      const open = more.getAttribute('aria-expanded') !== 'true';
      [...items.children].forEach((li, i) => ((li as HTMLElement).hidden = !open && i >= STORY_PREVIEW));
      more.setAttribute('aria-expanded', String(open));
      more.textContent = open ? 'show fewer' : `show ${extra} more`;
    });
    card.append(more);
  }
  return card;
}

/** Stories first (when the cell file has them), then the "All newest" heading for the flat list. */
function renderStories(detail: CellDetail | null, now: number) {
  const groups = detail?.stories ?? [];
  if (!detail || !groups.length) {
    stories.replaceChildren();
    stories.hidden = true;
    return;
  }
  const nodes: HTMLElement[] = [el('h3', 'panel-section', 'Stories'), ...groups.map((s) => storyCard(s, now))];
  if (detail.unclustered && detail.unclustered > 0) {
    nodes.push(el('p', 'stories-rest', `${plural(detail.unclustered, 'more article', 'more articles')} not grouped`));
  }
  nodes.push(el('h3', 'panel-section', 'All newest'));
  stories.replaceChildren(...nodes);
  stories.hidden = false;
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
  renderStories(null, 0);
  setState('loading');
  show();
}

export function showDetail(detail: CellDetail, windowHours: number) {
  title.textContent = detail.name;
  why.textContent = whyLine(detail, windowHours);
  const now = Date.now();
  renderStories(detail, now);
  list.replaceChildren(...detail.articles.map((a) => articleItem(a, now)));
  const shown = detail.articles.length;
  if (!shown) setState('No articles listed for this place.');
  else if (shown < detail.n) setState(`newest ${count(shown)} of ${count(detail.n)}`);
  else setState('');
}

/** A replay cell that is not in the current snapshot: there is no detail file for it. */
export function openMissing(n: number) {
  title.textContent = plural(n, 'article', 'articles');
  why.textContent = '';
  list.replaceChildren();
  renderStories(null, 0);
  setState('No current details for this place.');
  show();
}

/** One quiet line under the counts, e.g. while replaying a past frame. */
export function setNote(text: string) {
  note.textContent = text;
  note.hidden = !text;
}

export function showError() {
  list.replaceChildren();
  renderStories(null, 0);
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
  // Expose the panel's height so the scrubber can sit above the bottom sheet on phones.
  const stage = panel.parentElement!;
  new ResizeObserver(() => {
    stage.style.setProperty('--sheet-h', `${panel.hidden ? 0 : panel.offsetHeight}px`);
  }).observe(panel);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) close();
  });
}
