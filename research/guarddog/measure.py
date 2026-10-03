#!/usr/bin/env python3
"""Measure false positives of GuardDog's typosquatting heuristic on popular packages, with GuardDog's own code.

Usage:
    python3 measure.py --guarddog PATH_TO_GUARDDOG_CLONE --fixtures PATH_TO_fixtures.json [--out DIR]

Needs: requests, packaging, node and npm (the npm-high-impact list is installed into /tmp/nhi if missing).
GuardDog's detectors are imported from the clone without running its package __init__ files (which pull in
heavy scanners). For speed, the forms of each popular name are computed once and only forms of length +-1 are
compared, since both of GuardDog's tests return False beyond that; the predicate is GuardDog's own
_is_length_one_edit_away, and every measurement is checked against get_typosquatted_package on a sample.
"""
import argparse, inspect, json, os, random, subprocess, sys, time, types
from datetime import datetime, timedelta
from multiprocessing import Pool

import packaging.utils
import requests

ap = argparse.ArgumentParser()
ap.add_argument('--guarddog', required=True)
ap.add_argument('--fixtures', required=True, help="Presend's tests/typosquat/fixtures.json (known typosquats)")
ap.add_argument('--out', default='.')
args = ap.parse_args()
REPO = os.path.abspath(args.guarddog)
for mod in ('guarddog', 'guarddog.utils', 'guarddog.analyzer', 'guarddog.analyzer.metadata',
            'guarddog.analyzer.metadata.pypi', 'guarddog.analyzer.metadata.npm'):
    m = types.ModuleType(mod); m.__path__ = [os.path.join(REPO, *mod.split('.'))]; sys.modules[mod] = m
from guarddog.analyzer.metadata.typosquatting import TyposquatDetector
import guarddog.analyzer.metadata.pypi.typosquatting as pymod
import guarddog.analyzer.metadata.npm.typosquatting as npmmod

canon = packaging.utils.canonicalize_name
RES = os.path.join(REPO, 'guarddog/analyzer/metadata/resources')
UA = {'User-Agent': 'presend-guarddog-measure'}

def cls_of(mod):
    return [c for _, c in inspect.getmembers(mod, inspect.isclass)
            if issubclass(c, TyposquatDetector) and c is not TyposquatDetector][0]

def make(cls, popular):
    d = object.__new__(cls); d.popular_packages = set(popular); return d

class Fast:
    def __init__(self, det):
        self.det, self.by_len = det, {}
        for p in det.popular_packages:
            for f in [p] + det._get_confused_forms(p) + det._generate_permutations(p):
                self.by_len.setdefault(len(f), []).append((f, p))
    def flag(self, name):
        if name in self.det.popular_packages:
            return []
        out = set()
        for l in (len(name) - 1, len(name), len(name) + 1):
            for f, p in self.by_len.get(l, ()):
                if p not in out and self.det._is_length_one_edit_away(name, f):
                    out.add(p)
        return sorted(out)

FAST = None
def work(name):
    return name, FAST.flag(name)

def measure(label, det, candidates):
    global FAST
    t = time.time(); FAST = Fast(det)
    with Pool() as pool:
        res = dict(pool.map(work, candidates, chunksize=50))
    flagged = {n: v for n, v in res.items() if v}
    sample = (random.Random(1).sample(sorted(flagged), min(25, len(flagged)))
              + random.Random(2).sample(candidates, min(25, len(candidates))))
    for n in sample:
        if sorted(det.get_typosquatted_package(n)) != res[n]:
            sys.exit('equivalence check failed on %r' % n)
    print('%s: %d checked, %d flagged (%.1f%%), equivalence verified on %d names, %.0f s'
          % (label, len(candidates), len(flagged), 100.0 * len(flagged) / len(candidates), len(sample), time.time() - t))
    return flagged

def by_list_size(flagged, ranked_targets, sizes):
    rank = {n: i for i, n in enumerate(ranked_targets)}
    return {k: sum(1 for ts in flagged.values() if any(rank.get(t, 10**9) < k for t in ts)) for k in sizes}

