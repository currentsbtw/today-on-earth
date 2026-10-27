import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bracket, buildNewscastPlan, buildPlan, checkNewscastScript, framesFor, headlineOffset, interpolateCells, interpolateTotals, lapseTime, pullbackFraction, reached, readTimelineParams, segmentAt, sentenceTimes, spokenAt, TIMELINE_DEFAULTS, wordTimes, type ClipPlan, type NewscastLine, type NewscastScript } from '../src/timeline.ts';

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

// The newscast (clip.html?newscast=1).

const OPEN = 'Today on Earth, Saturday the 24th of October. 242,540 articles from 10,568 outlets in 195 countries. Here is where the world\'s press pointed.';
const HEADLINE = 'France braces: Macron restricts protests';
const storyLine = (id: string, n: number, seconds: number, spoken = true): NewscastLine => ({
  id,
  kind: 'story',
  text: `Paris. 520 articles from 410 outlets in 38 languages. ${HEADLINE}.`,
  seconds,
  n,
  of: 2,
  story: { cell: '831fb4fffffffff', place: 'Paris, France', lat: 48.86, lon: 2.35, headline: HEADLINE, source: 'example.com', lang: 'en', url: '', n: 520, o: 410, l: 38, i: 30, confirmed: 'city', spoken },
});
const script = (): NewscastScript => ({
  date: '2026-10-24',
  generatedAt: '2026-10-24T12:00:00Z',
  voice: { engine: 'kokoro', name: 'af_heart', speed: 1.1 },
  gap: 0.4,
  lines: [
    { id: 'open', kind: 'open', text: OPEN, seconds: 9.8 },
    storyLine('s1', 1, 12),
    storyLine('s2', 2, 11.5, false),
    { id: 'close', kind: 'close', text: 'That was today on Earth. The full broadcast at currents B T W dot github dot I O slash today on earth. Read by a synthetic voice from the outlets\' own headlines.', seconds: 8.2 },
  ],
});

test('newscast plan: open, flight + card per story, close; the gap held by each line', () => {
  const plan = buildNewscastPlan(script(), 30);
  // Edges at the running time: open 9.8+0.4 = 10.2 s; s1 flight to 11.4, card 12-1.2+0.5+0.4 = 11.7 to 23.1;
  // s2 flight to 24.3, card 11.5-1.2+0.9 = 11.2 to 35.5; close 8.2+1.0+0.4 = 9.6 to 45.1.
  assert.deepEqual(
    plan.segments.map((s) => [s.kind, s.line, s.start, s.frames]),
    [
      ['open', 'open', 0, 306],
      ['flight', 's1', 306, 36],
      ['card', 's1', 342, 351],
      ['flight', 's2', 693, 36],
      ['card', 's2', 729, 336],
      ['close', 'close', 1065, 288],
    ],
  );
  assert.equal(plan.frames, 1353);
  assert.equal(plan.date, '2026-10-24');
  assert.equal(plan.fps, 30);
});

test('newscast plan: segments contiguous; lines start at their first segment, frames are the audio', () => {
  const plan = buildNewscastPlan(script(), 30);
  let next = 0;
  for (const s of plan.segments) {
    assert.equal(s.start, next);
    assert.ok(s.frames > 0);
    next += s.frames;
  }
  assert.equal(next, plan.frames);
  assert.deepEqual(plan.lines, [
    { id: 'open', start: 0, frames: 294 },
    { id: 's1', start: 306, frames: 360 },
    { id: 's2', start: 693, frames: 345 },
    { id: 'close', start: 1065, frames: 246 },
  ]);
  // The next line starts exactly the gap after the previous line's audio + its hold.
  assert.equal(plan.lines[1].start - plan.lines[0].start, Math.round((9.8 + 0.4) * 30));
  for (const line of plan.lines) assert.equal(plan.segments.find((s) => s.line === line.id)!.start, line.start);
});

test('newscast plan: the poster is the first card\'s last frame; no drift from rounding', () => {
  const plan = buildNewscastPlan(script(), 30);
  assert.equal(plan.poster, 342 + 351 - 1);
  // 25 fps: 1.2 s flights are 30 frames; line starts stay at round(running seconds x fps).
  const p25 = buildNewscastPlan(script(), 25);
  assert.deepEqual(p25.lines.map((l) => l.start), [0, Math.round(10.2 * 25), Math.round(23.1 * 25), Math.round(35.5 * 25)]);
  const noStory = buildNewscastPlan({ ...script(), lines: [script().lines[0], script().lines[3]] }, 30);
  assert.deepEqual(noStory.segments.map((s) => s.kind), ['open', 'close']);
  assert.equal(noStory.poster, noStory.frames - 1);
});

