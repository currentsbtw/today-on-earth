/**
 * FIPS 10-4 country code -> ISO 3166-1 alpha-2 crosswalk.
 *
 * GDELT tags locations and outlets with FIPS 10-4 codes (e.g. "UK", "GM", "AS"), but the
 * data contract wants ISO 3166-1 alpha-2 ("GB", "DE", "AU").
 *
 * Provenance: transcribed from the CIA World Factbook, Appendix D "Cross-Reference List of
 * Country Data Codes" (the FIPS 10-4 / GEC column against the ISO 3166 column), the standard
 * published crosswalk. FIPS 10-4 was withdrawn in 2008 and continued by the NGA as "GEC"
 * codes, which are what GDELT emits.
 *
 * Deliberate choices:
 * - "RB" is the interim 2006 FIPS code for Serbia (replaced by "RI" in 2008). GDELT's
 *   outlet list still uses it, so both map to "RS".
 * - "KV" (Kosovo) maps to "XK", the user-assigned code used by the EU and most data sets.
 * - "GZ" (Gaza Strip) and "WE" (West Bank) both map to "PS".
 * - US minor outlying islands (Baker, Howland, Jarvis, Johnston, Kingman, Midway, Navassa,
 *   Palmyra, Wake) map to "UM".
 * - Entities with no ISO 3166-1 code (Akrotiri, Dhekelia, Paracel and Spratly Islands,
 *   Oceans, Clipperton, the Iles Eparses, Ashmore and Cartier, Coral Sea Islands) and the
 *   dissolved Netherlands Antilles ("NT") are absent, so they resolve to "" (unknown).
 */
