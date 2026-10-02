# Presend — Free Privacy Tools, a Security API, and an MCP Server for AI Agents

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/presendapp/presend)
[![Live Site](https://img.shields.io/badge/Live-presend.pages.dev-0066cc?style=flat-square)](https://presend.pages.dev)

[![Tools](https://img.shields.io/badge/Browser_Tools-48-1F3A5F?style=flat-square)](https://presend.pages.dev)
[![API](https://img.shields.io/badge/API-42_endpoints-1F3A5F?style=flat-square)](https://presend.pages.dev/api)
[![MCP Server](https://img.shields.io/badge/MCP-36_tools-6c47ff?style=flat-square)](https://presend.pages.dev/mcp)
[![npm](https://img.shields.io/npm/v/presend-api?style=flat-square&label=npm&color=cb3837)](https://www.npmjs.com/package/presend-api)
[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-presend--check--action-2ea44f?style=flat-square)](https://github.com/marketplace/actions/presend-dependency-security-check)
[![Run in Postman](https://run.pstmn.io/button.svg)](https://god.gw.postman.com/run-collection/57808683-783f3f64-0f9f-433e-95f6-518520d14ccf?action=collection%2Ffork&collection-url=entityId%3D57808683-783f3f64-0f9f-433e-95f6-518520d14ccf%26entityType%3Dcollection%26workspaceId%3D8ffb507b-4140-4e42-8a44-fd6926d0b25b)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![PWA](https://img.shields.io/badge/PWA-Enabled-orange?style=flat-square)](https://presend.pages.dev)
[![Privacy](https://img.shields.io/badge/Privacy-First-ff6b6b?style=flat-square)](https://presend.pages.dev/privacy)

**Presend checks npm and PyPI packages before they are installed: typosquats, known vulnerabilities of the version you use, publisher changes (npm), and names that do not exist or were first published in the last 30 days. It is available as a free API, an MCP server for AI agents and a GitHub Action. The site also has free browser tools; the file tools process files locally.**

[Open Presend](https://presend.pages.dev) · [API docs](https://presend.pages.dev/api) · [OpenAPI spec](https://presend.pages.dev/openapi.json) · [MCP server](https://presend.pages.dev/mcp) · [Measurements](https://presend.pages.dev/measurements) · [For teams](https://presend.pages.dev/teams)

## Why Presend?

- **Before an agent installs a package** -- the MCP tool `supply_chain_check` reports `package_not_found` for a name that does not exist on npm or PyPI (it may be invented by a model) and `new_package` for one first published less than 30 days ago.
- **Measured false alarms** -- the typosquat check is measured on the most downloaded PyPI packages and the npm-high-impact list, with the scripts to reproduce it: see the [measurements page](https://presend.pages.dev/measurements).
- **Real supply-chain signal (API)** -- `maintainer-change-check` flags a package recently taken over by a previously unseen publisher after a long dormancy (the event-stream pattern; it does not detect hijacked existing accounts).
- **What it is not** -- not a malware scanner: it reports signals worth a look before installing, it does not analyse package code.
- **No account** -- the API and the MCP server are free, with no signup and no key; per-minute rate limits apply. A paid offer for teams is being tested: [Presend for teams](https://presend.pages.dev/teams).
- **Browser file tools** -- the file tools (EXIF, PDF, images, office files) run locally with Web Crypto, Canvas and FileReader. A few other tools rely on a network service (speech recognition, password breach lookup, link preview...); [the privacy page](https://presend.pages.dev/privacy) lists each one.
- **PWA** -- install on mobile or desktop.

## API & MCP Server

- **[REST API](https://presend.pages.dev/api)** -- free endpoints: supply-chain checks (typosquat, vulnerabilities of a given version, maintainer change, repository health, and a combined supply-chain check), DNS and WHOIS lookups, email checks, JWT decode and verify, file and image processing, and everyday utilities. Full [OpenAPI 3.0 spec](https://presend.pages.dev/openapi.json).
- **[MCP server](https://presend.pages.dev/mcp)** -- the same checks as tools over Streamable HTTP, no signup, no key; listed in the official MCP registry as `io.github.presendapp/presend-mcp`.
- **[npm client](https://www.npmjs.com/package/presend-api)** -- `npm install presend-api`, zero-dependency.
- **[GitHub Action](https://github.com/marketplace/actions/presend-dependency-security-check)** -- checks the dependencies of `package.json` or `requirements.txt` in CI (npm and PyPI).
- **[Code examples](https://github.com/presendapp/presend-examples)** -- working Python for LangChain, CrewAI, LlamaIndex, OpenAI Agents SDK, Google ADK, and plain REST.
- **[MCP config guides](https://github.com/presendapp/presend-mcp-config)** -- copy-paste setup for Claude Desktop, Claude Code, Cursor, and Windsurf, no code required.
- **[Browser extension](https://github.com/presendapp/presend-extension)** -- "Presend — Clean Photos", strips EXIF/GPS on right-click.

> **Python:** Cloudflare rejects the default `urllib` User-Agent (`Python-urllib/3.x`) with `403 error code: 1010`. Set an explicit one, e.g. `urllib.request.Request(url, headers={"User-Agent": "my-app/1.0"})`. `requests`, curl and Node are not affected.

## Browser Tools (48 total, 22 shown below)


| Tool | What it does | Link |
|---|---|---|
| **EXIF Remover** | Strip GPS, camera model, timestamps from photos | [Open](https://presend.pages.dev/tools/exif-remover) |
| **PDF Metadata Remover** | Remove author, software, dates from PDFs | [Open](https://presend.pages.dev/tools/pdf-metadata-remover) |
| **Image Compressor** | Shrink JPG/PNG/WebP with quality preview | [Open](https://presend.pages.dev/tools/image-compressor) |
| **PDF Compress** | Reduce PDF file size without quality loss | [Open](https://presend.pages.dev/tools/pdf-compress) |
| **PDF Merger** | Combine multiple PDFs into one document | [Open](https://presend.pages.dev/tools/pdf-merger) |
| **Image Resizer** | Resize to exact dimensions (Instagram, LinkedIn, Twitter) | [Open](https://presend.pages.dev/tools/image-resizer) |
| **HEIC to JPG Converter** | Convert iPhone photos to universal JPG | [Open](https://presend.pages.dev/tools/heic-converter) |
| **Video Metadata Remover** | Strip GPS and device data from MP4/MOV | [Open](https://presend.pages.dev/tools/video-metadata-remover) |
| **Office Metadata Remover** | Clean Word, Excel, PowerPoint hidden data | [Open](https://presend.pages.dev/tools/office-metadata-remover) |
| **File Hash Checker** | Verify SHA-256, SHA-1, SHA-512 checksums | [Open](https://presend.pages.dev/tools/file-hash-checker) |
| **Password Generator** | Create cryptographically secure passwords | [Open](https://presend.pages.dev/tools/password-generator) |
| **Password Strength** | Analyze password entropy and crack time | [Open](https://presend.pages.dev/tools/password-strength) |
| **QR Code Generator** | Generate QR codes for URLs, WiFi, text | [Open](https://presend.pages.dev/tools/qr-code-generator) |
| **URL Cleaner** | Remove tracking parameters (UTM, fbclid, gclid) | [Open](https://presend.pages.dev/tools/url-cleaner) |
| **Email List Cleaner** | Deduplicate, validate, clean email lists | [Open](https://presend.pages.dev/tools/email-list-cleaner) |
| **JSON to CSV Converter** | Convert between JSON and CSV instantly | [Open](https://presend.pages.dev/tools/json-csv-converter) |
| **Image to Base64** | Encode images for embedding in HTML/CSS | [Open](https://presend.pages.dev/tools/image-to-base64) |
| **Text Diff** | Compare two texts side by side | [Open](https://presend.pages.dev/tools/text-diff) |
| **Text Formatter** | Bold, italic, stylized text for social media | [Open](https://presend.pages.dev/tools/text-formatter) |
| **Thread Splitter** | Split long text into Twitter/X threads | [Open](https://presend.pages.dev/tools/thread-splitter) |
| **Word Counter** | Count words, characters, reading time | [Open](https://presend.pages.dev/tools/word-counter) |
| **Color Contrast** | Check WCAG accessibility contrast ratios | [Open](https://presend.pages.dev/tools/color-contrast) |

## SEO and Performance

Presend is built for search engines and AI assistants:

- **Schema.org**: structured data on the pages (Organization, FAQPage, BreadcrumbList...)
- **Sitemap**: a static `sitemap.xml` covering the tools, blog and guides in 8 languages
- **Dynamic OG Images**: API generates social preview images per tool
- **Core Web Vitals**: Preconnect, DNS-prefetch, CSS preload, zero render-blocking JS
- **PWA**: Service worker + manifest for offline use and installability
- **Privacy-First Analytics**: Cloudflare Web Analytics (no cookies, no IP tracking)

## Embed on Your Site

Add a Presend tool to your website or link back to us:

[See all embed options](https://presend.pages.dev/embed)

## Tech Stack

- **Frontend**: Vanilla HTML5, CSS3, ES6 (zero build step)
- **Hosting**: Cloudflare Pages (200+ edge locations)
- **APIs**: Cloudflare Workers (share links, analytics, sitemap, OG images)
- **Storage**: Cloudflare KV (share links, 30-day TTL)
- **PWA**: Service Worker + Web App Manifest

## License

MIT — free to use, modify, and embed.

[Open Presend](https://presend.pages.dev)
