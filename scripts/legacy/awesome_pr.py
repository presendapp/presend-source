#!/usr/bin/env python3
"""
Création automatique de PR sur les Awesome Lists GitHub
Nécessite un token GitHub avec scope 'repo'
"""
import urllib.request
import json
import base64
import sys
from datetime import datetime

TOKEN_FILE = "~/.github_token"
REPOS = [
    {"owner": "pluja", "repo": "awesome-privacy", "section": "Image Tools", "category": "Image Optimization"},
    {"owner": "pluja", "repo": "awesome-privacy", "section": "PDF Tools", "category": "PDF Manipulation"},
    {"owner": "awesome-selfhosted", "repo": "awesome-selfhosted", "section": "Miscellaneous", "category": "Web-based tools"},
]

PRESEND_ENTRY = "- [Presend](https://presend.pages.dev) — 22 free browser-based privacy tools. Remove EXIF, compress PDFs, merge documents, resize images — all locally. No upload, no tracking. ([Source Code](https://github.com/presendapp/presend))"

def get_token():
    import os
    path = os.path.expanduser(TOKEN_FILE)
    if os.path.exists(path):
        with open(path, 'r') as f:
            return f.read().strip()
    return None

def fork_repo(owner, repo, token):
    url = f"https://api.github.com/repos/{owner}/{repo}/forks"
    req = urllib.request.Request(url, method='POST')
    req.add_header('Authorization', f'token {token}')
    req.add_header('Accept', 'application/vnd.github.v3+json')
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            return data['full_name']  # returns "your-username/repo"
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"❌ Repo {owner}/{repo} introuvable ou pas forkable")
        else:
            print(f"❌ Erreur fork {owner}/{repo}: HTTP {e.code}")
        return None

def create_branch(owner, repo, token, branch_name):
    # Get main branch SHA
    url = f"https://api.github.com/repos/{owner}/{repo}/git/refs/heads/main"
    req = urllib.request.Request(url)
    req.add_header('Authorization', f'token {token}')
    
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
            sha = data['object']['sha']
    except:
        # Try master
        url = f"https://api.github.com/repos/{owner}/{repo}/git/refs/heads/master"
        req = urllib.request.Request(url)
        req.add_header('Authorization', f'token {token}')
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
            sha = data['object']['sha']
    
    # Create branch
    url = f"https://api.github.com/repos/{owner}/{repo}/git/refs"
    payload = {
        "ref": f"refs/heads/{branch_name}",
        "sha": sha
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method='POST')
    req.add_header('Authorization', f'token {token}')
    req.add_header('Content-Type', 'application/json')
    
    try:
        with urllib.request.urlopen(req) as resp:
            return True
    except urllib.error.HTTPError as e:
        if e.code == 422:
            print(f"  ℹ️ Branche {branch_name} existe déjà")
            return True
        print(f"❌ Erreur création branche: HTTP {e.code}")
        return False

def get_readme(owner, repo, token):
    url = f"https://api.github.com/repos/{owner}/{repo}/contents/README.md"
    req = urllib.request.Request(url)
    req.add_header('Authorization', f'token {token}')
    
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
            content = base64.b64decode(data['content']).decode('utf-8')
            return content, data['sha']
    except Exception as e:
        print(f"❌ Erreur lecture README: {e}")
        return None, None

def update_readme(owner, repo, token, branch, content, sha, section):
    # Find section and add entry
    section_marker = f"## {section}"
    if section_marker not in content:
        section_marker = f"### {section}"
    
    if section_marker not in content:
        print(f"❌ Section '{section}' non trouvée dans README")
        return False
    
    # Insert after section header
    insert_pos = content.find(section_marker) + len(section_marker)
    new_content = content[:insert_pos] + "\n" + PRESEND_ENTRY + content[insert_pos:]
    
    # Update file
    url = f"https://api.github.com/repos/{owner}/{repo}/contents/README.md"
    payload = {
        "message": f"Add Presend to {section}",
        "content": base64.b64encode(new_content.encode()).decode(),
        "sha": sha,
        "branch": branch
    }
    
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method='PUT')
    req.add_header('Authorization', f'token {token}')
    req.add_header('Content-Type', 'application/json')
    
    try:
        with urllib.request.urlopen(req) as resp:
            return True
    except urllib.error.HTTPError as e:
        print(f"❌ Erreur mise à jour README: HTTP {e.code}")
        return False

def create_pr(owner, repo, token, branch, title):
    url = f"https://api.github.com/repos/{owner}/{repo}/pulls"
    payload = {
        "title": title,
        "head": branch,
        "base": "main",
        "body": "Add Presend — a collection of 22 free browser-based privacy tools (EXIF removal, PDF metadata stripping, image compression, etc.). All processing is client-side with no upload."
    }
    
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method='POST')
    req.add_header('Authorization', f'token {token}')
    req.add_header('Content-Type', 'application/json')
    
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
            print(f"✅ PR créée: {data['html_url']}")
            return True
    except urllib.error.HTTPError as e:
        print(f"❌ Erreur création PR: HTTP {e.code}")
        return False

def main():
    token = get_token()
    if not token:
        print("❌ Token GitHub manquant")
        print("Crée un token: https://github.com/settings/tokens/new")
        print("Scopes nécessaires: repo")
        print("Sauvegarde-le dans ~/.github_token")
        sys.exit(1)
    
    print(f"[{datetime.now()}] Démarrage des PR Awesome Lists")
    
    for target in REPOS:
        owner, repo = target['owner'], target['repo']
        section = target['section']
        branch_name = f"add-presend-{repo.replace('-', '')}"
        
        print(f"\n--- {owner}/{repo} ({section}) ---")
        
        # Fork
        forked = fork_repo(owner, repo, token)
        if not forked:
            continue
        
        # Create branch
        if not create_branch(forked.split('/')[0], repo, token, branch_name):
            continue
        
        # Get README
        content, sha = get_readme(forked.split('/')[0], repo, token)
        if not content:
            continue
        
        # Check if already present
        if 'presend.pages.dev' in content.lower():
            print(f"  ℹ️ Presend déjà présent dans {owner}/{repo}")
            continue
        
        # Update README
        if not update_readme(forked.split('/')[0], repo, token, branch_name, content, sha, section):
            continue
        
        # Create PR
        create_pr(owner, repo, token, f"{forked.split('/')[0]}:{branch_name}", f"Add Presend to {section}")
    
    print(f"\n[{datetime.now()}] Terminé")

if __name__ == "__main__":
    main()
