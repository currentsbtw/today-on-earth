# Today On Earth — Plan

Last updated: 2026-10-21

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

## Decisions from the 2026-10-21 review

- **No free-text comments, ever.** They would become the loudest editorial voice on
  the map, draw brigading and state-run accounts, and need accounts plus paid
  moderation.
- **Outlets' own YouTube clips per cell stay** (shipped), ordered by recency and
  outlet variety, never by views.
- **"Submit a missing source" is approved in principle but deferred** until there is
  an audience. Shape: reader-submitted links behind a Cloudflare Worker + Turnstile;
  article-level auto-accept labelled "reader-submitted" that never changes heat;
  outlet-level human review against published criteria, with a public decision log.
  It would be the project's first server-side piece and ongoing moderation work.
- **Native apps removed from the roadmap.** The web works on phones.
- **Data/API sales are last, not first** (see Monetization).

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

## Morning report (2026-10-21, written ~06:40 UTC; see the final status line below)

What shipped overnight, all live at https://currentsbtw.github.io/today-on-earth/ :

| Area | What | Commit |
|---|---|---|
| Replay | 24h scrubber + play, permalinks `#c=&t=` | 2ea3053 |
| Data carry | state/history/baseline via Actions cache, not Pages | e45d14b |
| Base map | 50m shapes, state lines, city + country labels when zoomed | 67c1e3a |
| Stories | per-cell story clustering (ingest) + story cards (web) | 912f4a0, 4cfd59f |
| Trust | methodology page, OG/Twitter tags, og.jpg | 54ee892 |
| Media | YouTube click-to-load cards (no request before click) | 54ee892, 6b6c7de |
| Baseline | per-cell 7-day median + "vs. normal" mode (shows after 3 full days) | ba5901f, 9330c16 |
| Layers | USGS M2.5+ quakes toggle | 9330c16 |
| Phone | sheet with handle, cell eased above the sheet, tap targets | 9330c16, 9dc4749 |
| Clip | clip.html + render/ + clip.yml daily mp4 on release `clips` | 2f1d5eb, 8bfaa70 |
| Cron | keepalive job chains runs while GitHub's schedule stays silent | 9d8a3e1, 8bfaa70 |
| A11y | keyboard Places list, focus rings, contrast, lang, DOM order | 9dc4749 |

Reviews: three fresh-context code reviews (replay; web features; ingest/workflows/
render) and one two-assessment design critique (27/40 before fixes; archive in
`.impeccable/critique/`). Every confirmed finding was fixed or consciously deferred
(listed under follow-ups).

Things only you can decide or do:
1. **Cron.** GitHub's `*/15` schedule never fired in 2 hours. The keepalive chain
   keeps snapshots flowing (~every 14 min) and costs nothing on a public repo.
   **Decided 2026-10-21 morning: keep the keepalive chain.** Revisit (external
   scheduler + fine-grained PAT) only if gaps over 30 min appear in the Actions
   history. A cancelled run breaks the chain; restart with a manual dispatch.
   Kill switch: repo variable KEEPALIVE=false.
2. **og.jpg** was captured on a 1-hour window and looks sparse. Recapture after a
   full 24h: `node scratchpad/scripts/cdp-og.mjs` or ask me.
3. **Clips.** `clip-YYYY-MM-DD.mp4` appears daily on the `clips` release (00:20 UTC
   or the first keepalive after it). Posting to TikTok is manual. Watch the first
   full-length one for pacing (8 fps, 96 frames ≈ 12 s + 2 s hold).
4. **"vs. normal"** appears by itself once three complete UTC days of baseline exist
   (earliest Friday 2026-10-24).

Final overnight status (07:07 UTC): 19 commits on main, last 77c88a7; the live site
runs 0d3458c with 77c88a7 deploying on the next chained run. Not done: og.jpg
recapture (needs a full window), a second full critique round (one bounded
confirmation was done on the live site instead), Phase 4 accounts (out of bounds).
Deferred follow-ups: story bleed and the 12-story cap, "City Of X" prefixes inside a
name part, pause-others when two videos play (done), tooltip not announced to screen
readers, land outline before first paint, native admin names ("Moskva"); phone: on an
emulated 375x812 viewport none of three loads of the live site painted heat within
10 s (two still said "loading", header totals shown, no console errors); unverified
on a real phone, check on the iPhone before the first clip goes out. Later the same day
a desktop load on a cold cache also took ~20 s before heat painted (3,198 cells, 441 KB
heat.json), so this is most likely first-paint time, not a phone bug: measure and trim
first paint.

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

**Status ~06:15 UTC:** pushed since the last note: stories panel + label dedupe
(4cfd59f), about page + OG/Twitter metadata + YouTube embeds (54ee892), ingest
baseline + video (ba5901f), relative heat + USGS quake layer + phone sheet +
clip.html (9330c16), and a keepalive job (9d8a3e1) that dispatches the next
snapshot itself while the cron stays silent (kill switch: repo var KEEPALIVE=false).
Live site has all of it except what the next deploy carries. In progress: the daily
time-lapse clip pipeline (render/ + clip.yml) and a fresh review of the web changes.
Remaining from the overnight list: review fixes, a design polish pass, recapture
og.jpg once a full 24h window exists, and the morning report.

**Status ~06:30 UTC:** keepalive chain confirmed working (run 39555000270 was
dispatched by the previous run's keepalive job, not by a person). Clip pipeline
pushed (2f1d5eb) and run green in CI at 540x960: `clip-2026-10-21.mp4` + poster on
the GitHub release tagged `clips`. Web review fixes pushed (6b6c7de). Ingest review
found 8 items (keepalive stand-down logic, clip fallback trigger, video rule drift,
baseline edge cases, rollback docs); fixes in progress. Design critique (two
isolated assessments) in progress.

## Phase 2b: Data credibility (from the 2026-10-21 review)

Each item is something a skeptical journalist would screenshot. Current fact first,
then the fix.

- [ ] **Archive every processed snapshot from now on.** Today `history.ts` keeps 24 h
      of replay frames and `baseline.ts` keeps 14 days of per-cell daily counts;
      nothing older survives. Fix: push each run's heat frame (and ideally the cell
      detail files) to durable storage (a GitHub release per month, or R2 when
      needed) so a future history, Pro or data product has data from launch day.
- [ ] **Collapse reprints.** Today `aggregate.ts` dedupes only by identical URL, so one
      wire story on 300 sites counts 300 times; the per-outlet cap of 5 applies only
      to the clicked-cell list, not to heat. The review saw a California story at
      "61 outlets, 1 country" with the same headline repeated. Fix: collapse articles
      with the same normalised headline within a cell (count distinct outlets per
      reprint group), show both numbers (articles and distinct outlets), and keep the
      methodology page's "brightness = article count" claim honest by stating exactly
      what is collapsed. Switching heat wholesale to distinct outlets is a bigger
      promise change and needs the methodology page rewritten with it; do reprint
      collapse first.
- [ ] **International attention per cell:** the number of countries other than the
      place's own whose outlets covered it. Add to cells and the heat file. Nobody
      else publishes this on a map, and it is the basis of the "Heard across the
      planet" broadcast slot.
- [ ] **Refresh the outlet-to-country list.** Today `domains.ts` vendors GDELT's May
      2018 list; outlets launched since show no country, and some are wrong (storm.mg,
      a Taiwanese outlet, is labelled Madagascar from its domain). Fix: fetch a newer
      GDELT outlet list if one exists, else supplement with a maintained open source,
      and label unknowns.
- [ ] **Aggregator networks.** asiabulletin.com (labelled CN), japanherald.com (JP) and
      israelherald.com (IL) appear to be one network and inflate country counts. Fix:
      detect and collapse known networks (a small maintained list).
- [ ] **State-level placement.** Articles naming only "California" or "Texas" glow at
      the state's centre. Consider leaving region-only articles unplaced like
      country-only ones, or marking them distinctly.
