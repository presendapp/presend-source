// GET /mcp -> info; POST /mcp -> JSON-RPC 2.0 (protocole MCP, transport Streamable HTTP sans état)
// Expose 41 des 48 endpoints comme "tools" MCP -- tous sauf les 7 endpoints
// binaires/fichiers (hash, clean-image, malware-check, file-type, image-similarity,
// merge-and-compress-pdf, qr-scan), délibérément exclus : faire transiter du contenu
// binaire encodé en base64 dans le contexte d'un agent IA est généralement peu pratique,
// pas seulement techniquement plus complexe.
// Généré automatiquement à partir de openapi.json -- garantit la cohérence avec la doc réelle.

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, MCP-Protocol-Version',
    ...extra,
  };
}

const PROTOCOL_VERSION = '2025-06-18';

// Tools that compute locally without contacting any external service (openWorldHint: false).
// Verified 2026-09-26: no fetch()/validateAndResolve()/connect() in their endpoint files or imports.
const CLOSED_WORLD = new Set(['base64', 'color', 'csv_json', 'email_disposable', 'iban_validate', 'jwt_decode', 'password', 'phone_verify', 'text_similarity', 'timestamp', 'tx_decode', 'typosquat_check', 'url_clean', 'user_agent', 'uuid']);
const API_BASE = 'https://presend.pages.dev/api';

