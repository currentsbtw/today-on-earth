# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, served as peers (confirmed 2026-10-21):

- A phone visitor arriving from a daily clip (TikTok, Shorts, Reels), curious, with under a minute. They want to see the planet glowing, tap a place, and read what the world is saying about it.
- A desktop explorer who sits with the map: scrubs the last 24 hours, opens places and stories, compares outlets and countries, reads the methodology.

Secondary (not yet served by product): newsrooms, researchers and risk teams who may later want the archive or an API.

## Product Purpose

A flat world map that glows where the world's news is pointing right now. Every article comes from the GDELT Project; the site picks no outlets, writes no headlines and ranks nothing by judgment. Zooming into a glow shows the stories there and every outlet behind each one, labelled by country and language. Success: a first-time visitor understands within seconds that brightness is coverage, not importance, and comes back daily (clips, the daily broadcast, later a newsletter).

## Positioning

No editorial voice, with the receipts shown. Brightness is measured article volume; each place shows why it is bright (articles, distinct headlines, outlets, countries, languages) and where coverage is absent. Measures no other map publishes: reprints collapsed per place, international attention (outlet countries other than the place's own), a place's own normal, and a six-slot daily broadcast filled by published rules. Everything is open source and $0 to run.

## Operating Context

- Static site on GitHub Pages, rebuilt every ~15 minutes by a GitHub Actions ingest; no server, no accounts.
- Surfaces: the map (index.html) with a side panel (cell detail, Places list, Signals list), a replay scrubber, an earthquake toggle; the methodology page (about.html); a 9:16 clip frame page (clip.html) rendered headlessly into a daily mp4 with signal cards and an end card.
- The daily clip is the marketing funnel; the Signals broadcast is the daily reason to return.
- Evaluated by a skeptical reader: anything that looks like an editorial choice must be a published rule.

## Capabilities and Constraints

- Data contract: docs/DATA-CONTRACT.md (binding). Heat per H3 cell (n, u, o, c, i, l, t, b), per-cell detail with stories, 24 h replay frames, baseline, broadcast.json.
- Stack: Vite + vanilla TypeScript + MapLibre GL (no tiles; Natural Earth outlines), CSS custom properties in web/src/tokens.css; about.css for the methodology page; clip.css for the clip frame.
- Phone layout is a bottom sheet; the panel is 400 px on desktop; keyboard access and focus rings exist and must survive.
- Performance (measured 2026-10-23): the map chunk is ~1 MB (MapLibre, 289 KB gzipped) plus a 519 KB worker; desktop reaches a ready map in ~1.6 s; on a phone profile (iPhone 13 Pro Max, slow 4G, CPU 4x) the dots used to appear only with the map (7.9 s on the live site, 4.6 s on a local build), and since the pre-paint they appear at 1.5 s with the map ready at 4.6 s (local build); this must not get worse.
- The clip frame is captured by a headless browser at 1080x1920 (and 540x960 locally); text must stay inside platform safe areas.
- Terminology: place (cell), story, outlet, reprint, "heard in N other countries", signal (broadcast slot), normal (baseline), snapshot.
- Undecided: newsletter; accounts; monetisation surfaces (none built).

## Brand Commitments

- Name: "Today On Earth" (binding).
- Mark: the wireframe globe with the name across it (current logo at .impeccable/references/8.jpg) is binding as the mark; it may be redrawn in the new visual style.
- The green of the current logo and the map's amber heat are not binding (confirmed 2026-10-21).
- Pinned visual direction (user-supplied references in .impeccable/references/1-7, 2026-10-21): near-black canvas, large humanist type, one-bit pixel mascots, dotted pixel grid, pixel-block loaders and wordmarks, minimal chrome. Those references are another studio's work and must not be copied; the pin is the language, not the pages.
- Voice: literal, terse, no adjectives about the news itself; fixed templates only (see docs/METHODOLOGY.md).

## Evidence on Hand

- Live data every 15 minutes: web/public/data/ locally after an ingest run; the live site at https://currentsbtw.github.io/today-on-earth/.
- Real daily clips on the GitHub release "clips"; snapshot archive on releases tagged archive-YYYY-MM-DD.
- No testimonials, customers, press or benchmarks exist; none may be invented.

## Product Principles

1. Show the receipts: every number on screen is explainable by a published rule.
2. The map leads; chrome recedes. Nothing competes with the glow.
3. Two peers: phone and desktop get equal care, not a shrunken desktop.
4. Silence is information: dark areas and empty slots say so, in words.
5. Cheap to run, cheap to read: no tiles, no trackers, fast first paint.

## Accessibility & Inclusion

Keyboard-operable panel and lists, visible focus, contrast on near-black, `lang` on foreign headlines, no motion that cannot be reduced. No formal standard adopted yet.
