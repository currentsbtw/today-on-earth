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
