import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fipsToIso } from "./fips-to-iso.ts";

/**
 * Outlet domain -> country lookup.
 *
 * Source: GDELT's "Mapping The Media" outlet-country list (May 2018 update), vendored so runs
 * are deterministic:
 *   https://data.gdeltproject.org/blog/2018-news-outlets-by-country-may2018-update/MASTER-GDELTDOMAINSBYCOUNTRY-MAY2018.TXT
 * Format: tab-separated `domain<TAB>FIPS 10-4 code<TAB>country name`, no header line.
 */
export const DOMAINS_FILE = fileURLToPath(
  new URL("../data/MASTER-GDELTDOMAINSBYCOUNTRY-MAY2018.TXT", import.meta.url),
);

export type CountryLookup = (domain: string) => string;

/** Parse the vendored list into a domain -> ISO alpha-2 map (FIPS converted on load). */
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
 * Lookup that tries the exact domain, then strips leading labels
 * ("news.example.co.uk" -> "example.co.uk" -> "co.uk"), stopping at two labels.
 */
export function makeCountryLookup(map: Map<string, string>): CountryLookup {
  return (domain: string) => {
    let d = domain.trim().toLowerCase();
    while (d) {
      const hit = map.get(d);
      if (hit) return hit;
      const dot = d.indexOf(".");
      if (dot < 0) break;
      const rest = d.slice(dot + 1);
      if (!rest.includes(".")) break;
      d = rest;
    }
    return "";
  };
}

export function loadCountryLookup(path = DOMAINS_FILE): CountryLookup {
  return makeCountryLookup(parseDomainList(readFileSync(path, "utf8")));
}
