import os
import re

GUIDES_DIR = "guides"

# Mapping: guide filename -> (tool_url, landing_url, cta_text)
GUIDE_LINKS = {
    "how-to-remove-metadata-before-sharing.html": {
        "tool": "/tools/exif-remover",
        "landing": "/tools/landings/strip-metadata-pdf",
        "cta": "Try the EXIF Remover now →"
    },
    "how-to-compress-images-email.html": {
        "tool": "/tools/image-compressor",
        "landing": "/tools/landings/compress-image-email",
        "cta": "Compress your images now →"
    },
    "how-to-convert-heic-jpg.html": {
        "tool": "/tools/heic-converter",
        "landing": "/tools/landings/convert-heic-jpg-online",
        "cta": "Convert HEIC to JPG now →"
    },
    "how-to-verify-downloaded-file-safe.html": {
        "tool": "/tools/file-hash-checker",
        "landing": "/tools/landings/check-file-integrity-sha256",
        "cta": "Check file integrity now →"
    },
    "how-to-clean-urls-for-sharing.html": {
        "tool": "/tools/url-cleaner",
        "landing": "/tools/landings/clean-url-before-sharing",
        "cta": "Clean your URLs now →"
    }
}

def add_links_to_guide(filepath, links):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check if links already exist
    if links["tool"] in content:
        print(f"  {os.path.basename(filepath)} — links already exist")
        return False
    
    # Find the closing </main> or </article> or before footer
    insert_markers = ['</main>', '</article>', '<footer']
    
    inserted = False
    for marker in insert_markers:
        if marker in content:
            # Insert CTA section before the marker
            cta_section = f'''
<section style="margin-top:3rem;padding:1.5rem;background:var(--color-surface);border-radius:8px;">
  <h2 style="font-family:var(--font-display);font-size:1.2rem;margin-bottom:0.5rem;">Ready to try it?</h2>
  <p style="color:var(--color-muted);margin-bottom:1rem;">Use our free browser-based tool — nothing is uploaded to any server.</p>
  <a class="btn" href="{links['tool']}" style="display:inline-block;">{links['cta']}</a>
  <p style="margin-top:1rem;font-size:0.85rem;"><a href="{links['landing']}" style="color:var(--color-muted);">Learn more about this tool →</a></p>
</section>
'''
            content = content.replace(marker, cta_section + '\n' + marker)
            inserted = True
            break
    
    if not inserted:
        print(f"  ⚠️ {os.path.basename(filepath)} — no insertion point found")
        return False
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    return True

def main():
    updated = 0
    for filename, links in GUIDE_LINKS.items():
        filepath = os.path.join(GUIDES_DIR, filename)
        if not os.path.exists(filepath):
            print(f"⚠️ {filename} not found")
            continue
        
        if add_links_to_guide(filepath, links):
            print(f"✅ {filename}")
            updated += 1
    
    print(f"\nDone! Updated {updated}/{len(GUIDE_LINKS)} guides.")

if __name__ == "__main__":
    main()
