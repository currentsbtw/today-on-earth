# Data contract: ingest output -> frontend

The ingest job writes static JSON files. The frontend only ever reads these files.
Both sides must follow this document; change it here first, then both sides.

All files live under a single data root. In production that root is `/data/` on the
deployed site. In local dev the frontend serves `web/public/data/` at `/data/`.

## `/data/heat.json`  (one file, fetched on page load)

```jsonc
{
  "generatedAt": "2026-10-20T19:30:00Z",   // ISO 8601 UTC, when the snapshot was written
  "windowHours": 24,                        // rolling window the counts cover
  "newestArticleAt": "2026-10-20T19:15:00Z",
  "totals": { "articles": 183204, // article units: one per outlet and headline, see Reprints (changed 2026-10-23)
              "outlets": 9120,    // distinct outlets; a listed network counts once (changed 2026-10-23)
              "countries": 171, "cells": 6210,
              "unplaced": 41200,  // article units with no primary location: only country-level locations, or every
                                  // city and region skipped as outlet boilerplate; counted here, never binned (changed 2026-10-23)
              "reprints": 23100 }, // sum over cells of (n - u): articles that copy another outlet's headline in the same cell (added 2026-10-21)
  "topOutletCountries": [["US", 52000], ["GB", 18100], ["IN", 12400]], // the 20 outlet countries with the most article units in the
                                  // window, placed and unplaced (the unit of totals.articles), by units desc then code, "" excluded;
                                  // the "largest news countries", see Coverage gaps (added 2026-10-23)
  "cells": [
    {
      "id": "832830fffffffff",   // H3 cell index, resolution 3
      "lat": 48.86, "lon": 2.35, // cell centroid, 2 decimals
      "n": 412,                  // article units (one per outlet and headline) whose primary location falls in this cell
                                 // (changed 2026-10-23)
      "u": 361,                  // distinct headlines: distinct reprint keys, untitled articles one each (added 2026-10-21)
      "o": 150,                  // distinct outlets: source domains, a listed network counted once (changed 2026-10-23)
      "c": 23,                   // distinct source countries (outlets' countries), 0 if unknown
      "i": 22,                   // outlet countries other than the place's own country (added 2026-10-21)
      "l": 9,                    // distinct languages
      "t": -2.1,                 // mean tone, 1 decimal (GDELT V2Tone first value)
      "name": "Paris, France"    // most common location full name in the cell, with GDELT artefacts removed
                                 // ("(General)", "City Of", repeated parts): "Washington, Washington, United States" -> "Washington, United States"
                                 // and the "?" GDELT writes for characters it could not encode: "Ad Daw?Ah" -> "Ad Dawah" (added 2026-10-22)
    }
  ]
}
```

Short keys keep the file small. Target size: under 1.5 MB uncompressed for a 24h window.
Cells are sorted by `n` descending. Cells with `n` < 2 may be dropped.

### Baseline (added 2026-10-21)

So that a quiet place lighting up can show, each cell carries its own normal:

- top level: `"baselineDays": 5` — how many complete UTC days of per-cell counts
  exist (0 until the first full day has passed; capped at 14).
- per cell: `"b": 37.5` — the median of that cell's daily article counts over the
  last up to 7 complete UTC days (1 decimal; 0 when `baselineDays` < 3 or the cell
  had no history). A cell that never appeared before but has history days available
  gets `b` = 0 (brand new).
- The ingest keeps a carried `baseline.json.gz` next to state: per UTC day, per cell,
  the number of placed article units (see Reprints) first seen on that day, so `b` is
  in the unit of `n` (changed 2026-10-23); days older than 14 are dropped. Counting
  happens as records are first merged, so dedupe by URL holds.
- The frontend may show relative heat only when `baselineDays` >= 3; until then it
  shows absolute heat. Relative weight = clamp(log2((n + 1) / (max(b, 3) + 1)) / 3,
  0, 1). Cells without a live `b` (replay-only cells) use the absolute weight and
  show no ratio.
- The carried file records `since`, the UTC day of its first run; that day and any
  back-filled earlier days are partial and never count as complete. Baseline,
  state and history live in the same cache entry, so they are restored or lost
  together (a baseline surviving a lost state would double count).

### Reprints and international attention (added 2026-10-21)

Two measures, computed from what GDELT already gives. Neither changes what glows: heat
stays the article count `n`.

