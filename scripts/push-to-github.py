#!/usr/bin/env python3
"""
Sobe todos os arquivos do projeto pro GitHub via contents API.
Lida com arquivos grandes sem problema (usa requests com json direto).
"""
import os
import base64
import json
import urllib.request
import urllib.error

TOKEN = "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"
OWNER = "palomas2min-art"
REPO = "tela-literaria"
PROJECT_DIR = "/home/z/tela-literaria-export"
API = f"https://api.github.com/repos/{OWNER}/{REPO}"

def upload_file(path: str, content_b64: str) -> int:
    url = f"{API}/contents/{path}"
    payload = json.dumps({
        "message": f"Add {path}",
        "content": content_b64,
    }).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method="PUT", headers={
        "Authorization": f"token {TOKEN}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception as e:
        print(f"  ERRO: {e}")
        return 0

def main():
    # Coletar todos os arquivos
    files = []
    for root, _, fnames in os.walk(PROJECT_DIR):
        for fname in fnames:
            full = os.path.join(root, fname)
            rel = os.path.relpath(full, PROJECT_DIR).replace(os.sep, "/")
            # Pular node_modules, .git, etc
            if any(skip in rel for skip in ["node_modules/", ".git/", ".next/"]):
                continue
            files.append((rel, full))
    files.sort()
    print(f"=== {len(files)} arquivos para subir ===\n")
    
    sucesso = 0
    erro = 0
    for i, (rel, full) in enumerate(files, 1):
        with open(full, "rb") as f:
            content_b64 = base64.b64encode(f.read()).decode("ascii")
        status = upload_file(rel, content_b64)
        if status in (200, 201):
            sucesso += 1
            print(f"  ✓ [{i}/{len(files)}] {rel}")
        else:
            erro += 1
            print(f"  ✗ [{i}/{len(files)}] {rel} (HTTP {status})")
    
    print(f"\n=== Resultado ===")
    print(f"Sucesso: {sucesso}")
    print(f"Erro: {erro}")
    print(f"Total: {len(files)}")

if __name__ == "__main__":
    main()
