// Generates sample data in web/fixtures/data following docs/DATA-CONTRACT.md.
// Run with `npm run fixtures`. Everything here is invented placeholder content.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { latLngToCell, cellToLatLng } from 'h3-js';

const OUT = new URL('../fixtures/data/', import.meta.url);

// [name, lat, lon, articles, home country]
const PLACES = [
  ['Washington, District of Columbia, United States', 38.9, -77.04, 3120, 'US'],
  ['Kyiv, Kyyiv, Misto, Ukraine', 50.45, 30.52, 2480, 'UA'],
  ['Gaza, Israel (general), Israel', 31.5, 34.47, 2210, 'IL'],
  ['London, London, City of, United Kingdom', 51.51, -0.13, 1890, 'GB'],
  ['Beijing, Beijing, China', 39.9, 116.4, 1440, 'CN'],
  ['Paris, Ile-de-France, France', 48.86, 2.35, 1210, 'FR'],
  ['Moscow, Moskva, Russia', 55.76, 37.62, 1105, 'RU'],
  ['New Delhi, Delhi, India', 28.61, 77.21, 980, 'IN'],
  ['Tokyo, Tokyo, Japan', 35.68, 139.69, 760, 'JP'],
  ['Berlin, Berlin, Germany', 52.52, 13.4, 640, 'DE'],
  ['Brasilia, Distrito Federal, Brazil', -15.79, -47.88, 520, 'BR'],
  ['Tehran, Tehran, Iran', 35.69, 51.39, 505, 'IR'],
  ['Los Angeles, California, United States', 34.05, -118.24, 470, 'US'],
  ['Mexico City, Distrito Federal, Mexico', 19.43, -99.13, 390, 'MX'],
  ['Cairo, Al Qahirah, Egypt', 30.04, 31.24, 344, 'EG'],
  ['Seoul, Seoul-tukpyolsi, South Korea', 37.57, 126.98, 310, 'KR'],
  ['Sydney, New South Wales, Australia', -33.87, 151.21, 288, 'AU'],
  ['Lagos, Lagos, Nigeria', 6.52, 3.38, 240, 'NG'],
  ['Buenos Aires, Distrito Federal, Argentina', -34.6, -58.38, 205, 'AR'],
  ['Istanbul, Istanbul, Turkey', 41.01, 28.98, 196, 'TR'],
  ['Nairobi, Nairobi Area, Kenya', -1.29, 36.82, 150, 'KE'],
  ['Jakarta, Jakarta Raya, Indonesia', -6.21, 106.85, 132, 'ID'],
  ['Johannesburg, Gauteng, South Africa', -26.2, 28.05, 118, 'ZA'],
  ['Caracas, Distrito Federal, Venezuela', 10.49, -66.88, 96, 'VE'],
  ['Khartoum, Khartoum, Sudan', 15.5, 32.56, 61, 'SD'],
  ['Kinshasa, Kinshasa, Democratic Republic of the Congo', -4.32, 15.31, 44, 'CD'],
  ['Suva, Central, Fiji', -18.14, 178.44, 23, 'FJ'],
  ['Anchorage, Alaska, United States', 61.22, -149.9, 17, 'US'],
  ['Ndjamena, Chari-Baguirmi, Chad', 12.11, 15.04, 6, 'TD'],
  ['Nuuk, Kommuneqarfik Sermersooq, Greenland', 64.18, -51.72, 2, 'GL'],
];