test('newscast script check: the contract shape, else an Error naming the problem', () => {
  assert.equal(checkNewscastScript(script()).lines.length, 4);
  const bad = (edit: (s: any) => void, why: RegExp) => {
    const s: any = script();
    edit(s);
    assert.throws(() => checkNewscastScript(s), why);
  };
  assert.throws(() => checkNewscastScript(null), /bad script: not an object/);
  bad((s) => (s.date = '24 Oct'), /date/);
  bad((s) => (s.lines = [s.lines[0]]), /lines/);
  bad((s) => (s.lines[1].seconds = 0), /line 1 seconds/);
  bad((s) => (s.lines[2].id = 's1'), /line 2 id/);
  bad((s) => s.lines.reverse(), /line 0 kind/);
  bad((s) => delete s.lines[1].story, /line 1 story/);
  bad((s) => (s.lines[1].story.lat = 'x'), /line 1 story lat/);
  bad((s) => (s.lines[1].story.spoken = 'yes'), /spoken/);
  bad((s) => (s.lines[1].n = 3), /line 1 n\/of/);
});

test('sentence times: split at sentence ends, each at seconds x chars before / total', () => {
  const said = sentenceTimes(OPEN, 9.8);
  assert.deepEqual(
    said.map((s) => s.text),
    ['Today on Earth, Saturday the 24th of October.', '242,540 articles from 10,568 outlets in 195 countries.', "Here is where the world's press pointed."],
  );
  assert.equal(said[0].at, 0);
  assert.equal(said[1].at, (9.8 * OPEN.indexOf('242,540')) / OPEN.length);
  assert.equal(said[2].at, (9.8 * OPEN.indexOf('Here')) / OPEN.length);
  // "U.S." is not a sentence end; "dot I O" has none.
  assert.equal(sentenceTimes('The U.S. votes. Then more.', 2).length, 2);
  assert.equal(sentenceTimes('One sentence', 1).length, 1);
  assert.equal(reached(said.map((s) => s.at), 0), 1);
  assert.equal(reached(said.map((s) => s.at), said[2].at), 3);
  assert.equal(reached(said.map((s) => s.at), said[2].at - 0.01), 2);
});

test('word times: the headline starts after the counts, words at an even rate over the line', () => {
  const text = `Paris. 520 articles from 410 outlets in 38 languages. ${HEADLINE}.`;
  const start = text.indexOf(HEADLINE);
  assert.equal(headlineOffset(text, HEADLINE), start);
  const words = wordTimes(text, HEADLINE, 12);
  assert.deepEqual(words.map((w) => w.word), ['France', 'braces:', 'Macron', 'restricts', 'protests']);
  assert.equal(words[0].at, (12 * start) / text.length);
  assert.equal(words[2].at, (12 * (start + HEADLINE.indexOf('Macron'))) / text.length);
  assert.ok(words.every((w, k) => k === 0 || w.at > words[k - 1].at));
  assert.ok(words[words.length - 1].at < 12);
  // Not verbatim in the text (the renderer cleaned it): it is taken to end the line.
  assert.equal(headlineOffset('Paris. Counts. Something else.', 'Other words'), 'Paris. Counts. Something else.'.length - 'Other words'.length - 1);
  assert.equal(spokenAt('abcd', 2, 8), 4);
  // With `said` (a label dropped from the spoken form): its words line up with the voice; the
  // label's words come just before; a `said` the text does not carry falls back as above.
  const shown = `Arab News | ${HEADLINE}`;
  const spokenLine = `Paris. 520 articles from 410 outlets. ${HEADLINE}.`;
  const at = spokenLine.indexOf(HEADLINE);
  assert.equal(headlineOffset(spokenLine, shown, HEADLINE), at - 'Arab News | '.length);
  const labelled = wordTimes(spokenLine, shown, 10, HEADLINE);
  assert.deepEqual(labelled.map((w) => w.word).slice(0, 4), ['Arab', 'News', '|', 'France']);
  assert.equal(labelled[3].at, (10 * at) / spokenLine.length);
  assert.ok(labelled[0].at < labelled[3].at);
  assert.equal(headlineOffset(spokenLine, HEADLINE, ''), at);
  assert.equal(headlineOffset('Paris. Counts. Something else.', 'Other words', 'Not here'), 'Paris. Counts. Something else.'.length - 'Other words'.length - 1);
});