- [ ] **Story grouping: tighten.** Already a follow-up (story bleed, the 12-story cap).
      The review saw 888 of 1,420 Washington articles unclustered and an unrelated
      pardon article inside the Trump whistleblower story.
- [ ] **Translate link** for non-English headlines.

Already shipped from the review's list: methodology page ("How it works", 54ee892);
keepalive against GitHub's scheduler (9d8a3e1); panel title place-name cleanup
(0d3458c); raw entity tags demoted to people/organisations first, themes only as
fallback (77c88a7); phone layout fills portrait height (map.ts); first-visit hint
explaining the glow (9dc4749); earthquake layer (built, off by default; the review's
"defer" is moot).

**Status 2026-10-21 ~15:30 UTC:** four of the eight items shipped.
- Archive: every snapshot now goes to a daily GitHub release (`archive-YYYY-MM-DD`):
  heat.json.gz per run, cells tarball once a day. First real run confirmed (15:00 UTC:
  91 KB + 7.8 MB). README "Archive" and the contract describe it.
- Reprint collapse: per-cell `u` (distinct headlines), `totals.reprints`, `reprints`
  per article; lists show each headline once with "+N reprints". Heat still uses `n`.
  The suffix rule strips a trailing outlet name only when it matches the article's own
  outlet domain or is at most two words (a parenthetical dash clause is kept). On a
  2-hour window: 2,370 of 25,766 articles were copies. Most copies seen so far are one
  outlet publishing the same headline under many URLs (index.hr, 53 URLs), not wires.
- International attention: per-cell `i` and `home` (the place's own country from GKG
  location country codes), stories carry `i` too; the panel reads "heard in N other
  countries". State file v4 carries the location country; v3 states still load.
- Outlet list: layered lookup (hand overrides > GDELT 2018 > ccTLD with a deny list and
  national second-level forms > a reduced GDELT 2015-2021 mention list). No newer
  curated GDELT list exists. storm.mg -> TW; the 333 Big News Network portals are
  forced to "unknown" so they stop inflating country counts (collapsing them to one
  outlet is still open). Unknown-country share after: 2.3% of articles, 0.8% once
  the deliberate Big News Network blanks are excluded. `ingest/scripts/unknown-outlets.ts`
  lists the top unknown domains for growing the overrides.
Deferred from the review of this work: `i` equals `c` while a cell's home country is
unknown (sea cells, and carried records during the first 24 h after deploy), so "heard
in N other countries" can overstate there; reprint key counts are computed twice per
cell; the panel says "heard in no other country" even when home is unknown.
Remaining Phase 2b items: aggregator network collapse, state-level placement, story
grouping, translate link.

### Phase 3: Rich media and time
- Embedded video where the platform allows embeds (YouTube etc.).
- Time scrubber: replay the last 24 hours / 7 days.
- Specialty layers: earthquakes, fires, disasters, toggleable.

### Phase 4: Product layer
- Accounts, saved regions, alerts.
- Mobile-friendly layout (shipped as the phone sheet; native apps removed 2026-10-21).
- Shareable permalinks to an event or a region at a moment in time.

## Monetization (discussed 2026-10-21, nothing built)

Reordered 2026-10-21 after the methodology & business review (Claude Doc, reviewed
commit 8bfaa70).

Ground rule: the free map stays complete, and nothing paid ever changes what glows.
Revenue has to come from convenience, depth, and distribution, not from attention
steering.

Why audience first, data last: the raw input is free to everyone, GDELT Cloud and
World Monitor already sell processed GDELT, and the hex snapshot alone is rebuildable
in a weekend. Defensibility comes only from an archive, cleaner data, and a measure of
our own (Phase 2b), and all three take months.

Ranked, audience first:

1. **Daily broadcast + clips** on TikTok, YouTube Shorts and Instagram Reels
   (marketing, not a revenue line), and a **daily email newsletter** (owned audience).
   See Daily broadcast and Clips and distribution below.
2. **Supporters / membership.** A paid newsletter tier or supporter membership gets
   most of the revenue without logins.
3. **One sponsor slot**, clearly labelled, in the header or panel footer, never on
   the map. Flat weekly or monthly fee once traffic justifies it.
4. **Embeddable widget** licensed to publishers and newsletters, preset to their
   region, with attribution back to the site.
5. **Pro** for individuals: history with the time scrubber, region alerts, saved
   views. Only once the archive (Phase 2b) and accounts (Phase 4) exist. Realistic
   price band: a few dollars a month.
6. **Data / API for organisations** (newsrooms, researchers, risk and intel teams,
   NGOs), only after 6-12 months of archive and a measure that is ours (international
   attention, coverage gaps over time). Keep the "pitch 5 people before building
   anything" test, but as an early validation step, not as the first product.

Competitors (from the review):

