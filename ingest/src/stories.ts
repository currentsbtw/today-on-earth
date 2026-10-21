import { titleTokens } from "./entities.ts";
import { keyCounts, keyOf } from "./reprints.ts";
import { cellStats, compareNewestFirst, homeCountry, toCellArticle } from "./stats.ts";
import type { ArticleRecord, Story } from "./types.ts";

/**
 * Group one cell's articles into stories (docs/DATA-CONTRACT.md "Stories").
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
 * - clusters with n >= 3 become stories, largest first, at most 12.
 * A story's shown articles keep one per reprint key (the newest the outlet cap lets in), and
 * each carries its reprint count over the whole cell.
 */
export const MAX_STORIES = 12;
export const MIN_STORY_ARTICLES = 3;
export const STORY_ARTICLES = 6;
export const STORY_MAX_PER_OUTLET = 2;
export const STORY_ENTITIES = 5;

const TOP_ENTITIES = 10;
const TOP_TOKENS = 20;
const MERGE_TOP = 5;
const MERGE_MIN_OVERLAP = 3;

interface Item {
  r: ArticleRecord;
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

function itemOf(r: ArticleRecord): Item {
  const allEnts = [...new Set([...r.persons, ...r.orgs, ...r.themes])];
  return { r, ents: allEnts, allEnts, toks: titleTokens(r.title) };
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

function toStory(group: Item[], home: string, copies: Map<string, number>): Story {
  const records = group.map((g) => g.r);
  const s = cellStats(records, home);
  let first = records[0].time;
  let last = records[0].time;
  for (const r of records) {
    if (r.time < first) first = r.time;
    if (r.time > last) last = r.time;
  }

  // Token / entity document frequencies within the story.
  const tokDf = new Map<string, number>();
  const nameDf = new Map<string, number>(); // persons and organisations
  const themeDf = new Map<string, number>();
  for (const g of group) {
    for (const t of g.toks) tokDf.set(t, (tokDf.get(t) ?? 0) + 1);
    for (const e of new Set([...g.r.persons, ...g.r.orgs])) nameDf.set(e, (nameDf.get(e) ?? 0) + 1);
    for (const e of new Set(g.r.themes)) themeDf.set(e, (themeDf.get(e) ?? 0) + 1);
  }
  // Medoid: max total token overlap with the other members = sum over its tokens of (df - 1).
  // Articles with a title win over untitled ones; ties by earliest time, then URL.
  const ranked = group
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
    const key = keyOf(r);
    if (key && keys.has(key)) continue;
    const k = perOutlet.get(r.source) ?? 0;
    if (k >= STORY_MAX_PER_OUTLET) continue;
    perOutlet.set(r.source, k + 1);
    if (key) keys.add(key);
    articles.push(r);
  }

  return {
    n: s.n,
    u: s.u,
    o: s.o,
    c: s.c,
    i: s.i,
    l: s.l,
    t: s.t,
    first,
    last,
    headline: medoid.title,
    headlineSource: medoid.source,
    headlineLang: medoid.lang,
    headlineUrl: medoid.url,
    entities: displayEntities(nameDf, themeDf),
    articles: articles.map((r) => {
      const key = keyOf(r);
      return toCellArticle(r, key ? copies.get(key)! - 1 : 0);
    }),
  };
}

/**
 * `records` are one cell's articles; `home` is that cell's own country (for each story's `i`).
 * `tagged[k]` (ingest-internal, not part of the cell file) is how many of `stories[k]`'s articles
 * carry any kind (conflict, politics, crime, disaster), for the broadcast's "ordinary" slot.
 */
export function buildStories(
  records: readonly ArticleRecord[],
  home = homeCountry(records),
): { stories: Story[]; unclustered: number; tagged: number[] } {
  const items = [...records].sort(oldestFirst).map(itemOf);
  removeBackground(items);
  const groups = merge(cluster(items))
    .filter((g) => g.length >= MIN_STORY_ARTICLES)
    .map((g) => ({ g, first: g.reduce((m, x) => (x.r.time < m ? x.r.time : m), g[0].r.time) }));
  // Largest first; ties by earliest article, then by order of creation (stable sort).
  groups.sort((a, b) => b.g.length - a.g.length || (a.first < b.first ? -1 : a.first > b.first ? 1 : 0));
  const copies = keyCounts(records);
  const kept = groups.slice(0, MAX_STORIES);
  const stories = kept.map(({ g }) => toStory(g, home, copies));
  const tagged = kept.map(({ g }) => g.reduce((k, x) => k + (x.r.kinds ? 1 : 0), 0));
  const clustered = stories.reduce((sum, s) => sum + s.n, 0);
  return { stories, unclustered: records.length - clustered, tagged };
}
