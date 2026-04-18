# M6 — MarkItDown Sidecar (extraction locale d'attachments) — Design Spec

**Date** : 2026-04-18
**Status** : Design validé, en attente du plan d'implémentation
**Milestone** : M6
**Scope** : extraction locale de texte depuis PDF, DOCX, XLSX, PPTX, images (OCR) via un sidecar FastAPI embarquant MarkItDown. Zéro token LLM, 100% CPU VPS.

---

## Objectif

À l'upload d'un attachment sur une session de chat, extraire automatiquement un rendu Markdown exploitable par le LLM, stocké en DB, sans dépendance cloud et sans consommation de tokens. Remplacer / compléter le passage direct des fichiers bruts à OpenAI (coûteux en tokens et limité en formats).

## Non-objectifs

- Audio / vidéo (whisper, ffmpeg) → sidecar distinct éventuel plus tard.
- Parsing avancé de tableaux / layouts → on prend le rendu MarkItDown as-is.
- OCR de qualité "pro" (cloud vision) → Tesseract suffit pour le MVP.
- Ré-extraction automatique en cas de changement de version MarkItDown → on versionne et on laisse le user re-uploader.
- Exposition publique du sidecar → réseau Docker interne uniquement.

## Architecture globale

```
┌─────────────────────────────────────────────────────────────────┐
│                   buck-writer-app (docker compose)               │
│                                                                  │
│  buck-app (Node/Hono) ──HTTP interne──▶ markitdown-worker (FastAPI)
│       │                                        │
│       ▼                                        ▼
│  data/buck.db                            /tmp (ephemère)
│  (attachments.extracted_text)            Tesseract + pdfminer + mammoth
└─────────────────────────────────────────────────────────────────┘

Réseau Docker privé `buck-internal` : worker non exposé publiquement.
Caddy / caddy-public : inchangé, seul buck-app reste accessible.
Dev : `docker-compose.local.yml` lance le worker en container, l'API Buck
      tourne en `pnpm dev` et pointe sur `http://localhost:8808` (port exposé
      localement uniquement en dev).
```

## Package / service `services/markitdown-worker/`

Nouveau dossier **hors monorepo pnpm** (pas de `package.json`), dans `services/markitdown-worker/` à la racine. Contient :

```
services/markitdown-worker/
├── Dockerfile
├── requirements.txt
├── main.py
├── README.md
└── tests/
    └── test_convert.py
```

### Dépendances Python

- `fastapi`, `uvicorn[standard]`, `python-multipart`
- `markitdown[pdf,docx,pptx,xlsx]` (sans extras `openai`/`azure`, sans `[all]`)
- `pytesseract` (lien vers tesseract système, installé via apt)
- `pytest`, `httpx` (dev only, image runtime les exclut)

### Endpoints

```
GET  /health              → { status: "ok", version: "0.1.0" }
POST /api/convert         → multipart form-data
     file: UploadFile     → required, taille <= MAX_UPLOAD_MB
     Response 200 :
       { success: true, filename, mime, markdown, chars, ms }
     Response 400 :
       { success: false, code: "UNSUPPORTED" | "TOO_LARGE" | "PARSE_FAILED", message }
     Response 413 si taille dépasse
     Response 504 si timeout interne (par défaut 60s)
```

Header d'auth interne obligatoire : `X-Internal-Token` (secret partagé via env `INTERNAL_TOKEN`). Rejet 401 sinon. Défense en profondeur au cas où un autre container compose serait un jour compromis.

### Configuration par env

| Variable | Défaut | Description |
|----------|--------|-------------|
| `MARKITDOWN_PORT` | `8000` | Port d'écoute uvicorn |
| `MAX_UPLOAD_MB` | `20` | Taille max par requête |
| `CONVERT_TIMEOUT_S` | `60` | Timeout hard de la conversion |
| `OCR_ENABLED` | `true` | Si false, images renvoient `UNSUPPORTED` |
| `OCR_LANGS` | `fra+eng` | Langpacks Tesseract à installer (build arg) |
| `INTERNAL_TOKEN` | (requis) | Shared secret avec buck-api |
| `LOG_LEVEL` | `info` | Pino-like : debug/info/warn/error |

### Limites runtime (docker-compose)

```yaml
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 1G
```

Uvicorn mono-worker (cohérent avec 1 CPU). Pas de `--workers N`. Requêtes séquentielles côté worker, asynchrones côté Buck (file d'attente gérée par Node).

### Comportement

1. Reçoit le fichier, vérifie la taille (400/413 si dépassement).
2. Détecte l'extension, map vers le converter MarkItDown approprié.
3. Écrit en `/tmp/{uuid}{ext}`, appelle `MarkItDown().convert(path)`.
4. Supprime le fichier temporaire dans `finally`.
5. Renvoie le Markdown + métadonnées.

Pas de persistence locale. Pas de cache. Stateless.

## Package `packages/api` — client sidecar

### Nouveau module `packages/api/src/services/markitdown.ts`

```ts
export type ExtractResult =
  | { success: true; markdown: string; chars: number; ms: number }
  | { success: false; code: ExtractErrorCode; message: string };

