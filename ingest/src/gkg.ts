import { latLngToCell } from "h3-js";
import type { CountryLookup } from "./domains.ts";
import { parseNames, parseOrgs, parseThemes } from "./entities.ts";
import { fipsToIso } from "./fips-to-iso.ts";
import { cleanPlaceName } from "./placename.ts";
import { langFromTranslationInfo } from "./lang.ts";
import type { ArticleRecord } from "./types.ts";

export const H3_RES = 3;
export const TITLE_MAX = 160;

// GKG 2.1 column indexes (tab-separated, 27 columns).
const COL = {
  DATE: 1,
  SOURCE_COLLECTION: 2,
  SOURCE_COMMON_NAME: 3,
  DOCUMENT_IDENTIFIER: 4,
  V2_THEMES: 8,
  V2_LOCATIONS: 10,
  V2_PERSONS: 12,
  V2_ORGANIZATIONS: 14,
  V2_TONE: 15,
  SHARING_IMAGE: 18,
  SOCIAL_VIDEO_EMBEDS: 21,
  TRANSLATION_INFO: 25,
  EXTRAS: 26,
} as const;
const GKG_COLUMNS = 27;

/** Why a line was not turned into a record, for per-file logging. */
export type SkipReason = "columns" | "collection" | "url" | "date" | "location";

export type ParseResult = { ok: true; record: ArticleRecord } | { ok: false; reason: SkipReason };

/** "20261020184500" -> "2026-10-20T18:45:00Z", or "" when malformed. */
export function gkgDateToIso(d: string): string {
  if (!/^\d{14}$/.test(d)) return "";
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(8, 10)}:${d.slice(10, 12)}:${d.slice(12, 14)}Z`;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, body: string) => {
    if (body[0] === "#") {
      const cp = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff) {
        try {
          return String.fromCodePoint(cp);
        } catch {
          return m;
        }
      }
      return m;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? m;
  });
}

/** Page title from the Extras XML, entity-decoded, whitespace-collapsed, max 160 chars. */
export function extractTitle(extras: string): string {
  const m = /<PAGE_TITLE>([\s\S]*?)<\/PAGE_TITLE>/.exec(extras);
  if (!m) return "";
  const title = decodeEntities(m[1]).replace(/\s+/g, " ").trim();
  const chars = Array.from(title); // code points, so surrogate pairs are never split
  if (chars.length <= TITLE_MAX) return title;
  return chars.slice(0, TITLE_MAX - 1).join("").trimEnd() + "…";
}

export interface PrimaryLocation {
  name: string;
  /** ISO 3166-1 alpha-2 from the entry's FIPS CountryCode, "" when unknown. */
  country: string;
  lat: number;
  lon: number;
}

/**
 * Primary location (docs/DATA-CONTRACT.md): the first parseable V2Locations entry whose Type
 * is not 1 (country-level). Entry format:
 * `Type#FullName#CountryCode(FIPS)#ADM1#ADM2#Lat#Long#FeatureID#CharOffset`.
 *
 * Returns "unplaced" when the only parseable entries are country-level (a country centroid
 * is not where anything happened), and null when nothing is parseable at all.
 */
