import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { getResolution, isValidCell, latLngToCell } from "h3-js";
import { buildSnapshot } from "../src/aggregate.ts";
import { loadCountryLookup, makeCountryLookup } from "../src/domains.ts";
import { fipsToIso } from "../src/fips-to-iso.ts";
import { createRecordAssembler, decodeEntities, extractTitle, gkgDateToIso, isYouTubeVideoUrl, parseGkgLine, parsePrimaryLocation, parseVideo, youTubeVideoId } from "../src/gkg.ts";
import { langFromTranslationInfo } from "../src/lang.ts";

// Three real GKG 2.1 lines (two from the English stream 20261021041500, one from the
// translingual stream 20261021031500), trimmed to the columns the parser reads.
const lines = readFileSync(new URL("./fixtures/gkg-sample.tsv", import.meta.url), "utf8")
  .split("\n")
  .filter(Boolean);
const countryOf = loadCountryLookup();

test("fixture has three 27-column lines", () => {
  assert.equal(lines.length, 3);
  for (const l of lines) assert.equal(l.split("\t").length, 27);
});

test("English line: fields map to the contract", () => {
  const r = parseGkgLine(lines[0], countryOf);
  assert.ok(r.ok);
  const a = r.record;
  assert.equal(a.url, "https://www.lbc.co.uk/article/1b16339b2fe046889239079ebbb91a52-5HjdkBq_2/");
  assert.equal(a.title, "UK inflation expected to have accelerated in September after fuel surge");
  assert.equal(a.source, "lbc.co.uk");
  assert.equal(a.country, "GB"); // FIPS "UK" -> ISO "GB"
  assert.equal(a.lang, "en"); // empty TranslationInfo
  assert.equal(a.time, "2026-10-21T04:15:00Z");
  assert.equal(a.tone, 0);
  assert.equal(a.image, "https://images.globalplayer.com/images/850150?crop=16_9&signature=V-18R23QYPIl1O5UN3kYXxpHxKM=");
  // Its only locations are country-level ("1#United Kingdom#UK..."), so it is unplaced.
  assert.equal(a.cellId, "");
  assert.equal(a.locationName, "");
  assert.equal(a.lat, 0);
  assert.equal(a.lon, 0);
});

test("translingual line: language from srclc, entities decoded, first non-country location wins", () => {
  const r = parseGkgLine(lines[1], countryOf);
  assert.ok(r.ok);
  const a = r.record;
  assert.equal(a.lang, "es"); // srclc:spa
  assert.equal(a.source, "eju.tv");
  assert.equal(a.country, "BO"); // FIPS "BL" -> ISO "BO"
  assert.equal(a.title, "Gobernador de Oruro propone nacionalizar «chutos» y arancel cero contra el contrabando");
  assert.equal(a.locationName, "La Paz, Bolivia"); // GDELT: "La Paz, La Paz, Bolivia", tidied by cleanPlaceName
  assert.equal(a.lat, -16.5);
  assert.equal(a.lon, -68.15);
  assert.equal(a.cellId, latLngToCell(-16.5, -68.15, 3));
  assert.ok(isValidCell(a.cellId));
  assert.equal(getResolution(a.cellId), 3);
  assert.equal(a.tone, -4.56);
  assert.equal(a.time, "2026-10-21T03:15:00Z");
});

test("line without V2Locations is skipped", () => {
  const r = parseGkgLine(lines[2], countryOf);
  assert.deepEqual(r, { ok: false, reason: "location" });
});

test("non-web SourceCollectionIdentifier is dropped", () => {
  const f = lines[0].split("\t");
  f[2] = "2";
  assert.deepEqual(parseGkgLine(f.join("\t"), countryOf), { ok: false, reason: "collection" });
});

test("short line and malformed coordinates are skipped", () => {
  assert.deepEqual(parseGkgLine("a\tb\tc", countryOf), { ok: false, reason: "columns" });
  const f = lines[0].split("\t");
  f[10] = "1#Nowhere#XX#XX###abc#UK#1";
  assert.deepEqual(parseGkgLine(f.join("\t"), countryOf), { ok: false, reason: "location" });
});