export const FIPS_TO_ISO: Readonly<Record<string, string>> = {
  AA: "AW", // Aruba
  AC: "AG", // Antigua and Barbuda
  AE: "AE", // United Arab Emirates
  AF: "AF", // Afghanistan
  AG: "DZ", // Algeria
  AJ: "AZ", // Azerbaijan
  AL: "AL", // Albania
  AM: "AM", // Armenia
  AN: "AD", // Andorra
  AO: "AO", // Angola
  AQ: "AS", // American Samoa
  AR: "AR", // Argentina
  AS: "AU", // Australia
  AU: "AT", // Austria
  AV: "AI", // Anguilla
  AY: "AQ", // Antarctica
  BA: "BH", // Bahrain
  BB: "BB", // Barbados
  BC: "BW", // Botswana
  BD: "BM", // Bermuda
  BE: "BE", // Belgium
  BF: "BS", // Bahamas
  BG: "BD", // Bangladesh
  BH: "BZ", // Belize
  BK: "BA", // Bosnia and Herzegovina
  BL: "BO", // Bolivia
  BM: "MM", // Burma / Myanmar
  BN: "BJ", // Benin
  BO: "BY", // Belarus
  BP: "SB", // Solomon Islands
  BQ: "UM", // Navassa Island
  BR: "BR", // Brazil
  BT: "BT", // Bhutan
  BU: "BG", // Bulgaria
  BV: "BV", // Bouvet Island
  BX: "BN", // Brunei
  BY: "BI", // Burundi
  CA: "CA", // Canada
  CB: "KH", // Cambodia
  CD: "TD", // Chad
  CE: "LK", // Sri Lanka
  CF: "CG", // Congo (Brazzaville)
  CG: "CD", // Congo (Kinshasa)
  CH: "CN", // China
  CI: "CL", // Chile
  CJ: "KY", // Cayman Islands
  CK: "CC", // Cocos (Keeling) Islands
  CM: "CM", // Cameroon
  CN: "KM", // Comoros
  CO: "CO", // Colombia
  CQ: "MP", // Northern Mariana Islands
  CS: "CR", // Costa Rica
  CT: "CF", // Central African Republic
  CU: "CU", // Cuba
  CV: "CV", // Cabo Verde
  CW: "CK", // Cook Islands
  CY: "CY", // Cyprus
  DA: "DK", // Denmark
  DJ: "DJ", // Djibouti
  DO: "DM", // Dominica
  DQ: "UM", // Jarvis Island
  DR: "DO", // Dominican Republic
  EC: "EC", // Ecuador
  EG: "EG", // Egypt
  EI: "IE", // Ireland
  EK: "GQ", // Equatorial Guinea
  EN: "EE", // Estonia
  ER: "ER", // Eritrea
  ES: "SV", // El Salvador
  ET: "ET", // Ethiopia
  EZ: "CZ", // Czechia
  FG: "GF", // French Guiana
  FI: "FI", // Finland
  FJ: "FJ", // Fiji
  FK: "FK", // Falkland Islands
  FM: "FM", // Micronesia
  FO: "FO", // Faroe Islands
  FP: "PF", // French Polynesia
  FQ: "UM", // Baker Island
  FR: "FR", // France
  FS: "TF", // French Southern and Antarctic Lands
  GA: "GM", // Gambia
  GB: "GA", // Gabon
  GG: "GE", // Georgia
  GH: "GH", // Ghana
  GI: "GI", // Gibraltar
  GJ: "GD", // Grenada
  GK: "GG", // Guernsey
  GL: "GL", // Greenland
  GM: "DE", // Germany
  GP: "GP", // Guadeloupe
  GQ: "GU", // Guam
  GR: "GR", // Greece
  GT: "GT", // Guatemala
  GV: "GN", // Guinea
  GY: "GY", // Guyana
  GZ: "PS", // Gaza Strip
  HA: "HT", // Haiti
  HK: "HK", // Hong Kong
  HM: "HM", // Heard Island and McDonald Islands
  HO: "HN", // Honduras
  HQ: "UM", // Howland Island
  HR: "HR", // Croatia
  HU: "HU", // Hungary
  IC: "IS", // Iceland
  ID: "ID", // Indonesia
  IM: "IM", // Isle of Man
  IN: "IN", // India
  IO: "IO", // British Indian Ocean Territory
  IR: "IR", // Iran
  IS: "IL", // Israel
  IT: "IT", // Italy
  IV: "CI", // Cote d'Ivoire
  IZ: "IQ", // Iraq
  JA: "JP", // Japan
  JE: "JE", // Jersey
  JM: "JM", // Jamaica
  JN: "SJ", // Jan Mayen
  JO: "JO", // Jordan
  JQ: "UM", // Johnston Atoll
  KE: "KE", // Kenya
  KG: "KG", // Kyrgyzstan
  KN: "KP", // North Korea
  KQ: "UM", // Kingman Reef
  KR: "KI", // Kiribati
  KS: "KR", // South Korea
  KT: "CX", // Christmas Island
  KU: "KW", // Kuwait
  KV: "XK", // Kosovo
  KZ: "KZ", // Kazakhstan
  LA: "LA", // Laos
  LE: "LB", // Lebanon
  LG: "LV", // Latvia
  LH: "LT", // Lithuania
  LI: "LR", // Liberia
  LO: "SK", // Slovakia
  LQ: "UM", // Palmyra Atoll
  LS: "LI", // Liechtenstein
  LT: "LS", // Lesotho
  LU: "LU", // Luxembourg
  LY: "LY", // Libya
  MA: "MG", // Madagascar
  MB: "MQ", // Martinique
  MC: "MO", // Macau
  MD: "MD", // Moldova
  MF: "YT", // Mayotte
  MG: "MN", // Mongolia
  MH: "MS", // Montserrat
  MI: "MW", // Malawi
  MJ: "ME", // Montenegro
  MK: "MK", // North Macedonia
  ML: "ML", // Mali
  MN: "MC", // Monaco
  MO: "MA", // Morocco
  MP: "MU", // Mauritius
  MQ: "UM", // Midway Islands
  MR: "MR", // Mauritania
  MT: "MT", // Malta
  MU: "OM", // Oman
  MV: "MV", // Maldives
  MX: "MX", // Mexico
  MY: "MY", // Malaysia
  MZ: "MZ", // Mozambique
  NC: "NC", // New Caledonia
  NE: "NU", // Niue
  NF: "NF", // Norfolk Island
  NG: "NE", // Niger
  NH: "VU", // Vanuatu
  NI: "NG", // Nigeria
  NL: "NL", // Netherlands
  NN: "SX", // Sint Maarten
  NO: "NO", // Norway
  NP: "NP", // Nepal
  NR: "NR", // Nauru
  NS: "SR", // Suriname
  NU: "NI", // Nicaragua
  NZ: "NZ", // New Zealand
  OD: "SS", // South Sudan
  PA: "PY", // Paraguay
  PC: "PN", // Pitcairn Islands
  PE: "PE", // Peru
  PK: "PK", // Pakistan
  PL: "PL", // Poland
  PM: "PA", // Panama
  PO: "PT", // Portugal
  PP: "PG", // Papua New Guinea
  PS: "PW", // Palau
  PU: "GW", // Guinea-Bissau
  QA: "QA", // Qatar
  RB: "RS", // Serbia (interim 2006 code)
  RE: "RE", // Reunion
  RI: "RS", // Serbia
  RM: "MH", // Marshall Islands
  RN: "MF", // Saint Martin
  RO: "RO", // Romania
  RP: "PH", // Philippines
  RQ: "PR", // Puerto Rico
  RS: "RU", // Russia
  RW: "RW", // Rwanda
  SA: "SA", // Saudi Arabia
  SB: "PM", // Saint Pierre and Miquelon
  SC: "KN", // Saint Kitts and Nevis
  SE: "SC", // Seychelles
  SF: "ZA", // South Africa
  SG: "SN", // Senegal
  SH: "SH", // Saint Helena
  SI: "SI", // Slovenia
  SL: "SL", // Sierra Leone
  SM: "SM", // San Marino
  SN: "SG", // Singapore
  SO: "SO", // Somalia
  SP: "ES", // Spain
  ST: "LC", // Saint Lucia
  SU: "SD", // Sudan
  SV: "SJ", // Svalbard
  SW: "SE", // Sweden
  SX: "GS", // South Georgia and the South Sandwich Islands
  SY: "SY", // Syria
  SZ: "CH", // Switzerland
  TB: "BL", // Saint Barthelemy
  TD: "TT", // Trinidad and Tobago
  TH: "TH", // Thailand
  TI: "TJ", // Tajikistan
  TK: "TC", // Turks and Caicos Islands
  TL: "TK", // Tokelau
  TN: "TO", // Tonga
  TO: "TG", // Togo
  TP: "ST", // Sao Tome and Principe
  TS: "TN", // Tunisia
  TT: "TL", // Timor-Leste
  TU: "TR", // Turkey
  TV: "TV", // Tuvalu
  TW: "TW", // Taiwan
  TX: "TM", // Turkmenistan
  TZ: "TZ", // Tanzania
  UC: "CW", // Curacao
  UG: "UG", // Uganda
  UK: "GB", // United Kingdom
  UP: "UA", // Ukraine
  US: "US", // United States
  UV: "BF", // Burkina Faso
  UY: "UY", // Uruguay
  UZ: "UZ", // Uzbekistan
  VC: "VC", // Saint Vincent and the Grenadines
  VE: "VE", // Venezuela
  VI: "VG", // British Virgin Islands
  VM: "VN", // Vietnam
  VQ: "VI", // US Virgin Islands
  VT: "VA", // Holy See (Vatican City)
  WA: "NA", // Namibia
  WE: "PS", // West Bank
  WF: "WF", // Wallis and Futuna
  WI: "EH", // Western Sahara
  WQ: "UM", // Wake Island
  WS: "WS", // Samoa
  WZ: "SZ", // Eswatini
  YM: "YE", // Yemen
  ZA: "ZM", // Zambia
  ZI: "ZW", // Zimbabwe
};

/** FIPS 10-4 code -> ISO 3166-1 alpha-2, or "" when unknown or without an ISO equivalent. */
export function fipsToIso(fips: string): string {
  return FIPS_TO_ISO[fips.trim().toUpperCase()] ?? "";
}
