// prebuild: static place pages, the places index and the sitemap, from the snapshot in
// public/data (heat.json + cells/<id>.json, docs/DATA-CONTRACT.md). No JavaScript in the
// output; one inline sheet in the about page's reading-column register (DESIGN.md "Place
// page"). Deterministic for the same data. Usage: node scripts/build-places.mjs
// [--data <dir>] [--out <dir>] (defaults: public/data and public).
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// The site's own display rules (Node 24 strips the types; format.ts imports nothing).
import { codeName, count, host, plural, safeHref, utcDayTime } from '../src/format.ts';

const SITE = 'https://currentsbtw.github.io/today-on-earth/';
const PAGE_MIN = 10; // a cell gets a page at 10+ articles
const INDEX_MIN = 2; // the index lists every cell with 2+
const NEWEST = 20; // newest articles on a page
const CONCURRENCY = 32;

const web = resolve(fileURLToPath(new URL('..', import.meta.url)));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? resolve(process.argv[i + 1]) : fallback;
};
const dataDir = arg('--data', join(web, 'public', 'data'));
const outDir = arg('--out', join(web, 'public'));
const placeDir = join(outDir, 'place');

// Text --------------------------------------------------------------------------------

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const isLang = (l) => typeof l === 'string' && /^[a-z]{2,3}$/.test(l);
/** ` lang="fr"` for text in another language than the page's English. */
const langAttr = (l) => (isLang(l) && l !== 'en' ? ` lang="${l}"` : '');
const str = (v) => (typeof v === 'string' ? v : '');
const num = (v) => (Number.isFinite(v) ? v : 0);
const arr = (v) => (Array.isArray(v) ? v : []);

/**
 * "heard in 22 other countries" (the panel's rule), "" when no outlet country is known, and ""
 * when the place's own country is unknown: then `i` equals `c` and would count it.
 */
function heardIn(i, c, home) {
  if (!home || (i === 0 && c === 0)) return '';
  return i === 0 ? 'heard in no other country' : `heard in ${plural(i, 'other country', 'other countries')}`;
}

/** "412 articles from 150 outlets in 23 countries and 9 languages, heard in 22 other countries." */
function countsSentence(d) {
  let s = `${plural(d.n, 'article', 'articles')} from ${plural(d.o, 'outlet', 'outlets')}`;
  s += d.c > 0 ? ` in ${plural(d.c, 'country', 'countries')} and ${plural(d.l, 'language', 'languages')}` : ` in ${plural(d.l, 'language', 'languages')}`;
  const heard = heardIn(d.i, d.c, d.home);
  return `${s}${heard ? `, ${heard}` : ''}.`;
}

const hours = (h) => plural(h, 'hour', 'hours');

// Chrome ------------------------------------------------------------------------------

const MARK =
  '<svg class="globe" viewBox="0 0 24 24" width="48" height="48" shape-rendering="crispEdges" aria-hidden="true"><path d="M10 0h4v1h-4zM7 1h3v1h-3zM14 1h3v1h-3zM5 2h2v1h-2zM17 2h2v1h-2zM4 3h16v1h-16zM3 4h1v1h-1zM9 4h1v1h-1zM14 4h1v1h-1zM20 4h1v1h-1zM2 5h1v1h-1zM8 5h1v1h-1zM15 5h1v1h-1zM21 5h1v1h-1zM2 6h1v1h-1zM8 6h1v1h-1zM15 6h1v1h-1zM21 6h1v1h-1zM1 7h22v1h-22zM1 8h1v1h-1zM22 8h1v1h-1zM1 9h1v1h-1zM22 9h1v1h-1zM0 10h1v1h-1zM23 10h1v1h-1zM0 11h1v1h-1zM23 11h1v1h-1zM0 12h1v1h-1zM23 12h1v1h-1zM0 13h1v1h-1zM23 13h1v1h-1zM1 14h1v1h-1zM22 14h1v1h-1zM1 15h1v1h-1zM22 15h1v1h-1zM1 16h22v1h-22zM2 17h1v1h-1zM8 17h1v1h-1zM15 17h1v1h-1zM21 17h1v1h-1zM2 18h1v1h-1zM8 18h1v1h-1zM15 18h1v1h-1zM21 18h1v1h-1zM3 19h1v1h-1zM9 19h1v1h-1zM14 19h1v1h-1zM20 19h1v1h-1zM4 20h16v1h-16zM5 21h2v1h-2zM17 21h2v1h-2zM7 22h3v1h-3zM14 22h3v1h-3zM10 23h4v1h-4z"/><clipPath id="mark-band"><path d="M1 8h22v8H1z"/></clipPath><g clip-path="url(#mark-band)"><g class="ring"><path transform="translate(0 9)" d="M1 0h4v1h-4zM0 1h1v4h-1zM5 1h1v4h-1zM1 5h4v1h-4zM2 2h2v2h-2z"/></g></g></svg>';

