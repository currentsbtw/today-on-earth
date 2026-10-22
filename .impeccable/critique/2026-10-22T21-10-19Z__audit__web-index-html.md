Impeccable audit of web/index.html and web/about.html, re-run 2026-10-22 evening against HEAD 212112e after the day's fixes; the morning audit is the previous file.

# Impeccable Audit: Today On Earth (web/index.html, web/about.html), evening re-run

This audit was read-only apart from this archive file. The working tree was clean at HEAD 212112e. The build went to the scratchpad (`vite build --outDir <scratch>/dist`); `web/dist` was not touched. Runtime checks used playwright-core 1.64.1 (render/node_modules, channel msedge) against the dev server at http://localhost:5173, which serves the snapshot of 14:27 UTC with 100 replay frames. The built bundle was also served once with `vite preview` on port 5174 to check load order. DESIGN.md (as committed in 212112e) is the standard.

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | Tabbing through the panel's video strip leaves cards 3, 5 and 7 out of view, because scroll snapping pulls the strip back (2.4.7). Everything from the morning is fixed |
| 2 | Performance | 4 | MapLibre is now a lazy chunk, heat.json starts from the head at 25 ms, and the sentence paints with the map chunk held back 6 s. PLAY fetches a 13-frame window, not 99 files |
| 3 | Responsive Design | 3 | No overflow at any width. Phone controls are now 36 px, but the `::after` hit areas on bordered buttons reach 42 px, not 44, and `.article-play` reaches 34 px |
| 4 | Theming | 4 | style.css and about.css contain 0 raw colour literals. All hairlines, `--dim-rank` and `--visited` are tokens, and the unused aliases are gone |
| 5 | Implementation Integrity | 3 | Detector: 0 findings with config; 3 without, all verified as false positives or justified. Small residual drift: rank columns differ from DESIGN, the video title clamp leaks a third line, and story time spans read backwards |
| **Total** | | **17/20** | **Good** (morning: 14/20) |

## Implementation Integrity Verdict

**PASS.** The implementation reads as one product-specific system, and it now holds its own motion rules end to end.

**Colour and shape, measured at every width:**
- **Text colours on `#000`:**
  - `#fff`: 21:1.
  - `#9a9a9a`: 7.46:1, on 418 text nodes at 1440.
  - `#777`: 4.69:1, only while a place is selected.
  - Inverted `#000` on `#fff`: 21:1.
- **Corners and shadows:** 0 non-zero `border-radius` and 0 `box-shadow`.
- **Transitions and hints:** 0 computed `transition` and 0 `will-change`, on elements and pseudo-elements, across both pages and all four widths.
- **Filter:** the only `filter` is `html.invert`.

**Motion:**
- Only two animations run: `mark-ring` on the mark and on the observer's head (one while the panel covers the observer).
- `window.__map._fadeDuration` is `0`.
- The phone sheet's camera moves took 0 ms (`jumpTo`).

**Detector**, run once as the context directive says, over web/index.html, web/about.html, web/clip.html and web/src:
- **With project config:** `[]`.
- **With `--no-config`:** 3 findings, each verified in context:

| Rule | Location | Verdict | Is the config ignore justified? |
|---|---|---|---|
| `codex-grid-background` (advisory) | style.css:507, `.map-frame::after` | False positive. These are the map frame's 64 px tick marks, a measurement surface, which is the exception the rule itself allows | Yes. `ignoreRules: ["codex-grid-background"]` |
| `all-caps-body` ×2 | about.html, the section index links "How a place is chosen for an article" (36 chars) and "How a place's brightness is decided" (35) | True positive by the rule's character count. These are navigation labels in the Uppercase Ledger register (mono 500 11px, 0.08em), not prose | Yes in substance. The scope is too wide, though: `value: "*"` on the whole file would also hide a future all-caps prose block on about.html (see P3) |