def npm_high_impact():
    lib = '/tmp/nhi/node_modules/npm-high-impact/index.js'
    if not os.path.exists(lib):
        subprocess.check_call('mkdir -p /tmp/nhi && npm i -s --prefix /tmp/nhi npm-high-impact', shell=True)
    return json.loads(subprocess.check_output(['node', '-e', "import('%s').then(m => console.log("
                      "JSON.stringify(Object.values(m).find(Array.isArray))))" % lib]))

def clickhouse_top(n, month):
    base = ("SELECT SUM(count) AS download_count, project FROM pypi.pypi_downloads_per_month "
            "WHERE month = '%s' GROUP BY project ORDER BY download_count DESC, project " % month)
    rows = []
    for off in range(0, n, 5000):
        r = requests.post('https://sql-clickhouse.clickhouse.com', params={'user': 'demo', 'default_format': 'JSON'},
                          data=(base + 'LIMIT 5000 OFFSET %d' % off).encode(), headers=UA, timeout=180)
        r.raise_for_status(); rows += r.json()['data']
    return [canon(r['project']) for r in rows]

if __name__ == '__main__':
    out = {'date': datetime.now().strftime('%Y-%m-%d'),
           'guarddog_commit': subprocess.check_output(['git', '-C', REPO, 'rev-parse', '--short', 'HEAD'], text=True).strip()}
    npm_top = json.load(open(os.path.join(RES, 'top_npm_packages.json')))['packages']
    py_top = [canon(n) for n in json.load(open(os.path.join(RES, 'top_pypi_packages.json')))['packages']]
    out['bundled_list_sizes'] = {'npm': len(npm_top), 'pypi': len(py_top)}

    nhi = npm_high_impact(); npm_set = set(npm_top)
    A = measure('A npm-high-impact vs bundled npm list', make(cls_of(npmmod), npm_top), [n for n in nhi if n not in npm_set])
    out['A'] = {'checked': len([n for n in nhi if n not in npm_set]), 'flagged': len(A),
                'by_list_size': by_list_size(A, npm_top, (1000, 2000, 4000, 8000))}

    hug = [canon(r['project']) for r in requests.get(
        'https://hugovk.dev/top-pypi-packages/top-pypi-packages-30-days.min.json', headers=UA, timeout=60).json()['rows']]
    B = measure('B PyPI ranks 10,001-15,000 vs top 10,000 (#799)', make(cls_of(pymod), hug[:10000]), hug[10000:15000])
    out['B'] = {'checked': 5000, 'flagged': len(B), 'by_list_size': by_list_size(B, hug, (1000, 2500, 5000, 10000))}

    month = (datetime.now() - timedelta(days=32)).strftime('%Y-%m-01')
    ranked = clickhouse_top(30000, month)
    C = measure('C PyPI ranks 15,001-30,000 vs bundled PyPI list', make(cls_of(pymod), py_top), ranked[15000:30000])
    out['C'] = {'checked': 15000, 'flagged': len(C), 'clickhouse_month': month}

    known = json.load(open(args.fixtures))['typosquats']
    out['known_typosquats'] = {}
    for eco_key, pairs in known.items():
        eco = 'npm' if eco_key.lower() == 'npm' else 'pypi'
        top, mod = (npm_top, npmmod) if eco == 'npm' else (py_top, pymod)
        norm = (lambda x: x) if eco == 'npm' else canon
        sizes = (1000, 2000, 4000, 8000) if eco == 'npm' else (1000, 2500, 5000, 10000, 15000)
        out['known_typosquats'][eco] = {}
        for k in sizes:
            fast = Fast(make(cls_of(mod), top[:k]))
            missed = [t for t in pairs if not fast.flag(norm(t))]
            out['known_typosquats'][eco][k] = {'detected': len(pairs) - len(missed), 'of': len(pairs), 'missed': missed}
    os.makedirs(args.out, exist_ok=True)
    for name, data in (('A', A), ('B', B), ('C', C)):
        json.dump(data, open(os.path.join(args.out, 'flagged_%s.json' % name), 'w'), indent=1, sort_keys=True)
    json.dump(out, open(os.path.join(args.out, 'results.json'), 'w'), indent=1)
    print(json.dumps(out, indent=1))