// Placeholder outlets on the reserved .example TLD: [domain, country, language].
const OUTLETS = [
  ['daily-ledger.example', 'US', 'en'], ['morning-wire.example', 'GB', 'en'],
  ['le-quotidien.example', 'FR', 'fr'], ['tageszeitung.example', 'DE', 'de'],
  ['el-diario.example', 'MX', 'es'], ['la-voz.example', 'AR', 'es'],
  ['o-correio.example', 'BR', 'pt'], ['vesti-news.example', 'RU', 'ru'],
  ['kyiv-herald.example', 'UA', 'uk'], ['al-akhbar.example', 'EG', 'ar'],
  ['gulf-report.example', 'AE', 'ar'], ['tehran-times.example', 'IR', 'fa'],
  ['hindustan-post.example', 'IN', 'en'], ['asahi-sample.example', 'JP', 'ja'],
  ['seoul-daily.example', 'KR', 'ko'], ['xinhua-sample.example', 'CN', 'zh'],
  ['harbour-press.example', 'AU', 'en'], ['lagos-sun.example', 'NG', 'en'],
  ['nation-ke.example', 'KE', 'en'], ['jakarta-pos.example', 'ID', 'id'],
  ['cape-mail.example', 'ZA', 'en'], ['hurriyet-sample.example', 'TR', 'tr'],
  ['haaretz-sample.example', 'IL', 'he'], ['wire-service.example', '', 'en'],
  ['global-desk.example', 'CA', 'en'], ['nord-avis.example', 'NO', 'no'],
  ['corriere-sample.example', 'IT', 'it'], ['gazeta-sample.example', 'PL', 'pl'],
];

const TOPICS = [
  'Officials meet over regional dispute', 'Storm disrupts transport links',
  'Election commission publishes turnout figures', 'Central bank holds interest rate',
  'Protest gathers in city centre', 'Court hears appeal in landmark case',
  'Ministers discuss energy prices', 'Aid convoy reaches border crossing',
  'Football club confirms new coach', 'Researchers report vaccine trial results',
  'Wildfire forces evacuations', 'Trade talks resume after pause',
];

let seed = 42;
const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const round1 = (v) => Math.round(v * 10) / 10;
const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

const now = new Date();
now.setUTCMinutes(Math.floor(now.getUTCMinutes() / 15) * 15, 0, 0);

// [headline stem, entities as GDELT would spell them (lowercase)]
const STORY_TOPICS = [
  ['Ministers meet over energy prices', ['energy', 'european union', 'oil prices']],
  ['Election count enters second day', ['election commission', 'parliament', 'voters']],
  ['Storm damage closes main roads', ['natural disaster', 'transport', 'emergency services']],
  ['Central bank leaves rates unchanged', ['central bank', 'inflation', 'interest rates']],
  ['Court hears appeal in corruption case', ['supreme court', 'corruption', 'prosecutor']],
  ['Aid convoy reaches border crossing', ['united nations', 'refugees', 'humanitarian aid']],
  ['Strike halts rail services', ['trade union', 'rail', 'labour']],
  ['Wildfire forces evacuations in hills', ['wildfire', 'evacuation', 'fire service']],
];
const ANGLES = ['what we know', 'latest', 'reactions', 'timeline', 'in pictures', 'explained', 'live updates', 'analysis'];