const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF';

/**
 * The one sheet every generated page carries (fonts relative to `root`): about.css's
 * measures (top line, 68ch column between white rules, mono labels, Source Sans prose) plus
 * the ledger rows. Black and white only; the mark's stepped orbit is the one motion.
 */
const sheet = (root) =>
  `@font-face{font-family:'Azeret Mono';font-weight:400 500;font-display:swap;src:url(${root}fonts/azeret-mono-latin.woff2) format('woff2')}
@font-face{font-family:'Source Sans 3';font-weight:400 600;font-display:swap;src:url(${root}fonts/source-sans-3-latin-ext.woff2) format('woff2');unicode-range:${LATIN_EXT}}
@font-face{font-family:'Source Sans 3';font-weight:400 600;font-display:swap;src:url(${root}fonts/source-sans-3-latin.woff2) format('woff2');unicode-range:${LATIN}}
@font-face{font-family:'Silkscreen';font-weight:400;font-display:swap;src:url(${root}fonts/silkscreen-latin.woff2) format('woff2')}
:root{--mono:'Azeret Mono',ui-monospace,monospace;--hum:'Source Sans 3',system-ui,sans-serif;--pix:'Silkscreen',monospace;--muted:#9a9a9a;--rule:#333;color-scheme:dark}
*{box-sizing:border-box}
html{background:#000}
body{margin:0;background:radial-gradient(circle at .5px .5px,rgba(255,255,255,.18) .5px,transparent .75px) 0 0/8px 8px,#000;color:#fff;font:400 17px/1.55 var(--hum);-webkit-font-smoothing:antialiased}
::selection{background:#fff;color:#000}
a{color:#fff;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px}
a:hover{text-decoration-style:dashed}
a:focus-visible{outline:1px solid #fff;outline-offset:2px}
.top{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px;min-height:64px;padding:env(safe-area-inset-top) 36px 0}
.brand{justify-self:start;display:flex;align-items:center;gap:12px;padding:4px 8px 4px 0;background:#000;text-decoration:none}
.globe{display:block;fill:#fff}
.globe .ring{transform:translateX(12px);animation:ring 2s steps(30,end) infinite}
@keyframes ring{from{transform:translateX(-6px)}to{transform:translateX(24px)}}
@media (prefers-reduced-motion:reduce){.globe .ring{animation:none}}
.wordmark{font:400 16px/1 var(--pix);letter-spacing:.02em;text-transform:uppercase;white-space:nowrap}
.nav{display:flex;background:#000}
.nav a{display:inline-flex;align-items:center;min-height:28px;padding:0 10px;font:500 11px/1 var(--mono);letter-spacing:.1em;text-decoration:none;text-transform:uppercase}
.nav a:hover{text-decoration:underline;text-underline-offset:4px}
.doc{max-width:calc(68ch + 64px);margin:24px auto 64px;padding:40px 32px 56px;background:#000;border-top:1px solid #fff;border-bottom:1px solid #fff}
h1{margin:0 0 16px;font:600 clamp(36px,5vw,56px)/1.06 var(--hum);letter-spacing:-.012em;text-wrap:balance;overflow-wrap:anywhere}
.lede{margin:0 0 12px;font-size:20px;line-height:1.4}
.label,.credit,.counts,.tags,.meta,h2,.foot,.act,.n{font-family:var(--mono);text-transform:uppercase}
.label{margin:0;color:var(--muted);font-size:11px;line-height:1.4;letter-spacing:.06em}
.act{display:inline-flex;align-items:center;min-height:28px;margin-top:20px;padding:0 10px;border:1px solid #fff;font-size:11px;font-weight:500;line-height:1;letter-spacing:.1em;text-decoration:none}
.act:hover{background:#fff;color:#000}
h2{margin:40px 0 0;padding:6px 0;border-bottom:1px solid #fff;font-size:11px;font-weight:500;line-height:1;letter-spacing:.1em}
ol,ul{margin:0;padding:0;list-style:none}
.story{margin-top:14px;padding-left:12px;border-left:1px solid rgba(255,255,255,.4)}
h3{margin:0;font:400 18px/1.35 var(--hum);overflow-wrap:anywhere}
h3 a,.art a{text-decoration:none}
h3 a:hover,.art a:hover{text-decoration:underline;text-decoration-style:solid}
.credit{margin:2px 0 0;color:var(--muted);font-size:11px;font-weight:500;line-height:1.4;letter-spacing:.08em}
.counts{margin:2px 0 0;font-size:11px;line-height:1.4;letter-spacing:.06em}
.tags{margin-top:4px;color:var(--muted);font-size:11px;line-height:1.4;letter-spacing:.04em}
.tags li{display:inline}
.tags li+li::before{content:' · '}
.row{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid var(--rule);font:400 12px/1.4 var(--mono);letter-spacing:.03em}
.row>span:first-child{overflow-wrap:anywhere}
.up{text-transform:uppercase;letter-spacing:.04em}
.code{color:var(--muted)}
.art{padding:9px 0;border-bottom:1px solid var(--rule);font-size:15px;line-height:1.35;overflow-wrap:anywhere}
.meta{margin:3px 0 0;color:var(--muted);font-size:11px;line-height:1.4;letter-spacing:.04em}
.meta b{color:#fff;font-weight:400}
.places{counter-reset:r}
.places .row{counter-increment:r;align-items:baseline;font:400 16px/1.35 var(--hum);letter-spacing:0}
.places .row>span:first-child::before{content:counter(r);display:inline-block;min-width:4.5ch;color:var(--muted);font:400 11px var(--mono)}
.n{flex:none;font-size:12px;letter-spacing:.06em}
.places .row>span.out{color:var(--muted)}
.foot{display:flex;flex-wrap:wrap;justify-content:space-between;gap:0 16px;margin:48px 0 0;border-top:1px solid #fff;color:var(--muted);font-size:11px;font-weight:500;line-height:12px;letter-spacing:.1em}
.foot>*{padding-top:12px}
.foot a{display:inline-block;color:#fff}
@media (max-width:720px){.top{grid-template-columns:1fr auto;padding:env(safe-area-inset-top) 16px 0}.nav{justify-self:end;margin-right:-10px}.nav a,.act{min-height:36px}.globe{width:24px;height:24px}.brand{gap:10px}.wordmark{font-size:13px}.doc{margin:8px 0 32px;padding:28px 16px 28px}.lede{font-size:18px}h3{font-size:17px}.foot a{padding-bottom:12px}}`;

