import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { CarryLoadError } from "../src/carry.ts";
import { loadHistory } from "../src/history.ts";
import { decodeState, encodeState, loadState, packLocs, unpackLocs, type IngestState } from "../src/state.ts";
import type { ArticleRecord } from "../src/types.ts";

const URL_SOURCE = { kind: "url", url: "https://example.test/data/state.json.gz" } as const;
const quiet = () => {};
const sample: IngestState = { feeds: { english: { from: "20261020120000", done: ["20261020120000"] } }, records: [] };

/** A fetch stand-in that answers every request with `make()`. */
const fakeFetch = (make: () => Response | Promise<Response>) => (async () => make()) as unknown as typeof fetch;

test("state URL: 404 means cold start", async () => {
  assert.equal(await loadState(URL_SOURCE, quiet, fakeFetch(() => new Response("", { status: 404 }))), null);
});

test("state URL: 200 with valid gzip loads", async () => {
  const body = new Uint8Array(encodeState(sample, "2026-10-20T12:00:00Z"));
  const state = await loadState(URL_SOURCE, quiet, fakeFetch(() => new Response(body)));
  assert.deepEqual(state, sample);
});

test("state URL: 5xx, network errors and bad content fail the run instead of cold-starting", async () => {
  const cases: [string, () => Response | Promise<Response>][] = [
    ["500", () => new Response("", { status: 500 })],
    ["403", () => new Response("", { status: 403 })],
    ["network error", () => Promise.reject(new TypeError("fetch failed"))],
    ["timeout", () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"))],
    ["bad gzip", () => new Response(new Uint8Array([0x1f, 0x8b, 1, 2, 3]))],
    ["bad JSON", () => new Response("not json")],
    ["version mismatch", () => new Response(JSON.stringify({ v: 999, feeds: {}, records: [] }))],
  ];
  for (const [name, make] of cases) {
    await assert.rejects(loadState(URL_SOURCE, quiet, fakeFetch(make)), CarryLoadError, name);
  }
});

test("carried file: only a missing file means cold start; a corrupt one fails the run", async () => {
  assert.equal(await loadState({ kind: "file", path: "does/not/exist/state.json.gz" }, quiet), null);

  const dir = await mkdtemp(join(tmpdir(), "toe-carry-"));
  try {
    const good = join(dir, "good.json.gz");
    await writeFile(good, encodeState(sample, "2026-10-20T12:00:00Z"));
    assert.deepEqual(await loadState({ kind: "file", path: good }, quiet), sample);

    const cases: [string, Uint8Array | string][] = [
      ["bad gzip", new Uint8Array([0x1f, 0x8b, 1, 2, 3])],
      ["bad JSON", "not json"],
      ["version mismatch", gzipSync(JSON.stringify({ v: 999, feeds: {}, records: [] }))],
    ];
    for (const [name, bytes] of cases) {
      const p = join(dir, `${name.replace(/ /g, "-")}.json.gz`);
      await writeFile(p, bytes);
      await assert.rejects(loadState({ kind: "file", path: p }, quiet), CarryLoadError, name);
      await assert.rejects(loadHistory({ kind: "file", path: p }, quiet), CarryLoadError, `history ${name}`);
    }
    // A path that exists but is not a readable file (a directory) also fails.
    await assert.rejects(loadState({ kind: "file", path: dir }, quiet), CarryLoadError, "directory");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

const record: ArticleRecord = {
  url: "https://newspim.com/1", title: "서울 경찰서", source: "newspim.com", country: "KR", lang: "ko", time: "2026-10-23T01:00:00Z",
  tone: -1.5, image: "", lat: 37.5664, lon: 127, cellId: "8330e1fffffffff", locationName: "Seoul, South Korea", locationCountry: "KR",
  persons: ["a b"], orgs: [], themes: ["crime"], video: "", kinds: "k",
  locs: [
    { type: 4, name: "Paris, France", country: "FR", lat: 48.8667, lon: 2.33333, n: 2, at: 912, fid: "-1456928" },
    { type: 4, name: "Seoul, Soul-T'ukpyolsi, South Korea", country: "KR", lat: 37.5664, lon: 127, n: 1, at: 0, fid: "-716583" },
    { type: 5, name: "Gyeonggi-do, South Korea", country: "", lat: -0.000123, lon: -179.99, n: 3, at: 40, fid: "" },
  ],
};

test("state v6: records round-trip with their candidates", () => {
  const state = decodeState(encodeState({ feeds: sample.feeds, records: [record, { ...record, url: "https://x.test/2", locs: [] }] }, "2026-10-23T02:00:00Z"));
  assert.deepEqual(state.records[0], record);
  assert.equal(state.records[1].locs, undefined);
  assert.equal(packLocs(record.locs).split(";").length, 3);
  // Malformed candidates are dropped, well-formed neighbours kept.
  assert.deepEqual(unpackLocs("4|A|FR|1|2|1|0|9;7|B|FR|1|2|1|0|9;4|C|FR|x|2|1|0|9;4|D|FR|1|2|1|0").map((c) => c.name), ["A"]);
});

test("state v5 still loads: no candidates, stored placement kept", () => {
  const v5 = [record.url, record.title, record.source, record.country, record.lang, record.time, record.tone, record.image,
    1.5, 2.5, "831fb4fffffffff", "Paris, France (General), France", "a b", "", "crime", "", "FR", "k"];
  const bytes = gzipSync(JSON.stringify({ v: 5, savedAt: "2026-10-22T00:00:00Z", feeds: sample.feeds, records: [v5, [...v5, "extra"]] }));
  const state = decodeState(bytes);
  assert.equal(state.records.length, 1, "a record of the wrong length for its version is dropped");
  const r = state.records[0];
  assert.deepEqual([r.lat, r.lon, r.cellId, r.locationName, r.locationCountry, r.kinds], [1.5, 2.5, "831fb4fffffffff", "Paris, France", "FR", "k"]);
  assert.equal(r.locs, undefined);
});
