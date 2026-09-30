import os
import re

TOOLS_DIR = "tools"

# Mapping: filename -> (new_title, new_description)
IMPROVEMENTS = {
    "exif-remover.html": {
        "title": "Remove EXIF Data from Photos — Free Online, No Upload | Presend",
        "description": "Remove hidden EXIF data (GPS location, camera model, timestamps) from photos without uploading. 100% private, runs entirely in your browser. Free."
    },
    "pdf-compress.html": {
        "title": "Compress PDF Without Uploading — Free Online | Presend",
        "description": "Shrink PDF files without uploading to any server. Reduce file size for email attachments. 100% private, runs entirely in your browser. Free."
    },
    "pdf-metadata-remover.html": {
        "title": "Remove PDF Metadata Without Uploading — Free Online | Presend",
        "description": "Strip hidden author name, creation dates and metadata from PDFs without uploading. 100% private, runs entirely in your browser. Free."
    },
    "pdf-merger.html": {
        "title": "Merge PDFs Without Uploading — Free Online | Presend",
        "description": "Combine multiple PDF files into one without uploading to any server. 100% private, runs entirely in your browser. Free."
    },
    "image-compressor.html": {
        "title": "Compress Images Without Uploading — Free Online | Presend",
        "description": "Shrink JPG, PNG and WebP photos without uploading to any server. Live preview, adjustable compression. 100% private, runs in your browser. Free."
    },
    "image-resizer.html": {
        "title": "Resize Images Without Uploading — Free Online | Presend",
        "description": "Resize photos to exact dimensions without uploading to any server. Perfect for social media, forms and printing. 100% private, runs in your browser. Free."
    },
    "heic-converter.html": {
        "title": "Convert HEIC to JPG Without Uploading — Free Online | Presend",
        "description": "Convert iPhone HEIC photos to JPG without uploading to any server. Compatible with Windows and Android. 100% private, runs in your browser. Free."
    },
    "video-metadata-remover.html": {
        "title": "Remove Video Metadata Without Uploading — Free Online | Presend",
        "description": "Strip hidden GPS location and device data from MP4/MOV videos without uploading. 100% private, runs entirely in your browser. Free."
    },
    "office-metadata-remover.html": {
        "title": "Remove Word Metadata Without Uploading — Free Online | Presend",
        "description": "Remove hidden author, company and editing history from Word, Excel and PowerPoint files without uploading. 100% private, runs in your browser. Free."
    },
    "password-generator.html": {
        "title": "Generate Strong Passwords Without Sending Data — Free | Presend",
        "description": "Create cryptographically secure passwords without sending any data to servers. Adjustable length and character sets. 100% private, runs in your browser. Free."
    },
    "password-strength.html": {
        "title": "Check Password Strength Without Sending Data — Free | Presend",
        "description": "Test how strong your password is without sending it to any server. Entropy estimation and crack time analysis. 100% private, runs in your browser. Free."
    },
    "url-cleaner.html": {
        "title": "Clean URLs Without Uploading — Remove Trackers Free | Presend",
        "description": "Strip tracking parameters from URLs without uploading anything. Remove UTM, fbclid, gclid and 50+ trackers. 100% private, runs in your browser. Free."
    },
    "file-hash-checker.html": {
        "title": "Check File Hash Without Uploading — SHA256 Free | Presend",
        "description": "Calculate SHA-256, SHA-1 and SHA-512 checksums without uploading files. Verify file integrity locally. 100% private, runs in your browser. Free."
    },
    "qr-code-generator.html": {
        "title": "Create QR Codes Without Sending Data — Free Online | Presend",
        "description": "Generate scannable QR codes from text, URLs and WiFi passwords without sending data to servers. 100% private, runs entirely in your browser. Free."
    },
    "text-diff.html": {
        "title": "Compare Texts Without Uploading — Diff Tool Free | Presend",
        "description": "Compare two versions of text side-by-side without uploading. Spot every addition, deletion and change. 100% private, runs in your browser. Free."
    },
    "email-list-cleaner.html": {
        "title": "Clean Email Lists Without Uploading — Free Online | Presend",
        "description": "Deduplicate and validate email lists without uploading to any server. Perfect before sending campaigns. 100% private, runs in your browser. Free."
    },
    "json-csv-converter.html": {
        "title": "Convert JSON to CSV Without Uploading — Free Online | Presend",
        "description": "Transform JSON to CSV and vice versa without uploading data. Paste your data, get the result instantly. 100% private, runs in your browser. Free."
    },
    "image-to-base64.html": {
        "title": "Image to Base64 Converter — No Upload, Free Online | Presend",
        "description": "Convert images to Base64 data URIs without uploading. Embed in CSS, HTML or emails. 100% private, runs entirely in your browser. Free."
    },
    "word-counter.html": {
        "title": "Word Counter — No Upload, Free Online | Presend",
        "description": "Count words, characters, sentences and paragraphs in real time without uploading. Perfect for essays, tweets and meta descriptions. 100% private, runs in your browser. Free."
    },
    "color-contrast.html": {
        "title": "WCAG Color Contrast Checker — No Upload, Free | Presend",
        "description": "Check if your colors meet WCAG 2.1 accessibility standards without uploading anything. AA, AAA ratios for normal and large text. Runs in your browser. Free."
    },
    "text-formatter.html": {
        "title": "Text Formatter for Social Media — No Upload, Free | Presend",
        "description": "Convert text to bold, italic, monospace and Unicode styles for social media without uploading. Nothing leaves your device. Runs in your browser. Free."
    },
    "thread-splitter.html": {
        "title": "Split Text for Twitter Threads — No Upload, Free | Presend",
        "description": "Break long articles into Twitter/X or LinkedIn threads without uploading. Auto-counts characters and adds numbering. 100% private, runs in your browser. Free."
    }
}