| Competitor | What it is | Price |
|---|---|---|
| GDELT GEO API and live map | GDELT's own map of locations in the news | Free |
| GDELT Cloud | Processed GDELT products: events, stories, entities, alerts | Paid plans; resale needs a license |
| World Monitor | Open-source global intelligence dashboard (GDELT conflict data, shipping, flights, markets) | Free; Pro from $39.99/mo; API from $99.99/mo |
| Liveuamap (per World Monitor's comparison) | Conflict and security news on a map | Free tier; API $150/mo; enterprise from $1,000/mo |
| Dataminr, Recorded Future | Enterprise real-time alerting and risk intelligence | Enterprise, undisclosed |
| Ground News | Consumer app comparing outlets' coverage and bias per story | Subscription |

World Monitor's prices were checked on 5 September 2026 and may have changed. Confirm
GDELT's commercial and attribution terms before selling anything (not legal advice).

Not doing, ever: sponsored hotspots, paid outlet placement, selling user data,
display ad networks (they pay little for news traffic and wreck the instrument feel),
narration that editorialises.

Order of operations: grow the audience (broadcast, clips, newsletter) -> supporters
and one sponsor -> pitch 5 organisations to test the data assumption -> Pro once
archive + accounts exist -> data/API last.

Open question: the monthly income that counts as "a living", which sets the 3- and
6-month checkpoint targets (followers, subscribers, returning visitors).

## Daily broadcast (decided 2026-10-21, not built)

A headlines block framed as a distant spectator's broadcast, built from six fixed
slots filled by published rules. Each slot shows a real outlet's own headline plus the
coverage numbers. Nothing is written or summarised by us or an AI; the voice lives
only in the frame and the numbers.

| Slot | Rule | Guardrail |
|---|---|---|
| Loudest signal | The story with the most articles in the last 24 hours | Count distinct outlets, so reprints don't win |
| Heard across the planet | The story covered by the most different countries | Countries other than the story's own |
| Rising | The cell most above its own normal level | Needs 7+ days of baseline; minimum article count |
| Brightest (renamed "Most positive tone" 2026-10-22) | The most positive-toned story with real coverage | Minimum outlets and countries, so press releases and puff pieces don't win |
| Ordinary life | The most-covered story outside conflict, politics and disaster themes | Theme lists published; sports, science, festivals, weather and food qualify |
| Faint signal | A story from a usually quiet region that broke through | Region in the lowest coverage band by baseline; minimum outlets |

Example line: "Signal detected over Nairobi: 214 reports from 61 transmitters in 19
languages", with the outlet's headline beneath and a link into the cell.

Slot choice and the theme lists are a framing decision, made once and published on
the methodology page. The ordinary and bright slots exist because news skews toward
conflict. Keep it non-sentimental; no "good news" label.

The broadcast is also the newsletter body and the clip script.

Depends on: story grouping (Phase 2 item 2, tightened in Phase 2b) and the 7-day
baseline (Phase 2 item 5).

- [x] Build the six slots from the stories data (`/data/broadcast.json`, 2026-10-21)
- [x] Publish the slot rules and theme lists on the methodology page
- [x] Add the broadcast to the daily clip (end cards); the newsletter is not started

**Status 2026-10-21 evening:** built and verified locally; rules as published in
DATA-CONTRACT.md "Broadcast" and on the methodology page. Decisions made while building:
- Every slot needs at least 3 distinct headlines. "Loudest" ranks by independent reports,
  min(distinct headlines, outlets): distinct outlets alone let 53 Newsquest sites with one
  wire copy win, distinct headlines alone let one outlet (iheart.com, 26 station-suffixed
  copies) win.
- Rising and faint gate on 3 complete baseline days, the same gate as "vs. normal" (the
  review said 7); earliest 2026-10-25 for the current carry.
- "Ordinary life" uses per-article kinds (conflict, politics, crime, disaster) computed
  from the raw GDELT themes before the deny list; CRISISLEX themes are excluded because
  CRISISLEX_CRISISLEXREC alone tags 35% of articles. Measured shares: conflict 33%,
  politics 49%, crime 24%, disaster 9%, any 67%. On 2-hour windows the slot was mostly
  empty (few stories reach 10 outlets); unverified on a full 24 h window.
- Signals panel: header button, `#signals` permalink, six cards, "Open <place>" into the
  cell. Clip: one card per filled slot (3 s) plus an end card with the site address.
Live 2026-10-21 19:56 UTC: 4 of 6 slots filled on a 20 h window; the manual clip run wrote
clip-2026-10-21.mp4 (24 s: 64 frames + 4 cards + end card) to the clips release. Watch
items: "ordinary life" picked a Ukraine-talks story (come-on.de), so the politics theme
family misses some tags; tune the kind lists on a full day of data. A place name came
through as "Ad Daw?Ah" (GDELT encoding artefact): extend cleanPlaceName.
Open: the newsletter; the clip's cards are static (fly-to zooms are the clip v2 item).

## Clips and distribution (idea 2026-10-20, re-planned 2026-10-21)

The clip pipeline exists: `render/` + `clip.yml` render a 1080x1920 daily mp4 to the
GitHub release `clips`. What remains:

- [x] **Clip v2.** Committed 2026-10-22 (5209725), green in CI 2026-10-23; decisions and
      status below under "Clip v2".
- [ ] **Captions first.** Burned-in captions, no synthetic narration for now:
      platform rules on labelling AI voices are still moving, and captions carry the
      numbers on their own. Revisit narration (Piper, numbers and outlet headlines
      only) later.
- [ ] **Uploads.** YouTube Shorts via the Data API (100/day quota); Instagram Reels
      via the Graph API from a public video URL; TikTok manual until the Content
      Posting API audit passes. A preview-and-approve step for the first months.
- [ ] **Rights rules for clips.** No outlet footage or stills. No stock footage for
      specific stories. Only our own map render, headline text with outlet credit,
      and public-domain or openly licensed imagery (NASA, FEMA/NOAA, Sentinel with
      attribution, Wikimedia Commons per-image), with a quick rights check before any
      third-party image is used.
- [ ] **Daily email newsletter** carrying the broadcast. Pick a provider with a free
      tier.
- [ ] **Name/domain.** Trademark check and domain purchase before the audience grows.
- [ ] **Stale-map alert** so a GDELT or scheduler failure is known within an hour.
- [ ] **Analytics and checkpoints.** Free, privacy-friendly analytics; checkpoints at
      3 and 6 months.

### Clip v2 (started 2026-10-22)

Why: the v1 portrait clip is a 2:1 world band in the middle of a 9:16 frame (about 29% of
the height), the signal cards are stills that cut in from nowhere, and the time-lapse has
no caption beyond the clock. Decisions, made before building:

1. **The portrait time-lapse fills the frame.** The map window runs from just under the
   top text (wordmark, date, clock) to the top of the bottom safe strip, with the totals
   inside the plate on its lower rule as in v1. The world fills the window's height (the
   same height-fill the live site uses on phones), so about 60% of the globe's width is
   in view at once, and the camera pans west over the 24 hours following local noon: the
   centre longitude of a frame at time T (UTC) is 180 - 15 x hours(T), so the place under
   the midday sun is always in the middle of the frame. One full turn per clip. Landscape
   frames keep the fitted world and do not pan.
2. **Fly-to per signal, stepped.** After the last time-lapse frame, each filled slot gets
   a flight of 12 frames (1.5 s at 8 fps) from the previous camera (the last time-lapse
   frame, or the previous slot's cell) to its cell at the card zoom, along a van
   Wijk-style path (zoom out, travel, zoom in) sampled at fixed steps. During the flight
   the frame keeps the time-lapse layout and shows only the slot label as a caption; on
   arrival the card layout (band, sentence, headline, outlet) paints in one step. The
   first flight frame is the last time-lapse frame's view plus the caption, so the cut is
   invisible. No return to the world between slots; the end card follows the last slot.
3. **Callout on arrival.** The cell's hexagon outline (v1) plus the live site's reticle
   and "NAME · n" tag at the cell's centre, so the card points at a named place.
4. **Captions are the card.** No narration. The time-lapse carries the clock and the
   totals; the flight carries the slot label; the card carries the fixed sentence (the
   numbers) and the outlet's own headline. Nothing new is written.
5. **Renderer.** Flights are driven in-page (one load per slot, then a step function the
   renderer calls per frame and screenshots) rather than one page load per frame, so a
   six-slot clip adds about 72 frames without adding minutes. Cards and flights are still
   shot before the time-lapse frames, pinned to the snapshot the clip was planned from.
   New `--fly <seconds>` option, default 1.5; 0 restores v1 cuts.

Length: 64 time-lapse frames (8 s) + up to 6 x (1.5 s flight + 3 s card) + 3 s end + 1 s
hold, about 39 s at most.

**Status 2026-10-23: committed (5209725), ran green in CI.** The scheduled run at
2026-10-23 00:24 UTC (run 39877953928) shot 94 frames, 0 bad, flew into 4 signal cards and
wrote 262 frames + 1 s hold, 33.8 s, published as `clip-2026-10-22.mp4` on the `clips`
release. Built on 2026-10-22: clip.ts: portrait `?t=`
frames fill the window's height and pan with local noon (createClipMap got a `wrap` option:
world copies on, longitude free; the live map is untouched); `?signal=<id>&from=<ref>&fly=<F>`
opens on step 0 and `window.__clipStep(i)` steps a flyTo path ported from MapLibre 6
(web/src/flight.ts, rho 1.42, default easing, sampled at fixed steps); the arrival offsets the
camera instead of repadding; the callout (hexagon, reticle, "NAME · n" tag) is on every
card. Renderer: `--fly` (default 1.5, 0 = v1 cuts, at most 60 stills), planCards carries
`fly` and `from`, captureCards steps and shoots each flight, retries a failed flight whole and
re-chains the next flight past a skipped card; clip.yml passes `--fly 1.5`. Verified locally
on the 100-frame fixture history: 540x960 and 960x540 renders (100 + 4 x (12 + 24) + 24 =
268 frames each, none bad or skipped), the first flight's step 0 differs from the last
time-lapse frame in 0 pixels of the plate outside the caption, and a chained flight's step 0
differs from the previous card only by that card's callout. Decided differently: (a) portrait
window tops no longer take the 25% reserved band as a floor (the v1 card rule had it, which
would have kept the window where v1 put it), so the card and the time-lapse share their top
edge and only the bottom moves on arrival; (b) the caption sits exactly where the card will
put its header (it stays put when the card paints in), which for a tall card is mid-frame
rather than at the bottom of the plate, and moves up only to clear the totals; (c) the
renderer shoots steps 1..F, so the first output flight frame is already one step in; step 0
is the page's load state; (d) the direct `--fly 0` card also gets the callout. Open: an
encoded mp4 has not been watched (no local ffmpeg); the tag is a fixed 11px label, small at
1080x1920 (the existing label-size follow-up).

