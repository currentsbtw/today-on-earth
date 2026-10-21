import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { CarryLoadError } from "../src/carry.ts";
import { loadHistory } from "../src/history.ts";
import { encodeState, loadState, type IngestState } from "../src/state.ts";

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
