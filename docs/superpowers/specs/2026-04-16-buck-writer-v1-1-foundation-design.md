# Buck Writer v1.1 « Foundation » — Design

> **Spec d'architecture et de design.** Ce document fige les décisions prises lors du brainstorming et sert de référence avant d'attaquer le plan d'implémentation.
>
> - **Auteur** : Romain + Trinity
> - **Date** : 2026-04-16
> - **Statut** : draft — en attente de validation utilisateur
> - **Cible** : v1.1 Foundation (v1.2 « écrivain tools » et v2/v3 dans des specs séparées)

---

## 1. Contexte & objectifs

### Pourquoi

Un écrivain (polar) commande un assistant IA pour l'accompagner dans l'écriture de son livre. Le projet doit être :

- **Sécurisé** : auth solide, hard-stop budget, pas de leak de clés API
- **Testé** : pyramide complète (unit + integration + e2e)
- **Simple à utiliser** pour un non-technicien
- **Open source** avec dépendances gratuites (sauf API IA payante)
- **Auto-hébergé** sur VPS Hostinger existant

### Ce que Buck Writer v1.1 livre

1. Application web universelle (Windows / Mac / mobile via navigateur)
2. Workspace de travail persistant côté serveur, éditable aussi en local via WebDAV
3. Chat texte OpenAI avec sélecteur modèle + niveau d'effort de raisonnement
4. Sessions de conversation (CRUD complet)
5. Pièces jointes (fichiers + images) dans les messages
6. Authentification par lien magique (email) + double rideau basic-auth Caddy
7. Métriques & alertes coût (budget mensuel avec hard-stop)
8. Bible d'écrivain branchée comme MCP « core » pré-installé (issue de `barda-mcp-ecrivain-bible`, non portée)

### Reporté à v1.2 (toolkit écrivain)

- Gestion des MCPs utilisateur (ajout, suppression — le core `bible` reste immuable)
- Gestion des skills
- Éditeur de prompts SYSTEM.md / USER.md / RULES.md depuis l'UI
- Backup manuel depuis l'UI

### Reporté à v2 (mémoire)

- Mémoire sémantique / épisodique / procédurale / structurée via `sqlite-vec`

### Reporté à v3 (live)

- Module Realtime (`gpt-realtime-1.5`) avec toggle voix libre / voix liée à la session

---

## 2. Décisions d'architecture (résumé)

| # | Décision | Rationale court |
|---|---|---|
| 1 | Déploiement Docker sur VPS Hostinger | Résout MCP stdio, subprocess, Realtime futur, pas de timeout serverless |
| 2 | Caddy existant (container Trinity) réutilisé | Un seul Caddy sur le VPS, évite conflit ports 80/443 |
| 3 | Réseau Docker externe `caddy-public` partagé | Couplage faible entre projets (Trinity, Buck, futurs) |
| 4 | Sous-domaine `buck.romain-ecarnot.com` | Domaine personnel, auto-TLS Let's Encrypt |
| 5 | 2 containers Buck : `buck-app` + `bible-mcp` | Minimal, Hono sert front statique, Bible isolé |
| 6 | Monorepo pnpm : `web` + `api` + `shared` | Séparation claire, types partagés |
| 7 | Front : React + Vite + shadcn preset `b1Gdz9c4A` (`--monorepo`) | Signature visuelle Romain |
| 8 | Back : Hono + better-sqlite3 + Drizzle | Léger, streaming SSE natif, SQLite mono-user OK |
| 9 | Auth : better-auth + Resend + magic link + whitelist emails | Pas de password, 1 user à la fois |
| 10 | Bible = MCP HTTP streamable, core non-supprimable | Pas de fork, reste OSS autonome |
| 11 | Tests : Vitest + Playwright | Filet solide sur chemins critiques |
| 12 | CI/CD : GitHub Actions + GHCR + SSH | Push main → déploiement automatique |
| 13 | Hard-stop budget activable par défaut | Protège de la clé OpenAI cramée |
| 14 | Dark-first, pas de toggle mode clair en v1.1 | Pattern `erom-design` |

---

## 3. Modèles OpenAI

D'après deep-research avril 2026.

### LLM texte (exposés en UI)

| SKU | Contexte | Prix in / out ($/M) | Usage v1.1 |
|---|---|---|---|
| `gpt-5.4` | 1 000 000 | 2.50 / 15.00 | flagship par défaut |
| `gpt-5.4-mini` | 400 000 | 0.75 / 4.50 | éco, session rapide |

`gpt-5.4-pro` et `gpt-5.4-nano` reconnus par l'API mais **non exposés** dans le sélecteur en v1.1 (éviter la surcharge de choix et les surprises tarifaires).

### Reasoning effort

Paramètre `reasoning.effort` exposé dans l'UI : `low`, `medium`, `high`. Les valeurs `none` et `xhigh` **ne sont pas exposées** (`none` réduit trop les résultats, `xhigh` est un piège à budget).

