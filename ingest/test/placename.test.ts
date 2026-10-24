import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanPlaceName } from "../src/placename.ts";

test("cleanPlaceName: the examples", () => {
  assert.equal(cleanPlaceName("Washington, Washington, United States"), "Washington, United States");
  assert.equal(cleanPlaceName("Paris, France (General), France"), "Paris, France");
  assert.equal(cleanPlaceName("London, London, City Of, United Kingdom"), "London, United Kingdom");
  assert.equal(cleanPlaceName("New York, United States"), "New York, United States");
  assert.equal(cleanPlaceName("Texas, United States"), "Texas, United States");
  assert.equal(cleanPlaceName("Nuuk, Greenland"), "Nuuk, Greenland");
});

test("cleanPlaceName: tricky cases", () => {
  // Everything collapses to one country name.
  assert.equal(cleanPlaceName("Kuwait, Kuwait (General), Kuwait"), "Kuwait");
  // A middle repeat of the first part that is not adjacent, then the duplicate it exposes.
  assert.equal(cleanPlaceName("Monaco, Monte Carlo, Monaco, Monaco"), "Monaco, Monte Carlo, Monaco");
  // Case-insensitive duplicates keep the first spelling; "City of" in any case is dropped.
  assert.equal(cleanPlaceName("Mexico City, MEXICO CITY, City of, Mexico"), "Mexico City, Mexico");
  // A real name that only looks similar is untouched.
  assert.equal(cleanPlaceName("Kansas City, Missouri, United States"), "Kansas City, Missouri, United States");
  // Never empty: a name made only of removable parts is kept as is.
  assert.equal(cleanPlaceName("(General)"), "(General)");
  assert.equal(cleanPlaceName("City Of"), "City Of");
  assert.equal(cleanPlaceName(""), "");
  // Idempotent.
  const once = cleanPlaceName("London, London, City Of, United Kingdom");
  assert.equal(cleanPlaceName(once), once);
});

test("cleanPlaceName: GDELT's \"?\" encoding artefacts are removed", () => {
  // Between two letters, the uppercase letter after the "?" is lowercased.
  assert.equal(cleanPlaceName("Ad Daw?Ah, Ad Daw?Ah, Qatar"), "Ad Dawah, Qatar");
  // Between two letters but followed by lowercase: only the "?" goes.
  assert.equal(cleanPlaceName("Sa?o Paulo, Sao Paulo, Brazil"), "Sao Paulo, Brazil");
  // A run of "?" counts as one gap.
  assert.equal(cleanPlaceName("Hal??Ab, Syria"), "Halab, Syria");
  // Not between two letters: the "?" goes, case and the neighbouring words stay.
  assert.equal(cleanPlaceName("?Ayn Al Asad, Iraq"), "Ayn Al Asad, Iraq");
  assert.equal(cleanPlaceName("Foo ? Bar, Chad"), "Foo Bar, Chad");
  assert.equal(cleanPlaceName("Al-?Arish, Egypt"), "Al-Arish, Egypt");
  // Never empty, and idempotent.
  assert.equal(cleanPlaceName("?"), "?");
  assert.equal(cleanPlaceName("??, ?"), "??, ?");
  for (const name of ["Ad Daw?Ah, Ad Daw?Ah, Qatar", "Hal??Ab, Syria", "?", "Foo ? Bar, Chad"]) {
    const cleaned = cleanPlaceName(name);
    assert.equal(cleanPlaceName(cleaned), cleaned);
  }
  // A transliteration variant in the admin-1 part is not a duplicate: kept.
  assert.equal(cleanPlaceName("Moscow, Moskva, Russia"), "Moscow, Moskva, Russia");
  // A "?" in a middle part is GDELT's lossy region name: the part goes ("Ha N?I" is Ha Noi).
  assert.equal(cleanPlaceName("Hanoi, Ha N?I, Vietnam, Republic Of"), "Hanoi, Vietnam, Republic Of");
});

test("cleanPlaceName: garbled region names are dropped (raw GDELT strings)", () => {
  // GDELT's region names lose letters after a non-ASCII letter; the raw files say "SãPaulo".
  assert.equal(cleanPlaceName("Sao Paulo, SãPaulo, Brazil"), "Sao Paulo, Brazil");
  assert.equal(cleanPlaceName("Santiago, RegióEtropolitana, Chile"), "Santiago, Chile");
  assert.equal(cleanPlaceName("Tucuman, TucumáAs, Argentina"), "Tucuman, Argentina");
  assert.equal(cleanPlaceName("Geneva, Genè, Switzerland"), "Geneva, Switzerland");
  assert.equal(cleanPlaceName("Prague, Praha, HlavníEsto, Czech Republic"), "Prague, Praha, Czech Republic");
  // Only middle parts: a first or last part with a non-ASCII letter is kept as written.
  assert.equal(cleanPlaceName("Çankırı, Turkey"), "Çankırı, Turkey");
  assert.equal(cleanPlaceName("Zürich"), "Zürich");
  // ASCII middle parts are kept, acronyms and hyphenated names included.
  assert.equal(cleanPlaceName("Washington, DC, United States"), "Washington, DC, United States");
  assert.equal(cleanPlaceName("Marseille, Provence-Alpes-Cote D'azur, France"), "Marseille, Provence-Alpes-Cote D'azur, France");
  assert.equal(cleanPlaceName("Durres, Qarku I Durresit, Albania"), "Durres, Qarku I Durresit, Albania");
  // Idempotent.
  const once = cleanPlaceName("Ho Chi Minh City, H? ChíInh, Vietnam, Republic Of");
  assert.equal(once, "Ho Chi Minh City, Vietnam, Republic Of");
  assert.equal(cleanPlaceName(once), once);
});

test("cleanPlaceName: bare ADM1 codes are dropped", () => {
  assert.equal(cleanPlaceName("Amman, (Jo11), Jordan"), "Amman, Jordan");
  assert.equal(cleanPlaceName("Warsaw, (Pl67), Poland"), "Warsaw, Poland");
  assert.equal(cleanPlaceName("Zajecar, 00, Serbia"), "Zajecar, Serbia");
  // A parenthesised word is not a code; a name with a code inside it is not a bare code.
  assert.equal(cleanPlaceName("Yakutsk, (Sakha), Russia"), "Yakutsk, (Sakha), Russia");
  assert.equal(cleanPlaceName("Yakutsk, Sakha (Yakutiya), Russia"), "Yakutsk, Sakha (Yakutiya), Russia");
  assert.equal(cleanPlaceName("Route 66, United States"), "Route 66, United States");
  // Never empty.
  assert.equal(cleanPlaceName("(Jo11)"), "(Jo11)");
});
