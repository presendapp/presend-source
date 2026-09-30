#!/usr/bin/env python3
"""
Création de PR sur les Awesome Lists GitHub - Version corrigée
"""
import urllib.request
import json
import base64
import sys
import time
from datetime import datetime

TOKEN_FILE = "~/.github_token"

REPOS = [
    {
        "owner": "pluja", 
        "repo": "awesome-privacy", 
        "sections": ["Image Optimization", "Image Tools", "Image", "Photos", "PDF", "Documents"],
        "entry": "- [Presend](https://presend.pages.dev) — 22 free browser-based privacy tools. Remove EXIF, compress PDFs, merge documents, resize images — all locally. No upload, no tracking. `Web` `Open-Source`"
    },
    {
        "owner": "awesome-selfhosted", 
        "repo": "awesome-selfhosted",
        "sections": ["Miscellaneous", "Utilities", "File Management", "Media"],
        "entry": "- [Presend](https://presend.pages.dev) — 22 free browser-based privacy tools. Remove EXIF, compress PDFs, merge documents, resize images — all locally. No upload, no tracking. ([Source Code](https://github.com/presendapp/presend)) `MIT` `HTML5`"
    },
    {
        "owner": "Lissy93", 
        "repo": "awesome-privacy", 
        "sections": ["Image Optimization", "Image Tools", "Image", "Photos", "PDF", "Documents"],
        "entry": "- [Presend](https://presend.pages.dev) — 22 free browser-based privacy tools. Remove EXIF, compress PDFs, merge documents, resize images — all locally. No upload, no tracking. `Web` `Open-Source`"
    }
]

def get_token():
    import os
    path = os.path.expanduser(TOKEN_FILE)
    if os.path.exists(path):
        with open(path, 'r') as f:
            return f.read().strip()
    return None

def api_request(url, method='GET', data=None, token=None):
    req = urllib.request.Request(url, method=method)
    if token:
        req.add_header('Authorization', f'token {token}')
    req.add_header('Accept', 'application/vnd.github.v3+json')
    req.add_header('User-Agent', 'Presend-Awesome-PR')
    
    if data:
        req.add_header('Content-Type', 'application/json')
        req.data = json.dumps(data).encode('utf-8')
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read()) if e.read() else {}
    except Exception as e:
        return 0, {"error": str(e)}

def get_readme(owner, repo, token):
    status, data = api_request(f"https://api.github.com/repos/{owner}/{repo}/readme", token=token)
    if status == 200:
        content = base64.b64decode(data['content']).decode('utf-8')
        return content, data['sha']
    return None, None

def find_section(readme, sections):
    """Find which section exists in the README"""
    for section in sections:
        for marker in [f"## {section}", f"### {section}", f"#### {section}"]:
            if marker in readme:
                return marker
    return None

def insert_entry(readme, section_marker, entry):
    """Insert entry after the section header"""
    pos = readme.find(section_marker)
    if pos == -1:
        return None
    
    # Find end of section (next ## or ###)
    next_section = readme.find('\n## ', pos + len(section_marker))
    if next_section == -1:
        next_section = len(readme)
    
    # Insert before next section
    return readme[:next_section] + f"\n{entry}\n" + readme[next_section:]

def fork_repo(owner, repo, token):
    status, data = api_request(f"https://api.github.com/repos/{owner}/{repo}/forks", method='POST', token=token)
    if status in [202, 201]:
        return data['full_name']
    print(f"  Fork error HTTP {status}: {data.get('message', '?')}")
    return None

def get_default_branch(owner, repo, token):
    status, data = api_request(f"https://api.github.com/repos/{owner}/{repo}", token=token)
    if status == 200:
        return data.get('default_branch', 'main')
    return 'main'

def create_branch(owner, repo, token, branch_name, base_branch):
    # Get base branch SHA
    status, data = api_request(f"https://api.github.com/repos/{owner}/{repo}/git/refs/heads/{base_branch}", token=token)
    if status != 200:
        print(f"  Can't get base branch: HTTP {status}")
        return False
    
    sha = data['object']['sha']
    
    # Create branch
    status, data = api_request(
        f"https://api.github.com/repos/{owner}/{repo}/git/refs",
        method='POST',
        data={"ref": f"refs/heads/{branch_name}", "sha": sha},
        token=token
    )
    
    if status == 201:
        return True
    elif status == 422 and 'Reference already exists' in str(data):
        print(f"  ℹ️ Branch exists")
        return True
    else:
        print(f"  Branch error HTTP {status}: {data.get('message', '?')}")
        return False