Hardening 2026-10-23, from the runs of 2026-10-22/23. (1) The "Install ffmpeg" step's apt
install took 22 min 36 s in run 39877953928 against the 30-minute job timeout (the render
took under 4 minutes). clip.yml now installs a pinned static build (ffmpeg 7.0.2 with
libx264, `ffmpeg-linux-x64.gz` from the ffmpeg-static npm package's GitHub release b6.1.1,
sha256-checked), cached across runs with actions/cache; apt is only the fallback. (2) A
snapshot deploy landing while the cards are shot (about 40 s) drops the oldest frame from
the index and its file from the site, so clip.html reported `unknown frame` and the clip
started one frame short with 1 bad (runs 39818645716 and 39824969992, both dispatched by
hand; keepalive-dispatched snapshots run every ~14 minutes all day). The renderer now
re-reads the index after the cards and drops the frames no longer listed (`stillListed` in
render/src/lib.mjs), so the time-lapse starts at the oldest frame still deployed with none
bad. Frames added by that deploy are not taken: the flights already start from the last
planned frame.

### Clip v3 (ideas 2026-10-23, not decided)

Owner's verdict on the first watched v2 clip (clip-2026-10-22.mp4): not good enough. The
frame rate is low, a first-time viewer has no idea what they are looking at, and the cards
go by too fast to read. Owner's ideas: approach it as a premier content creator would;
background music; clips; show an area on the map, then a zoom animation with all of the
news in that area displayed.

Diagnosis (orchestrator, same day):
- 8 fps reads as stutter on every pan and flight; short-form video is 30 fps.
- No hook. The clip opens on a world of dots with a clock; nothing says what a dot is or
  why to keep watching. The first two seconds have to say what this is.
- Cards hold 3 s for a sentence plus a headline (~25 words): under half the time a reader
  needs (about 4 words/s, plus a second to settle). Four to six cards in a row with the
  same layout is a list, not a story.
- Silent. On TikTok, Reels and Shorts a silent clip is dead on arrival.
- Each signal shows one headline. The data has more: every cell file carries up to 50
  outlet-spread articles, topOutlets and topCountries, and each story has 6 articles.

Proposed shape (one in-page timeline, 30 fps, 30-40 s):
1. Hook (0-2 s): open already zoomed on the loudest cell, dots pulsing, one large caption
   with the day's total ("271,630 articles in 24 hours. Here's where.") or the loudest
   story's place.
2. Context (2-9 s): pull back to the world; the 24-hour time-lapse plays with dots tweened
   between snapshots (not stepped), the noon pan as in v2; a two-line legend caption.
3. Three places, not six (9-33 s, ~8 s each): fly in (1.5 s); the slot label and the lead
   headline paint large and stay at least 4 s; under it the area's other coverage stacks
   in one line at a time (outlet · headline, 3-4 lines from the cell's article list), which
   is the owner's "all the news in that area" idea. The callout tag is sized for 1080x1920.
4. End card (3 s): the site address and totals, as now.
Music: a licensed-for-commercial-use track burned in for Shorts (YouTube Audio Library or
CC0; one ffmpeg flag); for TikTok and Reels consider posting with the platform's own
sound instead, which the platforms favour and which avoids Content ID. Small CC0 sound
effects on fly-ins and dot bursts. Narration stays deferred (see Captions first).
Clips/imagery: outlet footage stays out (rights rules above). Public-domain imagery
(NASA, Sentinel with attribution) as a backdrop behind a place's headlines is a later
stage, not v3.
Renderer: the whole clip becomes one page timeline stepped by `window.__clipStep(i)` (the
v2 flight mechanism generalised), so 30 fps is ~1,000 screenshots without page loads
(about 3-5 min in CI, against ~4 min today for 262 frames with loads). Alternative if
stepping is too slow: Playwright video recording of the in-page animation.
Stages: (1) timeline + 30 fps + hook + readable captions + music; (2) the per-area
coverage stack; (3) imagery and narration, after the rights check.

### Clip v3 stage 1 (decided 2026-10-23, shipped the same day)

Scope: one in-page timeline at 30 fps, a hook, readable captions, a soundtrack. The
per-area coverage stack (stage 2) and imagery or narration (stage 3) are not in it.

Shape (portrait 1080x1920; landscape keeps the fitted world and does not pan):
1. Hook, 2 s: the camera already on the first signal's cell at the card zoom, the cell's
   callout and tag on, the wordmark and date at the top, and one large caption in the
   prose voice: "{articles} articles in 24 hours." over the reading key ("One dot per
   place in the last 24 hours of news."). No clock, no totals.
2. Pull-back, 1.5 s: a flight from the hook camera to the time-lapse camera at the first
   snapshot's time; the caption stays until the time-lapse starts.
3. Time-lapse, 7 s: 210 frames over the day's ~94 snapshots. Frame i is at virtual time T
   (linear from the first to the last snapshot); the camera pans with local noon at T; the
   dots are the two bracketing snapshots' cells with n interpolated linearly (union of
   ids, missing = 0), so the five-step marks change at different frames instead of all
   at once; the clock shows T and the totals interpolate. Key and totals as in v2.
4. Three signals (the first three filled slots in file order), each a 1.5 s flight from
   the previous camera captioned with the slot label, then the card held 5 s: slot
   header, fixed sentence, the outlet's headline (type a step larger than v2) and credit,
   with the cell's hexagon, reticle and tag (the tag's text now scales with the frame).
5. End card, 3 s, then a 1 s hold added by ffmpeg. About 36 s in all.

Soundtrack: generated by the renderer from the timeline, deterministic, no licensing: a
low sine bed (55 and 110 Hz, slow amplitude cycle), a click on every whole UTC hour the
time-lapse clock crosses (about 24 over 7 s), a rising glide under each flight, a short
two-tone blip on each card's arrival, a low hit on the end card, fade in 0.5 s and out
over the last 1.5 s, peak-normalised. `--music <file>` replaces it with any audio file
(looped or trimmed to the clip, faded out); `--music none` makes a silent clip. A
human-made licensed track can be dropped in later without touching the pipeline. The
soundtrack has not been listened to by the orchestrator (no audio device in the loop);
the owner judges it from the first CI render.

Contract between clip.html and the renderer:
- `clip.html?timeline=1&w&h&fps=30&hook=2&fly=1.5&lapse=7&card=5&end=3&slots=3[&max=<n>]`.
  Seconds and fps validated by the page (data-error otherwise). Ready as before:
  body[data-ready="1"], data-error on failure; at ready, frame 0 is drawn.
