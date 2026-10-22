// The place panel (bottom sheet on narrow screens) listing every article for one cell, and
// the Signals entries (the daily broadcast) it shares its log grammar with.
import { emptyLine, SLOT_IDS, SLOT_LABELS, signalLine, type Broadcast, type Slot } from './broadcast';
import type { Article, CellDetail, HeatCell, Story } from './data';
import { ago, count, host, plural, safeHref, shortName, utcTime, youtubeId } from './format';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const panel = $<HTMLElement>('panel');
const title = $<HTMLHeadingElement>('panel-title');
const why = $<HTMLDListElement>('panel-why');
const reach = $<HTMLParagraphElement>('panel-reach');
const state = $<HTMLParagraphElement>('panel-state');
const note = $<HTMLParagraphElement>('panel-note');
const list = $<HTMLOListElement>('panel-list');
const stories = $<HTMLDivElement>('panel-stories');
const videos = $<HTMLElement>('panel-videos');
const closeButton = $<HTMLButtonElement>('panel-close');
const coverage = $<HTMLDivElement>('panel-coverage');
const handle = $<HTMLButtonElement>('sheet-handle');

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

type Reach = Counts & { u?: number; i?: number };

/** "heard in 19 other countries"; "" when the file has no `i` or no outlet country is known. */
function heardIn(c: Reach): string {
  if (c.i === undefined || (c.i === 0 && c.c === 0)) return '';
  return c.i === 0 ? 'heard in no other country' : `heard in ${plural(c.i, 'other country', 'other countries')}`;
}

/** "31 reprints collapsed · last 24h"; the reprint part only when there are copies. */
function reachLine(c: Reach, windowHours: number): string {
  const parts: string[] = [];
  const copies = c.u === undefined ? 0 : c.n - c.u;
  if (copies > 0) parts.push(`${plural(copies, 'reprint', 'reprints')} collapsed`);
  parts.push(`last ${windowHours}h`);
  return parts.join(' · ');
}

