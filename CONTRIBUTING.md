# Contributing to Presend

Thanks for considering a contribution. Presend is a small, volunteer-maintained project, so please keep expectations proportional -- response times vary.

## Project structure

Presend is split across several repos:

- **[presend](https://github.com/presendapp/presend)** -- the main site, browser tools, and API (this repo)
- **[presend-api](https://github.com/presendapp/presend-api)** -- npm client for the API
- **[presend-extension](https://github.com/presendapp/presend-extension)** -- browser extension
- **[presend-check-action](https://github.com/presendapp/presend-check-action)** -- GitHub Action wrapping the security-check endpoints
- **[presend-examples](https://github.com/presendapp/presend-examples)** -- code examples for AI agent frameworks
- **[presend-mcp-config](https://github.com/presendapp/presend-mcp-config)** -- MCP config guides for GUI clients

Open issues/PRs against whichever repo the change actually belongs to.

## Reporting bugs

Use the [bug report issue template](.github/ISSUE_TEMPLATE/bug_report.md). Include:
- What you expected vs. what happened
- The exact URL/endpoint/tool involved
- Steps to reproduce, if possible

## Suggesting features

Use the [feature request issue template](.github/ISSUE_TEMPLATE/feature_request.md). Explain the use case, not just the feature -- it helps evaluate whether it fits the project's scope (free, no-signup, privacy-first).

## Quick start (GitHub Codespaces)

Click **Code -> Codespaces -> Create codespace** on this repo. Node 20, Python 3.11, and Wrangler CLI are installed automatically. Once ready, run `wrangler pages dev .` to serve the site + API locally on port 8788.

Not independently tested end-to-end by us -- the devcontainer config is new and hasn't been verified in an actual live Codespace, only checked for valid JSON syntax. If it breaks, please open an issue.

## Code contributions

1. Fork the repo, create a branch
2. Make your change
3. If you touched `functions/api/*.js`, test the endpoint manually against a real request before opening the PR -- there's no full local test harness for the API layer yet
4. If you touched `openapi.json`, keep it in sync with the actual endpoint behavior
5. Open a PR using the [pull request template](.github/PULL_REQUEST_TEMPLATE.md)

## Security issues

Do not open a public issue for a security vulnerability. See [SECURITY.md](SECURITY.md) for private reporting instructions.

## Style

- Vanilla HTML/CSS/JS for the client-side tools, no build step, no framework
- Cloudflare Pages Functions (plain JS, no framework) for the API
- Keep new API endpoints consistent with existing ones: CORS headers, rate limiting via the existing `checkRateLimit` pattern, sensible error responses
