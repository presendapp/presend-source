import os
import re
import json

LANDINGS_DIR = "tools/landings"

TOOL_INFO = {
    "remove-exif-iphone": {
        "name": "Remove EXIF Data from iPhone Photos",
        "featureList": "Remove EXIF metadata from iPhone photos locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "Can someone track my location from an iPhone photo?", "a": "Yes. iPhone photos embed GPS coordinates in EXIF metadata. Anyone with access to the original file can extract your exact location, home address, and daily routines."},
            {"q": "Does this tool upload my photos to a server?", "a": "No. Your photos are processed entirely inside your browser using JavaScript. Nothing is ever sent to any server, cloud, or third party."},
            {"q": "What EXIF data does this remove from iPhone photos?", "a": "It removes GPS coordinates, camera model, iOS version, lens information, timestamps, and editing history — everything except the actual image."},
            {"q": "Will removing EXIF data reduce photo quality?", "a": "No. The visual image remains identical. Only the hidden metadata is stripped, leaving the photo quality completely unchanged."}
        ]
    },
    "remove-gps-from-photo": {
        "name": "Remove GPS from Photos",
        "featureList": "Remove GPS coordinates from photos locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "How do I remove GPS location from a photo?", "a": "Upload your photo to our tool, click 'Remove EXIF', and download the clean version. All processing happens in your browser — no server involved."},
            {"q": "Can someone find my address from a photo I shared?", "a": "Yes, if the original file still contains EXIF GPS data. Social platforms sometimes strip it, but email and messaging apps usually do not."},
            {"q": "Is this tool free?", "a": "Yes, completely free. No account, no limits, no watermarks."}
        ]
    },
    "remove-gps-from-iphone-photo": {
        "name": "Remove GPS from iPhone Photos",
        "featureList": "Remove GPS coordinates from iPhone photos locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "How do I remove location data from iPhone photos?", "a": "Use our browser-based tool: upload the photo, click 'Remove EXIF', and download the clean version. Nothing is uploaded to any server."},
            {"q": "Does iPhone always save GPS in photos?", "a": "Yes, if Location Services for Camera is enabled. This is the default setting on most iPhones."}
        ]
    },
    "remove-gps-from-video": {
        "name": "Remove GPS from Video",
        "featureList": "Remove GPS and metadata from videos locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "Do videos contain GPS data?", "a": "Yes, many smartphones embed GPS coordinates, timestamps, and device information in video metadata."},
            {"q": "Is it safe to remove video metadata?", "a": "Yes. Removing metadata does not affect video quality. Only the hidden tracking information is stripped."}
        ]
    },
    "remove-video-location-data": {
        "name": "Remove Video Location Data",
        "featureList": "Remove location data from videos locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "Can videos reveal my location?", "a": "Yes. Many video formats store GPS coordinates, timestamps, and device information in their metadata."}
        ]
    },
    "strip-metadata-pdf": {
        "name": "Strip Metadata from PDF",
        "featureList": "Strip metadata from PDFs locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "What metadata is hidden in PDFs?", "a": "PDFs can contain author name, creation date, modification history, software used, and sometimes even comments or hidden text."},
            {"q": "Is it safe to remove PDF metadata?", "a": "Yes. Removing metadata does not affect the visible content of the PDF. Only the hidden properties are stripped."}
        ]
    },
    "clean-pdf-before-email": {
        "name": "Clean PDF Before Email",
        "featureList": "Clean PDF metadata before emailing. No upload, no server, 100% private.",
        "faq": [
            {"q": "Why clean a PDF before emailing?", "a": "PDFs can contain your name, company, software used, and edit history. Cleaning removes this sensitive information before sharing."}
        ]
    },
    "pdf-metadata-remover-mac": {
        "name": "PDF Metadata Remover for Mac",
        "featureList": "Remove PDF metadata on Mac locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "Do I need to install software on Mac?", "a": "No. Our tool runs entirely in your browser. No download, no installation, no admin rights needed."}
        ]
    },
    "clean-word-document-metadata": {
        "name": "Clean Word Document Metadata",
        "featureList": "Clean Word document metadata locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "What metadata is in Word documents?", "a": "Word files can contain author name, company, creation date, edit history, comments, and tracked changes."}
        ]
    },
    "remove-author-from-word-document": {
        "name": "Remove Author from Word Document",
        "featureList": "Remove author from Word docs locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "How do I remove my name from a Word document?", "a": "Upload the document to our tool, click 'Clean Metadata', and download the sanitized version. Your name and personal info are permanently removed."}
        ]
    },
    "compress-pdf-for-email-attachment": {
        "name": "Compress PDF for Email Attachment",
        "featureList": "Compress PDFs for email locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "What size PDF can I email?", "a": "Most email providers limit attachments to 10-25MB. Our tool compresses PDFs to fit within these limits."},
            {"q": "Does compression reduce PDF quality?", "a": "Our tool optimizes images within the PDF while preserving text quality. The result is a smaller file with minimal visual loss."}
        ]
    },
    "reduce-pdf-file-size": {
        "name": "Reduce PDF File Size",
        "featureList": "Reduce PDF file size locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "How much can I compress a PDF?", "a": "Typically 30-70% depending on image content. Text-heavy PDFs compress more than image-heavy ones."}
        ]
    },
    "shrink-pdf-online": {
        "name": "Shrink PDF Online",
        "featureList": "Shrink PDFs locally in browser. No upload, no server, 100% private.",
        "faq": [
            {"q": "Is this really online if nothing is uploaded?", "a": "The tool loads in your browser from our website, but all processing happens on your device. Your file never leaves your computer."}
        ]
    },
    "merge-pdf-files-online": {
        "name": "Merge PDF Files Online",
        "featureList": "Merge PDFs locally in browser. No upload, no server, 100% private.",
        "faq": [
            {"q": "Can I merge PDFs without uploading?", "a": "Yes. Our tool uses client-side JavaScript to merge PDFs entirely in your browser. Your files are never sent to any server."}
        ]
    },
    "merge-pdfs-into-one-document": {
        "name": "Merge PDFs into One Document",
        "featureList": "Merge PDFs into one document locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "Is there a limit to how many PDFs I can merge?", "a": "No hard limit, but very large files may slow down your browser since all processing happens locally on your device."}
        ]
    },
    "compress-image-email": {
        "name": "Compress Image for Email",
        "featureList": "Compress images for email locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "What image size is best for email?", "a": "Keep images under 1MB each for fast sending. Our tool lets you choose the compression level to balance quality and size."}
        ]
    },
    "resize-image-for-instagram": {
        "name": "Resize Image for Instagram",
        "featureList": "Resize images for Instagram locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "What size should Instagram photos be?", "a": "Instagram recommends 1080x1080px for square posts, 1080x1350px for portraits, and 1080x566px for landscapes."}
        ]
    },
    "resize-image-for-linkedin-banner": {
        "name": "Resize Image for LinkedIn Banner",
        "featureList": "Resize images for LinkedIn banner locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "What size is a LinkedIn banner?", "a": "LinkedIn recommends 1584x396 pixels for profile banners and 1128x191 for company page banners."}
        ]
    },
    "image-to-base64-converter": {
        "name": "Image to Base64 Converter",
        "featureList": "Convert images to Base64 locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "What is Base64 encoding for images?", "a": "Base64 converts binary image data into a text string that can be embedded directly in HTML, CSS, or JSON without needing a separate image file."}
        ]
    },
    "convert-heic-jpg-online": {
        "name": "Convert HEIC to JPG Online",
        "featureList": "Convert HEIC to JPG locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "What is HEIC format?", "a": "HEIC (High Efficiency Image Container) is Apple's default photo format. It offers better compression than JPG but isn't supported by all platforms."},
            {"q": "Will conversion reduce image quality?", "a": "Our tool preserves the original image quality during conversion. The output JPG will look identical to the original HEIC."}
        ]
    },
    "convert-heic-to-jpg-windows": {
        "name": "Convert HEIC to JPG on Windows",
        "featureList": "Convert HEIC to JPG on Windows locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "Can Windows open HEIC files?", "a": "Windows 10 and 11 can open HEIC files with the HEIF Image Extensions from the Microsoft Store. Our tool converts them to universally supported JPG."}
        ]
    },
    "check-file-integrity-sha256": {
        "name": "Check File Integrity with SHA256",
        "featureList": "Check file integrity with SHA256 locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "What is a SHA256 checksum?", "a": "SHA256 is a cryptographic hash function that generates a unique fingerprint for a file. If the file changes even by one byte, the hash changes completely."}
        ]
    },
    "check-sha256-download": {
        "name": "Check SHA256 of Downloaded File",
        "featureList": "Verify downloaded files with SHA256 locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "Why verify a downloaded file?", "a": "Verification ensures the file wasn't corrupted during download or tampered with by a malicious actor. It matches the file against the publisher's official hash."}
        ]
    },
    "clean-url-before-sharing": {
        "name": "Clean URL Before Sharing",
        "featureList": "Clean URLs before sharing locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "What are tracking parameters in URLs?", "a": "Parameters like utm_source, fbclid, and gclid tell websites where you came from. They can be used to track you across the internet."}
        ]
    },
    "remove-tracking-from-url": {
        "name": "Remove Tracking from URL",
        "featureList": "Remove tracking from URLs locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "Does removing tracking parameters break the link?", "a": "No. The core URL remains functional. Only the tracking parameters are removed, so the destination page loads normally."}
        ]
    },
    "generate-strong-password": {
        "name": "Generate Strong Password",
        "featureList": "Generate strong passwords locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "Are these passwords truly random?", "a": "Yes. We use the browser's cryptographically secure random number generator (crypto.getRandomValues) to ensure unpredictability."}
        ]
    },
    "strong-password-generator-online": {
        "name": "Strong Password Generator Online",
        "featureList": "Generate strong passwords online locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "Is an online password generator safe?", "a": "Ours is safe because all generation happens in your browser. The password is never sent to any server, not even ours."}
        ]
    },
    "check-password-strength": {
        "name": "Check Password Strength",
        "featureList": "Check password strength locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "Is it safe to type my password here?", "a": "Yes. Your password is checked entirely in your browser using JavaScript. It is never sent to any server or stored anywhere."}
        ]
    },
    "word-counter-online": {
        "name": "Word Counter Online",
        "featureList": "Count words online locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "Does this store my text?", "a": "No. All counting happens in your browser. Your text is never uploaded, stored, or transmitted anywhere."}
        ]
    },
    "bold-text-generator-social-media": {
        "name": "Bold Text Generator for Social Media",
        "featureList": "Generate bold text for social media locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "Will bold text work everywhere?", "a": "Unicode bold text works on most platforms including Twitter, Instagram, Facebook, and WhatsApp. Some platforms may not support all Unicode characters."}
        ]
    },
    "split-text-twitter-thread": {
        "name": "Split Text for Twitter Thread",
        "featureList": "Split text for Twitter threads locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "What is the Twitter character limit?", "a": "Twitter allows 280 characters per tweet. Our tool splits your text at logical points to create readable threads."}
        ]
    },
    "compare-texts-online": {
        "name": "Compare Texts Online",
        "featureList": "Compare texts online locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "Can I compare large documents?", "a": "Yes, but very large texts may slow down your browser since all processing happens locally on your device."}
        ]
    },
    "compare-two-texts-diff": {
        "name": "Compare Two Texts — Diff",
        "featureList": "Compare two texts with diff locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "What is a diff?", "a": "A diff (difference) shows exactly what changed between two versions of text — additions, deletions, and modifications — highlighted for easy reading."}
        ]
    },
    "json-to-csv-converter-free": {
        "name": "JSON to CSV Converter Free",
        "featureList": "Convert JSON to CSV locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "What is JSON?", "a": "JSON (JavaScript Object Notation) is a lightweight data format used for APIs and configuration files. CSV is a simpler format compatible with Excel and Google Sheets."}
        ]
    },
    "convert-json-to-csv-online": {
        "name": "Convert JSON to CSV Online",
        "featureList": "Convert JSON to CSV online locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "Will nested JSON work?", "a": "Our tool flattens nested JSON structures. Complex nested objects are converted into dot-notation columns for easy CSV import."}
        ]
    },
    "create-qr-code-link": {
        "name": "Create QR Code from Link",
        "featureList": "Create QR codes from links locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "Are QR codes generated here trackable?", "a": "No. Our QR codes are static and contain only the URL you provide. There is no tracking, analytics, or third-party service involved."}
        ]
    },
    "qr-code-generator-free": {
        "name": "Free QR Code Generator",
        "featureList": "Generate QR codes for free locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "Do generated QR codes expire?", "a": "No. Static QR codes never expire. They contain the raw data you entered and work as long as the URL or text remains valid."}
        ]
    },
    "clean-email-list-free": {
        "name": "Clean Email List Free",
        "featureList": "Clean email lists locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "Is my email list uploaded anywhere?", "a": "No. Your email list is processed entirely in your browser. It is never sent to any server, API, or third party."}
        ]
    },
    "remove-duplicates-email-list": {
        "name": "Remove Duplicates from Email List",
        "featureList": "Remove duplicates from email lists locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "How does it detect duplicates?", "a": "It compares email addresses case-insensitively. 'John@Example.com' and 'john@example.com' are treated as the same address."}
        ]
    },
    "wcag-color-contrast-checker": {
        "name": "WCAG Color Contrast Checker",
        "featureList": "Check WCAG color contrast locally. No upload, no server, 100% private.",
        "faq": [
            {"q": "What is WCAG?", "a": "WCAG (Web Content Accessibility Guidelines) defines standards for making web content accessible to people with disabilities, including color contrast requirements."}
        ]
    }
}