test("missing image, unknown outlet and missing title become empty strings", () => {
  const f = lines[0].split("\t");
  f[3] = "unknown-outlet.example";
  f[18] = "";
  f[26] = "";
  const r = parseGkgLine(f.join("\t"), countryOf);
  assert.ok(r.ok);
  assert.equal(r.record.image, "");
  assert.equal(r.record.country, "");
  assert.equal(r.record.title, "");
});

test("rule 1: primary location prefers the first non-country entry", () => {
  const f = lines[0].split("\t");
  f[10] =
    "1#American#US#US##39.828175#-98.5795#US#10;" +
    "3#Mountain Home, Texas, United States#US#USTX#TX265#30.1746#-99.3803#1342167#841;" +
    "2#Texas, United States#US#USTX##31.106#-97.6475#TX#5";
  const r = parseGkgLine(f.join("\t"), countryOf);
  assert.ok(r.ok);
  assert.equal(r.record.locationName, "Mountain Home, Texas, United States");
  assert.equal(r.record.lat, 30.1746);
  assert.equal(r.record.lon, -99.3803);
  assert.equal(r.record.cellId, latLngToCell(30.1746, -99.3803, 3));
  assert.notEqual(r.record.cellId, latLngToCell(39.828175, -98.5795, 3));
});

test("rule 1: an article with only country-level locations is unplaced", () => {
  const f = lines[0].split("	");
  f[10] = "1#American#US#US##39.828175#-98.5795#US#10";
  const r = parseGkgLine(f.join("	"), countryOf);
  assert.ok(r.ok, "still an article in the window");
  assert.equal(r.record.cellId, "");
  assert.equal(r.record.locationName, "");
  const placed = parseGkgLine(lines[1], countryOf);
  assert.ok(placed.ok);
  const { heat, cells } = buildSnapshot([r.record, placed.record, { ...placed.record, url: "https://eju.tv/other" }], {
    now: new Date("2026-10-21T05:00:00Z"),
    windowHours: 24,
  });
  assert.equal(heat.totals.articles, 3);
  assert.equal(heat.totals.unplaced, 1);
  assert.deepEqual(heat.cells.map((c) => c.id), [placed.record.cellId]);
  assert.equal(heat.cells[0].n, 2);
  for (const c of cells) assert.ok(!c.articles.some((a) => a.url === r.record.url), "unplaced article is in no cell");
  // Skipped entries do not count as a location; nothing parseable at all is skipped.
  assert.equal(parsePrimaryLocation("1#British#UK#UK##54#-4#UK#3;3#Bad#UK#UK##x#y#1#9"), "unplaced");
  assert.equal(parsePrimaryLocation("3#Bad#UK#UK##x#y#1#9"), null);
  assert.equal(parsePrimaryLocation(""), null);
});

test("record assembler re-joins rows split by raw newlines inside Extras", () => {
  // Shape seen in 20261021033000.translation.gkg.csv: Extras continues on following lines.
  const f = lines[1].split("\t");
  f[26] = "<PAGE_AUTHORS>x</PAGE_AUTHORS>";
  const head = f.join("\t");
  const rows: string[] = [];
  const asm = createRecordAssembler((r) => rows.push(r));
  for (const l of [lines[0], head, "___________________", "Link: https://example.org <PAGE_TITLE>Split title</PAGE_TITLE>", lines[2]]) asm.push(l);
  asm.end();
  assert.equal(rows.length, 3);
  assert.equal(rows[0], lines[0]);
  assert.equal(rows[2], lines[2]);
  const r = parseGkgLine(rows[1], countryOf);
  assert.ok(r.ok);
  assert.equal(r.record.title, "Split title");
});

test("title trimmed to 160 characters", () => {
  const long = "x".repeat(300);
  const t = extractTitle(`<PAGE_TITLE>${long}</PAGE_TITLE>`);
  assert.equal(Array.from(t).length, 160);
  assert.equal(extractTitle("<PAGE_TITLE>  a &amp;\n b </PAGE_TITLE>"), "a & b");
});

