#!/usr/bin/env python3
"""Extract malicious package names (OSV MAL- advisories, OpenSSF malicious-packages) for npm and PyPI.
Usage: python3 extract.py [OUT_DIR]   (downloads ~240 MB from osv-vulnerabilities.storage.googleapis.com)"""
import json, os, sys, urllib.request, zipfile
out = sys.argv[1] if len(sys.argv) > 1 else '.'
for eco in ('PyPI', 'npm'):
    path = os.path.join(out, 'osv-%s.zip' % eco)
    if not os.path.exists(path):
        urllib.request.urlretrieve('https://osv-vulnerabilities.storage.googleapis.com/%s/all.zip' % eco, path)
    z = zipfile.ZipFile(path); pkgs = {}
    for n in z.namelist():
        if not n.startswith('MAL-'):
            continue
        d = json.loads(z.read(n))
        for a in d.get('affected', []):
            p = a.get('package', {})
            if p.get('ecosystem') == eco and p.get('name'):
                pub = (d.get('published') or '')[:10]
                if p['name'] not in pkgs or pub < pkgs[p['name']]['published']:
                    pkgs[p['name']] = {'published': pub, 'id': d['id'], 'withdrawn': bool(d.get('withdrawn'))}
    json.dump(pkgs, open(os.path.join(out, 'mal_%s.json' % eco.lower()), 'w'), indent=0, sort_keys=True)
    print('%s: %d distinct malicious packages' % (eco, len(pkgs)))
