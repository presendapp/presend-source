#!/usr/bin/env python3
"""
Génération automatique du blog à partir des outils existants.
Crée 3-4 articles par outil (guide, comparaison, tutoriel, FAQ).
Structure: blog/slug/index.html (Cloudflare Pages natif)
"""
import os
import re
from datetime import datetime, timedelta
import random
import hashlib

HOST = "https://presend.pages.dev"
BLOG_DIR = "blog"
TEMPLATE_FILE = "blog/template.html"

# ─── DONNÉES DES OUTILS ─────────────────────────────────────────────
TOOLS = {
    "exif-remover": {
        "name": "EXIF Remover",
        "category": "Privacy",
        "keywords": "remove exif data, photo metadata, privacy, iphone location, gps removal",
        "problem": "Your photos contain hidden metadata (GPS location, camera model, date taken) that reveals personal information.",
        "solution": "Our EXIF Remover strips all metadata instantly, directly in your browser — no upload, no tracking.",
        "use_cases": ["Before sharing photos online", "Before emailing images", "Before uploading to social media", "When selling items online"],
        "alternatives": ["ExifTool (command line)", "ImageOptim (Mac)", "VerExif (online)", "Photoshop metadata panel"],
        "faq": [
            ("Does removing EXIF affect image quality?", "No. EXIF data is separate from the actual image pixels. Removing it does not change the visual quality at all."),
            ("Can I remove EXIF from multiple photos at once?", "Yes. Our tool supports batch processing — just drop all your photos and download the clean versions."),
            ("Is my data uploaded to a server?", "No. Everything happens locally in your browser. Your photos never leave your device."),
        ]
    },
    "pdf-metadata-remover": {
        "name": "PDF Metadata Remover",
        "category": "Privacy",
        "keywords": "remove pdf metadata, pdf author, pdf creator, clean pdf, pdf privacy",
        "problem": "PDFs store hidden information like author name, creation date, software used, and even editing history.",
        "solution": "Our PDF Metadata Remover cleans all hidden data from your PDFs instantly, keeping your documents anonymous.",
        "use_cases": ["Before sharing PDFs publicly", "Before submitting resumes", "Before sending legal documents", "When distributing reports"],
        "alternatives": ["Adobe Acrobat Pro", "PDFtk (command line)", "PDF-XChange Editor", "qpdf"],
        "faq": [
            ("What metadata does a PDF contain?", "PDFs can store author, title, subject, keywords, creation date, modification date, software used, and even previous versions."),
            ("Will removing metadata break my PDF?", "No. The document content, formatting, and structure remain completely intact."),
            ("Can I see what metadata was removed?", "Yes. After processing, we show you exactly what metadata was found and removed."),
        ]
    },
    "image-compressor": {
        "name": "Image Compressor",
        "category": "Productivity",
        "keywords": "compress images, reduce image size, optimize photos, web images, email images",
        "problem": "Large images slow down websites, exceed email attachment limits, and waste storage space.",
        "solution": "Our Image Compressor reduces file size by up to 80% while maintaining visual quality — all locally in your browser.",
        "use_cases": ["Optimizing website images", "Reducing email attachment size", "Saving storage space", "Preparing images for social media"],
        "alternatives": ["TinyPNG", "Squoosh (Google)", "ImageOptim", "Caesium"],
        "faq": [
            ("How much can I compress an image?", "Typically 50-80% reduction while keeping the image visually identical. The exact amount depends on the original format and content."),
            ("Does compression reduce quality?", "Our smart compression minimizes quality loss. For most web and email uses, the difference is invisible to the human eye."),
            ("What formats are supported?", "JPEG, PNG, WebP, and GIF. We automatically choose the best settings for each format."),
        ]
    },
    "pdf-compress": {
        "name": "PDF Compressor",
        "category": "Productivity",
        "keywords": "compress pdf, reduce pdf size, shrink pdf, pdf optimizer, email pdf",
        "problem": "PDFs from scanners or design software are often huge, making them impossible to email or upload.",
        "solution": "Our PDF Compressor shrinks PDFs by up to 90% while preserving text quality and readability.",
        "use_cases": ["Emailing large PDFs", "Uploading to forms with size limits", "Archiving documents", "Sharing reports"],
        "alternatives": ["SmallPDF", "iLovePDF", "Adobe Acrobat", "PDF24 Tools"],
        "faq": [
            ("How small can my PDF get?", "Most PDFs compress by 60-90%. Scanned documents see the biggest reduction because images inside are re-encoded."),
            ("Will text stay readable?", "Yes. Text layers are preserved exactly. Only embedded images are optimized."),
            ("Is there a file size limit?", "No hard limit, but files over 100MB may take longer to process in your browser."),
        ]
    },
    "password-generator": {
        "name": "Password Generator",
        "category": "Security",
        "keywords": "generate password, strong password, random password, secure password, password creator",
        "problem": "Weak passwords are the #1 cause of account breaches. Most people reuse the same password everywhere.",
        "solution": "Our Password Generator creates cryptographically secure passwords with customizable length and character sets.",
        "use_cases": ["Creating new account passwords", "Replacing weak passwords", "Generating WiFi passwords", "Creating API keys"],
        "alternatives": ["1Password generator", "Bitwarden", "LastPass", "KeePass"],
        "faq": [
            ("How secure are generated passwords?", "We use the browser's crypto.getRandomValues() which provides cryptographically secure randomness — the same standard used by banks."),
            ("Should I use special characters?", "Yes, if the website allows it. Special characters dramatically increase password strength. Our generator includes them by default."),
            ("How long should my password be?", "At least 16 characters for important accounts. Our default is 16, but you can go up to 64."),
        ]
    },
    "url-cleaner": {
        "name": "URL Cleaner",
        "category": "Privacy",
        "keywords": "clean url, remove tracking parameters, url parameters, tracking removal, clean links",
        "problem": "Links you share are loaded with tracking parameters (utm_source, fbclid, etc.) that spy on whoever clicks them.",
        "solution": "Our URL Cleaner strips all tracking parameters while preserving the actual destination — instantly and privately.",
        "use_cases": ["Sharing links in messages", "Posting on social media", "Sending in emails", "Bookmarking clean URLs"],
        "alternatives": ["ClearURLs (browser extension)", "URL Decoder", "Link Cleaner apps", "Manual editing"],
        "faq": [
            ("What tracking parameters are removed?", "Common ones include utm_source, utm_medium, utm_campaign, fbclid, gclid, si, ref, and many more. We maintain an updated list."),
            ("Will the link still work?", "Yes. We only remove tracking parameters. The actual destination URL remains fully functional."),
            ("Can I customize what gets removed?", "Yes. You can see exactly what was removed and manually edit if needed."),
        ]
    },
    "qr-code-generator": {
        "name": "QR Code Generator",
        "category": "Productivity",
        "keywords": "create qr code, generate qr code, qr code maker, free qr code, custom qr code",
        "problem": "Sharing long URLs is cumbersome. People mistype them or avoid typing them altogether.",
        "solution": "Our QR Code Generator creates scannable codes for any URL, WiFi, text, or contact info — no app needed, no watermark.",
        "use_cases": ["Restaurant menus", "Business cards", "Event tickets", "WiFi sharing", "Product packaging"],
        "alternatives": ["QR Code Monkey", "QRStuff", "GoQR.me", "Canva QR generator"],
        "faq": [
            ("Are generated QR codes permanent?", "Yes. QR codes encode data directly — they don't expire and don't need an internet connection to be scanned."),
            ("Can I customize the color?", "Yes. You can choose custom colors, though high contrast (dark on light) scans best."),
            ("What data types are supported?", "URLs, plain text, WiFi credentials, email addresses, phone numbers, and contact cards (vCard)."),
        ]
    },
    "file-hash-checker": {
        "name": "File Hash Checker",
        "category": "Security",
        "keywords": "check file hash, sha256, md5, verify file integrity, file checksum, download verification",
        "problem": "Downloads can be corrupted or tampered with. Without verification, you might install malware or broken software.",
        "solution": "Our File Hash Checker computes SHA-256, MD5, and SHA-1 hashes locally to verify file integrity against official sources.",
        "use_cases": ["Verifying software downloads", "Checking file transfers", "Detecting corruption", "Comparing duplicate files"],
        "alternatives": ["CertUtil (Windows)", "shasum (Mac/Linux)", "HashTab", "QuickHash"],
        "faq": [
            ("What is a file hash?", "A hash is a unique fingerprint of a file. Even a single bit change produces a completely different hash."),
            ("Which hash algorithm should I use?", "SHA-256 is recommended for security. MD5 is faster but considered broken for security purposes — still fine for corruption checks."),
            ("How do I verify a download?", "Compare the hash shown on the official website with the hash our tool generates for your downloaded file. They must match exactly."),
        ]
    },
    "heic-converter": {
        "name": "HEIC Converter",
        "category": "Productivity",
        "keywords": "convert heic to jpg, heic to jpeg, iphone photo converter, heic windows, heic android",
        "problem": "iPhones save photos as HEIC, which most Windows PCs, Android phones, and websites cannot open.",
        "solution": "Our HEIC Converter transforms iPhone photos to universally compatible JPG format — directly in your browser, no software install.",
        "use_cases": ["Opening iPhone photos on Windows", "Uploading to websites that don't support HEIC", "Sharing with non-Apple users", "Archiving in standard format"],
        "alternatives": ["iMazing HEIC Converter", "CopyTrans HEIC", "HEICtoJPEG (Microsoft Store)", "Online-Convert"],
        "faq": [
            ("Does conversion reduce quality?", "Slightly. HEIC is more efficient than JPEG, so converting to JPEG requires slightly more space for the same quality. We optimize the balance."),
            ("Can I convert multiple photos?", "Yes. Batch conversion is supported — drop all your HEIC files and download the JPGs."),
            ("Do I need to install anything?", "No. Everything works in your browser. Your photos are processed locally and never uploaded."),
        ]
    },
    "word-counter": {
        "name": "Word Counter",
        "category": "Productivity",
        "keywords": "count words online, character counter, word count tool, text statistics, writing tool",
        "problem": "Writers, students, and professionals constantly need to check word counts, character limits, and reading time.",
        "solution": "Our Word Counter provides instant statistics: words, characters, sentences, paragraphs, and estimated reading time.",
        "use_cases": ["Essay writing", "Social media posts (character limits)", "SEO meta descriptions", "Speech preparation", "Translation quotes"],
        "alternatives": ["Google Docs word count", "WordCounter.net", "CharacterCountOnline", "Hemingway Editor"],
        "faq": [
            ("Does it count spaces?", "We show both with and without spaces. Most platforms (Twitter, Instagram) count characters including spaces."),
            ("How is reading time calculated?", "Based on the average adult reading speed of 200-250 words per minute."),
            ("Can I paste formatted text?", "Yes. We strip formatting and count the plain text content accurately."),
        ]
    },
}

