Impeccable critique of 2026-10-22, run against the uncommitted working tree after clip v2, the observer and the two audit fixes. The screenshots were taken in the session scratchpad and are not kept. Metadata: total_score 28, max_score 40, na_heuristics none, p0_count 0, p1_count 3. Previous run: 27/40 (2026-10-21, before the redesign).

DEGRADED: split-context. Assessment A (design review) ran inline in the critique sub-agent, because the caller gave that agent the screenshot pass. Assessment B (detector and browser overlay) ran in an isolated sub-agent (aa08ed2e6cc32b681). Its findings were read only after A had been recorded in the scratchpad.

Evidence: the Vite dev server at :5173 served a fixture of the real 2026-10-22 14:27 UTC snapshot. Playwright drove headless Edge at 1440x900, 1280x800, 390x844 (touch) and 540x960 (clip). Caveat: the fixture's `cells/` files date from 2026-10-21, so London's panel showed 234 articles while its row showed 3,976. That mismatch comes from the fixture and is not a finding. Moscow's panel matched its row.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Live and replay states are very clear (stamp tag, clock line, dashed frame, sentence tense). When the presence Worker is absent, the bare OBSERVERS label looks like a heading over an empty section. |
| 2 | Match System / Real World | 2 | Panel rows use ISO codes (US, GB, el, pt). The phone place rows show three unlabeled figures. Raw GDELT names remain ("Moscow, Moskva, Russia"). |
| 3 | User Control and Freedom | 3 | CLOSE, Esc, End-to-live, `#c=` permalinks and the sheet's two heights all work. Nothing traps the user. |
| 4 | Consistency and Standards | 2 | The words don't match each other. BRIGHTEST means tone while brightness elsewhere means volume. "Reports/transmitters" and "ARTICLES/OUTLETS" describe the same numbers in one entry. About-page copy describes the pre-redesign layout. |
| 5 | Error Prevention | 3 | Empty slots say why and give a date. Replay goes static under 4 frames. The page has no destructive actions. |
| 6 | Recognition Rather Than Recall | 3 | The status hint and the labels on the top places fix the 10-21 gap. The phone loses the legend note and the rank column heads. |
| 7 | Flexibility and Efficiency | 3 | The filter takes Enter, the list takes arrows and Home/End, Space plays, End returns to live, and places have permalinks. There is no way to compare two places. |
| 8 | Aesthetic and Minimalist Design | 3 | The visual system is excellent. The chrome repeats itself: the snapshot time appears 4 times, the totals 3 times and the attribution twice. |
| 9 | Error Recovery | 3 | Errors are plain-language empty states. Failure paths were not exercised in this run. |
| 10 | Help and Documentation | 3 | The method page is exemplary in substance. It has no in-page index, some copy has drifted, and the map gives no inline definition of "heard in" or "reprints collapsed". |
| **Total** | | **28/40** | **Good** |

## Design Specificity Verdict

**LLM assessment.** This design is authored for this product, and nothing in it could be lifted into a different product unchanged. The pixel globe with its orbiting ring, the observer that wears the mark as its head, the tick-framed map plate, the mono ledger in the margins and the one-frame inversion on a snapshot change together form a world. That world carries through the map, the method page and all three clip frames without a seam. The redesign fully replaces the generic "amber glow dashboard with cards" that the 10-21 critique reviewed. The remaining weaknesses are not in the visual world. They are in four places:
- **Words:** the signals' radio register sits on top of the ledger's terms.
- **Order:** on the phone sheet, data rows come before any headline.
- **Content:** replay plots a quantity that barely moves.
- **Space:** chrome repeats itself and crowds out the daily broadcast.

**Deterministic scan.**
- CLI `detect.mjs` on index.html, about.html and clip.html returned **0 findings** (exit 0). The stylesheets were also clean.
- The in-page overlay found **11 anti-patterns on the map page** and the same set at 1440, at `#replay` and at 390. They were:
  - `tiny-text` x1, on the MapLibre attribution;
  - `all-caps-body` x9;
  - `repeating-stripes-gradient` x1, on the body;
  - `codex-grid-background` x1, on the body.
- about.html and clip.html had 0.
- False positives:
  - Both body-background rules: the body background is the specified 8px dot grid. `codex-grid-background` is already on the project ignore list, and the overlay ran outside the project root.
  - Five `all-caps-body` hits on data and meta lines (`.story-counts` x4 and `#signals-when`). DESIGN.md's Data style covers these.
