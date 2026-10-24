# Placement audits

The calibration of the map: how often a story is drawn at a place it is not about. Run
weekly by the maintainers, by hand. No model judges anything here, and nothing in the
pipeline judges text; the audit is a person reading headlines and articles.

## What is measured

For each story in the sample one question: is this story plausibly about, or datelined
from, this place? Three labels:

- **right**: yes. The headline or the story's other titles name the place, its region or
  its country, or the article is datelined there. A national story placed at the seat of
  government (a Russian ministry story in Moscow, a US federal story in Washington) is
  right.
- **wrong**: the place is one the story is not about.
- **unclear**: the headline and titles do not settle it either way, and the article does
  not either (a markets wrap, a film review, a region-wide study).

A wrong row gets a cause, one of three groups, with an optional detail after a colon
(`other:border cell`):

- **same-name**: a place of the same name elsewhere (Athens, Ohio for Athens).
- **boilerplate**: an outlet's fixed location (its own name read as a place, a footer, a
  sidebar) placed the article.
- **other**: anything else; say what in the detail and the note (a border cell named for a
  place across the line, a secondary mention, a GDELT coordinate far from its name).

Two more columns are filled for every row: `quality` (`ok`, `tabloid_caps`,
`truncated_or_garbled`, `wrong_language_tag`) for the headline text, and `source_known`
(`known` for an outlet a reader would recognise, `small/aggregator` otherwise). `note`
says in a few words why the label was given.

The headline number is the wrong rate over every story in the sample, unclear included,
with its 95% Wilson interval. The bar (docs/PLAN.md, "World-class: the program"): under 2%,
with the interval's upper bound under 4%.

## The routine

1. **Snapshot and sample.** Pick the UTC date of the audit as the seed, `YYYYMMDD`. From
   `ingest/`:

   ```
   npm run audit-sample -- <scratch dir> --fetch --out ../docs/audits/YYYY-MM-DD-placement.csv
   ```

   `--fetch` saves the live `heat.json` into the directory and then the chosen cells'
   files into `cells/`, so the snapshot is exactly what was judged. Without `--seed` the
   seed is the snapshot's UTC date (`generatedAt`), which is the audit's date when the
   snapshot is taken that day. The script prints the seed, the snapshot time, the counts
   and every cell and story drawn to stderr; the CSV has the columns above with
   `source_known`, `label`, `quality`, `cause` and `note` empty.

   The rule: the cells with 10 or more articles, sorted by articles then id; the 20
   largest, plus 60 drawn by weight (articles) without replacement; in each chosen cell its
   first story and one more at random among the others with at least 3 distinct
   headlines. About 68 cells and 120 to 130 stories.

2. **Archive the snapshot.** Tar the directory (`heat.json` and `cells/`) as
   `audit-<stamp>.tar.gz`, where `<stamp>` is the snapshot's `generatedAt` without `-`
   and `:`, and upload it to that day's archive release:

   ```
   tar -czf audit-<stamp>.tar.gz -C <scratch dir> heat.json cells
   gh release upload archive-YYYY-MM-DD audit-<stamp>.tar.gz --clobber
   ```

   The snapshot is not committed to the repo (about 5 MB unpacked, 1.3 MB packed).

3. **Judge.** Fill the empty columns, row by row, with the story open in the cell file (its
   `articles` carry the titles and links). The headline and the story's other titles
   name the place, its region or its country: right. A national story at the seat of
   government: right. When in doubt, read the article, and say so in the note.

4. **Tally.** From `ingest/`:

   ```
   npm run audit-tally -- ../docs/audits/YYYY-MM-DD-placement.csv
   ```

   It prints right / wrong / unclear, the wrong rate with its interval, the same for the
   rows from the 20 largest cells, the share of known outlets and the causes. It refuses a
   file with an unlabelled row.

5. **Record.** Add a row to the table below and commit the CSV with it. A rule change
   that the audit led to is dated in docs/PLAN.md and, when it changes what the site does,
   in docs/METHODOLOGY.md.

Files are named `YYYY-MM-DD-placement.csv`, the audit's UTC date, plain UTF-8 without a
byte-order mark.

## Reproducing the first audit

The first audit's sample was drawn by a Python script with `random.Random(20261024)`.
`audit-sample` reimplements that generator (Python's Mersenne Twister with its seeding,
`random()` and `choice()`), so on the same snapshot it draws the same sample. Download
`audit-20261024T020154Z.tar.gz` from the release `archive-2026-10-24`, unpack it and run:

```
npm run audit-sample -- <unpacked dir> --seed 20261024
```

It draws 68 cells and 128 stories, row for row the first ten columns of
`2026-10-24-placement.csv`.

## Results

| Date | Snapshot (UTC) | Cells | Stories | Right | Wrong | Unclear | Wrong | 95% interval | Known outlet | Note |
|---|---|---|---|---|---|---|---|---|---|---|
| [2026-10-24](2026-10-24-placement.csv) | 02:01:54 | 68 | 128 | 81 | 19 | 28 | 14.8% | 9.7 to 22.0% | 66 of 128 (52%) | First audit, before trust pass two; same-name 7, boilerplate 4, other 8; 20 largest cells 4 of 40. |
