import assert from "node:assert/strict";
import { test } from "node:test";
import { latLngToCell } from "h3-js";
import { BOILERPLATE_SHARE, MIN_OUTLET_ARTICLES, resolvePlacement } from "../src/place.ts";
import type { ArticleRecord, LocationCandidate } from "../src/types.ts";

const place = (name: string, lat: number, lon: number, country: string, fid: string, type: LocationCandidate["type"] = 4) =>
  (n: number, at = 100): LocationCandidate => ({ type, name, country, lat, lon, n, at, fid });
const PARIS = place("Paris, France", 48.8667, 2.33333, "FR", "-1456928");
const SEOUL = place("Seoul, South Korea", 37.5664, 127, "KR", "-716583");
const BUSAN = place("Busan, South Korea", 35.1028, 129.04, "KR", "-714902");
const GYEONGGI = place("Gyeonggi-do, South Korea", 37.4, 127.5, "KR", "KS13", 5);

let seq = 0;
/** A record placed at its first candidate, as parseGkgLine leaves it. */
function rec(source: string, locs: LocationCandidate[] | undefined, extra: Partial<ArticleRecord> = {}): ArticleRecord {
  const first = locs?.[0];
  return {
    url: `https://${source}/${++seq}`, title: `t${seq}`, source, country: "", lang: "en", time: "2026-10-23T01:00:00Z",
    tone: 0, image: "", lat: first?.lat ?? 0, lon: first?.lon ?? 0, cellId: first ? latLngToCell(first.lat, first.lon, 3) : "",
    locationName: first?.name ?? "", locationCountry: first?.country ?? "", persons: [], orgs: [], themes: [], video: "", kinds: "",
    locs, ...extra,
  };
}

test("thresholds are the decided ones", () => {
  assert.equal(MIN_OUTLET_ARTICLES, 20);
  assert.equal(BOILERPLATE_SHARE, 0.5);
});

test("an outlet's fixed block (same place, same count, half its articles) is skipped", () => {
  // newspim's shape: Paris x2 on every article; some name a Korean city, most name none.
  const records: ArticleRecord[] = [];
  for (let i = 0; i < 16; i++) records.push(rec("newspim.com", [PARIS(2, 900 + i)]));
  for (let i = 0; i < 6; i++) records.push(rec("newspim.com", [PARIS(2), i % 2 ? SEOUL(1, 50) : BUSAN(1, 50)]));
  records.push(rec("newspim.com", [PARIS(2), GYEONGGI(3)]));
  const s = resolvePlacement(records);
  assert.deepEqual(s.pairs, [{ source: "newspim.com", name: "Paris, France", n: 2, share: 1 }]);
  assert.equal(s.outletsChecked, 1);
  assert.equal(s.outletsWithBoilerplate, 1);
  assert.equal(s.moved, 7);
  assert.equal(s.unplaced, 16);
  const cells = records.map((r) => r.locationName);
  assert.equal(cells.filter((n) => n === "Paris, France").length, 0);
  assert.equal(cells.filter((n) => n === "Seoul, South Korea").length, 3);
  assert.equal(cells.filter((n) => n === "Gyeonggi-do, South Korea").length, 1);
  const seoul = records.find((r) => r.locationName === "Seoul, South Korea")!;
  assert.equal(seoul.cellId, latLngToCell(37.5664, 127, 3));
  assert.equal(seoul.locationCountry, "KR");
  assert.equal(seoul.locationFid, "-716583"); // the chosen candidate's FeatureID
  const gone = records[0];
  assert.deepEqual([gone.cellId, gone.lat, gone.lon, gone.locationName, gone.locationCountry, gone.locationFid], ["", 0, 0, "", "", ""]);
  // Resolving again (the next run, on carried records) gives the same answer.
  const before = JSON.stringify(records);
  resolvePlacement(records);
  assert.equal(JSON.stringify(records), before);
  // And the order of the records does not matter.
  const copy = records.map((r) => ({ ...r }));
  resolvePlacement(copy.reverse());
  assert.deepEqual(copy.reverse(), records);
});

test("resolution recomputes from the candidates: an outlet back under the minimum is placed again", () => {
  const records = Array.from({ length: MIN_OUTLET_ARTICLES }, () => rec("block.example", [PARIS(2)]));
  assert.equal(resolvePlacement(records).unplaced, MIN_OUTLET_ARTICLES);
  assert.ok(records.every((r) => r.cellId === ""));
  // The window slides: one record leaves, the outlet is under the minimum, Paris is used again.
  const next = records.slice(1);
  const s = resolvePlacement(next);
  assert.deepEqual([s.outletsChecked, s.unplaced], [0, 0]);
  assert.ok(next.every((r) => r.cellId === latLngToCell(48.8667, 2.33333, 3) && r.locationName === "Paris, France"));
});

