# Presend — Free Privacy Tools, a Security API, and an MCP Server for AI Agents

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/presendapp/presend)
[![Live Site](https://img.shields.io/badge/Live-presend.pages.dev-0066cc?style=flat-square)](https://presend.pages.dev)
[![API Tests](https://github.com/presendapp/presend/actions/workflows/api-tests.yml/badge.svg)](https://github.com/presendapp/presend/actions/workflows/api-tests.yml)
[![Tools](https://img.shields.io/badge/Browser_Tools-48-1F3A5F?style=flat-square)](https://presend.pages.dev)
[![API](https://img.shields.io/badge/API-42_endpoints-1F3A5F?style=flat-square)](https://presend.pages.dev/api)
[![MCP Server](https://img.shields.io/badge/MCP-36_tools-6c47ff?style=flat-square)](https://presend.pages.dev/mcp)
[![npm](https://img.shields.io/npm/v/presend-api?style=flat-square&label=npm&color=cb3837)](https://www.npmjs.com/package/presend-api)
[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-presend--check--action-2ea44f?style=flat-square)](https://github.com/marketplace/actions/presend-dependency-security-check)
[![Run in Postman](https://run.pstmn.io/button.svg)](https://god.gw.postman.com/run-collection/57808683-783f3f64-0f9f-433e-95f6-518520d14ccf?action=collection%2Ffork&collection-url=entityId%3D57808683-783f3f64-0f9f-433e-95f6-518520d14ccf%26entityType%3Dcollection%26workspaceId%3D8ffb507b-4140-4e42-8a44-fd6926d0b25b)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![PWA](https://img.shields.io/badge/PWA-Enabled-orange?style=flat-square)](https://presend.pages.dev)
[![Privacy](https://img.shields.io/badge/Privacy-First-ff6b6b?style=flat-square)](https://presend.pages.dev/privacy)

**Presend is three things: 48 free browser-based file tools (nothing ever uploaded), a free 48-endpoint security/utility API (no signup, no key), and an MCP server exposing 41 of those endpoints to AI agents.**

[Open Presend](https://presend.pages.dev) · [API docs](https://presend.pages.dev/api) · [OpenAPI spec](https://presend.pages.dev/openapi.json) · [MCP server](https://presend.pages.dev/mcp)

## Why Presend?

Unlike most online tools, **Presend processes files entirely locally in your browser** -- your files never leave your device. And unlike most free API directories, the API layer has no signup wall or aggressive rate limits gating basic use.

- **100% Private (browser tools)** -- Web Crypto API, Canvas API, FileReader -- all client-side
- **Real supply-chain security (API)** -- `maintainer-change-check` flags a package recently taken over by a previously unseen publisher after a long dormancy (the event-stream pattern; it does not detect hijacked existing accounts)
- **Instant** -- Cloudflare CDN, loads in under 1 second globally
- **PWA** -- Install on mobile/desktop, works offline
- **Free Forever** -- No freemium, no watermarks, no limits

## API & MCP Server

- **[REST API](https://presend.pages.dev/api)** -- 40 free endpoints: security & verification (WHOIS/DNS, package vulnerability & typosquat checks, malware scanning, JWT decode/verify, GitHub repo health, maintainer-change detection), file & image processing, and everyday utilities. Full [OpenAPI 3.0 spec](https://presend.pages.dev/openapi.json).
- **[MCP server](https://presend.pages.dev/mcp)** -- 33 tools over Streamable HTTP, no signup, no key. Verified working with LangChain, CrewAI, LlamaIndex, OpenAI's Agents SDK, and Google's ADK.
- **[npm client](https://www.npmjs.com/package/presend-api)** -- `npm install presend-api`, zero-dependency, wraps 42 methods.
- **[GitHub Action](https://github.com/marketplace/actions/presend-dependency-security-check)** -- drop-in dependency security scanning (npm + PyPI) for any CI pipeline.
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

- **Schema.org**: HowTo, FAQPage, SoftwareApplication, BreadcrumbList, Organization on every page
- **Dynamic Sitemap**: 842 URLs auto-updated (40 tools + blog/guide pages, across 8 languages)
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