/** The document around `body`: head, brand line (MAP to the map), the column, the foot. */
function page({ root, title, description, canonical, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#000000">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Today On Earth">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${SITE}og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITE}og.jpg">
<link rel="icon" type="image/svg+xml" href="${root}favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="${root}favicon-32.png">
<link rel="apple-touch-icon" href="${root}apple-touch-icon.png">
<link rel="preload" href="${root}fonts/source-sans-3-latin.woff2" as="font" type="font/woff2" crossorigin>
<style>${sheet(root)}</style>
</head>
<body>
<header class="top"><a class="brand" href="${root}" aria-label="Today On Earth, back to the map">${MARK}<span class="wordmark">Today On Earth</span></a><nav class="nav" aria-label="Views"><a href="${root}">Map</a></nav></header>
<main class="doc">
${body}
<footer class="foot"><span>Natural Earth · GDELT · USGS</span><a href="${root}about.html">Method</a></footer>
</main>
</body>
</html>
`;
}

const stamp = (at) => {
  const t = utcDayTime(at, null);
  return t ? `<p class="label">Snapshot <time datetime="${esc(at)}">${esc(t)} UTC</time></p>` : '';
};

/** A linked title (http(s) only), with its language and the link's hreflang. */
function titleLink(text, url, lang) {
  const href = safeHref(str(url));
  const l = langAttr(lang);
  if (!href) return `<span${l}>${esc(text)}</span>`;
  const hl = isLang(lang) ? ` hreflang="${lang}"` : '';
  return `<a href="${esc(href)}" target="_blank" rel="noopener"${hl}${l}>${esc(text)}</a>`;
}

function storyItem(s, home) {
  const text = str(s.headline).trim();
  const source = str(s.headlineSource);
  const parts = [];
  if (num(s.n)) parts.push(plural(num(s.n), 'article', 'articles'));
  if (num(s.o)) parts.push(plural(num(s.o), 'outlet', 'outlets'));
  if (num(s.l)) parts.push(plural(num(s.l), 'language', 'languages'));
  const heard = heardIn(num(s.i), num(s.c), home);
  if (heard) parts.push(heard);
  const entities = arr(s.entities).filter((e) => typeof e === 'string' && e.trim());
  return (
    '<li class="story">' +
    (text ? `<h3>${titleLink(text, s.headlineUrl, s.headlineLang)}</h3>` : '') +
    (source ? `<p class="credit">${esc(source)}</p>` : '') +
    (parts.length ? `<p class="counts">${esc(parts.join(' · '))}</p>` : '') +
    (entities.length ? `<ul class="tags">${entities.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : '') +
    '</li>'
  );
}

