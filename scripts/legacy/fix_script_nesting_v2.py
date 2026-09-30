#!/usr/bin/env python3
import re, sys, glob, os

MARKERS = [
    "seo-breadcrumb", "seo-faq", "seo-org", "seo-howto",
    "seo-related-tools", "seo-related",
    "cloudflare-analytics-install", "cloudflare-analytics", "refresh",
]

LANGS = ["fr", "es", "de", "ja", "pt", "hi", "ru"]
TAG_RE = re.compile(r"<script\b[^>]*>|</script>", re.IGNORECASE)

def english_path_for(translated_path, lang):
    p = lang + "/"
    if translated_path.startswith(p):
        return translated_path[len(p):]
    return None

def en_marker_needs_close_before(en_text, marker):
    """Check if EN reference has </script> immediately before <!--marker--> (flexible whitespace)."""
    tag = f"<!--{marker}-->"
    idx = en_text.find(tag)
    if idx == -1:
        return None
    before = en_text[:idx]
    # strip trailing whitespace
    stripped = before.rstrip()
    return stripped.endswith("</script>")

def insert_missing_closes(text, en_text, report, path):
    for marker in MARKERS:
        needs_close = en_marker_needs_close_before(en_text, marker)
        if not needs_close:
            continue
        tag = f"<!--{marker}-->"
        idx = text.find(tag)
        if idx == -1:
            continue
        before = text[:idx]
        stripped = before.rstrip()
        if not stripped.endswith("</script>"):
            # insert </script> right before the marker (preserving whitespace between)
            ws_len = len(before) - len(stripped)
            insert_pos = len(stripped)
            text = text[:insert_pos] + "</script>" + text[insert_pos:]
            report.append((path, marker, "inserted_missing_close"))
    return text

def remove_orphan_closes(text, report, path):
    """Remove </script> tags that appear while depth==0 (erroneous)."""
    changed = True
    while changed:
        changed = False
        tags = [(m.start(), m.end(), m.group(0)) for m in TAG_RE.finditer(text)]
        depth = 0
        for start, end, g in tags:
            is_close = g.lower().startswith("</script")
            if is_close:
                if depth == 0:
                    # orphan close - remove it
                    text = text[:start] + text[end:]
                    report.append((path, "orphan", "removed_orphan_close"))
                    changed = True
                    break
                else:
                    depth = 0
            else:
                depth = 1
    return text

def fix_file(path, lang, apply_changes, report):
    en_path = english_path_for(path, lang)
    if not en_path or not os.path.exists(en_path):
        return
    with open(en_path, encoding="utf-8") as f:
        en_text = f.read()
    with open(path, encoding="utf-8") as f:
        text = f.read()
    original = text

    text = insert_missing_closes(text, en_text, report, path)
    text = remove_orphan_closes(text, report, path)

    if text != original and apply_changes:
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)

def check_balance(path):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    o = len(re.findall(r"<script\b", text, re.IGNORECASE))
    c = len(re.findall(r"</script>", text, re.IGNORECASE))
    return o, c

def main():
    apply_changes = "--apply" in sys.argv
    report = []
    files = []
    for lang in LANGS:
        files += glob.glob(f"{lang}/**/*.html", recursive=True)
    for path in sorted(set(files)):
        fix_file(path, path.split("/")[0], apply_changes, report)

    print(f"=== {'APPLIED' if apply_changes else 'DRY RUN'} ===")
    print(f"Actions: {len(report)}")
    from collections import Counter
    c = Counter((p, a) for p, m, a in report)
    for (p, a), n in sorted(c.items()):
        print(f"  {p} : {a} x{n}")

    if apply_changes:
        print("\n=== Vérification équilibre final ===")
        bad = 0
        for lang in LANGS:
            for path in glob.glob(f"{lang}/**/*.html", recursive=True):
                o, c2 = check_balance(path)
                if o != c2:
                    print(f"  ENCORE DÉSÉQUILIBRÉ: {path} ({o}/{c2})")
                    bad += 1
        print(f"Fichiers encore déséquilibrés: {bad}")

if __name__ == "__main__":
    main()