- `window.__clipPlan()` returns `{ fps, frames, date, lapse: { from, to, snapshots },
  poster, hourMarks, segments: [{ kind, slot?, start, frames }] }`: `date` is the UTC day
  of the midpoint of the time-lapse (the clip's file name), `poster` the index of the last
  time-lapse frame, `hourMarks` the frame indices (counted over the whole clip, inside the
  time-lapse segment) at which the virtual clock crosses a whole UTC hour, `segments` contiguous from 0 with kinds hook, pullback, lapse,
  flight, card, end, summing to `frames`.
- `window.__clipStep(i)` draws frame i (0 <= i < frames) and resolves true once drawn
  (map idle, fonts ready); it rejects on failure. Steps are asked in non-decreasing order
  and the same i may be asked again (a retry) and must redraw the same frame.
- The renderer loads the page once, screenshots every frame, retries a failed step once,
  repeats the previous frame for a frame that fails twice (bad), fails the clip past 10%
  bad, writes poster.jpg at `poster`, generates audio.wav from the plan, and encodes with
  ffmpeg (`-i frames -i audio -c:a aac -shortest`, the hold via tpad as before).
- clip.yml: `--fps 30 --hook 2 --fly 1.5 --lapse 7 --card 5 --end 3 --hold 1 --slots 3`.
  The v2 renderer loop (one page load per frame, `?t=`/`?signal=`/`?end=` driving,
  planCards/captureCards) is replaced; the `?t=`, `?signal=` and `?end=1` page modes stay
  as stills for debugging.
- Fewer filled slots than asked: the clip uses what there is; with none, the hook is the
  world at the last snapshot and the pull-back is the pan to the first.

**Status 2026-10-23 02:17 UTC: shipped (a603084).** First CI render green, run 39888155788:
990 frames at 30 fps, 0 bad, 6.1 min of stepping, the generated soundtrack (33 sounds),
`clip-2026-10-22.mp4` 34.0 s (H.264 + AAC) on the `clips` release. Reviewed before the
commit: the soundtrack's levels made absolute (the mix is only ever turned down), and the
time-lapse keeps every index frame older than the live snapshot instead of dropping the last
entry blind. Known: a page reload mid-run is not recovered (the 10% rule aborts the clip);
the owner has not yet judged the soundtrack or the pacing; stage 2 (the per-area coverage
stack) and stage 3 (imagery, narration) are open above.

Builders: the page (web/src/clip.ts, a new web/src/timeline.ts for the pure plan and
interpolation with node:test tests, clip.css, clip.html, map.ts for the tag size, DESIGN.md
clip sections) and the renderer (render/src/clip.mjs, lib.mjs, a new audio.mjs with tests,
clip.yml, README "Daily clip") run in parallel on the contract above; the orchestrator
integrates against the dev server, then one CI run, and watches the mp4.

### Clip v3 stage 2: silent-first (proposed 2026-10-23; items 1-3 shipped the same day, 1d8facc)

Owner's direction after stage 1: park the audio/music work; make the clip extremely
understandable with sound off (most social video is watched muted). The orchestrator's
proposal, ordered by impact, each item small enough to judge from a still:

1. **Plain words for the slots, and a step count.** "Loudest signal" is house jargon to a
   stranger. On the clip the slot header reads in plain words with its place in the run:
   "1/3 · MOST COVERED STORY", "2/3 · COVERED IN THE MOST COUNTRIES", "3/3 · THE MOST
   POSITIVE STORY" (rising: "FASTEST RISING PLACE"; ordinary: "A STORY OF ORDINARY LIFE";
   faint: "A QUIET PLACE IN THE NEWS"). The site's own labels can stay as they are or follow;
   owner's call. The flight caption names the destination before arrival: "1/3 · MOST
   COVERED STORY → PARIS", so the viewer knows where the camera is going and why.
