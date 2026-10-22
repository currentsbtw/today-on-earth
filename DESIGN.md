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

The product is a measurement, and the surface is built to look like one. The canvas is pure black with an 8px dot grid in its margins; the only light on the page is the data: the map plate carries one flat white dot per place, sized by article volume, and every number, label and control is set in a monospaced face at data density. There is no colour anywhere (the amber heat of the previous world was rejected and does not return), no rounded corner, no shadow, no gradient used as decoration, and no eased motion: a state is either on or off, and the whole frame inverts for one painted frame when the map returns to live or replay starts.

Two voices share the page. Azeret Mono carries the chrome: the top line, the ranked places column, the bar field, the panel's count rows, the foot totals, the map labels. Source Sans 3 is reserved for what a person reads as prose: the one large sentence above the map, panel titles, story headlines, the methodology page, and a signal's fixed sentence. Silkscreen appears once, as the wordmark beside the 16x16 one-bit globe. The one-bit pixel observer in the bottom-right corner and the crisp-edged pixel icons (play, pause, close, quake, the attribution "i") are drawn as inline SVG on integer grids, never as icon-font glyphs.

Density is high and the hierarchy is carried by three things only: white versus grey text, a 1px rule versus none, and a few fixed type sizes. Depth is never implied; a surface is either black or inverted to white.

**Key Characteristics:**
- Chrome, marks and type in #000 and #fff; greys only inside the map plate and the muted text steps.
- Azeret Mono 11px uppercase with 0.06-0.1em tracking for every label, control and figure; Source Sans 3 for every sentence a person reads.
- 8px dot grid on the body and the panel ground; text sits on solid black blocks so the grid never runs through a glyph.
- Hairlines (1px, solid white or a white alpha) are the only separators; no cards, no fills.
- Stepped motion: states switch in one step; the only "animation" is a one-frame full-page inversion.
- Pixel marks: the globe, the observer, and every icon are crispEdges SVG on a small integer grid.

## Colors

Black, white, and a short ladder of greys for secondary text and strips; chroma is zero everywhere.

### Primary
- **Ink** (`{colors.ink}`): the ground of every page, panel, band and control. Every text block declares it as a background so the dot grid never crosses a glyph.
- **White** (`{colors.white}`): the only foreground. Primary text, hairline rules at full strength, the map's dots, selection fills. Active nav items, pressed buttons, the current table row and the REPLAY tags invert to black-on-white; the LIVE tag in the right column's stamp is the one tag that stays black with a 1px solid white border, so live reads as the rest state and replay as the inverted one.

### Neutral
- **Muted** (`{colors.muted}`): readable secondary text (7.0:1 on black): the snapshot line, count labels, recent-frames headers, meta rows, placeholders, attribution, unselected places.
- **Dim Rank** (`{colors.dim-rank}`): one step below muted (4.7:1), used only on unselected places while a selection exists.
- **Faint** (`{colors.faint}`): decorative strips and inactive marks only: bars after the current frame, the tone baseline, unselected rank strips during a selection, scrollbar thumbs. Never text that must be read.
- **Rule** (`{colors.rule}`): quiet hairlines between repeated entries (count rows, articles, definitions, the scroll edge of the places list).
- **Visited** (`{colors.visited}`): visited headline links.
- **Hairline / Hairline Mid / Hairline Strong** (white at 0.18, 0.35, 0.4 alpha): the dot grid; the scrub track and filter borders (0.35); outline-button and chip borders and the story's left rule (0.4). The map frame edge is white at 0.25 and its ticks at 0.6. Hover lifts a 0.4 border to solid white.

