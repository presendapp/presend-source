# Finds npm READMEs that run `npx <bin>` where <bin> is a command (bin) of the package itself, differs from
# the package name, and is not a registered package on npm (404). Read-only; queries the npm registry only.
# Usage: python3 scan_bins.py [search queries...]  -> hits.json (contains package names: keep private)
import json, re, sys, time, urllib.request, urllib.parse, concurrent.futures as cf
UA={'User-Agent':'presend-research'}
def get(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=20) as r: return r.status, r.read()
    except urllib.error.HTTPError as e: return e.code, b''
    except Exception: return 0, b''
def search(text, n):
    names=[]
    for off in range(0,n,250):
        s,b=get('https://registry.npmjs.org/-/v1/search?'+urllib.parse.urlencode({'text':text,'size':250,'from':off}))
        if s!=200: break
        objs=json.loads(b)['objects']
        names+= [o['package']['name'] for o in objs]
        if len(objs)<250: break
    return names
queries=sys.argv[1:] or ['keywords:mcp','mcp server','keywords:mcp-server','keywords:claude','keywords:ai-agent','keywords:modelcontextprotocol']
names=[]
for q in queries: names+=search(q,1000)
names=sorted(set(names)); print('packages:',len(names),file=sys.stderr)
NPX=re.compile(r'(?:npx|bunx|pnpm dlx)\s+(?:(?:-y|--yes|-q|--quiet)\s+)*([@a-zA-Z0-9][\w./@-]*)')
exists={}
def exist(n):
    if n in exists: return exists[n]
    s,_=get('https://registry.npmjs.org/'+n.replace('/','%2f')); exists[n]=s; return s
def one(name):
    s,b=get('https://registry.npmjs.org/'+name.replace('/','%2f'))
    if s!=200: return None
    d=json.loads(b); v=(d.get('dist-tags') or {}).get('latest'); x=(d.get('versions') or {}).get(v) or {}
    bins=x.get('bin') or {}
    if isinstance(bins,str): bins={name.split('/')[-1]:bins}
    readme=d.get('readme') or ''
    out=[]
    for i,l in enumerate(readme.splitlines(),1):
        for m in NPX.finditer(l):
            c=m.group(1).rstrip('.,;:)`\'"')
            if c==name or c.startswith('-') or '/' in c and not c.startswith('@'): continue
            if c in bins and c!=name:
                ctx=l.strip()[:140]
                out.append((i,c,ctx))
    res=[]
    for i,c,ctx in out:
        if exist(c)==404: res.append({'package':name,'version':v,'line':i,'cmd':c,'ctx':ctx,'modified':d.get('time',{}).get('modified','')[:10],'maintainers':[m.get('email') for m in d.get('maintainers',[])],'repository':(x.get('repository') or {}).get('url') if isinstance(x.get('repository'),dict) else x.get('repository')})
    return res
hits=[]
with cf.ThreadPoolExecutor(8) as ex:
    for r in ex.map(one,names):
        if r: hits+=r
json.dump(hits,open('hits.json','w'),indent=1)
print('findings:',len(hits),file=sys.stderr)
