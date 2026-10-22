Impeccable critique of 2026-10-22 evening, run against HEAD 212112e after the day's fixes; the afternoon critique is the previous file.
Metadata: total_score 30, max_score 40, na_heuristics none, p0_count 0, p1_count 1. Previous runs: 27/40 (2026-10-21), 28/40 (2026-10-22 afternoon). The screenshots were taken in the session scratchpad and are not kept.

DEGRADED: split-context. Assessment A (design review) ran inline in the critique sub-agent, because the caller gave that agent the screenshot pass. Assessment B (detector and browser overlay) ran in an isolated sub-agent (a69a14226b4ece15d). B finished before A's screenshot pass, so its counts were in this context while A was written; A's findings below come from the screenshots and page text, and B is only cited in the Deterministic scan section.

Evidence: the Vite dev server at :5173 served a real snapshot (2026-10-22 14:27 UTC) with derived replay counts. Playwright drove headless Edge at 1440x900, 1280x800, 390x844 (touch, 2x) and 540x960 (clip). Because the replay `added` counts are derived locally, the shape of the bar field is not judged as data, only as design.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Live and replay states stay complete (stamp tag, clock line, dashed frame, tense, "–" columns, "Details are for the current snapshot."). New gaps: during scrub or playback, the current bar's value (new articles) is printed nowhere, and opening a lower signal at 1440 leaves its OPEN button below the column's edge. |
| 2 | Match System / Real World | 3 | Up from 2. Signals speak in articles and outlets, the tone slot is "Most positive tone", and coverage lists read "CANADA · CA". Still raw: "Moscow, Moskva, Russia"; story spans such as "14:30–14:15 UTC" that cross midnight without a day; "brightness" in the method heading while the legend says "size". |
| 3 | User Control and Freedom | 3 | CLOSE, Esc, End, `#c=` permalinks, one-open-at-a-time signals. The bold headline of a folded signal is the largest target and leaves the site for the outlet. |
| 4 | Consistency and Standards | 3 | Up from 2. One vocabulary for counts, each figure printed once. Residue: "67 COUNTRIES · HEARD IN 66 OTHER COUNTRIES" side by side; the clip says COUNTRIES where the map says OUTLET COUNTRIES; the method page is METHOD in the nav and attribution but HOW IT WORKS in the foot; SHOW 3 MORE (articles) sits directly above SHOW 9 MORE STORIES. |
| 5 | Error Prevention | 3 | No destructive actions; empty slots say why and when. An accidental exit to an outlet is easy (see issue 1). |
| 6 | Recognition Rather Than Recall | 3 | Phone column heads and the phone legend are fixed. The signal head row has no disclosure cue, and the replay bars' values must be read off a table that only holds the last eight frames. |
| 7 | Flexibility and Efficiency | 3 | Good keyboard path (Tab reaches nav, filter, roving rank list, map, attribution, quakes, then the signal toggles); permalinks. Still no way to compare two places. |
| 8 | Aesthetic and Minimalist Design | 3 | The chrome now says each thing once and the six slots fit. The panel's receipts still carry near-duplicate rows and stacked show-more buttons. |
| 9 | Error Recovery | 3 | Plain-language empty states. Failure paths were not exercised. |
| 10 | Help and Documentation | 3 | The method page has an index and current copy. The map still gives no inline definition of "heard in", "reprints collapsed" or ART/OUT/CTY, and nothing says how a story's articles were grouped. |
| **Total** | | **30/40** | **Good** |

## Design Specificity Verdict

**LLM assessment.** Still unmistakably authored for this product: the pixel globe whose ring orbits, the observer wearing the mark, the tick-framed plate, the mono ledger and the one-frame inversion. The day's changes stayed inside that world. The folded signal entry reuses the nav's inversion for its open state, the panel's summary line reuses the under-map line, and the clip's key line is the same Source Sans voice as the sentence. Nothing generic crept in. The weak points are no longer vocabulary or order. They are three things:
- **Affordance:** the folded signal head shows no cue that it opens.
- **Time:** spans and replay stamps that cross midnight lose their day.
- **Replay:** the bars move, but the bar on screen never says its value, and the map does not show what was new.