- Défaut pour `gpt-5.4` → `medium`
- Défaut pour `gpt-5.4-mini` → `low`

### Thinking / chain-of-thought

OpenAI n'expose **pas** le chain-of-thought dans l'API. Les reasoning tokens sont facturés comme output mais cachés. Buck Writer affiche un simple spinner « je réfléchis — effort: X », aucune UI de thinking.

### Modèle Realtime (v3 — hors scope v1.1)

- `gpt-realtime-1.5`
- Endpoint : `wss://api.openai.com/v1/realtime`
- Voix disponibles : `alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, cedar` — `cedar` et `marin` recommandées pour la fidélité

### Grille tarifaire (config)

```typescript
// packages/shared/src/pricing/models.ts
export const PRICING = {
  'gpt-5.4':       { input: 2.50, output: 15.00 },  // $ par 1M tokens
  'gpt-5.4-mini':  { input: 0.75, output:  4.50 },
  'gpt-5.4-pro':   { input: 5.00, output: 30.00 },  // non exposé v1.1 — prix à revérifier avant activation future
  'gpt-5.4-nano':  { input: 0.15, output:  0.60 },  // non exposé v1.1 — prix à revérifier avant activation future
  'gpt-realtime-1.5': {
    text_input:  5.00, text_output:  20.00,
    audio_input: 100.0, audio_output: 200.0,        // v3 uniquement
  },
} as const;
```

---

## 4. Architecture & infrastructure

### Vue d'ensemble

```
┌─────────────────────────────────────────────────────────┐
│ VPS Hostinger KVM                                       │
│                                                         │
│  ┌─────── trinity-compose (existant) ──────┐           │
│  │  caddy (80/443)   n8n   voice-agent      │           │
│  └────┬─────────────────────────────────────┘           │
│       │ réseau: caddy-public (external)                 │
│  ┌────┴──── buck-compose (nouveau) ─────────┐           │
│  │  buck-app:3000   bible-mcp:7801           │           │
│  └───────────────────────────────────────────┘           │
│                                                         │
│  Volumes host (bind mounts) :                          │
│   /opt/buck/data/db          → SQLite                  │
│   /opt/buck/data/workspace   → prompts/sessions/skills │
│   /opt/buck/data/bible       → données Bible MCP       │
└─────────────────────────────────────────────────────────┘
```

### Flux réseau via Caddy

```
Navigateur (HTTPS)
   │
   ▼
Caddy (container Trinity, unique entry point du VPS)
   │  auto-TLS Let's Encrypt + basicauth (1er rideau)
   ├── /bible/*  ──► bible-mcp:7801 (UI Bible existante)
   ├── /webdav/* ──► buck-app:3000 (handler WebDAV Hono)
   ├── /api/*    ──► buck-app:3000 (API Hono)
   └── /         ──► buck-app:3000 (static Vite servi par Hono)
```

### Caddyfile (ajout côté Trinity)

```caddy
buck.romain-ecarnot.com {
    basicauth {
        {$BUCK_USER} {$BUCK_PASSWORD_HASH}
    }

    handle_path /bible* {
        reverse_proxy bible-mcp:7801
    }

    reverse_proxy buck-app:3000
}
```

### Modification à apporter au docker-compose Trinity

Seul le service **`caddy`** doit rejoindre le réseau `caddy-public` — les autres services Trinity (n8n, voice-agent) restent cloisonnés sur `trinity-network`.

```yaml
caddy:
  # ... existant
  networks:
    - trinity-network
    - caddy-public   # ajouté

networks:
  trinity-network:
    driver: bridge
  caddy-public:       # ajouté
    external: true
```

Prérequis manuel **une seule fois sur le VPS** :

```bash
docker network create caddy-public
```

### docker-compose Buck (nouveau, dans ce repo)

```yaml
services:
  buck-app:
    image: ghcr.io/<owner>/buck-writer:latest
    restart: unless-stopped
    env_file: .env
    volumes:
      - /opt/buck/data/db:/app/data
      - /opt/buck/data/workspace:/app/workspace
    networks:
      - caddy-public

  bible-mcp:
    image: ghcr.io/<owner>/barda-ecrivain-bible:latest
    restart: unless-stopped
    volumes:
      - /opt/buck/data/bible:/data
    networks:
      - caddy-public

networks:
  caddy-public:
    external: true
```

### Ressources estimées

| Container | RAM idle | RAM peak | CPU |
|---|---|---|---|
| `buck-app` | ~150 MB | ~500 MB | 0.5 core |
| `bible-mcp` | ~200 MB (embeddings) | ~400 MB | 0.5 core |
| **Total Buck** | **~350 MB** | **~900 MB** | **1 core** |

Plan Hostinger ≥ 4 GB RAM recommandé (Trinity consomme ~600-800 MB en plus).

### Arborescence repo (niveau 1)

```
buck-writer-app/
├── .github/workflows/ci-deploy.yml
├── docker-compose.yml
├── Dockerfile.app
├── packages/
│   ├── web/
│   ├── api/
│   └── shared/
├── docs/
│   └── superpowers/specs/
├── scripts/
│   └── backup.sh
├── CLAUDE.md
├── pnpm-workspace.yaml
└── package.json
```

