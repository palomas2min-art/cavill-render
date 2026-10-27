#!/usr/bin/env python3
"""
Atualiza o package.json no GitHub (PUT /contents com SHA).
"""
import os
import base64
import json
import urllib.request
import urllib.error

TOKEN = "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"
OWNER = "palomas2min-art"
REPO = "tela-literaria"
PATH = "package.json"
LOCAL_FILE = "/home/z/tela-literaria-export/package.json"

# 1. Pega o SHA do arquivo atual
url = f"https://api.github.com/repos/{OWNER}/{REPO}/contents/{PATH}"
req = urllib.request.Request(url, headers={
    "Authorization": f"token {TOKEN}",
    "Accept": "application/vnd.github+json",
})
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read())
sha = data["sha"]
print(f"SHA atual do package.json: {sha}")

# 2. Lê o arquivo local atualizado
with open(LOCAL_FILE, "rb") as f:
    content_b64 = base64.b64encode(f.read()).decode("ascii")

# 3. Faz o PUT com SHA pra atualizar
payload = json.dumps({
    "message": "Fix: add @types/node to devDependencies (Vercel build error)",
    "content": content_b64,
    "sha": sha,
}).encode("utf-8")

req = urllib.request.Request(url, data=payload, method="PUT", headers={
    "Authorization": f"token {TOKEN}",
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json",
})
try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read())
        print(f"✓ Atualizado! Commit: {result['commit']['sha'][:8]}")
        print(f"Mensagem: {result['commit']['message']}")
except urllib.error.HTTPError as e:
    print(f"✗ Erro HTTP {e.code}")
    print(e.read().decode())