def update_file(owner, repo, token, path, content, sha, branch, message):
    status, data = api_request(
        f"https://api.github.com/repos/{owner}/{repo}/contents/{path}",
        method='PUT',
        data={
            "message": message,
            "content": base64.b64encode(content.encode()).decode(),
            "sha": sha,
            "branch": branch
        },
        token=token
    )
    return status == 200

def create_pr(owner, repo, token, head, base, title, body):
    status, data = api_request(
        f"https://api.github.com/repos/{owner}/{repo}/pulls",
        method='POST',
        data={
            "title": title,
            "head": head,
            "base": base,
            "body": body
        },
        token=token
    )
    
    if status == 201:
        print(f"  ✅ PR created: {data['html_url']}")
        return True
    else:
        print(f"  ❌ PR error HTTP {status}: {data.get('message', '?')}")
        if 'errors' in data:
            for err in data['errors']:
                print(f"     {err}")
        return False

def main():
    token = get_token()
    if not token:
        print("❌ Token missing")
        sys.exit(1)
    
    print(f"[{datetime.now()}] Starting Awesome Lists PR")
    
    for target in REPOS:
        owner, repo = target['owner'], target['repo']
        sections = target['sections']
        entry = target['entry']
        branch_name = f"add-presend-{repo[:10]}"
        
        print(f"\n--- {owner}/{repo} ---")
        
        # Get README
        readme, sha = get_readme(owner, repo, token)
        if not readme:
            print("  ❌ Can't read README")
            continue
        
        # Check if already present
        if 'presend.pages.dev' in readme.lower():
            print("  ℹ️ Presend already listed")
            continue
        
        # Find section
        section_marker = find_section(readme, sections)
        if not section_marker:
            print(f"  ❌ No matching section found (tried: {sections})")
            continue
        print(f"  ✓ Found section: {section_marker}")
        
        # Insert entry
        new_readme = insert_entry(readme, section_marker, entry)
        if not new_readme:
            print("  ❌ Can't insert entry")
            continue
        
        # Fork
        print("  Forking...")
        forked = fork_repo(owner, repo, token)
        if not forked:
            continue
        print(f"  ✓ Forked to {forked}")
        
        # Get default branch
        base_branch = get_default_branch(owner, repo, token)
        
        # Wait a bit for fork to be ready
        time.sleep(3)
        
        # Create branch on fork
        fork_owner = forked.split('/')[0]
        print(f"  Creating branch {branch_name}...")
        if not create_branch(fork_owner, repo, token, branch_name, base_branch):
            continue
        
        # Update README on fork
        print("  Updating README...")
        if not update_file(fork_owner, repo, token, 'README.md', new_readme, sha, branch_name, f"Add Presend to {section_marker.replace('#', '').strip()}"):
            print("  ❌ Can't update README")
            continue
        
        # Create PR
        print("  Creating PR...")
        create_pr(
            owner, repo, token,
            f"{fork_owner}:{branch_name}",
            base_branch,
            f"Add Presend — browser-based privacy tools",
            f"**[Presend](https://presend.pages.dev)** — A collection of 22 free browser-based privacy tools.\n\n**Features:**\n- Remove EXIF/GPS data from photos\n- Strip metadata from PDFs and Office documents\n- Compress images and PDFs\n- Merge PDFs, resize images for social media\n- Generate secure passwords, create QR codes\n- All processing is client-side — no upload, no tracking\n\n**Why add it:**\n- Completely free and open-source\n- No account or registration required\n- Privacy-first approach (local processing only)\n- Active development with regular updates\n\n**Links:**\n- Website: https://presend.pages.dev\n- Source: https://github.com/presendapp/presend"
        )
        
        # Rate limit pause
        time.sleep(5)
    
    print(f"\n[{datetime.now()}] Done")

if __name__ == "__main__":
    main()
