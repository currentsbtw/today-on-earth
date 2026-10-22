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
| Brightest | The most positive-toned story with real coverage | Minimum outlets and countries, so press releases and puff pieces don't win |
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

- [ ] **Clip v2.** The portrait layout reserves ~25% top and ~20% bottom for text, so
      the 2:1 world sits as a short band. Fill the frame with fly-to zooms and
      per-signal callouts driven by the broadcast slots.
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
- Brand: the mark is a 24-grid one-bit globe with a ringed dot that travels the band once
  on load (static under reduced motion); the full logo is the inverted pixel lockup, used
  for the favicon set, og.jpg and the clip end card. Sources in .impeccable/mocks/logo/
  (gitignored; the shipped SVGs live in index.html, about.html, clip.html, public/).
- DESIGN.md + .impeccable/design.json are current; PRODUCT.md records product truth.
Next-session candidates: tune the "ordinary life" theme families on a full day (it picked
politics stories twice); clip map labels at 1080x1920; remaining Phase 2b items; the
newsletter; a real-phone check of first paint.

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

- Day/night terminator sweeping across the map in the clip, with news lighting up
  behind the sun.
- A monthly coverage-gap report ("which places did the world ignore in October?") as
  press material and a data-buyer pitch.
- Satellite imagery (NASA/Sentinel) orbit-to-ground zooms in clips for disasters.
- "Expected vs. actual coverage" per cell using the baseline, to distinguish quiet
  from uncovered.
