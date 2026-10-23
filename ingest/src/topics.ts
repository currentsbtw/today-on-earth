import type { CellFile, Story, TopicsFile } from "./types.ts";

/**
 * The topic index, `/data/topics.json` (docs/DATA-CONTRACT.md "Topics"): which places talk
 * about a person or organisation, for lighting the map by topic on the site.
 *
 * Built from the cell files' stories: every displayed entity of a story that is a person or
 * organisation adds the story's `n` to that entity's count in the story's cell. Theme words
 * (displayEntities tops a story up with them when it has fewer than 2 names) never enter the
 * index: `storyNames` says how many of a story's leading `entities` are names (the rest are
 * theme words), as the snapshot recorded it when grouping (ingest-internal).
 */
export const TOPIC_MIN_TOTAL = 10;
export const TOPIC_MAX_CELLS = 60;
export const MAX_TOPICS = 5000;
export const TOPIC_MIN_LENGTH = 4;

/** Single generic words that name no one in particular. */
export const TOPIC_DENY = new Set([
  "news", "police", "government", "people", "city", "state", "county", "court",
  "university", "company", "minister", "president", "hotel", "young",
]);

/**
 * Entities too generic or broken to be a topic: shorter than 4 characters, starting with an
 * article ("a ", "an ", "the "; GDELT's names from translated text, "a prosecution national
 * terrorism"), a single word of the deny list, or nothing but digits, punctuation and spaces.
 */
export function isJunkTopic(name: string): boolean {
  if ([...name].length < TOPIC_MIN_LENGTH) return true;
  if (name.startsWith("a ") || name.startsWith("an ") || name.startsWith("the ")) return true;
  if (TOPIC_DENY.has(name)) return true;
  return /^[\p{N}\p{P}\p{S}\s]+$/u.test(name);
}

const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * `cells` are the snapshot's cell files; `storyNames` maps each of their stories to how many
 * of its leading `entities` are persons or organisations (a story missing from it counts none).
 * Pure and deterministic: the same cells give the same file.
 */
export function buildTopics(cells: readonly CellFile[], generatedAt: string, storyNames: ReadonlyMap<Story, number>): TopicsFile {
  // entity -> cell id -> summed story n
  const counts = new Map<string, Map<string, number>>();
  for (const cell of cells) {
    for (const story of cell.stories) {
      const names = storyNames.get(story) ?? 0;
      for (const name of story.entities.slice(0, names)) {
        if (isJunkTopic(name)) continue;
        let perCell = counts.get(name);
        if (!perCell) counts.set(name, (perCell = new Map()));
        perCell.set(cell.id, (perCell.get(cell.id) ?? 0) + story.n);
      }
    }
  }

  const topics: TopicsFile["topics"] = [];
  for (const [name, perCell] of counts) {
    // Largest n first, ties by cell id; the total is over the kept cells only.
    const kept = [...perCell.entries()].sort((a, b) => b[1] - a[1] || byKey(a[0], b[0])).slice(0, TOPIC_MAX_CELLS);
    const total = kept.reduce((sum, [, n]) => sum + n, 0);
    if (total >= TOPIC_MIN_TOTAL) topics.push([name, total, kept]);
  }
  topics.sort((a, b) => b[1] - a[1] || byKey(a[0], b[0]));
  return { generatedAt, topics: topics.slice(0, MAX_TOPICS) };
}
