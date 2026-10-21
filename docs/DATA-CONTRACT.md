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
      "name": "Paris, France"    // most common location full name in the cell
    }
  ]
}
```

Short keys keep the file small. Target size: under 1.5 MB uncompressed for a 24h window.
Cells are sorted by `n` descending. Cells with `n` < 2 may be dropped.

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
      "image": "https://…"              // GKG SharingImage, optional
    }
  ]
}
```

`articles` is the newest 50 in the cell, newest first, de-duplicated by URL. Pick a
spread of outlets: no outlet contributes more than 5 of the 50 unless the cell has
fewer than 10 outlets.

## `/data/state.json.gz`  (ingest-internal, frontend never reads it)

Compact per-article records for the rolling window so the next run can merge new
files without refetching the whole window. Format is up to the ingest side.

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
- Missing values are `""` for strings and `0` for numbers, never `null`.