- Where the scan and the design review agree: the other four `all-caps-body` hits are the explanatory sentences on the map.
  - `#status` "Open a dot to see who is covering it"
  - `.legend-note` "Size = volume, not importance"
  - two empty-slot sentences

  Those are the product's reading key, and they are set in 11px uppercase mono, the register DESIGN.md gives to data that should recede. This overlaps with Priority Issue 2.

**Visual overlays.** Injection succeeded, but only in a headless browser driven by the agent. No overlay is visible to the user.

## Overall Impression

The redesign worked. The first viewport is confident and quiet: one sentence of totals, a framed field of white dots, and numbers packed into the margins. On the 10-21 run's priority issues:
- The **P0** (no keyboard path to any place) is fixed by a 100-row ranked Places column with a filter and arrow keys.
- **Both P1s** are fixed: interactivity is now discoverable, and the scrubber no longer collides with the panel.

The weak points now are words and order, not looks. The phone visitor who taps a place gets six count rows and a list of domains before any headline. The signals speak two vocabularies at once. The core sentence "size = volume, not importance" is absent from both places the clip audience lands (the phone map and the clip frame).

**Biggest opportunity:** make the phone sheet lead with what the world is saying, and give the reading key to the phone and the clip.

## What's Working

1. **The prose/data split carries the hierarchy.**
   - "278,481 articles are pointing at 3,765 places." is the only large humanist sentence on the page. Everything else is 11px mono, so the eye knows instantly what to read first and what is instrument.
   - The clip frames reuse the same world exactly (wordmark, ticked rules, dot plate, totals), so a clip viewer lands somewhere familiar.
   - Preserve the one-sentence rule and the clip/map identity.
2. **The live-versus-replay status system is complete.** In replay:
   - the stamp's LIVE outline tag becomes an inverted REPLAY tag with the frame index ("REPLAY 00:40 UTC · 43/99");
   - the clock's SNAPSHOT line swaps to REPLAY;
   - the map frame turns dashed;
   - the place columns drop to "–" for data the frames don't carry;
   - the sentence changes tense, from "are pointing" to "were pointing".

   The tense change is the best detail on the page: honest, literal and free.
3. **"Silence is information" is done in words.**
   - Empty slots say "NEEDS MORE DAYS OF HISTORY; FROM 2026-10-25."
   - The method page publishes every slot rule, threshold and theme list.
   - The page states plainly that "dark areas mean no coverage was found."
   - The observer (one-bit body, the mark as its head, the shared orbit) is the product's one piece of warmth, and it costs nothing in the visual world.

## Priority Issues

**[P1] The phone sheet buries the headlines under about 30 rows of data.**
- **Location:** a selected place on a phone (phone-5-sheet.png, phone-6-sheet-full.png). At its 55svh peek the sheet shows the title, six count rows and five outlet domains. STORIES only start after OUTLETS (8 rows), OUTLETS BASED IN (8), LANGUAGES (8) and VIDEOS.
- **Why it matters:** PRODUCT.md names the phone visitor's job as "tap a place, and read what the world is saying about it", and that visitor has under a minute. They will close the sheet before reaching a single headline.
- **Fix:** below 720px, order the sheet as:
  1. the title;
  2. a one-line count summary (reuse the under-map selection line: "5,424 articles · 1,443 outlets · heard in 105 other countries");
  3. the top two or three stories, so the first headline sits inside the 55svh peek;
  4. the coverage lists, then the videos.

  The full count rows can follow the stories. Desktop could take the same order. The explorer loses little, because the counts still sit one scroll away.
- **Suggested command:** /impeccable adapt

**[P1] The core reading key is missing where first-timers arrive.**
- **Location:** two places.
  - Phone map: style.css:1904-1906 hides `.legend-note` at 720px and below, so the phone legend reads only "0 |||| 6,740".
  - Clip time-lapse frame (clip-timelapse.png): it shows a wordmark, a date, dots and four totals, with nothing saying what a dot or its size means.
- **Why it matters:** PRODUCT.md defines success as "a first-time visitor understands within seconds that brightness is coverage, not importance". Both surfaces the clip audience sees drop exactly that sentence. Only the desktop and the og image carry it. The detector's `all-caps-body` hits show a second weakness: where the key does appear, it is set as recessive 11px caps.
- **Fix:**
  - On phones, keep the note on its own line under the legend.
  - Put one Source Sans line in the clip's top band under the date, for example "One dot per place in today's news. Size = number of articles." It is a fixed template, so it carries no editorial voice.
  - Consider setting the legend note on the map as a sentence in Source Sans rather than as mono caps.
