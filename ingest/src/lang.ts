/**
 * GDELT's translingual GKG marks the source language as `srclc:xxx` with an ISO 639-2/639-3
 * three-letter code (e.g. "spa", "zho", "deu"). The data contract wants ISO 639-1 two-letter
 * codes where known. Both the 639-2/B ("ger", "fre", "chi") and 639-2/T ("deu", "fra",
 * "zho") spellings are listed. Codes not in the table pass through unchanged.
 */
const ISO639_3_TO_1: Readonly<Record<string, string>> = {
  afr: "af", amh: "am", ara: "ar", arm: "hy", hye: "hy", aze: "az", bak: "ba", baq: "eu",
  eus: "eu", bel: "be", ben: "bn", bos: "bs", bul: "bg", bur: "my", mya: "my", cat: "ca",
  ces: "cs", cze: "cs", chi: "zh", zho: "zh", cym: "cy", wel: "cy", dan: "da", deu: "de",
  ger: "de", dut: "nl", nld: "nl", ell: "el", gre: "el", eng: "en", epo: "eo", est: "et",
  fao: "fo", fas: "fa", per: "fa", fil: "tl", tgl: "tl", fin: "fi", fra: "fr", fre: "fr",
  fry: "fy", gla: "gd", gle: "ga", glg: "gl", guj: "gu", hat: "ht", hau: "ha", heb: "he",
  hin: "hi", hrv: "hr", hun: "hu", ibo: "ig", ice: "is", isl: "is", ind: "id", ita: "it",
  jav: "jv", jpn: "ja", kan: "kn", kat: "ka", geo: "ka", kaz: "kk", khm: "km", kin: "rw",
  kir: "ky", kor: "ko", kur: "ku", lao: "lo", lat: "la", lav: "lv", lit: "lt", ltz: "lb",
  mac: "mk", mkd: "mk", mal: "ml", mar: "mr", may: "ms", msa: "ms", mlg: "mg", mlt: "mt",
  mon: "mn", mri: "mi", mao: "mi", nep: "ne", nno: "nn", nob: "nb", nor: "no", ori: "or",
  orm: "om", pan: "pa", pol: "pl", por: "pt", pus: "ps", que: "qu", roh: "rm", ron: "ro",
  rum: "ro", rus: "ru", sin: "si", slk: "sk", slo: "sk", slv: "sl", sna: "sn", snd: "sd",
  som: "so", sot: "st", spa: "es", alb: "sq", sqi: "sq", srp: "sr", sun: "su", swa: "sw",
  swe: "sv", tam: "ta", tat: "tt", tel: "te", tgk: "tg", tha: "th", tir: "ti", tuk: "tk",
  tur: "tr", uig: "ug", ukr: "uk", urd: "ur", uzb: "uz", vie: "vi", xho: "xh", yid: "yi",
  yor: "yo", zul: "zu",
};

/**
 * Language of an article from the GKG TranslationInfo field.
 * Empty TranslationInfo means GDELT's English stream, so "en".
 */
export function langFromTranslationInfo(info: string): string {
  if (!info) return "en";
  const m = /(?:^|;)srclc:([a-zA-Z-]+)/.exec(info);
  if (!m) return "";
  const code = m[1].toLowerCase();
  return ISO639_3_TO_1[code] ?? code;
}
