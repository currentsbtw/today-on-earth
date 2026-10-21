# How Today On Earth works

Draft for the site's methodology page (2026-10-21). Every sentence here must stay
true of the running system; update it when the system changes.

## What you are looking at

A map of where the world's news is pointing right now. Each glow is a place that
articles published in the last 24 hours are about. Brighter means more articles.
That is all it means. It is not a map of what matters, and it is not a map of what
happened; it is a map of coverage.

## Where the articles come from

Every article comes from the GDELT Project, an open dataset that monitors news
websites around the world in more than 100 languages and publishes what it found
every 15 minutes. We read two of its feeds: the English feed and the translated
feed, which covers articles written in other languages. We do not choose outlets.
If GDELT saw it, it is here.

## How a place is chosen for an article

GDELT lists the places each article mentions. We take the first place that is more
specific than a whole country: a city, a region, a landmark. Articles that only
mention countries are counted in the totals but are not drawn anywhere, because a
country's centre is not where anything happened. The header tells you how many
articles were left unplaced for this reason.

Places are grouped into hexagonal cells about 100 km across, so "Paris" and its
suburbs glow together.

## What the numbers mean

- **Articles**: distinct URLs in the window.
- **Outlets**: distinct website domains.
- **Countries**: the countries those outlets are based in, from GDELT's own list of
  news domains by country. Unknown outlets count as unknown, not as any country.
- **Languages**: the language the article was written in, as GDELT recorded it.
- **Tone**: GDELT's tone score for the article, from negative to positive. We show
  it as a small mark, never as a word.

## How "hot" is decided

Brightness is the article count on a logarithmic scale, squared so that only the
busiest places reach white. Nothing else feeds into it: not what the articles say,
not which outlets wrote them, not what we think. Places with heavy media presence
(Washington, London) will usually be bright; that is a fact about coverage, and we
show it rather than correct it. A relative view, comparing each place with its own
normal, is planned once enough days of history exist.

## Stories

Inside a place, articles are grouped into stories using only what GDELT already
tagged for each article: the people, organisations and themes it mentions, plus the
words in its title. The headline shown for a story is the title of one of its
articles, chosen because it overlaps most with the others. We never write or edit a
headline. Articles that fit no group are listed below, unfiltered.

## What this site does not do

- It does not rank, recommend or summarise.
- It does not host articles or videos. Links go to the outlet; videos play from
  YouTube's own player when an outlet embedded one.
- It does not know what is true. A place can glow because of a rumour.
- It does not see everything. GDELT misses outlets, geocodes wrongly sometimes,
  and sees more of the English-language web than any other. Dark areas mean no
  coverage was found, which is not the same as nothing happening.
- It has no editor and no feed. What you see is the same for everyone.

## Replay

The scrubber under the map replays the last 24 hours in 15-minute steps. Each step
is a snapshot of the same rolling window at that time.

## Freshness

A new snapshot is built every 15 minutes. The header shows the time of the one you
are looking at, in UTC.

## Data, code, attribution

The site is open source. Map outlines are from Natural Earth (public domain). News
data is from the GDELT Project, used under its open terms with attribution.
