# Phonemes for the newscast's headlines read in another language (docs/PLAN.md "Clip v4: the
# newscast", status v4.2). kokoro-js phonemises English only, so render/src/speech.mjs sends
# the other languages' text here and feeds the phonemes it gets back to the model.
#
# Reads JSON lines {"id", "lang", "text"} on stdin, writes one JSON line {"id", "phonemes"} per
# input line on stdout, in order ({"id", "error"} when a line fails). The front ends are the
# ones the Python kokoro package (0.9.4) picks for Kokoro 1.0, from misaki 0.9.4:
#   es, fr, it, pt (Brazilian), hi   misaki.espeak.EspeakG2P on espeak-ng (espeakng-loader)
#   ja                               misaki.ja.JAG2P() (cutlet: fugashi with unidic-lite)
#   zh                               misaki.zh.ZHG2P() (jieba and pypinyin, the 1.0 path)
#
#   uv run --project render/py --locked --quiet python -I render/py/phonemize.py
import json
import sys
import types

ESPEAK = {"es": "es", "fr": "fr-fr", "it": "it", "pt": "pt-br", "hi": "hi"}
LANGS = sorted([*ESPEAK, "ja", "zh"])

_g2p = {}


def g2p(lang):
    if lang in _g2p:
        return _g2p[lang]
    if lang in ESPEAK:
        from misaki import espeak

        fn = espeak.EspeakG2P(language=ESPEAK[lang])
    elif lang == "ja":
        # misaki.ja imports pyopenjtalk at the top but only its "pyopenjtalk" version calls it;
        # the default (cutlet) does not, so a stub stands in for the 300 MB package.
        try:
            import pyopenjtalk  # noqa: F401
        except ImportError:
            sys.modules["pyopenjtalk"] = types.ModuleType("pyopenjtalk")
        from misaki import ja

        fn = ja.JAG2P()
    elif lang == "zh":
        from misaki import zh

        fn = zh.ZHG2P()
    else:
        raise ValueError(f"no phonemiser for language {lang!r} (have {', '.join(LANGS)})")
    _g2p[lang] = fn
    return fn


def main():
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    for raw in sys.stdin:
        if not raw.strip():
            continue
        req = json.loads(raw)
        try:
            phonemes, _ = g2p(req["lang"])(req["text"])
            out = {"id": req["id"], "phonemes": phonemes.strip()}
        except Exception as err:  # reported per line; speech.mjs fails the line
            out = {"id": req.get("id"), "error": f"{type(err).__name__}: {err}"}
        sys.stdout.write(json.dumps(out, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
