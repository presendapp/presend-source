import os

GUIDES_DIR = "guides"

GUIDE_LINKS = {
    "how-to-remove-metadata-before-sharing.html": {
        "tool": "/tools/exif-remover",
        "landing": "/tools/landings/strip-metadata-pdf",
        "cta": "Try the EXIF Remover now →",
        "text": "Remove hidden metadata from your photos and documents"
    },
    "how-to-compress-images-email.html": {
        "tool": "/tools/image-compressor",
        "landing": "/tools/landings/compress-image-email",
        "cta": "Compress your images now →",
        "text": "Shrink images for email without losing quality"
    },
    "how-to-convert-heic-jpg.html": {
        "tool": "/tools/heic-converter",
        "landing": "/tools/landings/convert-heic-jpg-online",
        "cta": "Convert HEIC to JPG now →",
        "text": "Convert iPhone HEIC photos to universal JPG"
    },
    "how-to-verify-downloaded-file-safe.html": {
        "tool": "/tools/file-hash-checker",
        "landing": "/tools/landings/check-file-integrity-sha256",
        "cta": "Check file integrity now →",
        "text": "Verify downloaded files with SHA-256 checksums"
    },
    "how-to-clean-urls-for-sharing.html": {
        "tool": "/tools/url-cleaner",
        "landing": "/tools/landings/clean-url-before-sharing",
        "cta": "Clean your URLs now →",
        "text": "Remove tracking parameters from links before sharing"
    }
}

def add_links_to_guide(filepath, links):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check if tool link already exists
    if links["tool"] in content:
        print(f"  {os.path.basename(filepath)} — tool link already exists")
        return False
    
    # Find </main> and insert before it
    if '</main>' not in content:
        print(f"  ⚠️ {os.path.basename(filepath)} — no </main> found")
        return False
    
    cta_section = f'''<section style="margin-top:3rem;padding:1.5rem;background:var(--color-surface);border-radius:8px;">
  <h2 style="font-family:var(--font-display);font-size:1.2rem;margin-bottom:0.5rem;">Ready to try it?</h2>
  <p style="color:var(--color-muted);margin-bottom:1rem;">{links['text']} — use our free browser-based tool. Nothing is uploaded to any server.</p>
  <a class="btn" href="{links['tool']}" style="display:inline-block;">{links['cta']}</a>
  <p style="margin-top:1rem;font-size:0.85rem;"><a href="{links['landing']}" style="color:var(--color-muted);">Learn more about this tool →</a></p>
</section>
'''
    
    content = content.replace('</main>', cta_section + '\n</main>')
    
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
