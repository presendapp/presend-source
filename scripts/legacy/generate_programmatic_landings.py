#!/usr/bin/env python3
"""
Génère des landing pages programmatiques pour la longue traîne SEO.
Chaque landing cible une requête spécifique de haute intention.
"""
import os
import json
from pathlib import Path

LANDINGS_DIR = Path("tools/landings")
OUTPUT_DIR = Path("tools/landings")

def build_schemas(title, description, slug, related_tools, faq_items):
    """Build all JSON-LD schemas for a landing page"""
    
    # Organization schema
    org_schema = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Presend",
        "url": "https://presend.pages.dev/",
        "logo": "https://presend.pages.dev/og-image.png",
        "description": "Free browser-based tools to clean, compress, convert and check your files before you share them. Nothing is ever uploaded."
    }
    
    # SoftwareApplication schema
    sw_schema = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": title.split("—")[0].strip(),
        "applicationCategory": "UtilitiesApplication",
        "operatingSystem": "Any",
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "USD"
        },
        "featureList": description,
        "url": f"https://presend.pages.dev/tools/landings/{slug}",
        "mainEntityOfPage": f"https://presend.pages.dev/tools/landings/{slug}"
    }
    
    # BreadcrumbList schema
    bc_schema = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": 1,
                "name": "Home",
                "item": "https://presend.pages.dev/"
            },
            {
                "@type": "ListItem",
                "position": 2,
                "name": "Tools",
                "item": "https://presend.pages.dev/tools/"
            },
            {
                "@type": "ListItem",
                "position": 3,
                "name": title.split("—")[0].strip(),
                "item": f"https://presend.pages.dev/tools/landings/{slug}"
            }
        ]
    }
    
    # FAQPage schema
    faq_schema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": item["q"],
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": item["a"]
                }
            }
            for item in faq_items
        ]
    }
    
    schemas = "\n".join([
        f'<script type="application/ld+json">\n{json.dumps(org_schema, indent=2, ensure_ascii=False)}\n</script>',
        f'<script type="application/ld+json">\n{json.dumps(sw_schema, indent=2, ensure_ascii=False)}\n</script>',
        f'<script type="application/ld+json">\n{json.dumps(bc_schema, indent=2, ensure_ascii=False)}\n</script>',
        f'<script type="application/ld+json">\n{json.dumps(faq_schema, indent=2, ensure_ascii=False)}\n</script>'
    ])
    
    return schemas

def get_template(title, description, h1, lede, how_it_works, steps, supported_formats, 
                 safety_text, tool_url, tool_name, related_tools, faq_items, keywords, slug):
    
    schemas = build_schemas(title, description, slug, related_tools, faq_items)
    
    # Build related tools HTML
    related_html = "\n".join([
        f'    <a class="tool-card" href="{t["url"]}"><div><h3>{t["name"]}</h3><p>{t["desc"]}</p></div><span class="go">Open →</span></a>'
        for t in related_tools
    ])
    
    # Build FAQ HTML
    faq_html = "\n".join([
        f'<h2>{item["q"]}</h2>\n<p>{item["a"]}</p>'
        for item in faq_items
    ])
    
    # Build steps HTML
    steps_html = "\n".join([
        f'<li>{step}</li>'
        for step in steps
    ])
    
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<meta name="robots" content="index, follow">
<meta name="description" content="{description}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:type" content="website">
<meta property="og:url" content="https://presend.pages.dev/tools/landings/{slug}">
<meta property="og:image" content="https://presend.pages.dev/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{description}">
<meta name="twitter:image" content="https://presend.pages.dev/og-image.png">
<link rel="canonical" href="https://presend.pages.dev/tools/landings/{slug}" />
<link href="../../style.min.css" rel="preload" as="style"/>
<link href="../../style.min.css" rel="stylesheet" fetchpriority="high"/>
{schemas}
<link rel="manifest" href="/manifest.json">
<meta property="og:locale" content="en_US" />
<meta name="keywords" content="{keywords}" />
</head>
<body class="tool-page">
<header class="site-header wrap">
  <a class="brand" href="/"><span class="brand-mark">●</span> Presend</a>
  <a class="nav-link" href="/">All tools</a>
