import { outletOf } from "./domains.ts";
import { titleTokens } from "./entities.ts";
import { createKeyer, keyCounts, unitsOf, type Keyer } from "./reprints.ts";
import { cellStats, compareNewestFirst, homeCountry, representative, toCellArticle } from "./stats.ts";
import type { ArticleRecord, Story } from "./types.ts";

/**
 * Group one cell's articles into stories (docs/DATA-CONTRACT.md "Stories").
 *
 * The items grouped are article units (stats.ts articleUnits): an outlet's copies of one
 * headline are one item, represented by its earliest copy, so a story's `n` counts units and
 * `sum(stories.n) + unclustered` is the cell's `n`. Title tokens come from the shown title.
 *
 * Deterministic greedy single-pass clustering over GDELT's own tags (persons, organisations,
 * themes) and title tokens, in time-then-URL order:
 * - in cells of 50+ articles, entities on more than 15% of the cell's articles are ignored
 *   for grouping (see removeBackground);
 * - an article joins the best existing cluster when it shares >= 2 entities with the
 *   cluster's top-10 entities, or >= 1 entity and >= 2 title tokens with its top-20 tokens,
 *   or >= 4 title tokens; best = highest 2*entities + tokens, ties to the larger cluster,
 *   then the older cluster; otherwise it starts a new cluster;
 * - then clusters whose top-5 entity sets overlap by >= 3 are merged (transitively);
 * - clusters with n >= 3 become stories, largest first, at most 30 (re-sorted by final n
 *   after the second pass, ties keeping the first order);
 * - second pass: each item outside every story is attached to the story whose top-20 title
 *   tokens (from the story's clustered members) share >= 3 tokens with its own; best = most
 *   shared, ties to the larger story, then the earlier story. Attached items count in the
 *   story's counters, dates and entities but never become its headline (medoid).
 * A story's shown articles keep one per reprint key (the newest the outlet cap lets in), and
 * each carries its reprint count over the whole cell. The outlet cap counts a network once.
 */
export const MAX_STORIES = 30;
/** Second pass: minimum shared title tokens with a story's top-20 to attach a loose item. */
export const ATTACH_MIN_TOKENS = 3;
export const MIN_STORY_ARTICLES = 3;
export const STORY_ARTICLES = 6;
export const STORY_MAX_PER_OUTLET = 2;
export const STORY_ENTITIES = 5;

const TOP_ENTITIES = 10;
const TOP_TOKENS = 20;
const MERGE_TOP = 5;
const MERGE_MIN_OVERLAP = 3;

interface Item {
  /** The unit's earliest record: its tags and title stand for the unit. */
  r: ArticleRecord;
  /** Every record of the unit (one outlet's copies of one headline, or one untitled record). */
  unit: ArticleRecord[];
  /** Entities used for grouping (the cell's background entities removed). */
  ents: string[];
  /** All of the article's entities, for the story's displayed entities. */
  allEnts: string[];
  toks: string[];
}

class Cluster {
  members: Item[] = [];
  ent = new Map<string, number>();
  tok = new Map<string, number>();
  private cache: { topEnt: Set<string>; topTok: Set<string> } | null = null;

  constructor(readonly idx: number) {}

  add(item: Item) {
    this.members.push(item);
    for (const e of item.ents) this.ent.set(e, (this.ent.get(e) ?? 0) + 1);
    for (const t of item.toks) this.tok.set(t, (this.tok.get(t) ?? 0) + 1);
    this.cache = null;
  }

  tops() {
    this.cache ??= { topEnt: new Set(topKeys(this.ent, TOP_ENTITIES)), topTok: new Set(topKeys(this.tok, TOP_TOKENS)) };
    return this.cache;
  }
}

/** Keys with the highest counts, ties by key, at most k. */
function topKeys(m: Map<string, number>, k: number): string[] {
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, k)
    .map(([key]) => key);
}

function itemOf(unit: ArticleRecord[], keyer: Keyer): Item {
  const r = representative(unit);
  const allEnts = [...new Set([...r.persons, ...r.orgs, ...r.themes])];
  return { r, unit, ents: allEnts, allEnts, toks: titleTokens(keyer.shownTitle(r)) };
}

