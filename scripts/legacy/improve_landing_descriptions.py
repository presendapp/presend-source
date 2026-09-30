import os
import re

LANDINGS_DIR = "tools/landings"

# Landing -> improved description
IMPROVEMENTS = {
    "remove-exif-iphone.html": "Remove GPS location, camera model and timestamps from iPhone photos without uploading to any server. 100% private, runs entirely in your browser. Free.",
    "remove-gps-from-photo.html": "Strip GPS coordinates from any photo without uploading. Protect your privacy before sharing on social media. 100% private, runs in your browser. Free.",
    "remove-gps-from-iphone-photo.html": "Remove location data from iPhone photos without uploading. Protect your privacy before sharing. 100% private, runs entirely in your browser. Free.",
    "remove-gps-from-video.html": "Strip GPS and metadata from video files without uploading. Protect your privacy before sharing. 100% private, runs in your browser. Free.",
    "remove-video-location-data.html": "Remove GPS location from videos without uploading to any server. Protect your privacy. 100% private, runs entirely in your browser. Free.",
    "strip-metadata-pdf.html": "Remove hidden author name, software and dates from PDFs without uploading. 100% private, runs entirely in your browser. Free.",
    "clean-pdf-before-email.html": "Clean PDF metadata before emailing without uploading. Remove author and tracking info. 100% private, runs in your browser. Free.",
    "pdf-metadata-remover-mac.html": "Remove PDF metadata on Mac without installing software. Runs in your browser, nothing uploaded. 100% private. Free.",
    "clean-word-document-metadata.html": "Remove hidden author and edit history from Word docs without uploading. 100% private, runs in your browser. Free.",
    "remove-author-from-word-document.html": "Strip author name from Word documents without uploading. Protect your privacy before sharing. 100% private, runs in your browser. Free.",
    "compress-pdf-for-email-attachment.html": "Compress PDFs for email without uploading to any server. Reduce file size instantly. 100% private, runs in your browser. Free.",
    "reduce-pdf-file-size.html": "Shrink PDF files without uploading. Reduce size by 30-70% for email and sharing. 100% private, runs in your browser. Free.",
    "shrink-pdf-online.html": "Shrink PDFs online without uploading — all processing happens in your browser. 100% private. Free.",
    "merge-pdf-files-online.html": "Merge PDFs without uploading to any server. Combine multiple files into one. 100% private, runs in your browser. Free.",
    "merge-pdfs-into-one-document.html": "Combine PDFs into one document without uploading. 100% private, runs entirely in your browser. Free.",
    "compress-image-email.html": "Compress images for email without uploading. Reduce file size while preserving quality. 100% private, runs in your browser. Free.",
    "resize-image-for-instagram.html": "Resize images for Instagram without uploading. Perfect 1080x1080, 1080x1350, 1080x566. 100% private, runs in your browser. Free.",
    "resize-image-for-linkedin-banner.html": "Resize images for LinkedIn banner without uploading. 1584x396 pixels. 100% private, runs in your browser. Free.",
    "image-to-base64-converter.html": "Convert images to Base64 without uploading. Embed in HTML, CSS or emails. 100% private, runs in your browser. Free.",
    "convert-heic-jpg-online.html": "Convert HEIC to JPG without uploading. iPhone photos to universal format. 100% private, runs in your browser. Free.",
    "convert-heic-to-jpg-windows.html": "Convert HEIC to JPG on Windows without software. Runs in browser, nothing uploaded. 100% private. Free.",
    "check-file-integrity-sha256.html": "Check file integrity with SHA-256 without uploading. Verify downloads safely. 100% private, runs in your browser. Free.",
    "check-sha256-download.html": "Verify downloaded files with SHA-256 without uploading. Check for corruption or tampering. 100% private, runs in your browser. Free.",
    "clean-url-before-sharing.html": "Clean URLs before sharing without uploading. Remove UTM, fbclid, gclid trackers. 100% private, runs in your browser. Free.",
    "remove-tracking-from-url.html": "Remove tracking from URLs without uploading. Strip 50+ tracking parameters. 100% private, runs in your browser. Free.",
    "generate-strong-password.html": "Generate strong passwords without sending data to servers. Cryptographically secure. 100% private, runs in your browser. Free.",
    "strong-password-generator-online.html": "Create strong passwords online without uploading. Secure random generation. 100% private, runs in your browser. Free.",
    "check-password-strength.html": "Check password strength without sending data. Entropy analysis and crack time. 100% private, runs in your browser. Free.",
    "word-counter-online.html": "Count words and characters online without uploading. Perfect for essays and social media. 100% private, runs in your browser. Free.",
    "bold-text-generator-social-media.html": "Generate bold text for social media without uploading. Unicode styles for bios and posts. 100% private, runs in your browser. Free.",
    "split-text-twitter-thread.html": "Split text for Twitter threads without uploading. Auto-count characters and add numbering. 100% private, runs in your browser. Free.",
    "compare-texts-online.html": "Compare texts online without uploading. Side-by-side diff tool. 100% private, runs in your browser. Free.",
    "compare-two-texts-diff.html": "Compare two texts with diff without uploading. Spot every change instantly. 100% private, runs in your browser. Free.",
    "json-to-csv-converter-free.html": "Convert JSON to CSV without uploading. Transform data formats instantly. 100% private, runs in your browser. Free.",
    "convert-json-to-csv-online.html": "Convert JSON to CSV online without uploading. Flatten nested structures. 100% private, runs in your browser. Free.",
    "create-qr-code-link.html": "Create QR codes from links without uploading. Static, trackable-free codes. 100% private, runs in your browser. Free.",
    "qr-code-generator-free.html": "Generate QR codes for free without uploading. Static codes that never expire. 100% private, runs in your browser. Free.",
    "clean-email-list-free.html": "Clean email lists without uploading. Remove duplicates and invalid addresses. 100% private, runs in your browser. Free.",
    "remove-duplicates-email-list.html": "Remove duplicates from email lists without uploading. Case-insensitive deduplication. 100% private, runs in your browser. Free.",
    "wcag-color-contrast-checker.html": "Check WCAG color contrast without uploading. AA and AAA accessibility ratios. 100% private, runs in your browser. Free.",
}