- **Suggested command:** /impeccable clarify

**[P1] The broadcast's vocabulary collides with the map's.**
- **Location:** Signals (desk-1440-1-first.png, phone-2-signals.png, clip-signal.png). Three collisions:
  - (a) The **BRIGHTEST** slot is the most positive tone ("Brightest signal, over Vancouver: 12 reports…"). On a map where bright means many articles, a 12-article story is called brightest.
  - (b) Each entry says "456 reports from 339 transmitters" and then, two lines down, "456 ARTICLES · 339 OUTLETS": the same numbers in two vocabularies.
  - (c) "Signal detected over Paris: 456 reports" counts one story, but it reads as Paris's total. The Places row says Paris 3,681, and the clip's signal card prints "PARIS · 3,681" on the map directly above "456 reports".
- **Why it matters:** PRODUCT.md says the site is judged by a skeptical reader and that every number must be explainable. Three different Paris figures on one screen, and two meanings of "bright", read as inconsistency, not as receipts.
- **Fix:**
  - Rename the tone slot literally, for example "Most positive tone".
  - Make the template name its unit: "One story over Paris: 456 articles from 339 outlets in 35 languages." Either drop the radio words or drop the duplicate meta line.
  - On the clip card, label the tag "PARIS · 3,681 TODAY" or drop the count.
  - These are published rules, so change METHODOLOGY.md, broadcast.ts, the clip and about.html in lockstep.
- **Suggested command:** /impeccable clarify

**[P2] Replay shows a rolling 24-hour window, so the day barely moves.**
- **Location:** the Replay column and playback (desk-1440-4-replay.png, desk-1440-5-playing.png, desk-1440-6-playing2.png).
  - From frame 36 on, the bars are a flat block between 270k and 282k.
  - The "9-frame mean" trend is a flat line.
  - The map at 00:40 UTC cannot be told apart from the map at 14:27.
  - The clip's time-lapse uses the same frames.
- **Why it matters:** "Scrub the last 24 hours" is the desktop explorer's signature activity, and the clip opens with it. Playing the day yields no visible event, so the feature that should reward a longer sit is the weakest moment on the page.
- **Fix:** plot what changed in each step rather than the window total.
  - The bars could show articles first seen in each 15-minute step.
  - The map could mark the few places that grew most since the previous frame, using a hollow ring in the existing stepped vocabulary.
  - Keep the window total as the stamp figure.
  - This needs a per-frame "new articles" count, so it is a data-contract change first.
- **Suggested command:** /impeccable shape

**[P2] Chrome repeats itself while the daily broadcast gets one slot of room.**
- **Location:** desktop at 1280x800 and 1440x900 (desk-1280-1-first.png, desk-1440-1-first.png). The right column shows one signal at 1280 and one and a half at 1440 out of six. Each entry is about 260px tall (template sentence, 4-line headline, meta, heard-in, OPEN), and the observer is pinned below. Meanwhile:
  - the snapshot time appears four times: the clock's SNAPSHOT line, the LIVE stamp, the signals note, and the foot's 14:27Z;
  - articles, places, reprints and unplaced appear up to three times: the sentence, the left-column totals and the foot;
  - the attribution appears twice: the map corner and the foot links;
  - at 1280 the foot wraps GDELT 2.0 onto its own line.
- **Why it matters:** PRODUCT.md calls the broadcast "the daily reason to return", yet a returning visitor sees one slot and must discover that the column scrolls. "Chrome recedes" is undercut by the same figures printed three times.
- **Fix:**
  - On desktop, make each signal a compact entry (slot head, place, headline; the numbers and OPEN on hover/focus or on one meta line) so all six slot names are visible.
  - Drop the date and time from `#signals-when` ("LAST 24H" is enough beside the stamp).
  - Cut the foot to source and links.
  - Let the observer share the stamp row or sit lower in the column.
- **Suggested command:** /impeccable distill

## Persona Red Flags

**Casey (distracted mobile user, arriving from a clip):**
- The first viewport works: sentence, nav, map with Europe centred and the "OPEN A DOT" hint.
- Nothing on screen says size = coverage.
- The camera centres Europe, so Washington, the top place, is off-screen.
- Tapping a place gives counts and domains with no headline above the fold.
- The Places rows show "6740 2362 122" with no column heads.
- CLOSE sits at the top of the sheet, away from the thumb.