/**
 * Background entities: in a busy cell, an entity on more than 15% of its articles (e.g.
 * "donald trump" and "white house" on ~25% of Washington's) is the place's backdrop, not a
 * story; two articles sharing it are usually unrelated. Such entities are ignored for
 * grouping (they still show in a story's entities). Cells under 50 articles are left alone.
 */
export const BACKGROUND_MIN_ARTICLES = 50;
export const BACKGROUND_SHARE = 0.15;

function removeBackground(items: Item[]): void {
  if (items.length < BACKGROUND_MIN_ARTICLES) return;
  const df = new Map<string, number>();
  for (const it of items) for (const e of it.allEnts) df.set(e, (df.get(e) ?? 0) + 1);
  const limit = BACKGROUND_SHARE * items.length;
  for (const it of items) it.ents = it.allEnts.filter((e) => df.get(e)! <= limit);
}

function oldestFirst(a: ArticleRecord, b: ArticleRecord): number {
  if (a.time !== b.time) return a.time < b.time ? -1 : 1;
  return a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
}

/** Greedy pass: returns clusters in creation order. */
function cluster(items: Item[]): Cluster[] {
  const clusters: Cluster[] = [];
  // Inverted indexes: entity/token -> clusters whose bag contains it (candidates only).
  const byEnt = new Map<string, Set<Cluster>>();
  const byTok = new Map<string, Set<Cluster>>();
  const index = (c: Cluster, item: Item) => {
    for (const e of item.ents) (byEnt.get(e) ?? byEnt.set(e, new Set()).get(e)!).add(c);
    for (const t of item.toks) (byTok.get(t) ?? byTok.set(t, new Set()).get(t)!).add(c);
  };

  for (const item of items) {
    const candidates = new Set<Cluster>();
    for (const e of item.ents) for (const c of byEnt.get(e) ?? []) candidates.add(c);
    for (const t of item.toks) for (const c of byTok.get(t) ?? []) candidates.add(c);

    let best: Cluster | null = null;
    let bestScore = -1;
    for (const c of candidates) {
      const { topEnt, topTok } = c.tops();
      let se = 0;
      for (const e of item.ents) if (topEnt.has(e)) se++;
      let st = 0;
      for (const t of item.toks) if (topTok.has(t)) st++;
      if (!(se >= 2 || (se >= 1 && st >= 2) || st >= 4)) continue;
      const score = 2 * se + st;
      if (
        score > bestScore ||
        (score === bestScore && best && (c.members.length > best.members.length || (c.members.length === best.members.length && c.idx < best.idx)))
      ) {
        best = c;
        bestScore = score;
      }
    }
    const target = best ?? new Cluster(clusters.length);
    if (!best) clusters.push(target);
    target.add(item);
    index(target, item);
  }
  return clusters;
}

/** Merge clusters whose top-5 entity sets share >= 3 entities (union-find, deterministic). */
function merge(clusters: Cluster[]): Item[][] {
  const parent = clusters.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const top5 = clusters.map((c) => topKeys(c.ent, MERGE_TOP));
  const byEnt = new Map<string, number[]>();
  top5.forEach((keys, i) => {
    if (keys.length < MERGE_MIN_OVERLAP) return;
    for (const k of keys) (byEnt.get(k) ?? byEnt.set(k, []).get(k)!).push(i);
  });
  for (let i = 0; i < clusters.length; i++) {
    if (top5[i].length < MERGE_MIN_OVERLAP) continue;
    const shared = new Map<number, number>();
    for (const k of top5[i]) for (const j of byEnt.get(k)!) if (j > i) shared.set(j, (shared.get(j) ?? 0) + 1);
    for (const [j, n] of shared) {
      if (n < MERGE_MIN_OVERLAP) continue;
      const a = find(i);
      const b = find(j);
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
  }
  const groups = new Map<number, Item[]>();
  clusters.forEach((c, i) => {
    const root = find(i);
    const g = groups.get(root) ?? groups.set(root, []).get(root)!;
    g.push(...c.members);
  });
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g);
}