**Article units (changed 2026-10-23).** "Articles" are distinct headlines per outlet, not
distinct URLs: within one cell (and, for the totals, within the unplaced articles), one
unit per (outlet, non-empty reprint key), so an outlet's copies of one headline are one
article, plus one unit per article with an empty key. The outlet is the
source domain, or its network's name when the domain (or a parent domain) is listed in
`ingest/data/outlet-networks.txt`, so a network's sites are one outlet. `n`,
`topOutlets`, `topCountries`, `languages`, `videos`, `unclustered`, `totals.articles` and
`totals.unplaced` count units; `c`, `i` and `l` are taken over each unit's earliest copy
(its outlet country and language). `t` is still the mean over every URL. `o` and
`totals.outlets` count outlets with a network once; `source` on an article keeps its own
domain.

**Reprint key** of an article, from its `title` and `source`:
1. Unicode NFKC normalisation, lowercase, whitespace collapsed and trimmed.
2. A trailing outlet suffix is removed only when it looks like an outlet name; the rule
   is then applied again to what remains, until it no longer applies ("X - Section |
   Outlet" loses both; changed 2026-10-23). Candidate: the title ends in ` - X`, ` | X`,
   ` – X` or ` — X` (hyphen, pipe, en dash or em dash with a space on each side; X
   contains no further such separator), and what precedes that last separator is at least
   20 characters (code points, trailing space trimmed). Then:
   - `tail` = X decomposed (NFD) with every character that is not a letter or digit
     (Unicode classes L and N) removed, then a leading `the` removed
     ("The Star" → `star`, "BBC News" → `bbcnews`, "El País" → `elpais`).
   - `label` = the `source` domain, lowercased and split on `.`: with 3 or more labels
     and the second-to-last one of `com co net org gov edu ac or ne go`, the
     third-to-last label, otherwise the second-to-last (`bbc.co.uk` → `bbc`,
     `news.ndtv.com` → `ndtv`, `thestar.com` → `thestar`); reduced like `tail`
     (non-letters/digits removed, leading `the` removed) and kept only if at least
     3 characters, else empty.
   - The suffix is removed when (a) `label` is non-empty, `tail` is at least 3
     characters, and `tail` contains `label` or `label` contains `tail`; or (b) X has
     at most 2 whitespace-separated words ("Reuters", "AP News"); or (c) X, normalised
     by steps 1 and 3, is one of the outlet's learned tails. Otherwise the whole title
     is kept.
   - Learned tails (added 2026-10-23): over every article in the snapshot's window, a
     tail X (steps 1 and 3 applied) that one outlet (network-aware, as above) puts on 3
     or more distinct heads (steps 1 and 3 applied) is that outlet's boilerplate: a
     station name ("| Sunny 102.3 FM"), a site slogan. A tail shared by many outlets on
     one head is a headline half and is not learned.
3. Every Unicode punctuation and symbol character (classes P and S) is deleted;
   whitespace is collapsed and trimmed again.

An empty key (no title, or punctuation only) matches nothing: such an article is its own
item. Articles in the same cell with the same non-empty key are copies of one headline:
copies by the same outlet are one unit, and units of different outlets are reprints of one
another (changed 2026-10-23).

- `u` (heat cell, cell file, story): distinct non-empty keys plus one per empty-key
  article, over the cell's (or story's) articles. `1 <= u <= n`.
- `totals.reprints` = sum over cells of `n - u` (cells with `n` < 2 hold no copies
  across outlets, so dropping them changes nothing). Only the five original totals go into
  `history/index.json`.
- `reprints` on every article object (cell `articles` and story `articles`): how many
  other outlets' units in the same cell share its key (0 for an empty key; changed
  2026-10-23). Article lists keep at most one article per non-empty key: the newest copy
  that the per-outlet caps let in. The kept one carries the count.

**International attention.** Each placed article has a `locationCountry` (ingest-internal):
the CountryCode (FIPS 10-4) of its primary location (see Rules) in GKG V2Locations, as ISO
3166-1 alpha-2, "" when it has no ISO equivalent.

- `home` (cell file only): the most common non-empty `locationCountry` among the cell's
  articles, ties to the alphabetically first code; "" when none.
- `i` (heat cell, cell file, story): distinct non-empty outlet countries (`country`)
  among the articles, other than `home`. When `home` is "", `i` = `c`. A story uses its
  cell's `home`. Records carried from before this field existed have "" and age out of
  the window within 24 h.

