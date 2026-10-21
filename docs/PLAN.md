# Today On Earth — Plan

Last updated: 2026-10-20

## The idea

A news platform with no editorial voice. The user sees a flat world map that glows
where things are happening, as if watching the planet from far away. Zooming into a
hot area reveals the events there, and every article, video and TV segment covering
each event, from every outlet, side by side.

## Promise we can keep

"Completely unbiased" is not deliverable by any aggregator: picking sources, ranking
events, and deciding what counts as "hot" are all choices, and coverage itself is
uneven (a Paris protest gets 500 articles, a Chad protest gets three). The promise
we make instead:

- **No editorial voice.** Nothing is written by us. No headlines of our own, no
  summaries that take a side, no front page chosen by a person.
- **Every event, every outlet.** Hotness comes from measured coverage volume, not from
  our judgment. Every outlet covering an event is listed, labeled with its country and
  language.
- **Transparency over claims.** Show the user *why* a spot is hot (N articles from M
  outlets in K countries) so they can judge the coverage for themselves.
- **Show the coverage gap.** Where the map is dark, say so. Silence is information too.

This is a stronger product claim than "unbiased" and it survives scrutiny.

## Decisions made (2026-10-20)

| Decision | Choice |
|---|---|
| View | Flat map, not a globe (globes are overdone right now) |
| Platform | Web first |
| Goal | Monetize eventually; grow into a real platform |
| Budget | $0 now; architecture must stay free until there is revenue |
| Backend | A continuously running ingest job is acceptable |
| Media | Headlines, snippets, source links, embeddable video only. No rehosting of broadcaster clips or paywalled text (licensing). |

## Data sources (all free)

| Source | What it gives | Notes |
|---|---|---|
| **GDELT 2.0** (gdeltproject.org) | Backbone. Monitors news worldwide in 100+ languages, geocodes every event, updates every 15 min. Free and open. | Three feeds: Events (who did what to whom, where), GKG (themes, tone, locations, page titles), Mentions (links articles to events). Bulk CSV every 15 min, or BigQuery (1 TB/month free queries, verify current pricing). |
| GDELT GEO 2.0 API | Pre-built GeoJSON of locations in the news with article counts and titles, last 7 days | Essentially a heatmap feed. Rate limited; call from the ingest job, not from browsers. Verify current docs. |
| GDELT DOC 2.0 API | Article search with titles, images, source country, language; rolling 3-month window | For drill-down lists. Same rate-limit caveat. |
| USGS Earthquakes | GeoJSON feed, real time | Specialty layer |
| NASA FIRMS | Active fire detections | Specialty layer; free key |
| ReliefWeb API | Disasters and humanitarian reports | Specialty layer |
| Wikipedia Current Events | Human-curated daily spine | Phase 2 cross-check for event clustering |

Verify each source's terms of use before launch; API access changes.

## Architecture: static-first, zero servers

The cheapest and most robust shape for phase 1 is a pipeline that produces static
files. No database, no API server, nothing that scales with traffic.

```
GDELT 15-min CSV --> ingest job (scheduled) --> latest.json + snapshots --> CDN --> browser
                                                (grid cells, counts, top articles)
```

- **Ingest job**: a script (TypeScript or Python) that runs every 15 minutes, fetches
  the newest GDELT Events + GKG files (GDELT has already geocoded them), bins events
  into map cells (H3 hexagons or a simple lat/lon grid), computes per-cell coverage
  counts, keeps the top N articles per cell, and writes a compact JSON snapshot.
- **Hosting for the job (free options)**:
  1. **GitHub Actions on a cron** in a public repo. Unlimited minutes for public
     repos; a 15-min cron is allowed though GitHub may delay runs by a few minutes.
     Simplest. Default choice.
  2. **Oracle Cloud Always Free VM** if we want a true always-on process. Verify the
     offer still exists at signup time.
  3. Cloudflare Workers cron: the free plan allows 5 cron triggers but only 10 ms CPU
     per invocation, too little to parse a multi-MB CSV. Not suitable for ingest; fine
     for a tiny API later.
- **Storage/CDN for snapshots**: Cloudflare R2 (10 GB free, zero egress fees) or
  simply commit the snapshot to the Pages repo. R2 preferred so the repo stays clean.