const THEME_FAMILIES = new Set(["env", "econ", "soc", "wb", "tax", "crisislex", "gov", "med", "mil", "sec"]);

/** GKG theme code as lowercase words: "env_climatechange" -> "climatechange", "natural_disaster_flood" -> "natural disaster flood". */
export function themeWords(theme: string): string {
  let t = theme.toLowerCase();
  const us = t.indexOf("_");
  if (us > 0 && THEME_FAMILIES.has(t.slice(0, us))) t = t.slice(us + 1);
  return t.replace(/_+/g, " ").trim();
}

/**
 * A story's displayed `entities`: up to 5 most shared persons and organisations; only when
 * that gives fewer than 2 are themes added (as words, most shared first) to reach up to 5.
 * Display only: grouping still uses persons, organisations and themes alike.
 */
export function displayEntities(nameDf: Map<string, number>, themeDf: Map<string, number>): string[] {
  const out = topKeys(nameDf, STORY_ENTITIES);
  if (out.length >= 2) return out;
  for (const theme of topKeys(themeDf, themeDf.size)) {
    if (out.length >= STORY_ENTITIES) break;
    const words = themeWords(theme);
    if (words && !out.includes(words)) out.push(words);
  }
  return out;
}

/**
 * `core` are the clustered members (medoid candidates), `attached` the second pass's.
 * `names`: how many of the story's leading `entities` are persons or organisations (the rest
 * are theme words).
 */
function toStory(core: Item[], attached: Item[], home: string, copies: Map<string, number>, keyer: Keyer): { story: Story; names: number } {
  const group = attached.length ? [...core, ...attached] : core;
  const records = group.flatMap((g) => g.unit);
  const s = cellStats(records, keyer, home);
  let first = records[0].time;
  let last = records[0].time;
  for (const r of records) {
    if (r.time < first) first = r.time;
    if (r.time > last) last = r.time;
  }

  // Entity document frequencies within the story (every member); token frequencies over the
  // clustered members only, for the medoid.
  const tokDf = new Map<string, number>();
  const nameDf = new Map<string, number>(); // persons and organisations
  const themeDf = new Map<string, number>();
  for (const g of group) {
    for (const e of new Set([...g.r.persons, ...g.r.orgs])) nameDf.set(e, (nameDf.get(e) ?? 0) + 1);
    for (const e of new Set(g.r.themes)) themeDf.set(e, (themeDf.get(e) ?? 0) + 1);
  }
  for (const g of core) for (const t of g.toks) tokDf.set(t, (tokDf.get(t) ?? 0) + 1);
  // Medoid (clustered members only): max total token overlap with the other members = sum
  // over its tokens of (df - 1). Articles with a title win over untitled ones; ties by
  // earliest time, then URL.
  const ranked = core
    .map((g) => ({ g, score: g.toks.reduce((sum, t) => sum + tokDf.get(t)! - 1, 0) }))
    .sort(
      (a, b) =>
        Number(!!b.g.r.title) - Number(!!a.g.r.title) ||
        b.score - a.score ||
        oldestFirst(a.g.r, b.g.r),
    );
  const medoid = ranked[0].g.r;

  const perOutlet = new Map<string, number>();
  const keys = new Set<string>();
  const articles: ArticleRecord[] = [];
  for (const r of [...records].sort(compareNewestFirst)) {
    if (articles.length >= STORY_ARTICLES) break;
    const key = keyer.keyOf(r);
    if (key && keys.has(key)) continue;
    const outlet = outletOf(r.source);
    const k = perOutlet.get(outlet) ?? 0;
    if (k >= STORY_MAX_PER_OUTLET) continue;
    perOutlet.set(outlet, k + 1);
    if (key) keys.add(key);
    articles.push(r);
  }

  const story: Story = {
    n: s.n,
    u: s.u,
    o: s.o,
    c: s.c,
    i: s.i,
    l: s.l,
    t: s.t,
    first,
    last,
    headline: keyer.shownTitle(medoid),
    headlineSource: medoid.source,
    headlineLang: medoid.lang,
    headlineUrl: medoid.url,
    entities: displayEntities(nameDf, themeDf),
    articles: articles.map((r) => {
      const key = keyer.keyOf(r);
      return toCellArticle(r, keyer, key ? copies.get(key)! - 1 : 0);
    }),
  };
  // displayEntities puts the persons and organisations first, at most STORY_ENTITIES of them.
  return { story, names: Math.min(STORY_ENTITIES, nameDf.size) };
}

