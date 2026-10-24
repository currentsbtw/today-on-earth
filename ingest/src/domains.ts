import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fipsToIso } from "./fips-to-iso.ts";

/**
 * Outlet domain -> country lookup. Sources, highest priority first (see ingest/data/README.md):
 *
 * 1. Overrides (`data/domain-country-overrides.txt`): hand-maintained corrections. An entry
 *    with an empty country forces "unknown" (used for aggregator networks).
 * 2. GDELT "Mapping The Media" outlet-country list, May 2018 update, vendored so runs are
 *    deterministic:
 *      https://data.gdeltproject.org/blog/2018-news-outlets-by-country-may2018-update/MASTER-GDELTDOMAINSBYCOUNTRY-MAY2018.TXT
 * 3. Country-code TLD (`.fr` -> FR, `.co.uk` -> GB), except TLDs in TLD_DENY_LIST, which
 *    are mostly used generically.
 * 4. GDELT "Top Five Countries Mentioned By News Outlet 2015-2021" (July 2021), reduced to
 *    the domains the 2018 list lacks and whose top country is clear enough:
 *      https://blog.gdeltproject.org/wp-content/uploads/2021-news-outlets-by-countrycode-2015-2021.csv
 *    It is raw "most-mentioned country" counts, not a curated origin list, so it ranks below
 *    the 2018 list and the ccTLD (it labels some .nl outlets US, and storm.mg China).
 *
 * List files: tab-separated `domain<TAB>FIPS 10-4 code<TAB>country name`, no header line.
 */
const dataFile = (name: string) => fileURLToPath(new URL(`../data/${name}`, import.meta.url));

export const DOMAINS_FILE = dataFile("MASTER-GDELTDOMAINSBYCOUNTRY-MAY2018.TXT");
export const DOMAINS_2021_FILE = dataFile("GDELT-DOMAINSBYCOUNTRY-2015-2021.TXT");
export const OVERRIDES_FILE = dataFile("domain-country-overrides.txt");

export type CountryLookup = (domain: string) => string;

/** Which source answered a lookup ("" = no source knows the domain). */
export type CountrySource = "override" | "gdelt-2018" | "tld" | "gdelt-2021" | "";
export interface CountryHit {
  /** ISO 3166-1 alpha-2, or "" when unknown (also when an override forces unknown). */
  country: string;
  source: CountrySource;
}
export type DetailedCountryLookup = (domain: string) => CountryHit;

/** Parse a GDELT list into a domain -> ISO alpha-2 map (FIPS converted on load). */
export function parseDomainList(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line) continue;
    const [domain, fips] = line.split("\t");
    if (!domain || !fips) continue;
    const iso = fipsToIso(fips);
    if (iso) map.set(domain.trim().toLowerCase(), iso);
  }
  return map;
}

/**
 * Parse the overrides file: `domain<TAB>ISO alpha-2 or empty<TAB>comment`; lines starting
 * with `#` are comments. An empty country is kept (it means "force unknown") and is written
 * `domain<TAB><TAB>comment`; a line with no tab at all is malformed, so a bare domain cannot
 * silently force "unknown". Throws on a malformed line so a typo fails the run instead of
 * silently mislabelling.
 */
export function parseOverrides(text: string): Map<string, string> {
  const map = new Map<string, string>();
  text.split("\n").forEach((raw, i) => {
    const line = raw.replace(/\r$/, "");
    if (!line.trim() || line.trimStart().startsWith("#")) return;
    const [domain = "", country = ""] = line.split("\t");
    const d = domain.trim().toLowerCase();
    const c = country.trim().toUpperCase();
    if (
      !line.includes("\t") ||
      !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ||
      (c !== "" && !/^[A-Z]{2}$/.test(c))
    ) {
      throw new Error(
        `domain-country overrides line ${i + 1}: expected "domain<TAB>ISO alpha-2 or empty<TAB>comment", got ${JSON.stringify(line)}`,
      );
    }
    map.set(d, c);
  });
  return map;
}

/**
 * Country-code TLDs whose use by news and other sites is mostly generic, so the TLD says
 * nothing about the outlet's country. One-word reason each. Deliberately NOT listed (mostly
 * national for news, checked against GDELT 2015-2021 mention data): .it .is .am .ly .md .cd
 * .cm .mg .ps (storm.mg, a Taiwanese outlet, is fixed by an override instead).
 */
