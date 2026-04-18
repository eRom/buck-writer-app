# Fichiers cles — Buck Writer

> Derniere mise a jour : 2026-04-18 (M4 complete)

## API (packages/api/src/)

| Fichier | Role |
|---------|------|
| `index.ts` | Entrypoint — charge env, prompts (bootstrap + watcher), skills, mcpClient (5 retries), buildApp, serve |
| `app.ts` | Compose Hono app — middleware + routes + static SPA, AppDeps incl. `mcpClient?`, `prompts: PromptsRef` |
| `env.ts` | Schema Zod des variables d'environnement |
| `lib/openai.ts` | Client fetch direct OpenAI : `parseSSEChunks`, `accumulateToolCalls`, `streamChat`, `chat`, `OpenAIError` |
| `lib/kill-switch.ts` | `isDestructiveCommand()` — bloque rm/chmod/etc. avant execution |
| `services/mcp-client.ts` | Client JSON-RPC bible — `listTools`, `callTool`, `isHealthy`, `cachedTools`, health polling, onStatusChange |
| `services/prompts.ts` | `loadPrompts`, `bootstrapPrompts`, `createPromptsWatcher`, `PromptsRef` |
| `services/skills.ts` | Loader SKILL.md + hot-reload chokidar |
| `services/extractor.ts` | Extraction texte (PDF, DOCX, TXT, MD) |
| `routes/auth.ts` | Magic link request, callback, logout |
| `routes/sessions.ts` | Sessions CRUD (6 routes, ownership guard) |
| `routes/chat.ts` | POST /api/chat streaming — tool loop manuelle, SSE events structures, approval flow |
| `routes/chat-tools.ts` | `buildToolDefinitions`, `buildToolHandlers` — extraits pour tests unitaires, acceptent `mcpClient?` |
| `routes/mcp.ts` | GET /api/mcp/bible/status → `{ healthy, toolCount }` |
| `routes/health.ts` | GET /api/health |
| `routes/settings.ts` | GET/PATCH /api/settings |
| `routes/usage.ts` | GET /api/usage/current |
| `routes/workspace.ts` | REST CRUD workspace filesystem |
| `routes/attachments.ts` | Upload multipart + serve attachments par ID |
| `services/webdav.ts` | WebDAV server Hono-native |
| `middleware/auth.ts` | authGuard — verifie JWT cookie + session DB |
| `middleware/budget-guard.ts` | Bloque chat si budget depasse (429) |
| `middleware/csrf.ts` | CSRF Double Submit Cookie (skip `/webdav/*`) |
| `middleware/rate-limit.ts` | Rate limiter par IP ou user |
| `middleware/security-headers.ts` | CSP, HSTS, X-Frame-Options, etc. |
| `db/schema.ts` | Drizzle schema — users, sessions, messages, usageEvents, mcp_servers, etc. |
| `db/client.ts` | openDb() — SQLite + Drizzle |
| `db/migrate.ts` | Drizzle migrator CLI |
| `db/seed.ts` | Seed users + settings + mcp_servers (bible) |
| `services/user-settings.ts` | getOrCreateSettings() — upsert helper |
| `services/email.ts` | Resend email + E2E stub |
| `services/jwt.ts` | sign/verify JWT |
| `defaults/systems/{SYSTEM,RULES}.md` | Templates bootstrap copies vers `$WORKSPACE_DIR/systems/` au premier run |

## Bible MCP (packages/bible-mcp/src/)

| Fichier | Role |
|---------|------|
| `server.ts` | Entry HTTP — lit env, run migrations, instancie McpServer + Express app, listen sur BIBLE_HTTP_PORT |
| `http.ts` | JSON-RPC handler (`tools/list`, `tools/call`, `ping`, `initialize`), `schemaToJsonSchema` via zod-to-json-schema |
| `mcp-server.ts` | Factory McpServer — enregistre les 51 tools |
| `embeddings/openai.ts` | `embedBatch()` — fetch direct OpenAI embeddings, batching 100/call |
| `embeddings/index.ts` | Re-export `embed`, `indexEntity`, `removeEntityEmbedding`, `loadAllEmbeddings` |
| `embeddings/similarity.ts` | Cosine similarity (corrige noUncheckedIndexedAccess) |
| `db/index.ts` | `getDb()`, `applySchema()` idempotent |
| `db/schema.ts` | Tables characters, locations, events, interactions, world_rules, research, notes, embeddings, embeddings_meta, bible_fts |
| `db/migrations/` | `0000_initial.sql`, `0001_openai_embeddings.sql` (reset embeddings + meta) |
| `tools/{characters,locations,events,interactions,world-rules,research,notes}.ts` | CRUD par domaine |
| `tools/{search,export,import,duplicates,templates,reindex,backup,stats}.ts` | Tools transverses |