const TOOLS = [
  {
    name: 'address_risk',
    description: "Screens a crypto address against every OFAC SDN digital currency address list. EVM (0x...) and Bitcoin (bc1..., 1..., 3...) addresses are fully covered (sanctioned true or false, with the matching lists). Addresses of other chains are flagged when listed; Cosmos SDK bech32 addresses return sanctioned: null when not listed, as OFAC publishes none. A sanctions signal only, not a full risk score.",
    inputSchema: {"type": "object", "properties": {"address": {"type": "string", "description": "Address to screen: EVM (0x + 40 hex chars) or Bitcoin (bc1..., 1..., 3...), both fully covered. Addresses of other chains are matched against their lists too; bech32 addresses of other chains (e.g. cosmos1...) return sanctioned: null (unchecked, not clean) when not listed."}}, "required": ["address"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/address-risk?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'ai_crawler_check',
    description: "Fetches a domain's robots.txt and reports which known AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot and others) are allowed or blocked, including wildcard rules. Reflects robots.txt only, not server-side blocking.",
    inputSchema: {"type": "object", "properties": {"domain": {"type": "string", "description": "Domain to check, e.g. example.com. robots.txt is fetched from https://<domain>/robots.txt."}}, "required": ["domain"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/ai-crawler-check?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'base64',
    description: "Encodes text to Base64 or decodes a Base64 string back to text (action = encode or decode).",
    inputSchema: {"type": "object", "properties": {"action": {"type": "string", "description": "Either 'encode' or 'decode'."}, "text": {"type": "string", "description": "Text to encode, or Base64 string to decode."}}, "required": ["action", "text"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/base64?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'color',
    description: "Converts a color between hex, RGB and HSL. Provide exactly one of hex, rgb or hsl.",
    inputSchema: {"type": "object", "properties": {"hex": {"type": "string", "description": "Hex color code, e.g. #ff0000 or ff0000. Provide exactly one of hex, rgb, or hsl."}, "rgb": {"type": "string", "description": "RGB color, e.g. 255,0,0. Provide exactly one of hex, rgb, or hsl."}, "hsl": {"type": "string", "description": "HSL color, e.g. 0,100%,50%. Provide exactly one of hex, rgb, or hsl."}}, "required": []},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/color?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'csv_json',
    description: "Converts CSV text to JSON or JSON to CSV (direction: csv-to-json or json-to-csv), for data passed inline. CSV must be comma-separated, with a header row and at least one data row; double-quoted fields may contain commas. Semicolon- or tab-separated input is not detected and comes back as a single column. JSON input must be an array of objects: the union of their keys becomes the CSV header and missing values are left empty. Returns result (the converted text), rows and cols. Max 500,000 characters.",
    inputSchema: {"type": "object", "properties": {"direction": {"type": "string", "description": "Either 'csv-to-json' or 'json-to-csv'."}, "data": {"type": "string", "description": "The CSV or JSON text to convert, matching the chosen direction."}}, "required": ["direction", "data"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/csv-json?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'cve_lookup',
    description: "Looks up a vulnerability by identifier (CVE, GHSA or other OSV ID) on OSV.dev: summary, CVSS severity, affected packages and versions, references. Use when you already have an ID; use vulnerability_check when you have a package name instead.",
    inputSchema: {"type": "object", "properties": {"id": {"type": "string", "description": "CVE, GHSA, or other OSV-native identifier, e.g. CVE-2021-44228."}}, "required": ["id"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/cve-lookup?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'dns_lookup',
    description: "Returns DNS records for a domain via Cloudflare DNS-over-HTTPS: A, AAAA, CNAME, MX, TXT and NS in one call, or a single record type with 'type'. For registration data use whois_lookup; for SPF/DMARC/DKIM analysis use email_security.",
    inputSchema: {"type": "object", "properties": {"domain": {"type": "string", "description": "Domain to look up, e.g. example.com."}, "type": {"type": "string", "description": "Narrow to a single record type. Omit to get all 6 at once."}}, "required": ["domain"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/dns-lookup?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'email_disposable',
    description: "Checks only whether an email address uses a known disposable/temporary email domain. For syntax, MX, disposable and role-account checks in one call, use email_verify.",
    inputSchema: {"type": "object", "properties": {"email": {"type": "string", "description": "Email address to check against a list of known disposable/temporary email domains."}}, "required": ["email"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/email-disposable?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'email_security',
    description: "Audits a domain's email anti-spoofing setup: SPF strength, DMARC policy and a best-effort DKIM lookup on common selectors. A missing DKIM match does not prove DKIM is absent. Checks a domain, not a single address.",
    inputSchema: {"type": "object", "properties": {"domain": {"type": "string", "description": "Domain to check SPF, DKIM, and DMARC records for, e.g. example.com."}}, "required": ["domain"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/email-security?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'email_validate',
    description: "Lightweight email check: syntax plus confirmation that the domain has an MX record. Does not detect disposable or role addresses; use email_verify for the combined check.",
    inputSchema: {"type": "object", "properties": {"email": {"type": "string", "description": "Email address to validate for correct syntax and a resolvable domain."}}, "required": ["email"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/email-validate?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'email_verify',
    description: "Most complete email check in one call: syntax, MX record, disposable-domain detection and role/generic account detection (e.g. info@, admin@). Prefer it over email_validate and email_disposable unless you need a single signal. Does not probe the mailbox. valid is null (not false) when the MX lookup could not be completed; retry later instead of treating the address as invalid.",
    inputSchema: {"type": "object", "properties": {"email": {"type": "string", "description": "Email address to run through combined syntax, disposable-domain, and MX-record checks."}}, "required": ["email"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/email-verify?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'favicon',
    description: "Returns the favicon URL a website declares: fetches the homepage and takes the first <link rel='icon'> (or 'shortcut icon') href, resolved to an absolute URL, which may be a data: URI when the page inlines its icon (source: declared). If no icon is declared, or the homepage cannot be fetched, returns the conventional https://<domain>/favicon.ico with source: default and a note, without checking that it exists. Use it to display a site icon; it does not download or validate the image.",
    inputSchema: {"type": "object", "properties": {"domain": {"type": "string", "description": "Domain to fetch the favicon URL for, e.g. example.com."}}, "required": ["domain"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/favicon?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'iban_validate',
    description: "Validates an IBAN offline: ISO 7064 mod-97 checksum and country-specific length. Confirms the number is well-formed, not that the account exists.",
    inputSchema: {"type": "object", "properties": {"iban": {"type": "string", "description": "IBAN to validate. Spaces are ignored."}}, "required": ["iban"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/iban-validate?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'ip_reputation',
    description: "Checks an IPv4 or IPv6 address against a curated list of netblocks known to be hijacked or run by spam/cyber-crime operations (IPv4-mapped IPv6 uses the IPv4 list). A narrow list-based signal: a clean result is not a safety guarantee. Includes list date and attribution.",
    inputSchema: {"type": "object", "properties": {"ip": {"type": "string", "description": "IPv4 or IPv6 address to check (IPv4-mapped IPv6 such as ::ffff:1.2.3.4 is checked against the IPv4 list) against a curated list of known hijacked or cyber-crime-controlled netblocks."}}, "required": ["ip"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/ip-reputation?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'jwt_decode',
    description: "Decodes a JWT's header and payload WITHOUT verifying its signature, so its claims must not be trusted on this basis alone. To check authenticity, use jwt_verify.",
    inputSchema: {"type": "object", "properties": {"token": {"type": "string", "description": "The JWT to decode. Decodes header and payload only -- does not verify the signature (use /jwt-verify for that)."}}, "required": ["token"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/jwt-decode?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'jwt_verify',
    description: "Cryptographically verifies a JWT signature (HS256/384/512, RS/PS256/384/512, ES256/384/512) and checks exp/nbf claims. Provide a secret for HS*, or a JWK or JWKS URL for RS/PS/ES. Use instead of jwt_decode whenever authenticity matters.",
    inputSchema: {"type": "object", "properties": {"token": {"type": "string", "description": "The JWT to verify. Checks the cryptographic signature -- use /jwt-decode if you only need to read the header and payload."}, "secret": {"type": "string", "description": "Required for HS256/384/512."}, "jwk": {"type": "object", "description": "Public key in JWK format, for RS/PS/ES algorithms."}, "jwks_url": {"type": "string", "description": "URL to a JWKS document; the key is matched by the token's \"kid\" header."}}, "required": ["token"]},
    request: (args) => ({ method: 'POST', url: `${API_BASE}/jwt-verify`, body: JSON.stringify(args) }),
  },
  {
    name: 'link_metadata',
    description: "Fetches a web page and extracts its title, description, canonical URL, Open Graph and Twitter Card tags (the data behind link previews). To follow a URL's redirects hop by hop, use redirect_trace.",
    inputSchema: {"type": "object", "properties": {"url": {"type": "string", "description": "URL to extract title, description, and Open Graph / Twitter Card metadata from."}}, "required": ["url"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/link-metadata?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'maintainer_change_check',
    description: "npm only. Flags a previously unseen human publisher taking over a package after 180+ days of inactivity, within the last 365 days (the event-stream attack pattern). npm trusted publishing (verified OIDC identity, not just a bot-like account name), pre-release, and handovers to a publisher who already maintains another widely used package (100k+ weekly downloads) are reported but not flagged. Does not detect hijacked existing accounts; a heuristic for review, not proof.",
    inputSchema: {"type": "object", "properties": {"ecosystem": {"type": "string", "description": "Currently only 'npm' is supported."}, "package": {"type": "string", "description": "Package name, e.g. lodash"}}, "required": ["ecosystem", "package"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/maintainer-change-check?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'password',
    description: "Generates a random password, with options for length, symbols, uppercase, numbers and excluding ambiguous characters. To evaluate an existing password, use password_check.",
    inputSchema: {"type": "object", "properties": {"length": {"type": "string", "description": "Desired password length. Defaults to a reasonable secure length if omitted."}, "symbols": {"type": "string", "description": "Whether to include symbol characters. 1 for yes, 0 for no."}, "uppercase": {"type": "string", "description": "Whether to include uppercase letters. 1 for yes, 0 for no."}, "numbers": {"type": "string", "description": "Whether to include numeric digits. 1 for yes, 0 for no."}, "exclude_ambiguous": {"type": "string", "description": "Whether to exclude visually ambiguous characters (e.g. 0/O, 1/l). 1 for yes, 0 for no."}}, "required": []},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/password?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'password_breach',
    description: "Checks whether a password appears in known data breaches (Have I Been Pwned) and how many times, using k-anonymity towards HIBP. Breach check only; password_check adds strength scoring and sends the password in a POST body.",
    inputSchema: {"type": "object", "properties": {"password": {"type": "string", "description": "Password to check against known data-breach corpora. Only a 5-character SHA-1 hash prefix is sent to HIBP (k-anonymity), but the password itself travels in this request's URL; for real passwords, prefer password_check, which takes it in a POST body."}}, "required": ["password"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/password-breach?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'password_check',
    description: "Scores a password's strength (length, character variety, entropy, common patterns) and, with check_breach=true, also looks it up in Have I Been Pwned breach data via k-anonymity (only a hash prefix is sent). Use it to evaluate a password someone is choosing; use password_breach when you only need the breach count, and password to generate a new one. The password travels in a POST body, never in a URL.",
    inputSchema: {"type": "object", "properties": {"password": {"type": "string", "description": "Password to evaluate for strength (length, character variety, common patterns)."}, "check_breach": {"type": "boolean", "description": "Whether to also check the password against known data-breach corpora via k-anonymity. true or false."}}, "required": ["password"]},
    request: (args) => ({ method: 'POST', url: `${API_BASE}/password-check`, body: JSON.stringify(args) }),
  },
  {
    name: 'phone_verify',
    description: "Validates and formats a phone number: validity, country, line type, E.164, international and national formats. Numbers without a leading + require 'country', since the end user's country cannot be inferred over MCP.",
    inputSchema: {"type": "object", "properties": {"number": {"type": "string", "description": "Phone number to validate and format, ideally in E.164 format (e.g. +14155552671)."}, "country": {"type": "string", "description": "ISO 3166-1 alpha-2 country code (e.g. US, FR). Required unless the number starts with +: over MCP the end user's country cannot be inferred."}}, "required": ["number"]},
    // Via MCP, "l'appelant" est notre propre serveur : le pays déduit de son IP
    // (un datacenter Cloudflare) ne dit rien de l'utilisateur -- on ne devine pas.
    validate: (args) => (!args.country && !String(args.number || '').trim().startsWith('+'))
      ? 'Provide "country" (ISO 3166-1 alpha-2, e.g. FR) or a number in international format starting with "+". Over MCP the end user\'s country cannot be inferred, and guessing it from the request IP would misread local numbers.'
      : null,
    request: (args) => ({ method: 'GET', url: `${API_BASE}/phone-verify?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'redirect_trace',
    description: "Follows a URL's full redirect chain (up to 15 hops) and returns every hop with its status code, plus whether the chain crossed domains. Use it to see where a short or tracking link really leads; check the final URL with url_reputation.",
    inputSchema: {"type": "object", "properties": {"url": {"type": "string", "description": "URL to follow the full redirect chain for, hop by hop."}}, "required": ["url"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/redirect-trace?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'repo_health_check',
    description: "Maintenance signals for a GitHub repository given as owner/name: stars, forks, open issues, license, archived and fork flags, creation date and age, days since last push, topics. Use it to judge whether a dependency looks maintained or abandoned. For an npm or PyPI package whose repository you do not know, supply_chain_check resolves it from registry metadata and includes these signals. GitHub only; missing or private repositories return found: false.",
    inputSchema: {"type": "object", "properties": {"repo": {"type": "string", "description": "GitHub repository in owner/name format, e.g. lodash/lodash."}}, "required": ["repo"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/repo-health-check?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'rpc_check',
    description: "Read-only audit of a public CometBFT (Cosmos SDK) RPC endpoint: node status, health, peers, and whether unsafe admin methods (dial_seeds, dial_peers, unsafe_flush_mempool) are publicly exposed. Never calls an unsafe method; exposure is inferred from the node's route listing.",
    inputSchema: {"type": "object", "properties": {"url": {"type": "string", "description": "Base URL of a CometBFT RPC endpoint to audit, e.g. https://rpc.cosmos.network:443."}}, "required": ["url"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/rpc-check?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'security_headers',
    description: "Audits the HTTP security headers of one URL (CSP, HSTS, X-Frame-Options, Permissions-Policy, cross-origin policies and others) and returns per-header findings with fix advice, a score and a letter grade. Use it when you need header hardening advice; security_scan runs this audit together with URL reputation and subdomain discovery in one call.",
    inputSchema: {"type": "object", "properties": {"url": {"type": "string", "description": "URL to audit HTTP security headers for (CSP, HSTS, X-Frame-Options, etc.)."}}, "required": ["url"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/security-headers?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'security_scan',
    description: "Combined website check in one call: security headers, URL reputation and passive subdomain discovery, run in parallel, with an overall score and verdict. Use the individual tools when you need a single signal.",
    inputSchema: {"type": "object", "properties": {"url": {"type": "string", "description": "URL to run a combined security posture check against (headers, reputation, and related signals)."}}, "required": ["url"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/security-scan?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'subdomains',
    description: "Passive subdomain discovery from Certificate Transparency logs (crt.sh): finds hostnames that appeared in public TLS certificates, not every DNS record. crt.sh is occasionally slow or unavailable.",
    inputSchema: {"type": "object", "properties": {"domain": {"type": "string", "description": "Domain to passively discover subdomains for via Certificate Transparency logs, e.g. example.com."}}, "required": ["domain"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/subdomains?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'supply_chain_check',
    description: "One-call risk check for a package: combines vulnerability_check (OSV.dev), typosquat_check, maintainer_change_check (npm only) and repo_health_check (when the GitHub repo can be resolved) into one overall verdict. Use before adding a dependency; use the individual tools to investigate one signal.",
    inputSchema: {"type": "object", "properties": {"ecosystem": {"type": "string", "description": "Package ecosystem, e.g. npm. maintainer-change-check only runs for npm."}, "package": {"type": "string", "description": "Package name to check."}}, "required": ["ecosystem", "package"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/supply-chain-check?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'text_similarity',
    description: "Near-duplicate detection with a 64-bit SimHash over word shingles: send 1 text to get its hash, or 2 texts to compare them. Detects paraphrased or lightly edited copies; unrelated texts score around 50%, not 0%.",
    inputSchema: {"type": "object", "properties": {"texts": {"type": "array", "description": "1 text (hash only) or 2 texts (compare). Max 200,000 characters each."}}, "required": ["texts"]},
    request: (args) => ({ method: 'POST', url: `${API_BASE}/text-similarity`, body: JSON.stringify(args) }),
  },
  {
    name: 'timestamp',
    description: "Returns the current time, or converts between a Unix timestamp (seconds) and an ISO date. Provide unix or date, or neither for the current time.",
    inputSchema: {"type": "object", "properties": {"unix": {"type": "string", "description": "Unix timestamp (seconds since epoch) to convert to a human-readable date. Provide either unix or date, not both."}, "date": {"type": "string", "description": "Date/time string to convert to a Unix timestamp. Provide either unix or date, not both."}}, "required": []},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/timestamp?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'tx_decode',
    description: "Decodes a raw signed Cosmos SDK transaction (base64 TxRaw bytes, as found in a CometBFT block's data.txs) into JSON: messages, fee, gas, signers and signatures. Bank, staking, gov and authz messages are fully decoded; other types are returned as type URL plus raw hex.",
    inputSchema: {"type": "object", "properties": {"tx": {"type": "string", "description": "Base64-encoded Cosmos SDK TxRaw protobuf bytes, as returned by a chain's CometBFT RPC /block or /tx_search endpoints."}}, "required": ["tx"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/tx-decode?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'typosquat_check',
    description: "Checks whether an npm or PyPI package name is a near-miss of a well-known package (typosquatting), with an edit-distance threshold scaled to name length; names of 3 characters or fewer are not fuzzy-matched. Uses a curated list of popular names, so a clean result does not prove a package is safe.",
    inputSchema: {"type": "object", "properties": {"ecosystem": {"type": "string", "description": "Package ecosystem, e.g. npm or PyPI."}, "package": {"type": "string", "description": "Package name to check for likely typosquatting of a well-known package in the given ecosystem."}}, "required": ["ecosystem", "package"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/typosquat-check?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'url_clean',
    description: "Removes 60+ known tracking parameters (utm_*, fbclid, gclid and similar) from a URL and returns the clean URL. Does not follow redirects; for that, use redirect_trace.",
    inputSchema: {"type": "object", "properties": {"url": {"type": "string", "description": "URL to strip tracking parameters from (utm_*, fbclid, gclid, and similar)."}}, "required": ["url"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/url-clean?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'url_reputation',
    description: "Checks a URL against URLhaus (abuse.ch), a public database of known malware distribution URLs. A clean result only means the URL is not listed, not that it is safe.",
    inputSchema: {"type": "object", "properties": {"url": {"type": "string", "description": "URL to check against known phishing/malware URL databases."}}, "required": ["url"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/url-reputation?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'user_agent',
    description: "Parses a User-Agent string into browser and version, operating system and version, device type, and whether it looks like a bot.",
    inputSchema: {"type": "object", "properties": {"ua": {"type": "string", "description": "User-Agent string to parse. Required over MCP: the server cannot see the end user's own User-Agent."}}, "required": ["ua"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/user-agent?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'uuid',
    description: "Generates 1 to 100 random UUID v4 values.",
    inputSchema: {"type": "object", "properties": {"count": {"type": "string", "description": "Number of UUIDs (v4) to generate. Defaults to 1 if omitted."}}, "required": []},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/uuid?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'vat_validate',
    description: "Checks an EU VAT number in real time against the European Commission's VIES service and, when valid, returns the registered company name and address. VIES is occasionally unavailable for some member states.",
    inputSchema: {"type": "object", "properties": {"country": {"type": "string", "description": "2-letter EU country code (EL for Greece, XI for Northern Ireland). Optional if vat includes the prefix."}, "vat": {"type": "string", "description": "VAT number, with or without the country prefix."}}, "required": ["vat"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/vat-validate?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'vulnerability_check',
    description: "Checks a package (optionally a specific version) against OSV.dev for known vulnerabilities: npm, PyPI, Go, crates.io, Maven, RubyGems, Packagist and NuGet. Use cve_lookup when you already have a CVE/GHSA ID, or supply_chain_check for a combined verdict.",
    inputSchema: {"type": "object", "properties": {"ecosystem": {"type": "string", "description": "Package ecosystem, e.g. npm, PyPI, Go, crates.io, Maven, RubyGems, Packagist, or NuGet."}, "package": {"type": "string", "description": "Package name to check against OSV.dev for known CVEs."}, "version": {"type": "string", "description": "Omit to check all versions of the package."}}, "required": ["ecosystem", "package"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/vulnerability-check?${new URLSearchParams(args).toString()}` }),
  },
  {
    name: 'whois_lookup',
    description: "Domain registration data via RDAP (the modern WHOIS): registrar, creation and expiration dates, domain age in days, nameservers. For DNS records, use dns_lookup.",
    inputSchema: {"type": "object", "properties": {"domain": {"type": "string", "description": "Domain to look up registration details for via RDAP, e.g. example.com."}}, "required": ["domain"]},
    request: (args) => ({ method: 'GET', url: `${API_BASE}/whois-lookup?${new URLSearchParams(args).toString()}` }),
  }
];

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}
function jsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

async function handleRequest(body) {
  const { id, method, params } = body;

  if (method === 'initialize') {
    return jsonRpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: 'presend-mcp', version: '3.1.1' },
    });
  }

  if (method === 'notifications/initialized') {
    return null;
  }

  if (method === 'tools/list') {
    return jsonRpcResult(id, {
      tools: TOOLS.map(({ name, description, inputSchema }) => ({
        name, description, inputSchema,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: !CLOSED_WORLD.has(name) },
      })),
    });
  }

  if (method === 'tools/call') {
    const tool = TOOLS.find((t) => t.name === params?.name);
    if (!tool) {
      return jsonRpcError(id, -32602, `Unknown tool: ${params?.name}`);
    }
    const args = params.arguments || {};
    const invalid = tool.validate ? tool.validate(args) : null;
    if (invalid) {
      return jsonRpcResult(id, { content: [{ type: 'text', text: `Error: ${invalid}` }], isError: true });
    }
    try {
      const { method: httpMethod, url, body: reqBody } = tool.request(args);
      const fetchOpts = { method: httpMethod };
      if (reqBody) {
        fetchOpts.headers = { 'Content-Type': 'application/json' };
        fetchOpts.body = reqBody;
      }
      const res = await fetch(url, fetchOpts);
      const data = await res.json();
      return jsonRpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        isError: !res.ok,
      });
    } catch (e) {
      return jsonRpcResult(id, {
        content: [{ type: 'text', text: `Error: ${e.message}` }],
        isError: true,
      });
    }
  }

  return jsonRpcError(id, -32601, `Method not found: ${method}`);
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet() {
  return new Response(JSON.stringify({
    name: 'Presend MCP Server',
    protocol: 'Model Context Protocol (Streamable HTTP)',
    protocolVersion: PROTOCOL_VERSION,
    tool_count: TOOLS.length,
    tools: TOOLS.map((t) => t.name),
    usage: 'POST JSON-RPC 2.0 requests to this same URL.',
  }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
}

export async function onRequestPost(context) {
  const { request } = context;
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify(jsonRpcError(null, -32700, 'Parse error')), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const result = await handleRequest(body);
  if (result === null) {
    return new Response(null, { status: 202, headers: corsHeaders() });
  }
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
