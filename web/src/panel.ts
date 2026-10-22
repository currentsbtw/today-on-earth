// The place panel (bottom sheet on narrow screens) listing every article for one cell, and
// the Signals entries (the daily broadcast) it shares its log grammar with.
import { emptyLine, sentenceFacts, SLOT_IDS, SLOT_LABELS, signalLine, type Broadcast, type Slot, type SlotStory } from './broadcast';
import type { Article, CellDetail, HeatCell, Story } from './data';
import { ago, codeName, count, host, plural, safeHref, shortName, utcSpan, youtubeId } from './format';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const panel = $<HTMLElement>('panel');
const title = $<HTMLHeadingElement>('panel-title');
const summary = $<HTMLParagraphElement>('panel-summary');
const countsHead = $<HTMLHeadingElement>('panel-counts-head');
const why = $<HTMLDListElement>('panel-why');
const reach = $<HTMLParagraphElement>('panel-reach');
const state = $<HTMLParagraphElement>('panel-state');
const note = $<HTMLParagraphElement>('panel-note');
const list = $<HTMLOListElement>('panel-list');
const listHead = $<HTMLHeadingElement>('panel-list-head');
const listNote = $<HTMLParagraphElement>('panel-list-note');
const stories = $<HTMLDivElement>('panel-stories');
const videos = $<HTMLElement>('panel-videos');
const closeButton = $<HTMLButtonElement>('panel-close');
const coverage = $<HTMLDivElement>('panel-coverage');
const handle = $<HTMLButtonElement>('sheet-handle');

let returnFocus: HTMLElement | null = null;
let onClose: () => void = () => {};

type Counts = Pick<HeatCell, 'n' | 'o' | 'c' | 'l'>;

