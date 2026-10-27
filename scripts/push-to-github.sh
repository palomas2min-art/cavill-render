#!/bin/bash
# Sobe todos os arquivos do projeto pro GitHub via contents API
# usando stdin pro payload (evita erro de argument list too long)

set -e

TOKEN="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"
OWNER="palomas2min-art"
REPO="tela-literaria"
PROJECT_DIR="/home/z/tela-literaria-export"

API="https://api.github.com/repos/$OWNER/$REPO"
AUTH_HEADER="Authorization: token $TOKEN"
ACCEPT_HEADER="Accept: application/vnd.github+json"

echo "=== Subindo arquivos via contents API ==="
cd "$PROJECT_DIR"
TOTAL=0
SUCESSO=0
ERRO=0

find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" | sort | while read -r file; do
  path="${file#./}"
  TOTAL=$((TOTAL+1))
  # Codifica em base64 sem quebras de linha
  content_base64=$(base64 -w 0 "$file")
  # Cria payload com jq lendo do stdin
  PAYLOAD=$(jq -n --arg p "$path" --arg c "$content_base64" --arg m "Add $p" '{
    message: $m,
    content: $c
  }')
  # Envia via stdin pra evitar argument list too long
  HTTP_CODE=$(echo "$PAYLOAD" | curl -s -o /tmp/response.json -w "%{http_code}" \
    -X PUT -H "$AUTH_HEADER" -H "$ACCEPT_HEADER" \
    -H "Content-Type: application/json" \
    --data-binary @- \
    "$API/contents/$path")
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    SUCESSO=$((SUCESSO+1))
    echo "  ✓ [$TOTAL] $path"
  else
    ERRO=$((ERRO+1))
    echo "  ✗ [$TOTAL] $path (HTTP $HTTP_CODE)"
    cat /tmp/response.json | head -3
  fi
done

echo ""
echo "=== Resultado ==="
echo "Sucesso: $SUCESSO"
echo "Erro: $ERRO"