DEFAULT_INFO = {
    "name": "Presend Tool",
    "featureList": "Process files locally in your browser. No upload, no server, 100% private.",
    "faq": [
        {"q": "Is this tool free?", "a": "Yes, completely free. No account, no limits, no watermarks."},
        {"q": "Does this tool upload my files?", "a": "No. All processing happens entirely inside your browser using JavaScript. Your files are never sent to any server."}
    ]
}

def get_landing_key(filename):
    return filename.replace('.html', '')

def get_tool_url(landing_key):
    mappings = {
        "remove-exif-iphone": "exif-remover",
        "remove-gps-from-photo": "exif-remover",
        "remove-gps-from-iphone-photo": "exif-remover",
        "remove-gps-from-video": "video-metadata-remover",
        "remove-video-location-data": "video-metadata-remover",
        "strip-metadata-pdf": "pdf-metadata-remover",
        "clean-pdf-before-email": "pdf-metadata-remover",
        "pdf-metadata-remover-mac": "pdf-metadata-remover",
        "clean-word-document-metadata": "office-metadata-remover",
        "remove-author-from-word-document": "office-metadata-remover",
        "compress-pdf-for-email-attachment": "pdf-compress",
        "reduce-pdf-file-size": "pdf-compress",
        "shrink-pdf-online": "pdf-compress",
        "merge-pdf-files-online": "pdf-merger",
        "merge-pdfs-into-one-document": "pdf-merger",
        "compress-image-email": "image-compressor",
        "resize-image-for-instagram": "image-resizer",
        "resize-image-for-linkedin-banner": "image-resizer",
        "image-to-base64-converter": "image-to-base64",
        "convert-heic-jpg-online": "heic-converter",
        "convert-heic-to-jpg-windows": "heic-converter",
        "check-file-integrity-sha256": "file-hash-checker",
        "check-sha256-download": "file-hash-checker",
        "clean-url-before-sharing": "url-cleaner",
        "remove-tracking-from-url": "url-cleaner",
        "generate-strong-password": "password-generator",
        "strong-password-generator-online": "password-generator",
        "check-password-strength": "password-strength",
        "word-counter-online": "word-counter",
        "bold-text-generator-social-media": "text-formatter",
        "split-text-twitter-thread": "thread-splitter",
        "compare-texts-online": "text-diff",
        "compare-two-texts-diff": "text-diff",
        "json-to-csv-converter-free": "json-csv-converter",
        "convert-json-to-csv-online": "json-csv-converter",
        "create-qr-code-link": "qr-code-generator",
        "qr-code-generator-free": "qr-code-generator",
        "clean-email-list-free": "email-list-cleaner",
        "remove-duplicates-email-list": "email-list-cleaner",
        "wcag-color-contrast-checker": "color-contrast",
    }
    return mappings.get(landing_key, "")

