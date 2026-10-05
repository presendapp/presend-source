"""Checks /mcp and /mcp-deps against the Claude connector directory review criteria we can test
from outside: every description names only tools this server serves, every tool has a title and
readOnlyHint, and a call without its required arguments returns an explicit error (isError).
Usage: python3 tests/mcp/check-server.py [base_url]   (default: https://presend.pages.dev)
Exit code 1 on any failure."""
import json, re, sys, urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://presend.pages.dev").rstrip("/")
H = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream",
     "X-Presend-Test": "1", "User-Agent": "presend-test/1"}

def rpc(path, method, params=None, i=1):
    body = {"jsonrpc": "2.0", "id": i, "method": method}
    if params is not None:
        body["params"] = params
    raw = urllib.request.urlopen(urllib.request.Request(BASE + path, data=json.dumps(body).encode(), headers=H), timeout=40).read().decode()
    lines = [l[6:] if l.startswith("data: ") else l for l in raw.splitlines()]
    return json.loads([l for l in lines if l.startswith("{")][-1])

fails = []
full = rpc("/mcp", "tools/list")["result"]["tools"]
all_names = {t["name"] for t in full}
for path in ("/mcp", "/mcp-deps"):
    tools = rpc(path, "tools/list")["result"]["tools"]
    names = {t["name"] for t in tools}
    for t in tools:
        others = {n for n in all_names - names if re.search(r"\b" + re.escape(n) + r"\b", t["description"])}
        if others:
            fails.append(f"{path} {t['name']}: description names tools not served here: {sorted(others)}")
        a = t.get("annotations") or {}
        if not t.get("title") or a.get("readOnlyHint") is not True:
            fails.append(f"{path} {t['name']}: title or readOnlyHint missing")
        req = (t.get("inputSchema") or {}).get("required") or []
        if req:
            r = rpc(path, "tools/call", {"name": t["name"], "arguments": {}})
            res = r.get("result") or {}
            txt = " ".join(c.get("text", "") for c in res.get("content", []))
            if not (res.get("isError") is True and "missing required argument" in txt):
                fails.append(f"{path} {t['name']}: no explicit error without {req} -> isError={res.get('isError')} {txt[:80]!r}")
    print(f"{path}: {len(tools)} tools checked")

for f in fails:
    print("ECHEC", f)
print(f"{len(fails)} echec(s)")
sys.exit(1 if fails else 0)
