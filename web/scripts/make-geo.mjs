// Builds the base-map files in web/public/geo/ from Natural Earth GeoJSON (public domain).
// Usage: node scripts/make-geo.mjs <dir with the Natural Earth .geojson downloads>
//   ne_110m_admin_0_countries.geojson        -> countries.json       (first paint)
//   ne_50m_admin_0_countries.geojson         -> countries-50m.json   (lazy, zoom >= 3)
//                                            -> country-labels.json
//   ne_50m_admin_1_states_provinces_lines.geojson -> admin1-lines.json
//   ne_50m_populated_places_simple.geojson   -> places.json
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2];
if (!src) throw new Error('usage: node scripts/make-geo.mjs <natural-earth-dir>');
const out = new URL('../public/geo/', import.meta.url);

const read = (file) => JSON.parse(readFileSync(join(src, file), 'utf8'));
// Some Natural Earth names carry double spaces ("Washington,  D.C.").
const tidy = (s) => String(s).replace(/\s+/g, ' ').trim();
const round = (v) => (Array.isArray(v) ? v.map(round) : Math.round(v * 1000) / 1000);
const geometry = (g) => ({ type: g.type, coordinates: round(g.coordinates) });
const point = (lon, lat, properties) => ({
  type: 'Feature',
  properties,
  geometry: { type: 'Point', coordinates: [round(lon), round(lat)] },
});
const write = (name, features) => {
  const file = new URL(name, out);
  writeFileSync(file, JSON.stringify({ type: 'FeatureCollection', features }));
  console.log(`${name.padEnd(20)} ${String(features.length).padStart(5)} features ${(statSync(file).size / 1024).toFixed(0).padStart(6)} KB`);
};

// Antarctica is not drawn: the camera stops at 58 S and no news glows there.
const isAntarctica = (f) => f.properties.NAME === 'Antarctica';

/** Centroid of the largest outer ring, by planar area (fallback when LABEL_X/Y are missing). */
function largestPartCentroid(g) {
  const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]);
  let best = null;
  for (const ring of rings) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      a += f;
      cx += (ring[j][0] + ring[i][0]) * f;
      cy += (ring[j][1] + ring[i][1]) * f;
    }
    if (a && (!best || Math.abs(a) > Math.abs(best.a))) best = { a, x: cx / (3 * a), y: cy / (3 * a) };
  }
  return best ? [best.x, best.y] : null;
}

if (existsSync(join(src, 'ne_110m_admin_0_countries.geojson'))) {
  const c110 = read('ne_110m_admin_0_countries.geojson').features.filter((f) => !isAntarctica(f));
  write('countries.json', c110.map((f) => ({ type: 'Feature', properties: { name: f.properties.NAME ?? '' }, geometry: geometry(f.geometry) })));
}

const c50 = read('ne_50m_admin_0_countries.geojson').features.filter((f) => !isAntarctica(f));
write('countries-50m.json', c50.map((f) => ({ type: 'Feature', properties: { name: f.properties.NAME ?? '' }, geometry: geometry(f.geometry) })));

write('country-labels.json', c50.flatMap((f) => {
  const p = f.properties;
  const at = Number.isFinite(p.LABEL_X) && Number.isFinite(p.LABEL_Y) ? [p.LABEL_X, p.LABEL_Y] : largestPartCentroid(f.geometry);
  return at && p.NAME ? [point(at[0], at[1], { name: tidy(p.NAME), rank: p.LABELRANK ?? 10 })] : [];
}));

write('admin1-lines.json', read('ne_50m_admin_1_states_provinces_lines.geojson').features.map((f) => ({
  type: 'Feature', properties: {}, geometry: geometry(f.geometry),
})));

write('places.json', read('ne_50m_populated_places_simple.geojson').features
  .filter((f) => f.properties.scalerank <= 7 && f.properties.name)
  .map((f) => {
    const p = f.properties;
    return point(p.longitude, p.latitude, { name: tidy(p.name), rank: p.scalerank, cap: p.adm0cap ? 1 : 0 });
  }));
