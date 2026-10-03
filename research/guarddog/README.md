# GuardDog's typosquatting heuristic: false positives on popular packages

Measured on 3 October 2026 by Presend. Affiliation: we maintain a typosquat check of our own and publish its
measured false-positive rate at https://presend.pages.dev/measurements. GuardDog commit `1f4a66c`
(DataDog/guarddog, branch `v3`).

## What is measured

GuardDog flags a package when its name is one edit (Levenshtein or adjacent swap) away from a name in its
bundled top-package list, or from a `py`/`python` variant or a hyphen permutation of one. Names in the list
are never flagged. We ran GuardDog's own code on legitimate packages just outside that list:

- **A, npm:** packages of the npm-high-impact list (Titus Wormer) that are not among GuardDog's 8,000 npm names.
- **B, PyPI, scenario of PR #799** (10,000-name list): ranks 10,001-15,000 of the hugovk 30-day ranking,
  against the top 10,000 of the same ranking (an approximation of the ClickHouse list proposed in #799).
- **C, PyPI, current state:** ranks 15,001-30,000 by September 2026 downloads (ClickHouse
  `pypi.pypi_downloads_per_month`, the query from #799), against GuardDog's bundled 15,000 names.

## Results

| | Checked | Flagged |
|---|---|---|
| A. npm-high-impact outside the 8,000 npm names | 12,111 | 263 (2.2%) |
| B. PyPI ranks 10,001-15,000 vs a 10,000 list | 5,000 | 351 (7.0%) |
| C. PyPI ranks 15,001-30,000 vs the bundled 15,000 | 15,000 | 1,002 (6.7%) |

False positives grow with the size of the target list (A and B, counting a package as flagged when at least
one of its targets is within the top N):

| Targets | A (npm) | B (PyPI) |
|---|---|---|
| top 1,000 | 88 | 65 |
| top 2,000 / 2,500 | 152 | 147 |
| top 4,000 / 5,000 | 217 | 234 |
| full list (8,000 / 10,000) | 263 | 351 |

Detection of known typosquats (27, from Presend's test fixtures) does not grow past a few thousand targets:
npm 10, 12, 14 and 14 of 15 with 1,000, 2,000, 4,000 and 8,000 targets (`moongose` is two edits away from
`mongoose`); PyPI 11 of 12 with 1,000 and 12 of 12 with 2,500 and 5,000.

## Caveats

- Not every flagged package was reviewed. In a random sample of 12 from C, 11 are clearly legitimate; one
  recent package (`cartapy`, first release August 2026, one letter from `cartopy`) deserves a look.
  The flagged lists are in `results/`.
- The known-typosquat set is small and targets very popular packages: read the detection figures as a trend.
  It lists `beautifulsoup`, which is the legitimate Beautiful Soup 3 project, so its "miss" with 10,000 and
  15,000 targets (where it is itself in the list) is not a real loss.
- B approximates the list of #799 with the hugovk ranking.

## Reproduce

About 10 minutes; needs `requests`, `packaging`, `node` and `npm`. From this directory:

    git clone https://github.com/DataDog/guarddog
    python3 measure.py --guarddog guarddog --fixtures ../../tests/typosquat/fixtures.json --out results

Every measurement compares the fast path with GuardDog's `get_typosquatted_package` on a sample of 50 names
and stops on any difference.