export const TLD_DENY_LIST: Readonly<Record<string, string>> = {
  ag: "agriculture",
  ai: "AI",
  cc: "generic",
  cf: "freehost",
  co: "company",
  dj: "music",
  fm: "radio",
  ga: "freehost",
  gg: "gaming",
  gq: "freehost",
  io: "tech",
  la: "LosAngeles",
  me: "personal",
  ml: "freehost",
  ms: "Microsoft",
  nu: "Swedish",
  pw: "spam",
  sh: "shell",
  st: "street",
  tk: "freehost",
  tm: "trademark",
  to: "wordplay",
  tv: "television",
  vc: "venture",
  ws: "website",
};

/**
 * ccTLD -> ISO 3166-1 alpha-2. Identical for every ccTLD except `.uk` -> GB. Left out:
 * `.gb .bv .sj .bl .mf .bq .eh .um` (unused or undelegated) and `.eu .su .ac` (not
 * ISO 3166-1 countries).
 */
const CCTLDS =
  "ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bm bn bo br bs bt " +
  "bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg " +
  "er es et fi fj fk fm fo fr ga gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr " +
  "ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li " +
  "lk lr ls lt lu lv ly ma mc md me mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc " +
  "ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw " +
  "sa sb sc sd se sg sh si sl sm sn so sr ss st sv sx sy sz tc td tf tg th tj tk tl tm tn to tr " +
  "tt tv tw tz ua ug us uy uz va vc ve vg vi vn vu wf ws ye yt za zm zw";
export const CCTLD_TO_ISO: ReadonlyMap<string, string> = new Map([
  ...CCTLDS.split(" ").map((t): [string, string] => [t, t.toUpperCase()]),
  ["uk", "GB"],
]);

/** Second-level labels that mark a national registration under a ccTLD (com.co, co.ag, org.me). */
const NATIONAL_SLDS: ReadonlySet<string> = new Set(["com", "co", "net", "org", "gov", "edu", "ac", "or", "ne", "go"]);

/**
 * Country of a domain from its ccTLD alone ("" for generic, unknown or deny-listed TLDs).
 * A national second-level form (`com|co|net|org|gov|edu|ac|or|ne|go` + ccTLD) counts even
 * when the bare TLD is deny-listed: example.com.co -> CO, but example.co -> "".
 */
export function countryFromTld(domain: string): string {
  const d = domain.trim().toLowerCase().replace(/\.$/, "");
  const dot = d.lastIndexOf(".");
  if (dot < 0) return "";
  const tld = d.slice(dot + 1);
  const labels = d.split(".");
  if (labels.length >= 3 && NATIONAL_SLDS.has(labels[labels.length - 2])) {
    const iso = CCTLD_TO_ISO.get(tld);
    if (iso) return iso;
  }
  if (Object.hasOwn(TLD_DENY_LIST, tld)) return "";
  return CCTLD_TO_ISO.get(tld) ?? "";
}

/**
 * Look a domain up in one map: the exact domain, then with leading labels stripped
 * ("news.example.co.uk" -> "example.co.uk" -> "co.uk"), stopping at two labels.
 * Returns undefined when no form is in the map (an override's "" counts as a hit).
 */
function lookupWithStripping(map: ReadonlyMap<string, string>, domain: string): string | undefined {
  let d = domain;
  while (d) {
    const hit = map.get(d);
    if (hit !== undefined) return hit;
    const dot = d.indexOf(".");
    if (dot < 0) break;
    const rest = d.slice(dot + 1);
    if (!rest.includes(".")) break;
    d = rest;
  }
  return undefined;
}

/** One map with label stripping and no other source (no overrides, no ccTLD fallback). */
export function makeCountryLookup(map: Map<string, string>): CountryLookup {
  return (domain: string) => lookupWithStripping(map, domain.trim().toLowerCase()) || "";
}

export interface CountrySources {
  overrides?: ReadonlyMap<string, string>;
  gdelt2018?: ReadonlyMap<string, string>;
  /** Use the ccTLD fallback (default true). */
  tld?: boolean;
  gdelt2021?: ReadonlyMap<string, string>;
}

/**
 * Lookup over every source in priority order (overrides > GDELT 2018 > ccTLD >
 * GDELT 2015-2021 > ""), reporting which one answered.
 */
export function makeDetailedCountryLookup(sources: CountrySources): DetailedCountryLookup {
  const { overrides, gdelt2018, tld = true, gdelt2021 } = sources;
  return (domain: string) => {
    const d = domain.trim().toLowerCase();
    if (!d) return { country: "", source: "" };
    const o = overrides && lookupWithStripping(overrides, d);
    if (o !== undefined) return { country: o, source: "override" };
    const g18 = gdelt2018 && lookupWithStripping(gdelt2018, d);
    if (g18) return { country: g18, source: "gdelt-2018" };
    const t = tld ? countryFromTld(d) : "";
    if (t) return { country: t, source: "tld" };
    const g21 = gdelt2021 && lookupWithStripping(gdelt2021, d);
    if (g21) return { country: g21, source: "gdelt-2021" };
    return { country: "", source: "" };
  };
}