**Jordan (first-timer):**
- "Signal detected over Paris … transmitters" reads as a radio metaphor they must decode.
- BRIGHTEST contradicts what they just learned about brightness.
- ISO country and language codes ("GR", "el") and "ART OUT CTY" go unexplained.
- "OBSERVERS" with no number looks broken.
- "HEARD IN 105 OTHER COUNTRIES" sits under "COUNTRIES 106" with no hint of the difference.

**Alex (desktop explorer):**
- Good keyboard coverage: filter Enter, arrows and Home/End in the list, Space and End in replay, permalinks.
- There is no way to compare two places side by side, which PRODUCT.md names as a job.
- Replay play-through shows nothing changing.
- The recent-frames table's live row is clipped under the observer until the column scrolls (desk-1440-4-replay.png).

**Project persona, Mara (the skeptical reader, from PRODUCT.md's "evaluated by a skeptical reader"):**
- **Profile:** a journalist or researcher who checks whether any number is an editorial choice. Reads the method page. Cross-checks figures across panels.
- **Red flags found:**
  - Paris is 3,681 in the rank list and in the clip tag, but 456 in the signal sentence, with no unit given.
  - Two meanings of "bright".
  - The method page still describes "the scrubber under the map" and "the header tells you how many articles were left unplaced". Both describe the old layout, and stale method text is exactly what this reader catches.
  - The method section is titled "How 'hot' is decided", which is heat-world vocabulary.

## Minor Observations

- **[P2] Phone rank rows lose their column heads.** The `.rank-head` row is hidden at 1099px and below. Show "ART · OUT · CTY" once above the list, or suffix the first row. The audit's separate point about only 12 phone places being reachable still stands.
- **[P3] Clip end card.**
  - The four totals sit about 12px apart and read as one long string of digits at a glance.
  - The URL is long and carries no instruction.
  - Fix: give the totals the time-lapse frame's spacing, or drop to two figures. Add a fixed line such as "Open a dot at" above the address.
- **[P3] Observer without a count.** When the Worker is absent, consider showing the figure alone rather than a label over an empty hairline. Locally the label read "Observers" on every page.
- **[P3] Panel coverage lists.**
  - Expand ISO codes with `Intl.DisplayNames` (keeping the code in mono).
  - "unknown" is the only lowercase key in the list.
  - "COUNTRIES 106" and "HEARD IN 105 OTHER COUNTRIES" are adjacent near-duplicates; merge them into one row ("106 · 105 abroad").
- **[P3] Attribution.** The map attribution reads "How it works" on desktop and "Method" on phone. The foot repeats the same four links.
- **[P3] Method page.**
  - It has no section index for about 15 sections.
  - Its nav shows both MAP and BACK TO THE MAP.
  - Its copy has drifted from the current layout (see Mara).
- **[P3] Place names.** "Moscow, Moskva, Russia" still shows the admin-1 duplication the 10-21 run flagged. Washington is now cleaned.
- **Changes since 10-21:**
  - Fixed: the P0 keyboard path, the P1 discoverability (status hint, labelled top places, legend), the P1 scrubber collision (replay moved to the right column), and the P2 "24h" honesty (empty states with dates, static field under 4 frames).
  - Partly fixed: the panel Coverage block now leads with counts, outlets, countries and languages, but on phones that order now pushes the stories down.

## Questions to Consider

- What if the phone sheet's peek height showed the place's top headline instead of six count rows?
- Should replay draw the rolling window at all, or the 15-minute increments that actually changed?
- Does the broadcast need the radio register, now that the meta line already speaks in articles and outlets?
- If the clip's first second had to explain the map with no narration, what one line would it say?
- On an 800px-tall screen, does the observer earn the space of two signal slots?

## Questions for the user

1. **Priority direction.** I found problems in phone reading order (the sheet), vocabulary (Signals vs the map) and replay content. Which should go first?
   - Options: phone sheet order (adapt) / Signals vocabulary and the clip key (clarify) / replay showing change (shape, needs data).
2. **Design intent.** Is the radio register in the signal template ("reports from transmitters", "Signal detected") a deliberate voice you want to keep?
   - Options: keep it but drop the duplicate meta line / replace it with the ledger's words (articles, outlets) / keep both as now.
3. **Scope.** There are 5 priority issues and about 8 minor ones.
   - Options: the three P1s only / all five priority issues / everything including the minor list.
