# The Observer: a voice brief for the template alien

Status: written 2026-10-27 as a brief; the same evening the owner decided to build at once
rather than wait for the 2026-10-31 audit, so that the first public post goes out in this
voice. docs/PLAN.md "Ideas parking lot" records the decision trail (the three shapes
weighed; this is shape A).

## What this changes, and what it must not

Today On Earth speaks in fixed sentences: templates over the data, published in
docs/METHODOLOGY.md, with the outlet's own headline as the only words about any story.
This brief rewrites those templates in one character's voice. It changes who is speaking,
not what may be said.

Untouched by this brief:

- The ingest, the data contract, the audit and every number. The instrument is the
  product; the voice is its mouth.
- The chrome. Every Azeret Mono label (ARTICLES, OUTLETS, OUTLET COUNTRIES, the panel's
  count rows, the ledger row on a clip card, the column heads, the stamp) keeps the ledger's
  literal words. DESIGN.md already splits the page into two voices: mono for the chrome,
  Source Sans 3 for what a person reads as prose. The Observer speaks only in Source Sans.
  That split is what keeps every number legible while the frame around it goes strange.
- The six slot names. "Loudest signal", "Heard across the planet", "Rising", "Most positive
  tone", "Ordinary life", "Faint signal" are the published names of rules and appear in the
  methodology's Accuracy section. They stay.
- The disclosures. "Read by a synthetic voice from the outlets' own headlines." and the end
  card's READ BY A SYNTHETIC VOICE stay word for word. A disclosure is not a line of
  dialogue.
- The methodology's measuring sections. The about page gets the voice in its opening only;
  the rest is the calibration document and stays plain, and says so.
- The headline. Verbatim, the outlet's words, as today (the trailing outlet label removed
  for speech as script.mjs already does).

## The character

The Observer is the pixel figure already standing in the bottom-right corner: the globe
mark on a body, labelled OBSERVERS. This brief gives it the job it was always doing. It
has been assigned to count the news of one planet. It is very good at counting and knows
almost nothing about why the humans do anything. It reports what it measured, credits the
humans for what they wrote, and admits, without embarrassment, what it does not know.

The comedy is the gap between a perfect count and a total absence of understanding. It
comes from four places and nowhere else:

1. **Literalism.** It says exactly what the instrument did. "We did not read them. We
   counted them." is funny and is also the methodology ("nothing in the pipeline judges
   text").
2. **Newly learned categories.** It uses the humans' words for their things and marks them
   as the humans' words: "the humans call this day Tuesday", "what the humans call ordinary
   life". It never substitutes its own.
3. **Scale without awe.** Two hundred thousand articles in one rotation is reported in the
   same tone as two.
4. **Admitted ignorance.** It states that it does not know why, in fixed forms, at most
   once per surface.

What it is not: Morbo. No contempt, no sarcasm, no threat, no "puny". It does not find the
humans ridiculous; it finds them uncounted until it counts them. It never jokes about a
story, because it does not understand any story well enough to joke, and because the rule
below forbids it.

Register: short declaratives, present tense, no exclamation marks, no rhetorical
questions. Third person for the species ("the humans", "their press"); second person only
in the opening and closing of a broadcast ("your planet", "your screen"). First person
plural for itself ("we counted"), never "I": it is an instrument with a crew of one and the
grammar of a station.

### The rule, as a character trait

The product's rule is that nothing about the news is written by us. In the Observer's
voice the same rule reads as its defining limitation: it cannot tell what matters, so it
says nothing about what matters. Every line in this brief, and every future line, passes
three tests:

- **The grim-headline test.** Put the line next to the three most recent headlines in
  stories.json whose stories carry conflict or disaster themes. If the line reads as
  mocking, flippant or knowing beside any of them, cut it. The frame line that introduces a
  headline must be identical for every story, because any variation by story is a judgment.
- **The unit test.** Every number keeps the ledger's noun (articles, outlets, countries,
  languages, a day) in the same sentence, once. The 2026-10-22 decision that dropped the
  radio register ("Signal detected", "reports from transmitters") was taken because 456
  could be read as Paris's total; that cannot come back under a costume. The Observer may be
  strange about everything around a number and about nothing inside it.