---

## 5. Monorepo & structure code

### Packages

```
packages/
├── shared/                         # @buck/shared
│   ├── src/
│   │   ├── models/                 # User, Session, Message, Attachment, UsageEvent
│   │   ├── schemas/                # Zod input/output API
│   │   └── pricing/                # Grille tarifaire modèles
│   └── package.json
│
├── api/                            # @buck/api — Hono backend
│   ├── src/
│   │   ├── index.ts                # entry + serveStatic dist/web
│   │   ├── env.ts                  # validation env (Zod)
│   │   ├── db/
│   │   │   ├── client.ts           # better-sqlite3 + drizzle
│   │   │   └── schema.ts           # tables Drizzle
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── chat.ts             # POST SSE stream
│   │   │   ├── sessions.ts
│   │   │   ├── attachments.ts
│   │   │   ├── webdav.ts
│   │   │   ├── metrics.ts
│   │   │   ├── settings.ts
│   │   │   └── health.ts
│   │   ├── services/
│   │   │   ├── openai.ts
│   │   │   ├── mcp.ts              # client MCP HTTP streamable
│   │   │   ├── workspace.ts
│   │   │   ├── usage.ts
│   │   │   └── alerts.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   ├── rate-limit.ts
│   │   │   ├── cost-guard.ts
│   │   │   ├── csrf.ts
│   │   │   └── security-headers.ts
│   │   └── utils/
│   │       ├── path-safe.ts
│   │       └── sse.ts
│   ├── migrations/                 # drizzle-kit
│   ├── tests/                      # vitest
│   └── package.json
│
└── web/                            # @buck/web — Vite + React
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx
    │   ├── routes/                 # TanStack Router file-based
    │   │   ├── __root.tsx
    │   │   ├── login.tsx
    │   │   ├── index.tsx
    │   │   ├── sessions.tsx
    │   │   ├── metrics.tsx
    │   │   └── settings.tsx
    │   ├── components/
    │   │   ├── chat/
    │   │   ├── sessions/
    │   │   ├── metrics/
    │   │   ├── layout/
    │   │   └── ui/                 # shadcn preset b1Gdz9c4A
    │   ├── hooks/
    │   ├── lib/
    │   │   ├── api.ts              # fetch wrapper typé
    │   │   ├── sse.ts              # parser ReadableStream + eventsource-parser
    │   │   └── query.ts            # TanStack Query config
    │   └── styles/
    ├── tests/                      # vitest + @testing-library
    ├── e2e/                        # playwright specs
    └── package.json
```

### Stack frontend

- **Router** : TanStack Router (file-based, type-safe)
- **Server state** : TanStack Query
- **UI state transient** : Zustand (multi-stores par domaine)
- **Forms** : React Hook Form + Zod
- **Styling** : Tailwind + shadcn preset `b1Gdz9c4A`
- **Charts** : Recharts
- **Icônes** : lucide-react

### Stack backend

- **Runtime** : Node 20+
- **Framework** : Hono 4+
- **DB** : better-sqlite3 + Drizzle ORM
- **Migrations** : drizzle-kit
- **Auth** : better-auth (adapter Hono) + magic link plugin
- **Email** : resend
- **OpenAI** : officiel `openai` SDK, Responses API streaming
- **MCP client** : `@modelcontextprotocol/sdk` (transport HTTP streamable)
- **Logs** : pino + pino-pretty (dev)
- **Validation** : Zod
- **Rate limit** : hono-rate-limiter

---

## 6. Schéma de données (SQLite + Drizzle)

### Tables

