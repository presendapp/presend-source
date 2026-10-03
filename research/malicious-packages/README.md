# Presend's typosquat check against real malicious packages

Measured on 3 October 2026. Name similarity can only catch malware that imitates a popular name, so this measures
how much of real malware that is.

## Data

Malicious packages recorded in OSV (`MAL-` advisories from the OpenSSF malicious-packages project) for npm and
PyPI, withdrawn advisories excluded. npm is split by year because 2025 has 191,307 entries, most with
random-looking names.

## Results

| Set | Flagged as typosquats |
|---|---|
| PyPI, 11,776 malicious packages | 628 (5.3%) |
| npm, other years, 30,554 | 93 (0.3%) |
| npm, published in 2025, 191,307 | 302 (0.2%) |
| Legitimate PyPI packages ranked 15,001-30,000 (never used to tune the check) | 41 of 15,000 (0.3%) |

Most malicious packages do not imitate a popular name. On npm, many are internal company names published for
dependency confusion, or spam. On PyPI, names that add a word to a target (`requests-beta`) are not caught by edit
distance. The flagged ones aim at the expected targets: `requests`, `beautifulsoup4`, `colorama` on PyPI,
`electron` on npm. This is why the check is a triage signal to use alongside a malware scanner, not instead of one.

## Caveats

- OSV records packages that were found and reported; malware nobody reported is not in it.
- The legitimate set was not reviewed package by package (`legit_flagged.json` lists the 41).
- Our other false-positive figures (top 15,000 PyPI, npm-high-impact) are measured on the lists the reviewed
  exceptions were drawn from; the ranks 15,001-30,000 figure is the out-of-sample one.

## Reproduce

From this directory (about 240 MB downloaded):

    python3 extract.py /tmp
    node measure.mjs /tmp
    node legit.mjs
