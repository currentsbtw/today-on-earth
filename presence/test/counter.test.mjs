// node --test (Node 24 strips the TypeScript types of counter.ts on import).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Presence, WINDOW_MS, isValidId } from '../src/counter.ts';

const A = 'aaaaaaaa-1111';
const B = 'bbbbbbbb-2222';
const C = 'cccccccc-3333';

test('counts distinct ids; a repeat ping does not double count', () => {
  const p = new Presence();
  assert.equal(p.ping(A, 0), 1);
  assert.equal(p.ping(A, 1_000), 1);
  assert.equal(p.ping(B, 2_000), 2);
  assert.equal(p.count(3_000), 2);
});

test('an id expires 75 s after its last ping', () => {
  const p = new Presence();
  p.ping(A, 0);
  p.ping(B, 10_000);
  assert.equal(p.count(WINDOW_MS - 1), 2);
  assert.equal(p.count(WINDOW_MS), 1, 'A is gone at exactly 75 s');
  assert.equal(p.count(10_000 + WINDOW_MS), 0);
});

test('a refreshed id outlives its first window; pruning follows last-seen order', () => {
  const p = new Presence();
  p.ping(A, 0);
  p.ping(B, 1_000);
  p.ping(A, 60_000); // A is now newer than B
  assert.equal(p.count(WINDOW_MS + 1_000), 1, 'B expired, A refreshed');
  assert.equal(p.count(60_000 + WINDOW_MS), 0);
});

test('leave removes the id at once; leaving an unknown id is harmless', () => {
  const p = new Presence();
  p.ping(A, 0);
  p.ping(B, 0);
  assert.equal(p.leave(A, 1), 1);
  assert.equal(p.leave(C, 2), 1);
  assert.equal(p.leave(B, 3), 0);
});

test('past the cap new ids are not added, known ids still refresh', () => {
  const p = new Presence(WINDOW_MS, 2);
  p.ping(A, 0);
  p.ping(B, 0);
  assert.equal(p.ping(C, 1), 2);
  assert.equal(p.ping(A, 70_000), 2);
  assert.equal(p.count(WINDOW_MS + 1), 1, 'B expired, A kept, C never added');
});

test('ids are 8-64 characters of A-Z a-z 0-9 _ -', () => {
  assert.ok(isValidId(crypto.randomUUID()));
  assert.ok(isValidId('a'.repeat(8)));
  assert.ok(isValidId('A_b-9'.repeat(13).slice(0, 64)));
  for (const bad of ['short', 'a'.repeat(65), 'has space1', 'dot.in.it', 'é'.repeat(10), '', 42, null, undefined, {}]) {
    assert.equal(isValidId(bad), false, String(bad));
  }
});
