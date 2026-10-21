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
  writeFileSync(new URL(`cells/${id}.json`, OUT), JSON.stringify(detail, null, 1) + '\n');
}

cells.sort((a, b) => b.n - a.n);
const heat = {
  generatedAt: iso(now),
  windowHours: 24,
  newestArticleAt: iso(new Date(now.getTime() - 10 * 60000)),
  // Like the per-cell counts, totals describe the whole window, not just the listed articles.
  totals: {
    articles: totalArticles,
    outlets: Math.max(allOutlets.size, Math.round(Math.sqrt(totalArticles) * 9)),
    countries: Math.max(allCountries.size, 64),
    cells: cells.length,
  },
  cells,
};
writeFileSync(new URL('heat.json', OUT), JSON.stringify(heat, null, 1) + '\n');
console.log(`wrote ${cells.length} cells, ${totalArticles} articles`);
