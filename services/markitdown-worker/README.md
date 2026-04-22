# Buck MarkItDown Worker

Sidecar FastAPI isolé qui convertit PDF / images / DOCX / PPTX / XLSX en Markdown via [`markitdown`](https://github.com/microsoft/markitdown). Utilisé par `@buck/api` pour extraire le texte des attachments au moment de l'envoi d'un message dans le chat.

- **Hors monorepo pnpm** (stack Python, déployé comme service Docker séparé)
- **Réseau Docker privé** `buck-internal` entre `buck-app` et le worker
- **Auth** par header `X-Internal-Token` (secret partagé)
- **Zéro token LLM** : extraction native + OCR Tesseract local

## Formats supportés

- PDF (.pdf) — extraction texte native via pdfminer, OCR Tesseract pour scans
- Images (.jpg, .jpeg, .png, .webp) — OCR Tesseract (fra + eng)
- DOCX (.docx), PPTX (.pptx), XLSX (.xlsx) — extraction native

Tout le reste → 415.

## Variables d'environnement

| Var | Défaut | Rôle |
|-----|--------|------|
| `INTERNAL_TOKEN` | (vide) | Secret partagé, obligatoire (500 si vide) |
| `MAX_UPLOAD_MB` | `20` | Taille max par fichier |
| `CONVERT_TIMEOUT_S` | `60` | Timeout conversion (504 au-delà) |
| `OCR_ENABLED` | `1` | Flag informatif exposé via `/health` |

## Endpoints

- `GET /health` → `{status, version, ocr_enabled, max_upload_mb, convert_timeout_s}`
- `POST /api/convert` (multipart `file=@...`, header `X-Internal-Token`)
  - 200 → `{markdown, char_count, filename, ext}`
  - 401 → auth KO
  - 413 → fichier > limite
  - 415 → extension non supportée
  - 504 → timeout
  - 500 → erreur interne (ex: tesseract absent sur image)

## Dev local

```bash
cd services/markitdown-worker
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
pytest                    # tests unitaires (sans Docker)
INTERNAL_TOKEN=test-token uvicorn main:app --reload --port 8000
```

## Smoke test

```bash
curl -fsS http://localhost:8000/health | jq

curl -sS -X POST http://localhost:8000/api/convert \
  -H 'X-Internal-Token: test-token' \
  -F 'file=@../../tests/1000020842.pdf' | jq '.char_count, .markdown[:200]'
```

## Docker

```bash
docker build -t buck-markitdown-worker .
docker run --rm -p 8000:8000 -e INTERNAL_TOKEN=test-token buck-markitdown-worker
```

## Limites connues

- OCR Tesseract sur image sans texte → markdown quasi vide ; l'API Buck fait un fallback OpenAI Vision côté appelant (images uniquement).
- PDF scanné sans couche texte → OCR applique fra+eng, peut retourner markdown partiel.
- Audio / vidéo / HTML / Outlook out of scope (pas dans les extras installés).
- Mono-worker uvicorn : requests sérialisées. Suffisant pour usage perso, à scaler si besoin.