/** "412 articles · 150 outlets · 23 outlet countries · 9 languages" */
function countsLine(c: Counts): string {
  return [
    plural(c.n, 'article', 'articles'),
    plural(c.o, 'outlet', 'outlets'),
    plural(c.c, 'outlet country', 'outlet countries'),
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

/**
 * "5,424 articles · 1,443 headlines · heard in 105 other countries": the selection line under
 * the map (after the place name) and the panel's summary line under the title. One template,
 * so the two can never drift.
 */
export function summaryLine(c: Reach): string {
  const parts = [plural(c.n, 'article', 'articles')];
  if (c.u !== undefined) parts.push(plural(c.u, 'headline', 'headlines'));
  const heard = heardIn(c);
  if (heard) parts.push(heard);
  return parts.join(' · ');
}

function setSummary(c: Reach | null) {
  summary.textContent = c ? summaryLine(c) : '';
  summary.hidden = !summary.textContent;
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
 * the countries those outlets are based in, languages, and the countries other than its own
 * that covered it.
 */
function setCounts(c: Reach | null) {
  countsHead.hidden = !c;
  if (!c) return void why.replaceChildren();
  const rows: [string, string][] = [['Articles', count(c.n)]];
  if (c.u !== undefined) rows.push(['Headlines', count(c.u)]);
  rows.push(['Outlets', count(c.o)], ['Outlet countries', count(c.c)], ['Languages', count(c.l)]);
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
/** Story cards shown before "show N more stories", so the receipts stay a short scroll away. */
const STORIES_SHOWN = 3;
let storySeq = 0;

/**
 * One story: the outlet's own headline, its counts, time span, entities and newest articles.
 * `pin` is the slot label of the signal it was opened from: a mono tag above the headline.
 */
function storyCard(story: Story, now: number, pin = ''): HTMLElement {
  const card = el('article', 'story');
  const id = `story-${++storySeq}`;
  card.setAttribute('aria-labelledby', `${id}-h`);
  if (pin) {
    card.classList.add('is-pinned');
    card.append(el('p', 'story-pin', `From signals · ${pin}`));
  }

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
  meta.append(el('span', '', utcSpan(story.first, story.last)), toneMarker(story.t));

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
    const label = `show ${plural(extra, 'more article', 'more articles')}`;
    const more = el('button', 'story-more', label);
    more.type = 'button';
    more.setAttribute('aria-expanded', 'false');
    more.setAttribute('aria-controls', items.id);
    more.addEventListener('click', () => {
      const open = more.getAttribute('aria-expanded') !== 'true';
      [...items.children].forEach((li, i) => ((li as HTMLElement).hidden = !open && i >= STORY_PREVIEW));
      more.setAttribute('aria-expanded', String(open));
      more.textContent = open ? 'show fewer articles' : label;
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

// A focused card is scrolled fully into the strip: the browser leaves a partly visible one
// where it is, so a keyboard user could press a card whose title is cut off.
videos.addEventListener('focusin', (e) => {
  const card = (e.target as HTMLElement).closest<HTMLElement>('.video');
  card?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
});

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

/** The signal a place was opened from: its slot label and its story, which leads the Stories list. */
export interface StoryPin {
  label: string;
  headline: string;
  url: string;
}

/** The cell's story a signal named: by the headline's article URL, else by the headline text; -1 when absent. */
function pinnedIndex(groups: Story[], pin: StoryPin): number {
  if (pin.url) {
    const at = groups.findIndex((st) => st.articles.some((a) => a.url === pin.url));
    if (at >= 0) return at;
  }
  const text = pin.headline.trim();
  return text ? groups.findIndex((st) => st.headline.trim() === text) : -1;
}

/**
 * The stories, when the cell file has them; the flat list keeps its own heading
 * (#panel-list-head). With a pin, the signal's story comes first under a FROM SIGNALS tag and
 * counts as one of the three shown. Returns whether the pinned story was found.
 */
function renderStories(detail: CellDetail | null, now: number, pin: StoryPin | null = null): boolean {
  let groups = detail?.stories ?? [];
  if (!detail || !groups.length) {
    stories.replaceChildren();
    stories.hidden = true;
    return false;
  }
  const at = pin ? pinnedIndex(groups, pin) : -1;
  if (at > 0) groups = [groups[at], ...groups.slice(0, at), ...groups.slice(at + 1)];
  const cards = groups.map((s, i) => storyCard(s, now, at >= 0 && i === 0 && pin ? pin.label : ''));
  const rest = cards.slice(STORIES_SHOWN);
  const nodes: HTMLElement[] = [el('h3', 'panel-section', 'Stories'), ...cards];
  if (rest.length) {
    for (const card of rest) card.hidden = true;
    const more = el('button', 'stories-more', `show ${rest.length} more ${rest.length === 1 ? 'story' : 'stories'}`);
    more.type = 'button';
    more.setAttribute('aria-controls', stories.id);
    // One step: the rest appear in place and the button goes. Focus moves to the first
    // revealed story (its headline link, else its heading) so it is not lost with the button.
    more.addEventListener('click', () => {
      for (const card of rest) card.hidden = false;
      const first = rest[0];
      let target = first.querySelector<HTMLElement>('.story-link');
      if (!target) {
        target = first.querySelector<HTMLElement>('.story-headline') ?? first;
        target.tabIndex = -1;
      }
      more.remove();
      target.focus();
    });
    nodes.push(more);
  }
  if (detail.unclustered && detail.unclustered > 0) {
    nodes.push(el('p', 'stories-rest', `${plural(detail.unclustered, 'more article', 'more articles')} not grouped`));
  }
  stories.replaceChildren(...nodes);
  stories.hidden = false;
  return at >= 0;
}

// Coverage -----------------------------------------------------------------
// The covering outlets, where they are based and which languages they write in: counts
// only, in the order the cell file gives them (by count), no ranking words. Each row has a
// 1px strip as long as its share of the largest count.

const MAX_ROWS = 8;

/**
 * A coverage key. Outlets keep their domain verbatim. Countries and languages are ISO codes:
 * the English name (Intl.DisplayNames) with the code after it in muted mono, set in the
 * ledger's uppercase like the rest of the row ("GREECE · GR"); the code alone when the
 * browser has no name for it; "unknown" for an empty key, in the same case as the rest.
 */
function stripKey(key: string, codes?: 'region' | 'language'): HTMLElement {
  if (!codes) return el('span', 'strip-key', key || 'unknown');
  const name = key ? codeName(key, codes) : '';
  const node = el('span', 'strip-key is-code', name || key || 'unknown');
  if (name) node.append(el('span', 'strip-code', ` · ${key}`));
  return node;
}

function stripRows(label: string, entries: [string, number][], codes?: 'region' | 'language'): HTMLElement {
  const block = el('div', 'coverage-row');
  const rows = el('ul', 'strips');
  rows.setAttribute('aria-label', label);
  const top = Math.max(1, ...entries.slice(0, MAX_ROWS).map(([, n]) => n));
  for (const [key, n] of entries.slice(0, MAX_ROWS)) {
    const li = el('li', 'strip-row');
    const strip = el('span', 'strip');
    strip.style.width = `${Math.max(2, (n / top) * 100)}%`;
    strip.setAttribute('aria-hidden', 'true');
    li.append(stripKey(key, codes), el('span', 'strip-n', count(n)), strip);
    rows.append(li);
  }
  block.append(el('h3', 'coverage-label', label), rows);
  return block;
}

function renderCoverage(detail: CellDetail | null) {
  const rows: HTMLElement[] = [];
  if (detail?.topOutlets?.length) rows.push(stripRows('Outlets', detail.topOutlets));
  if (detail?.topCountries?.length) rows.push(stripRows('Outlets based in', detail.topCountries, 'region'));
  if (detail?.languages?.length) rows.push(stripRows('Languages', detail.languages, 'language'));
  coverage.replaceChildren(...rows);
  coverage.hidden = !rows.length;
}

function setState(text: string) {
  state.textContent = text;
  state.hidden = !text;
}

/** The flat "All articles" list, its heading only when it has rows, and its one caption line. */
function setList(items: HTMLLIElement[], caption = '') {
  list.replaceChildren(...items);
  listHead.hidden = !items.length;
  listNote.textContent = items.length ? caption : '';
  listNote.hidden = !listNote.textContent;
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
// The daily broadcast's six slots in their fixed order. Each filled entry folds: closed, it
// is the slot name, the place, a pixel plus and the outlet's headline (two lines), and
// pressing the head or the headline opens it; open, the plus is a minus and the entry adds
// the READ AT link to the outlet, the fixed sentence, the counts the sentence left out and
// OPEN. Nothing else is written, and nothing in a closed entry leaves the site.

/** The slot whose entry is open, kept across re-renders; null when every entry is closed. */
let openSlot: Slot['id'] | null = null;

/**
 * Opens one entry (closing the rest) or, with null, closes them all. One step, no transition.
 * `reveal` (a press, not a re-render) scrolls the opened entry into view so OPEN is never
 * left below the column's edge.
 */
function setOpenSignal(list: HTMLElement, id: Slot['id'] | null, reveal = false) {
  openSlot = id;
  for (const li of list.querySelectorAll<HTMLLIElement>('.signal')) {
    const toggle = li.querySelector<HTMLButtonElement>('.signal-toggle');
    const body = li.querySelector<HTMLElement>('.signal-body');
    if (!toggle || !body) continue;
    const open = li.dataset.slot === id;
    li.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    body.hidden = !open;
    if (open && reveal) li.scrollIntoView({ block: 'nearest' });
  }
}

/** The fold's mark: a 7x7 pixel plus while closed; CSS drops the upright when open (a minus). */
const FOLD_SVG =
  '<svg class="signal-mark" viewBox="0 0 7 7" width="7" height="7" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 3h7v1H0z"/><path class="signal-mark-v" d="M3 0h1v3H3zM3 4h1v3H3z"/></svg>';

/**
 * A signal entry's meta line: only the counts its sentence did not state, so no number
 * appears twice in one entry; null when the sentence said them all. The outlet-country count
 * is never one of them: the entry states the reach abroad (HEARD IN N OTHER COUNTRIES) only.
 */
function signalMeta(id: Slot['id'], story: SlotStory): HTMLParagraphElement | null {
  const said = sentenceFacts(id);
  const counts = (
    [
      ['articles', plural(story.n, 'article', 'articles')],
      ['outlets', plural(story.o, 'outlet', 'outlets')],
      ['languages', plural(story.l, 'language', 'languages')],
    ] as const
  )
    .filter(([fact]) => !said.includes(fact))
    .map(([, text]) => text);
  const heard = said.includes('heardIn') ? '' : heardIn(story);
  if (!counts.length && !heard) return null;
  const meta = el('p', 'story-meta');
  if (counts.length) meta.append(el('span', 'story-counts', counts.join(' · ')));
  if (heard) meta.append(el('span', '', heard));
  return meta;
}

function signalCard(slot: Slot, list: HTMLElement, pick: (slot: Slot) => void): HTMLLIElement {
  const li = el('li', 'signal');
  li.dataset.slot = slot.id;
  const id = `signal-${slot.id}`;
  const label = SLOT_LABELS[slot.id] ?? slot.id;
  const head = el('h3', 'signal-head');
  li.append(head);

  const line = signalLine(slot);
  if (!line || !slot.cell || !slot.story) {
    // An empty slot does not fold: its name and the one-line reason, always shown.
    li.classList.add('is-empty');
    head.append(el('span', 'signal-row', label));
    li.append(el('p', 'signal-empty', emptyLine(slot) || 'No story met the rule today.'));
    return li;
  }
  const story = slot.story;
  const place = shortName(slot.cell.name) || slot.cell.name;

  // The head row is the fold's control: slot name left, then the place and the pixel plus
  // (a minus when open) at the right, the whole row the hit area.
  const toggle = el('button', 'signal-row signal-toggle');
  toggle.type = 'button';
  toggle.id = `${id}-toggle`;
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', `${id}-body`);
  const end = el('span', 'signal-end');
  end.append(el('span', 'signal-place', place));
  end.insertAdjacentHTML('beforeend', FOLD_SVG);
  toggle.append(el('span', 'signal-slot', label), end);
  toggle.addEventListener('click', () => setOpenSignal(list, openSlot === slot.id ? null : slot.id, true));
  head.append(toggle);

  // The outlet's own title, verbatim. It is not a link: while the entry is closed, pressing
  // it opens the entry like the head (a pointer target only; the head is the one tab stop),
  // and the way out to the outlet is the READ AT link inside the open body.
  const text = story.headline.trim();
  const attribution = [story.headlineSource, story.headlineLang].filter(Boolean).join(' · ');
  const href = safeHref(story.headlineUrl);
  if (text || attribution) {
    const headline = el('p', 'story-headline signal-headline');
    if (text) {
      const words = el('span', '', text);
      setLang(words, story.headlineLang);
      headline.append(words);
    } else {
      // No title to show: the outlet line stands in the headline's place.
      headline.append(el('span', 'story-source', attribution));
    }
    // Focus is left where it is (moving it to the head would draw a ring for a tap); the
    // next Tab starts from the pressed headline, at READ AT.
    headline.addEventListener('click', () => {
      if (openSlot !== slot.id) setOpenSignal(list, slot.id, true);
    });
    li.append(headline);
  }

  const body = el('div', 'signal-body');
  body.id = `${id}-body`;
  body.hidden = true;
  if (href) {
    // The outbound link: "READ AT THEGAZETTE.COM", in a new tab; hreflang carries the
    // article's language (the link's own words are English).
    const source = el('p', 'signal-source');
    const read = el('a', 'signal-read', `Read at ${story.headlineSource || host(href)}`);
    read.href = href;
    read.target = '_blank';
    read.rel = 'noopener';
    if (/^[a-z]{2,3}$/.test(story.headlineLang)) read.hreflang = story.headlineLang;
    source.append(read);
    body.append(source);
  } else if (text && attribution) {
    body.append(el('p', 'story-source signal-source', attribution));
  }
  body.append(el('p', 'signal-line', line));
  const meta = signalMeta(slot.id, story);
  if (meta) body.append(meta);
  const open = el('button', 'signal-open', `Open ${place}`);
  open.type = 'button';
  open.dataset.id = slot.cell.id;
  open.addEventListener('click', () => pick(slot));
  body.append(open);
  li.append(body);
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
 * Renders the daily broadcast's six slots into `list` (the Signals column) and its window
 * into `when` ("last 24h"; the snapshot time is the clock's and the stamp's). `pick` opens
 * a slot's cell. Only well-formed slots with a known id get an entry. Every entry starts
 * closed; an entry that was open before a re-render stays open.
 */
export function renderSignals(list: HTMLElement, when: HTMLElement, broadcast: Broadcast, pick: (slot: Slot) => void) {
  when.textContent = `last ${broadcast.windowHours || 24}h`;
  const slots = (Array.isArray(broadcast.slots) ? broadcast.slots : []).filter(
    (slot): slot is Slot => !!slot && typeof slot === 'object' && SLOT_IDS.includes(slot.id),
  );
  list.replaceChildren(...slots.map((slot) => signalCard(slot, list, pick)));
  setOpenSignal(list, openSlot);
}

/** Opens the panel for a cell straight away, using the heat.json counts while the detail loads. */
export function openLoading(cell: HeatCell, windowHours: number) {
  title.textContent = cell.name;
  setSummary(cell);
  setCounts(cell);
  setReach(cell, windowHours);
  setList([]);
  renderCoverage(null);
  renderStories(null, 0);
  renderVideos(null);
  setState('loading');
  show();
}

/** Fills the panel from the cell's detail file; returns whether `pin`'s story was found and pinned. */
export function showDetail(detail: CellDetail, windowHours: number, pin: StoryPin | null = null): boolean {
  title.textContent = detail.name;
  setSummary(detail);
  setCounts(detail);
  setReach(detail, windowHours);
  const now = Date.now();
  const pinned = renderStories(detail, now, pin);
  renderCoverage(detail);
  renderVideos(detail);
  const shown = detail.articles.length;
  setList(
    detail.articles.map((a) => articleItem(a, now)),
    shown < detail.n ? `newest ${count(shown)} of ${count(detail.n)}` : '',
  );
  setState(shown ? '' : 'No articles listed for this place.');
  return pinned;
}

/** A replay cell that is not in the current snapshot: there is no detail file for it. */
export function openMissing(n: number) {
  title.textContent = plural(n, 'article', 'articles');
  setSummary(null);
  setCounts(null);
  setReach(null);
  setList([]);
  renderCoverage(null);
  renderStories(null, 0);
  renderVideos(null);
  setState('No current details for this place.');
  show();
}

/** One quiet tag under the summary line, e.g. while replaying a past frame. */
export function setNote(text: string) {
  note.textContent = text;
  note.hidden = !text;
}

export function showError() {
  setList([]);
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