## Web (packages/web/src/)

| Fichier | Role |
|---------|------|
| `routes/index.tsx` | Page principale — ChatLayout + Sidebar + ChatArea |
| `routes/login.tsx` | Page login magic link |
| `routes/__root.tsx` | Root route — auth guard global |
| `components/chat/chat-area.tsx` | Hook custom streaming SSE events structures, mount BibleStatusBanner |
| `components/chat/chat-layout.tsx` | Shell layout sidebar + main |
| `components/chat/sidebar.tsx` | Sidebar sessions (search, create, delete) |
| `components/chat/session-list.tsx` | Liste groupee par date |
| `components/chat/message-bubble.tsx` | Bulle user/assistant avec markdown |
| `components/chat/markdown-renderer.tsx` | react-markdown + rehype-highlight + katex |
| `components/chat/chat-input.tsx` | Textarea + attachments + @reference |
| `components/chat/attachment-preview.tsx` | Preview pending attachments |
| `components/chat/attachment-display.tsx` | Affichage attachments dans messages |
| `components/chat/approval-block.tsx` | Bloc approval tool |
| `components/chat/tool-call-display.tsx` | Indicateur appel outil |
| `components/chat/at-reference.tsx` | Dropdown autocomplete @reference |
| `components/bible-status-banner.tsx` | Banner warning persistant si bible injoignable |
| `components/workspace/file-tree.tsx` | Arborescence navigable |
| `components/workspace/workspace-panel.tsx` | Panel droit collapsible workspace |
| `components/settings/webdav-wizard.tsx` | Token WebDAV + instructions OS |
| `components/chat/model-selector.tsx` | Dropdown modeles OpenAI |
| `lib/api.ts` | apiFetch() — CSRF auto, error handling |
| `lib/csrf.ts` | readCsrfCookie() |
| `lib/sessions.ts` | Client API sessions |
| `lib/session.ts` | fetchMe() — auth state |
| `lib/settings.ts` | Client API settings + usage |
| `lib/workspace.ts` | Client API workspace |
| `lib/attachments.ts` | Client API attachments (upload multipart) |
| `lib/mcp.ts` | useBibleStatus — TanStack Query poll 30s sur /api/mcp/bible/status |
| `routes/workspace.tsx` | Page /workspace — file browser complet |
| `routes/settings*.tsx` | Pages settings (general, budget, account) |
| `components/chat/user-menu.tsx` | Popover user en sidebar footer |
| `components/chat/budget-banner.tsx` | Banner rouge hard stop |

## Shared (packages/shared/src/)

| Fichier | Role |
|---------|------|
| `schemas/auth.ts` | Zod schemas auth |
| `schemas/chat.ts` | Zod schemas chat + MODELS |
| `pricing/models.ts` | PRICING table + costOf() |
| `models/ids.ts` | newId(), isUuid() |
| `billing/period.ts` | getBillingPeriod() |
| `schemas/settings.ts` | Zod schemas settings + usage response |
| `schemas/workspace.ts` | Zod schemas workspace, attachments, tools, skills |

## Config

| Fichier | Role |
|---------|------|
| `.env.example` | Template variables d'environnement |
| `.env.development` | Overrides dev local, chemins relatifs `../../` depuis packages/ |
| `Dockerfile.app` | Multi-stage build Node 20 Alpine pour buck (api+web) |
| `Dockerfile.bible-mcp` | Multi-stage Node 20 Alpine pour bible-mcp |
| `docker-compose.yml` | Services buck + bible-mcp, networks caddy-public + internal |
| `docker-compose.local.yml` | Dev hybride : bible-mcp Docker + buck pnpm dev |
| `eslint.config.mjs` | ESLint flat config monorepo |
| `workspace/systems/{SYSTEM,RULES}.md` | Prompts live-editable, committed (dev) |
