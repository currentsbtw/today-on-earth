import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeState, loadState, StateLoadError, type IngestState } from "../src/state.ts";

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
    await assert.rejects(loadState(URL_SOURCE, quiet, fakeFetch(make)), StateLoadError, name);
  }
});

test("state file: missing or unreadable file still means cold start", async () => {
  assert.equal(await loadState({ kind: "file", path: "does/not/exist/state.json.gz" }, quiet), null);
});
