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

### Phase 2: Events, not points
- Cluster articles into events (shared GDELT event IDs first, then GKG themes +
  location + time window).
- Per-event coverage breadth: outlets, countries, languages, tone spread.
- Coverage-gap shading for regions with few sources.
- Postgres (Neon) for 7-30 days of history.

### Phase 3: Rich media and time
- Embedded video where the platform allows embeds (YouTube etc.).
- Time scrubber: replay the last 24 hours / 7 days.
- Specialty layers: earthquakes, fires, disasters, toggleable.

### Phase 4: Product layer
- Accounts, saved regions, alerts.
- Mobile-friendly layout, then possibly native apps.
- Shareable permalinks to an event or a region at a moment in time.

## Monetization (later, logged now)

- **Free tier** stays the full map; monetization never compromises the no-voice promise.
- **Pro**: alerts, long history, time-lapse exports, API access for researchers and
  newsrooms.
- **Embeds**: licensed map widgets for other sites.
- **Sponsorship / non-targeted ads** only if clearly separated from the map. No
  sponsored "hot spots", ever.

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
  Not yet exercised (needs the repo pushed to GitHub, Pages set to "GitHub Actions",
  repo variable `SITE_URL`).

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