## Executive Summary
- Audit Health Score: **17/20 (Good)**, up from 14/20 this morning.
- Issues: **P0: 0 · P1: 0 · P2: 1 · P3: 6**
- **Morning findings:** of the 12, 10 are fixed and 2 are partly fixed (P3 doc drift, P3 names). None is still fully open. Both P1s are fixed and measured.
- **Top issues now:**
  1. **[P2]** Keyboard focus can land on a video card the strip does not scroll into view (style.css:1378-1387, `scroll-snap-type: x proximity`).
  2. **[P3]** The video title's two-line clamp shows the top of a third line inside each card (style.css:1440-1447 in a `1fr` grid row).
  3. **[P3]** A story's time span across midnight reads backwards: "14:30–14:15 UTC" (panel.ts:119-125).
  4. **[P3]** On phones, the `::after` hit areas on bordered buttons reach 42 px, not the 44 px the comment intends, and the article play square reaches 34 px.
- **Next steps:**
  - `/impeccable harden` for the video strip's focus.
  - `/impeccable polish` for the clamp, the touch hit areas and the doc drift.
  - `/impeccable clarify` for the time span.

## Since the morning audit

| # | Morning finding | Status | Evidence (this run) |
|---|---|---|---|
| 1 | [P1] Inversion flash repeats above 3/s when scrubbing across live | **Fixed** (1d289d6) | replay.ts:69-80: a 1000 ms gate, skipped under reduced motion. `go()` marks only discrete events (replay.ts:300-307). See "Inversion flash rate" below |
| 2 | [P1] Totals sentence gated on the MapLibre chunk; heat.json fetched late | **Fixed** (29668af) | main.ts:14-15 calls `loadHeat()` and then `import('./map')`. index.html:27 starts `fetch('data/heat.json')` in the head and data.ts:113-120 takes it over. Both Source Sans 3 and Azeret Mono are preloaded. See "Load order" below |
| 3 | [P2] PLAY prefetches the whole day (99 files) | **Fixed** (eed8ca9) | `PREFETCH_AHEAD = 12`, concurrency 3, and nothing starts after pause (replay.ts:334-353). See "Replay prefetch" below |
| 4 | [P2] Focus rings clipped inside the Signals column | **Fixed** (0295c8e) | style.css:793-799 sets `-2px` inside `.col-signals`, `.col-replay` and `.panel` on wide screens, and `-3px` on signal heads. At 1280 and 1440, 0 stops were clipped in any of the four tours (signals 20 stops, open signal 12, replay 14, panel 70), including OPEN (`-2px`, [1124,506,102,28]). The new video-strip issue is a different case (P2 below) |
| 5 | [P2] No `<main>` landmark | **Fixed** | index.html:53 `<main class="main">` (`display: contents`). `main` count is 1 at every width, and the ARIA snapshot shows banner / main / contentinfo. No skip link was added; landmarks plus headings satisfy 2.4.1 |
| 6 | [P2] Phones: only 12 places reachable without the map | **Fixed** | At 390 the filter is visible and 36 px tall. It shows 12 rows at rest; with the query "a" all 100 rows show (`.rank-list:not(.is-filtered)`, style.css:2127) |
| 7 | [P2] Controls below the 28/36 px floor and 44 px touch | **Fixed, with a residual P3** | At 390: CLOSE 66×36 with a hit area to 44 px below it; show-more 104×36; stories-more 166×36; PLAY 65×36; range 358×36; attribution `summary` 28×28; foot link 96×36.4. Desktop `.story-more` is `min-height: 28px`, and `.mode button` is 28 px (36 px on phones) in code. Residual: the hit areas reach 42 px, not 44 (P3) |
| 8 | [P2] Map motion outside the One-Motion rule (label fade, sheet ease) | **Fixed** | map.ts:510 `fadeDuration: 0`; runtime `_fadeDuration` = 0, including under reduced motion. map.ts:631-632 uses `jumpTo`; the measured sheet moves were `[0, 0]` ms |
| 9 | [P2] Hairlines and greys hard-coded | **Fixed** | A grep for `#hex`, `rgb(a)` and `hsl(a)` returns 0 hits in style.css and about.css. tokens.css:51-64 defines `--dim-rank`, `--visited`, `--hairline`, `--hairline-mid`, `--hairline-strong`, `--frame-line`, `--frame-replay` and `--tick`, and the unused `--line`, `--heat`, `--surface`, `--text` and `--font` are gone. Trivial leftovers: tokens.css:77-80 `::selection` writes `#fff`/`#000`, and index.html:115 writes `stroke="#fff"` (DESIGN documents that one) |
| 10 | [P3] Observer ring and other code-vs-doc drift | **Partly fixed** | DESIGN.md now documents the observer's orbit, its 24×40 grid and the filter at 721-1099. Still open: rank columns are `minmax(0,1fr) 36px 36px 26px` (style.css:330), while DESIGN says `30px 28px 22px` |
| 11 | [P3] Accessible names (map, Replay head, recent rows) | **Partly fixed** | Fixed: the canvas is `role=region` "World map of news coverage", and the heads are named "Replay 99/99" and "Signals last 24h". Still open: recent-frames rows are pointer-only (replay.ts:241-252); the range and End are the keyboard equivalent |
| 12 | [P3] Selected rank row truncates its own name | **Fixed** | The selected row puts the name across the full row with the figures beneath ("WASHINGTON" whole in d1280-fp-clip-17.png and d1440-panel.png) |
| – | Pattern: all type in px (the browser's default text-size setting is ignored) | **Unchanged** | 0 `rem` in style.css. Browser zoom still works, so 1.4.4 is met; this is not counted as a finding |
| – | Raw table: about `.back-foot > a` 124×13 on the phone | **Unchanged** | Folded into the P3 touch-target item |

## Detailed Findings by Severity

### P2 Minor

**[P2] Keyboard focus lands on video cards the strip never scrolls into view**
- **Location:**
  - web/src/style.css:1378-1387: `.video-strip { overflow-x: auto; scroll-snap-type: x proximity }`.
  - style.css:1389-1392: `.video { scroll-snap-align: start }`.
- **Category:** Accessibility
- **Measured:** Washington's panel has 8 cards; each was focused in turn at 1440 and at 390.
  - Cards 3, 5 and 7 were left almost entirely outside the strip. At 1440 the card was at x 1380-1540 inside a strip ending at 1400. When card 3 was focused the strip's `scrollLeft` stayed 0: proximity snapping pulled the focus scroll back to the previous snap point.
  - The Tab tours confirm it at 1280, 1440, 900 and 390.
  - On the stacked layouts every card's ring also loses its top edge, because `overflow-x: auto` computes `overflow-y: auto` and the strip has no top padding.
  - Screenshots: vid-1440-focus3.png, vid-390-focus3.png, d1440-fp-clip-17.png.
- **Impact:** A keyboard user presses Enter on a card they cannot see. That starts a video they did not choose, and its title is unreadable.
- **WCAG/Standard:** 2.4.7 Focus Visible (AA); 2.4.11 Focus Not Obscured (Minimum) (AA, WCAG 2.2) in spirit.
- **Recommendation:** Pick one:
  - Drop `scroll-snap-type`.
  - Make it `x mandatory` with `scroll-padding-inline: 0`.
  - On `focusin`, call `card.scrollIntoView({ inline: 'nearest', block: 'nearest' })`.
  - Also give the strip `padding-top: 3px`, or inset the card's ring (`outline-offset: -2px`) on every width.
- **Suggested command:** /impeccable harden

### P3 Polish

**[P3] Video titles show a sliver of a third line**
- **Location:** style.css:1407-1420 (`.video-card` grid `auto 1fr auto`), style.css:1440-1447 (`.video-title` with `-webkit-line-clamp: 2`).
- **Category:** Implementation Integrity
- **Measured:** The `1fr` row stretches the clamped box to about 41 px, against 2 × 16.25 = 32.5 px of text. The top of the third line paints under the ellipsis line ("states, citing flawed data", "federal raid made her feel") in d1280-fp-clip-17.png and vid-390-focus3.png.
- **Impact:** A visible rendering defect in the one bordered container DESIGN allows.
- **Recommendation:** `align-self: start` on `.video-title`, or `max-height: calc(2 * 1.25em)`.
- **Suggested command:** /impeccable polish

**[P3] A story's time span across midnight reads backwards**
- **Location:** web/src/panel.ts:119-125 (`span()` drops the date).
- **Category:** Implementation Integrity
- **Measured:** Washington's first story runs from `first` 2026-10-21T14:30Z to `last` 2026-10-22T14:15Z. The panel prints "14:30–14:15 UTC" (p390-panel.png, d1440-panel.png). Every story in the 24 h window that started before the same clock time yesterday does this.
- **Impact:** The panel looks as if it has an error in a product whose first principle is "every number on screen is explainable".
- **Recommendation:** When the two times fall on different UTC days, mark it, for example "yesterday 14:30 – 14:15 UTC" or "14:30 (−1d) – 14:15 UTC". Or print a duration, for example "over 24 h".
- **Suggested command:** /impeccable clarify

**[P3] Phone hit areas fall 2 px short, plus a few small standalone targets**
- **Location:**
  - style.css:2201-2233: `inset: -4px 0` is applied to the padding box, so a 1 px border costs 1 px at each edge.
  - style.css:1663: `.article-play::after`.
  - about.css:178-187: `.toc a`.
- **Category:** Responsive
- **Measured at 390** (with `elementFromPoint` probes):
  - **36 px buttons with a 1 px border:** `.story-more`, `.stories-more` and `.scrub-play` reach 42 px. A point 3 px below `.story-more` hits `#panel-stories`.
  - **CLOSE** (no border) reaches 44 px below it, as designed.
  - **`.article-play`:** the 20×20 square reaches 34×34, not the 36×36 DESIGN states.
  - **Other small targets:**
    - The attribution toggle is 28×28.
    - The about section index rows are 24 px tall.
    - The about "Back to the map" link is 124×13.
    - The about brand link is 176×32.
    - Rank rows are 37 px tall.
- **Impact:** All of these pass 2.5.8 (AA, 24 px, or the spacing exception). They fall under the 44 px the stylesheet's own comment promises and under 2.5.5 (AAA), on the phone audience's main controls.
- **WCAG/Standard:** 2.5.5 Target Size (AAA). DESIGN.md "add an invisible `::after` hit area to 44px".
- **Recommendation:**
  - Use `inset: -5px -1px` on bordered buttons, and `-9px` on `.article-play`.
  - On phones, give `.toc a` and `.back-foot a` `min-height: 36px`.
- **Suggested command:** /impeccable adapt

**[P3] Focus ring edges cut at scroll edges on the stacked layouts**
- **Location:** style.css:793-799 applies the inset ring only inside `@media (min-width: 1100px)`.
- **Category:** Accessibility
- **Measured:**
  - At 900 and 390, a focused link scrolled to the edge of the drawer or sheet loses its top or bottom ring line by 2-3 px. Examples: `.article-title` at the panel's bottom edge, and `.story-more` at the 390 sheet's bottom.
  - The brand link's top ring line sits above the viewport at y = 0.
  - Screenshots: m900-fp-clip-29.png, p390-fp-clip-13.png, p390-fs-clip-1.png.
- **Impact:** The ring stays three-quarters visible. Low impact, but it is the same pattern DESIGN fixes on wide screens.
- **Recommendation:**
  - Extend the `-2px` inset to `.panel :focus-visible` at every width.
  - Add `scroll-padding-block: 4px` to the panel.
- **Suggested command:** /impeccable harden

**[P3] Recent-frames rows are still pointer-only (carried over)**
- **Location:** web/src/replay.ts:241-252 (a click handler on `<tr>` with no focusable control).
- **Category:** Accessibility
- **Impact:** The rows offer a click shortcut that keyboard users do not get. The range (Arrow keys, End) and `aria-valuetext` are a full equivalent, so this is not a failure.
- **Recommendation:** Put a `<button>` in the FR cell, or leave the rows as they are and document the choice.
- **Suggested command:** /impeccable harden

**[P3] Doc and config drift**
- **Location:** style.css:330; DESIGN.md "Rank rows"; .impeccable/config.json `detector.ignoreValues[0]`.
- **Category:** Implementation Integrity
- **Detail:**
  - The rank grid is `36px 36px 26px` in code and `30px 28px 22px` in DESIGN.md.
  - The `all-caps-body` ignore for about.html uses `value: "*"`. It covers the two index labels today, and it would also silence any future uppercase prose on that page.
- **Recommendation:**
  - Update DESIGN.md to the shipped columns.
  - Narrow the ignore to the two label values, or to the `.toc` context.
- **Suggested command:** /impeccable document

## Patterns & Systemic Issues
- **Scroll containers are where the remaining focus issues live.** The video strip (snap) and the stacked panel (ring offset) both clip or hide focus. Wide screens already have the fix, so carry the same inset ring to every width and stop snapping from overriding focus scroll.
- **The `::after` hit-area pattern ignores borders.** Every bordered control that uses it lands 2 px short. One shared rule (`inset: calc(-4px - 1px) -1px`) would fix all of them.
- **Type is still in px throughout.** This is unchanged from the morning and not a failure (zoom works).
- **Data strings, outside this UI audit:** some region names arrive from the snapshot already mangled ("Athens, AttikíR, Greece", "Helsinki, EteläUomen LäI, Finland", "Hanoi, Ha N?I, Vietnam, Republic Of" in heat.json). They reach panel titles and rank-row accessible names. This is a follow-up for the ingest, not for the stylesheet.

## Positive Findings
- **Every morning P1 and P2 is closed, with measurements:**
  - 0 inversions while arrowing at the live frame.
  - At most 1 inversion in any second under explicit jumps.
  - 0 inversions under reduced motion.
  - Label fade is 0 ms.
  - The sheet camera moves in 0 ms.
  - A 13-frame prefetch window.
  - The sentence paints in 93 ms with the map chunk delayed 6 s.
- **The critical path is right:**
  - heat.json and both text fonts start at 24-25 ms from the head, in parallel with `main.js`.
  - The map chunk (1,057.9 kB / 283.9 kB gz) and its CSS (71.3 kB / 10.1 kB gz) arrive at 48 ms through `import()`, not render-blocking.
  - The places column (100 rows) and the totals render before MapLibre exists.
- **Contrast is excellent and unchanged:** 21, 7.46 and 4.69:1 for text, and `--faint` is never used for text.
- **The keyboard model is solid at all four widths:**
  - Every stop has a visible `:focus-visible` ring; tours found 0 stops without one.
  - The places list is one tab stop.
  - The panel takes focus on its title.
  - Escape closes the panel and returns focus to the invoking rank row (verified at 1280, 1440, 900 and 390).
- **Semantics:**
  - Landmarks are banner, main, contentinfo and nav "Views"; about.html adds nav "On this page".
  - The heading outline runs H1 > H2 (Signals, Replay, Places on stacked layouts) > H3 (signal slots).
  - The panel is a dialog named after its place.
  - Tone marks are `img` with spoken labels.
  - No duplicate IDs and no unnamed controls.
  - The about page has a clean H1 > 12 H2 outline with a section index.
- **The token system is complete:** 0 raw colour literals in either stylesheet, and DESIGN's named tokens all exist in tokens.css.
- **Zero horizontal overflow** at 1280, 1440, 900 and 390 on both pages, including with the panel open.
- **No console errors or warnings**, in dev or in the built preview.

## Recommended Actions
1. **[P2] `/impeccable harden`**:
   - Make the video strip scroll the focused card into view: drop or replace proximity snap, or add a `focusin` `scrollIntoView`.
   - Give the strip top room for the ring.
   - Extend the inset panel ring to the stacked widths.
2. **[P3] `/impeccable polish`**: stop the video title clamp from leaking a third line (`align-self: start`).
3. **[P3] `/impeccable clarify`**: mark story time spans that cross midnight.
4. **[P3] `/impeccable adapt`**:
   - Correct the `::after` insets for bordered buttons (to 44 px) and `.article-play` (to 36 px).
   - Raise the about index rows and the back link on phones.
5. **[P3] `/impeccable document`**:
   - Record the shipped rank columns in DESIGN.md.
   - Narrow the about.html `all-caps-body` ignore.
6. **`/impeccable polish`**: final pass.

> You can ask me to run these one at a time, all at once, or in any order you prefer.
>
> Re-run `/impeccable audit` after fixes to see your score improve.

---

## Evidence

All files are in C:\Users\acevi\AppData\Local\Temp\claude\C--Users-acevi\d38f4059-a7be-4258-99d0-04915515b0e5\scratchpad\audit2\ (session scratchpad; not kept with the repo).

**Screenshots:**
- **1280:** d1280-home.png, d1280-signal-open.png, d1280-replay.png, d1280-panel.png, d1280-focus-play.png
- **1440:** d1440-home.png, d1440-signal-open.png, d1440-replay.png, d1440-replay-playing.png, d1440-panel.png, d1440-focus-play.png
- **900:** m900-home.png, m900-home-full.png, m900-signal-open.png, m900-panel.png
- **390:** p390-home.png, p390-home-full.png, p390-signal-open.png, p390-panel.png, p390-sheet.png, p390-sheet-tall.png, p390-replay.png, p390-built-map-delayed.png (the sentence and places painted with the map chunk held back)
- **about.html:** about-d1280.png, about-d1440.png, about-m900.png, about-p390.png
- **Video strip focus:** vid-1440-focus3.png, vid-390-focus3.png
- **Focus clipping:** 181 `*-clip-*.png` files, one per focus stop flagged by the clipping check. The ones at 900 and 390 tagged only `body` are artefacts of the check (body overflow propagates to the viewport) and are not findings.

**Raw data:**
- context.txt, detect.json, detect-noconfig.json
- basics.json (styles, colours, landmarks, ARIA snapshots), focus.json and focus-summary.txt (every Tab stop with its ring and clipping), targets.json, motion.json, built.json
- Scripts: run.cjs, vid.cjs, probe.cjs, prefetch.cjs, slowmap.cjs, about.cjs

**Contrast on #000.** Every visible text node was walked; the background is the nearest painted ancestor.

| Colour | Background | Ratio | Where (count at 1440, live / panel open) |
|---|---|---|---|
| #fff | #000 | 21.0 | 35 / 241 nodes: sentence, heads, values, headlines, panel |
| #000 | #fff | 21.0 | current nav item, open signal head, LIVE/REPLAY tags, bar tag |
| #9a9a9a (--muted) | #000 | 7.46 | 418 / 245 nodes, 9-11 px |
| #777 (--dim-rank) | #000 | 4.69 | 396 nodes, only while a place is selected (11 px/400, passes AA) |
| about.html: #fff / #9a9a9a | #000 | 21.0 / 7.46 | 80 / 12 nodes |

`--faint` (#5c5c5c) was found on 0 text nodes. Visited links (`--visited` #c4c4c4, 12.0:1 by calculation) were not exercised.

**Inversion flash rate** (1440, Replay column, MutationObserver on `html.invert`):

| Input | Inversions | Max in any 1 s |
|---|---|---|
| ArrowLeft/ArrowRight alternating at the live frame, 24 presses over ~1.3 s | 0 | 0 |
| ArrowLeft then End, 12 cycles over ~1.2 s | 2 (at 0 and 1032 ms) | 1 |
| Pointer drag jitter at the right edge of the bars, 20 moves over 1 s | 0 | 0 |
| Clicks alternating an earlier bar and the last bar, 20 over ~1 s | 0 | 0 |
| PLAY pressed once | 1 | 1 |
| Reduced motion: PLAY, pause, ArrowLeft, End | 0 | 0 |

**Reduced motion** (`reducedMotion: 'reduce'`):
- `document.getAnimations()` returns `[]`.
- Both rings sit at `matrix(1,0,0,1,12,0)`.
- `fadeDuration` is 0.
- Nothing animates.

**Replay prefetch** (fresh page, PLAY from live, which restarts at frame 0):
- In 3 s, 31 history files were requested: 13 within 96 ms (frame 0 plus 12 ahead), then one per step at about 165 ms. The playhead was at frame 18 of 99.
- 0 requests in the 2 s after pause.
- Throttled to 200 kB/s with 150 ms latency: 7 requests in 3 s.
- Morning figure: all 99 files within 1.5 s.

**Phone 390×844 targets** (touch emulated). The `::after` column is what the CSS declares; the 1 px border makes it 2 px less for bordered buttons, as the probes confirmed:

| Element | Size (px) | Count | `::after` (declared → effective) | Under 44 |
|---|---|---|---|---|
| nav items (Signals, Places, Replay, Method) | 69.5–77.8 × 36 | 4 | – | yes (height) |
| #places-col-filter | 358 × 36 | 1 | – | yes (height) |
| .rank-row | 358 × 37 (selected 61) | 12 | – | yes (height) |
| summary.maplibregl-ctrl-attrib-button | 28 × 28 | 1 | – | yes |
| attribution "Method" link (inline) | 44.2 × 13 | 1 | – | yes (inline) |
| #quake-toggle | 86.2 × 36 | 1 | – | yes (height) |
| .signal-toggle | 358 × 36 | 4 | – | yes (height) |
| a.story-link (signal headline) | 345 × 44.2–66.3 | 4 | – | no |
| .signal-open | 102.3 × 36 | 1 | – | yes (height) |
| #bars (pointer scrub) | 358 × 120 | 1 | – | no |
| #scrub-range | 358 × 36 | 1 | – | yes (height) |
| #scrub-play | 65 × 36 | 1 | 65 × 44 → 42 | 2 px short |
| #recent tr (pointer only) | 358 × 16 | 8 | – | yes |
| a.foot-link | 96.4 × 36.4 | 1 | – | yes (height) |
| #sheet-handle | 390 × 36 | 1 | – | yes (height) |
| #panel-close | 66.3 × 36 | 1 | 66 × 44 (below only) | no |
| .story-more | 103.9 × 36 | 3 | 104 × 44 → 42 | 2 px short |
| .stories-more | 166.4 × 36 | 1 | 166 × 44 → 42 | 2 px short |
| .article-play | 20 × 20 | 7 | 36 × 36 → 34 | yes |
| a.article-title | 317–358 × 18.9–56.7 | 59 | – | mostly (single-line rows; the spacing exception holds) |
| .video-card | 160 × 96 | 8 | – | no |
| about: a.brand / a.nav-item | 176 × 32 / 45 × 36 | 2 | – | yes (height) |
| about: .toc a | 48–289 × 24 | 12 | – | yes |
| about: inline prose links | 95–323 × 24–50 | 3 | – | inline |
| about: Back to the map | 124 × 13 | 1 | – | yes |

**Focus tours** (Tab from the top; ring = `outline-offset` plus width, tested against every clipping ancestor and the viewport):

| Width | Tour | Stops | Clipped | Without a visible ring |
|---|---|---|---|---|
| 1280 / 1440 | index, Signals column | 20 | 0 | 0 |
| 1280 / 1440 | open signal (OPEN included) | 12 | 0 | 0 |
| 1280 / 1440 | Replay column (range, PLAY) | 14 | 0 | 0 |
| 1280 / 1440 | panel from title | 70 | 3 (video cards 3, 5, 7; P2) | 0 |
| 900 | index / open signal | 23 / 12 | brand top at the viewport only (other hits are `body` artefacts) | 0 |
| 900 | panel | 70 | video strip top on all cards, cards 3/5/7 out of view, 4 article links at the drawer's bottom edge | 0 |
| 390 | index / open signal | 23 / 12 | brand top, foot link bottom at the viewport (2-3 px) | 0 |
| 390 | panel | 70 | as at 900, plus `.story-more` at the sheet's bottom | 0 |
| all | about.html | 19 | 0 | 0 |

**Horizontal overflow** (scrollWidth / innerWidth; identical with the panel open):

| Page | 1280 | 1440 | 900 | 390 |
|---|---|---|---|---|
| index.html | 1280 / 1280 | 1440 / 1440 | 900 / 900 | 390 / 390 |
| about.html | 1280 / 1280 | 1440 / 1440 | 900 / 900 | 390 / 390 |

**Landmarks and names (index.html):**
- **Landmarks:** banner, nav "Views", main (`display: contents`), region "Places", region "World map of news coverage" (the canvas, `tabindex=0`), region "Signals", region "Replay", dialog "<place>" (when open), contentinfo.
- **Headings:**
  - H1 is the sentence.
  - H2: "Signals last 24h" and "Replay 99/99". "Places" is visible only below 1100 px; on wide screens it is hidden and still labels the region.
  - H3: the six signal slots ("Loudest signal Paris").
  - In the panel: H2 is the place, H3 are the sections, H4 are the stories.

**Built bundle** (`vite build --outDir <scratch>/dist`, vite 8.3.4):

| Asset | Size | Gzip | Loaded |
|---|---|---|---|
| map-B-GSTAtQ.js (MapLibre + map.ts) | 1,057.9 kB | 283.9 kB | `import()` from main; not modulepreloaded in the HTML |
| maplibre-gl-worker-Bao9m4Dz.js | 518.7 kB | 146.6 kB | worker, at map start (130 ms in preview) |
| h3-js.es-CVrS-xGd.js | 203.3 kB | 61.6 kB | lazy, first selection |
| map-qvkd0SPb.css | 71.3 kB | 10.1 kB | with the map chunk, not in the head |
| main-DsM2PTBT.js | 30.4 kB | 11.5 kB | entry |
| main-DV3uoUXg.css | 30.5 kB | 6.8 kB | blocking (the only blocking stylesheet) |
| preload-helper-D34CRio6.js | 6.8 kB | 2.9 kB | modulepreloaded |
| clip-kpd4WA51.js / clip-hMlV7H3U.css | 10.9 / 8.1 kB | 4.6 / 2.2 kB | clip only |
| about-DGlhxjvM.css | 5.0 kB | 1.7 kB | about only |
| index.html / about.html | 14.4 / 15.4 kB | 4.0 / 5.7 kB | |
| data/heat.json | 530.6 kB | 117.0 kB | `fetch` from an inline head script, 25 ms |
| data/history | 102 files, 14 MB raw | | 13-frame window on PLAY |

**Load order** (built, `vite preview` on :5174, 1440, no throttling):

| Time | Request |
|---|---|
| 8 ms | index.html |
| 24 ms | both preloaded fonts |
| 25 ms | main.js, preload-helper, main.css, heat.json |
| 48 ms | map.js + map.css (through `import()`) |
| 66 ms | Silkscreen |
| 130 ms | worker |
| 198 ms | countries.json |
| 316 ms | broadcast.json, history/index.json |

The sentence painted at 174 ms. With the map chunk held back 6 s, the sentence and 100 place rows painted at 93 ms; the canvas arrived at 6.1 s. heat.json was requested once (no duplicate).

**Style sweep** (all elements and `::before` / `::after`, all widths, both pages):
- 0 `transition`.
- 0 `will-change`.
- `filter`: only `html.invert` (style.css:51-53), and only for one frame.
- 0 `backdrop-filter`.
- 0 `box-shadow`.
- 0 non-zero `border-radius`.

**Colour literals:**
- style.css and about.css: 0. The one `#000`/`#fff` match is in style.css:3, a comment.
- tokens.css:77-80 `::selection` uses `#fff` / `#000`.
- index.html:115 `stroke="#fff"`.
- map.ts map-plate constants, as documented in DESIGN.md.
