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
  "totals": { "articles": 183204, "outlets": 9120, "countries": 171, "cells": 6210,
              "unplaced": 41200 }, // articles whose only locations are country-level; counted here, never binned into a cell
  "cells": [
    {
      "id": "832830fffffffff",   // H3 cell index, resolution 3
      "lat": 48.86, "lon": 2.35, // cell centroid, 2 decimals
      "n": 412,                  // articles whose primary location falls in this cell
      "o": 150,                  // distinct outlets (source domains)
      "c": 23,                   // distinct source countries (outlets' countries), 0 if unknown
      "l": 9,                    // distinct languages
      "t": -2.1,                 // mean tone, 1 decimal (GDELT V2Tone first value)
      "name": "Paris, France"    // most common location full name in the cell, with GDELT artefacts removed
                                 // ("(General)", "City Of", repeated parts): "Washington, Washington, United States" -> "Washington, United States"
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
  the number of placed articles first seen on that day; days older than 14 are
  dropped. Counting happens as records are first merged, so dedupe by URL holds.
- The frontend may show relative heat only when `baselineDays` >= 3; until then it
  shows absolute heat. Relative weight = clamp(log2((n + 1) / (max(b, 3) + 1)) / 3,
  0, 1). Cells without a live `b` (replay-only cells) use the absolute weight and
  show no ratio.
- The carried file records `since`, the UTC day of its first run; that day and any
  back-filled earlier days are partial and never count as complete. Baseline,
  state and history live in the same cache entry, so they are restored or lost
  together (a baseline surviving a lost state would double count).

## `/data/cells/<id>.json`  (one file per cell, fetched on click)

```jsonc
{
  "id": "832830fffffffff",
  "name": "Paris, France",
  "n": 412, "o": 150, "c": 23, "l": 9, "t": -2.1,
  "topOutlets":  [["lemonde.fr", 31], ["bbc.co.uk", 12]],  // top 10 by article count
  "topCountries":[["FR", 190], ["GB", 40], ["US", 38]],    // ISO 3166-1 alpha-2 of outlet country, "" allowed
  "languages":   [["fr", 220], ["en", 150], ["de", 12]],   // ISO 639-1 where known
  "articles": [
    {
      "title": "…",                     // page title, trimmed to 160 chars, may be empty
      "url": "https://…",
      "source": "lemonde.fr",           // source domain (GKG SourceCommonName)
      "country": "FR",                  // outlet country, "" if unknown
      "lang": "fr",                     // "en" when GDELT gives no translation info
      "time": "2026-10-20T18:45:00Z",   // GKG DATE
      "tone": -3.4,
      "image": "https://…",             // GKG SharingImage, "" when none
      "video": "https://www.youtube.com/watch?v=…"  // first YouTube URL from GKG SocialVideoEmbeds, "" when none (added 2026-10-21)
    }
  ],
  "videos": 7                           // number of the cell's articles (whole window) that carry a video (added 2026-10-21)
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
fewer than 10 outlets.

### Stories (added 2026-10-21)

A cell file also carries `stories`: groups of the cell's articles that are about the
same thing, computed deterministically from what GDELT already tags per article
(persons, organisations, themes) plus title tokens. No model, no text of ours.

```jsonc
"stories": [
  {
    "n": 212, "o": 96, "c": 21, "l": 7, "t": -4.1,   // same meaning as the cell counters, over the story's articles
    "first": "2026-10-21T01:15:00Z", "last": "2026-10-21T04:30:00Z",
    "headline": "…",            // the title of the story's medoid article (max token overlap with the rest); may be empty
    "headlineSource": "bbc.co.uk",
    "headlineLang": "en",
    "entities": ["donald trump", "nato", "brussels"],  // up to 5 most shared persons/orgs/themes, lowercase, as GDELT spells them
    "articles": [ { …same article object as above… } ] // newest 6, outlet-spread (max 2 per outlet)
  }
],
"unclustered": 140        // articles in the cell that belong to no story with n >= 3
```

Rules:
- Stories are sorted by `n` descending; at most 12 per cell; a story needs `n` >= 3.
- Every article in the cell belongs to at most one story. `sum(stories[].n) +
  unclustered == n` of the cell.
- `headline` is a verbatim title from an outlet, chosen by overlap, never written or
  edited by us. If the medoid has no title, use the next best article that has one.
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
  unclustered, partly because of the 12-story cap.

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
      "totals": { "articles": 39304, "outlets": 5384, "countries": 159, "cells": 1600, "unplaced": 9200 }
    }
  ]
}
```

## `/data/history/<file>.json`  (one compact frame, fetched on demand)

```jsonc
{
  "at": "2026-10-21T04:47:14Z",
  "cells": [
    ["832aa8fffffffff", 38.96, -76.55, 1401]   // [id, lat, lon, n], sorted by n descending
  ]
}
```

Frames carry only what the heat layer needs. Target size: under 150 KB per frame
uncompressed (a full 24h window measured 127 KB, about 36 KB gzipped on the wire).
Cells with `n` < 2 are dropped, as in `heat.json`. No per-cell detail files exist for
past frames: `cells/<id>.json` always describes the current snapshot only.

## Carried files: `state.json.gz` and `history.json.gz`  (ingest-internal)

Compact per-article records for the rolling window, and the retained frames, so the
next run can merge new files without refetching. Formats are up to the ingest side.
They are **not published on the site**: in CI they live in `CARRY_DIR` and travel
between runs through the GitHub Actions cache (a full 24h state is ~37 MB, far too
much to fetch from Pages 96 times a day). The ingest job can still read them from an
http(s) URL (`STATE_URL`, `HISTORY_URL`) where a 404 means start empty and any other
failure fails the run; that path is unused in production.

## Rules both sides rely on

- H3 resolution 3 everywhere for phase 1 (about 12,000 land cells, ~100 km across).
- Coordinates are WGS84. `lon` in [-180, 180].
- Primary location of an article = the first entry in GKG V2Locations whose Type is
  not 1 (i.e. not a country-level mention). An article whose every location is
  country-level is **not placed in any cell**: it is counted in `totals.articles` and
  `totals.unplaced` only. A country centroid is not where anything happened, so it
  must never glow. (Cell `name` for the rare non-country location whose name is a
  demonym is left as GDELT gives it.)
- `image` is always present, `""` when missing. `topCountries` and `languages` are
  capped at 10 entries like `topOutlets`. `totals.articles` counts every article in
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
