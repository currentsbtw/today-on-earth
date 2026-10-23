---
name: Today On Earth
description: A world map with one flat white dot for every place the news is pointing at, recorded as a pure black-and-white data field.
colors:
  ink: "#000"
  white: "#fff"
  muted: "#9a9a9a"
  faint: "#5c5c5c"
  rule: "#333"
  dim-rank: "#777"
  visited: "#c4c4c4"
  hairline: "rgba(255, 255, 255, 0.18)"
  hairline-mid: "rgba(255, 255, 255, 0.35)"
  hairline-strong: "rgba(255, 255, 255, 0.4)"
  frame-line: "rgba(255, 255, 255, 0.25)"
  frame-replay: "rgba(255, 255, 255, 0.5)"
  tick: "rgba(255, 255, 255, 0.6)"
  map-ocean: "#000000"
  map-land: "#0d0d0d"
  map-border: "#2f2f2f"
  map-admin: "#3a3a3a"
  map-heat: "#ffffff"
typography:
  display:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "clamp(40px, 3.9vw, 72px)"
    fontWeight: 600
    lineHeight: 1.06
    letterSpacing: "-0.012em"
  headline:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.35
  body:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Azeret Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.1em"
  data:
    fontFamily: "Azeret Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.06em"
  figure:
    fontFamily: "Azeret Mono, ui-monospace, monospace"
    fontSize: "22px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.02em"
  wordmark:
    fontFamily: "Silkscreen, monospace"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.02em"
  headlinePhone:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.1
  displayMid:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "clamp(28px, 5vw, 44px)"
    fontWeight: 600
    lineHeight: 1.1
  titleArticle:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.35
  titleCompact:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.25
  figureFoot:
    fontFamily: "Azeret Mono, ui-monospace, monospace"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1
  figureCount:
    fontFamily: "Azeret Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1
  index:
    fontFamily: "Azeret Mono, ui-monospace, monospace"
    fontSize: "9px"
    fontWeight: 400
    lineHeight: 1
rounded:
  none: "0"
spacing:
  dot: "8px"
  hair: "1px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  gutter: "28px"
  margin: "36px"
  tick: "64px"
  topline: "64px"
components:
  nav-item:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "28px"
  nav-item-active:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
  signal-head:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 6px"
    height: "28px"
  signal-head-open:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
  button-outline:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "28px"
  button-outline-pressed:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
  input-filter:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    typography: "{typography.data}"
    rounded: "{rounded.none}"
    padding: "0 8px"
    height: "28px"
  chip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    typography: "{typography.data}"
    rounded: "{rounded.none}"
    padding: "2px 5px"
  col-head:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    padding: "6px 0"
  tooltip:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.data}"
    rounded: "{rounded.none}"
    padding: "4px 6px"
  tag-inverted:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    padding: "1px 4px"
  tag-outline:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    padding: "1px 4px"
  side-stamp:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.muted}"
    typography: "{typography.data}"
    padding: "0 0 10px"
  video-card:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    rounded: "{rounded.none}"
    padding: "7px 8px"
    width: "160px"
    height: "96px"
---

# Design System: Today On Earth

## Overview

**Creative North Star: "Datamatics Field"**

The product is a measurement, and the surface is built to look like one. The canvas is pure black with an 8px dot grid in its margins; the only light on the page is the data: the map plate carries one flat white dot per place, sized by article volume, and every number, label and control is set in a monospaced face at data density. There is no colour anywhere (the amber heat of the previous world was rejected and does not return), no rounded corner, no shadow, no gradient used as decoration, and no eased motion: a state is either on or off. The mark's ring steps across its band in a continuous orbit, and the whole frame inverts for one painted frame when the map returns to live or replay starts; nothing else moves.

Two voices share the page. Azeret Mono carries the chrome: the top line, the ranked places column, the bar field, the panel's count rows, the column totals, the foot's source line, the map labels. Source Sans 3 is reserved for what a person reads as prose: the one large sentence above the map, panel titles, story headlines, the methodology page, and a signal's fixed sentence. Silkscreen appears once, as the wordmark beside the 24x24 one-bit globe, whose open band carries a ringed dot. The one-bit pixel observer in the bottom-right corner (the mark standing on a body) and the crisp-edged pixel icons (play, pause, close, quake, the attribution "i") are drawn as inline SVG on integer grids, never as icon-font glyphs.

Density is high and the hierarchy is carried by three things only: white versus grey text, a 1px rule versus none, and a few fixed type sizes. Depth is never implied; a surface is either black or inverted to white.

**Key Characteristics:**
- Chrome, marks and type in #000 and #fff; greys only inside the map plate and the muted text steps.
- Azeret Mono 11px uppercase with 0.06-0.1em tracking for every label, control and figure; Source Sans 3 for every sentence a person reads.
- 8px dot grid on the body and the panel ground; text sits on solid black blocks so the grid never runs through a glyph.
- Hairlines (1px, solid white or a white alpha) are the only separators; no cards, no fills.
- Stepped motion: states switch in one step; the one authored motion is the mark's ring orbiting its band in whole-pixel steps (on the mark and on the observer's head), and the only other "animation" is a one-frame full-page inversion.
- Pixel marks: the globe (24-grid), the lockup (128-grid), the observer (24x40), and every icon are crispEdges SVG on an integer grid, drawn at whole multiples of that grid.

## Colors

Black, white, and a short ladder of greys for secondary text and strips; chroma is zero everywhere.

### Primary
- **Ink** (`{colors.ink}`): the ground of every page, panel, band and control. Every text block declares it as a background so the dot grid never crosses a glyph.
- **White** (`{colors.white}`): the only foreground. Primary text, hairline rules at full strength, the map's dots, selection fills. Active nav items, the open signal's head, pressed buttons, the current table row and the REPLAY tags invert to black-on-white; the LIVE tag in the right column's stamp is the one tag that stays black with a 1px solid white border, so live reads as the rest state and replay as the inverted one.

### Neutral
- **Muted** (`{colors.muted}`): readable secondary text (7.0:1 on black): the snapshot line, count labels, recent-frames headers, meta rows, placeholders, attribution, unselected places.
- **Dim Rank** (`{colors.dim-rank}`): one step below muted (4.7:1), used only on unselected places while a selection exists.
- **Faint** (`{colors.faint}`): decorative strips and inactive marks only: bars after the current frame, the tone baseline, unselected rank strips during a selection, scrollbar thumbs. Never text that must be read.
- **Rule** (`{colors.rule}`): quiet hairlines between repeated entries (count rows, articles, definitions, the scroll edge of the places list).
- **Visited** (`{colors.visited}`): visited headline links.
- **Hairline / Hairline Mid / Hairline Strong** (white at 0.18, 0.35, 0.4 alpha): the dot grid; the scrub track and filter borders (0.35); outline-button and chip borders and the story's left rule (0.4). The map frame edge is white at 0.25 (Frame Line), dashed at 0.5 in replay (Frame Replay), and its ticks are at 0.6 (Tick). Every one of these, with Dim Rank and Visited, is a token in tokens.css; no stylesheet writes a white alpha or a grey literally. Hover lifts a 0.4 border to solid white.

