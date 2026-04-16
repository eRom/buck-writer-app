# Buck Writer — Dev quickstart (M0)

## Prérequis

- Node 20+
- pnpm 9+
- Docker (pour containerization)
- macOS / Linux (Windows WSL2)

## Install

```bash
pnpm install
cp .env.example .env           # remplir AUTH_JWT_SECRET, RESEND_API_KEY, etc.
```

## Dev local (sans Docker)

### 1. Préparer la DB

```bash
pnpm --filter @buck/api build
DATABASE_URL=file:./data/db/buck.db node packages/api/dist/db/migrate.js
AUTH_ALLOWED_EMAILS=toi@example.com \
  MCP_BIBLE_URL=http://localhost:9999 \
  DATABASE_URL=file:./data/db/buck.db \
  node packages/api/dist/db/seed.js
```

### 2. Lancer api + web en parallèle

```bash
pnpm dev
```

- Web : http://localhost:5173
- Api : http://localhost:3000
- Le proxy Vite redirige `/api/*` et `/webdav/*` vers l'api.

### 3. Tests

```bash
pnpm test               # vitest unit (tous les packages)
pnpm test:e2e           # playwright (voir section ci-dessous)
pnpm typecheck          # tsc noEmit (tous)
pnpm lint               # eslint
```

## E2E Playwright

Voir `packages/web/tests/e2e/auth-happy-path.spec.ts`. L'api doit tourner avec `E2E=1` : dans ce mode `createE2EEmailService` écrit le raw token dans un fichier JSON au lieu de l'envoyer par email, et la route `/api/__e2e__/last-token` expose ce token à Playwright.

Installer les browsers Chromium (une fois) :

```bash
pnpm --filter @buck/web exec playwright install --with-deps chromium
```

Workflow complet :

```bash
# 1. Prépare une DB fraîche
trash data/db/buck.db || true
pnpm --filter @buck/api build
pnpm --filter @buck/web build
DATABASE_URL="file:$(pwd)/data/db/buck.db" node packages/api/dist/db/migrate.js
AUTH_ALLOWED_EMAILS=alice@example.com \
  MCP_BIBLE_URL=http://localhost:9999 \
  DATABASE_URL="file:$(pwd)/data/db/buck.db" \
  node packages/api/dist/db/seed.js

# 2. Lance l'api en mode E2E
E2E=1 NODE_ENV=test PORT=3000 \
  AUTH_JWT_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
  AUTH_ALLOWED_EMAILS="alice@example.com" \
  RESEND_API_KEY="unused" RESEND_FROM="noreply@example.com" \
  OPENAI_API_KEY="sk-unused" \
  PUBLIC_BASE_URL="http://localhost:3000" \
  WORKSPACE_DIR="$(pwd)/data/workspace" \
  DATABASE_URL="file:$(pwd)/data/db/buck.db" \
  MCP_BIBLE_URL="http://localhost:9999" \
  WEB_DIST_ROOT="$(pwd)/packages/web/dist" \
  E2E_LAST_TOKEN_FILE="$(pwd)/data/e2e-last-token.json" \
  node packages/api/dist/index.js &
API_PID=$!

# 3. Lance Playwright
E2E_BASE_URL=http://localhost:3000 E2E_EMAIL=alice@example.com \
  pnpm --filter @buck/web test:e2e

# 4. Clean up
kill $API_PID
```

## Docker local

### 1. Créer le réseau Docker partagé (une fois)

```bash
docker network create caddy-public
```

### 2. Build + up

```bash
pnpm docker:build
pnpm docker:up
pnpm docker:logs
```

- L'app écoute sur http://localhost:3000 (si exposé dans compose) — en prod c'est Caddy qui proxy.
- Les migrations + seed s'exécutent automatiquement au boot (entrypoint.sh).

### 3. Down

```bash
pnpm docker:down
```

## Structure du repo

```
packages/
├── shared/   @buck/shared — types, Zod schemas, pricing
├── api/      @buck/api    — Hono backend (routes, middleware, services, db)
└── web/      @buck/web    — Vite + React + shadcn preset b1Gdz9c4A
```

Voir `docs/superpowers/specs/2026-04-16-buck-writer-v1-1-foundation-design.md` pour le design complet.

## Prochains milestones

- **M1** : Chat OpenAI streaming + sessions CRUD
- **M2** : Métriques + hard-stop budget
- **M3** : Attachments + WebDAV
- **M4** : Bible MCP
- **M5** : Polish + e2e complet + CI/CD + deploy