export function parsePrimaryLocation(v2Locations: string): PrimaryLocation | "unplaced" | null {
  if (!v2Locations) return null;
  let sawCountry = false;
  for (const entry of v2Locations.split(";")) {
    const f = entry.split("#");
    if (f.length < 7 || f[5] === "" || f[6] === "") continue;
    const lat = Number(f[5]);
    const lon = Number(f[6]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    if (f[0] !== "1") return { name: f[1], country: fipsToIso(f[2]), lat, lon };
    sawCountry = true;
  }
  return sawCountry ? "unplaced" : null;
}

export function parseTone(v2Tone: string): number {
  const comma = v2Tone.indexOf(",");
  const t = Number(comma < 0 ? v2Tone : v2Tone.slice(0, comma));
  return Number.isFinite(t) && v2Tone !== "" ? Math.round(t * 100) / 100 : 0;
}

const RECORD_START = /^\d{14}-T?\d+\t/;

/**
 * GKG files are meant to be one record per line, but a few translingual records carry raw
 * newlines inside the Extras field (seen in 20261021033000.translation.gkg.csv). This joins
 * continuation lines (anything not starting with a GKGRECORDID) back onto their record.
 */
export function createRecordAssembler(onRecord: (record: string) => void) {
  let pending: string | null = null;
  return {
    push(line: string) {
      if (RECORD_START.test(line) || pending === null) {
        if (pending !== null) onRecord(pending);
        pending = line;
      } else {
        pending += "\n" + line;
      }
    },
    end() {
      if (pending !== null) onRecord(pending);
      pending = null;
    },
  };
}

/**
 * Video ids exactly as the frontend accepts them: 11 characters of [A-Za-z0-9_-] forming a
 * whole path segment (`youtu.be/<id>`, `/embed|shorts|live|v/<id>`) or a whole `v` value
 * (`watch?...v=<id>`), followed only by the end, `?`, `#` or `&`. The literal "videoseries"
 * (a playlist embed, not a video) is rejected. Matching runs on the raw string, so nothing
 * that URL normalisation would rewrite (a trailing `\`, `%22%3E`, a space) slips through.
 */
const ID = "([A-Za-z0-9_-]{11})";
const YOUTU_BE = new RegExp(String.raw`^https?://youtu\.be/${ID}(?:[?#&]|$)`, "i");
const YOUTUBE_PATH = new RegExp(String.raw`^https?://(?:www\.|m\.)?youtube\.com/(?:embed|shorts|live|v)/${ID}(?:[?#&]|$)`, "i");
const YOUTUBE_WATCH = new RegExp(String.raw`^https?://(?:www\.|m\.)?youtube\.com/watch\?(?:[^#]*&)?v=${ID}(?:[&#]|$)`, "i");

/**
 * First YouTube *video* URL from GKG SocialVideoEmbeds (`;`-separated), verbatim, or "".
 * Only youtube.com / www. / m. / youtu.be hosts count. In real data most YouTube entries
 * are channel links from site footers (`/@outlet`, `/channel/...`, `/user/...`), which the
 * frontend cannot embed, so a URL must name a video in one of the forms above.
 */
export function parseVideo(field: string): string {
  if (!field) return "";
  for (const raw of field.split(";")) {
    const s = raw.trim();
    if (isYouTubeVideoUrl(s)) return s;
  }
  return "";
}

/** The video id when `s` passes the rule above, else "". */
export function youTubeVideoId(s: string): string {
  const m = YOUTU_BE.exec(s) ?? YOUTUBE_PATH.exec(s) ?? YOUTUBE_WATCH.exec(s);
  if (!m || m[1] === "videoseries") return "";
  try {
    new URL(s);
  } catch {
    return "";
  }
  return m[1];
}

export function isYouTubeVideoUrl(s: string): boolean {
  return youTubeVideoId(s) !== "";
}

/**
 * Copy a string so it no longer points into the GKG line it was cut from. V8 keeps substrings
 * as slices of their parent, and a GKG line is ~10 KB (mostly GCAM), so without this every
 * retained record pins its whole line: a 24h cold start ran out of a 4 GB heap.
 */
export function detach(s: string): string {
  return s ? Buffer.from(s, "utf8").toString("utf8") : "";
}

/** Parse one GKG 2.1 line into an article record, or say why it was skipped. */
export function parseGkgLine(line: string, countryOf: CountryLookup): ParseResult {
  const f = line.split("\t");
  if (f.length < GKG_COLUMNS) return { ok: false, reason: "columns" };
  if (f[COL.SOURCE_COLLECTION] !== "1") return { ok: false, reason: "collection" };
  const url = f[COL.DOCUMENT_IDENTIFIER];
  if (!/^https?:\/\//i.test(url)) return { ok: false, reason: "url" };
  const time = gkgDateToIso(f[COL.DATE]);
  if (!time) return { ok: false, reason: "date" };
  const loc = parsePrimaryLocation(f[COL.V2_LOCATIONS]);
  if (!loc) return { ok: false, reason: "location" };

  const placed = loc === "unplaced" ? null : loc;
  const source = f[COL.SOURCE_COMMON_NAME].trim().toLowerCase();
  const image = f[COL.SHARING_IMAGE];
  return {
    ok: true,
    record: {
      url: detach(url),
      title: detach(extractTitle(f[COL.EXTRAS])),
      source: detach(source),
      country: source ? countryOf(source) : "",
      lang: detach(langFromTranslationInfo(f[COL.TRANSLATION_INFO])),
      time: detach(time),
      tone: parseTone(f[COL.V2_TONE]),
      image: /^https?:\/\//i.test(image) ? detach(image) : "",
      lat: placed?.lat ?? 0,
      lon: placed?.lon ?? 0,
      cellId: placed ? latLngToCell(placed.lat, placed.lon, H3_RES) : "",
      locationName: detach(placed ? cleanPlaceName(placed.name) : ""),
      locationCountry: placed?.country ?? "",
      persons: parseNames(f[COL.V2_PERSONS]).map(detach),
      orgs: parseOrgs(f[COL.V2_ORGANIZATIONS]).map(detach),
      themes: parseThemes(f[COL.V2_THEMES]).map(detach),
      video: detach(parseVideo(f[COL.SOCIAL_VIDEO_EMBEDS])),
    },
  };
}