**Coverage gaps (added 2026-10-23).** The site states which of the largest news countries
stayed silent on a place or a story: the first 12 of heat.json's `topOutletCountries` that
have no entry in the cell's `topCountries` or the story's `countries` (the place's own
`home` is never listed as silent). Both lists therefore name every outlet country, not a
top few. `topOutletCountries` counts each article unit once, for the outlet country of its
earliest copy (as `c`), over the same partition as `totals.articles` (each cell's units,
kept or dropped, plus the unplaced units), so no entry exceeds `totals.articles`.

## `/data/cells/<id>.json`  (one file per cell, fetched on click)

```jsonc
{
  "id": "832830fffffffff",
  "name": "Paris, France",
  "home": "FR",                       // the place's own country, "" if unknown (added 2026-10-21)
  "n": 412, "u": 361, "o": 150, "c": 23, "i": 22, "l": 9, "t": -2.1,
  "topOutlets":  [["lemonde.fr", 31], ["bbc.co.uk", 12]],  // top 10 by article units; a listed network is one entry,
                                                           // named by the network (changed 2026-10-23)
  "topCountries":[["FR", 190], ["GB", 40], ["US", 38]],    // every outlet country (ISO 3166-1 alpha-2) with its article units,
                                                           // by units desc then code; no cap and no "": length == c; for the
                                                           // site's "silent among the largest news countries" line (changed 2026-10-23)
  "languages":   [["fr", 220], ["en", 150], ["de", 12]],   // ISO 639-1 where known
  "articles": [
    {
      "title": "…",                     // shown title: the page title trimmed to 160 chars, with the suffix the
                                        // reprint rule strips (outlet name, short label, learned tail) removed;
                                        // nothing else changed; may be empty (changed 2026-10-23)
      "url": "https://…",
      "source": "lemonde.fr",           // source domain (GKG SourceCommonName), never the network name
      "country": "FR",                  // outlet country, "" if unknown
      "lang": "fr",                     // "en" when GDELT gives no translation info
      "time": "2026-10-20T18:45:00Z",   // GKG DATE
      "tone": -3.4,
      "image": "https://…",             // GKG SharingImage, "" when none
      "video": "https://www.youtube.com/watch?v=…", // first YouTube URL from GKG SocialVideoEmbeds, "" when none (added 2026-10-21)
      "reprints": 12                    // other outlets' units in this cell with the same reprint key, 0 when none (added 2026-10-21)
    }
  ],
  "videos": 7                           // number of the cell's article units (whole window) with a copy that carries a video (added 2026-10-21)
}
```

