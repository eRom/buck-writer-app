# Fichiers cles — Buck Writer

> Derniere mise a jour : 2026-04-17 (M2 complete)

## API (packages/api/src/)

| Fichier | Role |
|---------|------|
| `index.ts` | Entrypoint — charge env, prompts, buildApp, serve |
| `app.ts` | Compose Hono app — middleware + routes + static SPA |
| `env.ts` | Schema Zod des variables d'environnement |
| `routes/auth.ts` | Magic link request, callback, logout |
| `routes/sessions.ts` | Sessions CRUD (6 routes, ownership guard) |
| `routes/chat.ts` | POST /api/chat streaming (streamText + persistence) |
| `routes/health.ts` | GET /api/health |
| `routes/settings.ts` | GET/PATCH /api/settings (budget, modele, effort) |
| `routes/usage.ts` | GET /api/usage/current (cout total, %, alertes) |
| `middleware/auth.ts` | authGuard — verifie JWT cookie + session DB |
| `middleware/budget-guard.ts` | Bloque chat si budget depasse (429) |
| `services/user-settings.ts` | getOrCreateSettings() — upsert helper |
| `utils/find-up.ts` | findUpSync() + loadDotenv() — chargement .env sans dep |
| `middleware/csrf.ts` | CSRF Double Submit Cookie (Secure conditionnel) |
| `middleware/rate-limit.ts` | Rate limiter par IP ou user |
| `middleware/security-headers.ts` | CSP, HSTS, X-Frame-Options, etc. |
| `db/schema.ts` | Drizzle schema — users, sessions, messages, usageEvents, etc. |
| `db/client.ts` | openDb() — SQLite + Drizzle |
| `db/migrate.ts` | Drizzle migrator CLI |
| `db/seed.ts` | Seed users + settings |
| `services/prompts.ts` | loadPrompts() — lit SYSTEM/USER/RULES.md |
| `services/email.ts` | Resend email + E2E stub |
| `services/jwt.ts` | sign/verify JWT |

## Web (packages/web/src/)

| Fichier | Role |
|---------|------|
| `routes/index.tsx` | Page principale — ChatLayout + Sidebar + ChatArea |
| `routes/login.tsx` | Page login magic link |
| `routes/__root.tsx` | Root route — auth guard global |
| `components/chat/chat-area.tsx` | Hook custom streaming + affichage messages |
| `components/chat/chat-layout.tsx` | Shell layout sidebar + main |
| `components/chat/sidebar.tsx` | Sidebar sessions (search, create, delete) |
| `components/chat/session-list.tsx` | Liste groupee par date |
| `components/chat/message-bubble.tsx` | Bulle user/assistant avec markdown |
| `components/chat/markdown-renderer.tsx` | react-markdown + rehype-highlight + katex |
| `components/chat/chat-input.tsx` | Textarea + Enter/Shift+Enter + bouton stop |
| `components/chat/model-selector.tsx` | Dropdown modeles OpenAI |
| `lib/api.ts` | apiFetch() — CSRF auto, error handling |
| `lib/csrf.ts` | readCsrfCookie() |
| `lib/sessions.ts` | Client API sessions (fetch, create, update, delete) |
| `lib/session.ts` | fetchMe() — auth state |
| `lib/settings.ts` | Client API settings + usage (fetch, update) |
| `routes/settings.tsx` | Layout page /settings (nav laterale + Outlet) |
| `routes/settings/general.tsx` | Modele par defaut, reasoning effort |
| `routes/settings/budget.tsx` | Progress bar, limite, reset day, hard stop, alertes |
| `routes/settings/account.tsx` | Email readonly |
| `components/chat/user-menu.tsx` | Popover user en sidebar footer |
| `components/chat/budget-banner.tsx` | Banner rouge hard stop dans la zone chat |

## Shared (packages/shared/src/)

| Fichier | Role |
|---------|------|
| `schemas/auth.ts` | Zod schemas auth (email, token) |
| `schemas/chat.ts` | Zod schemas chat (session, message, MODELS) |
| `pricing/models.ts` | PRICING table + costOf() |
| `models/ids.ts` | newId() (UUIDv4), isUuid() |
| `billing/period.ts` | getBillingPeriod(resetDay, nowMs) — calcul periode facturation |
| `schemas/settings.ts` | Zod schemas settings + usage response |

## Config

| Fichier | Role |
|---------|------|
| `.env.example` | Template variables d'environnement |
| `.env.development` | Overrides dev local (versionne, pas de secrets) |
| `Dockerfile.app` | Multi-stage build Node 20 Alpine |
| `docker-compose.yml` | Service buck-app + network caddy-public |
| `eslint.config.mjs` | ESLint flat config monorepo |
| `prompts/SYSTEM.md` | Personnalite Buck (coach ecriture) |
| `prompts/RULES.md` | Regles comportementales |
| `prompts/USER.md` | Contexte utilisateur (Philippe) |