- **Frontend**: static site on Cloudflare Pages or GitHub Pages. MapLibre GL JS (open
  source, has a native `heatmap` layer). Base map:
  - Phase 1: **no tiles at all.** Natural Earth country outlines as GeoJSON (a few MB),
    dark background, no labels. This is the "alien view" aesthetic and costs nothing.
  - Phase 2: Protomaps PMTiles file (a single file of vector tiles) hosted on R2 for
    street-level detail when zoomed in. A low-zoom planet extract fits in the free
    10 GB.
- **Database**: none in phase 1. Add Postgres (Neon free tier scales to zero; Supabase
  free tier is 500 MB and pauses after a week idle) in phase 2 when we need history,
  time scrubbing, or per-user state.

### Why static-first
- $0 at any traffic level the free CDN tiers allow.
- Nothing to keep alive, nothing to get paged about.
- The browser only ever downloads one small JSON file per refresh.
- Swapping in a database later changes the ingest job's output target, not the
  frontend contract.

## Cost

| Phase | Monthly cost | What triggers the next cost |
|---|---|---|
| 1. Prototype | **$0** | Nothing. Only unavoidable spend is a domain (~$10-15/yr) when we want one. |
| 2. Clustering + history | $0 to ~$25 | A paid Postgres tier if the free tier's storage or compute runs out |
| 3. Rich media + time scrubber | ~$25 | Possibly a small VM (~$5-10) if GitHub cron latency becomes a problem |
| 4. Product layer | $25-100 | Auth provider, email, higher CDN/R2 usage |

BigQuery's free query allowance (1 TB/month) is enough for research and backfills but
should not be in the live path.

## Phases

### Phase 1: Prototype (2-3 weeks)
Goal: prove the map is compelling to look at.

- [ ] Repo scaffold in `C:\Users\acevi\Development\today-on-earth`
- [ ] Ingest script: fetch latest GDELT Events + GKG, bin into cells, emit `latest.json`
- [ ] GitHub Actions workflow on a 15-min cron, pushing the snapshot to R2 (or repo)
- [ ] Static page: MapLibre, dark minimal style, Natural Earth outlines, heatmap layer
      from `latest.json`
- [ ] Click a hot cell: side panel listing headlines with outlet, country, language, time
- [ ] "Why is this hot?" line per cell: N articles, M outlets, K countries
- [ ] Deploy to Cloudflare Pages
- Done when: a stranger can open the URL, see the planet glowing, and click into a
  hotspot to read what is happening there.

### Overnight autonomous run (2026-10-21, started ~05:35 UTC)

The user authorized working through the whole roadmap unattended. Sequence, each
step = build -> fresh review -> verify -> commit/push -> confirm deploy:

1. Finish Phase 2 slice 1 (replay + permalinks + cache-carried state). Confirm the
   cron fires and the cache carry works across two runs.
2. Richer base map when zoomed in (Natural Earth 10m admin-1 + populated places).
3. Stories inside a cell (GKG persons/orgs/themes + title tokens; no LLM).
4. Baseline mechanics: per-cell daily counts carried in state; relative heat once
   7 days exist.
5. Phase 3 pieces that cost nothing: YouTube embeds from GKG SocialVideoEmbeds,
   earthquake and disaster layers (USGS, ReliefWeb) fetched client-side.
6. Trust and polish: a methodology page (how heat is computed, what is not shown),
   meta/OG tags, first-paint speed, phone layout (pan selected cell into view).
7. If time remains: a workflow that renders the day's frames to an MP4 for TikTok.

Out of bounds without the user: anything that costs money or needs a new account,
accounts/auth on the site, store listings.

## Phase 2: Time and stories (re-scoped 2026-10-21 for "impress the first visitor")

The two things a first-time visitor will remember: watching a day sweep across the
planet, and clicking a glow and seeing a *story* with every outlet behind it rather
than a list of headlines. Both can be done static-first, still $0.

1. **Time scrubber / replay.** Keep the last 96 `heat.json` snapshots (one per
   15 min, ~200 KB each, ~20 MB total) in the deploy as `data/history/<stamp>.json`
   plus an index. The site gets a scrubber under the map and a play button that
   sweeps the last 24 h; heat crossfades between frames. This is also the raw
   material for the TikTok time-lapse clips.