</header>
<main class="wrap">
  <a class="tool-back" href="/">← Back</a>
  <h1>{h1}</h1>
  <p class="lede">{lede}</p>
  <span class="trust-badge">Your files are never sent to our servers</span>
  <div style="margin-top:2rem; text-align:center;">
    <a class="btn" href="{tool_url}" style="font-size:1.1rem; padding:0.8em 1.6em;">{tool_name} →</a>
  </div>
  
  <h2 style="font-family:var(--font-display); font-size:1.2rem; margin-top:3rem;">How it works</h2>
  <p style="color:var(--color-muted); max-width:60ch;">{how_it_works}</p>
  
  <h2 style="font-family:var(--font-display); font-size:1.2rem; margin-top:2rem;">Step-by-step</h2>
  <ol style="color:var(--color-muted); max-width:60ch;">
{steps_html}
  </ol>
  
  <h2 style="font-family:var(--font-display); font-size:1.2rem; margin-top:2rem;">Supported formats</h2>
  <p style="color:var(--color-muted); max-width:60ch;">{supported_formats}</p>
  
  <h2 style="font-family:var(--font-display); font-size:1.2rem; margin-top:2rem;">Is it safe?</h2>
  <p style="color:var(--color-muted); max-width:60ch;">{safety_text}</p>
  
  <h2 style="font-family:var(--font-display); font-size:1.2rem; margin-top:3rem;">Related tools</h2>
  <div class="tool-grid">
{related_html}
  </div>

{faq_html}

</main>
<footer class="site-footer wrap">
  <p>Presend — free browser-based tools. <a href="/about">About</a> · <a href="/privacy">Privacy</a></p>
