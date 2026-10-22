// The daily broadcast (docs/DATA-CONTRACT.md "Broadcast"): six fixed slots filled by
// published rules from the stories data, read from /data/broadcast.json. This module holds
// the shape, the slot labels and the fixed sentence template that frames each slot: numbers
// and an outlet's own headline only, nothing written about the story itself.
import { siteUrl } from './data';
import { count, plural, shortName } from './format';

export type SlotId = 'loudest' | 'planet' | 'rising' | 'brightest' | 'ordinary' | 'faint';

/** Fixed order of the slots, as the file lists them. */
export const SLOT_IDS: readonly SlotId[] = ['loudest', 'planet', 'rising', 'brightest', 'ordinary', 'faint'];

export const SLOT_LABELS: Record<SlotId, string> = {
  loudest: 'Loudest signal',
  planet: 'Heard across the planet',
  rising: 'Rising',
  brightest: 'Most positive tone',
  ordinary: 'Ordinary life',
  faint: 'Faint signal',
};

export interface SlotCell {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** The place's own country, ISO alpha-2, "" when unknown. */
  home: string;
}

export interface SlotStory {
  /** An outlet's own title, verbatim; may be "" when the story has no titled article. */
  headline: string;
  headlineSource: string;
  headlineLang: string;
  /** The article the headline comes from, "" when unknown. */
  headlineUrl: string;
  n: number;
  u: number;
  o: number;
  c: number;
  i: number;
  l: number;
  t: number;
  first: string;
  last: string;
}

export interface Slot {
  id: SlotId;
  available: boolean;
  /** Why an unavailable slot is empty: the baseline is too short, or no story met the rule. */
  reason?: 'baseline' | 'none';
  /** UTC day (YYYY-MM-DD) from which a baseline-gated slot can fill, "" when unknown. */
  availableFrom?: string;
  cell?: SlotCell;
  story?: SlotStory;
  /** Rising only: the cell's articles over its usual level, 1 decimal. */
  ratio?: number;
  /** Rising and faint: the cell's usual daily articles (its baseline median). */
  b?: number;
}

export interface Broadcast {
  generatedAt: string;
  windowHours: number;
  baselineDays: number;
  slots: Slot[];
}

export async function loadBroadcast(): Promise<Broadcast> {
  const res = await fetch(siteUrl('data/broadcast.json'), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} data/broadcast.json`);
  return (await res.json()) as Broadcast;
}

const num = (n: number) => count(n);
const tone = (t: number) => (t > 0 ? `+${t.toFixed(1)}` : t.toFixed(1));

/**
 * The frame sentence for a filled slot: the spectator's voice lives here and in the numbers,
 * never in words about the story. It names its unit (one story, not the place's total) and
 * counts in the ledger's words: articles, outlets, countries, languages. "" for an
 * unavailable slot.
 */
export function signalLine(slot: Slot): string {
  if (!slot.available || !slot.cell || !slot.story) return '';
  const place = shortName(slot.cell.name) || slot.cell.name;
  const s = slot.story;
  const articles = `${plural(s.n, 'article', 'articles')} from ${plural(s.o, 'outlet', 'outlets')}`;
  const languages = plural(s.l, 'language', 'languages');
  switch (slot.id) {
    case 'loudest':
      return `One story over ${place}: ${articles} in ${languages}.`;
    case 'planet':
      return `One story over ${place}, heard in ${plural(s.i, 'other country', 'other countries')}: ${articles}.`;
    case 'rising': {
      // The stored ratio divides by max(normal, 3), so it is not "times the usual level"
      // for quiet places: state both numbers instead.
      const usual = Math.round(slot.b ?? 0);
      return usual > 0
        ? `One story over ${place}: ${articles}, where the place usually has ${plural(usual, 'article', 'articles')} a day.`
        : `One story over ${place}: ${articles}, where the place usually has none.`;
    }
    case 'brightest':
      return `The most positive story, over ${place}: ${articles}, tone ${tone(s.t)}.`;
    case 'ordinary':
      return `One story of ordinary life, over ${place}: ${articles} in ${languages}.`;
    case 'faint': {
      const usual = Math.round(slot.b ?? 0);
      return usual > 0
        ? `One story from a quiet place, ${place}: ${articles}; the place usually has ${num(usual)} a day.`
        : `One story from a quiet place, ${place}: ${articles}; the place usually has none.`;
    }
    default:
      return '';
  }
}

/** A coverage fact a signal entry can state: one of the story's counts, or its reach abroad. */
export type SignalFact = 'articles' | 'outlets' | 'countries' | 'languages' | 'heardIn';

const SENTENCE_FACTS: Record<SlotId, readonly SignalFact[]> = {
  loudest: ['articles', 'outlets', 'languages'],
  planet: ['articles', 'outlets', 'heardIn'],
  rising: ['articles', 'outlets'],
  brightest: ['articles', 'outlets'],
  ordinary: ['articles', 'outlets', 'languages'],
  faint: ['articles', 'outlets'],
};

/**
 * The facts a slot's sentence (signalLine) already states, so the entry's meta line carries
 * only the rest and no number appears twice in one entry.
 */
export function sentenceFacts(id: SlotId): readonly SignalFact[] {
  return SENTENCE_FACTS[id] ?? [];
}

/** Why an empty slot is empty, in the same fixed voice. */
export function emptyLine(slot: Slot): string {
  if (slot.available) return '';
  if (slot.reason === 'baseline') return slot.availableFrom ? `Needs more days of history; from ${slot.availableFrom}.` : 'Needs more days of history.';
  return 'No story met the rule today.';
}