test("helpers", () => {
  assert.equal(gkgDateToIso("20261020184500"), "2026-10-20T18:45:00Z");
  assert.equal(gkgDateToIso("2026"), "");
  assert.equal(decodeEntities("&#x2013; &#233; &quot;x&quot; &bogus;"), "– é \"x\" &bogus;");
  assert.equal(langFromTranslationInfo(""), "en");
  assert.equal(langFromTranslationInfo("srclc:zho;eng:GT-ZHO 1.0"), "zh");
  assert.equal(langFromTranslationInfo("srclc:axe;eng:GT-AXE 1.0"), "axe");
  assert.equal(fipsToIso("UK"), "GB");
  assert.equal(fipsToIso("GM"), "DE");
  assert.equal(fipsToIso("RB"), "RS");
  assert.equal(fipsToIso("ZZ"), "");
  const lookup = makeCountryLookup(new Map([["example.co.uk", "GB"]]));
  assert.equal(lookup("news.example.co.uk"), "GB");
  assert.equal(lookup("other.co.uk"), "");
});

test("video: first YouTube URL that names a video; channel links and other hosts are skipped", () => {
  // Shape from real GKG SocialVideoEmbeds: mostly channel links from site footers.
  assert.equal(parseVideo("https://youtube.com/user/mix931fm;https://youtube.com/channel/UCdjDGgzQtU3nIVOhSZup15A;"), "");
  assert.equal(parseVideo("https://youtube.com/@LBCOfficial;https://youtube.com/embed/XkbLfu92nDY?si=msewyz4L6wwZ-bap"), "https://youtube.com/embed/XkbLfu92nDY?si=msewyz4L6wwZ-bap");
  assert.equal(parseVideo("https://player.vimeo.com/video/1;https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1");
  assert.equal(parseVideo("https://youtu.be/dQw4w9WgXcQ"), "https://youtu.be/dQw4w9WgXcQ");
  assert.equal(parseVideo("https://m.youtube.com/shorts/dQw4w9WgXcQ"), "https://m.youtube.com/shorts/dQw4w9WgXcQ");
  assert.equal(parseVideo("https://dailymotion.com/video/x8;https://evil.com/watch?v=dQw4w9WgXcQ;https://youtube.com.evil.com/embed/dQw4w9WgXcQ"), "");
  assert.equal(parseVideo("https://youtube.com/embed/Hu0G8UYUQYUk"), ""); // 12 characters: not a video id
  assert.equal(parseVideo("https://youtube.com/playlist?list=PL123;&quot;"), "");
  assert.equal(parseVideo(""), "");
  assert.ok(isYouTubeVideoUrl("http://youtube.com/live/dQw4w9WgXcQ"));
  assert.ok(!isYouTubeVideoUrl("javascript:alert(1)//youtu.be/dQw4w9WgXcQ"));

  const f = lines[1].split("\t");
  f[21] = "https://youtube.com/@eju;https://youtube.com/embed/R3826ZVTKmE";
  const r = parseGkgLine(f.join("\t"), countryOf);
  assert.ok(r.ok);
  assert.equal(r.record.video, "https://youtube.com/embed/R3826ZVTKmE");
  const none = parseGkgLine(lines[1], countryOf);
  assert.ok(none.ok);
  assert.equal(none.record.video, "");
});

test("video: the id must be a whole segment or whole v value, followed only by end, ?, # or &", () => {
  const id = "dQw4w9WgXcQ";
  for (const bad of [
    `https://youtu.be/${id}%22%3E`,
    `https://youtu.be/${id} junk`,
    `https://youtube.com/embed/${id}/x`,
    `https://www.youtube.com/watch?v=${id}.x`,
    "https://youtube.com/embed/videoseries?list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs",
    `https://youtube.com/embed/${id}\\`,
    `https://youtube.com/embed/${id}x`,
    `https://youtubeXcom/embed/${id}`,
    `https://youtu-be/${id}`,
    `https://youtube.com/watchXv=${id}`,
  ]) {
    assert.equal(parseVideo(bad), "", bad);
  }
  for (const good of [
    `https://youtu.be/${id}`,
    `https://youtu.be/${id}?t=5`,
    `https://youtube.com/embed/${id}#start`,
    `https://www.youtube.com/watch?feature=share&v=${id}&t=1`,
    `https://m.youtube.com/watch?v=${id}`,
  ]) {
    assert.equal(parseVideo(good), good, good);
    assert.equal(youTubeVideoId(good), id);
  }
});