2. **Numbers as a ledger row, not prose.** On the card the fixed sentence becomes (or gains
   above it) a row of three figures in the totals' register: 456 ARTICLES · 339 OUTLETS ·
   35 LANGUAGES (the slot's own facts from sentenceFacts), with the place name large under
   the header: PARIS. A muted viewer scans figures in under a second; a sentence takes three.
   The voice rule holds: numbers, the outlet's own headline, nothing written about the story.
3. **The time-lapse shows its own progress.** The edge rule already carries 25 ticks: during
   the lapse a marker on the top rule walks the 24 hours (one tick an hour), and the article
   total ticks up at display size beside the clock, so the seven seconds read as "a day
   passing and the count growing" rather than as dots flickering. The key stays.
4. **Stepped reveals in the hook.** Line 1 ("278,481 articles in 24 hours.") paints at 0 s,
   the key sentence at about 0.7 s, the place tag with the callout at about 1.2 s: three
   states, no easing (the Stepped-Motion rule), each directing the eye to the next thing.
5. **The coverage stack reshaped for scanning.** The earlier stage 2 idea (three or four
   extra headlines per card) is too much reading in 5 s with no sound. Instead one line of
   who else covered it: "ALSO: LE MONDE · BBC · NHK · +336 OUTLETS" (top outlets from the
   cell file, names as domains or short names, never logos), painted 1.5 s after the card.
6. **The end card says what to do in one verb** and keeps the address; add the day's four
   totals as now. Nothing else.

Decisions for items 1-3 (2026-10-23), page only, the renderer and its contract unchanged:
- Labels: a clip-only `PLAIN_LABELS` map beside `SLOT_LABELS` in broadcast.ts (the site's
  own labels stay). The card header is "N/M · PLAIN LABEL" (N the card's place among the
  chosen slots, M their count); the flight caption is the same header followed by " → " and
  the place's short name; the header font and rule stay as they are.
- Ledger card: header, then the place's short name as the one large line (Source Sans 3
  600, the headline's size), then the ledger row in the totals' register (number over
  label, as the foot's totals: ARTICLES, OUTLETS and the slot's third fact per
  sentenceFacts: LANGUAGES, or OTHER COUNTRIES for `planet`; two facts for the slots whose
  sentence states two), then the outlet's headline and credit. The fixed sentence leaves
  the card (it stays on the site). fitCard shrinks the whole card as before.
- Time-lapse progress: during the lapse only, a marker on the top edge rule walks the 24
  hours of the day across the 25 ticks (left tick = the first snapshot, right tick = the
  last; a filled white block one tick wide and the tick's height, on whole pixels), and the
  article total stands at display size (the hook caption's size) under the clock with its
  ARTICLES label, ticking with the interpolated totals; the foot row then shows the other
  three totals (places, outlets, countries). The lapse window is measured with this block
  on, and the hook and pull-back use that same window so no camera path moves. Poster
  frames carry the block.

**Status 2026-10-23 17:02 UTC: items 1-3 shipped (1d8facc).** CI run 39990813970: 990
frames, 0 bad, `clip-2026-10-23.mp4` on the `clips` release. Built as decided except: the
progress marker is a square one tick on a side (a 1px block read as another tick), the
place line is title case ("Paris"), and ARTICLES sits beside the display-size figure on its
baseline. The shared window puts the map top ~100px lower in the hook, pull-back and
flights than before, and the card's window top jumps up on arrival (a one-step layout
change at a cut). Items 4-6 open.

Method: judge each item on a 540x960 still with the phone muted (the "mute test"), and on
a 3-second flip through the frames (the "flip test": every frame must say what it is).
Out of scope for this stage: sound, narration, imagery. Rights rules unchanged.

## Where to improve: the "genuinely useful" assessment (2026-10-23, not decided)

Owner's question: how does this become something people genuinely use? The orchestrator
looked at the live site as a visitor (16:57 UTC) and at the open items above. Ordered by
what blocks real use, not by effort:

1. **Trust the dots (placement and grouping).** Opening Paris today shows, as its second
   story, a Korean domestic story from one Korean outlet (newspim.com, 277 articles) placed
   in Paris, newspim.com as Paris's top outlet, and 2,338 of 3,920 articles "not grouped".
   The Places list carries CALIFORNIA, TEXAS, FLORIDA and HOLLYWOOD among cities. Every
   zoom-in is the product's promise ("here is who is covering this place"), and today it
   disappoints often enough that a skeptical visitor leaves. Fixes, in order: per-outlet
   placement sanity (an outlet whose articles all land in one far cell with no other outlet
   agreeing is a geocoding artefact; cap or drop), region-only articles left unplaced or
   marked, the Big News Network / aggregator collapse, headline suffix cleaning ("| Crime
   News", "– Butler Eagle", "- LocalNews8.com"), and story grouping that leaves far fewer
   than 60% ungrouped. Phase 2b's remaining items are these.
2. **First paint.** The cold load shows LOADING for ~10-20 s. Phone visitors from a clip
   leave in 3. Paint the heat before MapLibre (a canvas of dots from heat.json over a
   static outline image), then swap the map in; split the bundle; preload the data.
3. **Findability: real place pages and a topic search.** Everything today is one page with
   a hash fragment: search engines index nothing, so "news about Paris today" never finds
   the site. Static place pages (one HTML file per cell with the day's stories, rebuilt by
   the ingest) make every place a landing page and a shareable link. A topic search ("where
   is Starlink being talked about") over the entities the stories already carry lights up
   the map by topic, which no competitor's product does and the data already supports.
4. **A reason to return without accounts.** An RSS/JSON feed per place (static files, free),
   a daily broadcast page with its own URL and an email (the newsletter item), and the
   clip's end card pointing at the day's broadcast rather than the bare home page.
5. **The signature measure: coverage gaps.** "Heard in N other countries" exists; the next
   step is the gap: which countries' outlets covered a story and which did not, and
   expected-versus-actual coverage per place from the baseline (quiet vs ignored). This is
   the feature that makes the site a resource rather than a view, and it is the one axis
   Ground News cannot occupy (see the positioning note in the session of 2026-10-23).
6. **Distribution surfaces.** An embeddable map widget (publishers embed "where the news is
   today" and link back), OG images per place page, and the clip linking to the place page
   of each signal.
7. **Launch-day gaps.** Two of six signals read "needs more days of history" until
   2026-10-25; the clip and the broadcast should fill them with the next rule-filled slot
   rather than show an empty slot to a first-week visitor.

Not the problem: the visual world, the methodology page, the replay. They are done well.
Recommended order: 1 and 2 first (they decide whether anyone stays), then 3, then 4 and 5
together, then 6.

## Trust the dots (decided 2026-10-23, shipped the same day in d771181)

Measured on 2 h of both feeds (2026-10-23 14:45-16:30 UTC, 28,429 parsed, 20,959 placed)
plus 2 h of Korean daytime (01:00-02:45 UTC) for the Paris case; scripts and outputs in the
session scratchpad (gkg-measure/). What the numbers said, and what is decided:

1. **GDELT's V2Locations order is not text order.** 83% of placed articles list their
   entries out of CharOffset order, so "the first non-country entry" (the current rule) is an
   arbitrary pick. Choosing the non-country entry with the smallest offset moves 29% of
   articles to another cell. **Decision: the primary location is the most-mentioned city
   (type 3 or 4) by entry count; if the article mentions no city, the most-mentioned region
   (type 2 or 5); ties by smallest CharOffset.** This moves 21.5% of articles against the
   current rule and halves region-centred placement (15.6% to 8.0%); nothing becomes
   unplaced that was placed. Region-only articles stay at the region's centre (a later
   decision may unplace them; see 2).
2. **The newspim case is outlet boilerplate, not ordering.** In 51 of 61 newspim.com
   articles the locations contain the identical block France x18, French x4, Paris x2,
   Korea x15; 49 mention no Korean city, so every mention-count rule keeps them in Paris.
   Other outlets land on one place by their own name: razon.com.mx on "La Razon, Chiapas"
   (60%), zol.com.cn on "Guan Cun" (70%), nuevaalcarria.com on London (69%); 26 outlets with
   10+ articles land on one place 60%+ of the time. **Decision: placement is resolved at
   snapshot time, not parse time.** Each record stores its candidate locations (up to 4:
   the best cities and regions by count, each with type, name, country, lat, lon, count,
   first offset; state version 6). At build, for every outlet with 20+ placed articles in
   the window, a (location, exact mention count) pair shared by 50%+ of that outlet's
   articles is that outlet's boilerplate and is skipped for placement; the article takes
   its next candidate or becomes unplaced. The exact-count signature is what separates a
   footer block (always x2) from a local paper that really covers its city (varying
   counts); the rule must catch newspim, razon.com.mx, zol.com.cn and nuevaalcarria.com in
   the samples and must leave leparisien.fr, lemonde.fr and nytimes.com alone. iheart's
   New Jersey block ("New Jersey" x1 on station footers) is caught the same way.
3. **One outlet, one headline, one article.** iheart.com publishes 1,070 copies across 289
   station hosts for 37 distinct headlines (New Jersey 75% iheart, 236 articles, 6 titles);
   index.hr had 53 URLs for one headline. **Decision: `n` and `totals.articles` count one
   article per (outlet, reprint key); copies of a headline by the same outlet are one
   article.** Reprints across outlets still count and still show as reprints. The
   methodology's "Articles: distinct URLs" becomes "distinct headlines per outlet".
4. **Suffixes the reprint rule misses are per-outlet boilerplate.** 52% of suffixed titles
   keep their tail: station names ("| Sunny 102.3 FM"), site slogans ("Periódico
   CiudadCCS"), dates. **Decision: learned outlet tails.** At build, for each outlet, a
   tail (the X of the suffix rule) that occurs on 3+ distinct heads of that outlet's titles
   is its boilerplate and is stripped by reprintKey for that outlet. Tails shared across
   outlets with one head ("professor sees off tiddlywinks title challenger" on 25 Newsquest
   sites) are real headline halves and stay. **Shown titles drop the stripped suffix**: the
   cell file's `title` is the title with the outlet name, short section label or learned
   tail removed (the reprint rule's own decision); the page title stays at the URL. The
   methodology says so.
5. **Stories are capped, not weak.** Every large cell sits at MAX_STORIES = 12 with 20+
   further clusters of 3+ dropped (London: 26 clusters, 109 articles). Removing the cap
   lifts grouped share from ~43% to ~58%; a second pass that attaches each loose article to
   the story whose top-20 title tokens share 3+ with its title adds a little more with no
   bleed seen; relaxing the join rule bleeds. **Decision: MAX_STORIES 30, MIN_STORY_ARTICLES
   stays 3, the second pass is added.** Existing bleed through shared themes (a Figaro
   Ukraine piece inside an Oregon school-shooting story) is measured with one variant
   (themes count half toward the 2-entity join) and adopted only if grouped share drops
   under 2 points.
6. **Big News Network is one outlet.** Its 333 portals (already forced to unknown country)
   are 48% of Taipei's outlets and 22% of New Delhi's. **Decision: a networks file maps
   domains to a network name; `o`, `topOutlets`, `c`/`i` and the outlet caps count a
   network once.** Articles keep their own domain. Only Big News Network is listed now;
   the measured domestic chains (Newsquest, Ippen, MediaNews, Sinclair) inflate `o` at
   home and are left for later.

**Status 2026-10-23 17:57 UTC: shipped (d771181).** 126 ingest tests, typecheck, the contract
checker on a local run and the site build all pass. Measured on the main sample before and
after: totals.articles 28,429 -> 26,772; New Jersey n 316 -> 81 with iheart's share 74.7% ->
3.7%; Taipei o 56 -> 30; London's largest story 93 copies of one item -> a 51-article story
from 47 outlets; grouped share over the same six cells 43.7% -> 50.7%; newspim.com gone from
Paris. Built as decided, with these departures: suffix stripping repeats until no rule
applies (one strip often uncovered a second and the same headline showed twice); the
theme-half join variant was measured (-4.2 points grouped) and rejected; `reprints` on an
article counts other outlets' copies; placement and learned tails group by network. Review
fixes before the commit: a shown title could be null when lowercasing changed a title's
length; empty-name candidates were placed at parse time but dropped on reload; FeatureID-less
spellings were grouped by raw name but identified by cleaned name. Known costs and open
items: a wire outlet's one-mention dateline (Moscow x1 on ria.ru, interfax.ru, aif.ru; Manila
x1; Jakarta x1) is skipped, so articles that mention nothing else are unplaced; outlets whose
block count varies (nuevaalcarria.com, razon.com.mx) are not caught; the two-word suffix rule
cuts quote attributions ("– says Mickoski"); region-only articles still sit at region
centres; domestic chains (Newsquest, Ippen, MediaNews, Sinclair) still inflate `o`. The live
window turns over within 24 h of the deploy (old records keep their stored placement). First
live run 40000620445 (18:07 UTC) green: v5 state loaded, unit counting applied to the
existing window (totals.articles 268,934 -> 242,679), placement checks 0 outlets until new
records carry candidates.

Builders: placement (gkg.ts, types.ts, state.ts, a new place.ts, main.ts, tests) and
counting (reprints.ts, stats.ts, aggregate.ts, stories.ts, domains.ts + data, tests) run
in parallel; docs (METHODOLOGY, DATA-CONTRACT, README) follow once both land. Verification:
the ingest tests, then a local cold-start run on the measured window compared before and
after on Paris's outlets, New Jersey's n, Taipei's o and the grouped share.

## First paint (decided 2026-10-23, shipped the same day)

Measured on the live site (d771181) with Playwright and Edge, resource timings from the page:
- Desktop, real GPU, fast link: every asset is in by 1.8 s (map chunk 289 KB gz, worker 149 KB,
  heat.json 120 KB); the map canvas exists at 1.1 s and the status clears at 1.6 s. The
  "~20 s cold load" in PRODUCT.md was measured in the Claude browser pane, which runs as a
  background page where MapLibre's animation frames pause; it is not what visitors see.
- Phone profile (iPhone 13 Pro Max emulation, slow 4G at 1.6 Mbps / 150 ms, CPU 4x slower):
  DOM 1.35 s, the sentence 2.2 s, heat.json in at 2.0 s, the map chunk starts only at 1.27 s
  (after main.js runs) and lands at 3.2 s, the map canvas at 4.9 s, the worker only once
  MapLibre has constructed, the dots at 7.9 s (harness clock; the page's own clock put the
  same run at 4.6 s against a local server). So the data is on the phone for seconds before
  anything is drawn.

Decisions (web only, no data or ingest change):
1. **Paint the dots before the map.** When heat.json arrives, draw every cell on a plain
   canvas inside the map frame, in the map's own vocabulary (black ground, flat white circles
   in the five stepped radii and opacities by the same log weight, no outlines, no labels),
   projected exactly as MapLibre's first camera will show them (portrait: centre [15, 20] at
   fillHeightZoom(height); landscape: the world fitted; the same mercator helpers and world
   constraint as map.ts), so the swap is invisible. The canvas is removed on the map's first
   frame that has the cells drawn (after setCells and the map's next render), never before.
   A stepped state (dots, then the map) in the design's terms; it needs no motion.
2. **Start the map's downloads with the page.** A small Vite plugin injects
   `<link rel="modulepreload">` for the map chunk and the MapLibre worker chunk into
   index.html at build time (names are hashed), so both start at ~0.5 s instead of 1.3 s and
   6.4 s. The bundle is already split (MapLibre is its own chunk behind a dynamic import,
   h3-js loads on the first click); nothing more to split.
3. **Say what is happening.** The status reads "drawing the map" between the dots and the
   map, "loading" only before the snapshot arrives.
4. PRODUCT.md's performance line is corrected to the measured numbers.

**Status 2026-10-23: shipped.** Measured on a local production build served Pages-like (gzip,
max-age=600), phone profile, median of 3, page clock: heat.json in 1.38 s, the dots on the
pre-paint canvas at 1.51 s (before: the map's first dots at 4.61 s), the map's own first
frame with the dots at 4.58 s (before 4.61 s). Swap check: 2.9% of pixels differ on the
phone frame and 6.7% on desktop, all of them the land, borders and labels appearing; the
dots do not move. Decided differently from item 2: head `<link rel="modulepreload">` tags
shared the slow link with heat.json and held the first dots back by 0.8 s with no gain in
map-ready time, so instead the build writes the map chunk and worker names into a meta tag
and main.ts starts both downloads, plus the countries outline, the moment the snapshot is
in. Map-ready time is bandwidth-bound on this profile (about 613 KB at about 200 KB/s);
getting it earlier means sending fewer bytes, which is a later item. Desktop map-ready is
unchanged within 70 ms. The pure projection helpers moved to web/src/projection.ts so the
pre-paint ships in main.js without MapLibre. Live after the deploy (run 40008434611,
phone profile, three runs): heat.json in 1.50-1.55 s, dots 1.64-1.70 s, map chunk and worker
start together at 1.55 s, the map's first frame with the dots 4.74-4.82 s.

Targets on the phone profile against a local production build served the same way: dots
visible within 0.3 s of heat.json arriving (about 2.3 s), the map ready at least 1.5 s
earlier than today, and a screenshot diff between the last pre-paint frame and the map's
first frame that shows only the land outlines and labels appearing, with every dot in the
same place.

## Visual redesign: Datamatics Field (shipped 2026-10-21)

The web app's visual world was replaced on 2026-10-21 through the Impeccable workflow:
PRODUCT.md written; four coded direction mockups (Departures Board, Listening Post,
Datamatics Field, the category standard) shown to the owner, who chose Datamatics
Field (after Ryoji Ikeda); code-led build (no image generation available); finish
review "fix" (8 items) -> all resolved, 3 regressions -> resolved -> "ship"; DESIGN.md
written from the built world and is now the visual authority. World: pure black and
white chrome, white heat on a grey planet, Azeret Mono for every number and label,
Source Sans 3 for the one sentence and reading text, Silkscreen pixel wordmark with a
one-bit globe mark, 8px dot grid, hairlines, stepped motion, one-frame inversion on
snapshot change, a pixel observer mascot. Fonts are self-hosted (140 KB, SIL OFL).
Surfaces: map page (places column, tick-framed map, 96-bar replay field, log-style
panel, Signals entries), about page, clip frames and cards. Follow-ups: map labels
render small in the 1080x1920 clip (fixed pixel size); the amber heat is retired (not
binding). og.jpg recaptured from the live site in the new look on 2026-10-21 22:05 UTC.

**Status 2026-10-22 (end of the redesign session):** all live on main (last commit 377d191).
- Map marks: the blurred heat was replaced by one flat white dot per place in five size
  steps (DESIGN.md "Flat-Mark Rule"); land near-black, coasts hairline. Copy says "dot".
- Navigation: SIGNALS · REPLAY · METHOD; Signals is the default right-column state, Replay
  is `#replay` (`#t=` implies it), a selected place overlays the column and CLOSE restores;
  below 1100px the column becomes sections (Signals, Places, Replay) with jump links.
- Brand: the mark is a 24-grid one-bit globe with a ringed dot that orbits the band
  continuously since 2026-10-22 (static under reduced motion); the full logo is the inverted pixel lockup, used
  for the favicon set, og.jpg and the clip end card. Sources in .impeccable/mocks/logo/
  (gitignored; the shipped SVGs live in index.html, about.html, clip.html, public/).
- DESIGN.md + .impeccable/design.json are current; PRODUCT.md records product truth.
Next-session candidates: tune the "ordinary life" theme families on a full day (it picked
politics stories twice); clip map labels at 1080x1920; remaining Phase 2b items; the
newsletter; a real-phone check of first paint.

### Observer and the observers count (2026-10-22)
- The observer was redrawn as a 24x40 one-bit figure whose head is the mark itself (its ring
  orbits there too); 48x80 on desktop, 24x40 on phones, static on the clip end card at the
  mark's multiple. DESIGN.md updated.
- Its label is now a live count, "Observers · N", from an optional Cloudflare Worker in
  presence/ (Workers Free plan, memory-only, a random per-tab id, a 75 s window); plain
  "Observers" when it is off or unreachable. Wired through the repo variable PRESENCE_URL
  (build) and the secrets CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID (deploy workflow).
- Status: built and verified locally; the Worker is not deployed yet (needs the owner's
  Cloudflare account). The replay frame number moved off the label to the Replay head.

### Critique follow-up 1: the panel leads with the stories (2026-10-22)

From the 2026-10-22 critique (28/40, archived): on a phone a tapped place showed six count
rows and five outlet domains before any headline, so the clip visitor with under a minute
closed the sheet before reading one. Decision: the panel order becomes title, one summary
line (the under-map selection line: articles · outlets · heard in N other countries), the
stories, then the receipts (count rows, reprints line, coverage lists), videos, and the flat
article list last. The same order on every width, so the panel is one thing and the desktop
explorer finds the counts one scroll down. The first headline must sit inside the 55svh
peek on a 390x844 phone. Still open from the critique: the reading key on phone and clip,
the Signals vocabulary (the user has not yet said whether the radio register stays), replay
content, chrome repetition.

### Critique follow-up 2: the ledger's words, and the reading key (2026-10-22)

Decided by the user 2026-10-22: the signal sentence drops the radio register. No "Signal
detected", no "reports from transmitters"; it uses the ledger's words (articles, outlets,
countries, languages) and names its unit, "One story over Paris: 456 articles from 339
outlets in 35 languages.", so 456 can no longer be read as Paris's total beside the rank
list's 3,681. The tone slot is renamed literally, "Most positive tone" (the id `brightest`
stays in broadcast.json; only the label and sentence change). The signal card's meta line
carries only what the sentence did not say, so no number appears twice in one entry. The
clip card's tag names the place without a count. Methodology page, METHODOLOGY.md, the
contract's prose and the broadcast module change together.

Reading key: the legend note "size = volume, not importance" returns on phones on its own
line under the legend, and the clip's time-lapse frame carries one fixed Source Sans line
under the date: "One dot per place in today's news. Size = number of articles." Nothing
written about the news itself.

### Critique follow-up 3: chrome says things once; the six signals fit (2026-10-22)

From the critique's P2 "Chrome repeats itself while the daily broadcast gets one slot of
room". Decisions:
- Signal entries fold. Collapsed: a head row (slot name left, place name right, mono) and
  the outlet's headline clamped to two lines. Pressing the head opens the entry in place,
  inverting the head like the current nav item, to show the fixed sentence, the meta line,
  the outlet and OPEN; one entry open at a time, none open by default; stepped, no
  transition. Target: all six heads and headlines visible without scrolling at 1440x900
  and 1280x800. The same component on every width.
- The snapshot time appears twice: the clock's SNAPSHOT line and the LIVE/REPLAY stamp
  (which doubles as replay status). The signals note becomes "LAST 24H"; the foot loses
  its snapshot cell.
- The foot is cut to the source line ("GDELT 2.0 · source · no editing") and the HOW IT
  WORKS link; the map corner keeps the attribution. Outlets and outlet countries move into
  the left column's totals block so no figure leaves the page; the totals stay in the
  sentence (articles, places) and that block (places, reprints, not placed, outlets, outlet
  countries).

### Evening run (2026-10-22, started ~20:35 UTC): the rest of the review backlog

The user: "Finish everything. You have my permission to do whatever you want." Scope: the
replay-content P2, the audit's and the critique's minors, commits and pushes, a deploy
check and a re-run of the audit. Same limits as the overnight run: no spend, no accounts,
no editorial voice.

**Replay content (critique P2).** Replay plotted the rolling 24-hour total, which is flat
once the window is full, so playing the day showed no event. Contract decision: each
retained frame now also says what was new in its step.
- `history/index.json` frame entries gain `newest` (that run's `newestArticleAt`) and
  `added`: the number of window articles (placed and unplaced, the same unit as
  `totals.articles`) that were not in the previous run's carried window, i.e. what
  arrived in this step. Absent after a cold start of the state or when there is no previous
  retained frame, never 0 by assumption. (First written as "GKG time later than the previous
  frame's newest"; the evening review showed that rule misses the translingual feed, which
  lags the English one by about an hour under the same watermark, so it was changed to
  arrival before it shipped.)
- Frame file rows gain a fifth element: `[id, lat, lon, n, a]`, `a` = that cell's new
  articles by the same rule; absent (four elements) when unknown. Old frames stay valid.
- heat.json is unchanged. The carried history state records `newest` per entry; version 2,
  loads version 1 entries as "unknown".
- The Replay column plots `added` per frame (bars, 9-frame mean, max), the recent-frames
  table shows NEW instead of the window delta, and frames without `added` draw as unknown
  (faint stub, "–"). The stamp, the sentence and the map keep the frame's window, so the
  Live view and the clip are untouched. Marking the fastest-growing places on the map is
  parked (parking lot) until the bars prove the data.

**Audit minors** (all): replay prefetch bounded to a window ahead of the playhead; focus
rings inset inside the scrolling columns; a `<main>` landmark; the places filter stays on
phones and searches past the 12-row cap; CLOSE, PLAY, show-more, the range, the mode
buttons and the attribution control brought to the 28/36px floor with 44px hit areas;
`fadeDuration: 0` on the live map and `jumpTo` for the sheet padding (the Stepped-Motion
rule); the hairline alphas, `#777` and `#c4c4c4` as tokens and the unused aliases removed;
the map canvas and the Replay head given proper accessible names; the selected rank row no
longer truncates its own name.

**Critique minors**: phone rank rows get their column heads once; coverage lists expand
ISO codes (the code stays in mono); "unknown" keys match the ledger's case; the map
attribution says METHOD like the nav; the method page gets a section index, one BACK
control and copy that matches the current layout; the clip end card spaces its totals
like the time-lapse frame and says "Open a dot at" above the address; GDELT's "?"
encoding artefacts leave place names. "Moscow, Moskva, Russia" stays: the admin-1 part is
a transliteration variant, not a duplicate, and no rule can tell it from "Austin, Texas".

### Evening run, round 2 (2026-10-22 ~21:20 UTC): what the re-runs found

Re-run audit 17/20 (from 14), re-run critique 30/40 (from 28); archives in .impeccable/critique/.
Decisions for the closing round:
- Signals: the head row shows a 7x7 pixel plus (minus when open) at its right so it reads as
  a control; the closed headline opens the entry instead of leaving the site; the outbound
  link moves into the open body as "READ AT <outlet>"; opening scrolls the entry into view.
- Times crossing midnight carry the weekday ("WED 14:30 – THU 14:15 UTC"; the replay stamp
  and the recent-frames table say the day where it changes).
- "Countries" is one thing: the panel row and the clip end card say OUTLET COUNTRIES; a
  signal's meta line keeps HEARD IN N OTHER COUNTRIES and drops the bare count.
- The replay playhead states its value: the bar tag reads "+3,176" and the PLAY readout
  "+3,176 NEW"; the trend's max is labelled as the mean's. Rings for the places that grew
  stay parked.
- OPEN from a signal pins that signal's story first in the panel, tagged with the slot name,
  carried in the permalink as `s=<slot>`.
- Small: "SHOW 3 MORE ARTICLES"; the foot link reads METHOD; the clip key says "the last 24
  hours"; video-strip focus no longer fights scroll-snap; hit areas reach a true 44px; the
  method index rows and the back link meet the floor; the detector waiver for the method
  page becomes two inline ignores instead of a file-wide one.
- Left as they are, on purpose: the bare OBSERVERS label until the Worker is deployed; the
  phone map's starting view; CLOSE at the top of the sheet; comparing two places;
  "Moscow, Moskva".

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
- Heat weighting: the vs. normal mode (per-cell 7-day median) ships by itself once 3
  full days exist (earliest 2026-10-24); reprint collapse and international attention
  are in Phase 2b. Whether heat should ever move from article count to distinct
  outlets stays open.
- The monthly income that counts as a living (sets checkpoint targets).

## Ideas parking lot

(Add any floated ideas here during sessions so nothing is lost.)

- Replay: mark the few places that grew most since the previous frame (the per-cell `a`
  now in the frames) with a hollow ring in the stepped vocabulary, once the bars have
  proved the data on a full day.

- Day/night terminator sweeping across the map in the clip, with news lighting up
  behind the sun.
- A monthly coverage-gap report ("which places did the world ignore in October?") as
  press material and a data-buyer pitch.
- Satellite imagery (NASA/Sentinel) orbit-to-ground zooms in clips for disasters.
- "Expected vs. actual coverage" per cell using the baseline, to distinguish quiet
  from uncovered.
