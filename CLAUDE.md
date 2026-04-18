## Projet

Buck Writer — app web perso d'ecriture assistee par IA (chat OpenAI streaming, gestion de sessions, suivi de couts).
Auth par magic-link email (Resend), whitelist d'emails autorises.
Deploiement Docker mono-container derriere Caddy (caddy-public network).

## Monorepo

pnpm workspace (`pnpm@9.12.0`, Node >=20), 4 packages :

| Package | Role | Entrypoint |
|---------|------|------------|
| `@buck/shared` | Models, schemas Zod, pricing — zero dep runtime (sauf zod, uuid) | `src/index.ts` |
| `@buck/api` | API Hono + SQLite (better-sqlite3 via Drizzle ORM) | `src/index.ts` (port 3000) |
| `@buck/web` | SPA React 19 + Vite + TanStack Router/Query + Tailwind v4 + shadcn | `src/main.tsx` (dev port 5173) |
| `@buck/bible-mcp` | Serveur MCP Bible (HTTP-only, embeddings OpenAI text-embedding-3-large) | `src/server.ts` (port 7801) |

Dependance interne : `@buck/web` et `@buck/api` importent `@buck/shared` via `workspace:*`.

Les prompts systèmes (SYSTEM.md + RULES.md) vivent dans `$WORKSPACE_DIR/systems/` (live-editable, hot-reload chokidar). Bootstrap depuis `packages/api/src/defaults/systems/` au premier démarrage.

## Stack technique

- **Runtime** : Node 20+, TypeScript ES2022, ESM (`"type": "module"`)
- **API** : Hono 4 + @hono/node-server, Zod validation, Pino logging
- **DB** : SQLite via better-sqlite3 + Drizzle ORM, migrations SQL dans `packages/api/migrations/`
- **Auth** : Magic-link (Resend email), JWT (jose), sessions en DB, CSRF middleware, rate-limit, security headers
- **Frontend** : React 19, Vite 6, Tailwind CSS 4.2, shadcn/ui (style radix-mira, baseColor stone), TanStack Router (file-based), TanStack Query, Zustand, Lucide icons, font Figtree
- **Tests** : Vitest (unit, tous packages), Playwright (e2e, `packages/web/tests/e2e/`), Testing Library (composants)
- **Build** : tsup (api + shared), Vite (web)
- **Docker** : Dockerfile.app mono-stage, docker-compose avec volume data/db + data/workspace

## Commandes

```bash
pnpm dev              # Lance api (tsx watch) + web (vite) en parallele
pnpm build            # Build tous les packages
pnpm test             # Vitest run sur tous les packages
pnpm test:e2e         # Playwright (@buck/web)
pnpm lint             # ESLint tous les packages
pnpm typecheck        # tsc --noEmit tous les packages
pnpm db:generate      # drizzle-kit generate (migrations)
pnpm db:migrate       # Applique les migrations
pnpm db:seed          # Seed initial
pnpm docker:build     # Build image locale
pnpm docker:up        # docker compose up -d --build
docker compose -f docker-compose.local.yml up -d bible-mcp   # dev hybride (bible en Docker, buck pnpm dev)
```

## Dev mode

url : http://localhost:5173/api/__e2e__/dev-login?email=romain.ecarnot@gmail.com

## Base de donnees (SQLite / Drizzle)

Schema dans `packages/api/src/db/schema.ts` :
- `users`, `auth_tokens`, `sessions_auth` — auth
- `chat_sessions`, `messages`, `attachments` — chat
- `usage_events`, `alert_triggers` — suivi couts
- `user_settings` — preferences utilisateur
- `mcp_servers` — config MCP

Timestamps stockes en epoch integer. Soft-delete via `deletedAt`.

## Conventions code

- ESLint flat config, `consistent-type-imports` obligatoire (`import type`)
- `no-console` warn (sauf `console.warn`/`console.error`)
- Unused vars prefixees `_` (pattern `^_`)
- Pattern Zod : const + type du meme nom autorise (`no-redeclare: off`)
- Alias `@/` dans le web package (resolve vers `src/`)
- Erreurs API uniformes : `{ error: { code, message } }` via `HttpError`
- Dependency injection dans l'API (deps passees a `buildApp()`, `createAuthRoutes()`, etc.)

