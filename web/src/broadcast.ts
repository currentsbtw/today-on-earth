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
  brightest: 'Brightest',
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
 * never in words about the story. "" for an unavailable slot.
 */
export function signalLine(slot: Slot): string {
  if (!slot.available || !slot.cell || !slot.story) return '';
  const place = shortName(slot.cell.name) || slot.cell.name;
  const s = slot.story;
  const reports = `${plural(s.n, 'report', 'reports')} from ${plural(s.o, 'transmitter', 'transmitters')}`;
  switch (slot.id) {
    case 'planet':
      return `Signal over ${place} heard in ${plural(s.i, 'other country', 'other countries')}: ${reports}.`;
    case 'rising': {
      // The stored ratio divides by max(normal, 3), so it is not "times the usual level"
      // for quiet places: state both numbers instead.
      const usual = Math.round(slot.b ?? 0);
      return usual > 0
        ? `Signal over ${place}: ${reports}, where ${num(usual)} a day is usual.`
        : `Signal over ${place}: ${reports}, where none was usual.`;
    }
    case 'brightest':
      return `Brightest signal, over ${place}: ${reports}, tone ${tone(s.t)}.`;
    case 'ordinary':
      return `Ordinary life over ${place}: ${reports} in ${plural(s.l, 'language', 'languages')}.`;
    case 'faint':
      return `Faint signal from ${place}: ${reports}, usually ${num(Math.round(slot.b ?? 0))} a day.`;
    case 'loudest':
      return `Signal detected over ${place}: ${reports} in ${plural(s.l, 'language', 'languages')}.`;
    default:
      return '';
  }
}

/** Why an empty slot is empty, in the same fixed voice. */
export function emptyLine(slot: Slot): string {
  if (slot.available) return '';
  if (slot.reason === 'baseline') return slot.availableFrom ? `Needs more days of history; from ${slot.availableFrom}.` : 'Needs more days of history.';
  return 'No signal met the rule today.';
}