`video` is only ever a youtube.com / youtu.be URL as GDELT recorded it **that names an
11-character video id** (watch?v=, /embed/, /shorts/, /live/, /v/, youtu.be/). Channel
and user links (about two thirds of GDELT's YouTube embeds) and other hosts are
dropped. Measured 2026-10-21: ~9% of placed articles carry a video. The frontend
derives the id itself and embeds via youtube-nocookie.com, click-to-load, never
autoplay.

`articles` is the newest 50 in the cell, newest first, de-duplicated by URL. Pick a
spread of outlets: no outlet contributes more than 5 of the 50 unless the cell has
fewer than 10 outlets (a listed network counts once for both). At most one article per
non-empty reprint key (added 2026-10-21).

### Stories (added 2026-10-21)

A cell file also carries `stories`: groups of the cell's articles that are about the
same thing, computed deterministically from what GDELT already tags per article
(persons, organisations, themes) plus title tokens. No model, no text of ours.

```jsonc
"stories": [
  {
    "n": 212, "u": 150, "o": 96, "c": 21, "i": 20, "l": 7, "t": -4.1,   // same meaning as the cell counters, over the story's articles
                                                                       // (i against the cell's home; u, i added 2026-10-21)
    "countries": [["GB", 60], ["US", 41], ["FR", 30]],  // every outlet country of the story with its article units (second-pass
                                                        // units included), by units desc then code, no "": length == c, and i ==
                                                        // the entries other than the cell's home; for the site's "silent among
                                                        // the largest news countries" line (added 2026-10-23)
    "first": "2026-10-21T01:15:00Z", "last": "2026-10-21T04:30:00Z",
    "headline": "…",            // the shown title (as `title` below) of the story's medoid article (max token overlap
                                // with the rest); may be empty
    "headlineSource": "bbc.co.uk",
    "headlineLang": "en",
    "headlineUrl": "https://…", // URL of the article the headline comes from (the medoid); "" when none (added 2026-10-21)
    "entities": ["donald trump", "nato", "brussels"],  // up to 5 most shared persons/orgs, lowercase as GDELT spells them;
                                                       // themes only top up when fewer than 2, rendered as words ("climatechange")
    "articles": [ { …same article object as above… } ] // newest 6, outlet-spread (max 2 per outlet), one per reprint key
  }
],
"unclustered": 140        // articles in the cell that belong to no story with n >= 3
```

Rules:
- Stories are sorted by `n` descending; at most 30 per cell (`MAX_STORIES`, changed
  2026-10-23 from 12); a story needs `n` >= 3 units from the grouping pass.
- Second pass (added 2026-10-23): after the cap, each unit outside every story joins the
  story whose top-20 title tokens (counted over the story's grouped units) share 3 or more
  tokens with its own title tokens; best = most shared, ties to the larger story, then the
  earlier story. Attached units count in the story's counters, `first`/`last` and
  `entities`, but are never its medoid. Stories are then re-sorted by final `n`.
- Every article in the cell belongs to at most one story. `sum(stories[].n) +
  unclustered == n` of the cell.
- `headline` is an outlet's title, chosen by overlap, never written by us; the only change
  is the shown-title suffix rule of `title` (changed 2026-10-23). If the medoid has no
  title, use the next best article that has one.
- The flat `articles` list stays as it is (newest 50 across the whole cell).
- The grouping must be stable run to run for the same inputs (deterministic order of
  processing: by time, then URL).
- Implementation notes (ingest, 2026-10-21): generic GDELT themes (the very broad
  families plus ~30 themes that tag >= 2% of all articles), wire services as
  organisations, and "united states" as an organisation are ignored for grouping. In
  cells with >= 50 articles, any entity present on more than 15% of the cell's
  articles is ignored for grouping too (otherwise Washington is one blob). Such
  entities can still appear in a story's displayed `entities`. Measured: 24h, 3,618
  cells, 5,704 stories in under 5 s; 60-70% of articles in busy cells stay
  unclustered, partly because of the 12-story cap. Measured 2026-10-23 on 2 h of both
  feeds: about 43% of articles were grouped with the cap at 12, about 58% with no cap;
  hence the cap of 30 and the second pass.
- Join rule (unchanged 2026-10-23): an article joins the best existing cluster when it
  shares >= 2 entities with the cluster's top-10 entities, or >= 1 entity and >= 2 title
  tokens with its top-20 tokens, or >= 4 title tokens (best = highest 2 * entities +
  tokens, ties to the larger cluster, then the older); clusters whose top-5 entity sets
  share >= 3 are merged. Persons, organisations and themes count alike.

## `/data/history/index.json`  (small; fetched on page load so the scrubber can show)

One entry per retained snapshot, oldest first, covering at most the last 24 hours
(so at most ~96 entries at a 15-minute cadence; fewer if runs were missed). The last
entry is always the current snapshot, i.e. the same moment as `heat.json`.

```jsonc
{
  "frames": [
    {
      "at": "2026-10-21T04:47:14Z",        // == generatedAt of that run
      "file": "20261021T044714Z.json",     // relative to /data/history/
      "windowHours": 6,
      "newest": "2026-10-21T04:30:00Z",    // == newestArticleAt of that run (added 2026-10-22)
      "added": 2950,                       // window articles that arrived in this step, see below (added 2026-10-22)
      "totals": { "articles": 39304, "outlets": 5384, "countries": 159, "cells": 1600, "unplaced": 9200 }
    }
  ]
}
```

### New articles per step (added 2026-10-22)

`totals` describe the frame's whole rolling window, which barely moves once the window is
full. `newest` and `added` say what was new in the step that produced the frame.

- `newest`: that run's `heat.json` `newestArticleAt`, the latest GKG time (DATE) of any
  article in its window. The last frame's `newest` equals `heat.json`'s `newestArticleAt`.
  It can be up to about 20 minutes later than `at` (GDELT publishes a 15-minute file
  before its stamp). It is informational: `added` is not counted from it.
- `added`: the number of article units in this frame's window, placed and unplaced (the
  unit of `totals.articles`; changed 2026-10-23), none of whose URLs was **in the
  previous run's window** (the window carried in `state.json.gz` from the run before).
  A new copy of a headline its outlet already had in that place adds nothing. A unit is
  new in the step in which it first enters the window, whatever its GKG time, so a
  translingual file that arrives an hour behind the English feed counts in the step it
  arrives. `0` means
  nothing arrived; it is never written by assumption. `0 <= added <= totals.articles`.
- `added` is **absent** (unknown) when the run cold-started its window (no carried state:
  nothing to compare with), when there is no previous retained frame (the first frame
  after a cold start of the history, or after a gap of more than 24 hours; "previous
  retained frame" = the newest frame older than this one that is still within 24 hours of
  it), and on every frame written before 2026-10-22, which also has no `newest`. Readers
  draw a missing `added` as unknown, never as 0.

## `/data/history/<file>.json`  (one compact frame, fetched on demand)

```jsonc
{
  "at": "2026-10-21T04:47:14Z",
  "cells": [
    ["832aa8fffffffff", 38.96, -76.55, 1401, 37]   // [id, lat, lon, n, a], sorted by n descending
  ]
}
```

Frames carry only what the heat layer needs. Target size: under 150 KB per frame
uncompressed (a full 24h window measured 127 KB, about 36 KB gzipped on the wire).
Cells with `n` < 2 are dropped, as in `heat.json`. No per-cell detail files exist for
past frames: `cells/<id>.json` always describes the current snapshot only.

`a` (added 2026-10-22): the number of the cell's article units counted in the index
entry's `added`, by the same rule (none of the unit's URLs was in the previous run's
window; changed 2026-10-23). `0 <= a <= n`,
and the sum of `a` over a frame is at most `added` (unplaced articles and cells with
`n` < 2 are in `added` but have no row). Rows have five elements exactly when the index
entry has `added`, and four (`[id, lat, lon, n]`, `a` unknown) otherwise, so frames
written before 2026-10-22 stay valid. A cell with new articles but `n` < 2 is not in
the frame at all.

