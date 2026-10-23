import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bracket, buildPlan, framesFor, interpolateCells, interpolateTotals, lapseTime, pullbackFraction, readTimelineParams, segmentAt, TIMELINE_DEFAULTS, type ClipPlan } from '../src/timeline.ts';

const MIN = 60_000;
const HOUR = 60 * MIN;
const t0 = Date.parse('2026-10-21T14:30:10Z');
const t1 = Date.parse('2026-10-22T14:27:15Z');
const seconds = { fps: 30, hook: 2, fly: 1.5, lapse: 7, card: 5, end: 3 };

/** Segments are contiguous from 0 and sum to frames. */
function assertContiguous(plan: ClipPlan) {
  let next = 0;
  for (const s of plan.segments) {
    assert.equal(s.start, next);
    assert.ok(s.frames > 0);
    next += s.frames;
  }
  assert.equal(next, plan.frames);
}

test('frames from seconds x fps, at least one when seconds > 0', () => {
  assert.equal(framesFor(2, 30), 60);
  assert.equal(framesFor(1.5, 30), 45);
  assert.equal(framesFor(7, 30), 210);
  assert.equal(framesFor(0, 30), 0);
  assert.equal(framesFor(0.01, 30), 1);
  assert.equal(framesFor(0.05, 30), 2);
});

test('three slots: hook, pull-back, lapse, three flight+card pairs, end', () => {
  const plan = buildPlan(seconds, ['loudest', 'planet', 'brightest'], [t0, t1]);
  assert.deepEqual(
    plan.segments.map((s) => [s.kind, s.slot ?? null, s.start, s.frames]),
    [
      ['hook', null, 0, 60],
      ['pullback', null, 60, 45],
      ['lapse', null, 105, 210],
      ['flight', 'loudest', 315, 45],
      ['card', 'loudest', 360, 150],
      ['flight', 'planet', 510, 45],
      ['card', 'planet', 555, 150],
      ['flight', 'brightest', 705, 45],
      ['card', 'brightest', 750, 150],
      ['end', null, 900, 90],
    ],
  );
  assert.equal(plan.frames, 990);
  assert.equal(plan.poster, 314);
  assert.equal(plan.fps, 30);
  assert.deepEqual(plan.lapse, { from: '2026-10-21T14:30:10.000Z', to: '2026-10-22T14:27:15.000Z', snapshots: 2 });
  assertContiguous(plan);
});

test('one slot and no slots', () => {
  const one = buildPlan(seconds, ['planet'], [t0, t1]);
  assert.deepEqual(one.segments.map((s) => s.kind), ['hook', 'pullback', 'lapse', 'flight', 'card', 'end']);
  assert.equal(one.segments[3].slot, 'planet');
  assert.equal(one.segments[4].slot, 'planet');
  assert.equal(one.frames, 60 + 45 + 210 + 45 + 150 + 90);
  assertContiguous(one);

  const none = buildPlan(seconds, [], [t0, t1]);
  assert.deepEqual(none.segments.map((s) => s.kind), ['hook', 'pullback', 'lapse', 'end']);
  assert.equal(none.frames, 60 + 45 + 210 + 90);
  assert.equal(none.poster, 314);
  assertContiguous(none);
});

test('zero-second segments are left out', () => {
  const plan = buildPlan({ ...seconds, hook: 0, fly: 0 }, ['planet'], [t0, t1]);
  assert.deepEqual(plan.segments.map((s) => s.kind), ['lapse', 'card', 'end']);
  assert.equal(plan.poster, 209);
  assertContiguous(plan);
});

test('date is the UTC day of the midpoint', () => {
  assert.equal(buildPlan(seconds, [], [t0, t1]).date, '2026-10-22');
  // 20:00 on the 21st to 02:00 on the 22nd: midpoint 23:00 on the 21st.
  assert.equal(buildPlan(seconds, [], [Date.parse('2026-10-21T20:00:00Z'), Date.parse('2026-10-22T02:00:00Z')]).date, '2026-10-21');
  assert.equal(buildPlan(seconds, [], [t1]).date, '2026-10-22');
});

test('hour marks: the frames where the clock first crosses each whole hour', () => {
  // 10:30 to 13:30 over 7 frames at 30-minute steps: 10:30 11:00 11:30 12:00 12:30 13:00 13:30.
  const from = Date.parse('2026-10-22T10:30:00Z');
  const plan = buildPlan({ fps: 1, hook: 2, fly: 1, lapse: 7, card: 1, end: 1 }, [], [from, from + 3 * HOUR]);
  const lapseStart = plan.segments.find((s) => s.kind === 'lapse')!.start;
  assert.equal(lapseStart, 3);
  assert.deepEqual(plan.hourMarks, [lapseStart + 1, lapseStart + 3, lapseStart + 5]);

  // A span starting on the hour marks its first frame too; 10 minutes a frame from 09:55.
  const onHour = buildPlan({ fps: 1, hook: 0, fly: 0, lapse: 4, card: 0, end: 0 }, [], [Date.parse('2026-10-22T10:00:00Z'), Date.parse('2026-10-22T10:30:00Z')]);
  assert.deepEqual(onHour.hourMarks, [0]);
  const steps = buildPlan({ fps: 1, hook: 0, fly: 0, lapse: 4, card: 0, end: 0 }, [], [Date.parse('2026-10-22T09:55:00Z'), Date.parse('2026-10-22T10:25:00Z')]);
  assert.deepEqual(steps.hourMarks, [1]);

  // The default 7 s lapse over ~24 h crosses 24 hours (15:00 on the 21st to 14:00 on the 22nd).
  const day = buildPlan(seconds, [], [t0, t1]);
  assert.equal(day.hourMarks.length, 24);
  assert.ok(day.hourMarks.every((i) => i >= 105 && i <= 314));
});