```sql
-- auth
users (
  id TEXT PRIMARY KEY,                  -- uuid
  email TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,          -- epoch ms
  last_login_at INTEGER
);

auth_tokens (                           -- magic link tokens
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,             -- sha256(token)
  expires_at INTEGER NOT NULL,          -- 15 min
  used_at INTEGER,
  created_at INTEGER NOT NULL
);

sessions_auth (                         -- JWT sessions (renommé pour éviter confusion)
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'app',    -- 'app' | 'webdav'
  user_agent TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- chat
chat_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  model TEXT NOT NULL,                  -- 'gpt-5.4' | 'gpt-5.4-mini'
  reasoning_effort TEXT NOT NULL,       -- 'low' | 'medium' | 'high'
  archived INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER,                   -- soft delete, purge après 30j
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_message_at INTEGER
);

messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                   -- 'user' | 'assistant' | 'tool' | 'system'
  content_json TEXT NOT NULL,           -- JSON stringifié
  created_at INTEGER NOT NULL
);

attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,  -- null si pas encore envoyé
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  path TEXT NOT NULL,                   -- relatif workspace/
  created_at INTEGER NOT NULL
);

-- usage & coûts
usage_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES chat_sessions(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  audio_input_seconds REAL NOT NULL DEFAULT 0,
  audio_output_seconds REAL NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL,
  reasoning_effort TEXT
);

CREATE INDEX idx_usage_user_month ON usage_events (user_id, created_at);
CREATE INDEX idx_usage_session ON usage_events (session_id);

alert_triggers (                        -- évite re-spam des alertes
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,             -- 'YYYY-MM'
  threshold_percent INTEGER NOT NULL,
  triggered_at INTEGER NOT NULL,
  UNIQUE (user_id, year_month, threshold_percent)
);

-- settings (1 ligne par user)
user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  monthly_cost_limit_usd REAL NOT NULL DEFAULT 50.0,
  alert_thresholds_json TEXT NOT NULL DEFAULT '[50,80,95]',
  hard_stop INTEGER NOT NULL DEFAULT 1,
  default_model TEXT NOT NULL DEFAULT 'gpt-5.4-mini',
  default_reasoning_effort TEXT NOT NULL DEFAULT 'low'
);

-- mcp
mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,            -- 'bible', etc.
  core INTEGER NOT NULL DEFAULT 0,      -- non-supprimable si 1
  enabled INTEGER NOT NULL DEFAULT 1,
  transport TEXT NOT NULL,              -- 'http-streamable' | 'stdio'
  config_json TEXT NOT NULL,            -- URL ou command + args
  created_at INTEGER NOT NULL
);
```

### Seed initial

Au premier boot (script de bootstrap post-migration) :

1. Insertion d'un enregistrement `mcp_servers` pour `bible` (core=1, enabled=1, transport=http-streamable, config = URL interne `http://bible-mcp:7801/mcp`)
2. Pour chaque email de `AUTH_ALLOWED_EMAILS`, insertion d'un `user` + ligne `user_settings` avec les défauts.

### Workspace (volume disque)

```
/app/workspace/                 (monté depuis /opt/buck/data/workspace sur l'host)
├── prompts/
│   ├── SYSTEM.md               # éditeur dans l'UI arrive en v1.2
│   ├── USER.md
│   └── RULES.md
├── sessions/
│   └── <session-uuid>/
│       ├── messages.jsonl      # dump conversation pour backup facile
│       └── attachments/
│           └── <attach-uuid>-<safe-filename>
├── skills/                     # v1.2
└── bible/                      # monté dans le container bible-mcp
```

---

## 7. Authentification & sécurité

### Flux magic link

```
Utilisateur                 buck-app                    Resend
    │                          │                           │
    │  POST /api/auth/request                              │
    │  { email }                                           │
    ├─────────────────────────▶                            │
    │             check whitelist (AUTH_ALLOWED_EMAILS)    │
    │             si ok : insert auth_token (sha256, 15min)│
    │             et send email via Resend                 │
    │                          ├──────────────────────────▶│
    │  200 { sent: true } (TOUJOURS, même si whitelist KO) │
    │◀─────────────────────────┤                           │
    │                                                      │
    │  clic sur lien email :                               │
    │  GET /api/auth/callback?token=xxx                    │
    ├─────────────────────────▶│                           │
    │             verify token (not used, not expired)     │
    │             mark used_at                             │
    │             create JWT + row sessions_auth           │
    │             Set-Cookie buck_session=…                │
    │  302 /                                               │
    │◀─────────────────────────┤                           │
```

**Whitelist anti-enumeration** : `POST /api/auth/request` retourne **toujours** 200 (pas de distinction email connu / inconnu côté réponse). Délai artificiel constant (~500ms) pour masquer la différence de temps de traitement.

### Double rideau

```
requête
   │
   ▼
Caddy basicauth   ← 1er mur (infra, commun à tous devices)
   │
   ▼
buck-app /api/*   ← 2e mur (JWT session du user whitelisté)
```

### Configuration JWT

- Cookie `buck_session` : `httpOnly`, `Secure`, `SameSite=Lax`, `Path=/`
- Durée : 30 jours rolling (reset à chaque request)
- Stockage serveur : table `sessions_auth` (révocable via `POST /api/auth/logout-all`)
- Secret : `AUTH_JWT_SECRET` (32 bytes random)

### Path traversal

```typescript
// packages/api/src/utils/path-safe.ts
import path from 'node:path';
import fs from 'node:fs/promises';

const WORKSPACE_ROOT = path.resolve(process.env.WORKSPACE_DIR!);

export async function assertSafePath(relative: string): Promise<string> {
  const joined = path.resolve(WORKSPACE_ROOT, relative);
  const real = await fs.realpath(joined).catch(() => joined);
  if (!real.startsWith(WORKSPACE_ROOT + path.sep) && real !== WORKSPACE_ROOT) {
    throw new HttpError(403, 'path outside workspace');
  }
  return real;
}
```

Utilisé systématiquement par : WebDAV handlers, attachment upload/download, éditeur de prompts (v1.2).

### Rate limiting (Hono, in-memory)

