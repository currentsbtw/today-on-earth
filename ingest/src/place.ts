import { latLngToCell } from "h3-js";
import { outletOf as defaultOutletOf } from "./domains.ts";
import { H3_RES } from "./gkg.ts";
import type { ArticleRecord, LocationCandidate } from "./types.ts";

/** Outlets with fewer window records carrying candidates are never checked for boilerplate. */
export const MIN_OUTLET_ARTICLES = 20;
/** A (place, exact mention count) pair on at least this share of an outlet's records is boilerplate. */
export const BOILERPLATE_SHARE = 0.5;

export interface BoilerplatePair {
  /** The outlet checked: outletOf(source), a network name for listed domains. */
  source: string;
  name: string;
  n: number;
  /** Share of the outlet's records with candidates that carry the pair. */
  share: number;
}

export interface PlacementSummary {
  /** Outlets with MIN_OUTLET_ARTICLES+ records carrying candidates. */
  outletsChecked: number;
  outletsWithBoilerplate: number;
  /** Every boilerplate pair, by outlet then share descending. */
  pairs: BoilerplatePair[];
  /** Records placed at a later candidate because an earlier one was boilerplate. */
  moved: number;
  /** Records left with no candidate once boilerplate is skipped. */
  unplaced: number;
}

export interface PlacementOptions {
  minOutletArticles?: number;
  boilerplateShare?: number;
  /** Which outlet a source domain counts as (default: domains.ts outletOf, networks as one). */
  outletOf?: (source: string) => string;
}

/** Stable identity of a candidate place: FeatureID when known, else the (tidied) name. */
const identity = (c: LocationCandidate) => (c.fid ? `F:${c.fid}` : `N:${c.name}`);
const pairKey = (c: LocationCandidate) => `${identity(c)}\n${c.n}`;

/**
 * Resolve each record's placement from its candidates (docs/PLAN.md "Trust the dots", item 2),
 * writing cellId, lat, lon, locationName, locationCountry and locationFid in place.
 *
 * Some outlets carry the same location block in every article (a footer, a sidebar, their own
 * name read as a place). Outlets are outletOf(source), so a network's hosts are checked as one.
 * For each outlet with MIN_OUTLET_ARTICLES+ records with candidates in
 * the window, a (place, exact mention count) pair found on BOILERPLATE_SHARE+ of them is that
 * outlet's boilerplate: the exact count is what separates a fixed block (always x2) from a
 * local outlet that really covers its city (counts vary). A record takes its first candidate
 * that is not boilerplate for its outlet, or becomes unplaced (cellId "") when none is left.
 * Records without candidates (state versions before 6, or country-only) are left as they are.
 * Deterministic: depends only on the set of records, not their order.
 */
export function resolvePlacement(records: ArticleRecord[], opts: PlacementOptions = {}): PlacementSummary {
  const minArticles = opts.minOutletArticles ?? MIN_OUTLET_ARTICLES;
  const minShare = opts.boilerplateShare ?? BOILERPLATE_SHARE;
  const outletOf = opts.outletOf ?? defaultOutletOf;
  const outletBySource = new Map<string, string>();
  const outlet = (source: string) => {
    let o = outletBySource.get(source);
    if (o === undefined) outletBySource.set(source, (o = outletOf(source)));
    return o;
  };
  const byOutlet = new Map<string, ArticleRecord[]>();
  for (const r of records) {
    if (!r.locs?.length) continue;
    const o = outlet(r.source);
    let list = byOutlet.get(o);
    if (!list) byOutlet.set(o, (list = []));
    list.push(r);
  }

  const boilerplate = new Map<string, Set<string>>();
  const pairs: BoilerplatePair[] = [];
  let outletsChecked = 0;
  for (const [source, list] of byOutlet) {
    if (list.length < minArticles) continue;
    outletsChecked++;
    const counts = new Map<string, { n: number; c: LocationCandidate }>();
    for (const r of list) {
      for (const c of r.locs!) {
        const k = pairKey(c);
        const e = counts.get(k);
        if (e) e.n++;
        // Keep the alphabetically first spelling, so the summary does not depend on order.
        if (!e) counts.set(k, { n: 1, c });
        else if (c.name < e.c.name) e.c = c;
      }
    }
    const flagged = new Set<string>();
    const found: BoilerplatePair[] = [];
    for (const [k, e] of counts) {
      if (e.n < minShare * list.length) continue;
      flagged.add(k);
      found.push({ source, name: e.c.name, n: e.c.n, share: e.n / list.length });
    }
    if (flagged.size === 0) continue;
    boilerplate.set(source, flagged);
    found.sort((a, b) => b.share - a.share || (a.name < b.name ? -1 : a.name > b.name ? 1 : a.n - b.n));
    pairs.push(...found);
  }
  pairs.sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : 0));

  let moved = 0;
  let unplaced = 0;
  for (const r of records) {
    if (!r.locs?.length) continue;
    const skip = boilerplate.get(outlet(r.source));
    const i = skip ? r.locs.findIndex((c) => !skip.has(pairKey(c))) : 0;
    if (i < 0) {
      unplaced++;
      Object.assign(r, { cellId: "", lat: 0, lon: 0, locationName: "", locationCountry: "", locationFid: "" });
      continue;
    }
    if (i > 0) moved++;
    const c = r.locs[i];
    const cellId = r.cellId && r.lat === c.lat && r.lon === c.lon ? r.cellId : latLngToCell(c.lat, c.lon, H3_RES);
    Object.assign(r, { cellId, lat: c.lat, lon: c.lon, locationName: c.name, locationCountry: c.country, locationFid: c.fid });
  }

  return { outletsChecked, outletsWithBoilerplate: boilerplate.size, pairs, moved, unplaced };
}