### Map plate
- **Map Ocean**, **Map Land**, **Map Border**, **Map Admin**, **Map Heat** (`{colors.map-ocean}`, `{colors.map-land}`, `{colors.map-border}`, `{colors.map-admin}`, `{colors.map-heat}`): the only place greys are used as fills. Land is near-black (#0d0d0d) and reads by its coastlines, which are drawn by the same #2f2f2f line as the country borders; admin-1 lines (zoom 3.5 and up) are one step lighter so a thinner line stays visible. Map Heat is the white of every mark: the coverage dots (full white, with the two smallest steps at 0.5 and 0.7 opacity so they read as grey), the quake rings, the selected cell's outline, reticle and tag. Base labels are white at 0.8 / 0.56 alpha over a black halo. These constants live in `web/src/map.ts` because MapLibre needs literal colours before any stylesheet applies.

### Named Rules
**The Two-Ink Rule.** Chrome, marks and type use #000 and #fff only. Grey is allowed in exactly two places: the map plate's land and borders, and the text hierarchy's muted steps (#9a9a9a, #777, #5c5c5c, #333). No other grey and no hue may be introduced.

**The Inversion Rule.** Selection, activation and the pressed state are expressed by swapping ink and white (`background: #fff; color: #000`), never by tint, opacity or a second colour. One painted frame of `filter: invert(1)` on the root marks a snapshot change (skipped under reduced motion).

**The Faint-Is-Not-Text Rule.** #5c5c5c appears only on strips, bars and baselines. Text drops no lower than #777.

**The Flat-Mark Rule.** A map mark is a solid white circle with a hard edge (`circle-blur: 0`) and a black hairline around it. Volume is encoded by stepped radius and stepped opacity, never by blur, a heatmap or a glow.

## Typography

**Display Font:** Source Sans 3 (with system-ui, sans-serif), variable 400-600, self-hosted
**Body Font:** Source Sans 3
**Label/Mono Font:** Azeret Mono (with ui-monospace, monospace), variable 400-500, self-hosted
**Wordmark Font:** Silkscreen (with monospace), 400 only, self-hosted

**Character:** A measuring instrument with one humanist voice. Mono at 11px carries everything numeric and operational, uppercase with wide tracking; Source Sans 3 appears only where there is a sentence to read, so its size alone signals "this is the prose". `font-variant-numeric: tabular-nums` is set on the map body and the clip frame so columns of figures align.

### Hierarchy
- **Display** (600, `clamp(40px, 3.9vw, 72px)`, 1.06, -0.012em): the single sentence of totals above the map, max-width 15.5em. `clamp(28px, 5vw, 44px)` between 721 and 1099px; 28px/1.1 on phones. The about page's h1 uses the same voice at `clamp(36px, 5vw, 56px)`.
- **Headline** (600, 28px, 1.1, -0.01em): the panel title (a place name); 24px on phones. The about page's h2 is 600 24px/1.2.
- **Title** (400, 16px, 1.35): story headlines in the panel and a signal's fixed sentence (16px/1.4). Article titles are 14px/1.35; video titles 13px/1.25. A signal's outlet headline is the one bold line at 600 17px/1.3.
- **Body** (400, 17px, 1.55): the methodology page's reading text in a 68ch measure. The map page has no body prose.
- **Label** (500, 11px, 1, 0.1em, uppercase): column heads, nav items, panel section heads, button words, the CLOSE control, foot captions. Signal slot names on the clip use 0.14em.
- **Data** (400, 11px, 1.3-1.5, 0.02-0.08em, usually uppercase): rank rows, count rows, meta lines, status, attribution, placeholders, the under-map line. Tracking narrows as the string gets longer: 0.02em for domain names and rows, 0.06em for short labels, 0.1em for the shortest.
- **Figure** (500, 22px, 1, 0.02em): the UTC clock. Foot totals use the same face at 500 15px; the panel's count values at 12px; bar tags and frame indices at 9px.
- **Wordmark** (Silkscreen 400, 16px, 1, 0.02em, uppercase): TODAY ON EARTH beside the 32px globe; 13px with a 24px globe on phones.

### Named Rules
**The Mono-For-Data Rule.** Any number, unit, timestamp, column head, control word or meta line is Azeret Mono. Source Sans 3 is only for a sentence, a title or a headline. A value never appears in the humanist face.

**The One-Size Chrome Rule.** Chrome type is 11px. Emphasis comes from weight (400 to 500), colour (muted to white) or inversion, not from size; the only chrome sizes outside 11px are the 22px clock, the 15px foot totals, the 12px count values and the 9px bar annotations.

**The Uppercase Ledger Rule.** Mono labels are uppercase with letter-spacing between 0.06em and 0.1em. Mono content that must be read verbatim (domain names, names in tooltips) keeps its case and tightens to 0.02-0.03em.

## Layout

The desktop shell (1100px and up) is a fixed-height CSS grid filling `100dvh`, padded `0 36px 14px`, with a 28px column gap: a 200px left column (ranked places), a fluid centre (the sentence and the map frame) and a right column `#side` of 280px that widens to 360px while a place is selected. The right column is a flex column: the live stamp row on top (10px below it), then exactly one of two internally scrolling sections, Signals (`#signals-col`, the default, `data-view="signals"`, no hash; `#signals` accepted) or Replay (`#replay-col`, `#replay`; a `#t=` frame stamp implies it), each closed at the scroll edge by a `--rule` hairline, and the observer pinned to the bottom. A selected place hides both sections and the observer and the panel takes the column; CLOSE restores whichever section was open. Rows are a 64px top line (wordmark left, nav centred, clock right), the sentence row, the main row, and the foot. The body does not scroll; the places list and the right column scroll internally with a thin 6px scrollbar and a `--rule` hairline at the scroll edge.

The map frame has a 1px white (0.25 alpha) border and tick marks every 64px on all four edges, drawn outside the frame as 6px-long hairlines at 0.6 alpha. In replay the border turns dashed at 0.5 alpha. The status line sits 10px inside the top-left; the quake toggle 10px inside the bottom-left; MapLibre's attribution is restyled to the mono register in the bottom-right.

The spacing rhythm is small integers: 4px between nav items and chips; 8px between a filter and its list, between video cards, for panel paragraphs; 12-14px between the panel's title and its counts and between stories; 16-24px before a section head (`.panel-section` sits 24px below the previous block); 28px between columns; 36px page margins. The 8px dot grid underlies all of it.

Between 721px and 1099px the shell becomes one scrolling column with 24px margins: brand and clock on the top line, the sentence, the nav (now four items, PLACES included, pulled 10px into the margin), the map at `max(52svh, 100svh - 300px)`, then `#side` dissolves (`display: contents`) into stacked sections 28px apart, each under its own mono head: SIGNALS, PLACES (the rank rows as a three-column grid of the first 18, the filter and PLACE / ART / OUT / CTY row hidden), REPLAY, the observer, then the foot. The stamp row is hidden here; the clock carries the time. The panel is fixed to the right edge at `min(400px, 100%)` behind a 1px white left border.

At 720px and below margins drop to 16px; the clock date hides and the time drops to 15px; nav items grow to 36px tall; the sentence is 28px; places render in two columns of 12 (one column at 420px and below); the same stacked order (map, Signals, Places, Replay, observer, foot) holds. The bottom sheet serves only a selected place: 55svh with a 1px white top border, a 36px sticky handle (a 24x2px white bar) and one alternative height, `100svh - 12px`; the quake toggle and attribution step aside while it is open. The map keeps `max(52svh, 100svh - 236px)`.

The about page is a single reading column, `68ch + 64px` wide, centred, 24px below the same 64px top line, bounded by 1px white rules top and bottom, padded `40px 32px 56px` (28px 16px 40px on phones). The clip frame scales every measure from `--u` (1% of the shorter side): 7u side margins, a 1px edge rule with 25 ticks of `max(5px, 1.1u)`, the wordmark at 4.2u, the headline at 5u, counts at 3.6u over 2.04u labels.

## Elevation & Depth

There are no shadows and no tonal layering. Every surface is flat black; nothing floats. Overlays (the status line, the tooltip, the quake toggle, the sheet) sit on the map by stacking order alone and declare a solid black or white background so they read as blocks, not as lifted planes. The one thing that ever changes the page's depth is the inversion frame, which flips the whole document for a single paint.

### Named Rules
**The No-Shadow Rule.** `box-shadow` appears in the stylesheets only to cancel MapLibre's focus glow. Focus is a 1px solid white outline offset 2px (inset where a container clips).

## Shapes

Every corner is square (`border-radius: 0` is set on buttons, inputs, sliders and MapLibre's attribution button to cancel user-agent rounding). Borders are 1px hairlines in white or white alpha; they are the only outline a control has. Strips are repeated 1px bars (`repeating-linear-gradient`, 1px on / 2px off; 2px on / 1px off when selected). The slider thumb is a 7x11px white rectangle on a 1px track. Bullets on the about page are 10x1px white dashes. On the map every mark is a circle: the coverage dots (five fixed radii), the hollow quake rings, the 3px selected-cell reticle; the selected cell itself is its H3 hexagon as a 1px white outline over a 0.06 white fill. Icons and marks are drawn on integer grids with `shape-rendering: crispEdges`: the globe on 16x16, the observer on 12x14, play on 4x7, pause on 5x7, close on 7x7, quakes on 12x12, the attribution "i" on 3x8.

## Components

### Buttons
Flat, square, one-step. Two registers, both Azeret Mono 500 11px uppercase 0.1em and at least 28px tall (36px on phones for the nav and the quake toggle).
- **Shape:** square (0).
- **Nav item** (text-only): black on black, `0 10px`, 4px apart; hover underlines with a 4px offset; the current item inverts to black-on-white (`aria-current="true"`). The line reads SIGNALS · REPLAY · METHOD on wide screens; PLACES (`.nav-stacked`) joins between SIGNALS and REPLAY only below 1100px, where the sections stack. On wide screens the current item is the section the right column shows, and no item is current while a selected place covers the column; below 1100px an IntersectionObserver (band 30% to 40% down the viewport) marks the item whose section is crossing the top, and a tap scrolls to the section. The about page's BACK link uses the same control.
- **Outline button:** 1px border at 0.4 alpha (solid white for the signal's OPEN button and the panel note), black fill, `0 10px`; hover lifts the border to solid white (quake toggle, video card, article play) or inverts entirely (play, "more", OPEN); pressed or playing (`aria-pressed="true"`, `.is-playing`) inverts to black-on-white.
- **Close:** the word plus a 7x7 pixel X, `0 6px`, no border; hover inverts.
- **Focus:** 1px solid white outline, 2px offset; -1px for rank rows, -3px for the sheet handle.

### Chips
- **Style:** 1px border at 0.4 alpha, no fill, `2px 5px`, mono 400 11px uppercase 0.04em; 4px gaps, wrapping. Used for language and country tags under a story.
- **State:** none; chips are read-only.

### Inputs / Fields
- **Filter input:** 28px tall, `0 8px`, 1px border at 0.35 alpha, black, mono 400 11px 0.06em; placeholder in muted; native search affordances removed. Focus sets the border to solid white (plus the global outline).
- **Range (scrub):** transparent, 16px tall; 1px track at 0.35 alpha; 7x11px white rectangular thumb.

### Column heads and section heads
A mono 500 11px uppercase 0.1em line with `6px 0` padding and a 1px solid white rule beneath. Used for the places column head, the bar field head, panel sections (OUTLETS, OUTLETS BASED IN, STORIES), signal slot names and the about page's definition labels. The trend head is the same without the rule, in muted. The totals under the places column and the foot repeat the rule above them.

### Rank rows (places column)
A grid `minmax(0,1fr) 30px 28px 22px` with a 4px gap: uppercase name, then three right-aligned figures; a full-width 5px strip of 1px bars below, its length proportional to articles. Rows are muted and hover to white. The selected row grows to 500 13px, turns white, gains 1px white rules top and bottom and an 8px strip of 2px bars; while a selection exists every other row drops to #777 with a faint strip. Below 1100px the rows reflow into a 3/2/1-column grid showing the first 18/12 only.

### Replay section (bar field)
Under a column head reading REPLAY with the frame count ("99/99") at the right, then a muted mono unit line ARTICLES PER SNAPSHOT (`.field-unit`, 22px above the band). 96 bars 1px wide, absolutely positioned across a 120px band; height is a percentage of the day's maximum; bars after the current frame are faint; the current bar is full height. A 500 9px white tag with black text sits 17px above the current bar; muted 9px indices run below. Under it: the range slider, then PLAY (outline button) with the muted time and an inverted LIVE tag, then the trend head and a 44px polyline (`stroke: #fff`, 1px, non-scaling) over a 1px dotted baseline, then the recent-frames table. With fewer than four snapshots the field is static: bars only, no slider, controls or trend.

### Recent-frames table
Mono 400 11px/16px, a 1px white rule on top; muted 500 uppercase 0.08em headers, muted cells, figures right-aligned, the first two columns left. Rows hover to white; the frame on screen (`.is-on`) inverts to black-on-white at 500.

### Panel (place detail)
Serves one selected place only; there is no Places or Signals panel mode. A black dot-grid column (360px in the shell, replacing the Signals or Replay section below the stamp; a fixed 400px right drawer between 721 and 1099px; a 55svh bottom sheet on phones). A sticky bar with a 1px white rule holds CLOSE at the right; CLOSE returns the column to the section it was showing. The title is Source Sans 3 600 28px. Counts are definition rows (`4px 0`, mono 11px uppercase 0.06em, muted label left, white 12px value right) separated by `--rule` hairlines. A muted mono line follows ("31 REPRINTS COLLAPSED · LAST 2H"). Coverage lists (outlets, countries, languages) are strip rows: key left, count right, a 1px white strip beneath whose width encodes the count. The panel note is a 1px white-bordered mono tag.

### Log entries (stories, articles, signals)
- **Story:** 14px above, a 1px left rule at 0.4 alpha with 12px inset; headline in Source Sans 3 400 16px/1.35 (link, no underline until hover, 1px thickness, 3px offset); muted mono source line; muted mono meta line with the counts in white; chips; nested articles.
- **Article:** `9px 0`, a `--rule` hairline above; title in Source Sans 3 400 14px/1.35; meta line in muted mono 0.04em with the first span (outlet) in white; an optional 20x20 play square (1px border at 0.4 alpha, 36x36 hit area) and a tone mark: a 22x7px faint baseline with a 1px white tick.
- **Signal:** `18px 0 4px`; the slot name as a section head; the fixed sentence in Source Sans 3 400 16px/1.4; the outlet headline as the one bold line (600 17px/1.3) behind a 1px left rule at 0.4 alpha with 12px inset; an OPEN outline button with a solid white border. The clip's signal card is the same entry scaled by `--u`.

### Video cards
160x96px, 1px border at 0.35 alpha, `7px 8px`, a grid of an 18x18 bordered play glyph, a two-line Source Sans 3 13px title, and a muted mono source line; hover lifts the border to white. The playing card expands to the panel's width and hosts a 16:9 iframe.

### Tooltip and status
- **Tooltip:** white block, black text, `4px 6px`, mono 400 11px 0.03em, max-width 260px, the name in 500 uppercase.
- **Status:** black block at the top-left of the frame, `3px 6px`, mono 400 11px uppercase 0.08em.

### Map marks (coverage dots)
One flat white circle per place on the `cell-dot` layer, no blur, drawn largest-last by article count. The log-scaled weight `w` (0-1, against a fixed maximum so replay and clip frames share one scale) is quantised into five steps at `MARK_STEPS` 0.2 / 0.4 / 0.6 / 0.8. Each step fixes a radius and an opacity: radii `MARK_RADIUS` 0.6 / 0.85 / 1.25 / 1.9 / 2.6px at zoom 0, multiplied by `MARK_ZOOM_SCALE` (1x at zoom 0, 3.5x at zoom 4, 8x at zoom 9); opacities `MARK_OPACITY` 0.5 / 0.7 / 0.85 / 1 / 1. A black hairline (`circle-stroke`, 0.6px at zoom 0 to 1px at zoom 4) separates neighbours in dense regions. The top radius is held small so a cluster stays a field of separate dots rather than a mass. From `w` 0.4 a place carries a mono 10px uppercase 0.08em white label with a 1.2px black halo (the five largest places are labelled at every zoom). Hit targets are invisible circles 4-30px wide depending on weight and zoom. The under-map legend reads "size = volume, not importance" and the status hint "Open a dot to see who is covering it". Quake rings (opt-in) are hollow white 1px rings at 0.9 opacity, radius by magnitude.

### Live stamp
The first row of the right column on wide screens (`#side-stamp`, hidden below 1100px): a muted mono 400 11px 0.06em uppercase line, no wrap, 10px below it. It opens with a tag in mono 500 at `1px 4px`: LIVE as an outline tag (1px solid white border, white on black) followed by the snapshot time ("LIVE 14:27 UTC"), or, while a past frame is on screen, REPLAY as an inverted tag followed by the frame time and index ("REPLAY 05:16 UTC · 38/95"). It stays above a selected place's panel, so the column always declares which snapshot the page is showing. The LIVE word inside the replay controls (`.scrub-live`) and the clock's REPLAY word keep the inverted form.

### Signals section
A column head reading SIGNALS, a muted mono note beneath ("22 OCT 2026 · 14:27 UTC · LAST 24H", `.col-note`, 8px below the rule), then the six signal entries as a list; an empty state is a muted mono line at `8px 0`.

### Top line and foot
- **Brand:** 32px pixel globe plus Silkscreen wordmark, 12px gap, on a black block.
- **Clock:** uppercase date in mono 11px 0.1em, the time at 500 22px, a muted SNAPSHOT line beneath; the line swaps to an inverted REPLAY tag while a past frame is shown.
- **Foot:** a 1px white rule above, 10px padding; totals as mono 500 15px figures over muted 11px uppercase 0.1em captions, 28px apart; source links in muted mono at the right, underlined, white on hover. Two-column grid on phones.

### Pixel marks
The globe (16x16), the observer (12x14, rendered 36x42 at the bottom-right of the right column and 9.6u x 11.2u on the clip end card) and every icon are inline SVG with `shape-rendering: crispEdges`, filled with `currentColor` or white. New marks follow the same grammar: an integer grid no larger than 16 on a side, one colour, no strokes, no anti-aliasing.

### Clip frame
A fixed 1080x1920 (or 1920x1080) frame in the same world: black dot-grid bands above and below a map window, each edge a 1px white rule with 25 ticks pointing into the band; the wordmark and date on black blocks in the top band; four totals along the foot (number over label); signal cards and the end card kept inside the platform safe areas, the observer beside the totals and the site address.

## Do's and Don'ts

### Do:
- **Do** set every text block's background to `var(--bg)` so the dot grid never crosses a glyph.
- **Do** express selection, activation and the current frame by inverting (`background: var(--fg); color: var(--bg)`).
- **Do** put every number, timestamp, column head and control word in Azeret Mono at 11px, uppercase, 0.06-0.1em tracking; keep `tabular-nums` on.
- **Do** separate repeated entries with a 1px `--rule` hairline and head a section with a 1px solid white rule under a mono 500 11px 0.1em label.
- **Do** keep controls at least 28px tall (36px on phones) with a 1px border at 0.4 alpha that lifts to solid white on hover.
- **Do** draw any new icon or mark as crispEdges inline SVG on an integer grid, one colour.
- **Do** switch state in one step; if motion is unavoidable, make it a stepped change, and honour `prefers-reduced-motion` for the inversion frame.
- **Do** keep greys to the map plate (#0d0d0d, #2f2f2f, #3a3a3a) and the muted text steps (#9a9a9a, #777, #5c5c5c, #333).
- **Do** draw a map mark as a flat white circle with a black hairline, sized and dimmed by the five fixed steps; a new mark type joins the same stepped scale.

### Don't:
- **Don't** introduce any hue, including the former amber heat; the palette is black, white and the listed greys.
- **Don't** round a corner, add a box-shadow, a tint, an opacity fade or a gradient fill (the only gradients in the build draw 1px marks: the dot grid, strips and tick marks).
- **Don't** ease or fade a transition; no `transition` or `animation` is defined anywhere in the build.
- **Don't** set a figure or a label in Source Sans 3, or a sentence in Azeret Mono.
- **Don't** use `--faint` (#5c5c5c) for text that must be read; it is for strips, bars and baselines only.
- **Don't** add a card: content is a log of entries separated by hairlines, never a filled box; the 160x96 video tile is the one bordered container and stays 1px-bordered on black.
- **Don't** use icon fonts, glyph icons or raster icons; the only icons are the pixel SVGs on integer grids.
- **Don't** blur, soften or halo a map mark: `circle-blur` is 0, there is no heatmap layer and no glow layer; the only halo on the map is the 1-2px black text halo that keeps labels legible.
- **Don't** let the map's chrome compete with the dots: overlays are small black or white blocks at the frame's inside corners, nothing larger.
