# Outlet country data

`src/domains.ts` gives each article's outlet (its source domain) a country. It asks these
sources in order and takes the first answer:

1. `domain-country-overrides.txt` (hand-maintained)
2. `MASTER-GDELTDOMAINSBYCOUNTRY-MAY2018.TXT` (GDELT, 2018)
3. the domain's country-code TLD (`.fr` -> FR, `.co.uk` -> GB), skipping the generic ones
   in `TLD_DENY_LIST` in `src/domains.ts` (`.io`, `.tv`, `.co`, `.me`, `.fm`, ...)
4. `GDELT-DOMAINSBYCOUNTRY-2015-2021.TXT` (GDELT, 2021, reduced)
5. otherwise unknown ("")

Each source also matches subdomains: `news.example.co.uk` is looked up as
`news.example.co.uk`, then `example.co.uk`, then `co.uk`. `loadDetailedCountryLookup()`
returns `{ country, source }` so tests and scripts can see which source answered.

## The files

### `domain-country-overrides.txt`

Corrections that win over every other source. One entry per line, tab-separated:

```
domain<TAB>ISO 3166-1 alpha-2 or empty<TAB>comment
```

An empty country forces "unknown". Lines starting with `#` are comments. A malformed line
(bad domain, country that is not two letters) makes the ingest run fail, so typos are
caught. It currently holds:

- `storm.mg` -> TW (a Taiwanese outlet that the 2018 list labels Madagascar from its TLD).
- 333 Big News Network portals (asiabulletin.com, japanherald.com, israelherald.com,
  the `*news.net` sites, ...) set to unknown. They are one aggregator network republishing
  the same copy under country and city names, so counting each under the country in its
  name inflated country counts. The list comes from the network's own directory,
  https://www.bignewsnetwork.net/ (checked 2026-10-21). `outlet-networks.txt` also
  counts them as one outlet.

### `outlet-networks.txt`

Not a country source: it says which domains count as **one outlet**. `src/domains.ts`
`outletOf(source)` returns the network name for a listed domain and the domain itself
otherwise. Outlet counts (`o`, `topOutlets`, `totals.outlets`), the per-outlet caps of the
article and story lists, "one article per outlet and headline" (an outlet's copies of a
headline count once in `n`) and learned title tails all use it. Articles keep their own
domain in `source`. One entry per line, tab-separated:

```
domain<TAB>network name<TAB>comment
```

A plain domain matches that domain only. A leading dot (`.iheart.com`) matches the domain
and every subdomain (`wkip.iheart.com`). An exact entry wins over a dotted one, and among
dotted entries the longest suffix wins. Lines starting with `#` are comments; a malformed
line (bad domain, no network name) makes the ingest run fail. It currently holds:

- the 333 Big News Network domains of `domain-country-overrides.txt`, dotted, under the
  network `bignewsnetwork.com` (they were 48% of Taipei's outlets and 22% of New Delhi's
  on 2026-10-23);
- `.iheart.com` -> `iheart.com`: iHeartMedia's radio station sites, which run the same
  national copy with each station's name as the title tail.

The Big News Network block was generated from the overrides file (every entry whose comment
is "Big News Network"); keep the two lists in step when one changes. Domestic chains seen
inflating `o` at home (Newsquest, Ippen, MediaNews, Sinclair) are not listed yet.

### `MASTER-GDELTDOMAINSBYCOUNTRY-MAY2018.TXT`

GDELT's "Mapping The Media" outlet-country list, May 2018 update, vendored unchanged:
https://data.gdeltproject.org/blog/2018-news-outlets-by-country-may2018-update/MASTER-GDELTDOMAINSBYCOUNTRY-MAY2018.TXT
Format: `domain<TAB>FIPS 10-4 code<TAB>country name`, no header; FIPS is converted to ISO on
load (`src/fips-to-iso.ts`). GDELT appears to have given national ccTLDs their country and
other domains the country they cover most.

### `GDELT-DOMAINSBYCOUNTRY-2015-2021.TXT`

Derived from GDELT's "Top Five Countries Mentioned By News Outlet 2015-2021" (blog post of
2021-07-28, https://blog.gdeltproject.org/?p=14261):
https://blog.gdeltproject.org/wp-content/uploads/2021-news-outlets-by-countrycode-2015-2021.csv
That CSV (`domain,countrycode,cnt`, up to five FIPS rows per domain, about 162,000 domains)
is raw "most-mentioned country" counts, not a curated origin list: it labels many national
outlets with the country they report on most (some Dutch `.nl` outlets as US, Palestinian `.ps`
outlets as Israel, storm.mg as China). So it ranks below the 2018 list and the ccTLD, and
only a reduced copy is vendored, in the 2018 file's format:

- domains not in the 2018 list,
- whose top country has at least 20 mentions and at least 40% of the five listed counts,
- whose FIPS code converts to ISO.

That leaves 26,531 domains. On the generic-TLD domains both lists share, this rule agrees
with the 2018 list 98% of the time. To rebuild it: download the CSV, apply the rule
above, and write `domain<TAB>FIPS<TAB>country name` lines sorted by domain.

No newer GDELT outlet-country list was found (searched 2026-10-21).
GDELT data is free and open; cite The GDELT Project.

## Finding unknown outlets

```
cd ingest
npx tsx scripts/unknown-outlets.ts out/state.json.gz        # exact: every article in the window
npx tsx scripts/unknown-outlets.ts ../web/public/data        # state.json.gz there, else cells' topOutlets (approximate)
```

It prints the share of articles and outlets with unknown country as each source is added
(the 2018 list alone was the old behaviour), which source answered for how many, and the
top 50 domains no source knows, by article count. Add the ones you can identify to
`domain-country-overrides.txt`.
