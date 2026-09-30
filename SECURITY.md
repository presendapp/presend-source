# Security Policy

Presend is a live web service (not a versioned library), so there is
no "supported versions" table -- the version running at
https://presend.pages.dev is always the one in active support.

## Reporting a Vulnerability

Please report security issues privately using GitHub's private
vulnerability reporting, rather than a public issue:

https://github.com/presendapp/presend/security/advisories/new

We'll acknowledge reports within a few days and keep you updated as
we investigate and fix the issue. Please include:

- A clear description of the vulnerability
- Steps to reproduce it
- The potential impact, if you're able to assess it

## Scope

In scope: presend.pages.dev (the site and its /api/* endpoints), and
the presend-api npm client (github.com/presendapp/presend-api).

Out of scope: third-party services we query (URLhaus, OSV.dev,
Spamhaus DROP, RDAP, GitHub API, crt.sh, etc.) -- please report
issues with those services directly to their own maintainers.

Thank you for helping keep Presend and its users safe.