function setReach(c: Reach | null, windowHours = 24) {
  reach.textContent = c ? reachLine(c, windowHours) : '';
  reach.hidden = !reach.textContent;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/**
 * The place's counts as a mono table: articles, headlines (reprints collapsed), outlets,
 * countries, languages, and the countries other than its own that covered it.
 */
function setCounts(c: Reach | null) {
  if (!c) return void why.replaceChildren();
  const rows: [string, string][] = [['Articles', count(c.n)]];
  if (c.u !== undefined) rows.push(['Headlines', count(c.u)]);
  rows.push(['Outlets', count(c.o)], ['Countries', count(c.c)], ['Languages', count(c.l)]);
  const heard = heardIn(c);
  if (heard) rows.push(['Heard in', heard.replace(/^heard in /, '')]);
  why.replaceChildren(
    ...rows.map(([k, v]) => {
      const row = el('div', 'count-row');
      row.append(el('dt', '', k), el('dd', '', v));
      return row;
    }),
  );
}

/** Marks text with its language (ISO 639 codes only) so screen readers and fonts follow it. */
function setLang(node: HTMLElement, lang: string) {
  if (/^[a-z]{2,3}$/.test(lang)) node.lang = lang;
}

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
    setLang(words, story.headlineLang);
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
  meta.append(el('span', 'story-counts', countsLine(story)));
  const heard = heardIn(story);
  if (heard) meta.append(el('span', '', heard));
  meta.append(el('span', '', span(story.first, story.last)), toneMarker(story.t));

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
// Cards are drawn locally from the article (title and outlet): nothing is requested from
// YouTube until someone presses one, and then only the youtube-nocookie.com player loads.
// Never autoplay.

const MAX_CLIPS = 8;
const PLAY_SVG =
  '<svg viewBox="0 0 4 7" width="4" height="7" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h1v7H0zM1 1h1v5H1zM2 2h1v3H2zM3 3h1v1H3z"/></svg>';

interface Clip {
  id: string;
  source: string;
  title: string;
}

/** Distinct videos in the cell's articles and story articles, newest first. */
function collectClips(detail: CellDetail): Clip[] {
  const all = [...detail.articles, ...(detail.stories ?? []).flatMap((st) => st.articles)];
  all.sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  const seen = new Map<string, Clip>();
  for (const a of all) {
    const id = youtubeId(a.video ?? '');
    if (id && !seen.has(id)) seen.set(id, { id, source: a.source || host(a.url), title: a.title.trim() });
    if (seen.size >= MAX_CLIPS) break;
  }
  return [...seen.values()];
}

/** A dark 16:9 card: play glyph, the article's title (two lines) and the outlet. */
function clipItem(clip: Clip): HTMLLIElement {
  const li = el('li', 'video');
  li.dataset.id = clip.id;
  li.dataset.source = clip.source;
  li.dataset.title = clip.title;
  const button = el('button', 'video-card');
  button.type = 'button';
  button.setAttribute('aria-label', `Play video from ${clip.source}${clip.title ? `: ${clip.title}` : ''}`);
  const glyph = el('span', 'video-glyph');
  glyph.innerHTML = PLAY_SVG;
  button.append(glyph, el('span', 'video-title', clip.title), el('span', 'video-source', clip.source));
  button.addEventListener('click', () => playClip(li));
  li.append(button);
  return li;
}

/** Swaps the card for the YouTube player, in place. */
function playClip(li: HTMLElement) {
  const card = li.querySelector('.video-card');
  if (!card) return;
  // One player at a time: any other open player goes back to its card (which stops it).
  for (const other of videos.querySelectorAll<HTMLElement>('.video.is-playing')) {
    if (other === li) continue;
    other.replaceWith(clipItem({ id: other.dataset.id!, source: other.dataset.source ?? '', title: other.dataset.title ?? '' }));
  }
  const frame = document.createElement('iframe');
  frame.src = `https://www.youtube-nocookie.com/embed/${li.dataset.id}`;
  frame.title = `YouTube video from ${li.dataset.source ?? ''}`;
  frame.allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  frame.allowFullscreen = true;
  frame.loading = 'lazy';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  li.classList.add('is-playing');
  card.replaceWith(frame);
  li.scrollIntoView({ block: 'nearest', inline: 'start' });
  frame.focus();
}

/** From an article row: open that video in the strip (adding it if it was not among the first 8). */
function playFromRow(clip: Clip) {
  let strip = videos.querySelector<HTMLOListElement>('.video-strip');
  if (!strip) {
    strip = el('ol', 'video-strip');
    videos.replaceChildren(el('h3', 'panel-section', 'Videos'), strip);
  }
  videos.hidden = false;
  let li = strip.querySelector<HTMLLIElement>(`li[data-id="${clip.id}"]`);
  if (!li) {
    li = clipItem(clip);
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

/** Stories first (when the cell file has them), then the "All articles" heading for the flat list. */
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
  nodes.push(el('h3', 'panel-section', 'All articles'));
  stories.replaceChildren(...nodes);
  stories.hidden = false;
}

// Coverage -----------------------------------------------------------------
// The covering outlets, where they are based and which languages they write in: counts
// only, in the order the cell file gives them (by count), no ranking words. Each row has a
// 1px strip as long as its share of the largest count.

const MAX_ROWS = 8;

function stripRows(label: string, entries: [string, number][]): HTMLElement {
  const block = el('div', 'coverage-row');
  const rows = el('ul', 'strips');
  rows.setAttribute('aria-label', label);
  const top = Math.max(1, ...entries.slice(0, MAX_ROWS).map(([, n]) => n));
  for (const [key, n] of entries.slice(0, MAX_ROWS)) {
    const li = el('li', 'strip-row');
    const strip = el('span', 'strip');
    strip.style.width = `${Math.max(2, (n / top) * 100)}%`;
    strip.setAttribute('aria-hidden', 'true');
    li.append(el('span', 'strip-key', key || 'unknown'), el('span', 'strip-n', count(n)), strip);
    rows.append(li);
  }
  block.append(el('h3', 'coverage-label', label), rows);
  return block;
}

function renderCoverage(detail: CellDetail | null) {
  const rows: HTMLElement[] = [];
  if (detail?.topOutlets?.length) rows.push(stripRows('Outlets', detail.topOutlets));
  if (detail?.topCountries?.length) rows.push(stripRows('Outlets based in', detail.topCountries));
  if (detail?.languages?.length) rows.push(stripRows('Languages', detail.languages));
  coverage.replaceChildren(...rows);
  coverage.hidden = !rows.length;
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
  // A true minus sign reads better than a hyphen, aloud and on screen.
  const value = tone.toFixed(1).replace('-', '\u2212');
  scale.setAttribute('aria-label', `tone ${value} on GDELT's scale, negative to positive`);
  scale.title = `tone ${value}`;
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
  if (a.title.trim()) setLang(headline, a.lang);
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
  const copies = a.reprints ?? 0;
  if (copies > 0) {
    const tag = el('span', 'article-reprints', `+${plural(copies, 'reprint', 'reprints')}`);
    tag.title = `${plural(copies, 'other article', 'other articles')} here with the same headline`;
    meta.append(tag);
  }
  meta.append(toneMarker(a.tone));
  const id = youtubeId(a.video ?? '');
  if (id) {
    // A small play control next to the title opens the same in-place player.
    const head = el('div', 'article-head');
    const play = el('button', 'article-play');
    play.type = 'button';
    play.setAttribute('aria-label', `Play video from ${a.source || host(a.url)}`);
    play.innerHTML = PLAY_SVG;
    play.addEventListener('click', () => playFromRow({ id, source: a.source || host(a.url), title: a.title.trim() }));
    head.append(headline, play);
    li.append(head, meta);
  } else {
    li.append(headline, meta);
  }
  return li;
}

// Signals ----------------------------------------------------------------------
// The daily broadcast's six slots in their fixed order: the slot label, the fixed frame
// sentence, the outlet's own headline and the counts. Nothing else is written here.

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "21 Oct 2026 · 15:06 UTC", "" when the time does not parse. */
function broadcastWhen(at: string): string {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '' : `${dateFormat.format(d)} · ${utcTime(at)}`;
}

function signalCard(slot: Slot, pick: (slot: Slot) => void): HTMLLIElement {
  const li = el('li', 'signal');
  const id = `signal-${slot.id}`;
  li.setAttribute('aria-labelledby', `${id}-label`);
  const label = el('h3', 'signal-label', SLOT_LABELS[slot.id] ?? slot.id);
  label.id = `${id}-label`;
  li.append(label);

  const line = signalLine(slot);
  if (!line || !slot.cell || !slot.story) {
    li.classList.add('is-empty');
    li.append(el('p', 'signal-empty', emptyLine(slot) || 'No signal met the rule today.'));
    return li;
  }
  const story = slot.story;
  li.append(el('p', 'signal-line', line));

  // The outlet's own title, verbatim, linked to its article when the file has the URL.
  const text = story.headline.trim();
  const attribution = [story.headlineSource, story.headlineLang].filter(Boolean).join(' · ');
  if (text || attribution) {
    const head = el('p', 'story-headline signal-headline');
    if (text) {
      const href = safeHref(story.headlineUrl);
      const words = href ? el('a', 'story-link', text) : el('span', '', text);
      setLang(words, story.headlineLang);
      if (words instanceof HTMLAnchorElement && href) {
        words.href = href;
        words.target = '_blank';
        words.rel = 'noopener';
      }
      head.append(words);
    }
    if (attribution) head.append(el('span', 'story-source', `${text ? ' — ' : ''}${attribution}`));
    li.append(head);
  }

  const meta = el('p', 'story-meta');
  meta.append(el('span', 'story-counts', countsLine(story)));
  const heard = heardIn(story);
  if (heard) meta.append(el('span', '', heard));
  li.append(meta);

  const place = shortName(slot.cell.name) || slot.cell.name;
  const open = el('button', 'signal-open', `Open ${place}`);
  open.type = 'button';
  open.dataset.id = slot.cell.id;
  open.addEventListener('click', () => pick(slot));
  li.append(open);
  return li;
}

// Showing and hiding ---------------------------------------------------------
// The panel overlays the right column (wide), a drawer at the right edge (mid widths) or a
// bottom sheet (phones). Whatever the column showed before comes back on close.

const shell = panel.closest<HTMLElement>('.shell') ?? document.body;

function show(focus: HTMLElement = title) {
  if (panel.hidden) {
    const active = document.activeElement;
    returnFocus = active instanceof HTMLElement && !panel.contains(active) ? active : null;
    panel.hidden = false;
    shell.classList.add('panel-open');
  }
  panel.scrollTop = 0;
  focus.focus();
}

/**
 * Renders the daily broadcast's six slots into `list` (the Signals column) and its time into
 * `when`. `pick` opens a slot's cell. Only well-formed slots with a known id get an entry.
 */
export function renderSignals(list: HTMLElement, when: HTMLElement, broadcast: Broadcast, pick: (slot: Slot) => void) {
  const at = broadcastWhen(broadcast.generatedAt);
  when.textContent = [at, `last ${broadcast.windowHours || 24}h`].filter(Boolean).join(' · ');
  const slots = (Array.isArray(broadcast.slots) ? broadcast.slots : []).filter(
    (slot): slot is Slot => !!slot && typeof slot === 'object' && SLOT_IDS.includes(slot.id),
  );
  list.replaceChildren(...slots.map((slot) => signalCard(slot, pick)));
}

/** Opens the panel for a cell straight away, using the heat.json counts while the detail loads. */
export function openLoading(cell: HeatCell, windowHours: number) {
  title.textContent = cell.name;
  setCounts(cell);
  setReach(cell, windowHours);
  list.replaceChildren();
  renderCoverage(null);
  renderStories(null, 0);
  renderVideos(null);
  setState('loading');
  show();
}

export function showDetail(detail: CellDetail, windowHours: number) {
  title.textContent = detail.name;
  setCounts(detail);
  setReach(detail, windowHours);
  const now = Date.now();
  renderCoverage(detail);
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
  setCounts(null);
  setReach(null);
  list.replaceChildren();
  renderCoverage(null);
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
  renderCoverage(null);
  renderStories(null, 0);
  renderVideos(null);
  setState('Could not load the articles for this place.');
}

/** Phone bottom sheet: two heights only, half and near-full, switched by the handle. */
function setTall(tall: boolean) {
  panel.classList.toggle('is-tall', tall);
  handle.setAttribute('aria-expanded', String(tall));
  handle.setAttribute('aria-label', tall ? 'Collapse details' : 'Expand details');
}

/** The sheet's current height on narrow screens, 0 where the panel is a side column. */
export function sheetHeight(): number {
  return !panel.hidden && window.matchMedia('(max-width: 720px)').matches ? panel.offsetHeight : 0;
}

export function close() {
  if (panel.hidden) return;
  panel.hidden = true;
  shell.classList.remove('panel-open');
  setTall(false);
  onClose();
  returnFocus?.focus();
  returnFocus = null;
}

export function isOpen(): boolean {
  return !panel.hidden;
}

/** `onSheet` hears the phone sheet height (0 when closed or on wide screens) whenever it changes. */
export function initPanel(handleClose: () => void, onSheet: (height: number) => void = () => {}) {
  onClose = handleClose;
  closeButton.addEventListener('click', close);
  handle.addEventListener('click', () => setTall(!panel.classList.contains('is-tall')));
  // Report the sheet's height so the map's padding follows the handle, rotation and
  // viewport changes.
  new ResizeObserver(() => onSheet(sheetHeight())).observe(panel);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) close();
  });
}