def process_file(filepath, improvements):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Update title
    old_title = re.search(r'<title>(.*?)</title>', content)
    if old_title and improvements.get("title"):
        content = content.replace(
            f'<title>{old_title.group(1)}</title>',
            f'<title>{improvements["title"]}</title>'
        )
        title_updated = True
    else:
        title_updated = False
    
    # Update meta description
    old_desc = re.search(r'<meta name="description" content="(.*?)"', content)
    if old_desc and improvements.get("description"):
        content = content.replace(
            f'<meta name="description" content="{old_desc.group(1)}"',
            f'<meta name="description" content="{improvements["description"]}"'
        )
        desc_updated = True
    else:
        desc_updated = False
    
    # Update OG description too
    old_og_desc = re.search(r'<meta property="og:description" content="(.*?)"', content)
    if old_og_desc and improvements.get("description"):
        # Use first sentence of description for OG
        og_desc = improvements["description"].split('.')[0] + '.'
        content = content.replace(
            f'<meta property="og:description" content="{old_og_desc.group(1)}"',
            f'<meta property="og:description" content="{og_desc}"'
        )
    
    # Update Twitter description too
    old_tw_desc = re.search(r'<meta name="twitter:description" content="(.*?)"', content)
    if old_tw_desc and improvements.get("description"):
        tw_desc = improvements["description"].split('.')[0] + '.'
        content = content.replace(
            f'<meta name="twitter:description" content="{old_tw_desc.group(1)}"',
            f'<meta name="twitter:description" content="{tw_desc}"'
        )
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    return title_updated, desc_updated

def main():
    updated = 0
    for filename, improvements in IMPROVEMENTS.items():
        filepath = os.path.join(TOOLS_DIR, filename)
        if not os.path.exists(filepath):
            print(f"⚠️ {filename} not found")
            continue
        
        title_ok, desc_ok = process_file(filepath, improvements)
        if title_ok and desc_ok:
            print(f"✅ {filename}")
            updated += 1
        else:
            print(f"⚠️ {filename} — title={title_ok}, desc={desc_ok}")
    
    print(f"\nDone! Updated {updated}/{len(IMPROVEMENTS)} files.")

if __name__ == "__main__":
    main()