2. **Stories inside a cell.** Group a cell's articles into stories using what GKG
   already gives per article: shared persons, organisations and themes within a
   time window, plus title-token overlap. Each story shows its headline set,
   outlet count, country and language spread, and tone range. Unclustered articles
   stay listed below. No LLM, no editorial text.
3. **Permalinks.** `#c=<cell>&t=<stamp>` so a view can be shared and the clips can
   link to the exact moment.
4. **Richer base map when zoomed in.** Natural Earth 10m admin-1 boundaries and
   populated places (small, static) appear from zoom ~4, so zooming in feels like
   arriving somewhere. PMTiles stays the later upgrade.
5. **Hot relative to baseline.** Keep a compact per-cell daily count table in the
   deploy; once there are 7+ days, weight heat by today vs. the cell's own median so
   a quiet region lighting up shows. Defers the Postgres decision again.

Order: 1 -> 3 -> 2 -> 4 -> 5. 1 and 3 are a few days; 2 is the hard one.

**Status 2026-10-21 ~05:40 UTC:** items 1 and 3 are built, reviewed (8 findings, all
fixed) and pushed (commits e45d14b, 2ea3053). State and history now travel through
the Actions cache instead of Pages (a 24h state is ~37 MB; fetching it 96×/day from
Pages would have blown the 100 GB/month soft limit). First cache-seeded run passed at
05:38 UTC. Repo variable `ALLOW_COLD_START` gates cold starts: true for seeding,
to be set false once the warm carry is proven. Items 2 and 4 are in progress.

**Status ~05:50 UTC:** warm carry proven (run at 05:39 restored the cache, 2 frames),
`ALLOW_COLD_START` set to false. Item 4 (detailed base map) pushed as 67c1e3a. Item 2
ingest side pushed as 912f4a0: 5,704 stories across 3,618 cells in under 5 s on a
24h window; quality is good for top stories, with some bleed and 60-70% of busy
cells' articles unclustered (12-story cap). Frontend stories panel in progress.
Baseline (item 5) and video fields specified in the contract and in progress on the
ingest side. The scheduled cron has still not fired on its own (only manual runs);
new-repo schedules are known to lag by hours.

### Phase 3: Rich media and time
- Embedded video where the platform allows embeds (YouTube etc.).
- Time scrubber: replay the last 24 hours / 7 days.
- Specialty layers: earthquakes, fires, disasters, toggleable.

### Phase 4: Product layer
- Accounts, saved regions, alerts.
- Mobile-friendly layout, then possibly native apps.
- Shareable permalinks to an event or a region at a moment in time.

## Monetization (discussed 2026-10-21, nothing built)

Ground rule: the free map stays complete, and nothing paid ever changes what glows.
Revenue has to come from convenience, depth, and distribution, not from attention
steering. Every option below also needs an audience first; the TikTok channel is the
distribution engine that makes the rest possible.

Ranked by fit and by how little traffic each needs:

1. **Data / API for organisations** (newsrooms, researchers, risk and intel teams,
   NGOs). GDELT is free, but the cleaned, binned, de-duplicated, outlet-labelled
   hourly snapshots are the product. Highest revenue per customer, smallest audience
   needed. Validate early: pitch 5 people before building anything. Confirm GDELT's
   attribution/commercial terms before selling derived data.
2. **Pro subscription** for individuals: region alerts, 7 to 30 days of history with
   the time scrubber, saved views, permalinks. Needs Phase 2 (DB) and Phase 4
   (accounts). Realistic price band: a few dollars a month.
3. **Embeddable widget** licensed to publishers and newsletters, preset to their
   region, with attribution back to the site.
4. **One sponsor slot**, clearly labelled, in the header or panel footer, never on
   the map. Flat weekly or monthly fee once traffic justifies it.
5. **Supporters / donations** as a bridge while revenue is zero. "Built in public"
   content on TikTok feeds this.
6. **TikTok creator payouts** on the time-lapse clips: small, but nonzero, and the
   clips are the funnel for everything above.

