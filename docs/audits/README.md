# Accuracy audits

The calibration of the site: how often a story is drawn at a place it is not about, how often
an article is grouped into a story it is not about, whether the top-12 list the daily clip reads
is placed right, and how many headlines are credited to an outlet a reader would recognise. Run
weekly by the maintainers, by hand. No model judges anything here, and nothing in the pipeline
judges text; the audit is a person reading headlines and articles.

Each audit is four files, all drawn by one command from one snapshot with the audit's date as
the seed, named `YYYY-MM-DD-<kind>.csv` (the audit's UTC date, plain UTF-8 without a byte-order
mark):

| File | What | Rows |
|---|---|---|
| `-placement.csv` | stories across the map, placement | about 120 to 130 |
| `-grouping.csv` | grouped articles in the six measured cells, grouping | 100 |
| `-top12.csv` | every entry of `data/stories.json`, placement and outlet | up to 12 |
| `-headlines.csv` | story headlines in the six measured cells, outlet | 60 |

The six measured cells are Paris (831fb4fffffffff), London (83194afffffffff), Washington
(832aa8fffffffff), New Jersey (832aacfffffffff), Taipei (834ba0fffffffff) and New Delhi
(833da1fffffffff), the cells docs/PLAN.md's bars 2 and 3 are measured on.

## Placement: the standard

Used by `placement.csv` and by the `label` of `top12.csv`. For each story one question: is
this story plausibly about, or datelined from, this place? Three labels:

- **right**: yes. The headline or the story's other titles name the place, its region or
  its country, or the article is datelined there. A national story placed at the seat of
  government (a Russian ministry story in Moscow, a US federal story in Washington) is
  right.
- **wrong**: the place is one the story is not about.
- **unclear**: the headline and titles do not settle it either way, and the article does
  not either (a markets wrap, a film review, a region-wide study).

In `placement.csv` a wrong row gets a cause, one of three groups, with an optional detail
after a colon (`other:border cell`):

- **same-name**: a place of the same name elsewhere (Athens, Ohio for Athens).
- **boilerplate**: an outlet's fixed location (its own name read as a place, a footer, a
  sidebar) placed the article.
- **other**: anything else; say what in the detail and the note (a border cell named for a
  place across the line, a secondary mention, a GDELT coordinate far from its name).

Two more columns are filled for every placement row: `quality` (`ok`, `tabloid_caps`,
`truncated_or_garbled`, `wrong_language_tag`) for the headline text, and `source_known`
(below; the first audit wrote `small/aggregator` for both of the last two values). `note`
says in a few words why the label was given.

The headline number is the wrong rate over every story in the sample, unclear included,
with its 95% Wilson interval. The bar (docs/PLAN.md, "World-class: the program"): under 2%,
with the interval's upper bound under 4%.

## Grouping: the standard

Used by `grouping.csv`. Each row is one article of a story's `articles` and the story it was
grouped into. One question: **is this article about the story's headline?** The same event,
case, decision or match, not the same broad subject.

