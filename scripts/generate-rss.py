#!/usr/bin/env python3
"""Génère /rss.xml à partir des pages de blog locales.
Exécuté par le workflow daily-seo, après chaque régénération du blog --
lit directement les fichiers HTML plutôt que de refaire des requêtes
réseau vers le site déjà déployé.
"""
import re
import glob
from datetime import datetime, timezone

SITE = "https://presend.pages.dev"

def extract(html, pattern, group=1):
    m = re.search(pattern, html, re.DOTALL)
    return m.group(group).strip() if m else ""

items = []
for path in sorted(glob.glob("blog/*/index.html")):
    slug = path.split("/")[1]
    if slug == "":
        continue
    with open(path, encoding="utf-8") as f:
        html = f.read()
    title = extract(html, r'<title>(.*?)</title>')
    desc = extract(html, r'<meta name="description" content="(.*?)"')
    if not title:
        continue
    url = f"{SITE}/blog/{slug}/"
    items.append((url, title, desc))

now = datetime.now(timezone.utc).strftime('%a, %d %b %Y %H:%M:%S +0000')

rss_items = ""
for url, title, desc in items:
    title_esc = title.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    desc_esc = desc.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    rss_items += f"""
    <item>
      <title>{title_esc}</title>
      <link>{url}</link>
      <guid isPermaLink="true">{url}</guid>
      <description>{desc_esc}</description>
    </item>"""

rss = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Presend Blog</title>
    <link>{SITE}/blog/</link>
    <atom:link href="{SITE}/rss.xml" rel="self" type="application/rss+xml" />
    <description>Guides and comparisons for Presend's free privacy tools and API</description>
    <language>en</language>
    <lastBuildDate>{now}</lastBuildDate>{rss_items}
  </channel>
</rss>"""

with open("rss.xml", "w", encoding="utf-8") as f:
    f.write(rss)

print(f"✅ rss.xml généré avec {len(items)} articles")