**Deterministic scan.**
- CLI `detect.mjs --json` on index.html, about.html and clip.html returned **0 findings** each (exit 0). about.html is clean only because of a new `ignoreValues` waiver in `.impeccable/config.json` (added 2026-10-22T20:39Z). Without the config, the CLI finds 2 `all-caps-body` hits on the method page's index links.
- The in-page overlay on the map found **6 elements carrying 7 findings**, down from 11 in the afternoon. The same set appeared at 1440, at `#replay` and at 390:
  - `tiny-text` x1, on MapLibre's attribution line;
  - `all-caps-body` x4: `#status` "Open a dot to see who is covering it", `.legend-note` "Size = volume, not importance", and the two empty-slot reasons;
  - `repeating-stripes-gradient` x1 and `codex-grid-background` x1, both on `body`.
- about.html: 2 `all-caps-body` (the index links "How a place is chosen for an article" and "How a place's brightness is decided"). clip.html (time-lapse): 0.
- False positives:
  - both `body` background rules (the specified 8px dot grid; `codex-grid-background` is already on the project's ignore list);
  - `tiny-text` on a third-party attribution control;
  - the about-page index hits (the Uppercase Ledger Rule, waived in config);
  - the two empty-slot hits, which are one template rendered twice.
- Where the scan and the review agree: `#status` and `.legend-note` are the product's reading key, still set in the 11px mono caps register that DESIGN.md gives to data that recedes. The key now reaches the phone and the clip, which was the afternoon's P1. Its register is the part not done.
- The five afternoon hits on data lines (`.story-counts`, `#signals-when`) are gone because those lines changed.

**Visual overlays.** Injection succeeded, but only in a headless browser driven by the agent. No overlay is visible to the user.

## Overall Impression

The day's fixes landed, and they landed in the design language rather than on top of it. All three afternoon P1s are fixed:
- a tapped place on a phone shows its first headline inside the 55svh peek;
- "size = volume, not importance" is on the phone map and the clip says "One dot per place in today's news. Size = number of articles.";
- Paris no longer has three unexplained figures.

The chrome now prints each figure once, and all six broadcast slots fit at 1440 and 1280.

What the changes cost: folding made the signal column calm, but the closed entry now shows a bold outlet headline that is a link off-site. Its head row, the real control, looks like a label. On a phone that is the first thing a clip visitor taps.

**Biggest opportunity:** make the fold read as a fold, so that pressing a signal opens it on the site, and let the opened signal lead into its story on the place.

## Since the afternoon critique

Fixes landed in 3bd0e7e, 861b23e, 362fa2a, eed8ca9, 0295c8e and ba0f94d.

**Priority issues**

| Afternoon issue | Status | Evidence |
|---|---|---|
| [P1] Phone sheet buries headlines | **Fixed** | p-7-sheet-peek: title, the summary "6,740 ARTICLES · 4,510 HEADLINES · HEARD IN 121 OTHER COUNTRIES", STORIES and the first headline all sit in the peek. Desktop uses the same order (d1440-5-place-top). |
| [P1] Reading key missing on phone and clip | **Fixed** (register part open) | p-1-first shows the legend's second line "SIZE = VOLUME, NOT IMPORTANCE". clip-timelapse carries the key line under the date. The note is still mono caps, not a Source Sans sentence (detector `all-caps-body` on `.legend-note` and `#status`). |
| [P1] Broadcast vocabulary collides with the map | **Fixed** | "MOST POSITIVE TONE"; "One story over Paris: 456 articles from 339 outlets in 35 languages."; no radio words; the meta line carries only leftover facts; the clip card tag is "PARIS" with no count (clip-signal). Residue: the meta line now reads "67 COUNTRIES · HEARD IN 66 OTHER COUNTRIES" (issue 4). |
| [P2] Replay barely moves | **Partly** | Bars, trend and table now plot `added` ("NEW ARTICLES PER SNAPSHOT", a NEW column; d1440-8-replay). Still open: the map at frame 36 looks the same as live (d1440-10-playing2), no place is marked as grown, and the current bar's value is not shown (issue 3). |
| [P2] Chrome repeats, one signal slot visible | **Fixed** | The snapshot time appears twice (clock and stamp); signals note "LAST 24H"; the foot is source plus one link; outlets and outlet countries appear once, in the column totals; six slot heads visible at 1440 and 1280 (d1440-1-first, d1280-1-first). At 1280 the sixth slot's reason sits just below the column's edge. |

**Minor observations**

| Afternoon minor | Status | Evidence |
|---|---|---|
| Phone rank rows lose column heads | **Fixed** | p-4-places: PLACE / ART / OUT / CTY head. The filter searches every place. Browsing still stops at 12. |
| Clip end card | **Fixed** | clip-end: totals in two rows of two, "OPEN A DOT AT" above the address. |
| Observer without a count | **Open** | "OBSERVERS" over a bare hairline on every view (the Worker is absent locally; DESIGN.md now documents this as intended). |
| ISO codes | **Fixed** | "CANADA · CA", "ENGLISH · EN", "UNKNOWN". |
| COUNTRIES vs HEARD IN near-duplicate | **Open** | Panel counts "COUNTRIES 122 / HEARD IN 121 OTHER COUNTRIES". It is now also the open signal's whole meta line. |
| Attribution "How it works" vs "Method" | **Partly** | The attribution and nav say Method. The foot's only link says HOW IT WORKS. |
| Method page index, double MAP, drift | **Fixed** | The index has 12 links; one MAP control; copy matches the layout ("The totals under the Places list…"; the Replay paragraph explains new articles). |
| "How 'hot' is decided" | **Fixed** | Now "How a place's brightness is decided". "Brightness" still does not match the legend's "size". |
| "Moscow, Moskva, Russia" | **Open** | heat.json still carries the raw name; the panel title shows it. |

**Persona flags**

| Afternoon flag | Status | Evidence |
|---|---|---|
| Casey: Washington off-screen on the phone | **Open** | p-1-first centres Europe. |
| Casey: CLOSE far from the thumb | **Open** | CLOSE is at the top of the sheet. |
| Jordan: radio metaphor, BRIGHTEST, ISO codes | **Fixed** | See the priority table. |
| Jordan: "OBSERVERS" without a number | **Open** | |
| Alex: no compare | **Open** | |
| Alex: replay changes nothing | **Partly** | See the priority table. |
| Alex: recent-frames live row clipped at 1440 | **Open** | d1440-8-replay shows rows 92–98 only. |
| Mara: three Paris figures | **Fixed** | |
| Mara: two meanings of "bright" | **Fixed** | |
| Mara: stale method text | **Fixed** | |
| Mara: heat vocabulary | **Fixed** | |

**What the changes made worse or newly exposed:**
- **Folded signals** have no disclosure cue. Their bold headline is an outbound link, and the sentence that names the unit is now hidden until opened (issue 1).
- **Stories-first panel:** the signal's own story does not lead the place it opens. Vancouver's panel opens on "Prospect Ridge Resources…", and the Mapmygenome story the signal named is the tenth card, behind SHOW 9 MORE STORIES (issue 5). The stacked "SHOW 3 MORE" / "SHOW 9 MORE STORIES" pair is ambiguous (d1440-7-place-scrolled2).
- **Replay as new articles:** the bars now move, but the moving quantity has no readable value at the playhead. The alternating spikes (338, 3,176, 1,164, 5,487 in the last frames) cannot be told apart from ingest cadence (issue 3).
- **Method page index:** fine on desktop. On a 390 phone the 12-line index fills the first viewport, so the first sentence of the method starts below it (about-390-1-first).

## What's Working

1. **The numbers now reconcile across every surface.**
   - Washington reads 6,740 in the rank row, the map tag, the under-map line, the panel summary and the COUNTS rows.
   - The broadcast's 456 is explicitly "One story over Paris", and the clip card no longer prints the place total beside it.
   - Each snapshot figure appears once: sentence, column totals, clock and stamp.

   This is exactly what PRODUCT.md's skeptical reader needs, and it was the weakest point this afternoon.
2. **One panel order serves both peers.**
   - Order: title, a summary line from the same helper as the under-map line, three stories, then the receipts under a COUNTS head.
   - On a phone the first headline is in the peek; on desktop the explorer still gets the receipts one scroll down.
   - The "Details are for the current snapshot." note keeps replay honest when a place is opened on a past frame.
3. **The broadcast column became calm and complete.**
   - At 1440 and 1280 all six slot names show, with each headline clamped to two lines.
   - Opening an entry inverts its head like the current nav item and paints the body in one step, which is DESIGN.md's inversion rule used as an interaction, not decoration.
   - Empty slots still say why and when ("NEEDS MORE DAYS OF HISTORY; FROM 2026-10-25.").

## Priority Issues

**[P1] A folded signal looks like a link to the outlet, not like something that opens.**
- **Location:** the Signals list on every width (d1440-1-first, p-2-signals, p-3-signal-open). The closed entry is a mono head row ("LOUDEST SIGNAL … PARIS") over a bold 17px headline. The headline is `a.story-link` with `target=_blank` to thegazette.com. The head row, the real toggle, has no chevron, plus sign or other cue; it only underlines on hover, and phones have no hover.
- **Why it matters:** the clip visitor (PRODUCT.md: "tap a place, and read what the world is saying about it") arrives from a clip whose signal card showed the same headline, and taps the biggest thing on screen. That sends them to an outlet in a new tab before they see the sentence, the place or OPEN. The fold also hides the sentence that names the unit. And at 1440, opening a lower entry (Most positive tone) leaves its OPEN button 50px below the column's edge without scrolling it into view.
- **Fix:**
  - Give the head a pixel disclosure mark (a 5x5 plus that becomes a minus, crispEdges, in the slot row at the right before the place name).
  - In the closed state, make the headline open the entry, not leave the site. Put the outbound link inside the open body as the outlet line ("THEGAZETTE.COM · EN ↗" or "READ AT THEGAZETTE.COM").
  - After opening, call `scrollIntoView({ block: 'nearest' })` on the entry's body so OPEN is visible.
- **Suggested command:** /impeccable clarify

**[P2] Times that cross midnight lose their day.**
- **Location:**
  - story spans in the panel: Washington's lead story "14:30–14:15 UTC", Vancouver's "14:30–13:45 UTC" (d1440-5-place-top, p-7-sheet-peek; `panel.ts:119-124`);
  - the replay stamp "REPLAY 23:00 UTC · 36/99" beside a clock reading 21:07 (d1440-10-playing2);
  - the recent-frames table's UTC column.
- **Why it matters:** "14:30–14:15" reads as a reversed range or a typo. A replay frame "at 23:00" that is later than now reads as an error. Mara, who checks every number, will report it; Jordan will simply not understand it.
- **Fix:**
  - When a span's start is on an earlier UTC date than its end, prefix the day: "WED 14:30 – THU 14:15 UTC".
  - Give the replay stamp and the PLAY readout the weekday for frames from the previous date ("REPLAY WED 23:00 UTC · 36/99").
  - In the table, insert a single date row where the day changes.
  - This is a formatting change; no data change is needed.
- **Suggested command:** /impeccable clarify

**[P2] Replay now plots change, but the playhead never says what changed.**
- **Location:** the Replay column and playback (d1440-8-replay, d1440-9-playing, d1440-10-playing2, p-5-replay).
  - The current bar's tag shows the frame index ("36"), which the head already prints as "36/99".
  - The new-article count for that frame appears only in the recent-frames table, which holds frames 92–98 and at 1440 clips 99.
  - The map, stamp and sentence keep the rolling window, so during playback the map at 23:00 looks like the map at 14:27.
- **Why it matters:** the explorer's signature activity now has a real signal, but it has to be read off bar heights with no value. The tall bars (3,176, then 5,487 two frames later) invite "what happened at 13:41?" and nothing on the map answers. The skeptical reader cannot tell a news burst from GDELT's file cadence.
- **Fix:**
  - Put the value in the bar tag ("+3,176"), since the index is already in the head.
  - Add "+3,176 NEW" to the PLAY readout.
  - On the map, mark the places that gained most in the step with the hollow-ring vocabulary the quake layer already uses; this is the afternoon's second half, still open.
  - Add one line to the method page's Replay section about GDELT's publishing cadence, so a spike is not read as an event.
- **Suggested command:** /impeccable shape

**[P2] "Countries" means two things, side by side, under three labels.**
- **Location:**
  - an opened signal's whole meta line: "67 COUNTRIES · HEARD IN 66 OTHER COUNTRIES" (d1440-2-signal-open, p-3-signal-open);
  - the panel's COUNTS: "COUNTRIES 122 / HEARD IN 121 OTHER COUNTRIES";
  - the clip's totals say "192 COUNTRIES" where the map's column totals say "OUTLET COUNTRIES 192" (clip-timelapse, clip-end vs d1440-1-first).
- **Why it matters:** two adjacent numbers that differ by one look like an error. The clip's bare "192 COUNTRIES" will be read as countries in the news, not countries outlets are based in. The clip is the audience's first contact with the numbers.
- **Fix:**
  - Merge the pair into one row: "67 OUTLET COUNTRIES · 66 ABROAD", or keep only "HEARD IN 66 OTHER COUNTRIES" in the signal meta, since the sentence already counts outlets.
  - In COUNTS, label the row OUTLET COUNTRIES.
  - On the clip, label the fourth total "OUTLET COUNTRIES" (or "COUNTRIES OF OUTLETS") to match the map.
  - Change METHODOLOGY.md and about.html in step, since the labels are published.
- **Suggested command:** /impeccable clarify

**[P2] OPEN from a signal lands on the place, not on the signal's story.**
- **Location:** "MOST POSITIVE TONE · VANCOUVER", then OPEN VANCOUVER (d1440-4-place-from-signal). The panel opens on "Prospect Ridge Resources Corp.…", then two more stories. The Mapmygenome story the signal named is the tenth story card (`story-10`), hidden behind SHOW 9 MORE STORIES; only a video card and two flat-list articles about it are visible.
- **Why it matters:** the broadcast is "the daily reason to return", and its promise is "here is a story, and here is the place". Landing on a different story breaks the thread, and the reader has to hunt with SHOW 9 MORE STORIES. Stories-first order made this visible, because the first thing the panel now shows is a story.
- **Fix:**
  - When the panel is opened from a signal, pin that story as the first card with a one-line mono tag ("FROM SIGNALS · MOST POSITIVE TONE"), and keep the rest in their order.
  - Carry it in the permalink (`#c=…&s=<story>`) so a clip end card or a share can land on it too.
- **Suggested command:** /impeccable shape

## Persona Red Flags

**Casey (distracted mobile user, arriving from a clip):**
- The first viewport now explains itself: the sentence, nav, map and "SIZE = VOLUME, NOT IMPORTANCE".
- The map is centred on Europe, so Washington, the top place, is off-screen.
- In Signals, the bold headline Casey taps opens thegazette.com in a new tab; nothing marks the head row as the thing that opens.
- After tapping a place the peek is right: the first headline is visible.
- CLOSE is at the top of the sheet, away from the thumb.

**Jordan (first-timer):**
- "LOUDEST SIGNAL · PARIS" with no cue does not read as a button.
- "14:30–14:15 UTC" looks broken.
- "67 COUNTRIES · HEARD IN 66 OTHER COUNTRIES" looks like a typo.
- ART / OUT / CTY are labelled but never spelled out.
- "OBSERVERS" with no number still looks broken.

**Alex (desktop explorer):**
- Keyboard path is good: Tab reaches nav, filter, roving rank list, map canvas, attribution, quakes, then the signal toggles.
- Opening "Most positive tone" at 1440 leaves OPEN below the column's edge.
- Replay: the playhead's value is not printed, and the live row of the recent-frames table is clipped at 1440.
- Still no way to compare two places.

**Project persona, Mara (the skeptical reader, from PRODUCT.md's "evaluated by a skeptical reader"):**
- **Profile:** a journalist or researcher who cross-checks figures across panels and reads the method page.
- **What now passes:** the Paris figures reconcile, the broadcast names its unit, and every total appears once.
- **Red flags found:**
  - Under Washington's lead story "Putin hosts Trump envoy for new Ukraine peace talks…", the nested articles include "Army chief says Iran ready for any asymmetric warfare…" (presstv.co.uk). The method page says stories are grouped by shared tagged names and title words, but nothing in the panel says so, and the chips (VLADIMIR PUTIN, DONALD TRUMP…) are not labelled as the grouping key.
  - The midnight-crossing spans.
  - Replay spikes with no stated cause.
  - The clip's "192 COUNTRIES".

## Minor Observations

- **[P3] Stacked show-more buttons.** "SHOW 3 MORE" (articles in the third story) sits directly above "SHOW 9 MORE STORIES" (d1440-7-place-scrolled2). Word the first "SHOW 3 MORE ARTICLES", or indent it inside the story's left rule.
- **[P3] Reading key register.** The legend note and the status hint are still 11px mono caps (detector `all-caps-body`). Setting "Size = volume, not importance" as a Source Sans sentence would make the product's one rule read as prose.
- **[P3] Brightness vs size.** The method heading "How a place's brightness is decided" and the mode group "Brightness" against the legend's "size". Pick one word for the dot.
- **[P3] Method link names.** The foot says HOW IT WORKS; the nav and attribution say METHOD.
- **[P3] Phone method page.** The 12-line index fills the 390 first viewport. Consider two columns at 390 or a shorter index (group Replay, Freshness, Earthquakes under one line).
- **[P3] Moscow's raw name.** "Moscow, Moskva, Russia" is still the panel title.
- **[P3] Selection line wraps.** The under-map selection line orphans "COUNTRIES" at 1440 and 1280 (d1440-5-place-top, d1280-3-place). Drop "OTHER" there or allow the legend row to give way.
- **[P3] Faint signal at 1280.** The sixth slot's reason sits just under the column's edge at 1280x800.
- **[P3] Clip key wording.** The clip key says "today's news", while the site says "last 24 hours". These are different claims; "the last 24 hours of news" is literal.
- **[P3] Trend max.** The trend's "10,161 MAX" is a 9-frame mean, but beside bars it reads like a bar maximum. Label it "MEAN MAX" or drop it.

## Questions to Consider

- Should anything inside a closed signal leave the site, or should every link out live inside the open entry?
- What if the replay playhead said "+3,176 new" and the map ringed the five places that gained most in that step?
- Is "HEARD IN N OTHER COUNTRIES" the only country figure a visitor needs, with the raw outlet-country count kept for the method page?
- When OPEN comes from a signal, is the place or the story the destination?
- Does the clip's fourth total earn its place if it has to be labelled "outlet countries"?

## Questions for the user

1. **Priority direction.** I found one P1 in the signal fold (no cue, and the headline leaves the site), and P2s in time formatting, the replay readout, and the countries vocabulary. Which should go first?
   - Options: signal fold affordance and link target (clarify) / midnight-crossing times plus the countries labels (clarify, small) / the replay readout and grown-place rings (shape, larger).
2. **Design intent.** Should a closed signal's bold headline stay a link to the outlet?
   - Options: the headline opens the entry and the outlet link moves inside it / keep the outbound headline but add a disclosure mark to the head / keep both as now.
3. **Scope.** There are 5 priority issues and 10 minor ones.
   - Options: the P1 plus the two clarify P2s (times, countries) / all five priority issues / everything including the minor list.