- **right**: yes, the article reports the headline's event or a direct development of it
  (a reaction, the next day's ruling), in any language.
- **wrong**: it is about something else that shares a name or a theme (a Figaro Ukraine piece
  in a school-shooting story; a Lumbee Tribe piece in a Mexico tariffs story).
- **unclear**: the title does not settle it and the article does not either; read the
  article when in doubt and say so in the note.

The number is the wrong rate over every row, unclear included, with its 95% Wilson interval.
The bar: wrong merges at 5% or less. **What 100 rows allow:** they show a rate well above the
bar (22 wrong of 100 is 15.0 to 31.1%), but they cannot certify 5% or less: 1 wrong of 100 has
an upper bound of 5.4%, 2 of 100 7.0%, 5 of 100 11.2%. Certifying the bar with the upper bound
under 5% takes about 200 rows with 3 or fewer wrong (3 of 200 is 0.5 to 4.3%). Until the rate
is near the bar, 100 a week is the trade between precision and the auditor's time; two weeks
of 100 can be pooled.

## Outlet: the standard (`source_known`)

Used by `top12.csv`, `headlines.csv` and `placement.csv`. The headline's credited source is:

- **known**: an outlet a reader would recognise: a newsroom with its own reporting, national
  or regional in standing. Earlier examples: newsday.com, npr.org, ria.ru, vedomosti.ru,
  theglobeandmail.com, rte.ie, europapress.es, aa.com.tr, foxnews.com, winnipegfreepress.com,
  theguardian.com, nos.nl, nikkei.com, english.news.cn.
- **small**: a newsroom a reader would not know outside its town or field, a chain's local
  site, a local station. Earlier examples: cootamundraherald.com.au, prpeak.com, goskagit.com,
  99jamzmiami.com, ktep.org, and the Newsquest sites bournemouthecho.co.uk and
  herefordtimes.com.
- **aggregator**: a portal, aggregator or republisher that re-hosts other outlets' articles.
  Earlier examples: zazoom.it, haberler.com, middleeaststar.com and bignewsnetwork.com (the
  Big News Network), aol.com, drimble.nl, baidu.com.

The number is the `known` share. The bar (bar 3): 80%.

## The routine

1. **Snapshot and sample.** Pick the UTC date of the audit as the seed, `YYYYMMDD`. From
   `ingest/`:

   ```
   npm run audit-sample -- <scratch dir> --fetch --out ../docs/audits
   ```

   `--fetch` saves the live `heat.json` and `stories.json` into the directory, then every cell
   file a sample reads into `cells/` (the placement cells, the six measured cells and the
   top-12 cells), fresh each time, so the snapshot is exactly what was judged; it stops if
   `stories.json` is of another run than `heat.json` (fetch again). Without `--seed` the seed
   is the snapshot's UTC date (`generatedAt`), which is the audit's date when the snapshot is
   taken that day. It writes the four files named for the seed's date, with the auditor's
   columns empty, and prints the seed, the snapshot time, the counts and every placement cell
   and story drawn to stderr.

   The rules, each from a generator of its own on the seed:
   - **placement**: the cells with 10 or more articles, sorted by articles then id; the 20
     largest, plus 60 drawn by weight (articles) without replacement; in each chosen cell its
     first story and one more at random among the others with at least 3 distinct headlines.
     About 68 cells and 120 to 130 stories.
   - **grouping**: in the six measured cells, every pair of a full story (one with
     `articles`, at most 6) and one of its articles that is not the headline's own copy;
     100 pairs drawn uniformly without replacement. About 800 to choose from.
   - **top12**: every entry of `stories.json`, in rank order.
   - **headlines**: every story with a headline in the six cells, full and compact; 60 drawn
     uniformly without replacement.

2. **Archive the snapshot.** Tar the directory (`heat.json`, `stories.json` and `cells/`) as
   `audit-<stamp>.tar.gz`, where `<stamp>` is the snapshot's `generatedAt` without `-`
   and `:`, and upload it to that day's archive release:

   ```
   tar -czf audit-<stamp>.tar.gz -C <scratch dir> heat.json stories.json cells
   gh release upload archive-YYYY-MM-DD audit-<stamp>.tar.gz --clobber
   ```

   The snapshot is not committed to the repo (about 5 MB unpacked, 1.3 MB packed).

3. **Judge.** Fill each file's empty columns, row by row, with the story open in the cell
   file (its `articles` carry the titles and links), each by its standard above:
   `placement.csv` and `top12.csv`'s `label` by placement, `grouping.csv`'s `label` by
   grouping, `source_known` by outlet. When in doubt, read the article, and say so in the
   note.

4. **Tally.** From `ingest/`:

   ```
   npm run audit-tally -- YYYY-MM-DD
   ```

   It reads the date's files in this folder (or the file paths given, as before) and prints
   placement (right / wrong / unclear, the wrong rate with its interval, the same for the rows
   from the 20 largest cells, the share of known outlets and the causes), the grouping wrong
   rate with its interval, the top-12 wrong placements and known share, and the headlines'
   known share. A missing file prints "–". It refuses a file with an unlabelled row.

5. **Record.** Add a row to the table below and commit the four CSVs with it. A rule
   change that the audit led to is dated in docs/PLAN.md and, when it changes what the site
   does, in docs/METHODOLOGY.md.

The second audit is due 2026-10-31 (seed 20261031).

## Reproducing the first audit

The first audit's sample was drawn by a Python script with `random.Random(20261024)`.
`audit-sample` reimplements that generator (Python's Mersenne Twister with its seeding,
`random()` and `choice()`), so on the same snapshot it draws the same sample. Download
`audit-20261024T020154Z.tar.gz` from the release `archive-2026-10-24`, unpack it and run:

```
npm run audit-sample -- <unpacked dir> --seed 20261024
```

It draws 68 cells and 128 stories, row for row the first ten columns of
`2026-10-24-placement.csv`. That snapshot has no `stories.json` and the first audit had only
the placement sample, so the other three are not drawn from it.

## Results

| Date | Snapshot (UTC) | Cells | Stories | Right | Wrong | Unclear | Wrong | 95% interval | Known outlet | Grouping wrong | Top-12 wrong | Headlines known | Note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [2026-10-24](2026-10-24-placement.csv) | 02:01:54 | 68 | 128 | 81 | 19 | 28 | 14.8% | 9.7 to 22.0% | 66 of 128 (52%) | – | – | – | First audit, before trust pass two; same-name 7, boilerplate 4, other 8; 20 largest cells 4 of 40. |