## Broadcast (added 2026-10-21): `/data/broadcast.json`  (one small file, written every run)

Six fixed slots, each filled by a published, deterministic rule from the stories of this
snapshot. No text of ours: a slot carries an outlet's own headline plus the story's numbers.

```jsonc
{
  "generatedAt": "2026-10-26T19:14:58Z", "windowHours": 24, "baselineDays": 5,  // == heat.json
  "slots": [   // always six, in this order: loudest, planet, rising, brightest, ordinary, faint
    { "id": "loudest", "available": true,
      "cell": { "id": "832aa8fffffffff", "name": "Washington, United States", "lat": 38.96, "lon": -76.55, "home": "US" },
      "story": { "headline": "…", "headlineSource": "bbc.co.uk", "headlineLang": "en", "headlineUrl": "https://…",
                 "n": 212, "u": 150, "o": 96, "c": 21, "i": 20, "l": 7, "t": -4.1,
                 "first": "2026-10-26T01:15:00Z", "last": "2026-10-26T04:30:00Z" } },
    { "id": "planet", "available": true, "cell": { … }, "story": { … } },
    { "id": "rising", "available": true, "cell": { … }, "story": { … }, "ratio": 6.3, "b": 12.5 },
    { "id": "brightest", "available": true, "cell": { … }, "story": { … } },
    { "id": "ordinary", "available": false, "reason": "none" },
    { "id": "faint", "available": true, "cell": { … }, "story": { … }, "b": 1.5 }
  ]
}
```

While `baselineDays` < 3, rising and faint wait instead:
`{ "id": "rising", "available": false, "reason": "baseline", "availableFrom": "2026-10-24" }`.

- `cell`: the cell's `id`, `name`, `lat`, `lon` as in `heat.json`, and `home` as in its cell file.
- `story`: the story's fields exactly as in the cell file's `stories` (without `entities` and
  `articles`). The headline is the story's medoid's shown title (see `title`).