test("a local outlet whose own city counts vary is left alone", () => {
  const records = Array.from({ length: 30 }, (_, i) => rec("leparisien.fr", [PARIS(1 + (i % 5)), SEOUL(1 + (i % 3))]));
  const s = resolvePlacement(records);
  // Paris is on every article, but no single count reaches half of them.
  assert.equal(s.outletsChecked, 1);
  assert.deepEqual(s.pairs, []);
  assert.equal(s.moved, 0);
  assert.equal(s.unplaced, 0);
  assert.ok(records.every((r) => r.locationName === "Paris, France"));
});

test("an outlet under the minimum is never flagged; records without candidates are untouched", () => {
  const small = Array.from({ length: MIN_OUTLET_ARTICLES - 1 }, () => rec("small.example", [PARIS(2), SEOUL(1)]));
  // Records from an older state: no candidates, stored placement kept as is (even "unplaced").
  const legacy = rec("small.example", undefined, { cellId: "831fb4fffffffff", lat: 1, lon: 2, locationName: "Stored", locationCountry: "FR" });
  const countryOnly = rec("small.example", []);
  const s = resolvePlacement([...small, legacy, countryOnly]);
  assert.deepEqual(s, { outletsChecked: 0, outletsWithBoilerplate: 0, pairs: [], moved: 0, unplaced: 0 });
  assert.ok(small.every((r) => r.locationName === "Paris, France"));
  assert.deepEqual([legacy.cellId, legacy.lat, legacy.lon, legacy.locationName], ["831fb4fffffffff", 1, 2, "Stored"]);
  assert.equal(countryOnly.cellId, "");
});

test("a network's hosts are checked as one outlet", () => {
  // Two station hosts of one network, 12 records each, all with the station footer's
  // "New Jersey" x1: neither host reaches the minimum alone, the network does.
  const NJ = place("New Jersey, United States", 40.2, -74.7, "US", "NJ", 2);
  const network = (src: string) => (src.endsWith(".iheart.example") ? "iheart.example" : src);
  const make = () => ["wabc.iheart.example", "wxyz.iheart.example"].flatMap((host) =>
    Array.from({ length: 12 }, (_, i) => rec(host, i < 4 ? [BUSAN(1 + i), NJ(1)] : [NJ(1)])),
  );
  assert.deepEqual(resolvePlacement(make(), { outletOf: (src) => src }).pairs, [], "hosts alone are under the minimum");
  const records = make();
  const s = resolvePlacement(records, { outletOf: network });
  assert.equal(s.outletsChecked, 1);
  assert.deepEqual(s.pairs, [{ source: "iheart.example", name: "New Jersey, United States", n: 1, share: 1 }]);
  assert.equal(s.unplaced, 16); // footer only: no place left
  assert.equal(records.filter((r) => r.locationName === "Busan, South Korea").length, 8);
  assert.ok(!records.some((r) => r.locationName === "New Jersey, United States"));
});

test("the share counts only the outlet's records with candidates, and must reach half", () => {
  // 20 with candidates, 10 carry Paris x2: exactly 50%, flagged. Legacy records do not dilute.
  const half = [
    ...Array.from({ length: 10 }, (_, i) => rec("half.example", [PARIS(2), SEOUL(1 + i)])),
    ...Array.from({ length: 10 }, (_, i) => rec("half.example", [BUSAN(1 + i)])),
    ...Array.from({ length: 10 }, () => rec("half.example", undefined)),
  ];
  assert.deepEqual(resolvePlacement(half).pairs.map((p) => [p.name, p.n, p.share]), [["Paris, France", 2, 0.5]]);
  assert.ok(half.slice(0, 10).every((r) => r.locationName === "Seoul, South Korea"));
  // 9 of 20: not flagged.
  const under = [
    ...Array.from({ length: 9 }, () => rec("under.example", [PARIS(2), SEOUL(1)])),
    ...Array.from({ length: 11 }, (_, i) => rec("under.example", [BUSAN(1 + i)])),
  ];
  assert.deepEqual(resolvePlacement(under).pairs, []);
  assert.ok(under.slice(0, 9).every((r) => r.locationName === "Paris, France"));
});