test('virtual time is linear from the first to the last snapshot', () => {
  assert.equal(lapseTime(t0, t1, 210, 0), t0);
  assert.equal(lapseTime(t0, t1, 210, 209), t1);
  assert.equal(lapseTime(0, 1000, 11, 5), 500);
  assert.equal(lapseTime(t0, t1, 1, 0), t1);
});

test('the pull-back runs from just past live to exactly the first snapshot', () => {
  assert.equal(pullbackFraction(0, 45), 1 / 45);
  assert.equal(pullbackFraction(22, 45), 23 / 45);
  assert.equal(pullbackFraction(44, 45), 1);
  assert.equal(pullbackFraction(0, 1), 1);
});

test('bracket finds the snapshots around a time', () => {
  const times = [0, 100, 300, 600];
  assert.deepEqual(bracket(times, 0), { lo: 0, hi: 0, f: 0 });
  assert.deepEqual(bracket(times, 50), { lo: 0, hi: 1, f: 0.5 });
  assert.deepEqual(bracket(times, 100), { lo: 1, hi: 2, f: 0 });
  assert.deepEqual(bracket(times, 450), { lo: 2, hi: 3, f: 0.5 });
  assert.deepEqual(bracket(times, 600), { lo: 3, hi: 3, f: 0 });
  assert.deepEqual(bracket(times, 900), { lo: 3, hi: 3, f: 0 });
  assert.deepEqual(bracket([42], 7), { lo: 0, hi: 0, f: 0 });
});

test('cells interpolate over the union of ids', () => {
  const a = [
    { id: 'p', n: 10, name: 'P' },
    { id: 'q', n: 4, name: 'Q' },
  ];
  const b = [
    { id: 'p', n: 20, name: 'P' },
    { id: 'r', n: 6, name: 'R' },
  ];
  // k = 0 is the first snapshot, the last frame the second.
  assert.deepEqual(interpolateCells(a, b, 0), a);
  assert.deepEqual(interpolateCells(a, b, 1), b);
  // Midpoint: q only in a, r only in b, each counted 0 on the other side.
  assert.deepEqual(interpolateCells(a, b, 0.5), [
    { id: 'p', n: 15, name: 'P' },
    { id: 'q', n: 2, name: 'Q' },
    { id: 'r', n: 3, name: 'R' },
  ]);
  // Rounded: q 4 x 0.9 = 3.6 -> 4, r 6 x 0.1 = 0.6 -> 1.
  assert.deepEqual(interpolateCells(a, b, 0.1), [
    { id: 'p', n: 11, name: 'P' },
    { id: 'q', n: 4, name: 'Q' },
    { id: 'r', n: 1, name: 'R' },
  ]);
  // Zeros dropped: q 4 x 0.1 = 0.4 -> 0.
  assert.deepEqual(interpolateCells(a, b, 0.9).map((c) => [c.id, c.n]), [
    ['p', 19],
    ['r', 5],
  ]);
});

test('totals interpolate and round', () => {
  const a = { articles: 100, cells: 10, outlets: 5, countries: 3 };
  const b = { articles: 201, cells: 20, outlets: 6, countries: 3 };
  assert.deepEqual(interpolateTotals(a, b, 0), a);
  assert.deepEqual(interpolateTotals(a, b, 1), b);
  assert.deepEqual(interpolateTotals(a, b, 0.5), { articles: 151, cells: 15, outlets: 6, countries: 3 });
});

test('segmentAt maps a frame to its segment', () => {
  const plan = buildPlan(seconds, ['loudest'], [t0, t1]);
  assert.deepEqual(segmentAt(plan, 0), { segment: plan.segments[0], offset: 0 });
  assert.deepEqual(segmentAt(plan, 104), { segment: plan.segments[1], offset: 44 });
  assert.equal(segmentAt(plan, plan.frames - 1)?.segment.kind, 'end');
  assert.equal(segmentAt(plan, plan.frames), null);
  assert.equal(segmentAt(plan, -1), null);
});

test('parameters: defaults, and bad values rejected', () => {
  const read = (query: string) => {
    const q = new URLSearchParams(query);
    return readTimelineParams((name) => q.get(name));
  };
  assert.deepEqual(read('timeline=1'), TIMELINE_DEFAULTS);
  assert.deepEqual(read('fps=24&hook=0&slots=6&fly=2.5'), { ...TIMELINE_DEFAULTS, fps: 24, hook: 0, slots: 6, fly: 2.5 });
  for (const bad of ['fps=0', 'fps=61', 'fps=29.97', 'hook=-1', 'lapse=31', 'card=abc', 'end=', 'slots=7', 'slots=1.5', 'fly=3', 'fps=60&fly=1.1']) {
    assert.throws(() => read(bad), /^Error: bad /, bad);
  }
  assert.deepEqual(read('fps=60&fly=1'), { ...TIMELINE_DEFAULTS, fps: 60, fly: 1 });
});
