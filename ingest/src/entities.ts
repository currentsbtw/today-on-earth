/**
 * Per-article grouping features for stories (docs/DATA-CONTRACT.md "Stories"):
 * GDELT's own person / organisation / theme tags plus title tokens. Nothing here writes
 * text; it only normalises what GDELT and the outlets already provide.
 */

export const MAX_ENTITIES_PER_KIND = 6;

/**
 * Theme deny-list. GKG themes come from broad taxonomies; most families tag a large share of
 * all articles (in a sample of 1,936 articles, LEADER hit 25%, MEDICAL 22%, every WB_/TAX_
 * family far more), so sharing them says nothing about being the same story. Denied:
 * - whole families: TAX_ (incl. TAX_FNCACT, TAX_WORLDLANGUAGES, TAX_ETHNICITY), CRISISLEX_,
 *   WB_ (World Bank topics), EPU_ (economic policy uncertainty), GENERAL_, USPEC_, UNGP_,
 *   MEDIA_, SOC_POINTSOFINTEREST
 * - single themes that are near-universal or describe the article form, not its subject;
 * - broad topic themes that each tagged >= 2% of all placed articles in a 6h sample of
 *   30,409 (2026-10-21), e.g. ARMEDCONFLICT 12%, ELECTION 10%, MARITIME 5%: two articles
 *   sharing them are usually different stories, and they built one 466-article
 *   "Washington politics" cluster before they were denied.
 * Specific themes (ECON_INFLATION, NATURAL_DISASTER_*, ECON_HOUSING_PRICES, ...) stay.
 */
const DENIED_THEME_PREFIXES = ["TAX_", "CRISISLEX", "WB_", "EPU_", "GENERAL_", "USPEC_", "UNGP_", "MEDIA_", "SOC_POINTSOFINTEREST"];
const DENIED_THEMES = new Set([
  "LEADER", "MEDICAL", "MANMADE_DISASTER_IMPLIED", "EDUCATION", "LEGISLATION", "AFFECT", "SCIENCE",
  "SECURITY_SERVICES", "DELAY", "MOVEMENT_GENERAL", "URBAN", "RURAL", "IDEOLOGY", "ACT_MAKESTATEMENT",
  "GEN_HOLIDAY", "TRANSPARENCY", "CONSTITUTIONAL", "DEMOCRACY", "SOC_GENERALCRIME", "KILL", "WOUND",
  "ARREST", "TRIAL", "PROTEST", "CRIME_COMMON_ROBBERY", "AGRICULTURE", "TOURISM", "RELIGION",
  "ARMEDCONFLICT", "ELECTION", "MARITIME", "MILITARY", "SOC_INNOVATION", "PUBLIC_TRANSPORT", "ECON_TAXATION",
  "ECON_STOCKMARKET", "CORRUPTION", "ENV_OIL", "UNREST_BELLIGERENT", "NEGOTIATIONS", "GOV_LOCALGOV", "APPOINTMENT",
  "TRAFFIC", "ALLIANCE", "BAN", "BORDER", "ECON_ENTREPRENEURSHIP", "TERROR", "IMMIGRATION", "RETIREMENT",
  "SURVEILLANCE", "DISCRIMINATION", "WATER_SECURITY", "SOC_USSECURITYAGENCIES", "SOC_TECHNOLOGYSECTOR",
]);

/**
 * Organisations that tag who reported or a country name rather than what happened: wire
 * services and syndicators (credited on thousands of unrelated stories) and "United States",
 * which GDELT tags as an organisation in 8% of all placed articles.
 */
const DENIED_ORGS = new Set([
  "united states", "reuters", "associated press", "agence france presse", "agence france-presse", "afp",
  "big news network", "center square", "press association", "xinhua", "united press international",
]);

export function isDeniedTheme(theme: string): boolean {
  const t = theme.toUpperCase();
  return DENIED_THEMES.has(t) || DENIED_THEME_PREFIXES.some((p) => t.startsWith(p));
}

/**
 * Parse a GKG `Name,offset;Name,offset` list (V2Persons, V2Organizations, V2Themes): count
 * mentions per lowercase name and keep the `max` most mentioned (ties: first mention).
 */
function topMentioned(field: string, max: number, keep: (name: string) => boolean): string[] {
  if (!field) return [];
  const counts = new Map<string, { n: number; first: number }>();
  let i = 0;
  for (const item of field.split(";")) {
    const comma = item.lastIndexOf(",");
    const name = (comma < 0 ? item : item.slice(0, comma)).trim();
    if (!name || !keep(name)) continue;
    const key = name.toLowerCase();
    const c = counts.get(key);
    if (c) c.n++;
    else counts.set(key, { n: 1, first: i++ });
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[1].first - b[1].first)
    .slice(0, max)
    .map(([k]) => k);
}

export function parseNames(field: string, max = MAX_ENTITIES_PER_KIND): string[] {
  return topMentioned(field, max, () => true);
}

export function parseOrgs(field: string, max = MAX_ENTITIES_PER_KIND): string[] {
  return topMentioned(field, max, (o) => !DENIED_ORGS.has(o.toLowerCase()));
}

export function parseThemes(field: string, max = MAX_ENTITIES_PER_KIND): string[] {
  return topMentioned(field, max, (t) => !isDeniedTheme(t));
}

/** Small multilingual stop-list (only words of 4+ letters matter; shorter ones are dropped anyway). */
const STOP = new Set(
  (
    // English
    "about after again against also amid been before being between both could does during each from have " +
    "into just like live more most news only other over said says should since some such than that their " +
    "them then there these they this those through today under until update updates video watch were what " +
    "when where which while will with would year years your report reports latest breaking first week " +
    // Spanish / Portuguese
    "para como pero sobre entre desde tras este esta estos estas según donde cuando porque también hasta " +
    "durante ante contra pelo pela pelos pelas mais após depois isso essa esse está foram será sobre " +
    // French
    "pour dans avec sont plus selon leur leurs cette comme après contre depuis entre aussi sans sous " +
    // German
    "nicht eine einen einer eines nach über sich sind wird werden auch durch gegen noch beim mehr wieder " +
    // Italian
    "della delle degli nella nelle sono anche dopo come contro questo questa quando"
  )
    .split(/\s+/)
    .filter(Boolean),
);

/** Remove a trailing outlet/section suffix such as " - The Times of India" or " | Fox News". */
function stripTitleSuffix(title: string): string {
  let t = title;
  for (let i = 0; i < 2; i++) {
    const m = /^(.*\S)\s+[|\-–—:]\s+([^|\-–—]{1,60})$/.exec(t);
    if (!m || m[2].trim().split(/\s+/).length > 5 || m[1].length < 20) break;
    t = m[1];
  }
  return t;
}

/** Distinct lowercase title tokens of 4+ characters, punctuation stripped, stop words removed. */
export function titleTokens(title: string): string[] {
  if (!title) return [];
  const out = new Set<string>();
  for (const tok of stripTitleSuffix(title).toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (Array.from(tok).length < 4 || STOP.has(tok) || /^\d+$/.test(tok)) continue;
    out.add(tok);
  }
  return [...out];
}
