import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  CROSSWALK_KM, CityIndex, FEED_LANGS, entryOf, keepAltName, matchCity, matchRegion, nameOk, parseAdmin1, parseCountryInfo, parseFidLine,
  resolveFeature, serializeTable, tidyNames, type AltName, type Feature, type GnAdmin1, type PlaceNamesFile,
} from "../scripts/placenames-crosswalk.ts";
import { loadPlaceNames, parsePlaceNames, type PlaceNamesTable } from "../src/placenames-table.ts";
import { confirmStory } from "../src/top-stories.ts";

// GeoNames fixtures in the dumps' own formats (tab-separated; cities500 has 19 columns).
const cityLine = (id: number, name: string, alternates: string, lat: number, lon: number, cc: string, adm1: string, pop: number) =>
  [id, name, name, alternates, lat, lon, "P", "PPL", cc, "", adm1, "", "", "", pop, "", "100", "Europe/Kyiv", "2024-01-01"].join("\t");
const CITIES = [
  cityLine(703656, "Kup'yans'k", "Kupiansk,Kupyansk,Купянск", 49.71055, 37.61517, "UA", "07", 27000),
  // Same name, 65 km away (outside the guard).
  cityLine(900001, "Kupyansk", "", 50.2, 37.9, "UA", "07", 900),
  // Testgrad: a bigger same-name city in another country right next door, and two in UA.
  cityLine(900010, "Testgrad", "", 50.001, 30.001, "RU", "01", 1_000_000),
  cityLine(900011, "Testgrad", "", 50.05, 30.0, "UA", "07", 300),
  cityLine(900012, "Testgrad", "", 50.1, 30.0, "UA", "07", 5000),
].join("\n");
const ADMIN1: GnAdmin1[] = parseAdmin1([
  "UA.07\tKharkiv\tKharkiv\t706482",
  "CN.14\tTibet\tTibet\t1279685",
  "CN.30\tGuangdong\tGuangdong\t1809935",
  "CN.05\tJilin\tJilin\t2036500",
  "ES.51\tAndalusia\tAndalusia\t2593109",
].join("\n"));
const alt = (id: number, lang: string, name: string, flags: Partial<AltName> = {}): AltName => ({ id, lang, name, short: false, colloquial: false, historic: false, ...flags });
const ALT = new Map<number, AltName[]>([
  [703656, [
    alt(703656, "ru", "Купянск"), alt(703656, "uk", "Куп’янськ"), alt(703656, "en", "Kupyansk"), alt(703656, "link", "https://en.wikipedia.org/wiki/Kupiansk"),
    alt(703656, "xx", "Kupjansko"), alt(703656, "de", "Kupjansk", { historic: true }), alt(703656, "", "Kup", { short: true }), alt(703656, "ru", "КУПЯНСК"),
  ]],
  [706482, [alt(706482, "ru", "Харьковская область"), alt(706482, "en", "Kharkiv Oblast")]],
  [1279685, [alt(1279685, "zh", "西藏"), alt(1279685, "en", "Xizang"), alt(1279685, "", "Sitsang")]],
]);
const cities = CityIndex.fromText(CITIES);
const byKey = new Map(ADMIN1.map((a) => [a.key, a]));
const byId = new Map(ADMIN1.map((a) => [a.id, a]));
const inputs = { cities, admin1: ADMIN1, altById: ALT, langs: new Set(FEED_LANGS) };
const feature = (name: string, country: string, lat: number, lon: number, type: Feature["type"] = 4, fid = "-1"): Feature => ({ fid, type, name, country, lat, lon });

test("crosswalk: a city matches cities500 by folded name or alternate name within 30 km in its country", () => {
  assert.equal(CROSSWALK_KM, 30);
  const kup = matchCity(feature("Kupyansk, Kharkivs'ka Oblast', Ukraine", "UA", 49.7209, 37.5998), cities)!;
  assert.equal(kup.city.id, 703656); // by its alternate name "Kupyansk", not the 900-people namesake 65 km off
  assert.ok(kup.km < 2);
  // The distance guard: GDELT's coordinate 40 km from every Kupyansk resolves to none.
  assert.equal(matchCity(feature("Kupyansk, Ukraine", "UA", 49.35, 37.6), cities), null);
  // The country guard and the population order: the 1M-people Testgrad in RU sits on the
  // coordinate, but the feature is in UA; of the two UA ones within 30 km the larger wins.
  assert.equal(matchCity(feature("Testgrad, Ukraine", "UA", 50.0, 30.0), cities)!.city.id, 900012);
  assert.equal(matchCity(feature("Testgrad, Russia", "RU", 50.0, 30.0), cities)!.city.id, 900010);
  // Regions (type 2 and 5) are never matched as cities.
  assert.equal(matchCity(feature("Kupyansk, Ukraine", "UA", 49.7209, 37.5998, 5), cities), null);
});

