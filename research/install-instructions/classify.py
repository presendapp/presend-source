# Splits scan_bins.py findings: does the README install the package itself anywhere (npm i / add)?
# Usage: python3 classify.py  (reads hits.json, writes classified.json, prints the counts)
import json, re, sys, urllib.request, collections
hits=json.load(open('hits.json'))
by=collections.defaultdict(list)
for h in hits: by[h['package']].append(h)
INST=lambda p: re.compile(r'(npm\s+(i|install|add)|pnpm\s+(add|i|install)|yarn\s+(global\s+)?add|bun\s+(add|install|i))\b[^\n]*?(?<![\w@/.-])'+re.escape(p)+r'(?![\w/-])')
out=[]
for p,xs in by.items():
    d=json.load(urllib.request.urlopen('https://registry.npmjs.org/'+p.replace('/','%2f'),timeout=30))
    r=d.get('readme') or ''
    inst=bool(INST(p).search(r))
    ylines=[x['line'] for x in xs]
    yflag=any(re.search(r'npx\s+(-y|--yes)\b', x['ctx']) for x in xs)
    mcpcfg=any(('"args"' in x['ctx'] or 'mcp add' in x['ctx']) for x in xs)
    out.append({'package':p,'cmds':sorted({x['cmd'] for x in xs}),'install_mentioned':inst,'npx_y':yflag,'mcp_config':mcpcfg})
json.dump(out,open('classified.json','w'),indent=1)
c=collections.Counter((o['install_mentioned']) for o in out)
print('packages with a finding:',len(out),'| README installs the package somewhere:',c[True],'| never:',c[False])
print('distinct unclaimed command names:',len({c for o in out for c in o['cmds']}))
print('with npx -y:',sum(o['npx_y'] for o in out),'| in an MCP config / claude mcp add:',sum(o['mcp_config'] for o in out))