/** Coverage rows: key left, count right. `type` names ISO codes ("FRANCE · FR"). */
function rows(pairs, type) {
  const items = arr(pairs)
    .filter((p) => Array.isArray(p) && p.length >= 2)
    .map(([k, v]) => {
      const key = str(k);
      let label;
      if (!type) label = `<span>${esc(key || 'unknown')}</span>`;
      else {
        const name = key ? codeName(key, type) : '';
        label = name
          ? `<span class="up">${esc(name)}<span class="code"> · ${esc(key.toUpperCase())}</span></span>`
          : `<span class="up">${esc(key ? key.toUpperCase() : 'unknown')}</span>`;
      }
      return `<li class="row">${label}<span>${esc(count(num(v)))}</span></li>`;
    });
  return items.length ? `<ol>${items.join('')}</ol>` : '';
}

function articleItem(a, at) {
  const title = str(a.title).trim();
  const time = utcDayTime(str(a.time), at);
  const meta = [`<b>${esc(str(a.source) || host(str(a.url)))}</b>`];
  if (time) meta.push(`${esc(time)} UTC`);
  return `<li class="art">${title ? titleLink(title, a.url, a.lang) : titleLink(host(str(a.url)), a.url, '')}<p class="meta">${meta.join(' · ')}</p></li>`;
}

function placePage(cell, heat) {
  const d = {
    name: str(cell.name) || cell.id,
    home: str(cell.home),
    n: num(cell.n),
    o: num(cell.o),
    c: num(cell.c),
    i: num(cell.i),
    l: num(cell.l),
  };
  const win = num(heat.windowHours) || 24;
  const stories = arr(cell.stories).filter((s) => s && typeof s === 'object');
  const lead = stories.find((s) => str(s.headline).trim());
  const counts = `${plural(d.n, 'article', 'articles')} from ${plural(d.o, 'outlet', 'outlets')}`;
  let description = `${d.name} in the last ${hours(win)}: ${countsSentence(d)}`;
  if (lead) {
    const h = str(lead.headline).trim();
    description += ` Largest story: “${h.length > 160 ? `${h.slice(0, 159)}…` : h}”${str(lead.headlineSource) ? ` (${lead.headlineSource})` : ''}.`;
  }
  const sections = [];
  if (stories.length) sections.push(`<h2>Stories</h2>\n<ol>${stories.map((s) => storyItem(s, d.home)).join('\n')}</ol>`);
  const outlets = rows(cell.topOutlets);
  if (outlets) sections.push(`<h2>Outlets</h2>\n${outlets}`);
  const countries = rows(cell.topCountries, 'region');
  if (countries) sections.push(`<h2>Outlet countries</h2>\n${countries}`);
  const languages = rows(cell.languages, 'language');
  if (languages) sections.push(`<h2>Languages</h2>\n${languages}`);
  const articles = arr(cell.articles).filter((a) => a && typeof a === 'object').slice(0, NEWEST);
  if (articles.length) sections.push(`<h2>Newest articles</h2>\n<ol>${articles.map((a) => articleItem(a, heat.generatedAt)).join('\n')}</ol>`);

  return page({
    root: '../',
    title: `${d.name}: ${counts} in the last ${hours(win)} · Today On Earth`,
    description,
    canonical: `${SITE}place/${cell.id}.html`,
    body: [
      `<h1>${esc(d.name)}</h1>`,
      `<p class="lede">${esc(countsSentence(d))}</p>`,
      stamp(heat.generatedAt),
      `<a class="act" href="../#c=${esc(cell.id)}">Open on the map</a>`,
      ...sections,
    ].join('\n'),
  });
}