# ─── TEMPLATES DE CONTENU ───────────────────────────────────────────
def generate_guide(tool_id, tool):
    title = f"How to Use the {tool['name']} — Complete Guide"
    content = f"""
<p>Looking for a quick, private way to {tool['name'].lower()}? This guide walks you through everything you need to know.</p>

<h2>What Problem Does It Solve?</h2>
<p>{tool['problem']}</p>

<h2>The Solution</h2>
<p>{tool['solution']}</p>

<h2>Step-by-Step Guide</h2>
<ol>
  <li><strong>Open the tool</strong> — Navigate to <a href="{HOST}/tools/{tool_id}">{HOST}/tools/{tool_id}</a>. No signup required.</li>
  <li><strong>Upload or paste your content</strong> — The tool works directly in your browser.</li>
  <li><strong>Configure settings</strong> — Adjust options to match your needs (if available).</li>
  <li><strong>Process</strong> — Click the action button and wait a few seconds.</li>
  <li><strong>Download</strong> — Save your result. Everything stays on your device.</li>
</ol>

<h2>When Should You Use It?</h2>
<ul>
"""
    for use in tool['use_cases']:
        content += f"  <li>{use}</li>\n"
    content += f"""</ul>

<h2>Why Choose Presend?</h2>
<ul>
  <li><strong>100% Private</strong> — No server upload, no tracking, no cookies.</li>
  <li><strong>Free Forever</strong> — No paywalls, no watermarks, no limits.</li>
  <li><strong>Works Everywhere</strong> — Any device with a browser.</li>
  <li><strong>Open Source</strong> — Transparent code you can audit.</li>
</ul>

<h2>Pro Tips</h2>
<p>For best results, always check the output before sharing. While our tools are thoroughly tested, it's good practice to verify critical files.</p>
"""
    return title, content

