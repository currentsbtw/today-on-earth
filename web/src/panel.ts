// The side panel (bottom sheet on narrow screens) listing every article for one cell.
import type { Article, CellDetail, HeatCell, Story } from './data';
import { ago, count, host, plural, safeHref, utcTime, youtubeId } from './format';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const panel = $<HTMLElement>('panel');
const title = $<HTMLHeadingElement>('panel-title');
const why = $<HTMLParagraphElement>('panel-why');
const state = $<HTMLParagraphElement>('panel-state');
const note = $<HTMLParagraphElement>('panel-note');
const list = $<HTMLOListElement>('panel-list');
const stories = $<HTMLDivElement>('panel-stories');
const videos = $<HTMLElement>('panel-videos');
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

// Videos --------------------------------------------------------------------
// Thumbnails come from YouTube's image host; the player is youtube-nocookie.com and only
// loads when someone presses a thumbnail. Never autoplay.

const MAX_CLIPS = 8;
const PLAY_SVG = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z"/></svg>';

interface Clip {
  id: string;
  source: string;
  time: string;
}

/** Distinct videos in the cell's articles and story articles, newest first. */
function collectClips(detail: CellDetail): Clip[] {
  const all = [...detail.articles, ...(detail.stories ?? []).flatMap((st) => st.articles)];
  all.sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  const seen = new Map<string, Clip>();
  for (const a of all) {
    const id = youtubeId(a.video ?? '');
    if (id && !seen.has(id)) seen.set(id, { id, source: a.source || host(a.url), time: a.time });
    if (seen.size >= MAX_CLIPS) break;
  }
  return [...seen.values()];
}

function clipItem(clip: Clip): HTMLLIElement {
  const li = el('li', 'video');
  li.dataset.id = clip.id;
  const button = el('button', 'video-thumb');
  button.type = 'button';
  button.setAttribute('aria-label', `Play video from ${clip.source}`);
  const img = document.createElement('img');
  img.src = `https://i.ytimg.com/vi/${clip.id}/mqdefault.jpg`;
  img.alt = '';
  img.loading = 'lazy';
  img.width = 160;
  img.height = 90;
  const glyph = el('span', 'video-glyph');
  glyph.innerHTML = PLAY_SVG;
  button.append(img, glyph);
  button.addEventListener('click', () => playClip(li));
  li.append(button, el('span', 'video-source', clip.source));
  return li;
}

/** Swaps the thumbnail for the YouTube player, in place. */
function playClip(li: HTMLElement) {
  const thumb = li.querySelector('.video-thumb');
  if (!thumb) return;
  const frame = document.createElement('iframe');
  frame.src = `https://www.youtube-nocookie.com/embed/${li.dataset.id}`;
  frame.title = `YouTube video from ${li.querySelector('.video-source')?.textContent ?? ''}`;
  frame.allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  frame.allowFullscreen = true;
  frame.loading = 'lazy';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  li.classList.add('is-playing');
  thumb.replaceWith(frame);
  li.scrollIntoView({ block: 'nearest', inline: 'start' });
  frame.focus();
}

/** From an article row: open that video in the strip (adding it if it was not among the first 8). */
function playFromRow(id: string, source: string) {
  let strip = videos.querySelector<HTMLOListElement>('.video-strip');
  if (!strip) {
    strip = el('ol', 'video-strip');
    videos.replaceChildren(el('h3', 'panel-section', 'Videos'), strip);
  }
  videos.hidden = false;
  let li = strip.querySelector<HTMLLIElement>(`li[data-id="${id}"]`);
  if (!li) {
    li = clipItem({ id, source, time: '' });
    strip.prepend(li);
  }
  playClip(li);
}

function renderVideos(detail: CellDetail | null) {
  const clips = detail && (detail.videos ?? 0) > 0 ? collectClips(detail) : [];
  if (!clips.length) {
    videos.replaceChildren();
    videos.hidden = true;
    return;
  }
  const strip = el('ol', 'video-strip');
  strip.append(...clips.map(clipItem));
  videos.replaceChildren(el('h3', 'panel-section', 'Videos'), strip);
  videos.hidden = false;
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
  const id = youtubeId(a.video ?? '');
  if (id) {
    // A small play control next to the title opens the same in-place player.
    const head = el('div', 'article-head');
    const play = el('button', 'article-play');
    play.type = 'button';
    play.setAttribute('aria-label', 'Play video');
    play.innerHTML = PLAY_SVG;
    play.addEventListener('click', () => playFromRow(id, a.source || host(a.url)));
    head.append(headline, play);
    li.append(head, meta);
  } else {
    li.append(headline, meta);
  }
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
  renderVideos(null);
  setState('loading');
  show();
}

export function showDetail(detail: CellDetail, windowHours: number) {
  title.textContent = detail.name;
  why.textContent = whyLine(detail, windowHours);
  const now = Date.now();
  renderVideos(detail);
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
  renderVideos(null);
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
  renderVideos(null);
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