def improve_description(filepath, new_desc):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Find and replace meta description
    old_desc_match = re.search(r'<meta name="description" content="([^"]*)"', content)
    if not old_desc_match:
        return False
    
    old_desc = old_desc_match.group(1)
    content = content.replace(
        f'<meta name="description" content="{old_desc}"',
        f'<meta name="description" content="{new_desc}"'
    )
    
    # Also update OG and Twitter descriptions
    og_match = re.search(r'<meta property="og:description" content="([^"]*)"', content)
    if og_match:
        og_desc = og_match.group(1)
        # Use first sentence for OG
        new_og = new_desc.split('.')[0] + '.'
        content = content.replace(
            f'<meta property="og:description" content="{og_desc}"',
            f'<meta property="og:description" content="{new_og}"'
        )
    
    tw_match = re.search(r'<meta name="twitter:description" content="([^"]*)"', content)
    if tw_match:
        tw_desc = tw_match.group(1)
        new_tw = new_desc.split('.')[0] + '.'
        content = content.replace(
            f'<meta name="twitter:description" content="{tw_desc}"',
            f'<meta name="twitter:description" content="{new_tw}"'
        )
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    return True

def main():
    updated = 0
    for filename, new_desc in IMPROVEMENTS.items():
        filepath = os.path.join(LANDINGS_DIR, filename)
        if not os.path.exists(filepath):
            print(f"⚠️ {filename} not found")
            continue
        
        if improve_description(filepath, new_desc):
            print(f"✅ {filename}")
            updated += 1
        else:
            print(f"⚠️ {filename} — could not update")
    
    print(f"\nDone! Updated {updated}/{len(IMPROVEMENTS)} landings.")

if __name__ == "__main__":
    main()