def generate_comparison(tool_id, tool):
    title = f"{tool['name']} vs Alternatives — Which One Is Best?"
    content = f"""
<p>Choosing the right {tool['name'].lower()} can be tricky. Here's how Presend compares to the most popular alternatives.</p>

<h2>The Quick Answer</h2>
<p>If you want something <strong>free, private, and instant</strong>, Presend is your best bet. If you need advanced desktop features, consider the alternatives below.</p>

<h2>Comparison Table</h2>
<table style="width:100%;border-collapse:collapse;margin:1rem 0">
  <thead>
    <tr style="border-bottom:2px solid var(--accent)">
      <th style="text-align:left;padding:.5rem">Feature</th>
      <th style="text-align:center;padding:.5rem">Presend</th>
      <th style="text-align:center;padding:.5rem">Desktop Tools</th>
      <th style="text-align:center;padding:.5rem">Other Online</th>
    </tr>
  </thead>
  <tbody>
    <tr style="border-bottom:1px solid var(--border)">
      <td style="padding:.5rem">Price</td>
      <td style="text-align:center;padding:.5rem">✅ Free</td>
      <td style="text-align:center;padding:.5rem">❌ $10-50</td>
      <td style="text-align:center;padding:.5rem">⚠️ Freemium</td>
    </tr>
    <tr style="border-bottom:1px solid var(--border)">
      <td style="padding:.5rem">Privacy</td>
      <td style="text-align:center;padding:.5rem">✅ Local only</td>
      <td style="text-align:center;padding:.5rem">✅ Local</td>
      <td style="text-align:center;padding:.5rem">❌ Uploads to server</td>
    </tr>
    <tr style="border-bottom:1px solid var(--border)">
      <td style="padding:.5rem">Speed</td>
      <td style="text-align:center;padding:.5rem">✅ Instant</td>
      <td style="text-align:center;padding:.5rem">⚠️ Install first</td>
      <td style="text-align:center;padding:.5rem">⚠️ Upload time</td>
    </tr>
    <tr style="border-bottom:1px solid var(--border)">
      <td style="padding:.5rem">No Signup</td>
      <td style="text-align:center;padding:.5rem">✅ Yes</td>
      <td style="text-align:center;padding:.5rem">✅ Yes</td>
      <td style="text-align:center;padding:.5rem">❌ Often required</td>
    </tr>
    <tr>
      <td style="padding:.5rem">Works Offline</td>
      <td style="text-align:center;padding:.5rem">⚠️ After load</td>
      <td style="text-align:center;padding:.5rem">✅ Yes</td>
      <td style="text-align:center;padding:.5rem">❌ No</td>
    </tr>
  </tbody>
</table>

<h2>Alternatives Compared</h2>
<ul>
"""
    for alt in tool['alternatives']:
        content += f"  <li><strong>{alt}</strong> — Good alternative with different trade-offs.</li>\n"
    content += f"""</ul>

<h2>When to Use Presend</h2>
<ul>
  <li>You need results <strong>right now</strong> without installing anything.</li>
  <li>You care about <strong>privacy</strong> and don't want your files on someone else's server.</li>
  <li>You want a <strong>simple, focused tool</strong> without bloat.</li>
  <li>You're on a <strong>shared or restricted computer</strong> (school, work, library).</li>
</ul>

<h2>When to Use Desktop Tools</h2>
<ul>
  <li>You process <strong>hundreds of files daily</strong> and need batch automation.</li>
  <li>You need <strong>advanced settings</strong> not available in browser tools.</li>
  <li>You work <strong>completely offline</strong> with no internet access.</li>
</ul>
"""
    return title, content