| Endpoint | Limite |
|---|---|
| `POST /api/auth/request` | 5/h par IP **et** 5/h par email |
| `POST /api/chat/*` | 20/min par user |
| `POST /api/attachments` | 30/min par user |
| Global fallback | 100/min par IP |

### CSRF

Pattern **double-submit cookie** :
- Cookie `buck_csrf` (non httpOnly, lisible JS)
- Toutes les requêtes mutantes (`POST`, `PUT`, `PATCH`, `DELETE`) exigent le header `X-CSRF-Token` égal au cookie
- Middleware global `csrfGuard`

### Headers sécurité (middleware)

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.openai.com https://*.openai.com
Referrer-Policy: strict-origin-when-cross-origin
```

### Secrets (`.env` VPS, jamais commit)

```bash
# API backend
AUTH_JWT_SECRET=
AUTH_ALLOWED_EMAILS=
RESEND_API_KEY=
RESEND_FROM=noreply@romain-ecarnot.com
OPENAI_API_KEY=
PUBLIC_BASE_URL=https://buck.romain-ecarnot.com
WORKSPACE_DIR=/app/workspace
DATABASE_URL=file:/app/data/buck.db
MCP_BIBLE_URL=http://bible-mcp:7801
LOG_LEVEL=info

# Caddy basicauth
BUCK_USER=
BUCK_PASSWORD_HASH=    # généré via `caddy hash-password`
```

---

## 8. Features backend (API)

### Endpoints

```
# auth
POST   /api/auth/request          body: { email }
GET    /api/auth/callback?token=
POST   /api/auth/logout
POST   /api/auth/logout-all

# sessions
GET    /api/sessions              ?archived=false&limit=&offset=
POST   /api/sessions              body: { title?, model?, reasoningEffort? }
GET    /api/sessions/:id
PATCH  /api/sessions/:id          body: { title? archived? model? reasoningEffort? }
DELETE /api/sessions/:id          soft delete

# chat
POST   /api/chat/:sessionId       body: { content, attachmentIds[] } → SSE stream
GET    /api/chat/:sessionId/messages

# attachments
POST   /api/attachments           multipart
GET    /api/attachments/:id       stream download
DELETE /api/attachments/:id