test("crosswalk: a region matches an admin1 of its country by name or alternate name; a city typed region must agree with its middle parts", () => {
  assert.equal(matchRegion(feature("Sitsang, Xizang, China", "CN", 32, 90, 5), ADMIN1, ALT)!.id, 1279685); // "Sitsang" is an alternate name
  assert.equal(matchRegion(feature("Andalusia, Spain", "ES", 37.6, -4.5, 4), ADMIN1, ALT)!.id, 2593109); // GDELT types it a city
  assert.equal(matchRegion(feature("Guangdong, Jilin, China", "CN", 43, 126, 4), ADMIN1, ALT), null); // a feature in Jilin, not the province
  assert.equal(matchRegion(feature("Andalusia, Spain", "FR", 37.6, -4.5, 5), ADMIN1, ALT), null); // other country
  // An unmatched city keeps the region its own name gives.
  const nagqu = resolveFeature(feature("Nagqu, Xizang, China", "CN", 29.7, 83.4, 4, "11275184"), inputs, byKey);
  assert.deepEqual([nagqu.how, nagqu.g, nagqu.region], ["in-region", 1279685, 1279685]);
  const none = resolveFeature(feature("Atlantis, Ukraine", "UA", 0, 0, 4), inputs, byKey);
  assert.equal(none.how, "none");
});

test("crosswalk: the name filter keeps feed languages and capitals, drops links, codes, historic and short lower-case names", () => {
  const langs = new Set(FEED_LANGS);
  assert.ok(keepAltName(alt(1, "ru", "Москва"), langs));
  assert.ok(keepAltName(alt(1, "zh-CN", "重庆"), langs));
  assert.ok(keepAltName(alt(1, "de", "Wien"), langs)); // a 4-letter name in a feed language
  assert.ok(keepAltName(alt(1, "", "Ville-Lumière", { colloquial: true }), langs));
  assert.ok(keepAltName(alt(1, "abbr", "NSW"), langs));
  assert.ok(!keepAltName(alt(1, "", "Rio", { short: true, colloquial: true }), langs)); // short, lower-case
  assert.ok(!keepAltName(alt(1, "abbr", "Man."), langs));
  assert.ok(!keepAltName(alt(1, "link", "https://x"), langs));
  assert.ok(!keepAltName(alt(1, "iata", "SVO"), langs));
  assert.ok(!keepAltName(alt(1, "fr", "Lutèce", { historic: true }), langs));
  assert.ok(!keepAltName(alt(1, "xx", "Kupjansko"), langs));
  assert.ok(nameOk("重庆") && !nameOk("重") && nameOk("Ufa") && !nameOk("Ab"));
  // Sorted, deduplicated by folded form, without the English name in the cell name.
  assert.deepEqual(tidyNames(["Zürich", "Zurich", "ZÜRICH", "Zürich", "Zueri", "Z"], ["zurich"]), ["Zueri"]);
});

test("crosswalk: a resolved city's entry carries its names and its region's, deduplicated against the cell name", () => {
  const f = feature("Kupyansk, Kharkivs'ka Oblast', Ukraine", "UA", 49.7209, 37.5998, 4, "-1044158");
  const res = resolveFeature(f, inputs, byKey);
  assert.deepEqual([res.how, res.g, res.region], ["city", 703656, 706482]);
  const e = entryOf(f, res, inputs, byId)!;
  assert.equal(e.g, 703656);
  // No Kupyansk (the cell name), link, xx, historic or "Kup"; КУПЯНСК gives way to Купянск.
  assert.deepEqual(e.n, ["Kup'yans'k", "Купянск", "Куп’янськ"]);
  assert.deepEqual(e.r, ["Kharkiv", "Kharkiv Oblast", "Харьковская область"]);
  const tibet = feature("Nagqu, Xizang, China", "CN", 29.7, 83.4, 4, "11275184");
  assert.deepEqual(entryOf(tibet, resolveFeature(tibet, inputs, byKey), inputs, byId), { g: 1279685, n: [], r: ["Sitsang", "Tibet", "西藏"] });
});

test("crosswalk: --fids lines and the serialized table", () => {
  const fips = parseCountryInfo("#ISO\tISO3\tISO-Numeric\tfips\tCountry\nUA\tUKR\t804\tUP\tUkraine\nGB\tGBR\t826\tUK\tUnited Kingdom\n");
  assert.deepEqual(parseFidLine("-1044158", fips), { fid: "-1044158" });
  assert.equal(parseFidLine("# comment", fips), null);
  assert.deepEqual(parseFidLine("-1044158\t4\tKupyansk, Kharkivs'ka Oblast', Ukraine\tUP\t49.7209\t37.5998", fips)!.feature,
    { fid: "-1044158", type: 4, name: "Kupyansk, Kharkivs'ka Oblast', Ukraine", country: "UA", lat: 49.7209, lon: 37.5998 });
  const t: PlaceNamesFile = { source: "GeoNames (geonames.org)", licence: "CC BY 4.0", built: "2026-10-24", langs: ["ru"], fid: { b: { g: 2, n: ["B"], r: [] }, a: { g: 1, n: [], r: ["Ä"] } } };
  const json = serializeTable(t);
  assert.ok(json.indexOf('"a":') < json.indexOf('"b":'), "FeatureIDs sorted");
  assert.deepEqual(JSON.parse(json), t);
  assert.deepEqual([...parsePlaceNames(JSON.parse(json)).keys()], ["a", "b"]);
});

