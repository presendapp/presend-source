#!/usr/bin/env python3
import re, sys, os, glob

MARKERS = [
    "cloudflare-analytics-install",
    "cloudflare-analytics",
    "seo-related-tools",
    "seo-related",
    "seo-breadcrumb",
    "seo-howto",
    "seo-faq",
    "seo-org",
    "seo-app",
    "refresh",
]

LANGS = ["fr", "es", "de", "ja", "pt", "hi", "ru"]
CONTEXT = 40
MAX_MIDDLE = 80

def flex_ws_pattern(snippet):
    parts = re.split(r"(\s+)", snippet)
    out = []
    for part in parts:
        if part == "":
            continue
        if part.strip() == "":
            out.append(r"\s*")
        else:
            out.append(re.escape(part))
    return "".join(out)

def get_context(en_text, marker):
    tag = f"<!--{marker}-->"
    idx = en_text.find(tag)
    if idx == -1:
        return None
    prefix = en_text[max(0, idx-CONTEXT):idx]
    suffix = en_text[idx+len(tag):idx+len(tag)+CONTEXT]
    return prefix, suffix

def english_path_for(translated_path, lang):
    p = lang + "/"
    if translated_path.startswith(p):
        return translated_path[len(p):]
    return None

def fix_file(translated_path, lang, report, apply_changes):
    en_path = english_path_for(translated_path, lang)
    if not en_path or not os.path.exists(en_path):
        return
    with open(en_path, encoding="utf-8") as f:
        en_text = f.read()
    with open(translated_path, encoding="utf-8") as f:
        text = f.read()
    original = text

    for marker in MARKERS:
        ctx = get_context(en_text, marker)
        if not ctx:
            continue
        prefix, suffix = ctx
        tag = f"<!--{marker}-->"
        if tag in text:
            continue

        found = False
        for p_len in range(len(prefix), 4, -5):
            p_raw = prefix[len(prefix)-p_len:]
            for s_len in range(len(suffix), 4, -5):
                s_raw = suffix[:s_len]
                if not p_raw.strip() and not s_raw.strip():
                    continue
                pattern = flex_ws_pattern(p_raw) + r"(.{0," + str(MAX_MIDDLE) + r"}?)" + flex_ws_pattern(s_raw)
                m = re.search(pattern, text, re.DOTALL)
                if m:
                    middle = m.group(1)
                    # GARDE-FOU: le texte parasite ne doit jamais contenir de balise HTML
                    if "<" in middle or ">" in middle:
                        continue
                    if middle != tag:
                        real_prefix = text[m.start():m.start(1)]
                        real_suffix = text[m.end(1):m.end()]
                        text = text[:m.start()] + real_prefix + tag + real_suffix + text[m.end():]
                        report.append((translated_path, marker, middle.strip()[:80]))
                    found = True
                    break
            if found:
                break
        if not found:
            report.append((translated_path, marker, "NOT_FOUND"))

    if text != original and apply_changes:
        with open(translated_path, "w", encoding="utf-8") as f:
            f.write(text)

def main():
    apply_changes = "--apply" in sys.argv
    report = []
    for lang in LANGS:
        for path in glob.glob(f"{lang}/**/*.html", recursive=True):
            fix_file(path, lang, report, apply_changes)

    changed = [r for r in report if r[2] != "NOT_FOUND"]
    notfound = [r for r in report if r[2] == "NOT_FOUND"]

    print(f"=== {'APPLIED' if apply_changes else 'DRY RUN'} ===")
    print(f"Corrections trouvees: {len(changed)}")
    for path, marker, old in changed:
        print(f"  {path} | {marker} | ancien texte: {old!r}")

    print(f"\nMarqueurs non localises (a verifier manuellement): {len(notfound)}")
    for path, marker, _ in notfound:
        print(f"  {path} | {marker}")

if __name__ == "__main__":
    main()