- **The claim test.** Does the line say anything about a story beyond its existence, its
  place, its counts, its tone score and its language? Any verb about what happened, any
  adjective about an event, any cause, any "again", "finally", "still", "apparently": cut.

Words the Observer never uses, about anything: tragic, shocking, finally, again, still,
apparently, seems, important, matters, deserves, sadly, interesting, strange, bizarre.
Anything it does not understand is reported, not described.

### Admissions of ignorance (the fixed set)

These are the only forms. One per surface at most, and never inside a story line.

- "We do not know why."
- "This is not explained."
- "We did not read them. We counted them."
- "We cannot tell what matters. We can tell what was written."
- "We have not watched long enough."

## Vocabulary

Two layers. The frame is the Observer's; the units are the humans'.

| The ledger's word | What the Observer says | Where |
|---|---|---|
| article, articles | article, articles | everywhere a number is counted (unit test) |
| outlet, outlets | outlet, outlets | same |
| country, countries | country, countries | same ("territories" was considered and rejected: it is a different word for a counted unit) |
| language, languages | language, languages | same |
| a day (the normal) | a day | same |
| the last 24 hours | one rotation | the opening, the closing, the caption, the clip key, the map sentence |
| the world's press | their press | opening |
| people, readers, the world | the humans | everywhere in prose |
| the viewer | you, your screen, your planet | opening and closing only |
| wrote, published | wrote | the story frame; "published" is never used |
| pointing at (the map sentence) | wrote about | map sentence |
| the snapshot, the count | the count | empty states |
| Today On Earth | Today on Earth | the name is never translated or glossed |

Decision recorded for the owner to overrule: the counted nouns stay literal. A fully alien
lexicon (reports, news-organs, territories, tongues) is funnier for one viewing and fails
the unit test on the second, and it would make the methodology's "articles" and the clip's
"reports" two words for one audited number.

## The rewritten fixed sentences

Each row is the line as the code speaks it today, the Observer's line, and where it lives.
Variables are in braces as the code fills them. Where a line is unchanged, the row says so
and why.

### The newscast (render/src/script.mjs)