def build_software_app_schema(info, landing_url, tool_url):
    schema = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": info["name"],
        "applicationCategory": "UtilitiesApplication",
        "operatingSystem": "Any",
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "USD"
        },
        "featureList": info["featureList"],
        "url": landing_url,
        "mainEntityOfPage": landing_url
    }
    if tool_url:
        schema["isRelatedTo"] = {
            "@type": "SoftwareApplication",
            "name": "Presend",
            "url": "https://presend.pages.dev/"
        }
    return schema

def build_faq_schema(info):
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": faq["q"],
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": faq["a"]
                }
            }
            for faq in info["faq"]
        ]
    }

def build_breadcrumb(landing_url, landing_name):
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://presend.pages.dev/"},
            {"@type": "ListItem", "position": 2, "name": "Tools", "item": "https://presend.pages.dev/tools/"},
            {"@type": "ListItem", "position": 3, "name": landing_name, "item": landing_url}
        ]
    }

def process_landing(filepath):
    filename = os.path.basename(filepath)
    landing_key = get_landing_key(filename)
    info = TOOL_INFO.get(landing_key, DEFAULT_INFO)
    
    landing_url = f"https://presend.pages.dev/tools/landings/{landing_key}"
    tool_url = get_tool_url(landing_key)
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Build new schemas
    new_schemas = []
    new_schemas.append(json.dumps(build_software_app_schema(info, landing_url, tool_url), indent=2, ensure_ascii=False))
    new_schemas.append(json.dumps(build_breadcrumb(landing_url, info["name"]), indent=2, ensure_ascii=False))
    new_schemas.append(json.dumps(build_faq_schema(info), indent=2, ensure_ascii=False))
    
    schema_block = "\n".join([
        f'<script type="application/ld+json">\n{s}\n</script>'
        for s in new_schemas
    ])
    
    # CHIRURGICAL APPROACH:
    # 1. Find the existing BreadcrumbList schema and replace ONLY its content
    # 2. Insert SoftwareApplication and FAQPage AFTER the last existing ld+json script
    
    # Step 1: Replace the incomplete BreadcrumbList (1 item) with complete one (3 items)
    # The existing one has: "position": 1, "name": "Home"
    old_breadcrumb_pattern = r'(<script type="application/ld\+json">\s*\{\s*"@context":\s*"https://schema\.org",\s*"@type":\s*"BreadcrumbList",\s*"itemListElement":\s*\[\s*\{\s*"@type":\s*"ListItem",\s*"position":\s*1,\s*"name":\s*"Home",\s*"item":\s*"https://presend\.pages\.dev/"\s*\}\s*\]\s*\}\s*</script>)'
    
    new_breadcrumb_json = json.dumps(build_breadcrumb(landing_url, info["name"]), indent=2, ensure_ascii=False)
    new_breadcrumb_block = f'<script type="application/ld+json">\n{new_breadcrumb_json}\n</script>'
    
    content_new, count = re.subn(old_breadcrumb_pattern, new_breadcrumb_block, content, flags=re.DOTALL)
    if count > 0:
        content = content_new
        breadcrumb_replaced = True
    else:
        breadcrumb_replaced = False
    
    # Step 2: Find the last ld+json script in <head> and insert after it
    # Find all ld+json scripts in head
    head_match = re.search(r'(<head>.*?</head>)', content, re.DOTALL)
    if head_match:
        head_content = head_match.group(1)
        # Find last </script> that is preceded by ld+json
        last_script_match = None
        for m in re.finditer(r'<script type="application/ld\+json">.*?</script>', head_content, re.DOTALL):
            last_script_match = m
        
        if last_script_match:
            # Insert new schemas after the last script
            insert_pos = head_match.start() + last_script_match.end()
            content = content[:insert_pos] + "\n" + schema_block + content[insert_pos:]
            inserted = True
        else:
            # No existing scripts, insert before </head>
            content = content.replace('</head>', schema_block + '\n</head>')
            inserted = True
    else:
        inserted = False
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    status = "✓" if (breadcrumb_replaced and inserted) else "⚠"
    print(f"{status} {filename} — breadcrumb={'replaced' if breadcrumb_replaced else 'NOT FOUND'}, inserted={'yes' if inserted else 'no'}")

def main():
    landings = [f for f in os.listdir(LANDINGS_DIR) if f.endswith('.html')]
    print(f"Processing {len(landings)} landing pages...\n")
    
    for landing in sorted(landings):
        filepath = os.path.join(LANDINGS_DIR, landing)
        try:
            process_landing(filepath)
        except Exception as e:
            print(f"✗ {landing} — ERROR: {e}")
            import traceback
            traceback.print_exc()
    
    print(f"\nDone!")

if __name__ == "__main__":
    main()