def generate_faq(tool_id, tool):
    title = f"{tool['name']} — Frequently Asked Questions"
    content = f"""
<p>Got questions about {tool['name']}? We've compiled the most common ones with clear answers.</p>
"""
    for question, answer in tool['faq']:
        content += f"""
<h2>{question}</h2>
<p>{answer}</p>
"""
    content += f"""
<h2>Still Have Questions?</h2>
<p>If your question isn't answered here, feel free to reach out. Our tools are constantly improving based on user feedback.</p>

<p>Ready to try it? <a href="{HOST}/tools/{tool_id}">Open the {tool['name']}</a> — no signup needed.</p>
"""
    return title, content

# ─── GÉNÉRATION HTML ────────────────────────────────────────────────
def render_template(template, replacements):
    result = template
    for key, val in replacements.items():
        result = result.replace("{{" + key + "}}", val)
    return result

def generate_blog():
    # Nettoyer l'ancien blog (sauf template)
    if os.path.exists(BLOG_DIR):
        for item in os.listdir(BLOG_DIR):
            path = os.path.join(BLOG_DIR, item)
            if item == "template.html":
                continue
            if os.path.isdir(path):
                import shutil
                shutil.rmtree(path)
            else:
                os.remove(path)
    else:
        os.makedirs(BLOG_DIR, exist_ok=True)
    
    with open(TEMPLATE_FILE, 'r', encoding='utf-8') as f:
        template = f.read()
    
    articles = []
    article_index = 0
    total_tools = len(TOOLS)
    
    for tool_id, tool in TOOLS.items():
        generators = [
            ("guide", generate_guide),
            ("comparison", generate_comparison),
            ("faq", generate_faq),
        ]
        
        for type_name, gen_func in generators:
            title, content = gen_func(tool_id, tool)
            slug = f"{tool_id}-{type_name}"
            # Structure: blog/slug/index.html
            slug_dir = os.path.join(BLOG_DIR, slug)
            os.makedirs(slug_dir, exist_ok=True)
            filepath = os.path.join(slug_dir, "index.html")
            url = f"{HOST}/blog/{slug}/"
            
            # Date déterministe dérivée du slug (stable entre exécutions,
            # évite un diff git massif à chaque run du cron sans vrai changement)
            days_offset = (int(hashlib.md5(slug.encode()).hexdigest(), 16) % 30) + 1
            date = (datetime.now() - timedelta(days=days_offset)).strftime('%Y-%m-%d')
            read_time = max(3, len(content.split()) // 200)
            tags_html = "".join([f'<span>{t.strip()}</span>' for t in tool['keywords'].split(',')[:5]])
            
            cta_text = f"Use our free {tool['name']} to solve this instantly. No signup, no tracking, no limits."
            cta_button = f"Open {tool['name']}"
            
            prev_url = "#"
            next_url = "#"
            prev_title = "Previous"
            next_title = "Next"
            
            replacements = {
                "TITLE": title,
                "META_DESC": f"{title}. Free, private, browser-based tool. No signup required.",
                "KEYWORDS": tool['keywords'],
                "URL": url,
                "LANG": "en",
                "CATEGORY": tool['category'],
                "DATE": date,
                "READ_TIME": str(read_time),
                "TAGS": tags_html,
                "CONTENT": content,
                "CTA_TEXT": cta_text,
                "CTA_BUTTON": cta_button,
                "TOOL_URL": f"{HOST}/tools/{tool_id}",
                "PREV_URL": prev_url,
                "PREV_TITLE": prev_title,
                "NEXT_URL": next_url,
                "NEXT_TITLE": next_title,
            }
            
            html = render_template(template, replacements)
            
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(html)
            
            articles.append({
                'slug': slug,
                'title': title,
                'url': url,
                'category': tool['category'],
                'date': date,
                'tool_id': tool_id,
            })
            
            article_index += 1
    
    # Deuxième passe : mettre à jour les liens prev/next
    for i, art in enumerate(articles):
        prev_art = articles[(i - 1) % len(articles)]
        next_art = articles[(i + 1) % len(articles)]
        
        filepath = os.path.join(BLOG_DIR, art['slug'], "index.html")
        with open(filepath, 'r', encoding='utf-8') as f:
            html = f.read()
        
        html = html.replace('href="#"', f'href="{prev_art["url"]}"', 1)
        html = html.replace('href="#"', f'href="{next_art["url"]}"', 1)
        html = html.replace('>Previous<', f'>{prev_art["title"][:40]}...<')
        html = html.replace('>Next<', f'>{next_art["title"][:40]}...<')
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(html)
    
    generate_index(articles)
    return len(articles)

def generate_index(articles):
    """Génère la page d'index du blog"""
    articles_sorted = sorted(articles, key=lambda x: x['date'], reverse=True)
    
    by_category = {}
    for art in articles_sorted:
        cat = art['category']
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(art)
    
    index_html = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Presend Blog — Privacy & Productivity Tips</title>
  <meta name="description" content="Guides, tutorials, and tips about online privacy, productivity tools, and digital security. Free, practical advice.">
  <meta property="og:title" content="Presend Blog">
  <meta property="og:description" content="Guides, tutorials, and tips about online privacy and productivity.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="{HOST}/blog/">
  <meta property="og:image" content="https://presend.pages.dev/og-image.png">
  <link rel="canonical" href="{HOST}/blog/">
  <link rel="stylesheet" href="/style.min.css">
  <style>
    .blog-index{{max-width:900px;margin:0 auto;padding:2rem 1rem}}
    .blog-index h1{{font-size:2rem;margin-bottom:1rem}}
    .blog-index p.lead{{color:var(--muted);margin-bottom:2rem}}
    .blog-cat{{margin-bottom:2rem}}
    .blog-cat h2{{font-size:1.3rem;color:var(--accent);border-bottom:2px solid var(--accent);padding-bottom:.3rem;margin-bottom:1rem}}
    .blog-list{{display:grid;gap:1rem}}
    .blog-item{{background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:1rem;transition:transform .2s}}
    .blog-item:hover{{transform:translateY(-2px)}}
    .blog-item a{{text-decoration:none;color:var(--text)}}
    .blog-item h3{{font-size:1.1rem;margin-bottom:.3rem;color:var(--accent)}}
    .blog-item .meta{{font-size:.85rem;color:var(--muted)}}
    .blog-item .excerpt{{font-size:.95rem;margin-top:.5rem;color:var(--muted)}}
  </style>
</head>
<body>
  <header>
    <div class="container nav">
      <a href="/" class="logo">Presend</a>
      <nav>
        <a href="/blog/">Blog</a>
        <a href="/tools/exif-remover">Tools</a>
        <a href="/about">About</a>
      </nav>
    </div>
  </header>

  <main class="blog-index">
    <h1>📝 Presend Blog</h1>
    <p class="lead">Practical guides, tutorials, and tips about online privacy, productivity, and digital security. No fluff, no ads.</p>
'''
    
    for cat, arts in by_category.items():
        index_html += f'    <div class="blog-cat">\n      <h2>{cat}</h2>\n      <div class="blog-list">\n'
        for art in arts:
            index_html += f'''        <div class="blog-item">
          <a href="{art['url']}">
            <h3>{art['title']}</h3>
            <div class="meta">📅 {art['date']} · 🛠️ Related: <a href="{HOST}/tools/{art['tool_id']}">{art['tool_id'].replace('-', ' ').title()}</a></div>
          </a>
        </div>
'''
        index_html += '      </div>\n    </div>\n'
    
    index_html += '''  </main>

  <footer>
    <div class="container">
      <p>© 2026 Presend · <a href="/privacy">Privacy</a> · <a href="/blog/">Blog</a></p>
    </div>
  </footer>
</body>
</html>
'''
    
    with open(os.path.join(BLOG_DIR, "index.html"), 'w', encoding='utf-8') as f:
        f.write(index_html)

def main():
    print("=" * 60)
    print("📝 GÉNÉRATION DU BLOG AUTO")
    print("=" * 60)
    
    count = generate_blog()
    
    print(f"\n✅ {count} articles générés dans {BLOG_DIR}/")
    print(f"   📄 Index : {HOST}/blog/")
    print(f"   Structure : blog/slug/index.html")
    print(f"   📁 Dossiers :")
    for d in sorted(os.listdir(BLOG_DIR)):
        if os.path.isdir(os.path.join(BLOG_DIR, d)):
            print(f"      • {d}/")
    
    print("\n" + "=" * 60)

if __name__ == "__main__":
    main()