### Map plate
- **Map Ocean**, **Map Land**, **Map Border**, **Map Admin**, **Map Heat** (`{colors.map-ocean}`, `{colors.map-land}`, `{colors.map-border}`, `{colors.map-admin}`, `{colors.map-heat}`): the only place greys are used as fills. Land is near-black (#0d0d0d) and reads by its coastlines, which are drawn by the same #2f2f2f line as the country borders; admin-1 lines (zoom 3.5 and up) are one step lighter so a thinner line stays visible. Map Heat is the white of every mark: the coverage dots (full white, with the two smallest steps at 0.5 and 0.7 opacity so they read as grey), the quake rings, the selected cell's outline, reticle and tag. Base labels are white at 0.8 / 0.56 alpha over a black halo. These constants live in `web/src/map.ts` because MapLibre needs literal colours before any stylesheet applies.

### Named Rules
**The Two-Ink Rule.** Chrome, marks and type use #000 and #fff only. Grey is allowed in exactly two places: the map plate's land and borders, and the text hierarchy's muted steps (#9a9a9a, #777, #5c5c5c, #333). No other grey and no hue may be introduced.

**The Inversion Rule.** Selection, activation and the pressed state are expressed by swapping ink and white (`background: #fff; color: #000`), never by tint, opacity or a second colour. One painted frame of `filter: invert(1)` on the root marks a snapshot change: replay starting, or the map returning to live by playback or by an explicit jump (End, the last row, the last bar, a link); never scrubbing, never more than once a second, and skipped under reduced motion.

**The Faint-Is-Not-Text Rule.** #5c5c5c appears only on strips, bars and baselines. Text drops no lower than #777.

**The Flat-Mark Rule.** A map mark is a solid white circle with a hard edge (`circle-blur: 0`) and a black hairline around it. Volume is encoded by stepped radius and stepped opacity, never by blur, a heatmap or a glow. Before the map is up, the same marks are drawn on a plain canvas in the map's first camera (the pre-paint, `web/src/prepaint.ts`, from the constants in `web/src/projection.ts`); it is removed in one step on the map's first frame with the marks, so a change to the marks changes both.

## Typography

**Display Font:** Source Sans 3 (with system-ui, sans-serif), variable 400-600, self-hosted
**Body Font:** Source Sans 3
**Label/Mono Font:** Azeret Mono (with ui-monospace, monospace), variable 400-500, self-hosted
**Wordmark Font:** Silkscreen (with monospace), 400 only, self-hosted

**Character:** A measuring instrument with one humanist voice. Mono at 11px carries everything numeric and operational, uppercase with wide tracking; Source Sans 3 appears only where there is a sentence to read, so its size alone signals "this is the prose". `font-variant-numeric: tabular-nums` is set on the map body and the clip frame so columns of figures align.

### Hierarchy
- **Display** (600, `clamp(40px, 3.9vw, 72px)`, 1.06, -0.012em): the single sentence of totals above the map, max-width 15.5em. `clamp(28px, 5vw, 44px)` between 721 and 1099px; 28px/1.1 on phones. The about page's h1 uses the same voice at `clamp(36px, 5vw, 56px)`.
- **Headline** (600, 28px, 1.1, -0.01em): the panel title (a place name); 24px on phones. The about page's h2 is 600 24px/1.2.
- **Title** (400, 16px, 1.35): story headlines in the panel and a signal's fixed sentence (16px/1.4). Article titles are 14px/1.35; video titles 13px/1.25. A signal's outlet headline is the one bold line at 600 17px/1.3, clamped to two lines while the entry is closed.
- **Body** (400, 17px, 1.55): the methodology page's reading text in a 68ch measure. The map page has no body prose.
- **Label** (500, 11px, 1, 0.1em, uppercase): column heads, nav items, panel section heads, button words, the CLOSE control, foot captions. Signal slot names on the clip use 0.14em.
- **Data** (400, 11px, 1.3-1.5, 0.02-0.08em, usually uppercase): rank rows, count rows, meta lines, status, attribution, placeholders, the under-map line. Tracking narrows as the string gets longer: 0.02em for domain names and rows, 0.06em for short labels, 0.1em for the shortest.
- **Figure** (500, 22px, 1, 0.02em): the UTC clock. The foot's source figure (GDELT 2.0) uses the same face at 500 15px; the panel's count values at 12px; bar tags and frame indices at 9px.
- **Wordmark** (Silkscreen 400, 16px, 1, 0.02em, uppercase): TODAY ON EARTH 12px right of the 48px globe (the 24-grid at 2x); 13px with a 10px gap and a 24px globe (1x) on phones. The share image sets the same face as a wordmark line above the sentence.

### Named Rules
**The Mono-For-Data Rule.** Any number, unit, timestamp, column head, control word or meta line is Azeret Mono. Source Sans 3 is only for a sentence, a title or a headline. A value never appears in the humanist face.

**The One-Size Chrome Rule.** Chrome type is 11px. Emphasis comes from weight (400 to 500), colour (muted to white) or inversion, not from size; the only chrome sizes outside 11px are the 22px clock, the 15px foot source figure, the 12px count values and the 9px bar annotations.

**The Uppercase Ledger Rule.** Mono labels are uppercase with letter-spacing between 0.06em and 0.1em. Mono content that must be read verbatim (domain names, names in tooltips) keeps its case and tightens to 0.02-0.03em.

**The Day-Crossing Rule.** A time never hides a midnight. One helper (`utcDayTime`, format.ts) prints "14:30", or "WED 14:30" (three-letter weekday, uppercase) when the time is on another UTC day than its reference. A story span whose last article falls on a later UTC day than its first names both days ("WED 14:30 – THU 14:15 UTC", spaced en dash); within one day it stays "01:15–04:30 UTC". The replay stamp, the clock's REPLAY line and the PLAY readout name the weekday when the frame is not on today's UTC day; the recent-frames table names it where its rows change day.

## Layout

The desktop shell (1100px and up) is a fixed-height CSS grid filling `100dvh`, padded `0 36px 14px`, with a 28px column gap: a 200px left column (ranked places, closed by the totals block), a fluid centre (the sentence and the map frame) and a right column `#side` of 280px that widens to 360px while a place is selected. The right column is a flex column: the live stamp row on top (10px below it), then exactly one of two internally scrolling sections, Signals (`#signals-col`, the default, `data-view="signals"`, no hash; `#signals` accepted) or Replay (`#replay-col`, `#replay`; a `#t=` frame stamp implies it), each closed at the scroll edge by a `--rule` hairline, and the observer pinned to the bottom: the figure stands on a 1px white hairline 12px in from the right, with its label at the left over the same hairline (mono 400 11px 0.08em uppercase, 6px above it). The label reads OBSERVERS · N while the presence Worker answers (N = browsers that pinged it in the last 75 s, grouped like every count) and plain OBSERVERS when the counter is not configured or cannot be reached; a new value is a text swap, with no transition. The label stays exposed to assistive technology; only the figure is `aria-hidden`. The replay frame number is no longer shown there (the Replay head's `#field-count` carries it). On wide screens shorter than 880px the observer steps down to its 1x figure (24x40) with 12px above it, and the signals list tightens (4px above the list, 2px between entries, 2px above each headline), so all six signal entries, the sixth slot's reason included, fit without scrolling at 1280x800. At 1440x900 the whole Signals list fits at 2x. A selected place hides both sections and the observer and the panel takes the column; CLOSE restores whichever section was open. Rows are a 64px top line (wordmark left, nav centred, clock right), the sentence row, the main row, and the foot. The foot carries only the source and the method link; every figure is printed once elsewhere: articles and places in the sentence, the rest in the left column's totals block. The body does not scroll; the places list and the right column scroll internally with a thin 6px scrollbar and a `--rule` hairline at the scroll edge. The sentence, the places column, the map and the right column sit in one `<main>` (`display: contents`, so they stay on the shell grid); the top line is the header and the foot the footer.

The map frame has a 1px white (0.25 alpha) border and tick marks every 64px on all four edges, drawn outside the frame as 6px-long hairlines at 0.6 alpha. In replay the border turns dashed at 0.5 alpha. The status line sits 10px inside the top-left; the quake toggle 10px inside the bottom-left; MapLibre's attribution is restyled to the mono register in the bottom-right: a 28x28 square toggle with the pixel "i", and the line Natural Earth · GDELT · USGS · Method, its link worded like the nav.

The spacing rhythm is small integers: 4px between nav items and chips; 8px between a filter and its list, between video cards, for panel paragraphs; 12-14px between the panel's title and its counts and between stories; 16-24px before a section head (`.panel-section` sits 24px below the previous block); 28px between columns; 36px page margins. The 8px dot grid underlies all of it.

Between 721px and 1099px the shell becomes one scrolling column with 24px margins: brand and clock on the top line, the sentence, the nav (now four items, PLACES included, pulled 10px into the margin), the map at `max(52svh, 100svh - 300px)`, then `#side` dissolves (`display: contents`) into stacked sections 28px apart, each under its own mono head: SIGNALS (the same folding entries as on wide screens), PLACES (the filter, a PLACE / ART / OUT / CTY head over each of the grid's three columns, the rank rows as a three-column grid of the first 18, or of every match while the filter has a query, then the totals block, so outlets and outlet countries appear once on every width), REPLAY, the observer, then the foot, which closes the page on one row (source left, METHOD right) at every width. The stamp row is hidden here; the clock carries the time. The panel is fixed to the right edge at `min(400px, 100%)` behind a 1px white left border.

At 720px and below margins drop to 16px; the clock date hides and the time drops to 15px; nav items grow to 36px tall; the sentence is 28px; the places filter stays (36px tall); places render in two columns of 12, each under its own PLACE / ART / OUT / CTY head (one column and one head at 420px and below), and every match shows while the filter has a query; the same stacked order (map, Signals, Places, Replay, observer, foot) holds. The bottom sheet serves only a selected place: 55svh with a 1px white top border, a 36px sticky handle (a 24x2px white bar) and one alternative height, `100svh - 12px`; the quake toggle and attribution step aside while it is open. The map keeps `max(52svh, 100svh - 236px)`.

The about page is a single reading column, `68ch + 64px` wide, centred, 24px below the same 64px top line, bounded by 1px white rules top and bottom, padded `40px 32px 56px` (28px 16px 28px on phones). Its top line carries the mark and one nav item, MAP (36px tall on phones); the page closes with the BACK TO THE MAP link under a 1px white rule: a 24px box whose extra 12px sits above the words, so they stay 12px under the rule (36px on phones, the further 12px below the words, taken back from the doc's bottom padding). Under the h1 sits a section index: one link per line to each h2, mono 500 11px uppercase 0.08em on a 12px line in muted (white on hover and focus), each link a 28px box, closed by a 1px white rule. At 720px and below the links stand in two balanced columns, read down the first column and then the second, each a 36px box, and a long label wraps (balanced) to a second line inside its box. The two longest labels carry `data-impeccable-ignore="all-caps-body"` under the Uppercase Ledger Rule. The h2s keep 24px of scroll margin. The clip frame scales every measure from `--u` (1% of the shorter side): 7u side margins, a 1px edge rule with 25 ticks of `max(5px, 1.1u)`, the wordmark at 4.2u, the hook caption and the time-lapse's article total at 7u, the card's place name and headline at 6u, counts at 3.6u over 2.04u labels, the map's callout tag at 2.04u.

## Elevation & Depth

There are no shadows and no tonal layering. Every surface is flat black; nothing floats. Overlays (the status line, the tooltip, the quake toggle, the sheet) sit on the map by stacking order alone and declare a solid black or white background so they read as blocks, not as lifted planes. The one thing that ever changes the page's depth is the inversion frame, which flips the whole document for a single paint.

### Named Rules
**The No-Shadow Rule.** `box-shadow` appears in the stylesheets only to cancel MapLibre's focus glow. Focus is a 1px solid white outline offset 2px (inset where a container clips).

## Motion

Almost nothing moves. There is no `transition` anywhere in the build. Two things are animated, and both are stepped: the brand mark's ring orbit (on the mark and on the observer's head), and the one-frame inversion on a snapshot change (replay starting or the map returning to live, at most once a second).

**The orbit.** It runs in two places, the mark on every page that carries it (the map, the method page) and the observer's head on the map page, under one selector: `.globe .ring, .observer-figure .ring` runs `animation: mark-ring 2s steps(30, end) infinite`, from `translateX(-6px)` to `translateX(24px)` in SVG units: the 6x6 ringed dot starts fully hidden behind the sphere's left edge, steps one grid column per frame (30 columns over 2s, about 67ms a step), crosses the open band and passes behind the right edge, then re-enters from the left. A `clipPath` on the band (`M1 8h22v8H1z`) keeps it inside the globe, so it is never seen outside the band and the loop point is hidden (both the first and the last frame are behind the sphere). It runs for as long as the page is open and never reacts to interaction. Under `prefers-reduced-motion: reduce` the animation is removed and the ring sits at rest at columns 12-17 from the first paint, in both places. The observer's head clips its ring to its own band (`clipPath#observer-band`, the same `M1 8h22v8H1z`), so the two orbits are one motion on the same keyframes and timing. The clip frames use the static mark (ring baked into the path) because the renderer captures stills. The clip itself moves only between those stills: it is a 30 fps timeline the renderer steps one frame at a time, its camera flights sampling MapLibre's flyTo path and its dots, clock and totals interpolated between the day's snapshots (see Clip frame); no transition or CSS animation runs inside it.

### Named Rules
**The One-Motion Rule.** The mark's ring orbit, repeated on the observer's head, is the only authored motion in the product. No other element animates in, fades, slides or eases; a new element is simply painted. Any future motion must be `steps()`, whole-pixel, and removed under reduced motion. The camera never eases on its own (the clip's eased flights are a sequence of stills, one camera per frame): the phone sheet sets its padding and centres the place in one step (`jumpTo`), and the live map's labels appear and go in one step (`fadeDuration: 0`, as on the clip map).

**The Stepped-Motion Rule.** Motion is a sequence of integer states, never an interpolation: `steps(n, end)` for the ring, one painted frame for the inversion. No easing curve appears in the build.

## Shapes

Every corner is square (`border-radius: 0` is set on buttons, inputs, sliders and MapLibre's attribution button to cancel user-agent rounding). Borders are 1px hairlines in white or white alpha; they are the only outline a control has. Strips are repeated 1px bars (`repeating-linear-gradient`, 1px on / 2px off; 2px on / 1px off when selected). The slider thumb is a 7x11px white rectangle on a 1px track. Bullets on the about page are 10x1px white dashes. On the map every mark is a circle: the coverage dots (five fixed radii), the hollow quake rings, the 3px selected-cell reticle; the selected cell itself is its H3 hexagon as a 1px white outline over a 0.06 white fill. Icons and marks are drawn on integer grids with `shape-rendering: crispEdges`: the globe on 24x24 (its ringed dot on 6x6 inside the band, the lockup on 128x128), the observer on 24x40 (its head the 24x24 globe), play on 4x7, pause on 5x7, close on 7x7, quakes on 12x12, the attribution "i" on 3x8.

## Components

### Buttons
Flat, square, one-step. Two registers, both Azeret Mono 500 11px uppercase 0.1em and at least 28px tall (36px at 720px and below for every control: nav, quake toggle, signal heads, OPEN, PLAY, CLOSE, SHOW N MORE, the brightness switch). On phones CLOSE, PLAY, the show-more buttons and the brightness switch add an invisible `::after` hit area to 44px (placed against the padding box, so on bordered controls it is inset `-5px -1px`; `.article-play`'s is `-9px`, a true 36x36), as `.article-play` does; CLOSE's extends only below it, so it never takes the sheet handle's taps.
- **Shape:** square (0).
- **Nav item** (text-only): black on black, `0 10px`, 4px apart; hover underlines with a 4px offset; the current item inverts to black-on-white (`aria-current="true"`). The line reads SIGNALS · REPLAY · METHOD on wide screens; PLACES (`.nav-stacked`) joins between SIGNALS and REPLAY only below 1100px, where the sections stack. On wide screens the current item is the section the right column shows, and no item is current while a selected place covers the column; below 1100px an IntersectionObserver (band 30% to 40% down the viewport) marks the item whose section is crossing the top, and a tap scrolls to the section. The about page's single MAP item uses the same control.
- **Outline button:** 1px border at 0.4 alpha (solid white for the signal's OPEN button and the panel note), black fill, `0 10px`; hover lifts the border to solid white (quake toggle, video card, article play) or inverts entirely (play, "more", OPEN); pressed or playing (`aria-pressed="true"`, `.is-playing`) inverts to black-on-white.
- **Close:** the word plus a 7x7 pixel X, `0 6px`, no border; hover inverts.
- **Focus:** 1px solid white outline, 2px offset; -2px inside the Signals and Replay columns on wide screens and inside the place panel on every width, which also keeps `scroll-padding-block: 33px 4px` (77px 4px on phones) so a focused control clears the sticky CLOSE bar and handle; -2px for the brand on the stacked layouts, where it touches the viewport top (3px of left padding, given back by a -3px margin; the stacked page keeps 4px of scroll padding); -3px for the signal head and the sheet handle; -1px for rank rows.

### Chips
- **Style:** 1px border at 0.4 alpha, no fill, `2px 5px`, mono 400 11px uppercase 0.04em; 4px gaps, wrapping. Used for language and country tags under a story.
- **State:** none; chips are read-only.

### Inputs / Fields
- **Filter input:** 28px tall (36px at 720px and below, where it stays on screen); it searches every place on screen and lists up to 100 matches, largest first, `0 8px`, 1px border at 0.35 alpha, black, mono 400 11px 0.06em; placeholder in muted; native search affordances removed. Focus sets the border to solid white (plus the global outline).
- **Range (scrub):** transparent, 28px tall (36px on phones) as its hit box; the 1px track at 0.35 alpha is centred in it; 7x11px white rectangular thumb.

### Column heads and section heads
A mono 500 11px uppercase 0.1em line with `6px 0` padding and a 1px solid white rule beneath. Used for the places column head, the bar field head, panel sections (OUTLETS, OUTLETS BASED IN, STORIES), the signal head rows (with `0 6px` padding and a 28px minimum height) and the about page's definition labels. A head may carry a short note at its right: the Replay head's frame count in white, the Signals head's window (LAST 24H) in muted 400. The trend head is the same without the rule, in muted. The totals under the places column and the foot repeat the rule above them. A head with a note at its right names itself from both parts with a space between (`aria-labelledby` on the h2: "Signals last 24h", "Replay 99/99"); its section takes the title word alone.

### Column totals
The block under the places list (`#col-totals`): a 1px white rule, 6px, then definition rows in mono 400 11px/16px uppercase 0.04em, muted label left, white figure right, in a fixed order: PLACES WITH ARTICLES, REPRINTS COLLAPSED, NOT PLACED, OUTLETS, OUTLET COUNTRIES. A row a frame does not carry (reprints on past frames) is left out. It follows the frame on screen like the sentence, and it is the only place outlets and outlet countries are printed for the whole snapshot.

### Rank rows (places column)
A grid `minmax(0,1fr) 36px 36px 26px` with a 4px gap: uppercase name, then three right-aligned figures; a full-width 5px strip of 1px bars below, its length proportional to articles. Rows are muted and hover to white. The selected row grows to 500 13px (12px on phones), turns white, puts its name across the full row with the three figures beneath it in their columns (the name is never cut), gains 1px white rules top and bottom and an 8px strip of 2px bars; while a selection exists every other row drops to #777 with a faint strip. Below 1100px the rows reflow into a 3/2/1-column grid showing the first 18/12, or every match while the filter has a query, with one head row over each grid column.

### Replay section (bar field)
Under a column head reading REPLAY with the frame count ("99/99") at the right, then a muted mono unit line NEW ARTICLES PER SNAPSHOT (`.field-unit`, 22px above the band). 96 bars 1px wide, absolutely positioned across a 120px band; a bar's height is its frame's `added` (the articles new in that step, from the history index) as a share of the day's largest `added`; a frame without a count draws as a 4px dotted stub (1px on, 1px off, `--faint`) that never enters the maximum; bars after the current frame are faint; the current bar is full height. A 500 9px white tag with black text sits 17px above the current bar and states its value: the frame's new articles as "+3,176" ("–" when unknown), since the head already carries the index ("36/99"); muted 9px indices run below. Under it: the range slider, then PLAY (outline button) with the muted readout, the time then the frame's new articles ("WED 23:00 UTC +2,609 NEW", "– NEW" when unknown), and an inverted LIVE tag on the live frame; then the trend head, TREND at the left and "9-FRAME MEAN · MAX 4,703" at the right (the mean's own largest value, rounded; the line is drawn on the bars' scale), over the 9-frame mean of `added`, broken where frames are unknown and a 44px polyline (`stroke: #fff`, 1px, non-scaling) over a 1px dotted baseline, then the recent-frames table, whose last column is NEW (`added`, or "–" when unknown) beside the window total. Its UTC cell carries the weekday where the day changes: on the first row when that row is not on today's UTC day, and on the first row of each new day after it ("WED 22:18", then "THU 00:03"). The stamp, the sentence and the map keep the frame's whole window. With fewer than four snapshots the field is static: bars only, no slider, controls or trend.

### Recent-frames table
Mono 400 11px/16px, a 1px white rule on top; muted 500 uppercase 0.08em headers, muted cells, figures right-aligned, the first two columns left. Rows hover to white; the frame on screen (`.is-on`) inverts to black-on-white at 500.

### Panel (place detail)
Serves one selected place only; there is no Places or Signals panel mode. A black dot-grid column (360px in the shell, replacing the Signals or Replay section below the stamp; a fixed 400px right drawer between 721 and 1099px; a 55svh bottom sheet on phones). A sticky bar with a 1px white rule holds CLOSE at the right; CLOSE returns the column to the section it was showing. The order is the same on every width: the title, one summary line, the stories, then the receipts (count rows, reach line, coverage lists), the videos, and ALL ARTICLES last, so on a phone the first headline sits inside the 55svh peek. The title is Source Sans 3 600 28px. The summary line sits directly under it in the under-map selection line's register (mono 500 11px uppercase 0.06em, white) and is the same text after the place name ("6,740 ARTICLES · 4,510 HEADLINES · HEARD IN 121 OTHER COUNTRIES", one shared helper); the panel note, a 1px white-bordered mono tag, follows it while a past frame is on screen. STORIES, COUNTS, VIDEOS and ALL ARTICLES are section heads 24px below the block before them. Stories show the first three cards; when more exist, a SHOW N MORE STORIES outline button (the SHOW N MORE register, at least 28px tall, 36px on phones) reveals the rest in place in one step and goes away; inside a card the article button reads SHOW N MORE ARTICLES. A place opened from a signal's OPEN leads with that signal's story (matched by the headline's article URL, else by the headline text), moved to first place and tagged above its headline, inside its left rule, FROM SIGNALS · MOST POSITIVE TONE (mono 500 11px uppercase 0.1em, white, 6px above the headline); it counts as one of the three shown, and the permalink carries the slot as `s=<slot id>` beside `c=`, restored on load. When the story is not among the place's stories, there is no tag and no `s=`. Counts are definition rows (ARTICLES, HEADLINES, OUTLETS, OUTLET COUNTRIES, LANGUAGES, HEARD IN; `4px 0`, mono 11px uppercase 0.06em, muted label left, white 12px value right) separated by `--rule` hairlines, the head's white rule as their top edge. A muted mono line follows ("31 REPRINTS COLLAPSED · LAST 2H"). Coverage lists (outlets, countries, languages) are strip rows: key left, count right. Outlets are domain names verbatim; countries and languages are the English name from `Intl.DisplayNames` in uppercase at 0.04em with the ISO code after it in muted ("GREECE · GR", "GREEK · EL"), the code alone when the browser has no name, and UNKNOWN for an empty key; a 1px white strip beneath whose width encodes the count. The flat list's caption ("NEWEST 50 OF 6,740") is a muted mono line under its head.

### Log entries (stories, articles, signals)
- **Story:** 14px above, a 1px left rule at 0.4 alpha with 12px inset; headline in Source Sans 3 400 16px/1.35 (link, no underline until hover, 1px thickness, 3px offset); muted mono source line; muted mono meta line with the counts in white; chips; nested articles.
- **Article:** `9px 0`, a `--rule` hairline above; title in Source Sans 3 400 14px/1.35; meta line in muted mono 0.04em with the first span (outlet) in white; an optional 20x20 play square (1px border at 0.4 alpha, 36x36 hit area) and a tone mark: a 22x7px faint baseline with a 1px white tick.
- **Signal:** an entry that folds, the same component on every width, `0 0 6px` between entries. The head row is a real `<button>` inside the slot's `h3` (`aria-expanded`, `aria-controls` on the body): the slot name at the left and, at the right, the place's short name in muted followed 8px later by a 7x7 crispEdges pixel plus in `currentColor` (a 7px bar and its upright), which drops its upright and reads as a minus while the entry is open; both names mono 500 11px uppercase 0.1em, `0 6px`, a 1px white rule beneath, the full row the hit area, at least 28px tall (36px at 720px and below); hover underlines the slot name. **Closed** (every entry on load): the head, then 4px below it the outlet's headline, the one bold line (Source Sans 3 600 17px/1.3, carrying its `lang`), behind a 1px left rule at 0.4 alpha with 12px inset and clamped to two lines. The headline is not a link: pressing it opens the entry like the head (a pointer target only, so the head stays the entry's one tab stop; hovering it underlines the slot name). Nothing in a closed entry leaves the site. **Open:** pressing the head or the headline opens the entry in place in one step, with no transition, and scrolls it into view (`block: 'nearest'`) so OPEN is never left below the column's edge; the head inverts to black-on-white like the current nav item (its focus ring turns black, inset 3px) and the headline shows in full, followed by the outlet line, which continues the headline's left rule and is the entry's one way out: READ AT THEGAZETTE.COM (mono 500 11px uppercase 0.08em, muted, underlined 1px at a 3px offset, white on hover, at least 28px tall, 36px on phones, a new tab with `rel="noopener"` and `hreflang` set to the article's language; a plain muted outlet line when there is no URL). Then the fixed sentence (Source Sans 3 400 16px/1.4, 10px above), the meta line (only the counts the sentence left out; never the plain outlet-country count, only HEARD IN N OTHER COUNTRIES) and an OPEN outline button with a solid white border, which opens the place with this signal's story first (see Panel). One entry is open at a time: opening another closes the first, pressing the open head closes it, and an open entry stays open across a re-render. An empty slot does not fold: its head is the slot name alone, with its one-line reason in muted mono under it. The clip's signal card keeps the entry's parts in a scanning order of its own, with the slot in plain words and the counts as a ledger row (see Clip frame).

### Video cards
160x96px, 1px border at 0.35 alpha, `7px 8px`, a grid of an 18x18 bordered play glyph, a two-line Source Sans 3 13px title (top-aligned in its row, so the clamp box is exactly two lines and no third shows), and a muted mono source line; hover lifts the border to white. The strip scrolls sideways with no scroll snapping, and a focused card is scrolled fully into it (`scrollIntoView` nearest on `focusin`); its ring is inset 2px like every ring in the panel. The playing card expands to the panel's width and hosts a 16:9 iframe.

### Tooltip and status
- **Tooltip:** white block, black text, `4px 6px`, mono 400 11px 0.03em, max-width 260px, the name in 500 uppercase.
- **Status:** black block at the top-left of the frame, `3px 6px`, mono 400 11px uppercase 0.08em.

### Map marks (coverage dots)
One flat white circle per place on the `cell-dot` layer, no blur, drawn largest-last by article count. The log-scaled weight `w` (0-1, against a fixed maximum so replay and clip frames share one scale) is quantised into five steps at `MARK_STEPS` 0.2 / 0.4 / 0.6 / 0.8. Each step fixes a radius and an opacity: radii `MARK_RADIUS` 0.6 / 0.85 / 1.25 / 1.9 / 2.6px at zoom 0, multiplied by `MARK_ZOOM_SCALE` (1x at zoom 0, 3.5x at zoom 4, 8x at zoom 9); opacities `MARK_OPACITY` 0.5 / 0.7 / 0.85 / 1 / 1. A black hairline (`circle-stroke`, 0.6px at zoom 0 to 1px at zoom 4) separates neighbours in dense regions. The top radius is held small so a cluster stays a field of separate dots rather than a mass. From `w` 0.4 a place carries a mono 10px uppercase 0.08em white label with a 1.2px black halo (the five largest places are labelled at every zoom). Hit targets are invisible circles 4-30px wide depending on weight and zoom. The under-map legend reads "size = volume, not importance" (beside the bar on wide screens; on its own line under the bar, without the separator, at 720px and below; hidden only while the panel narrows the desktop map) and the status hint "Open a dot to see who is covering it". The selection line in the same under-map bar uses `text-wrap: balance`, so it never leaves one word alone on a second line. Quake rings (opt-in) are hollow white 1px rings at 0.9 opacity, radius by magnitude. The map canvas is the page's map landmark (role region), named "World map of news coverage".

### Live stamp
The first row of the right column on wide screens (`#side-stamp`, hidden below 1100px): a muted mono 400 11px 0.06em uppercase line, no wrap, 10px below it. It opens with a tag in mono 500 at `1px 4px`: LIVE as an outline tag (1px solid white border, white on black) followed by the snapshot time ("LIVE 14:27 UTC"), or, while a past frame is on screen, REPLAY as an inverted tag followed by the frame time and index ("REPLAY 05:16 UTC · 38/95"; a frame from another UTC day than today names its weekday, "REPLAY WED 23:00 UTC · 36/99", as the clock's REPLAY line does). It stays above a selected place's panel, so the column always declares which snapshot the page is showing. The snapshot time is printed twice and only twice: the clock's SNAPSHOT line and this stamp (below 1100px, where the stamp is hidden, the clock carries it alone); no section note or foot cell repeats it. The one other place it can appear is the replay controls' own readout beside PLAY, which shows whichever frame is selected (visible on the stacked layouts, where the Replay section is always on the page). The LIVE word inside the replay controls (`.scrub-live`) and the clock's REPLAY word keep the inverted form.

### Signals section
A column head reading SIGNALS with the window at its right ("LAST 24H", `#signals-when`, muted 400, from the broadcast's `windowHours`), then, 6px below the rule, the six signal entries as a list, all closed on load; an empty state is a muted mono line at `8px 0`. On wide screens the Signals and Replay heads sit directly under the stamp's 10px gap.

### Top line and foot
- **Brand:** 48px pixel globe (the 24-grid at 2x) plus Silkscreen wordmark, 12px gap, on a black block; 24px globe (1x), 10px gap on phones. The ring runs its orbit here (see Motion).
- **Clock:** uppercase date in mono 11px 0.1em, the time at 500 22px, a muted SNAPSHOT line beneath; the line swaps to an inverted REPLAY tag while a past frame is shown.
- **Foot:** a 1px white rule above, 10px padding, one row on every width: the source at the left as a figure over a caption (GDELT 2.0 in mono 500 15px over a muted 11px uppercase 0.1em SOURCE · NO EDITING), and a single METHOD link at the right (worded like the nav and the attribution) in muted mono, underlined, white on hover, its box 24px tall (36px on phones), the extra height above the words so they keep the foot's baseline. No totals and no attribution links: the figures live in the sentence and the column totals, and the map corner's attribution carries Natural Earth, GDELT, USGS and a Method link.

### Pixel marks
The globe (24x24), the lockup (128x128), the observer (24x40, rendered 48x80 at the bottom-right of the right column above 720px, 24x40 at 720px and below and on wide screens shorter than 880px; on the clip end card at the mark's multiple, 48x80 on a 540-wide frame and 72x120 at 1080, padded by two of its pixels on a black block) and every icon are inline SVG with `shape-rendering: crispEdges`, filled with `currentColor` or white. Every mark is drawn at a whole multiple of its grid so each source pixel is the same size on screen (the clip snaps the mark and lockup to whole device pixels for the same reason). New marks follow the same grammar: an integer grid (16 or smaller for an icon), one colour, no strokes, no anti-aliasing.

### Brand mark and lockup
Two forms of one drawing, both one-bit.
- **The mark** (`.globe`, source `.impeccable/mocks/logo/lit-24-ring.svg`): a 24x24 globe outline with two meridians and an open equatorial band (rows 8-15 are empty inside the outline), and a 6x6 ringed dot (`M1 0h4v1h-4zM0 1h1v4h-1zM5 1h1v4h-1zM1 5h4v1h-4zM2 2h2v2h-2z`: a 1px ring around a 2x2 dot) resting at columns 12-17, rows 9-14 of the band. In the page it is a `<path>` for the globe, a `clipPath#mark-band` (`M1 8h22v8H1z`), and `<g class="ring">` holding the dot at `translate(0 9)` with `translateX(12px)` applied by CSS; the clip and the mocks use a single static path with the ring baked in. Drawn at 48px on desktop and 24px on phones, always a whole multiple of 24. It is the only mark that moves (see Motion).
- **The lockup** (source `lockup-128-inverted.svg`): the inverted form for icons and share surfaces. A white disc on black, meridians and parallels drawn in black inside it, and the name across the band in 5x7 pixel caps on two lines, "TODAY ON" over "EARTH", on a 128 grid. Drawn at whole multiples of 128: 128 (favicon.svg), 180 (apple-touch-icon, the one non-multiple, a platform size), 256 and 512 on the clip end card, 384 on the share image. It always sits on a solid black block so the dot grid never shows through the disc's gaps.
- **Rule:** the mark is the in-page sign, the lockup is the standalone sign. Neither is ever recoloured, outlined, shadowed, rotated or scaled to a non-integer multiple.
- **The observer** (`.observer-figure`, 24x40): the mark standing on a body. The head is the mark itself on rows 0-23: the same globe path, its own band `clipPath#observer-band` and a `<g class="ring">` that runs the same orbit. The body is on the same 1px grid: a 2x2 neck at columns 11-12, rows 24-25; shoulders across columns 5-18 on row 26; 2px arms at columns 5-6 and 17-18, rows 27-32; an 8x8 torso at columns 8-15, rows 27-34; 3px legs at columns 8-10 and 13-15, rows 35-38; 4px feet on row 39 (columns 7-10 and 13-16). One colour, no strokes. The clip's copy is static: one path, the clip's static mark (ring baked in at columns 12-17, rows 9-14) over the same body.

### Icons and share assets
- **Favicons:** `favicon.svg` is the 128 lockup file verbatim (black rect, white path, crispEdges); `favicon-32.png` and `apple-touch-icon.png` (180) are rasters of the same drawing. No other icon sizes.
- **Share image** (`og.jpg`, 1200x630): black with the dot grid; the lockup at 384px (3x) on a black block at the left; at the right a Silkscreen wordmark line TODAY ON EARTH over a 1px white rule, the sentence "A map of where the world's news is pointing right now." in Source Sans 3 600, and the site address in muted Azeret Mono beneath. `og:image:alt` describes the mark and the sentence. The same image serves `twitter:image` (summary_large_image).

### Place page
One static page per place with 10 or more articles (`place/<cell id>.html`), plus the index `places.html`, both written at build time by `web/scripts/build-places.mjs` from the snapshot (no JavaScript; one inline sheet shared by every generated page). The Read surface's register exactly: the 64px top line with the orbiting mark, the wordmark and one nav item, MAP (36px tall on phones); the `68ch + 64px` column between 1px white rules, padded `40px 32px 56px` (28px 16px 28px on phones), on the dot grid; the self-hosted faces. Order: the place's full name as the h1; one Source Sans 3 20px line (18px on phones) in the fixed voice, "412 articles from 150 outlets in 23 countries and 9 languages, heard in 22 other countries." (the heard clause follows the panel's rule and is left out when the place's own country is unknown); a muted mono SNAPSHOT THU 14:27 UTC line; OPEN ON THE MAP, an outline button in the OPEN register (1px solid white border, mono 500 11px uppercase 0.1em, 28px tall, 36px on phones, inverted on hover) to `../#c=<id>`. Then section heads in the panel's register (mono 500 11px uppercase 0.1em over a 1px white rule, 40px above): STORIES, each the story component (a 1px left rule at 0.4 alpha, 12px inset, 14px apart) with the outlet's headline in Source Sans 3 400 18px/1.35 (17px on phones) linked to the article in a new tab (`rel="noopener"`, `hreflang`, `lang` on a headline in another language; no underline until hover), the outlet domain in muted mono uppercase 0.08em, a white mono counts line (articles · outlets · languages · heard in N other countries, only the facts the story has) and the entities as a plain muted mono uppercase list separated by middle dots (not chips); OUTLETS, OUTLET COUNTRIES and LANGUAGES as mono rows (key left, count right, 12px, `--rule` hairlines; domains verbatim at 0.03em, countries and languages as "FRANCE · FR" with the code muted, UNKNOWN for an empty key); NEWEST ARTICLES, up to 20 rows of a Source Sans 3 15px title link over a muted mono line with the outlet in white and the UTC time (the weekday when it is not the snapshot's day). The foot closes the column under a 1px white rule: NATURAL EARTH · GDELT · USGS in muted mono at the left, METHOD (to the about page) at the right, the words 12px under the rule. The index uses the same chrome: the h1 PLACES, one counts line, the snapshot line, OPEN THE MAP, then every place with 2 or more articles ranked by count, one row each: a muted mono rank, the name (a link when the place has a page, muted text when not) and N ARTICLES in mono at the right. No images but the mark, no colour, no motion but the ring. In the map's panel the sticky bar carries PAGE left of CLOSE (the same box and register, a same-tab link to the open place's page), only for a place of the current snapshot with 10 or more articles.

### Clip frame
A fixed 1080x1920 (or 1920x1080) frame in the same world: black dot-grid bands above and below a map window, each edge a 1px white rule with 25 ticks pointing into the band; the static 24-grid mark and the Silkscreen wordmark (4.2u) with the date on black blocks in the top band; in the time-lapse layouts only (the time-lapse, the flights before each card, and `?t=`), the reading key under the date, one fixed Source Sans 3 line at 3u on its own black block ("One dot per place in the last 24 hours of news. Size = number of articles."; where it needs two lines it breaks between the two sentences); four totals (number over label; three during the timeline's time-lapse, where the article total stands under the clock); signal cards kept inside the platform safe areas (the top 12% and bottom 18% of the height). The mark is drawn at `24 x max(1, round(shorter side / 360))` px (48 on a 540-wide frame, 72 at 1080) and snapped to whole device pixels.

**Timeline (`?timeline=1`).** The clip is one page stepped frame by frame at 30 fps by the renderer (`window.__clipStep(i)`, the plan from `window.__clipPlan()`): the hook 2 s, the pull-back 1.5 s, the time-lapse 7 s, then for each signal (the first three filled slots in file order) a 1.5 s flight and the card held 5 s, and the end card 3 s, about 33 s before the renderer's 1 s hold. One map serves the whole clip, padded to the time-lapse window throughout; the hook and the cards place their cell by offsetting the camera, never by repadding, so every cut and flight joins exactly. Each frame sets its whole state, so any frame can be redrawn alone.

**Hook.** The camera is already on the first signal's cell at the card zoom, with its callout (hexagon, reticle, tag), centred in the window above the caption. The top keeps the wordmark and the date without the clock; there is no reading key under it and no totals. The window is the time-lapse's (measured with the time-lapse's article total on, so the top band keeps that block's height empty under the date and the camera never moves between segments), and inside it, 2.4u above its lower rule (so inside the bottom safe strip, and clear of the right 15% in portrait), sits one caption block in the prose voice: the live article count, "278,481 articles in 24 hours.", in Source Sans 3 600 at 7u (line height 1.08, -0.01em, balanced over two lines in portrait), and 2.4u under it the reading key's first sentence, "One dot per place in the last 24 hours of news.", at the key's 3u. Each line of the count sits on its own black block that hugs the words (`box-decoration-break: clone`), the sentence on one block, so neither the dot grid nor the map runs through a glyph. With no filled slot the hook is the world at the last snapshot's time-lapse camera, with the caption and no callout.

**Pull-back.** A flight from the hook camera to the time-lapse camera at the first snapshot's time. The caption stays until the time-lapse starts and the clock stays hidden; the callout goes on the first pull-back frame. Over the pull-back the dots run back from the live snapshot to the first one, each place's count interpolated as in the time-lapse, so its last frame holds the first snapshot at the time-lapse's first camera and the time-lapse opens on it with only the layout changing (caption off; clock, article total, key, foot totals and progress marker on). With no filled slot it is a pan from the last snapshot's noon to the first's.

**Time-lapse.** 210 frames over the day's snapshots (about 100). Frame k of L sits at a virtual time running linearly from the first snapshot to the last (the live one), and the camera centres local noon at that time. Each place's article count is interpolated linearly between the two snapshots around that time (a place missing from one of them counts 0 there; rounded, zeros dropped) and drawn on the fixed scale, so the five mark steps change at different frames instead of all at once. The clock shows the virtual time, and the four totals interpolate the same way. The frame shows its own progress through the day in two places. Under the clock, on one black block, the article total stands at display size: the figure in Source Sans 3 600 at 7u (the hook caption's size, line height 1.08, -0.01em, lining tabular figures so the width holds while it ticks) with ARTICLES beside it on its baseline in the count labels' register (mono 2.04u, 0.1em, uppercase, 2u away); the foot then carries the other three totals (places, outlets, countries) in three columns spread across the width. On the top rule a filled white square, one tick long on each side, sits at the share of the day elapsed, measured from the first snapshot's time on the first tick to the last snapshot's on the last tick, centred on that point and snapped to a whole pixel; it covers the tick it passes, so it reads as one marker walking the 24 hours. Neither shows in any other segment or in the stills. The key sits under the total block, and the window starts 2.4u plus one tick under the key; that window is the one the hook, the pull-back and the flights use. The last time-lapse frame is the live snapshot and serves as the poster, total and marker included.

**Flights in the timeline.** Every camera move samples MapLibre's flyTo path (van Wijk curve 1.42, default easing) at one camera per frame, never zooming out past the time-lapse's own view. A flight of F frames shows the F inner cameras of a path whose two ends are the frames on either side of it, so every frame of a move is new and the move begins exactly where the previous frame stood. The pull-back's last frame is already the time-lapse's first camera.

**Portrait time-lapse (`?t=`).** The wordmark, date and reading key stack down from the top safe line, and the map window runs from 2.4u plus one tick under them to the top of the bottom safe strip (rows 248-787 of a 540x960 frame, 56% of the height). The totals sit inside the window on black blocks, 2.4u above its lower rule. The world fills the window's height (the box from 84°N to 58°S, the same height-fill the live map uses on phones), so about 60% of its width is in view and the sides run on into world copies. The camera's centre longitude is local noon at the frame's time, `180 - 15 x hours(UTC)`, so the place under the midday sun is always mid-frame and the camera turns once westward over the 24 hours. Landscape frames keep the whole world fitted between the reserved bands (17% top, 12% bottom) and do not pan; the reading key makes the top text taller than its band, so there the window starts 2.4u plus one tick under the key.

**Flight (`?signal=&from=&fly=`, and the timeline's flights).** Each signal card is reached by a flight (45 frames at 30 fps in the timeline, 1.5 s; F stills in the debugging mode): the camera follows the zoom-out, travel, zoom-in path of MapLibre's flyTo (van Wijk curve 1.42, default easing), sampled at fixed steps, from the last time-lapse frame's camera or the previous card's. Its zoom never goes below the time-lapse's own. During the flight the frame keeps the time-lapse layout (window, the four totals along the foot, clock; no article total under the clock and no progress marker) and adds one caption: the card's column header followed by an arrow and the destination's short name, "1/3 · MOST COVERED STORY → PARIS" (mono 2.04u, 0.14em, uppercase, over a hairline, on a black block; a long label may take two lines), placed where the card will put its header, or just above the totals when the card is short. The viewer knows where the camera is going, and why, before it arrives. In the debugging mode the first still before the flight is the last time-lapse frame plus that caption, pixel for pixel, and on its last still the camera is at the card; in the timeline the card's first frame is the arrival. There the layout switches in one step: the window shortens to end above the card, the totals go, and the card paints in around its header.

**Signal card (`?signal=`).** The cell's hexagon at the card zoom (4 at 1080 wide, scaled with the frame), centred in the window left above the card, with the live map's callout: the 1px hexagon outline over its 0.06 fill, the hollow 3px reticle at the cell's centre and a tag with the place's name only (mono at 2.04u, 11px on a 540-wide frame and 22px at 1080, uppercase, 0.06em, 2px black halo; the live map keeps 11px); unlike the live map's "NAME · n" it carries no count, so the place's total never sits beside the story's numbers. While the callout is on, the cell's own heat label is filtered out, so the place is named once. Below the window, each part on its own black block, the card reads in the order a muted viewer scans it. The header is the slot in plain words with its place in the run, "1/3 · MOST COVERED STORY" (N the card's place among the chosen slots, M their count; "1/1" in the `?signal=` stills), as a column header: mono 2.04u, 0.14em, uppercase, over a hairline. The plain labels are the clip's own (the site keeps its slot names): MOST COVERED STORY (loudest), COVERED IN THE MOST COUNTRIES (planet), FASTEST RISING PLACE (rising), THE MOST POSITIVE STORY (brightest), A STORY OF ORDINARY LIFE (ordinary), A QUIET PLACE IN THE NEWS (faint). Under it the place's short name is the one large line, Source Sans 3 600 at 6u (line height 1.08, -0.01em). Then, 2.6u lower, the ledger row: the story's own counts in the foot totals' register, number at 3.6u over its uppercase label at 2.04u, 5u between columns, starting at the card's left edge; they are the counts the site's sentence states for the slot (ARTICLES and OUTLETS, then LANGUAGES for loudest and ordinary or OTHER COUNTRIES for planet; two columns for rising, brightest and faint). Then the outlet's headline at 6u 600 behind a 1px left rule (clamped to six lines, carrying its `lang`), with the outlet name in mono. The fixed sentence stays on the site and is not on the card: figures scan in under a second, a sentence takes three. The card shrinks its type (the place name, the ledger and the headline) in 5% steps until at least 22% of the height stays map.

### Clip end card
`?end=1`: the whole frame is the dotted ground with no map, no edge rules and no top wordmark; only the date line stays at the top. The inverted lockup takes the centre at `128 x max(1, round(0.45 x shorter side / 128))` px (256 at 540 wide, 512 at 1080), on a black block, nudged to a whole pixel. 4u below it stands one fixed line, OPEN A DOT AT (Azeret Mono 2.04u, 0.1em, uppercase, white on a black block, the count labels' register), and 1u under that the site address in Azeret Mono at 3u, 0.01em, fitted to the frame width (it is set at weight 700, which the 400-500 face synthesizes; 700 is not a system weight). In landscape the line sits beside the address on one row, 1.6u apart. The foot, above the bottom safe area (18% of the height; portrait adds 15u of right padding for platform UI), holds the observer in its static form (one 24x40 path, the static mark as its head) at the mark's multiple, 48x80 on a 540-wide frame and 72x120 at 1080, on a black block padded by two of its pixels, standing on the foot's baseline beside the four totals as number over label (the fourth reads OUTLET COUNTRIES, as in the map's places column; time-lapse frames keep COUNTRIES): in portrait two rows of two (two equal columns, 2.4u between rows), in landscape one row spread across the width. In the timeline the map is hidden for it and it is held 3 s; it follows the last signal card with a cut. Nothing animates within a frame: every frame is a still, and the camera, the dots, the clock and the totals move only from one frame to the next, at 30 fps.

## Do's and Don'ts

### Do:
- **Do** set every text block's background to `var(--bg)` so the dot grid never crosses a glyph.
- **Do** express selection, activation and the current frame by inverting (`background: var(--fg); color: var(--bg)`).
- **Do** put every number, timestamp, column head and control word in Azeret Mono at 11px, uppercase, 0.06-0.1em tracking; keep `tabular-nums` on.
- **Do** separate repeated entries with a 1px `--rule` hairline and head a section with a 1px solid white rule under a mono 500 11px 0.1em label.
- **Do** keep controls at least 28px tall (36px on phones) with a 1px border at 0.4 alpha that lifts to solid white on hover.
- **Do** draw any new icon or mark as crispEdges inline SVG on an integer grid, one colour, and render it at a whole multiple of that grid (24 for the mark, 128 for the lockup).
- **Do** switch state in one step; if motion is unavoidable, make it a `steps()` change, and remove it under `prefers-reduced-motion` as the ring orbit and the inversion frame are.
- **Do** keep greys to the map plate (#0d0d0d, #2f2f2f, #3a3a3a) and the muted text steps (#9a9a9a, #777, #5c5c5c, #333).
- **Do** draw a map mark as a flat white circle with a black hairline, sized and dimmed by the five fixed steps; a new mark type joins the same stepped scale.

### Don't:
- **Don't** introduce any hue, including the former amber heat; the palette is black, white and the listed greys.
- **Don't** round a corner, add a box-shadow, a tint, an opacity fade or a gradient fill (the only gradients in the build draw 1px marks: the dot grid, strips and tick marks).
- **Don't** ease or fade a transition; no `transition` is defined anywhere in the build, and the only `animation` is the mark-ring orbit, stepped with `steps(30, end)` and looped. Don't add a second motion.
- **Don't** set a figure or a label in Source Sans 3, or a sentence in Azeret Mono.
- **Don't** use `--faint` (#5c5c5c) for text that must be read; it is for strips, bars and baselines only.
- **Don't** add a card: content is a log of entries separated by hairlines, never a filled box; the 160x96 video tile is the one bordered container and stays 1px-bordered on black.
- **Don't** use icon fonts, glyph icons or raster icons; the only icons are the pixel SVGs on integer grids, and the only rasters are the PNG favicons and the share image, both rendered from the lockup. Don't draw the mark at 32px, 40px or any other non-multiple of 24.
- **Don't** blur, soften or halo a map mark: `circle-blur` is 0, there is no heatmap layer and no glow layer; the only halo on the map is the 1-2px black text halo that keeps labels legible.
- **Don't** let the map's chrome compete with the dots: overlays are small black or white blocks at the frame's inside corners, nothing larger.