- `ratio` (1 decimal) only on rising; `b` (the cell's `b` from `heat.json`) only on rising and
  faint. An unavailable slot carries no `cell`, `story`, `ratio` or `b`.
- `reason`: `"none"` when no story meets the rule; `"baseline"` for rising and faint while
  `baselineDays` < 3. Only a `"baseline"` slot has `availableFrom`.
- `availableFrom`: the first UTC day on which 3 complete baseline days can exist. Complete
  days are strictly after the carried baseline's `since` and before today (see Baseline), so
  the third one (`since` + 3) has passed on `since` + 4 days. When days were lost to missed
  files it is never earlier than today + (3 - `baselineDays`) days, so it is always in the
  future. `""` when no baseline exists yet.
- If building the broadcast fails, the run logs the error and still writes the file, with
  all six slots `available: false, reason: "none"`: the map snapshot is never held back by it.

**Rules.** Candidates are every story of every cell in this snapshot (the cell files'
`stories`), each with its cell. **Every slot requires `u` >= 3**: a story with fewer than
three distinct headlines is one article echoed, and never fills a slot. **Every slot also requires a
non-empty `headline`**: a filled slot always carries an outlet's own headline. Each story fills at most one
slot. Slots are filled in the order listed, so a story taken by "loudest" is no longer a
candidate for "planet". Ties go to the higher `n`, then the earlier `first`, then the cell
id ascending (then the story's position in its cell). The thresholds are constants in
`ingest/src/broadcast.ts`.

| Slot | Picks | Requires (besides `u` >= 3 and a headline) |
|---|---|---|
| `loudest` | the story with the most independent voices, min(`u`, `o`) (distinct headlines, at most one per outlet, so neither syndication networks nor one outlet's many copies win); ties go to the higher `o`, then the higher `n`, the earlier `first`, the cell id | nothing more |
| `planet` | the story with the highest international attention `i` (outlet countries other than the place's own) | `o` >= 10, and the cell's `home` is known (not `""`; with an unknown home `i` equals `c` and would count the place's own country) |
| `rising` | among cells with `n` >= 20, the cell with the highest `ratio` = `n` / max(`b`, 3), 1 decimal (ties: higher cell `n`, then cell id); its story is that cell's story with the most `o`. If every story of that cell is already taken, the next cell by `ratio`. | `baselineDays` >= 3 |
| `brightest` | the story with the highest mean tone `t` | `o` >= 10, `c` >= 3, `n` >= 10 |
| `ordinary` | the story with the most `o` among stories mostly outside conflict, politics, crime and disaster: at most 25% of the story's articles carry any kind (below) | `o` >= 10, `c` >= 2 |
| `faint` | the story with the most `o` from a usually quiet cell: `b` <= 3 (brand-new cells with `b` = 0 included) | `baselineDays` >= 3, `o` >= 5, `c` >= 2 |

Every cell in `heat.json` has a `b`, so for rising every cell with `n` >= 20 is a candidate;
a brand-new cell (`b` = 0) is measured against the floor of 3.

**Kinds** (ingest-internal, never in a public file). Each article gets the set of kinds among
`c` conflict, `p` politics, `k` crime, `d` disaster, from GDELT's raw V2Themes (every theme
of the article, before the grouping deny list in Stories drops the broad families). A theme
name matches a rule exactly, or by prefix where the rule ends in `*` (case-insensitive):

- conflict: ARMEDCONFLICT, MILITARY, TERROR, WMD, REBELLION, REBELS, SEIGE, BLOCKADE,
  CEASEFIRE, KILL, WOUND, UNREST_*
- politics: ELECTION, LEGISLATION, GENERAL_GOVERNMENT, LEADER, GOV_*,
  USPEC_POLITICS_GENERAL1, POLITICAL_TURMOIL, RESIGNATION, APPOINTMENT, CONSTITUTIONAL,
  DEMOCRACY, NEGOTIATIONS, ALLIANCE, SANCTIONS, SOVEREIGNTY
- crime: ARREST, TRIAL, SOC_GENERALCRIME, CRIME_*, KIDNAP, RAPE, DRUG_TRADE,
  ORGANIZED_CRIME, CORRUPTION, CYBER_ATTACK
- disaster: NATURAL_DISASTER_*, MANMADE_DISASTER_* except MANMADE_DISASTER_IMPLIED,
  DISASTER_*, EVACUATION

GDELT's CRISISLEX_ themes are not mapped: they are crisis-lexicon word matches, not topics.
Measured 2026-10-21 on 10,652 placed articles (4 files of each feed): CRISISLEX_CRISISLEXREC
tagged 35% and CRISISLEX_C07_SAFETY 28% of articles, and 5.4% were tagged by a CRISISLEX_C*
or CRISISLEX_T* theme alone (restaurant reviews, earnings calls, celebrity quotes). With the
lists above, articles carrying each kind: conflict 33%, politics 49%, crime 24%, disaster 9%,
any 67%.

A story's tagged share = its articles with any kind / its `n`. Records carried from before
this field existed (state version 4 and older) have no kinds and count as untagged, so
"ordinary" may be loose during the first 24 h after the deploy that added it.

## Top stories (added 2026-10-24): `/data/stories.json`  (one small file, written every run)

The day's largest stories around the world, by a published, deterministic rule: the stories
with the most distinct outlets across every place, one per place and at most two per country,
so a reading of them moves around the planet. It feeds the narrated daily clip, which reads
the first 6 to 8 entries it can voice (docs/PLAN.md "Clip v4: the newscast"). No text of ours:
an entry carries an outlet's own headline plus the story's numbers.

```jsonc
{
  "generatedAt": "2026-10-26T19:14:58Z", "windowHours": 24,   // == heat.json
  "stories": [   // at most 12, rank 1 first
    { "rank": 1,
      "cell": { "id": "832aa8fffffffff", "name": "Washington, United States", "lat": 38.96, "lon": -76.55, "home": "US" },
      "story": { "headline": "…", "headlineSource": "bbc.co.uk", "headlineLang": "en", "headlineUrl": "https://…",
                 "n": 212, "u": 150, "o": 96, "c": 21, "i": 20, "l": 7, "t": -4.1,
                 "first": "2026-10-26T01:15:00Z", "last": "2026-10-26T04:30:00Z" } },
    { "rank": 2, "cell": { … }, "story": { … } }
  ]
}
```

- `rank`: 1, 2, 3, … in list order, contiguous.
- `cell` and `story`: exactly as a broadcast slot's `cell` and `story` (see Broadcast; the
  same code shapes both): the cell's `id`, `name`, `lat`, `lon` as in `heat.json` and `home`
  as in its cell file; the story's fields exactly as in the cell file's `stories`, without
  `entities` and `articles`.
- If building the list fails, the run logs the error and still writes the file, with
  `"stories": []`: the map snapshot is never held back by it.

**Rule.** Candidates are every story of every cell in this snapshot (the cell files'
`stories`), each with its cell, as for the broadcast. A candidate needs `u` >= 3
(`MIN_STORY_U`) and a non-empty `headline`, as every broadcast slot does. Candidates are
ranked by distinct outlets `o`, most first; ties go to the higher `n`, then the earlier
`first`, then the cell id ascending, then the story's position in its cell (the broadcast's
tie order). The list is the ranking walked from the top, taking a story when:

- its cell has no entry yet (one story per place), and
- its country has fewer than `TOP_STORIES_PER_COUNTRY` = 2 entries, where the country is the
  cell's `home`. Cells whose `home` is unknown (`""`) share one bucket of their own, apart
  from every country, and take at most `TOP_STORIES_UNKNOWN_HOME_MAX` = 1 entry in total (an
  unknown home may be a country already taken twice).

The walk stops at `TOP_STORIES_MAX` = 12 entries, or when the ranking runs out. Twelve gives
the clip slack to skip a story it cannot voice. The constants are in
`ingest/src/top-stories.ts`. The file is rebuilt from scratch every run; it describes the
current snapshot only and has no history. It is independent of `broadcast.json`: a story may
fill a slot there and be listed here.

## Topics (added 2026-10-23): `/data/topics.json`  (one file, written every run, fetched when the search is first used)

Where each person and organisation is being talked about: for every name the stories carry,
the places whose stories mention it and how many articles that is. The site uses it to light
the map by topic ("where is Starlink being talked about"). Like the stories it comes from, it
is GDELT's own tagging, counted; no model and no text of ours.

```jsonc
{
  "generatedAt": "2026-10-23T19:14:58Z",   // == heat.json
  "topics": [   // largest total first, ties by name; at most 5,000
    ["donald trump", 1312, [["832aa8fffffffff", 212], ["831f8dfffffffff", 96], …]],  // [name, total, [[cellId, n], …]]
    ["nato", 455, [["831fa4fffffffff", 80], …]]
  ]
}
```

- `name`: a person or organisation exactly as it appears in a story's `entities` (lowercase,
  as GDELT spells it). Theme words, which only top up a story's `entities` when it has fewer
  than two names, are never topics.
- `n` of a cell: the sum of `n` over that cell's stories whose `entities` carry the name. An
  article counts once per story, so `n` <= the cell's `n`. Articles outside every story
  (`unclustered`) are not counted.
- Cells: at most 60 per topic, largest `n` first, ties by cell id ascending. Every `cellId`
  is a cell of `heat.json` (and has a cell file).
- `total`: the sum of the listed cells' `n` (only the kept 60, not every cell). A topic needs
  `total` >= 10.
- Junk names are dropped before counting: shorter than 4 characters, starting with "a ",
  "an " or "the " (GDELT's names from translated text, "a prosecution national terrorism"),
  a single generic word from a short deny list (news, police, government, people, city,
  state, county, court, university, company, minister, president, hotel, young), or nothing
  but digits, punctuation and spaces. The noise that remains ranks low, because topics are
  ordered by volume.
- The thresholds and the deny list are constants in `ingest/src/topics.ts`. The file is
  rebuilt from scratch every run; it describes the current snapshot only and has no history.

## Archive (GitHub Releases, added 2026-10-21)

Nothing older than 24 h stays on the site, so the Snapshot workflow also uploads every
successful run to the release tagged `archive-YYYY-MM-DD` (the UTC day of
`generatedAt`): `heat-<stamp>.json.gz` per run (`<stamp>` = `generatedAt` without
`-` and `:`), plus `cells-<stamp>.tar.gz` (the whole `cells/` directory) once per day.
The files are byte-for-byte the `/data/` files of that run, so this contract describes
them too, as of the version that wrote them. Older archived files may lack fields added
later (readers treat a missing field as `0` / `""`, except the history's `newest`, `added`
and `a`, which are unknown when missing). Repository variable `ARCHIVE=false`
turns the step off; a failed upload never fails the snapshot.

## Carried files: `state.json.gz` and `history.json.gz`  (ingest-internal)

Compact per-article records for the rolling window, and the retained frames, so the
next run can merge new files without refetching. Formats are up to the ingest side.
`state.json.gz` is version 6 since 2026-10-23 (changed 2026-10-23): each record also
carries `locs`, its candidate locations, up to 4 (the 3 most-mentioned cities, then the
most-mentioned region; see Rules), each with GDELT type, name, country, lat, lon, mention
count, first character offset and FeatureID. Placement is resolved from them at snapshot
time, over the whole window. Version 5 records load with no candidates and keep the
placement they were stored with; they age out of the window within 24 h.
`history.json.gz` is version 2 since 2026-10-22: each entry records its `newest`,
`added` and per-row `a`. Version 1 entries still load, as frames whose `newest`, `added`
and `a` are unknown; they still count as the previous frame for the next run's `added`.
They are **not published on the site**: in CI they live in `CARRY_DIR` and travel
between runs through the GitHub Actions cache (a full 24h state is ~37 MB, far too
much to fetch from Pages 96 times a day). The ingest job can still read them from an
http(s) URL (`STATE_URL`, `HISTORY_URL`) where a 404 means start empty and any other
failure fails the run; that path is unused in production.

## Rules both sides rely on

- H3 resolution 3 everywhere for phase 1 (about 12,000 land cells, ~100 km across).
- Coordinates are WGS84. `lon` in [-180, 180].
- Primary location of an article (changed 2026-10-23). Each GKG V2Locations entry of
  Type 3 or 4 (city) or 2 or 5 (state or region) is one mention of its FeatureID (its
  FullName when the FeatureID is empty); entry order is ignored, since GDELT's order is
  not text order. Candidates: the 3 cities with the most mentions, then the 1 region with
  the most mentions; ties go to the smallest CharOffset (the earliest mention), then the
  name. The primary location is the first candidate that is not boilerplate for the
  article's outlet. Boilerplate: for each outlet (network-aware, as in Reprints) with at
  least 20 articles (URLs) with candidates in the window (`MIN_OUTLET_ARTICLES`), a
  (place, exact mention count) pair carried by at least half of those articles
  (`BOILERPLATE_SHARE`); a place is its FeatureID, else its name. An article whose
  candidates are all boilerplate, or whose every location is country-level (Type 1), is
  **not placed in any cell**: it is counted in `totals.articles` and `totals.unplaced`
  only. A country centroid is not where anything happened, so it must never glow. (Cell
  `name` for the rare non-country location whose name is a demonym is left as GDELT
  gives it.)
- `image` is always present, `""` when missing. `languages` is capped at 10 entries like
  `topOutlets`; `topCountries` is not capped and holds no `""` (changed 2026-10-23). `totals.articles` counts every article in
  the window including those in dropped n < 2 cells; `totals.cells` = `cells.length`.
- Articles with no parseable location at all (no V2Locations entry with usable
  coordinates) are dropped before counting: they appear in neither `totals.articles`
  nor `totals.unplaced`. "Every article in the window" means every located article.
- `windowHours` is the span the data actually covers (floor of hours, minimum 1), not
  the configured window, so a fresh cold start reports 6 and a full window reports 24.
- Times are ISO 8601 UTC with a `Z` suffix.
- Permalinks (frontend only): the URL hash `#c=<cellId>&t=<frame at>` selects a cell
  and a frame. `t` is the frame's `at` value with punctuation removed
  (`20261021T044714Z`). Either key may be absent. Unknown values are ignored silently.
- Missing values are `""` for strings and `0` for numbers, never `null`.
