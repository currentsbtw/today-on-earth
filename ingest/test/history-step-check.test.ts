import assert from "node:assert/strict";
import { test } from "node:test";
import { checkStepFields } from "../scripts/history-step-check.ts";

const totals = { articles: 10, outlets: 5, countries: 3, cells: 2, unplaced: 1 };
const at = "2026-10-21T17:27:00Z";
const known = { at, newest: "2026-10-21T17:15:00Z", added: 4, totals };
const rows5 = [["832830fffffffff", 48.86, 2.35, 5, 3], ["83589cfffffffff", 6.15, 3.66, 2, 1]];
const rows4 = rows5.map((r) => r.slice(0, 4));
const wheres = (errors: [string, string][]) => errors.map(([w]) => w);

test("check: a known step and an unknown step pass", () => {
  assert.deepEqual(checkStepFields(known, rows5), []);
  assert.deepEqual(checkStepFields({ at, newest: known.newest, totals }, rows4), []); // first frame after a cold start
  assert.deepEqual(checkStepFields({ at, totals }, rows4), []); // written before 2026-10-22
  assert.deepEqual(checkStepFields({ ...known, added: 0 }, rows5.map((r) => [...r.slice(0, 4), 0])), []);
});

test("check: `newest` may lead `at` by up to 20 minutes (GDELT publishes slots early)", () => {
  assert.deepEqual(checkStepFields({ ...known, newest: "2026-10-21T17:30:00Z" }, rows5), []);
  assert.deepEqual(checkStepFields({ ...known, newest: "2026-10-21T17:47:00Z" }, rows5), []);
  assert.deepEqual(wheres(checkStepFields({ ...known, newest: "2026-10-21T17:47:01Z" }, rows5)), ["newest"]);
  assert.deepEqual(wheres(checkStepFields({ ...known, newest: "2026-10-21T17:30:00.000Z" }, rows5)), ["newest"]);
});

test("check: five elements exactly when `added` is present", () => {
  assert.deepEqual(wheres(checkStepFields(known, rows4)), ["rows[0]", "rows[1]"]);
  assert.deepEqual(wheres(checkStepFields({ at, newest: known.newest, totals }, rows5)), ["rows[0]", "rows[1]"]);
});

test("check: a <= n, sum(a) <= added <= totals.articles, integers >= 0", () => {
  assert.deepEqual(wheres(checkStepFields(known, [rows5[0], ["83589cfffffffff", 6.15, 3.66, 2, 3]])), ["rows[1]", "rows"]); // a > n, and 6 > 4
  assert.deepEqual(wheres(checkStepFields({ ...known, added: 3 }, rows5)), ["rows"]); // sum 4 > 3
  assert.deepEqual(wheres(checkStepFields({ ...known, added: 11 }, rows5)), ["added"]); // > totals.articles
  assert.deepEqual(wheres(checkStepFields({ ...known, added: -1 }, rows5)), ["added"]);
  assert.deepEqual(wheres(checkStepFields({ ...known, added: 2.5 }, rows5)), ["added"]);
  assert.deepEqual(wheres(checkStepFields(known, [rows5[0], ["83589cfffffffff", 6.15, 3.66, 2, -1]])), ["rows[1]"]);
});
