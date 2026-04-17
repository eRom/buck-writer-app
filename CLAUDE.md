## Projet

Buck Writer — app web perso d'ecriture assistee par IA (chat OpenAI streaming, gestion de sessions, suivi de couts).
Auth par magic-link email (Resend), whitelist d'emails autorises.
Deploiement Docker mono-container derriere Caddy (caddy-public network).

## Monorepo

pnpm workspace (`pnpm@9.12.0`, Node >=20), 3 packages :

| Package | Role | Entrypoint |
|---------|------|------------|
| `@buck/shared` | Models, schemas Zod, pricing — zero dep runtime (sauf zod, uuid) | `src/index.ts` |
| `@buck/api` | API Hono + SQLite (better-sqlite3 via Drizzle ORM) | `src/index.ts` (port 3000) |
| `@buck/web` | SPA React 19 + Vite + TanStack Router/Query + Tailwind v4 + shadcn | `src/main.tsx` (dev port 5173) |

Dependance interne : `@buck/web` et `@buck/api` importent `@buck/shared` via `workspace:*`.

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
```

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
- `E2E=1` active le mode e2e (token file au lieu d'email)

## Milestones

- **M0** — Foundation : monorepo, auth magic-link, Docker, CI
- **M1** — Chat OpenAI streaming + sessions CRUD (en cours)
- **M4** — MCP Bible integration

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
