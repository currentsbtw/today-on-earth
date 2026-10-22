// The counting logic, kept free of the Workers runtime so `node --test` can exercise it.
// It holds only a random per-tab id and the time it was last seen, in memory.

/** An id counts as present for this long after its last ping. */
export const WINDOW_MS = 75_000;

/** At most this many ids are held; past it, new ids are not added (known ones still refresh). */
export const MAX_IDS = 50_000;

const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** A session id is a string of 8 to 64 characters from [A-Za-z0-9_-]. */
export function isValidId(id: unknown): id is string {
  return typeof id === 'string' && ID_PATTERN.test(id);
}

/** Distinct ids seen in the last `windowMs`. Every call prunes the expired ones first. */
export class Presence {
  readonly #seen = new Map<string, number>();
  readonly #windowMs: number;
  readonly #maxIds: number;

  constructor(windowMs = WINDOW_MS, maxIds = MAX_IDS) {
    this.#windowMs = windowMs;
    this.#maxIds = maxIds;
  }

  /** Marks `id` as seen at `now` and returns the count. */
  ping(id: string, now: number): number {
    this.#prune(now);
    if (this.#seen.has(id) || this.#seen.size < this.#maxIds) {
      // Re-inserting keeps the map ordered by last ping, oldest first, so pruning can stop early.
      this.#seen.delete(id);
      this.#seen.set(id, now);
    }
    return this.#seen.size;
  }

  /** Forgets `id` and returns the count. */
  leave(id: string, now: number): number {
    this.#prune(now);
    this.#seen.delete(id);
    return this.#seen.size;
  }

  /** The count at `now`. */
  count(now: number): number {
    this.#prune(now);
    return this.#seen.size;
  }

  #prune(now: number): void {
    const cutoff = now - this.#windowMs;
    for (const [id, at] of this.#seen) {
      if (at > cutoff) break;
      this.#seen.delete(id);
    }
  }
}
