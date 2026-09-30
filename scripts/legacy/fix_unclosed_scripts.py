#!/usr/bin/env python3
import re, sys, glob

TAG_RE = re.compile(r"<script\b[^>]*>|</script>", re.IGNORECASE)

def fix_file(path, apply_changes, report):
    with open(path, encoding="utf-8") as f:
        text = f.read()

    tags = [(m.start(), m.end(), m.group(0).lower().startswith("</script"))
            for m in TAG_RE.finditer(text)]

    inserts = []  # positions where we need to insert "</script>"
    depth = 0
    for start, end, is_close in tags:
        if is_close:
            if depth == 1:
                depth = 0
            # else: stray close, ignore
        else:
            if depth == 1:
                # missing close before this new open tag
                inserts.append(start)
                report.append((path, start))
            depth = 1

    if not inserts:
        return

    if apply_changes:
        # insert from the end so positions stay valid
        for pos in sorted(inserts, reverse=True):
            text = text[:pos] + "</script>" + text[pos:]
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)

def main():
    apply_changes = "--apply" in sys.argv
    report = []
    files = glob.glob("de/**/*.html", recursive=True) + \
            glob.glob("es/**/*.html", recursive=True) + \
            glob.glob("ja/**/*.html", recursive=True) + \
            glob.glob("pt/**/*.html", recursive=True) + \
            glob.glob("ru/**/*.html", recursive=True) + \
            glob.glob("hi/**/*.html", recursive=True) + \
            glob.glob("fr/**/*.html", recursive=True) + \
            glob.glob("*.html") + \
            glob.glob("tools/*.html") + \
            glob.glob("guides/*.html")
    for path in sorted(set(files)):
        fix_file(path, apply_changes, report)

    print(f"=== {'APPLIED' if apply_changes else 'DRY RUN'} ===")
    print(f"Insertions nécessaires: {len(report)}")
    from collections import Counter
    c = Counter(p for p, _ in report)
    for p, n in c.items():
        print(f"  {p} : {n} insertion(s)")

if __name__ == "__main__":
    main()
