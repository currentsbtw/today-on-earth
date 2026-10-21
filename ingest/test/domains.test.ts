import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countryFromTld,
  loadCountryLookup,
  loadDetailedCountryLookup,
  makeDetailedCountryLookup,
  parseOverrides,
  TLD_DENY_LIST,
} from "../src/domains.ts";

const detailed = loadDetailedCountryLookup();
const countryOf = loadCountryLookup();

test("override wins over the GDELT lists and the ccTLD; an empty override forces unknown", () => {
  const lookup = makeDetailedCountryLookup({
    overrides: new Map([["example.fr", "DE"], ["agg.com", ""]]),
    gdelt2018: new Map([["example.fr", "FR"], ["agg.com", "US"]]),
  });
  assert.deepEqual(lookup("example.fr"), { country: "DE", source: "override" });
  assert.deepEqual(lookup("www.example.fr"), { country: "DE", source: "override" });
  assert.deepEqual(lookup("agg.com"), { country: "", source: "override" });
});

test("real overrides: storm.mg is Taiwanese, Big News Network portals are unknown", () => {
  assert.deepEqual(detailed("storm.mg"), { country: "TW", source: "override" });
  assert.equal(countryOf("www.storm.mg"), "TW");
  for (const d of ["japanherald.com", "asiabulletin.com", "israelherald.com", "bignewsnetwork.com", "texas.statenews.net"]) {
    assert.deepEqual(detailed(d), { country: "", source: "override" }, d);
  }
});

test("GDELT 2018 hit, with leading labels stripped", () => {
  assert.deepEqual(detailed("bbc.co.uk"), { country: "GB", source: "gdelt-2018" });
  assert.deepEqual(detailed("eju.tv"), { country: "BO", source: "gdelt-2018" }); // FIPS "BL" -> BO, despite .tv
  assert.deepEqual(detailed("news.sport.bbc.co.uk"), { country: "GB", source: "gdelt-2018" });
  assert.equal(countryOf("WWW.BBC.CO.UK"), "GB");
});

test("ccTLD fallback answers when no list knows the domain", () => {
  const lookup = makeDetailedCountryLookup({ gdelt2018: new Map() });
  assert.deepEqual(lookup("brand-new-outlet.fr"), { country: "FR", source: "tld" });
  assert.deepEqual(lookup("nieuws.example.co.uk"), { country: "GB", source: "tld" });
  assert.deepEqual(lookup("example.com.br"), { country: "BR", source: "tld" });
  assert.deepEqual(lookup("example.it"), { country: "IT", source: "tld" });
  assert.deepEqual(lookup("example.com"), { country: "", source: "" });
  assert.deepEqual(lookup("localhost"), { country: "", source: "" });
  assert.equal(countryFromTld("example.gb"), ""); // unused ccTLD
  assert.equal(countryFromTld("example.eu"), ""); // not a country
  // The full stack falls back to the TLD for an outlet neither GDELT list has.
  assert.deepEqual(detailed("an-outlet-launched-in-2026.de"), { country: "DE", source: "tld" });
});

test("ccTLD deny list blocks generic TLDs (they reach the 2015-2021 list or stay unknown)", () => {
  const lookup = makeDetailedCountryLookup({ gdelt2018: new Map(), gdelt2021: new Map([["startup.io", "US"]]) });
  for (const tld of ["io", "co", "tv", "me", "fm", "ai"]) {
    assert.ok(tld in TLD_DENY_LIST, tld);
    assert.equal(countryFromTld(`example.${tld}`), "", tld);
  }
  assert.deepEqual(lookup("unknown.tv"), { country: "", source: "" });
  assert.deepEqual(lookup("startup.io"), { country: "US", source: "gdelt-2021" });
  // The TLD outranks the 2015-2021 list (raw mention counts label many national outlets wrong).
  const ranked = makeDetailedCountryLookup({ gdelt2021: new Map([["outlet.nl", "US"]]) });
  assert.deepEqual(ranked("outlet.nl"), { country: "NL", source: "tld" });
});

test("2015-2021 list fills domains the 2018 list lacks", () => {
  const r = detailed("0532bm.com");
  assert.deepEqual(r, { country: "CN", source: "gdelt-2021" }); // FIPS "CH" -> CN
});

test("overrides file parser: comments, empty country, malformed lines", () => {
  const map = parseOverrides("# header\n\nexample.com\tgb\tcomment\r\nagg.net\t\tnetwork\n");
  assert.deepEqual([...map], [["example.com", "GB"], ["agg.net", ""]]);
  assert.throws(() => parseOverrides("example.com\tGBR\tthree letters"), /line 1/);
  assert.throws(() => parseOverrides("# ok\nnot a domain\tFR"), /line 2/);
  // A bare domain (no tab) is malformed, not a silent "force unknown".
  assert.throws(() => parseOverrides("storm.mg"), /line 1/);
});

test("ccTLD: national second-level forms count even under a deny-listed TLD", () => {
  assert.equal(countryFromTld("example.com.co"), "CO");
  assert.equal(countryFromTld("news.co.ag"), "AG");
  assert.equal(countryFromTld("site.org.me"), "ME");
  assert.equal(countryFromTld("example.co"), ""); // bare deny-listed TLD stays blocked
  assert.equal(countryFromTld("example.com.ar"), "AR");
  assert.equal(countryFromTld("foo.co.uk"), "GB");
});