/** 2-4 stories whose n sum to at most the cell's n; the rest is `unclustered`. */
function makeStories(place, n, stats, pool) {
  const count = 2 + Math.floor(rand() * 3);
  const raw = Array.from({ length: count }, () => 0.08 + rand() * 0.3);
  // Stories cover at most ~80% of the cell, so some articles stay unclustered.
  const scale = Math.min(1, 0.8 / raw.reduce((a, b) => a + b, 0));
  const shares = raw.map((x) => x * scale).sort((a, b) => b - a);
  const short = place.split(',')[0];
  const topics = [...STORY_TOPICS].sort(() => rand() - 0.5).slice(0, count);
  const stories = [];
  for (let s = 0; s < count; s++) {
    const sn = Math.max(3, Math.round(n * shares[s]));
    const [stem, entities] = topics[s];
    const perOutlet = new Map();
    const arts = [];
    const newest = 15 + Math.floor(rand() * 240);
    for (let i = 0; arts.length < Math.min(6, sn) && i < 200; i++) {
      const outlet = pick(pool);
      if ((perOutlet.get(outlet[0]) ?? 0) >= 2) continue;
      perOutlet.set(outlet[0], (perOutlet.get(outlet[0]) ?? 0) + 1);
      arts.push({
        title: `[sample] ${stem} in ${short}: ${pick(ANGLES)}`,
        url: `https://${outlet[0]}/story/${Math.floor(rand() * 1e9).toString(36)}`,
        source: outlet[0],
        country: outlet[1],
        lang: outlet[2],
        time: iso(new Date(now.getTime() - (newest + arts.length * (20 + Math.floor(rand() * 40))) * 60000)),
        tone: round1(rand() * 10 - 6),
        image: '',
      });
    }
    const medoid = arts[Math.floor(rand() * arts.length)];
    const o = Math.min(sn, Math.max(perOutlet.size, Math.round(stats.o * shares[s] * 1.4)));
    stories.push({
      n: sn,
      o,
      c: Math.min(o, Math.max(1, Math.round(stats.c * shares[s] * 1.6))),
      l: Math.min(o, Math.max(new Set(arts.map((a) => a.lang)).size, Math.round(stats.l * shares[s] * 1.5))),
      t: round1(arts.reduce((sum, a) => sum + a.tone, 0) / arts.length),
      // The story's first article is at or before the oldest of its newest six.
      first: iso(new Date(Math.min(Date.parse(arts.at(-1).time), now.getTime() - (newest + 120 + Math.floor(rand() * 600)) * 60000))),
      last: arts[0].time,
      headline: medoid.title,
      headlineSource: medoid.source,
      headlineLang: medoid.lang,
      entities: [...entities, short.toLowerCase()],
      articles: arts,
    });
  }
  stories.sort((a, b) => b.n - a.n);
  const grouped = stories.reduce((sum, s) => sum + s.n, 0);
  if (grouped > n) throw new Error(`stories exceed n in ${place}`);
  return { stories, unclustered: n - grouped };
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(new URL('cells/', OUT), { recursive: true });

const cells = [];
const allOutlets = new Set();
const allCountries = new Set();
let totalArticles = 0;

for (const [name, lat, lon, n, home] of PLACES) {
  const id = latLngToCell(lat, lon, 3);
  const [clat, clon] = cellToLatLng(id);
  const local = OUTLETS.filter((o) => o[1] === home);
  const pool = [...local, ...local, ...OUTLETS];
  const isEmpty = n < 3; // one cell exercises the empty-list state
  const count = isEmpty ? 0 : Math.min(50, n);
  const used = new Map();
  const articles = [];
  for (let i = 0; i < count; i++) {
    let outlet = pick(pool);
    while ((used.get(outlet[0]) ?? 0) >= 5) outlet = pick(OUTLETS);
    used.set(outlet[0], (used.get(outlet[0]) ?? 0) + 1);
    const minutesAgo = 10 + Math.floor(i * (1380 / count) + rand() * 20);
    articles.push({
      title: rand() < 0.06 ? '' : `[sample] ${pick(TOPICS)} near ${name.split(',')[0]}`,
      url: `https://${outlet[0]}/news/${Math.floor(rand() * 1e9).toString(36)}`,
      source: outlet[0],
      country: outlet[1],
      lang: outlet[2],
      time: iso(new Date(now.getTime() - minutesAgo * 60000)),
      tone: round1(rand() * 12 - 7),
      image: '',
    });
  }
  const tally = (key) => {
    const m = new Map();
    for (const a of articles) m.set(a[key], (m.get(a[key]) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 10);
  };
  for (const a of articles) {
    allOutlets.add(a.source);
    if (a.country) allCountries.add(a.country);
  }
  // Counts cover the whole cell, so they exceed what the 50 listed articles show.
  const outletGuess = Math.round(Math.sqrt(n) * 2.2);
  const stats = {
    n,
    o: Math.min(n, Math.max(used.size, outletGuess)),
    c: Math.min(n, Math.max(new Set(articles.map((a) => a.country).filter(Boolean)).size, Math.round(outletGuess / 4), 1)),
    l: Math.max(new Set(articles.map((a) => a.lang)).size, 1),
    t: articles.length ? round1(articles.reduce((s, a) => s + a.tone, 0) / articles.length) : 0,
  };
  totalArticles += n;
  cells.push({ id, lat: Math.round(clat * 100) / 100, lon: Math.round(clon * 100) / 100, ...stats, name });
  const detail = {
    id, name, ...stats,
    topOutlets: tally('source'), topCountries: tally('country'), languages: tally('lang'),
    articles,
  };
  // Stories for cells with n >= 20; smaller cells keep the old shape (no `stories` key)
  // so the panel's no-stories layout stays covered.
  if (n >= 20) Object.assign(detail, makeStories(name, n, stats, pool));
  writeFileSync(new URL(`cells/${id}.json`, OUT), JSON.stringify(detail, null, 1) + '\n');
}

cells.sort((a, b) => b.n - a.n);
// Totals for a frame with `placed` articles in cells. About 18% more articles only name a
// country: they are counted in totals (and `unplaced`) but never binned into a cell.
const totalsFor = (placed, cellCount) => {
  const articles = placed + Math.round(placed * 0.18);
  return {
    articles,
    outlets: Math.max(Math.min(allOutlets.size, cellCount), Math.round(Math.sqrt(articles) * 9)),
    countries: Math.max(Math.min(allCountries.size, cellCount), Math.round(64 * Math.min(1, placed / totalArticles + 0.2))),
    cells: cellCount,
    unplaced: articles - placed,
  };
};
const heat = {
  generatedAt: iso(now),
  windowHours: 24,
  newestArticleAt: iso(new Date(now.getTime() - 10 * 60000)),
  // Like the per-cell counts, totals describe the whole window, not just the listed articles.
  totals: totalsFor(totalArticles, cells.length),
  cells,
};
writeFileSync(new URL('heat.json', OUT), JSON.stringify(heat, null, 1) + '\n');

// History: 12 frames two hours apart, the last one equal to heat.json. Earlier frames
// cover a shorter window (a cold start) and follow local daytime, so replay visibly moves.
const FRAMES = 12;
const stamp = (at) => at.replace(/[-:.]/g, '');
mkdirSync(new URL('history/', OUT), { recursive: true });
const frames = [];
const daylight = (d, lon) => {
  const localHour = (d.getUTCHours() + d.getUTCMinutes() / 60 + lon / 15 + 24) % 24;
  return 0.6 + 0.4 * Math.max(0, Math.cos((2 * Math.PI * (localHour - 14)) / 24));
};
for (let k = 0; k < FRAMES; k++) {
  const at = new Date(now.getTime() - (FRAMES - 1 - k) * 2 * 3600000);
  const atIso = iso(at);
  const last = k === FRAMES - 1;
  const windowHours = last ? heat.windowHours : Math.min(24, 6 + 2 * k);
  const rows = cells
    .map((c) => {
      if (last) return [c.id, c.lat, c.lon, c.n];
      // Coverage follows local daytime, relative to the current moment so the frames meet heat.json.
      const n = Math.round(c.n * (windowHours / 24) * (daylight(at, c.lon) / daylight(now, c.lon)) * (0.85 + rand() * 0.3));
      return [c.id, c.lat, c.lon, n];
    })
    .filter((r) => r[3] >= 2)
    .sort((a, b) => b[3] - a[3]);
  const placed = rows.reduce((sum, r) => sum + r[3], 0);
  const file = `${stamp(atIso)}.json`;
  writeFileSync(new URL(`history/${file}`, OUT), JSON.stringify({ at: atIso, cells: rows }) + '\n');
  frames.push({ at: atIso, file, windowHours, totals: last ? heat.totals : totalsFor(placed, rows.length) });
}
writeFileSync(new URL('history/index.json', OUT), JSON.stringify({ frames }, null, 1) + '\n');
console.log(`wrote ${cells.length} cells, ${totalArticles} placed articles, ${FRAMES} history frames`);