| Line | Today | The Observer |
|---|---|---|
| open | Today on Earth. {Weekday}, the {ordinal} of {month}. Six places the world's press pointed at. | Today on Earth. The humans call this day {Weekday}, the {ordinal} of {month}. Six places their press pointed at. We counted. |
| open, one story | …One place the world's press pointed at. | …One place their press pointed at. We counted. |
| open, no stories | Today on Earth. {date}. | Today on Earth. The humans call this day {date}. Their press pointed nowhere we could place. |
| story, readable | {Place}. {headline}. | {Place}. The humans wrote: {headline}. |
| story, read in its language (v4.2) | {Place}. {headline in es/fr/it/pt/hi/ja/zh} | {Place}. The humans wrote, in {Language}: {headline}. (the frame in the English voice, the headline in the language's voice, as now) |
| story, not readable | {Place}. The headline is in {Language}, on screen. | {Place}. The humans wrote this in {Language}. It is on your screen. |
| close | That was today on Earth. Every place, every outlet, every day. Find us on GitHub. | That was today on Earth. {articles, in words, rounded to the nearest thousand} articles in one rotation. We did not read them. We counted them. We will count again tomorrow. |

Notes. The story frame "The humans wrote:" is one fixed phrase for every story, so it is a
credit, not a comment (the grim-headline test; the owner judges this phrase against three
real headlines before the build). The close speaks heat.totals.articles, which the opening
does not; the end card stays without totals. "Find us on GitHub" moves to the caption,
where the address already is; the close ends on the promise to return, which is the return
loop in one line. The outlet is still never spoken; the card and the caption carry the
credit. Line count and length stay within the v4 budget: the open gains about 1.5 s, each
story about 0.6 s, the close about 3 s.

### The broadcast's six slots (web/src/broadcast.ts signalLine, emptyLine)

The label is chrome and stays. The sentence under it is prose and changes. Every sentence
states the rule in the Observer's words and nothing about the story; the live 2026-10-27
broadcast is the reason: its "Ordinary life" slot holds a nightclub-assault sentencing,
because the rule is about theme shares, not about what the story is. So no sentence may
gloss what a slot "means".

| Slot | Today | The Observer |
|---|---|---|
| Loudest signal | One story over {place}: {n} articles from {o} outlets in {l} languages. | The humans spoke most about one story, over {place}: {n} articles from {o} outlets in {l} languages. |
| Heard across the planet | One story over {place}, heard in {i} other countries: {n} articles from {o} outlets. | One story over {place} was heard in more countries than any other: {i} other countries. {n} articles from {o} outlets. |
| Rising | One story over {place}: {n} articles from {o} outlets, where the place usually has {b} articles a day. | The humans turned to {place}: {n} articles from {o} outlets, where they usually write {b} articles a day. |
| Rising, no normal | …where the place usually has none. | …where they usually write none. |
| Most positive tone | The most positive story, over {place}: {n} articles from {o} outlets, tone {t}. | The most positive tone the humans wrote today, over {place}: {n} articles from {o} outlets, tone {t}. Positive is the humans' word. We report their score. |
| Ordinary life | One story of ordinary life, over {place}: {n} articles from {o} outlets in {l} languages. | One story of what the humans call ordinary life, over {place}: {n} articles from {o} outlets in {l} languages. |
| Faint signal | One story from a quiet place, {place}: {n} articles from {o} outlets; the place usually has {b} a day. | One story from a place the humans rarely write about, {place}: {n} articles from {o} outlets; on most days it gets {b}. |
| Faint, no normal | …the place usually has none. | …on most days it gets none. |
| empty, rule | No story met the rule today. | No story met the rule today. The rule does not bend. |
| empty, history | Needs more days of history; from {date}. | We have not watched long enough. From {date}. |
| empty, history, no date | Needs more days of history. | We have not watched long enough. |

The Rising sentence drops "the place usually has" for "they usually write" because the
normal is a count of what was written, which is the Observer's only knowledge of a place.
"Positive is the humans' word. We report their score." is the one admission in this
surface; it is also true (the tone score is GDELT's measurement, which the site reports
under a human word, and the Observer claims neither the word nor the number as its own).
"Travelled farthest" was considered for the planet slot and rejected: distance is not
measured; the count of other countries is.
The meta line under each sentence is chrome and unchanged; the rule that no number appears
twice in one entry holds for the new sentences too (sentenceFacts must be re-checked for
each).

The broadcast page and the feeds carry the same sentences, so they inherit this table.
docs/METHODOLOGY.md "The daily broadcast" quotes the loudest sentence as its example and
changes in the same commit.

### The map page (web/src/main.ts, web/index.html)

| Surface | Today | The Observer |
|---|---|---|
| the sentence, live | {articles} articles are pointing at {places} places. | In one rotation the humans wrote {articles} articles about {places} places. |
| the sentence, replay | {articles} articles were pointing at {places} places. | In that rotation the humans wrote {articles} articles about {places} places. |
| the sentence, a place selected | {PLACE}: {total} articles over {places} places. | unchanged: it is a readout in the chrome's register |
| loading | Loading the latest snapshot. | Counting. |
| load failed | The news snapshot could not be loaded. | The count did not arrive. Reload. |
| no broadcast | No broadcast in this snapshot. | Nothing to broadcast from this count. |
| places filter, no match | No place matches "{q}". | No place the humans call "{q}". |
| topic search, no match | No topic matches "{q}" | No topic the humans call "{q}". |
| replay too short (replay.ts) | Replay starts at {N} snapshots. {k} so far. | Replay begins after {N} counts. We have {k}. |
| legend | Size = volume, not importance | unchanged: chrome, and the one line a first visitor must get in one read |
| legend note (phones) | size = volume, not importance | unchanged |
| foot | GDELT 2.0 · source · no editing | unchanged |

The sentence is the largest type on the page and the first thing read. "the humans wrote
{articles} articles about {places} places" keeps both units and adds the frame in four
words. It is also the first place a visitor meets the voice, so the whole character has
to be legible from it alone: a count, a species, no opinion.

### The clip frames and the caption (web/clip.html, render/src/lib.mjs)

| Surface | Today | The Observer |
|---|---|---|
| time-lapse key line | One dot per place in the last 24 hours of news. Size = number of articles. | One dot for every place the humans wrote about in one rotation. Bigger means more articles, not more importance. |
| end card verb line | SEE TODAY'S BROADCAST | unchanged (chrome) |
| end card disclosure | READ BY A SYNTHETIC VOICE | unchanged (disclosure) |
| caption, line 2 | The last 24 hours of the world's news, one dot per place. | One rotation of the humans' news, one dot per place. Counted, not read. |
| caption, transcript | each spoken line, then "Headline from {outlet}" | unchanged in form; the lines themselves change with the script |
| caption, last line | Read by a synthetic voice from the outlets' own headlines. | unchanged (disclosure) |
| caption, address | Today's broadcast: {address} | Today's broadcast: {address}, then on its own line: The method and the code: github.com/currentsbtw/today-on-earth |

### The about page (web/about.html, docs/METHODOLOGY.md)

Only the opening section, "What you are looking at", takes the voice. Everything from
"Where the articles come from" onward stays plain, and the opening says so in its last
line, because the rest of the page is the calibration document a skeptic reads.

Today:

> A map of where the world's news is pointing right now. Each dot is a place that articles
> published in the last 24 hours are about. A bigger dot means more articles. That is all it
> means. It is not a map of what matters, and it is not a map of what happened; it is a map
> of coverage.

The Observer:

> This is a count of your planet's news. Every fifteen minutes we read a list of what the
> humans' press wrote in the last rotation and put one dot where each article that names a city points. A
> bigger dot means more articles. That is all it means. We cannot tell what matters. We can
> tell what was written, and where, and by how many. We did not read the articles. We
> counted them. The rest of this page explains how, in plain words.

The heading can stay "What you are looking at". The "What this site does not do" list
stays plain: it is a list of promises, and promises are made in the reader's register.

### Empty and edge states elsewhere

| Surface | Today | The Observer |
|---|---|---|
| panel, no other country | heard in no other country | unchanged (a chrome row value) |
| panel, coverage gap | silent: none of the {k} largest news countries | unchanged (chrome) |
| place page description (SEO) | {name} in the last {hours}: {counts}. | unchanged: it is read by search engines and previews, not by a visitor who has met the character |
| embed | Today On Earth (wordmark only) | unchanged |
| quake tooltip | M 5.1 · 32 km · 3h ago · {place} | unchanged (chrome) |

## Sample newscast, from the live snapshot of 2026-10-27 13:41 UTC

stories.json's first six, as the script would be built. The date is the clip's rule
(the window's middle): Tuesday 27 October 2026. Headlines are the outlets' words exactly
as the file holds them, with script.mjs's spoken form (the trailing label removed; here
none had one). The first headline is Spanish and is read in Spanish by Kokoro's ef_dora
under v4.2; the frame stays in the English voice.

```
open    Today on Earth. The humans call this day Tuesday, the twenty-seventh of October.
        Six places their press pointed at. We counted.

story 1 Washington. The humans wrote, in Spanish: Donald Trump dice que las elecciones en
        Brasil fueron 'amañadas' tras histórico triunfo de Lula da Silva frente a Bolsonaro.
        [card: 321 articles · 266 outlets · 25 languages · heard in 60 other countries · eltiempo.com]

story 2 Kiev. The humans wrote: Local ceasefire brokered by Melania Trump starts in southern
        Ukraine as Russia attacks other areas.
        [card: 293 · 248 · 27 · 41 · wsls.com]

story 3 London. The humans wrote: Chris Brown Avoids Jail Time, Given Suspended 8-Month
        Sentence Over London Nightclub Attack.
        [card: 251 · 229 · 10 · 31 · pragativadi.com]

story 4 Gaza. The humans wrote: Israel Votes in First Election Since October 7, Seen as
        Referendum on Netanyahu.
        [card: 231 · 193 · 12 · 34 · rozanaspokesman.com]

story 5 Moscow. The humans wrote: Shock message from Putin to Stubb and Støre on Ukraine:
        Peace only if Russia's interests are taken into account.
        [card: 273 · 189 · 27 · 42 · bankingnews.gr]

story 6 Belgrade. The humans wrote: Serbia's political veteran Aleksandar Vucic outplayed
        all opponents. Then came the students.
        [card: 202 · 171 · 20 · 46 · journalgazette.net]

close   That was today on Earth. Two hundred and twenty-five thousand articles in one
        rotation. We did not read them. We counted them. We will count again tomorrow.
```

What this sample shows. Story 4 is placed at Gaza by the instrument and is about an
Israeli election; whether that placement is right is the audit's business, and the voice
has nothing to add to it, which is the point: a voice that explained the story would have
made a misplacement into a false claim. Story 5's headline carries "Shock" and story 6's
carries a narrative; both are the outlets' words and the Observer reads them unchanged and
says nothing after. The one joke per broadcast is the close, and it is a true statement
about the pipeline.

The caption for this clip would read, before the transcript:

```
Today On Earth · Tuesday 27 October 2026
One rotation of the humans' news, one dot per place. Counted, not read.

Today's broadcast: currentsbtw.github.io/today-on-earth/broadcast
The method and the code: github.com/currentsbtw/today-on-earth
```

## The six slots on the same snapshot

The live broadcast.json of 2026-10-27 13:41 UTC, so the sentences can be judged against
real stories rather than Paris placeholders.

- **Loudest signal.** The humans spoke most about one story, over Washington: 321 articles
  from 266 outlets in 25 languages.
- **Heard across the planet.** One story over Paris was heard in more countries than any
  other: 48 other countries. 187 articles from 158 outlets.
- **Rising.** The humans turned to Tiptonville: 32 articles from 31 outlets, where they
  usually write 4 articles a day.
- **Most positive tone.** The most positive tone the humans wrote today, over Barcelona: 10
  articles from 10 outlets, tone +10.4. Positive is the humans' word. We report their score.
  (The headline is Russian, about a football award; the sentence does not say so.)
- **Ordinary life.** One story of what the humans call ordinary life, over London: 251
  articles from 229 outlets in 10 languages. (The headline is a sentencing for an assault.
  The sentence says only what the rule says. This is the case that forbids glossing.)
- **Faint signal.** One story from a place the humans rarely write about, Hurun: 24 articles
  from 24 outlets; on most days it gets 2.

## The spoken voice

Out of this brief's scope, recorded so it is not lost: af_heart at speed 1.1 stays the
default for the build. A deadpan reading wants a flatter, slower delivery than a newscast;
the owner may pick a different Kokoro voice by ear at speed 1.0 after hearing the sample
script, as the 2026-10-24 voice decision was made. Platform labelling of synthetic voices
is unchanged. No paid or cloud voice.

## Decisions (all five taken by the owner on 2026-10-27)

1. The counted nouns stay literal (articles, outlets, countries, languages, a day). See
   Vocabulary. The alien lexicon is rejected.
2. ~~The frame phrase "The humans wrote:" against three grim headlines.~~ Decided by the
   owner 2026-10-27: it passes, judged against the live sample's Tiptonville, Kiev and Gaza
   lines. The frame stays. (The fallback, had it failed, was the bare form "{Place}.
   {headline}." with the voice carried by the open and close only.)
3. Third person for the species throughout, as this brief writes it. "You" survives in two
   fixed spots only, both addressed to the viewer and not to the species: "It is on your
   screen." (the unread-headline line) and "This is a count of your planet's news." (the
   about page's first sentence). Nowhere else.
4. The about page takes the voice in its opening section only. The sections after it are
   the calibration document, with the Accuracy table among them, and a character line above
   an error table would read as a joke about the error. The headings stay literal; they are
   the anchor index and are mirrored in docs/METHODOLOGY.md.
5. The Observer stays unnamed for now. The mascot's label is a count, OBSERVERS · N, and a
   name would make it a person. The site's name is already the title of its broadcast.

Nothing is open. Build decided 2026-10-27 evening (owner): now, not after the audit; the
first public post is in this voice.

## When this is built

Started 2026-10-27 evening on the owner's decision. Two builders on disjoint files (the
newscast and caption in render/; the site, the broadcast page and the docs), touching: render/src/script.mjs and render/test/script.test.mjs; render/src/lib.mjs
(captionText) and render/test/lib.test.mjs; web/src/broadcast.ts and ingest/test/broadcast
tests where sentences are asserted; web/scripts/build-places.mjs, which ports the slot
sentences for the static broadcast page and the feeds and must say the same words as
broadcast.ts; web/src/main.ts, web/src/replay.ts; web/index.html,
web/about.html, web/clip.html; docs/METHODOLOGY.md ("The daily broadcast" example sentence
and the about page's opening, which it mirrors); DESIGN.md (the Overview's "two voices"
paragraph gains one sentence: the prose voice is the Observer's). Verification: the test
suites, a local newscast render with `--no-encode` whose script.json matches the sample
above in form, and the three tests in this brief applied to the rendered script by a person.

## Proposed: show mode, v2 (2026-10-27, owner's direction, not yet built)

The owner, after the first Observer clip: "The humans wrote:" on every story is too flat.
The target is an intergalactic news show about Earth: nuanced, lively, varied, sarcastic.
This section designs that inside the one rule that cannot move, stated first.

### The one rule, and where the bite goes

A line's words may never depend on a story's content. Variety and sarcasm are therefore
drawn from pools by a rule that does not read the story (date and position), and every
variant in a pool has to be fit to land beside any headline, because any can. The targets
of the sarcasm are the species as a whole (the audience included), the show itself, the
viewer's planet and device, the count and the instrument. Never the subject of a headline,
never a named person, never the people of a place. Punch at the species, never at the
story.

The reason, once: the methodology promises that nothing about the news is written by us,
the audit calibrates that promise, and a joke that varied with the story would be
editorial even when it was kind. Per-story sarcasm is shape C (a human writes the show)
or a different product with the promise removed; the owner can choose that later, and this
design does not foreclose it.

### The grim gate (data, not taste)

stories.json gains one additive field per story, `g`: the share (0 to 1, two decimals) of
the story's articles that carry a conflict, crime or disaster theme kind (the ingest's
existing article kinds c, k, d; politics p does not count). A story with `g` >= 0.25 is
"grim" for the show: it gets the plain frame ("{Place}. The humans wrote: {headline}."),
no variant, and no aside follows it. The threshold is the "Ordinary life" slot's own
quarter, published in the methodology. The share is a property of the coverage, not a
judgment of the story; the site already uses it for a slot.

### Selection, deterministic

Every pool choice is `pick(pool, seed)` with the seed built from the clip date and the
line's position (`${date}:${kind}:${index}`) through a small published hash, so one
snapshot always yields one script (CI reproducibility, byte-identical audio on repeat). A
variant never repeats inside one show; a variant whose data condition fails (a story with
one language cannot take the "read in N languages" frame) is skipped for the next in order.
At least two of six stories use the plain frame even when none is grim, so the plain frame
stays the show's baseline and the variants read as departures from it.

### The pools (first draft; every line must pass the three tests on its own)

**Sign-on** (one, by date):
- "This is Today on Earth, the only news about this planet made by anyone who does not live on it."
- "Today on Earth. We are in orbit. The humans are below, writing."
- "Good rotation. This is Today on Earth. We have counted the humans' news so that you do not have to."
- "Today on Earth. One planet, one rotation, one count. The humans supplied the rest."
- "You are watching Today on Earth, from a distance we consider safe."

Then the fixed date line: "The humans call this day {Weekday}, the {ordinal} of {month}."

**The count** (one, by the day's total against the trailing median of daily totals, when
7 days exist; the thresholds published: above 1.15x loud, below 0.85x quiet, else ordinary):
- loud: "{N} articles. A loud rotation, even for them."
- quiet: "{N} articles. A quiet rotation. We checked the instrument. It is the humans."
- ordinary: "{N} articles. An ordinary rotation for the humans. We have no other kind."
- no history: "{N} articles. We counted every one. We read six headlines. Here they are."

**Story frames** (per story, by position; `{h}` is the headline verbatim; conditions in brackets):
- plain: "{Place}. The humans wrote: {h}"
- "{Place}. From the humans' press, unedited: {h}"
- "{Place}. Their words, not ours: {h}"
- "{Place}. {o} of the humans' outlets covered this. One of them wrote: {h}" [o >= 10]
- "{Place}. Read in {l} languages. We will read it in one: {h}" [l >= 3]
- "{Place}. Heard in {i} countries that are not this one. The headline: {h}" [i >= 5]
- "Next, {Place}. The humans wrote, and we quote: {h}"
- "{Place}. We do not know what this means. The humans wrote: {h}" [never on a grim story; the gate]
- unread, fixed: "{Place}. The humans wrote this in {Language}. It is on your screen."
- unread, variant: "{Place}. The humans wrote this in {Language}, which is one of theirs. It is on your screen."

**Asides** (zero to two per show, after a non-grim story, by position; about the species or
the show; each states only numbers the script already holds):
- "We pause to note that the humans wrote {N} articles today and we have read {k} headlines. The ratio is not in our favour."
- "The humans' press works in {L} languages. We work in one. We are doing our best." [L = languages across the six stories, >= 5]
- "Four of these six places have appeared in this programme before. The humans return to the same places. So do we." [needs yesterday's script.json from the clips release; plumbing, so a later increment]
- "This has been the part of the programme where we read things. It is most of the programme."

**Sign-off** (one, by date):
- "That was today on Earth. The humans will write again tomorrow. We will count again tomorrow. Neither of us can stop."
- "That was today on Earth. We did not read the articles. We counted them. It was easier."
- "This has been Today on Earth. We remain in orbit, where it is quiet."
- "That was today on Earth. {N} articles, six headlines, one planet. We will be back when it turns."
- "That was today on Earth. If the humans write something tomorrow, and they will, we will count it."

### Words still banned

The list in "The rule, as a character trait" stands, in every pool: tragic, shocking,
finally, again (about a story; "again" about the ritual is fine), still, apparently,
seems, important, matters, deserves, sadly, interesting, strange, bizarre. No adjective
about an event. No verb about what happened. No name of a person outside a headline.

### Sample show from the 2026-10-27 17:50 UTC script

Grim shares are estimated here (the field does not exist yet); the real gate decides.
Kiev and Tehran are treated as grim (conflict themes), Gaza as politics, below the gate.

```
sign-on  This is Today on Earth, the only news about this planet made by anyone who does
         not live on it. The humans call this day Tuesday, the twenty-seventh of October.
count    Two hundred and twenty-eight thousand articles. We counted every one. We read six
         headlines. Here they are.
story 1  Moscow. The humans wrote this in German, which is one of theirs. It is on your
         screen.
story 2  Gaza. Heard in 34 countries that are not this one. The headline: Israel election:
         Voters deciding whether to oust Netanyahu.
story 3  Kiev. The humans wrote: Local ceasefire brokered by Melania Trump starts in
         southern Ukraine as Russia attacks other areas.                       [grim: plain]
story 4  Washington. 267 of the humans' outlets covered this. One of them wrote: Trump
         approval rises from record low to 32% ahead of midterm election, Reuters Ipsos
         poll finds.
aside    We pause to note that the humans wrote two hundred and twenty-eight thousand
         articles today and we have read four headlines. The ratio is not in our favour.
story 5  Tehran. The humans wrote: SAUDI-IRAN TALKS: Saudi Arabia, Turkey And Pakistan
         Sending Senior Security Officials To Tehran Amid Rising Regional Tensions. [grim]
story 6  Belgrade. Their words, not ours: Vucic Concedes Defeat as Student Movement Ushers
         in New Era in Serbia.
sign-off That was today on Earth. The humans will write again tomorrow. We will count
         again tomorrow. Neither of us can stop.
```

Length: the sign-on, count and one aside add roughly 12 s over v1's 75 s. The site keeps
the v1 sentences (a page is read, not performed); the broadcast page may take the sign-on
later.

### What building it touches

ingest/src/stories.ts and top-stories.ts (the `g` share, from the existing article kinds),
docs/DATA-CONTRACT.md (additive field), render/src/script.mjs (pools, pick, the gate, the
count line with a trailing median read from history/index.json when 7 days exist, asides
as a new line kind the clip page must accept), web/src/timeline.ts (an `aside` kind laid
out like the open's spoken caption), render/src/lib.mjs (caption transcript unchanged in
form), docs/METHODOLOGY.md ("The daily clip": the pools are published in full with the
selection rule and the gate), tests for pick, the gate, the conditions and the no-repeat
rule. Build only on the owner's go, after the pools above are edited to taste.