export interface CountryFiles {
  overrides?: string;
  gdelt2018?: string;
  gdelt2021?: string;
}

/** Read the vendored files (paths default to ingest/data). */
export function loadCountrySources(files: CountryFiles = {}): CountrySources {
  return {
    overrides: parseOverrides(readFileSync(files.overrides ?? OVERRIDES_FILE, "utf8")),
    gdelt2018: parseDomainList(readFileSync(files.gdelt2018 ?? DOMAINS_FILE, "utf8")),
    tld: true,
    gdelt2021: parseDomainList(readFileSync(files.gdelt2021 ?? DOMAINS_2021_FILE, "utf8")),
  };
}

/** Full lookup that also reports which source answered. */
export function loadDetailedCountryLookup(files: CountryFiles = {}): DetailedCountryLookup {
  return makeDetailedCountryLookup(loadCountrySources(files));
}

/** Full lookup over every source. `path` replaces the 2018 list (kept for existing callers). */
export function loadCountryLookup(path = DOMAINS_FILE): CountryLookup {
  const detailed = loadDetailedCountryLookup({ gdelt2018: path });
  return (domain: string) => detailed(domain).country;
}

/**
 * Outlet networks (`data/outlet-networks.txt`, see ingest/data/README.md): domains that count
 * as one outlet, named by the network: aggregator networks and domestic chains (Newsquest,
 * Ippen, Sinclair, ...) whose sites run the same copy. `outletOf(source)` is the network's name for a listed
 * domain, else the domain itself; outlet counts (`o`, `topOutlets`), the per-outlet caps,
 * "one article per outlet and headline" and learned title tails use it. Articles keep their
 * own domain in `source`.
 *
 * Entry forms: a plain domain matches that domain only; a leading dot (`.iheart.com`) matches
 * the domain and every subdomain. An exact entry wins over a dotted one; among dotted entries
 * the longest (nearest) suffix wins.
 */
export const NETWORKS_FILE = dataFile("outlet-networks.txt");

export interface Networks {
  /** Plain entries: the exact domain. */
  exact: ReadonlyMap<string, string>;
  /** Dotted entries, stored without the dot: the domain and every subdomain. */
  suffix: ReadonlyMap<string, string>;
}

/**
 * Parse the networks file: `domain<TAB>network name<TAB>comment`, the domain optionally with a
 * leading dot; `#` lines are comments. Throws on a malformed line (bad domain, no network name).
 */
export function parseNetworks(text: string): Networks {
  const exact = new Map<string, string>();
  const suffix = new Map<string, string>();
  text.split("\n").forEach((raw, i) => {
    const line = raw.replace(/\r$/, "");
    if (!line.trim() || line.trimStart().startsWith("#")) return;
    const [domain = "", network = ""] = line.split("\t");
    let d = domain.trim().toLowerCase();
    const dotted = d.startsWith(".");
    if (dotted) d = d.slice(1);
    const n = network.trim().toLowerCase();
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) || n === "") {
      throw new Error(`outlet networks line ${i + 1}: expected "domain or .domain<TAB>network name<TAB>comment", got ${JSON.stringify(line)}`);
    }
    (dotted ? suffix : exact).set(d, n);
  });
  return { exact, suffix };
}

export function loadNetworks(path = NETWORKS_FILE): Networks {
  return parseNetworks(readFileSync(path, "utf8"));
}

/** The network a domain belongs to, or "" (exact entry first, then the nearest dotted one). */
export function networkOf(networks: Networks, domain: string): string {
  let d = domain.trim().toLowerCase().replace(/\.$/, "");
  if (!d) return "";
  const hit = networks.exact.get(d);
  if (hit !== undefined) return hit;
  for (;;) {
    const s = networks.suffix.get(d);
    if (s !== undefined) return s;
    const dot = d.indexOf(".");
    if (dot < 0) return "";
    d = d.slice(dot + 1);
  }
}

/** outletOf over a given networks table (memoised per source). */
export function makeOutletOf(networks: Networks): (source: string) => string {
  const memo = new Map<string, string>();
  return (source: string) => {
    let o = memo.get(source);
    if (o === undefined) memo.set(source, (o = networkOf(networks, source) || source));
    return o;
  };
}

let defaultOutletOf: ((source: string) => string) | null = null;

/**
 * The outlet a source domain counts as: its network's name, else the domain unchanged.
 * Synchronous; the networks file is read once, on the first call.
 */
export function outletOf(source: string): string {
  defaultOutletOf ??= makeOutletOf(loadNetworks());
  return defaultOutletOf(source);
}