# webdav (PROPFIND, GET, PUT, DELETE, MKCOL, MOVE, COPY)
/webdav/*                         monté sur workspace/, auth via cookie OU basic auth webdav token

# metrics
GET    /api/metrics/current-month
GET    /api/metrics/history?months=6
GET    /api/metrics/top-sessions?n=5

# settings
GET    /api/settings
PATCH  /api/settings              body: { monthlyCostLimitUsd?, hardStop?, alertThresholds?, defaultModel?, defaultReasoningEffort? }
POST   /api/settings/webdav/token → { token } (one-shot visible)

# mcp (lecture seule en v1.1 — mngt arrive v1.2)
GET    /api/mcp/servers
GET    /api/mcp/servers/:id/tools

# health
GET    /api/health
```

### Chat streaming SSE

Format émis par le backend :

```
event: start
data: {"messageId":"m-uuid"}

event: delta
data: {"text":"Hello"}

event: tool_call
data: {"id":"tc-uuid","name":"bible.search_character","args":{"name":"Bob"}}

event: tool_result
data: {"id":"tc-uuid","result":"..."}

event: usage
data: {"inputTokens":1234,"outputTokens":567,"reasoningTokens":100,"costUsd":0.0421}

event: done
data: {"messageId":"m-uuid"}

event: error
data: {"code":"cost_limit","message":"Monthly cost limit reached"}
```

Client : `fetch()` + `ReadableStream` + `eventsource-parser` (pas `EventSource` qui ne supporte pas POST / headers custom).

### Attachments — traitement par type

| Type | Action serveur |
|---|---|
| `image/png`, `image/jpeg`, `image/webp` | base64 → OpenAI `input_image` |
| `text/*`, `text/markdown`, code | lu brut → `input_text` |
| `application/pdf` | `pdf-parse` → `input_text` |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `mammoth` → `input_text` |

Pré-warn côté UI si le contenu extrait dépasse ~100 000 tokens estimés.

Limites :
- 10 MB par fichier
- 5 fichiers max par message
- Types whitelistés (rejet des binaires/exécutables)

### Métriques & alertes — logique centrale

À chaque `usage_events` insert, un trigger (ou service Node équivalent) calcule le % mensuel et crée un `alert_triggers` si un seuil est franchi pour la première fois du mois.

```typescript
// services/alerts.ts (pseudo-code)
async function onUsageInserted(event: UsageEvent) {
  const { user_id } = event;
  const { monthly_cost_limit_usd, alert_thresholds_json } = await getSettings(user_id);
  const thresholds: number[] = JSON.parse(alert_thresholds_json);
  const currentMonthCost = await sumCurrentMonth(user_id);
  const percent = (currentMonthCost / monthly_cost_limit_usd) * 100;
  const ym = yearMonth(Date.now());

  for (const th of thresholds) {
    if (percent >= th) {
      const already = await findTrigger(user_id, ym, th);
      if (!already) {
        await insertTrigger(user_id, ym, th);
        broadcastAlert({ threshold: th, currentMonthCost, limit: monthly_cost_limit_usd });
        if (th >= 95) await sendAlertEmail(user_id, th, currentMonthCost);
      }
    }
  }
}
```

### Cost guard (middleware)

```typescript
// middleware/cost-guard.ts
export const costGuard: MiddlewareHandler = async (c, next) => {
  const userId = c.get('userId');
  const { monthly_cost_limit_usd, hard_stop } = await getSettings(userId);
  if (!hard_stop) return next();
  const current = await sumCurrentMonth(userId);
  if (current >= monthly_cost_limit_usd) {
    throw new HttpError(402, 'Monthly cost limit reached');
  }
  return next();
};
```

### MCP integration (Bible)

- Transport : HTTP streamable
- Initialisation au boot `buck-app` :

```typescript
const client = new MCPClient({ name: 'buck-app', version: '1.0.0' });
await client.connect({
  type: 'streamable-http',
  url: `${process.env.MCP_BIBLE_URL}/mcp`,
});
const { tools } = await client.listTools();
mcpRegistry.register('bible', { client, tools, core: true });
```

- Si `bible-mcp` est down → `mcpRegistry.register` échoue → le chat fonctionne sans tools Bible, bandeau UI « Bible indisponible »
- Pas de retry automatique (éviter les tempêtes) : reconnexion manuelle via `POST /api/mcp/servers/:id/reconnect` (v1.2)

---

## 9. Frontend (UX)

### Pages

```
/login       → demande magic link + état "email envoyé"
/            → chat principal (session active ou nouvelle)
/sessions    → liste sessions (active + archivées)
/metrics     → dashboard coûts mois + historique
/settings    → limites, défauts, WebDAV token, logout-all
```

### Layout global

```
┌──────────────────────────────────────────────────────────────────┐
│  Topbar                                    [user@email]  [logout]│
├──────────┬───────────────────────────────────────────────────────┤
│  Sidebar │                                                       │
│  - chats │              Zone centrale (outlet router)           │
│  - new   │                                                       │
│  - hist. │                                                       │
│  - metr. │                                                       │
│  - sett. │                                                       │
├──────────┴───────────────────────────────────────────────────────┤
│  Statusbar : [■■■■■░░░░░] $12.34 / $50 (25%) — 1345 msg         │
└──────────────────────────────────────────────────────────────────┘
```

Sidebar collapsible (signature `erom-design`). Statusbar toujours visible, couleur variable selon `alertLevel` (gris / orange / rouge).

### Écran Chat

```
┌──────────────────────────────────────────────────────────────────┐
│  Session title [renommer]              [model ▾] [effort ▾]     │
├──────────────────────────────────────────────────────────────────┤
│  [user]  Bob portait ses lunettes au chapitre 6 ?                │
│  [buck] 🔧 bible.search_character { name: "Bob" } [voir détail]  │
│         Oui, Bob portait ses lunettes jusqu'au chapitre 6.       │
│         ⏱ 2.3s — 1234 in / 567 out — $0.02                      │
│  [user]  Et Alice ?                                              │
│  ▓ ▓ ▓  (spinner "je réfléchis — effort: medium")                │
├──────────────────────────────────────────────────────────────────┤
│  [📎 fichier.pdf ×] [🖼 image.png ×]           (2/5 pièces)     │
│  ┌────────────────────────────────────────┐  [📎] [envoyer ▸]    │
│  │ Message...                              │                     │
│  └────────────────────────────────────────┘                     │
└──────────────────────────────────────────────────────────────────┘
```

### Composants clés

```
components/chat/
├── MessageList.tsx          (auto-scroll, virtualisation si > 200 msgs)
├── MessageBubble.tsx        (rendu role-specific)
├── ToolCallCard.tsx         (collapsible args + result)
├── StreamingDelta.tsx       (animation token par token)
├── Composer.tsx             (textarea auto-grow)
├── AttachmentPreview.tsx
├── ReasoningIndicator.tsx   (spinner simple, pas de CoT)
└── CostRibbon.tsx

components/sessions/
├── SessionList.tsx
├── SessionItem.tsx
└── SessionActions.tsx

components/metrics/
├── CurrentMonthCard.tsx
├── HistoryChart.tsx
├── ModelBreakdown.tsx
└── TopSessionsTable.tsx

components/layout/
├── Sidebar.tsx
├── Topbar.tsx
└── CostStatusbar.tsx

components/ui/                (shadcn preset b1Gdz9c4A)
```

### State management

| Catégorie | Technologie |
|---|---|
| Server state (queries, mutations) | TanStack Query |
| URL state (session active, filtres) | TanStack Router search params |
| UI transient (stream, modals) | Zustand multi-stores |
| Forms | React Hook Form + Zod |

### Hook `useChatStream`

```typescript
export function useChatStream(sessionId: string) {
  const [deltas, setDeltas] = useState('');
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [done, setDone] = useState(false);

  const send = useCallback(async (content: string, attachmentIds: string[]) => {
    const res = await fetch(`/api/chat/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify({ content, attachmentIds }),
      headers: {
        'X-CSRF-Token': getCsrfCookie(),
        'Content-Type': 'application/json',
      },
    });
    const reader = res.body!.getReader();
    // parser SSE → dispatch events → update Zustand
    // on 'done' → invalidate TanStack Query messages
  }, [sessionId]);

  return { send, deltas, toolCalls, done };
}
```

### UX critique

- Bouton magic link désactivé 30s après envoi (anti-spam)
- Fetch wrapper intercepte 401 → redirige `/login`, préserve destination
- Hard-stop 100% → 402 → modale « limite atteinte » + CTA `/settings`
- Optimistic UI envoi message (rollback si fail)
- Estimation tokens côté client avant envoi (`tiktoken` wasm)
- Détection `navigator.onLine` → bandeau « connexion perdue »
- Dark-first forcé en v1.1
- a11y : focus ring, `aria-live` streams, nav keyboard complète

### i18n

FR en dur en v1.1. Pas de lib i18n.

---

## 10. Tests

### Vitest — unit + intégration

| Zone | Couverture cible | Notes |
|---|---|---|
| `path-safe.ts` | 100% | traversal attempts, symlinks, relative paths |
| `services/usage.ts` | 100% | calcul par modèle, edge cases, audio v3 |
| `services/alerts.ts` | 100% | seuils, non re-trigger, email |
| `middleware/cost-guard.ts` | 100% | hard stop on/off, rolling sums |
| `middleware/auth.ts` | 100% | JWT expiry, whitelist, CSRF check |
| `middleware/csrf.ts` | 100% | absence token, token mismatch |
| `routes/auth.ts` | 95% | magic link flow, token reuse refusé |
| `routes/chat.ts` | 80% | SSE frame, tool call injecté, usage persisté |
| `routes/attachments.ts` | 90% | taille max, nb max, mime, path-safe |
| `services/openai.ts` | 70% (mock) | streaming, mapping erreurs |
| `services/mcp.ts` | 70% (mock) | fallback si Bible down |
| `hooks/useChatStream` (front) | 70% | parsing SSE, rollback erreur |
| `components/CostStatusbar` | 70% | couleurs seuils |
| `components/Composer` | 70% | limites pièces jointes, submit |

### Mocking

- OpenAI : `msw` (intercepte `api.openai.com`)
- Resend : mock du client côté unit
- Bible MCP : mock du client MCP

### Playwright — 8 scénarios e2e

1. `auth-happy-path.spec.ts` — demande lien → clic simulé (token via DB) → session créée
2. `auth-expired-token.spec.ts` — token > 15min → refus avec message clair
3. `auth-not-whitelisted.spec.ts` — email inconnu → 200 silencieux, pas d'accès possible
4. `chat-send-streaming.spec.ts` — envoi message, deltas visibles, `done` fire, msg persisté
5. `attachment-upload-limits.spec.ts` — rejette > 10 MB, accepte 5 fichiers max
6. `cost-hard-stop.spec.ts` — usage > limite (seed DB) → chat bloqué + modale
7. `cost-alert-threshold.spec.ts` — franchir 80% → bandeau orange visible
8. `webdav-access.spec.ts` — WebDAV token + PROPFIND workspace root OK

Fixtures DB : SQLite `file::memory:` pour rapidité. Run dans Chromium headless Docker.

---

## 11. CI/CD (GitHub Actions)

### Fichier `.github/workflows/ci-deploy.yml`

```yaml
name: CI + Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r lint
      - run: pnpm -r typecheck
      - run: pnpm -r test
      - run: pnpm -r build
      - run: pnpm --filter @buck/web exec playwright install --with-deps chromium
      - run: pnpm test:e2e

  deploy:
    needs: ci
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: .
          file: Dockerfile.app
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/buck-writer:latest
            ghcr.io/${{ github.repository_owner }}/buck-writer:${{ github.sha }}
      - name: SSH deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/buck
            docker compose pull
            docker compose up -d
            docker image prune -f
```

### Secrets GitHub requis

- `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (clé SSH dédiée deploy-only)

Note : la clé SSH dédiée doit être ajoutée dans `~/.ssh/authorized_keys` du user `VPS_USER` sur Hostinger, et ce user doit être membre du groupe Unix `docker` (permet d'exécuter `docker compose` sans sudo).

### Rollback

```bash
# sur le VPS, depuis /opt/buck
docker compose down
IMAGE_TAG=<previous-sha> docker compose up -d
```

---

## 12. Dockerfile (multi-stage)

```dockerfile
# Stage 1 — deps
FROM node:20-alpine AS deps
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

# Stage 2 — build
FROM deps AS build
COPY . .
RUN pnpm --filter @buck/shared build \
 && pnpm --filter @buck/web build \
 && pnpm --filter @buck/api build

# Stage 3 — runtime
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/packages/api/dist /app/dist
COPY --from=build /repo/packages/api/node_modules /app/node_modules
COPY --from=build /repo/packages/web/dist /app/web-dist
RUN mkdir -p /app/data /app/workspace && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

Hono sert `/app/web-dist` via `serveStatic`.

---

## 13. Observabilité

### Erreurs serveur

- Classe `HttpError` centralisée
- Middleware Hono global → log + réponse `{ error: { code, message } }` (sanitized en prod, pas de stack)

### Logs

- `pino` JSON
- `pino-pretty` en dev
- stdout container → `docker logs buck-app`
- Pas de service externe en v1.1 (Sentry/Datadog = v2+)

### Health check

- `GET /api/health` → `{ ok, db, mcp_bible, uptime, version }`
- Caddy peut monitorer via directive `health_uri /api/health`

### Monitoring simple

- Cron VPS : `curl /api/health` toutes les 5 min
- Si KO → envoi mail Resend à l'admin (Romain) via script

---

## 14. Backup

### Script `scripts/backup.sh` (cron nocturne 3h)

```bash
#!/bin/bash
set -euo pipefail
TS=$(date +%Y%m%d-%H%M%S)
DEST=/opt/buck/backups
mkdir -p "$DEST"

# SQLite snapshot cohérent
docker exec buck-app sqlite3 /app/data/buck.db ".backup '/app/data/backup-$TS.db'"
docker cp buck-app:/app/data/backup-$TS.db "$DEST/"
docker exec buck-app rm "/app/data/backup-$TS.db"

# Workspace + Bible
tar czf "$DEST/workspace-$TS.tar.gz" -C /opt/buck/data workspace
tar czf "$DEST/bible-$TS.tar.gz" -C /opt/buck/data bible

# Rétention : 90j max
find "$DEST" -type f -mtime +90 -delete
```

### Snapshot Hostinger

Configurer un snapshot hebdomadaire via l'UI Hostinger en complément.

---

## 15. Dev local

### Prérequis

Node 20+, pnpm 9+, Docker, (optionnel) `mkcert` pour HTTPS local.

### First run

```bash
git clone <repo>
cd buck-writer-app
pnpm install
cp .env.example .env                    # remplir OPENAI_API_KEY, RESEND_API_KEY, etc.
pnpm db:migrate                         # crée ./data/buck.db
pnpm dev                                # lance api (3000) + web (5173) en parallèle
```

### Bible MCP en dev

Deux options :
- `pnpm dev:mcp` depuis le repo `barda-mcp-ecrivain-bible` (port 7801)
- Ou `docker run -p 7801:7801 ghcr.io/<owner>/barda-ecrivain-bible:latest`

### Scripts root `package.json`

```json
{
  "scripts": {
    "dev": "pnpm run --parallel --filter '@buck/*' dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "test:e2e": "pnpm --filter @buck/web test:e2e",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "db:migrate": "pnpm --filter @buck/api db:migrate",
    "docker:build": "docker build -f Dockerfile.app -t buck-writer:local .",
    "docker:up": "docker compose up -d",
    "docker:logs": "docker compose logs -f"
  }
}
```

---

## 16. Checklist sécurité finale

- [x] HTTPS obligatoire (Caddy auto-TLS)
- [x] Double auth (basicauth Caddy + magic link app)
- [x] JWT httpOnly + Secure + SameSite=Lax
- [x] CSRF double-submit cookie
- [x] CSP strict + HSTS + X-Frame-Options + Referrer-Policy
- [x] Path traversal bloqué (`assertSafePath`)
- [x] Rate limiting auth + chat + attachments
- [x] Whitelist emails (anti-enumeration : 200 silencieux constant-time)
- [x] Secrets dans `.env` jamais commit (`.gitignore`)
- [x] Hard-stop budget (anti-cramage de clé OpenAI)
- [x] SQLite backup automatisé + snapshot Hostinger
- [x] Containers non-root (Dockerfile `USER node`)
- [x] Pas de `--privileged`, pas de mount `/` host
- [x] Dependabot GitHub activé

---

## 17. Ce qui est hors scope v1.1

À rappeler explicitement pour éviter tout malentendu :

- Port du Bible en interne (le Bible reste un projet autonome, branché en MCP)
- UI de gestion des MCPs utilisateur (lecture seule en v1.1)
- UI de gestion des skills
- Éditeur UI des prompts SYSTEM / USER / RULES (fichiers éditables via WebDAV en attendant)
- Backup UI (script cron en v1.1)
- Mémoire sémantique / vectorielle → v2
- Module Live Realtime → v3
- Multi-utilisateur, équipes, partage → jamais dans le scope initial

---

## 18. Étapes suivantes

1. Validation de ce design par l'utilisateur
2. Passage à `superpowers:writing-plans` pour produire un plan d'implémentation détaillé (phases, tâches séquencées, critères de sortie par phase)
3. Exécution du plan via `superpowers:executing-plans` (ou `subagent-driven-development`)