## Variables d'environnement

Voir `.env.example`. Variables critiques :
- `AUTH_JWT_SECRET` (min 32 chars), `AUTH_ALLOWED_EMAILS` (csv)
- `RESEND_API_KEY` + `RESEND_FROM` (optionnels — fallback e2e file)
- `DATABASE_URL`, `WORKSPACE_DIR`, `WEB_DIST_ROOT`
- `OPENAI_API_KEY` (M1+), `MCP_BIBLE_URL` (M4+)
- `BIBLE_DB_PATH`, `BIBLE_HTTP_PORT`, `OPENAI_EMBEDDING_MODEL` (M4+, bible-mcp)
- `E2E=1` active le mode e2e (token file au lieu d'email)

## Milestones

- **M0** — Foundation : monorepo, auth magic-link, Docker, CI
- **M1** — Chat OpenAI streaming + sessions CRUD
- **M4** — MCP Bible integration + prompts live-editable (terminé 2026-04-18)

Specs et plans dans `docs/superpowers/specs/` et `docs/superpowers/plans/`.

## Gerber

Ce projet est indexe dans **gerber** sous le slug `buck-writer-app`.
Slug cross-projet : `caserne` (design system, conventions, preferences personnelles). Pour les sujets design/UI, conventions, stack : chercher aussi dans `caserne`.

Entites :
- **Notes** (atoms + documents) — memoire de connaissance, recherche semantique/fulltext
- **Tasks** — taches projet avec kanban 7 colonnes (inbox -> brainstorming -> specification -> plan -> implementation -> test -> done)
- **Issues** — problemes/bugs avec kanban 4 colonnes (inbox -> in_progress -> in_review -> closed)
- **Messages** — bus inter-sessions (context + reminder)

Skills disponibles :
- `/gerber:recall` — recherche contextuelle dans la memoire cross-projets
- `/gerber:capture` — capture rapide d'un atome de connaissance
- `/gerber:archive` — extraction et archivage fin de session
- `/gerber:session-complete` — cartographie de fin de session (.cave/ + archive)
- `/gerber:review` — maintenance hebdomadaire (notes, tasks, issues)
- `/gerber:import` — migration one-shot depuis .cave/
- `/gerber:inbox` — consulter les messages inter-sessions
- `/gerber:send` — envoyer un message inter-session
- `/gerber:task` — gestion des taches projet (kanban)
- `/gerber:issue` — gestion des issues projet
- `/gerber:vault` — archivage cross-projets dans un vault git

## Contexte projet (.cave)

Le dossier `.cave/` contient la cartographie persistante du projet :
- `architecture.md` — vue d'ensemble, stack, flux de donnees
- `key-files.md` — fichiers critiques et leur role
- `patterns.md` — conventions et patterns recurrents
- `gotchas.md` — pieges, bugs resolus, workarounds

**Ne lis PAS ces fichiers au demarrage.** Lis-les a la demande, uniquement quand la question de l'utilisateur touche au domaine concerne (ex: question archi -> `architecture.md`, bug etrange -> `gotchas.md`). Pour une question triviale ou sans rapport avec le projet lui-meme, ne les lis pas du tout.

## Skills
- **playwright-cli** : Automate browser interactions, test web pages and work with Playwright tests.
- **shadcn** : Manages shadcn components and projects — adding, searching, fixing, debugging, styling, and composing UI.

## MCP Server
- **shadcn**: Vous pouvez parcourir les composants disponibles, en rechercher des spécifiques et les installer directement dans votre projet en utilisant le langage naturel.
- **resend**: Accès natif à l'ensemble de la plateforme Resend

## UI Design
- template :
  - docs/template/shadcn-vite-01.png
  - docs/template/shadcn-vite-02.png
- ShadCN + Vite :
  - Preset b1Gdz9c4A (
  - https://ui.shadcn.com/create?preset=b1Gdz9c4A&template=vite-monorepo
  - https://ui.shadcn.com/create?preset=b1Gdz9c4A&template=vite-monorepo&item=preview

## Guidelines Rules

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