function indexPage(listed, paged, heat) {
  const win = num(heat.windowHours) || 24;
  const lede =
    `${plural(listed.length, 'place', 'places')} with ${INDEX_MIN} or more articles in the last ${hours(win)}, by article count. ` +
    `${count(paged.size)} with ${PAGE_MIN} or more have a page.`;
  const items = listed.map((c) => {
    const name = esc(str(c.name) || c.id);
    const label = paged.has(c.id) ? `<span><a href="place/${esc(c.id)}.html">${name}</a></span>` : `<span class="out">${name}</span>`;
    return `<li class="row">${label}<span class="n">${esc(plural(num(c.n), 'article', 'articles'))}</span></li>`;
  });
  return page({
    root: './',
    title: `Places in the news: ${plural(listed.length, 'place', 'places')} in the last ${hours(win)} · Today On Earth`,
    description: `Every place in the last ${hours(win)} of news coverage on Today On Earth, ranked by article count, from GDELT.`,
    canonical: `${SITE}places.html`,
    body: [
      '<h1>Places</h1>',
      `<p class="lede">${esc(lede)}</p>`,
      stamp(heat.generatedAt),
      '<a class="act" href="./">Open the map</a>',
      '<h2>Places</h2>',
      `<ol class="places">\n${items.join('\n')}\n</ol>`,
    ].join('\n'),
  });
}

function sitemap(paths, at) {
  const lastmod = esc(str(at));
  const urls = paths.map((p) => `<url><loc>${esc(SITE + p)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

/** Runs `fn` over `items` with at most `limit` in flight; results in input order. */
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// Main --------------------------------------------------------------------------------

const started = performance.now();
const heatPath = join(dataDir, 'heat.json');
if (!existsSync(heatPath)) {
  console.error(`build-places: no ${heatPath}; run the ingest or npm run predev first`);
  process.exit(1);
}
const heat = JSON.parse(await readFile(heatPath, 'utf8'));
// Heat cells are sorted by n; sort again (n, then id) so the output never depends on file order.
const cells = arr(heat.cells)
  .filter((c) => c && typeof c.id === 'string' && /^[0-9a-f]{15}$/.test(c.id))
  .sort((a, b) => num(b.n) - num(a.n) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

await rm(placeDir, { recursive: true, force: true });
await mkdir(placeDir, { recursive: true });

const candidates = cells.filter((c) => num(c.n) >= PAGE_MIN);
let missing = 0;
let largest = { bytes: 0, id: '' };
const written = await pool(candidates, CONCURRENCY, async (c) => {
  let cell;
  try {
    cell = JSON.parse(await readFile(join(dataDir, 'cells', `${c.id}.json`), 'utf8'));
  } catch {
    missing++;
    return null;
  }
  const html = placePage({ ...cell, id: c.id }, heat);
  const bytes = Buffer.byteLength(html);
  if (bytes > largest.bytes) largest = { bytes, id: c.id };
  await writeFile(join(placeDir, `${c.id}.html`), html);
  return c.id;
});
const paged = new Set(written.filter(Boolean));
const pagedInOrder = candidates.filter((c) => paged.has(c.id));

const listed = cells.filter((c) => num(c.n) >= INDEX_MIN);
const index = indexPage(listed, paged, heat);
await writeFile(join(outDir, 'places.html'), index);

const urls = ['', 'about.html', 'places.html', ...pagedInOrder.map((c) => `place/${c.id}.html`)];
await writeFile(join(outDir, 'sitemap.xml'), sitemap(urls, heat.generatedAt));

const ms = Math.round(performance.now() - started);
console.log(
  `build-places: ${paged.size} place pages (n >= ${PAGE_MIN}${missing ? `; ${missing} skipped, no cell file` : ''}), ` +
    `${listed.length} index rows, ${urls.length} sitemap URLs; largest page ${(largest.bytes / 1024).toFixed(1)} KB (${largest.id || 'none'}), ` +
    `index ${(Buffer.byteLength(index) / 1024).toFixed(1)} KB; ${ms} ms`,
);
