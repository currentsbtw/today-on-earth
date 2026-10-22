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

GDELT lists the places each article mentions. We take the first place that is more
specific than a whole country: a city, a region, a landmark. Articles that only
mention countries are counted in the totals but are not drawn anywhere, because a
country's centre is not where anything happened. The header tells you how many
articles were left unplaced for this reason.

Places are grouped into hexagonal cells about 100 km across, so "Paris" and its
suburbs are one dot. When an article's most specific place is a state or region
("Texas"), its dot sits at that region's centre; that is less wrong than a country's
centre, but it is still a centre, and the label tells you so.

## What the numbers mean

- **Articles**: distinct URLs in the window.
- **Outlets**: distinct website domains.
- **Outlet countries**: the countries those outlets are based in, from GDELT's own list of
  news domains by country. Unknown outlets count as unknown, not as any country.
- **Languages**: the language the article was written in, as GDELT recorded it.
- **Tone**: GDELT's tone score for the article, from negative to positive. We show
  it as a small mark, never as a word.
- **Distinct** and **reprints**: many sites republish the same wire story under the
  same headline. Within one place, articles whose titles match after we ignore case,
  punctuation and a trailing outlet name (" - Reuters", " | The Star") count as one
  distinct headline; the others are reprints. Both numbers are shown and nothing is
  hidden: the article list shows each headline once, marked with how many reprints it
  has. Brightness still uses the article count, reprints included.
- **Heard in N other countries**: the countries of the outlets covering a place, not
  counting the place's own country (the country GDELT most often gives for the
  place's articles). Outlets with an unknown country are not counted.

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
tagged for each article: the people, organisations and themes it mentions, plus the
words in its title. The headline shown for a story is the title of one of its
articles, chosen because it overlaps most with the others. We never write or edit a
headline. Articles that fit no group are listed below, unfiltered.

## The daily broadcast

The Signals button opens a daily broadcast: six fixed slots, each filled by one story
from the last 24 hours under a published rule. A filled slot shows an outlet's own
headline, verbatim, and the story's coverage numbers. Nothing in it is written or
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
Earthquake data is from the USGS Earthquake Hazards Program.