export interface MarkitdownClient {
  extract(file: Buffer, filename: string, mime: string): Promise<ExtractResult>;
  health(): Promise<boolean>;
}

export function createMarkitdownClient(deps: {
  baseUrl: string;           // ex: http://markitdown-worker:8000
  internalToken: string;
  timeoutMs?: number;        // défaut 70_000 (sidecar timeout + marge)
  logger: Logger;
}): MarkitdownClient;
```

Utilise `fetch` natif Node 20+ avec `AbortController`. Gère les erreurs réseau (ECONNREFUSED → `SIDECAR_UNAVAILABLE`, timeout → `TIMEOUT`, non-2xx → mapping du code renvoyé).

### Intégration dans le flux attachments

Le flux actuel d'upload (M3) stocke le blob dans `data/workspace/attachments/` et insère une ligne dans `attachments`. On ajoute :

1. **Nouvelle colonne** `attachments.extracted_text TEXT NULL` + `attachments.extraction_status` (`pending | ok | failed | skipped`) + `attachments.extraction_error TEXT NULL` + `attachments.extracted_at INTEGER NULL`.
2. **Migration Drizzle** dans `packages/api/migrations/`.
3. **Hook post-upload** : après insert de la ligne `attachments`, job inline (pas de queue, pas de worker séparé pour M6) qui :
   - Vérifie le mime/extension contre une allowlist (PDF, DOCX, XLSX, PPTX, PNG, JPG, JPEG, WEBP, TXT, MD, HTML).
   - Si non supporté → `extraction_status = 'skipped'`, pas d'appel sidecar.
   - Sinon → appel `markitdown.extract`, stocke résultat.
   - En cas d'échec : log WARN + `extraction_status = 'failed'` + message d'erreur. On ne bloque pas l'upload.
4. **Injection dans le prompt** : quand une session possède des attachments extraits, le builder de messages système ajoute un bloc `<attachment filename="..." mime="...">\n{markdown tronqué à 20k chars}\n</attachment>` pour chaque attachment `ok` lié au message courant.
5. **Endpoint admin** `POST /api/attachments/:id/reextract` : force une nouvelle extraction (utile après update du worker). Protégé auth + csrf comme le reste.

### Dependency injection

`buildApp({ markitdown?: MarkitdownClient })` — optionnel pour les tests unitaires (mock). En dev/prod, construit dans `src/index.ts` à partir des env.

### Dégradation

Si `MARKITDOWN_URL` absent → extractor désactivé proprement, statut `skipped`, log INFO au boot. L'app reste pleinement fonctionnelle.

## Package `packages/web` — UI

1. **Badge statut extraction** sur chaque attachment dans la liste : `extrait` (vert), `en cours` (spinner), `échec` (rouge tooltip), `non supporté` (gris).
2. **Bouton "réextraire"** visible si status `failed`, appelle l'endpoint admin.
3. **Preview Markdown** (optionnel M6, sinon M6.1) : modal affichant `extracted_text` avec `react-markdown`.

## Docker

### `Dockerfile.markitdown` (à placer dans `services/markitdown-worker/`)

```dockerfile
FROM python:3.11-slim AS base

ARG OCR_LANGS="fra eng"

RUN apt-get update && apt-get install -y --no-install-recommends \
      tesseract-ocr \
      libmagic1 \
      poppler-utils \
    && for lang in ${OCR_LANGS}; do apt-get install -y --no-install-recommends tesseract-ocr-${lang}; done \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

