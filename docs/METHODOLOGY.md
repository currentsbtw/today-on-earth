# How Today On Earth works

Draft for the site's methodology page (2026-10-21). Every sentence here must stay
true of the running system; update it when the system changes.

## What you are looking at

A map of where the world's news is pointing right now. Each dot is a place that
articles published in the last 24 hours are about. A bigger dot means more articles.
That is all it means. It is not a map of what matters, and it is not a map of what
happened; it is a map of coverage.

## Where the articles come from

Every article comes from the GDELT Project, an open dataset that monitors news
websites around the world in more than 100 languages and publishes what it found
every 15 minutes. We read two of its feeds: the English feed and the translated
feed, which covers articles written in other languages. We do not choose outlets.
If GDELT saw it, it is here.

## How a place is chosen for an article

GDELT lists the places each article mentions, once per mention. We take the city the
article mentions most (a city or landmark, in GDELT's terms); when two cities are
mentioned equally often, the one mentioned first in the text. Articles that mention no
city, only states, regions or countries, are counted in the totals but are not drawn
anywhere, because the centre of a state or a country is not where anything happened. The
header tells you how many articles were left unplaced.

Some outlets carry the same place in every article: a footer, a dateline, a sidebar, or
their own name read as a place. So for each outlet (a listed network counts as one) with
at least 20 articles in the window that name a city or region, a place that appears with
the same number of mentions in at least half of those articles is treated as the outlet's
fixed block and skipped. The article then takes its next city (we keep its three
most-mentioned cities) or, when no city is left, is left unplaced. The same number of
mentions is what separates a fixed block from a local outlet that really covers its city,
where the count varies. The cost: a wire outlet whose every article carries a
one-mention dateline loses that place, even in articles that are about it, and those of
its articles that mention no other place are left unplaced.

Places are grouped into hexagonal cells about 100 km across, so "Paris" and its
suburbs are one dot. An article whose only place is a state or region ("Texas") is
therefore not drawn at that region's centre, a point the article never named; we keep the
region with the article, so the rule can be revisited. The cost: when GDELT reads a city
as its state ("New York" for New York City is the common case), that article is left
unplaced too.

## What the numbers mean

- **Articles**: distinct headlines per outlet in the window. An outlet that publishes the
  same headline under several URLs counts once for it in each place (headlines match by
  the rule under Distinct and reprints; an article with no title counts once per URL).
  A network of sites under one owner, listed in the ingest's networks file, counts as
  one outlet.
- **Outlets**: distinct website domains; a listed network counts once. So does a listed
  chain of local sites that run the same copy: Newsquest, Ippen, MediaNews Group (with
  Tribune Publishing), Sinclair, Australian Community Media, Hearst Television, Scripps,
  Townsquare Media, NBCUniversal and Fox stations, Cox Media Group, Graham Media, Forum
  Communications, Postmedia, Black Press, Funke, EBRA, Keskisuomalainen and Nine. Its
  sites' copies of one headline are then one article.
- **Outlet countries**: the countries those outlets are based in, from GDELT's own list of
  news domains by country. Unknown outlets count as unknown, not as any country.
- **Languages**: the language the article was written in, as GDELT recorded it.
- **Tone**: GDELT's tone score for the article, from negative to positive. We show
  it as a small mark, never as a word.
- **Distinct** and **reprints**: many sites republish the same wire story under the
  same headline. Within one place, articles whose titles match after we ignore case,
  punctuation and a trailing outlet name or short label of one or two words
  (" - Reuters", " | The Star", " - Politics") count as one distinct headline; the
  copies by other outlets are reprints. A trailing label that one outlet puts on three
  or more different headlines (a station name, a slogan) is treated like an outlet name.
  Both numbers are shown and nothing is hidden: the article list shows each headline
  once, marked with how many reprints it has. Brightness uses the article count,
  reprints included. A title is shown without the trailing outlet name, short label or
  learned label this rule ignores; the page at the link keeps its full title, and
  nothing else in a title is changed.
- **Heard in N other countries**: the countries of the outlets covering a place, not
  counting the place's own country (the country GDELT most often gives for the
  place's articles). Outlets with an unknown country are not counted.
- **Largest news countries**: the 20 outlet countries with the most articles in the
  window, counted over every place. The site names the first 12.
- **Silent**: a country among the 12 largest news countries with no article from an
  outlet based there in the window, for that place or that story. Silent means that and
  nothing more. The place's own country is never listed as silent for the place or its
  stories.
- **Normal**: the median of the place's daily article counts over the last 7 complete
  UTC days (fewer while less history exists), shown once 3 complete days exist, with
  today's ratio: "usually about 37 articles a day · today ×2.4". The ratio is
  (articles + 1) / (normal + 1), with a floor of 3 for the normal, as in "vs. normal"
  below. A normal of 0 (no articles on more than half of those days) is shown as
  "usually no articles on most days".

## How "hot" is decided

A dot's size is the article count on a logarithmic scale, in five steps; the two
smallest steps are drawn grey, the rest white. Nothing about the articles' content feeds into it: not
what they say, not which outlets wrote them, not what we think. Places with heavy
media presence (Washington, London) will usually be big; that is a fact about
coverage, and we show it rather than correct it.

A second view, "vs. normal", appears once at least three complete days of history
exist. It compares each place's current count with the median of its own daily
counts over the last seven days, so a quiet place lighting up stands out and a
place that is always busy does not. The dot size is log2((articles + 1) /
(normal + 1)) scaled so that eight times normal is full brightness; the floor for
"normal" is 3 articles so that tiny places do not explode. Places that are not in
the current snapshot are shown with the ordinary brightness and no ratio; a place
with no history at all counts as new, with a normal of zero.

## Stories

Inside a place, articles are grouped into stories using only what GDELT already
tagged for each article: the people, organisations and themes it mentions (its tags),
plus the words in its title. An outlet's copies of one headline count as one article
here too. Articles are taken oldest first. One joins the group it matches best when it
shares two of the group's ten most common tags, or one of those tags and two of the
group's twenty most common title words, or four of those words; otherwise it starts a
group. Groups whose five most common tags share three are merged. In a place with 50
or more articles, a tag on more than 15% of them (a backdrop, such as "white house" in
Washington) is ignored for grouping.

A group of at least 3 articles is a story, and so is a pair of articles from two
different outlets that share two names (people or organisations) or three title words.
A place shows its 30 largest stories in full and the rest, up to 200, as a headline with
its numbers, largest first. Then each article outside every story joins the story whose twenty most common title
words it shares three or more of (ties go to the larger story); it counts in that
story but never supplies its headline. The headline shown for a story is the title of
one of its grouped articles, chosen because it overlaps most with the others, shown as
described under Distinct and reprints. We never write a headline. The headline is credited to
the earliest copy GDELT saw from an outlet that writes its own stories; sites that re-host other
outlets' articles (a public list, ingest/data/republishers.txt) are credited only when no one else
carried the title. Articles that fit no
story are listed below, unfiltered.

A story written by one outlet alone comes after the stories from two or more outlets and
is marked ONE OUTLET; it is never hidden. One outlet's placement has no second source to
check it against, and the first audit (see Accuracy) found 5 of 8 such stories at the
wrong place.

## The daily broadcast

The Signals button opens a daily broadcast: six fixed slots, each filled by one story
from the last 24 hours under a published rule. A filled slot shows an outlet's own
headline, verbatim apart from the trailing outlet name or label (see Distinct and
reprints), and the story's coverage numbers. Nothing in it is written or
summarised by us or by a model. The sentence above each headline is a fixed template
filled with the story's own numbers ("One story over Nairobi: 214 articles from 61
outlets in 19 languages."), so they count that story, not everything written about
the place.

Every slot needs a story with at least 3 distinct headlines, so one article echoed
across many sites never fills a slot, and the story must have a headline. "Heard
across the planet" also needs the place's own country to be known. The slots, in
order:

- **Loudest signal**: the story with the most independent voices: distinct
  headlines, counting at most one per outlet (so neither syndication networks nor one
  outlet's many copies win).
- **Heard across the planet**: the story with the most countries other than the
  place's own; at least 10 outlets.
- **Rising**: the place most above its own normal (articles divided by the larger of
  its normal and 3); its story is that place's story with the most outlets. Needs 3
  complete days of history; at least 20 articles.
- **Most positive tone**: the most positive mean tone among stories with at least 10 outlets,
  3 countries and 10 articles.
- **Ordinary life**: the most outlets among stories where at most a quarter of the
  articles carry conflict, politics, crime or disaster themes; at least 10 outlets
  and 2 countries.
- **Faint signal**: the most outlets from a place that is usually quiet (a normal of
  at most 3 articles a day, including places with no history). Needs 3 complete days
  of history; at least 5 outlets and 2 countries.

The broadcast page (`broadcast.html`), its feed and each place's feed carry the same fixed
sentences, headlines and numbers as the site, nothing more.

The four theme families, in full, from GDELT's own theme tags. A name ending in `*`
covers every theme that starts with it.

- **Conflict**: ARMEDCONFLICT, MILITARY, TERROR, WMD, REBELLION, REBELS, SEIGE,
  BLOCKADE, CEASEFIRE, KILL, WOUND, UNREST_*.
- **Politics**: ELECTION, LEGISLATION, GENERAL_GOVERNMENT, LEADER, GOV_*,
  USPEC_POLITICS_GENERAL1, POLITICAL_TURMOIL, RESIGNATION, APPOINTMENT,
  CONSTITUTIONAL, DEMOCRACY, NEGOTIATIONS, ALLIANCE, SANCTIONS, SOVEREIGNTY.
- **Crime**: ARREST, TRIAL, SOC_GENERALCRIME, CRIME_*, KIDNAP, RAPE, DRUG_TRADE,
  ORGANIZED_CRIME, CORRUPTION, CYBER_ATTACK.
- **Disaster**: NATURAL_DISASTER_*, MANMADE_DISASTER_* (except
  MANMADE_DISASTER_IMPLIED), DISASTER_*, EVACUATION.

GDELT's CRISISLEX themes are deliberately not used. They are word-list matches, not
topics, and they tag about a third of all articles, restaurant reviews and earnings
calls included.

Each story fills at most one slot, taken in the order above. Within a slot, ties go to
the story with more articles, then the earlier story, then the place; the loudest slot
first breaks ties by more outlets. An empty slot says why: not enough history yet,
with the date it can start, or no story met the rule.

The choice of slots and their thresholds is a framing decision, made once and
published here. The filled slots also close the daily clip, each as a card before the
final one.

## What this site does not do

- It does not rank, recommend or summarise. The daily broadcast's slots are maxima
  under the rules above, computed from the numbers alone; nobody picks them.
- It does not host articles or videos. Links go to the outlet. When an outlet
  embedded a YouTube video, we show its title and outlet as a plain card; nothing is
  requested from YouTube until you press play, and the player is YouTube's
  privacy-enhanced one.
- It does not know what is true. A place can light up because of a rumour.
- It does not see everything. GDELT misses outlets, geocodes wrongly sometimes,
  and sees more of the English-language web than any other. Dark areas mean no
  coverage was found, which is not the same as nothing happening.
- It has no editor and no feed. What you see is the same for everyone.

## Accuracy

How often a story is drawn at a place it is not about is measured by hand, weekly, by
the maintainers; no model takes part. Each audit draws a fixed sample from one snapshot:
the 20 places with the most articles and 60 more drawn at random, weighted by their
article count, with the audit's date as the seed, so anyone with the snapshot draws the
same sample again; in each place, its largest story and one more at random. For each
story a person asks one question: is this story plausibly about, or datelined from, this
place? The answer is right, wrong or unclear. A national story placed at the seat of
government counts as right.

The first audit, on 24 October 2026 (the snapshot of 02:01:54 UTC), judged 128 stories in
68 places: 81 right, 19 wrong, 28 unclear. That is 14.8% wrong, with a 95% interval of 9.7
to 22.0%. Among the 20 largest places, 4 of 40 were wrong. The causes of the 19:

- **Same name** (7): a place of the same name in another country, such as Athens, Ohio,
  for an article about Athens.
- **An outlet's fixed location** (4): an outlet's own name or standing location read as a
  place, in cases the fixed-block rule above does not catch.
- **Other** (8): a cell on a border named for a place across the line, a place the
  article only mentions in passing, or a GDELT coordinate far from the place it names.

The bar we have set is under 2% wrong, with the interval's upper bound under 4%. The site
is not there yet. A rule change that comes from an audit is dated here when it ships, and
the next audit measures it.

Rule changes since the first audit, 24 October 2026: a top story must name its place in
its own text; a story from one outlet is shown last and marked; garbled region parts and bare
codes are dropped from place names; an article that names no city is not drawn; a listed chain
of local sites counts as one outlet; local-language place names from GeoNames confirm places. 24 October 2026, 06:09 UTC: every group of three or more articles is a story, the first 30 in full and the
rest as a headline, and two outlets on the same names count as a story. 24 October 2026, 17:00
UTC: a headline is credited to the earliest copy from an outlet that writes its own stories, not to
a site that re-hosts it.

The record is the table of results in docs/audits/README.md, one dated row per audit,
with each audit's per-story labels beside it and its snapshot in the archive.

## Replay

The Replay section (the right column on wide screens, below the map on narrower ones) replays the last 24 hours in 15-minute steps. Each step
is a snapshot of the same rolling window at that time.

The replay bars show how many articles were new in each step, not the window's total.
An article is new in a step when it was not in the previous snapshot's window. A
snapshot made after a restart, or with no previous snapshot in the 24 hours before it,
has no count and is drawn as unknown, as are snapshots made before 22 October 2026.

GDELT publishes in 15-minute files, and the translated feed arrives about an hour after
the English one, so the number of new articles per step rises and falls with that rhythm.

## Freshness

A new snapshot is built every 15 minutes. The header shows the time of the one you
are looking at, in UTC. Right after a restart the window is shorter than 24 hours and
the header says so.

## Earthquakes

An optional layer draws earthquakes of magnitude 2.5 and above from the last 24
hours, straight from the United States Geological Survey's public feed. It is off
by default, and nothing is requested from USGS until you turn it on. Rings are sized
by magnitude; they are not part of the news heat and never affect it.

## Data, code, attribution

The site is open source. Map outlines are from Natural Earth (public domain). News
data is from the GDELT Project, used under its open terms with attribution.
Earthquake data is from the USGS Earthquake Hazards Program. Local-language place names
from GeoNames (geonames.org), CC BY 4.0 (creativecommons.org/licenses/by/4.0/), filtered
to this site's places and languages.