</footer>
<script src="/sw-register.js"></script>
</body>
</html>'''

# Définition des nouvelles landings programmatiques
PROGRAMMATIC_LANDINGS = [
    {
        "slug": "remove-exif-android",
        "title": "Remove EXIF Data on Android — Free, No Upload | Presend",
        "description": "Remove GPS location and metadata from photos on Android without installing an app. Works in your browser, nothing is uploaded.",
        "h1": "Remove EXIF Data on Android",
        "lede": "Android photos store your exact GPS location, phone model, and timestamps. Remove all hidden metadata directly in your browser — no app installation needed.",
        "how_it_works": "Our browser-based tool works on any Android device with Chrome, Firefox, or Samsung Internet. Simply open the tool, select your photo, and all EXIF metadata is stripped instantly. Your photo never leaves your device.",
        "steps": [
            "Open this page in your Android browser (Chrome, Firefox, or Samsung Internet)",
            "Tap the button below to open the EXIF Remover",
            "Select the photo from your gallery or file manager",
            "The tool automatically detects and displays all embedded metadata",
            "Tap 'Remove EXIF' to strip GPS, camera info, and timestamps",
            "Download your clean photo — no trace of location data remains"
        ],
        "supported_formats": "Works with all photos taken on Android devices including JPG, JPEG, PNG, and WebP. Whether you're cleaning a single photo or batch-processing multiple images, everything happens locally on your device.",
        "safety_text": "Yes — removing EXIF metadata does not affect the visual quality of your photos. The image itself remains identical; only the hidden tracking information is removed. This is recommended by privacy experts before sharing any photo online.",
        "tool_url": "/tools/exif-remover",
        "tool_name": "Open EXIF Remover",
        "related_tools": [
            {"url": "/tools/exif-remover", "name": "EXIF Remover", "desc": "Strip hidden location data from photos."},
            {"url": "/tools/image-compressor", "name": "Image Compressor", "desc": "Shrink photos before sending."},
            {"url": "/tools/pdf-metadata-remover", "name": "PDF Metadata Remover", "desc": "Clear author and dates from PDFs."}
        ],
        "faq": [
            {"q": "Can I remove EXIF data on Android without an app?", "a": "Yes. Our tool runs entirely in your Android browser. No app installation, no permissions, no data collection."},
            {"q": "Does this work on Samsung Galaxy phones?", "a": "Yes. It works on all Android devices including Samsung Galaxy, Google Pixel, OnePlus, Xiaomi, and more."},
            {"q": "Will this remove my photo's quality?", "a": "No. Only metadata is removed. The actual image pixels remain completely unchanged."}
        ],
        "keywords": "remove exif android, android photo metadata, gps removal android, exif remover no app, privacy android photos"
    },
    {
        "slug": "compress-pdf-10mb",
        "title": "Compress PDF to 10MB — Free, No Upload | Presend",
        "description": "Shrink PDF files to under 10MB for email attachments without uploading. Works in your browser, 100% private.",
        "h1": "Compress PDF to 10MB",
        "lede": "Most email providers limit attachments to 10-25MB. Compress your PDF to under 10MB instantly — no software installation, no upload to any server.",
        "how_it_works": "Our browser-based PDF compressor optimizes the internal structure of your PDF file. It reduces image quality within the PDF, removes redundant data, and restructures the file for maximum compression. All processing happens locally in your browser.",
        "steps": [
            "Click the button below to open the PDF Compressor",
            "Drag and drop your PDF file or click to browse",
            "The tool analyzes your file and shows the current size",
            "Adjust the compression level if needed (default is optimal)",
            "Click 'Compress' and wait a few seconds",
            "Download your compressed PDF — guaranteed under 10MB"
        ],
        "supported_formats": "Works with all standard PDF files including those created by Adobe Acrobat, Microsoft Word, Google Docs, and any other PDF generator. Supports PDF/A, PDF/X, and standard PDF formats.",
        "safety_text": "Yes — PDF compression only reduces file size by optimizing internal images and removing redundant data. The visible content, text, and layout remain completely intact. Your document looks identical but takes up less space.",
        "tool_url": "/tools/pdf-compress",
        "tool_name": "Open PDF Compressor",
        "related_tools": [
            {"url": "/tools/pdf-compress", "name": "PDF Compress", "desc": "Reduce PDF file size instantly."},
            {"url": "/tools/pdf-merger", "name": "PDF Merger", "desc": "Combine multiple PDFs into one."},
            {"url": "/tools/pdf-metadata-remover", "name": "PDF Metadata Remover", "desc": "Clear hidden data from PDFs."}
        ],
        "faq": [
            {"q": "Can I compress a PDF to exactly 10MB?", "a": "Our tool targets under 10MB. For very large files with many high-resolution images, you may need to adjust the compression level manually."},
            {"q": "Will compression reduce PDF quality?", "a": "Text and vector graphics remain perfect. Photos within the PDF may see slight quality reduction depending on the compression level chosen."},
            {"q": "Is this safe for confidential documents?", "a": "Absolutely. Your PDF is processed entirely in your browser. It is never uploaded to any server, cloud, or third party."}
        ],
        "keywords": "compress pdf to 10mb, pdf compressor 10mb, shrink pdf email, reduce pdf size, pdf email attachment"
    },
    {
        "slug": "compress-pdf-5mb",
        "title": "Compress PDF to 5MB — Free, No Upload | Presend",
        "description": "Shrink PDF files to under 5MB for Gmail and Outlook without uploading. Works in your browser, 100% private.",
        "h1": "Compress PDF to 5MB",
        "lede": "Gmail limits attachments to 25MB, but many corporate email servers cap at 5-10MB. Compress your PDF to under 5MB for guaranteed delivery — no upload needed.",
        "how_it_works": "Our tool uses advanced PDF optimization techniques including image recompression, font subsetting, and structure cleanup to achieve maximum size reduction. All processing happens locally in your browser.",
        "steps": [
            "Open the PDF Compressor by clicking the button below",
            "Upload your PDF file (up to 100MB)",
            "Select 'High Compression' mode for 5MB target",
            "The tool optimizes images and cleans the PDF structure",
            "Preview the result and check the new file size",
            "Download your compressed PDF ready for email"
        ],
        "supported_formats": "All standard PDF files are supported. The tool handles PDFs with embedded images, fonts, annotations, and forms. Output is a fully compatible PDF that opens in any reader.",
        "safety_text": "PDF compression is completely safe. Only the file size changes — all content, formatting, and functionality remain identical. No data is lost or altered in the visible document.",
        "tool_url": "/tools/pdf-compress",
        "tool_name": "Open PDF Compressor",
        "related_tools": [
            {"url": "/tools/pdf-compress", "name": "PDF Compress", "desc": "Reduce PDF file size instantly."},
            {"url": "/tools/pdf-merger", "name": "PDF Merger", "desc": "Combine multiple PDFs into one."},
            {"url": "/tools/pdf-metadata-remover", "name": "PDF Metadata Remover", "desc": "Clear hidden data from PDFs."}
        ],
        "faq": [
            {"q": "How much can a PDF be compressed?", "a": "Typically 30-70% depending on image content. PDFs with many photos compress more than text-only documents."},
            {"q": "Will my PDF look the same after compression?", "a": "Yes. Text and layout remain perfect. Only image quality may be slightly reduced if you choose aggressive compression."},
            {"q": "Is there a file size limit?", "a": "You can upload PDFs up to 100MB for compression. The tool runs in your browser, so very large files may take longer to process."}
        ],
        "keywords": "compress pdf to 5mb, pdf 5mb limit, gmail pdf size, outlook pdf attachment, shrink pdf small"
    },
    {
        "slug": "resize-image-facebook-cover",
        "title": "Resize Image for Facebook Cover — Free, No Upload | Presend",
        "description": "Resize photos to Facebook cover dimensions (820x312px) without uploading. Works in your browser, 100% private.",
        "h1": "Resize Image for Facebook Cover",
        "lede": "Facebook cover photos must be exactly 820x312 pixels for optimal display on desktop and 640x360 on mobile. Resize any photo to these dimensions instantly — no upload needed.",
        "how_it_works": "Our browser-based image resizer crops and scales your photo to Facebook's exact cover photo dimensions. You can adjust the crop area to focus on the most important part of your image. All processing happens locally.",
        "steps": [
            "Click the button below to open the Image Resizer",
            "Upload your photo (JPG, PNG, or WebP)",
            "Select 'Facebook Cover' preset (820x312px)",
            "Drag to adjust the crop area if needed",
            "Click 'Resize' to generate the perfect cover photo",
            "Download your Facebook-ready image"
        ],
        "supported_formats": "Works with JPG, JPEG, PNG, WebP, and BMP files. Output is optimized JPG for fast loading on Facebook. Maximum input size is 50MB per image.",
        "safety_text": "Image resizing only changes the dimensions of your photo. No filters, effects, or compression are applied unless you choose them. Your original image quality is preserved within the new dimensions.",
        "tool_url": "/tools/image-resizer",
        "tool_name": "Open Image Resizer",
        "related_tools": [
            {"url": "/tools/image-resizer", "name": "Image Resizer", "desc": "Resize photos to any dimension."},
            {"url": "/tools/image-compressor", "name": "Image Compressor", "desc": "Optimize file size for fast upload."},
            {"url": "/tools/exif-remover", "name": "EXIF Remover", "desc": "Remove location data before posting."}
        ],
        "faq": [
            {"q": "What size is a Facebook cover photo?", "a": "Facebook recommends 820x312 pixels for desktop display. Mobile displays may crop differently, so keep important content centered."},
            {"q": "Can I use this for Facebook business pages?", "a": "Yes. The same dimensions apply to personal profiles, business pages, and group covers."},
            {"q": "Will my photo lose quality?", "a": "The tool preserves maximum quality within the target dimensions. For best results, start with a high-resolution photo."}
        ],
        "keywords": "resize image facebook cover, facebook cover photo size, 820x312 image, facebook banner resize, social media image resize"
    },
    {
        "slug": "resize-image-instagram-story",
        "title": "Resize Image for Instagram Story — Free, No Upload | Presend",
        "description": "Resize photos to Instagram Story dimensions (1080x1920px) without uploading. Works in your browser, 100% private.",
        "h1": "Resize Image for Instagram Story",
        "lede": "Instagram Stories require a 9:16 aspect ratio (1080x1920 pixels) for full-screen display. Resize any photo to Story dimensions instantly — no app needed, no upload required.",
        "how_it_works": "Our tool crops and scales your image to the exact Instagram Story dimensions. You can choose to fill the screen (cropping edges) or fit the entire image (with background fill). All processing is done locally in your browser.",
        "steps": [
            "Open the Image Resizer by clicking below",
            "Upload your photo from your device",
            "Select 'Instagram Story' preset (1080x1920px)",
            "Choose 'Fill' or 'Fit' mode",
            "Adjust the crop position if using Fill mode",
            "Download your Story-ready image"
        ],
        "supported_formats": "Supports JPG, PNG, WebP, and HEIC input. Outputs high-quality JPG optimized for Instagram's compression algorithm.",
        "safety_text": "Only the dimensions change. Your image content, colors, and quality are preserved. No watermarks, no compression artifacts, no quality loss beyond the necessary resizing.",
        "tool_url": "/tools/image-resizer",
        "tool_name": "Open Image Resizer",
        "related_tools": [
            {"url": "/tools/image-resizer", "name": "Image Resizer", "desc": "Resize for any social platform."},
            {"url": "/tools/image-compressor", "name": "Image Compressor", "desc": "Optimize file size for fast upload."},
            {"url": "/tools/exif-remover", "name": "EXIF Remover", "desc": "Remove location data before posting."}
        ],
        "faq": [
            {"q": "What size should an Instagram Story be?", "a": "Instagram recommends 1080x1920 pixels (9:16 aspect ratio) for full-screen Stories."},
            {"q": "Can I resize landscape photos for Stories?", "a": "Yes. Use 'Fill' mode to crop to portrait, or 'Fit' mode to add background bars."},
            {"q": "Will this work for Instagram Reels too?", "a": "Reels use the same 9:16 ratio (1080x1920), so yes — this preset works for both Stories and Reels."}
        ],
        "keywords": "resize image instagram story, instagram story dimensions, 1080x1920 image, instagram story size, story photo resize"
    },
    {
        "slug": "convert-heic-to-jpg-mac",
        "title": "Convert HEIC to JPG on Mac — Free, No Software | Presend",
        "description": "Convert iPhone HEIC photos to JPG on Mac without installing software. Works in Safari, Chrome, or Firefox. Nothing is uploaded.",
        "h1": "Convert HEIC to JPG on Mac",
        "lede": "Mac Preview can open HEIC files, but sharing them with Windows users or uploading to websites often fails. Convert HEIC to universal JPG format directly in your browser — no app installation needed.",
        "how_it_works": "Our browser-based converter uses the heic2any JavaScript library to decode HEIC files and re-encode them as JPG. This works in Safari, Chrome, and Firefox on macOS. Your photos are processed locally and never uploaded.",
        "steps": [
            "Open this page in Safari, Chrome, or Firefox on your Mac",
            "Click the button below to open the HEIC Converter",
            "Drag and drop your HEIC files or click to browse",
            "The converter processes each file in your browser",
            "Preview the converted JPG to verify quality",
            "Download all converted files as a ZIP archive"
        ],
        "supported_formats": "Converts HEIC and HEIF files (iPhone default format) to universally compatible JPG. Supports single files and batch conversion. Works on macOS 10.13+ with any modern browser.",
        "safety_text": "HEIC to JPG conversion preserves the original image quality. The output JPG will look identical to the original HEIC. No metadata is lost unless you choose to strip it.",
        "tool_url": "/tools/heic-converter",
        "tool_name": "Open HEIC Converter",
        "related_tools": [
            {"url": "/tools/heic-converter", "name": "HEIC Converter", "desc": "Convert iPhone photos to JPG."},
            {"url": "/tools/exif-remover", "name": "EXIF Remover", "desc": "Remove location data from photos."},
            {"url": "/tools/image-compressor", "name": "Image Compressor", "desc": "Shrink photos for sharing."}
        ],
        "faq": [
            {"q": "Do I need to install anything on Mac?", "a": "No. The converter runs entirely in your web browser. No download, no installation, no admin password required."},
            {"q": "Will the converted JPGs have the same quality?", "a": "Yes. We use high-quality encoding. The visual output is identical to the original HEIC file."},
            {"q": "Can I convert multiple HEIC files at once?", "a": "Yes. Drag and drop multiple files. The tool will convert them all and package them in a ZIP for easy download."}
        ],
        "keywords": "convert heic to jpg mac, heic converter mac, iphone photos mac, heic to jpeg mac, mac heic conversion"
    },
    {
        "slug": "remove-metadata-before-emailing",
        "title": "Remove Metadata Before Emailing — Free, No Upload | Presend",
        "description": "Clean hidden metadata from PDFs, Word docs, and photos before sending them via email. 100% private, browser-based.",
        "h1": "Remove Metadata Before Emailing",
        "lede": "Every file you attach to an email carries hidden metadata: your name, company, GPS location, and editing history. Clean all of it before hitting send — no software installation, no upload required.",
        "how_it_works": "Presend offers specialized tools for each file type. Remove EXIF data from photos, strip author info from PDFs, and clean editing history from Word documents. All tools run in your browser with zero server contact.",
        "steps": [
            "Identify what type of file you're sending (photo, PDF, Word doc)",
            "Open the appropriate tool using the links below",
            "Upload your file — it stays on your device",
            "Click the clean/remove button",
            "Download the sanitized file",
            "Attach the clean file to your email"
        ],
        "supported_formats": "Photos: JPG, PNG, TIFF, WebP. Documents: PDF, DOCX, XLSX, PPTX. Videos: MP4, MOV. Each format has a dedicated tool optimized for its metadata structure.",
        "safety_text": "Removing metadata is completely safe and recommended by privacy professionals. The visible content of your files remains unchanged. Only the hidden tracking information is removed.",
        "tool_url": "/tools/exif-remover",
        "tool_name": "Start with EXIF Remover",
        "related_tools": [
            {"url": "/tools/exif-remover", "name": "EXIF Remover", "desc": "Clean photos before emailing."},
            {"url": "/tools/pdf-metadata-remover", "name": "PDF Metadata Remover", "desc": "Strip author from PDFs."},
            {"url": "/tools/office-metadata-remover", "name": "Office Metadata Remover", "desc": "Clean Word/Excel/PowerPoint."}
        ],
        "faq": [
            {"q": "What metadata is hidden in email attachments?", "a": "Photos: GPS coordinates, camera model, timestamps. PDFs: author name, software, creation date. Word docs: author, company, edit history, comments."},
            {"q": "Can email recipients see my metadata?", "a": "Yes. Anyone with the file can extract metadata using free tools. Social platforms strip some, but email clients do not."},
            {"q": "Is this legal for work documents?", "a": "Yes. Removing personal metadata before sharing is a standard privacy practice. It does not alter the document content."}
        ],
        "keywords": "remove metadata before emailing, clean email attachments, email privacy, metadata removal email, secure email attachments"
    },
    {
        "slug": "check-file-hash-windows",
        "title": "Check File Hash on Windows — SHA256, Free, No Upload | Presend",
        "description": "Calculate SHA-256, SHA-1, and SHA-512 checksums on Windows without installing software. Verify file integrity in your browser.",
        "h1": "Check File Hash on Windows",
        "lede": "Windows has built-in hash commands, but they're complex and error-prone. Check SHA-256, SHA-1, and SHA-512 checksums instantly in your browser — no PowerShell, no Command Prompt, no installation.",
        "how_it_works": "Our browser-based hash calculator uses the Web Crypto API to compute cryptographic hashes entirely on your device. Simply drag and drop any file, and the hash is calculated in seconds. Your file never leaves your computer.",
        "steps": [
            "Open this page in any browser on Windows (Chrome, Edge, Firefox)",
            "Click the button below to open the File Hash Checker",
            "Drag and drop your file or click to browse",
            "The tool calculates SHA-256, SHA-1, and SHA-512 simultaneously",
            "Compare the calculated hash with the publisher's official hash",
            "If they match exactly, your file is authentic and uncorrupted"
        ],
        "supported_formats": "Works with absolutely any file type: EXE, ZIP, PDF, ISO, images, videos, documents. There is no file size limit since processing happens locally on your device.",
        "safety_text": "Hash checking is a read-only operation. The tool calculates a fingerprint of your file but does not modify it in any way. Your file remains completely unchanged.",
        "tool_url": "/tools/file-hash-checker",
        "tool_name": "Open File Hash Checker",
        "related_tools": [
            {"url": "/tools/file-hash-checker", "name": "File Hash Checker", "desc": "Verify file integrity instantly."},
            {"url": "/tools/exif-remover", "name": "EXIF Remover", "desc": "Clean photos before sharing."},
            {"url": "/tools/pdf-metadata-remover", "name": "PDF Metadata Remover", "desc": "Strip hidden PDF data."}
        ],
        "faq": [
            {"q": "Is this easier than PowerShell on Windows?", "a": "Yes. No commands to remember, no terminal to open. Just drag, drop, and compare."},
            {"q": "Can I check large files like ISO images?", "a": "Yes. Since processing is local, file size is only limited by your device's RAM and patience."},
            {"q": "What if the hash doesn't match?", "a": "The file has been modified, corrupted, or tampered with. Do not install or open it. Download again from the official source."}
        ],
        "keywords": "check file hash windows, sha256 windows, verify file integrity windows, hash checker online, windows file verification"
    },
    {
        "slug": "generate-password-16-characters",
        "title": "Generate 16-Character Password — Secure, Free, No Upload | Presend",
        "description": "Create a strong 16-character password using cryptographically secure random generation. Nothing leaves your device.",
        "h1": "Generate 16-Character Password",
        "lede": "16 characters is the sweet spot for security and memorability. Generate a cryptographically secure 16-character password with uppercase, lowercase, numbers, and symbols — no data sent to any server.",
        "how_it_works": "Our password generator uses your browser's crypto.getRandomValues() API, the same cryptographic function used by banks and governments. The password is generated locally and never transmitted, stored, or logged anywhere.",
        "steps": [
            "Click the button below to open the Password Generator",
            "Set length to 16 characters (or adjust as needed)",
            "Choose character types: uppercase, lowercase, numbers, symbols",
            "Click 'Generate' to create your password",
            "Copy the password to your clipboard",
            "Store it in your password manager (Never write it down)"
        ],
        "supported_formats": "Generates ASCII passwords compatible with all websites, apps, and systems. Supports lengths from 8 to 128 characters. Optional exclusion of ambiguous characters (0, O, l, 1).",
        "safety_text": "Extremely safe. The password exists only in your browser's memory for the few seconds you need it. It is never sent to any server, not even ours. For maximum security, use a password manager to store generated passwords.",
        "tool_url": "/tools/password-generator",
        "tool_name": "Open Password Generator",
        "related_tools": [
            {"url": "/tools/password-generator", "name": "Password Generator", "desc": "Create secure passwords instantly."},
            {"url": "/tools/password-strength", "name": "Password Strength", "desc": "Check how strong your password is."},
            {"url": "/tools/qr-code-generator", "name": "QR Code Generator", "desc": "Share passwords securely via QR."}
        ],
        "faq": [
            {"q": "Is a 16-character password secure enough?", "a": "Yes. A 16-character password with mixed characters would take billions of years to crack via brute force."},
            {"q": "Can I use this password for my bank?", "a": "Yes, but we recommend using a unique password for each account. Consider a password manager for this."},
            {"q": "Is this truly random?", "a": "Yes. We use crypto.getRandomValues(), which provides cryptographically secure random numbers from your device's hardware."}
        ],
        "keywords": "generate 16 character password, strong password generator, secure password 16 chars, random password generator, cryptographic password"
    },
    {
        "slug": "remove-pdf-metadata-before-sharing",
        "title": "Remove PDF Metadata Before Sharing — Free, No Upload | Presend",
        "description": "Strip author name, software, and creation dates from PDFs before sharing them online or via email. 100% private, browser-based.",
        "h1": "Remove PDF Metadata Before Sharing",
        "lede": "Every PDF carries hidden fingerprints: the author's name, the software used to create it, creation and modification dates, and sometimes even editing history. Remove all of it before sharing — no upload needed.",
        "how_it_works": "Our PDF Metadata Remover parses the PDF structure, identifies all metadata fields (author, title, subject, keywords, creator, producer, creation date, modification date), and strips them while preserving the visible document content. All processing happens locally.",
        "steps": [
            "Click the button below to open the PDF Metadata Remover",
            "Upload your PDF file (up to 100MB)",
            "The tool scans and displays all detected metadata",
            "Review what will be removed (author, dates, software info)",
            "Click 'Remove Metadata' to clean the PDF",
            "Download your sanitized PDF — no hidden data remains"
        ],
        "supported_formats": "Works with all standard PDF files including PDF/A, PDF/X, and encrypted PDFs (password required). Output is a fully compatible PDF that opens in any reader.",
        "safety_text": "Completely safe. Only metadata is removed — the visible text, images, formatting, and layout remain exactly the same. No content is altered, deleted, or modified.",
        "tool_url": "/tools/pdf-metadata-remover",
        "tool_name": "Open PDF Metadata Remover",
        "related_tools": [
            {"url": "/tools/pdf-metadata-remover", "name": "PDF Metadata Remover", "desc": "Strip hidden PDF data."},
            {"url": "/tools/pdf-compress", "name": "PDF Compress", "desc": "Reduce PDF file size."},
            {"url": "/tools/office-metadata-remover", "name": "Office Metadata Remover", "desc": "Clean Word/Excel files."}
        ],
        "faq": [
            {"q": "What metadata is hidden in PDFs?", "a": "Author name, title, subject, keywords, creator software, producer software, creation date, modification date, and sometimes XMP metadata with editing history."},
            {"q": "Can someone track me from a PDF I shared?", "a": "Yes, if the PDF contains your name as author or your company information. Our tool removes all identifying metadata."},
            {"q": "Will this break my PDF?", "a": "No. The PDF structure and all visible content remain intact. Only the hidden properties are removed."}
        ],
        "keywords": "remove pdf metadata before sharing, clean pdf metadata, pdf author removal, pdf privacy, strip pdf data"
    },
    {
        "slug": "compress-image-for-whatsapp",
        "title": "Compress Image for WhatsApp — Free, No Upload | Presend",
        "description": "Shrink photos to WhatsApp's recommended size without losing quality. Works in your browser, nothing is uploaded.",
        "h1": "Compress Image for WhatsApp",
        "lede": "WhatsApp compresses images automatically, but the result is often blurry. Compress your photos yourself to control quality and file size before sending — no upload to any server.",
        "how_it_works": "Our Image Compressor lets you choose the exact compression level and preview the result before downloading. You can target WhatsApp's sweet spot (around 100-300KB) while preserving sharpness. All processing is local.",
        "steps": [
            "Click the button below to open the Image Compressor",
            "Upload your photo (JPG, PNG, or WebP)",
            "Use the quality slider to find the balance (70-85% is ideal)",
            "Preview the compressed image in real time",
            "Check the estimated file size",
            "Download and send via WhatsApp"
        ],
        "supported_formats": "JPG, JPEG, PNG, WebP input. Optimized JPG output for maximum WhatsApp compatibility. Supports files up to 50MB.",
        "safety_text": "Image compression only reduces file size. The visual content remains the same. No cropping, no filters, no watermarks. Your photo stays private on your device.",
        "tool_url": "/tools/image-compressor",
        "tool_name": "Open Image Compressor",
        "related_tools": [
            {"url": "/tools/image-compressor", "name": "Image Compressor", "desc": "Shrink photos for messaging."},
            {"url": "/tools/image-resizer", "name": "Image Resizer", "desc": "Resize for WhatsApp status."},
            {"url": "/tools/exif-remover", "name": "EXIF Remover", "desc": "Remove location data first."}
        ],
        "faq": [
            {"q": "What size should images be for WhatsApp?", "a": "WhatsApp compresses large images to around 100-300KB. Our tool lets you pre-compress to this range with better quality than WhatsApp's automatic compression."},
            {"q": "Will compressed images look bad?", "a": "Not if done right. Our live preview lets you see exactly how the image will look before you send it."},
            {"q": "Can I compress multiple images?", "a": "Yes. Upload multiple files and compress them all with the same settings."}
        ],
        "keywords": "compress image whatsapp, whatsapp photo size, shrink image whatsapp, whatsapp image quality, photo compressor messaging"
    }
]

def generate_all():
    created = 0
    for landing in PROGRAMMATIC_LANDINGS:
        slug = landing["slug"]
        filepath = OUTPUT_DIR / f"{slug}.html"
        
        html = get_template(
            title=landing["title"],
            description=landing["description"],
            h1=landing["h1"],
            lede=landing["lede"],
            how_it_works=landing["how_it_works"],
            steps=landing["steps"],
            supported_formats=landing["supported_formats"],
            safety_text=landing["safety_text"],
            tool_url=landing["tool_url"],
            tool_name=landing["tool_name"],
            related_tools=landing["related_tools"],
            faq_items=landing["faq"],
            keywords=landing["keywords"],
            slug=slug
        )
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(html)
        
        print(f"✅ Created: {slug}.html")
        created += 1
    
    print(f"\n{'='*60}")
    print(f"Done! Created {created} new programmatic landing pages.")
    print(f"{'='*60}")

if __name__ == "__main__":
    generate_all()