test("place names: a missing or malformed table logs and gives an empty one", () => {
  const dir = mkdtempSync(join(tmpdir(), "placenames-test-"));
  const logs: string[] = [];
  assert.equal(loadPlaceNames(join(dir, "nope.json"), (m) => logs.push(m)).size, 0);
  writeFileSync(join(dir, "bad.json"), "{ not json");
  assert.equal(loadPlaceNames(join(dir, "bad.json"), (m) => logs.push(m)).size, 0);
  writeFileSync(join(dir, "shape.json"), JSON.stringify({ fid: { "-1": { g: 1, n: "Купянск", r: [] } } }));
  assert.equal(loadPlaceNames(join(dir, "shape.json"), (m) => logs.push(m)).size, 0);
  assert.equal(logs.length, 3);
  assert.match(logs[0], /English names only/);
  writeFileSync(join(dir, "ok.json"), JSON.stringify({ fid: { "-1": { g: 1, n: ["Купянск"], r: [] } } }));
  assert.deepEqual(loadPlaceNames(join(dir, "ok.json"), (m) => logs.push(m)).get("-1"), { n: ["Купянск"], r: [] });
  assert.equal(logs.length, 3);
});

const TABLE: PlaceNamesTable = new Map([
  ["-1044158", { n: ["Купянск", "Куп’янськ"], r: ["Харьковская область"] }],
  ["-1900774", { n: ["重庆", "重慶市"], r: [] }],
  ["11275184", { n: [], r: ["西藏", "Tibet"] }],
  ["4335045", { n: ["NOLA"], r: [] }],
]);
const level = (cell: { name: string; home: string; fid?: string }, headline: string, lang: string, table = TABLE) =>
  confirmStory(cell, { headline, headlineLang: lang, articles: [] }, table);

test("confirmation: the table's city and region names confirm by the same rules", () => {
  const kup = { name: "Kupyansk, Kharkivs'ka Oblast', Ukraine", home: "UA", fid: "-1044158" };
  // Cyrillic, inflected: the prefix form takes "Купянском".
  assert.deepEqual(level(kup, "Колумбийские наёмники ВСУ ударили по своим под Купянском", "ru"), { level: "city", name: "Купянск", text: "Колумбийские наёмники ВСУ ударили по своим под Купянском" });
  assert.equal(level({ ...kup, fid: undefined }, "Колумбийские наёмники ВСУ ударили по своим под Купянском", "ru"), null); // English alone
  assert.equal(level(kup, "Колумбийские наёмники ВСУ ударили по своим под Купянском", "ru", new Map()), null); // no table
  // CJK: by substring.
  const cq = { name: "Chongqing, China", home: "CN", fid: "-1900774" };
  assert.equal(level(cq, "渝论场｜现实牵引、虚拟演化-华龙网-重庆市委市政府官方新闻门户", "zh")?.name, "重庆");
  assert.equal(level(cq, "渝论场｜现实牵引、虚拟演化-华龙网-重庆市委市政府官方新闻门户", "zh")?.level, "city");
  // A region name: 西藏 for a Tibet cell.
  const nagqu = { name: "Nagqu, Xizang, China", home: "CN", fid: "11275184" };
  assert.deepEqual(level(nagqu, "视频丨多部门向西藏增调5000件救灾物资", "zh"), { level: "region", name: "西藏", text: "视频丨多部门向西藏增调5000件救灾物资" });
  assert.equal(level(nagqu, "Rescue efforts continue after deadly earthquake strikes Tibet", "en")?.level, "region");
  // The city in the cell name is still tried first.
  assert.equal(level(nagqu, "Nagqu earthquake: 西藏 rescue", "en")?.level, "city");
  // A table name in capitals matches in capitals only, never by prefix.
  const nola = { name: "New Orleans, Louisiana, United States", home: "US", fid: "4335045" };
  assert.equal(level(nola, "Second line parade fills NOLA streets", "en")?.name, "NOLA");
  assert.equal(level(nola, "Nola the cat goes viral", "en"), null);
  // A fid not in the table changes nothing.
  assert.equal(level({ ...kup, fid: "999" }, "Колумбийские наёмники под Купянском", "ru"), null);
});