Not doing, ever: sponsored hotspots, paid outlet placement, selling user data,
display ad networks (they pay little for news traffic and wreck the instrument feel),
narration that editorialises.

Order of operations: grow the audience with daily clips -> pitch the data product
to a handful of organisations -> build Pro once Phase 2 history exists.

## TikTok channel (idea logged 2026-10-20, not yet planned)

The user has a TikTok account and wants to post news coverage there. Possible shape:
a daily or hourly time-lapse of the map ("Today On Earth, 20 October") as a short
clip, with hotspots called out. This doubles as the platform's marketing funnel. Needs:
a headless render of the map to video, and a decision on whether clips have narration
(which would be a voice, see the promise above) or stay purely visual with on-screen
counts. To be planned after Phase 1.

## Phase 1 build decisions (2026-10-20)

- **GKG is the only feed in phase 1.** It carries URL, source domain, page title,
  language, tone and locations per article, which is everything the hotspot list
  needs. Events can add actor/event structure in phase 2.
- **GitHub Pages instead of R2** for the snapshot. The 15-min workflow runs ingest,
  builds the site with the data baked into `web/dist/data/`, and deploys Pages. No
  cloud credentials needed. The rolling-window state file is fetched back from the
  live site on each run. R2 remains the upgrade path if the artifact grows too large.
- Data contract between ingest and frontend: `docs/DATA-CONTRACT.md`.
- Stack: Node 24 + TypeScript for both halves; Vite + vanilla TS + MapLibre GL JS
  for the site; H3 resolution 3 cells; Natural Earth 110m outlines as the base map.

## Phase 1 status (2026-10-20 night)

Built and verified locally, nothing committed yet:
- `ingest/`: GKG + translingual feeds, rolling 24h window, H3 res-3 cells, contract
  check script, 25 unit tests passing. Reviewed by a fresh-context pass; the two
  real findings (silent cold start on a failed state fetch, wrong `windowHours` after
  a cold start) are fixed. A 6-hour cold start fetched 41 files in ~50 s:
  36,281 articles (8,385 country-only, left unplaced), 1,519 cells.
- `web/`: tile-free MapLibre map, heat + dots + labels, cell panel, bottom sheet on
  phones. Build passes. Verified in the browser with real data: heat renders, click
  opens the Washington cell with 1,456 articles from 873 outlets.
- `.github/workflows/snapshot.yml`: 15-min cron -> ingest -> build -> Pages deploy.
  **Deployed 2026-10-21 04:47 UTC.** Repo: https://github.com/currentsbtw/today-on-earth
  (public). Live: https://currentsbtw.github.io/today-on-earth/ . Pages source =
  GitHub Actions, repo variable `SITE_URL` set. First run cold-started (6h, 44 files,
  14 s) and deployed; the site rendered with no console errors. The cron takes over
  from here; the first warm run (state fetched back from the live site) is the next
  thing to confirm in the Actions tab.

Follow-ups noticed during the build (not blockers):
- `state.json.gz` is ~0.8 MB per hour of window; at 24h it will be ~20 MB fetched
  from Pages on every run. Fine for now; trim fields or move to R2 if it hurts.
- `totals.unplaced` is in the data but the header does not show it yet. Showing
  "N articles · M could not be placed" is part of the coverage-gap promise.
- Phone layout: the bottom sheet covers part of the world and the selected cell is
  not panned into view.
- Map first paint takes several seconds in a background tab; fine in a focused one.
- "Washington, Washington, United States" is GDELT's own name for DC; the short label
  shows "Washington". Could special-case later.
- Main JS bundle is ~1 MB (289 KB gzipped), nearly all MapLibre.

## Open questions

- Name/domain availability for "Today On Earth" (check trademark and domains before
  launch).
- Whether to add the Events feed as a second heat weight (actor/event based) once
  phase 1 shows how GKG-only heat behaves.
- Cell size for the heatmap: H3 resolution 3-4 at world zoom, finer when zoomed.
- How to weight "hot": raw article count favors big-media regions. Consider count
  relative to a 30-day baseline for that cell so a quiet region lighting up shows.

## Ideas parking lot

(Add any floated ideas here during sessions so nothing is lost.)
