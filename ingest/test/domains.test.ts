import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  countryFromTld,
  loadCountryLookup,
  loadDetailedCountryLookup,
  loadNetworks,
  makeDetailedCountryLookup,
  makeOutletOf,
  NETWORKS_FILE,
  outletOf,
  parseNetworks,
  OVERRIDES_FILE,
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

test("networks: Big News Network portals are one outlet, every BNN override is listed", () => {
  for (const d of ["japanherald.com", "asiabulletin.com", "bignewsnetwork.com", "texas.statenews.net"]) assert.equal(outletOf(d), "bignewsnetwork.com", d);
  assert.equal(outletOf("lemonde.fr"), "lemonde.fr");
  assert.equal(outletOf(""), "");
  const networks = loadNetworks();
  const bnn = readFileSync(OVERRIDES_FILE, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.endsWith("\t\tBig News Network"))
    .map((l) => l.split("\t")[0]);
  assert.ok(bnn.length > 300);
  for (const d of bnn) {
    assert.equal(networks.suffix.get(d), "bignewsnetwork.com", d);
    assert.equal(outletOf(d), "bignewsnetwork.com", d);
  }
  // The network's own home domains are listed, not just matched by name.
  assert.ok(bnn.includes("bignewsnetwork.com") && bnn.includes("bignewsnetwork.net"));
  assert.equal(networks.suffix.get("bignewsnetwork.com"), "bignewsnetwork.com");
  assert.equal(outletOf("bignewsnetwork.net"), "bignewsnetwork.com");
  // iheart's station hosts are one outlet.
  for (const d of ["iheart.com", "wkip.iheart.com", "news.kfi.iheart.com"]) assert.equal(outletOf(d), "iheart.com", d);
  assert.equal(outletOf("iheartradio.ca"), "iheartradio.ca");
});

test("networks: domestic chains are one outlet each, by the chain's name", () => {
  const cases: [string, string][] = [
    ["northwichguardian.co.uk", "newsquest.co.uk"],
    ["www.burytimes.co.uk", "newsquest.co.uk"], // dotted: subdomains too
    ["hamhigh.co.uk", "newsquest.co.uk"], // ex-Archant, on Newsquest's CMS
    ["merkur.de", "ippen.media"],
    ["fr.de", "ippen.media"],
    ["mercurynews.com", "medianewsgroup.com"],
    ["orlandosentinel.com", "medianewsgroup.com"], // Tribune Publishing, also Alden
    ["wjla.com", "sbgi.net"],
    ["canberratimes.com.au", "acm.media"],
    ["kcra.com", "hearsttelevision.com"],
    ["torontosun.com", "postmedia.com"],
  ];
  for (const [d, n] of cases) assert.equal(outletOf(d), n, d);
  // Left out on purpose: other owners that share wire copy with a chain, and a chain's rivals.
  for (const d of ["baltimoresun.com", "pressdemocrat.com", "kpbs.org", "welt.de", "manchestereveningnews.co.uk"]) assert.equal(outletOf(d), d, d);
});

test("networks file: no domain is listed twice (a later line would silently win)", () => {
  const seen = new Map<string, number>();
  readFileSync(NETWORKS_FILE, "utf8").split(/\r?\n/).forEach((line, i) => {
    if (!line.trim() || line.trimStart().startsWith("#")) return;
    const d = line.split("\t")[0].trim().toLowerCase().replace(/^\./, "");
    assert.ok(!seen.has(d), `${d} on lines ${seen.get(d)} and ${i + 1}`);
    seen.set(d, i + 1);
  });
  assert.ok(seen.size > 1000);
});

test("networks file parser: plain entries are exact, dotted ones cover subdomains, exact wins", () => {
  const nets = parseNetworks("# header\n\nA.example.com\tChain\tcomment\r\n.group.com\tGroup\t\nown.group.com\tOwn\t\n.x.group.com\tX\t\n");
  assert.deepEqual([...nets.exact], [["a.example.com", "chain"], ["own.group.com", "own"]]);
  assert.deepEqual([...nets.suffix], [["group.com", "group"], ["x.group.com", "x"]]);
  const outlet = makeOutletOf(nets);
  assert.equal(outlet("a.example.com"), "chain");
  assert.equal(outlet("www.a.example.com"), "www.a.example.com"); // plain: exact only
  assert.equal(outlet("example.com"), "example.com");
  assert.equal(outlet("group.com"), "group");
  assert.equal(outlet("wkip.group.com"), "group");
  assert.equal(outlet("own.group.com"), "own"); // an exact entry wins over the dotted one
  assert.equal(outlet("a.x.group.com"), "x"); // the nearest dotted entry wins
  assert.throws(() => parseNetworks(".\tchain"), /line 1/);
  assert.throws(() => parseNetworks("not a domain\tchain"), /line 1/);
  assert.throws(() => parseNetworks("# ok\nexample.com"), /line 2/); // no network name
});