ENV MARKITDOWN_PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${MARKITDOWN_PORT} --timeout-keep-alive 75"]
```

### `docker-compose.yml` (extrait M6)

```yaml
services:
  buck-app:
    # ... existant ...
    environment:
      - MARKITDOWN_URL=http://markitdown-worker:8000
      - MARKITDOWN_INTERNAL_TOKEN=${MARKITDOWN_INTERNAL_TOKEN}
    depends_on:
      markitdown-worker:
        condition: service_healthy

  markitdown-worker:
    build:
      context: ./services/markitdown-worker
    environment:
      - INTERNAL_TOKEN=${MARKITDOWN_INTERNAL_TOKEN}
      - MAX_UPLOAD_MB=20
      - CONVERT_TIMEOUT_S=60
      - OCR_ENABLED=true
    expose:
      - "8000"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health').read()"]
      interval: 30s
      timeout: 5s
      retries: 3
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
    networks:
      - buck-internal

networks:
  buck-internal:
    internal: true
```

### `docker-compose.local.yml` (dev hybride)

Expose le port `8808:8000` en local pour que `pnpm dev` puisse appeler le worker en direct (`MARKITDOWN_URL=http://localhost:8808`).

## Variables d'environnement (à ajouter à `.env.example`)

```
MARKITDOWN_URL=http://markitdown-worker:8000
MARKITDOWN_INTERNAL_TOKEN=  # 32+ chars random
```

## Tests

- **Worker Python** (`services/markitdown-worker/tests/`) :
  - `test_health` : `/health` répond 200.
  - `test_auth` : rejet 401 sans token.
  - `test_pdf_simple` : PDF texte → markdown non vide.
  - `test_docx_simple` : DOCX → markdown.
  - `test_image_ocr` : PNG avec texte clair → markdown non vide (flag `@pytest.mark.slow`, skip si tesseract absent).
  - `test_too_large` : 413 sur fichier > MAX_UPLOAD_MB.
  - `test_unsupported` : `.xyz` → 400 UNSUPPORTED.
- **API Buck** (`packages/api/src/services/__tests__/markitdown.test.ts`) :
  - Mock fetch, vérifie mapping erreurs, timeout, header d'auth.
- **Intégration** (optionnel M6, sinon M7) : e2e Playwright qui upload un PDF et vérifie l'affichage du badge `extrait`.

## Sécurité

- Header `X-Internal-Token` obligatoire côté worker.
- Réseau Docker `internal: true` → pas d'accès sortant, pas d'accès entrant hors compose.
- Pas d'exécution de code externe (pas de LibreOffice, pas de `ffmpeg`).
- `/tmp` nettoyé systématiquement dans `finally`.
- Taille max stricte.
- Logs : jamais le contenu du markdown en INFO (seulement `chars`, `ms`, `filename`). DEBUG peut logger un extrait.

## Risques / points d'attention

1. **Mémoire sur gros PDF** — pdfminer charge l'arbre en RAM. La limit 1G + timeout 60s sont les garde-fous.
2. **Qualité OCR variable** — Tesseract sur photos mal éclairées donne du texte bruité. Documenter la limite dans le README.
3. **Cold start** — premier import de `markitdown` prend ~1-2s. Uvicorn le paye au boot, pas à la requête (import en module top-level).
4. **Upgrade MarkItDown** — versionner `requirements.txt` avec `==`, changelog à relire avant bump.
5. **Données sensibles** — les attachments transitent en clair sur le réseau Docker privé. Acceptable pour un VPS single-tenant. Si un jour multi-tenant → TLS interne ou unix socket.

## Rollout

1. Build image worker en local, smoke-test manuel avec un PDF.
2. Déploiement VPS : push compose, `docker compose up -d --build markitdown-worker`.
3. Activer l'extractor côté buck-app (déploiement standard).
4. Vérifier les premiers uploads en prod (logs + badge UI).
5. Backfill optionnel : script `scripts/reextract-all.ts` pour les attachments existants.

## Scope exclu explicitement (reporté)

- **M6.1** : preview modale du markdown extrait dans le web.
- **M6.2** : queue persistante (BullMQ ou équivalent) si le volume devient trop gros pour l'inline.
- **M7** : sidecar audio (whisper.cpp) pour les mp3/m4a.
- **M7+** : indexation vector search des `extracted_text` côté M5 memory (vision : recall cross-session sur contenu d'attachments).