/** Second pass: attach each item outside every story to the best story by title tokens. */
function attach(items: readonly Item[], stories: readonly Item[][]): Item[][] {
  const attached = stories.map((): Item[] => []);
  const inStory = new Set(stories.flat());
  const byTok = new Map<string, number[]>(); // token -> stories whose top-20 tokens contain it
  stories.forEach((g, k) => {
    const tok = new Map<string, number>();
    for (const it of g) for (const t of it.toks) tok.set(t, (tok.get(t) ?? 0) + 1);
    for (const t of topKeys(tok, TOP_TOKENS)) (byTok.get(t) ?? byTok.set(t, []).get(t)!).push(k);
  });
  for (const it of items) {
    if (inStory.has(it) || !it.toks.length) continue;
    const shared = new Map<number, number>();
    for (const t of it.toks) for (const k of byTok.get(t) ?? []) shared.set(k, (shared.get(k) ?? 0) + 1);
    let best = -1;
    let bestShared = 0;
    for (const [k, n] of shared) {
      if (n < ATTACH_MIN_TOKENS) continue;
      if (
        best < 0 ||
        n > bestShared ||
        (n === bestShared && (stories[k].length > stories[best].length || (stories[k].length === stories[best].length && k < best)))
      ) {
        best = k;
        bestShared = n;
      }
    }
    if (best >= 0) attached[best].push(it);
  }
  return attached;
}

/**
 * `records` are one cell's articles; `home` is that cell's own country (for each story's `i`).
 * `keyer` is the snapshot's (reprint keys, shown titles); by default one learned from `records`.
 * `tagged[k]` (ingest-internal, not part of the cell file) is how many of `stories[k]`'s article
 * units carry any kind (conflict, politics, crime, disaster), for the broadcast's "ordinary" slot.
 * `names[k]` (ingest-internal) is how many of `stories[k].entities`, from the start, are persons or
 * organisations; the rest are theme words (displayEntities). For the topic index.
 */
export function buildStories(
  records: readonly ArticleRecord[],
  keyer: Keyer = createKeyer(records),
  home = homeCountry(records),
): { stories: Story[]; unclustered: number; tagged: number[]; names: number[] } {
  const items = unitsOf(records, keyer, outletOf)
    .map((unit) => itemOf(unit, keyer))
    .sort((a, b) => oldestFirst(a.r, b.r));
  removeBackground(items);
  const groups = merge(cluster(items))
    .filter((g) => g.length >= MIN_STORY_ARTICLES)
    .map((g) => ({ g, first: g.reduce((m, x) => (x.r.time < m ? x.r.time : m), g[0].r.time) }));
  // Largest first; ties by earliest article, then by order of creation (stable sort).
  groups.sort((a, b) => b.g.length - a.g.length || (a.first < b.first ? -1 : a.first > b.first ? 1 : 0));
  const kept = groups.slice(0, MAX_STORIES).map(({ g }) => g);
  const attached = attach(items, kept);
  const copies = keyCounts(records, keyer, outletOf);
  // Attachments can reorder sizes: largest first again, ties keep the order above (stable).
  const built = kept
    .map((g, k) => ({
      ...toStory(g, attached[k], home, copies, keyer),
      tagged: [...g, ...attached[k]].reduce((n, x) => n + (x.unit.some((r) => r.kinds) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.story.n - a.story.n);
  const stories = built.map((b) => b.story);
  const tagged = built.map((b) => b.tagged);
  const names = built.map((b) => b.names);
  const clustered = stories.reduce((sum, s) => sum + s.n, 0);
  return { stories, unclustered: items.length - clustered, tagged, names };
}
