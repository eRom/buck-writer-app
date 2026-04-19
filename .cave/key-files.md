# Fichiers clés — Buck Writer

> MAJ 2026-04-19 (M8)

## API (packages/api/src/)

### Core
- `index.ts` — entry : env, prompts + watcher, mcpClient, usageTracker, buildApp
- `app.ts` — compose Hono + middleware + routes + static SPA
- `env.ts` — schema Zod env vars

### Lib
- `lib/openai.ts` — client `/v1/responses` + SSE parser
- `lib/realtime.ts` — `mintRealtimeClientSecret()` (payload strict `{type, model}`)
- `lib/kill-switch.ts` — `isDestructiveCommand()` guard

### Services
- `services/prompts.ts` — `Prompts {system, memory, tools, rules, live}` + bootstrap + chokidar watcher
- `services/mcp-registry.ts` — lit DB → `McpToolDef[]` pour Responses `tools[]`
- `services/mcp-classifier.ts` — classif require_approval never/always selon préfixes
- `services/skills.ts` — loader SKILL.md hot-reload
- `services/extractor.ts` — PDF/DOCX/TXT/MD
- `services/user-settings.ts` — upsert
- `services/email.ts` + `services/jwt.ts`
- `services/webdav.ts` — WebDAV Hono-native
- `services/realtime/session-config.ts` — build `session.update` (voice, VAD, tools)
- `services/realtime/snapshot.ts` — 20 derniers messages `[role]: text`
- `services/realtime/usage-tracker.ts` — Map monotone + GC
- `services/billing/monthly-cost.ts` — SUM costUsd période courante

### Memory (M5)
- `services/memory/bootstrap.ts` — compose tout, no-op si `MEMORY_ENABLED=false`
- `services/memory/memoryOrchestrator.ts` — parallel fetch static/context, fail-soft
- `services/memory/remember.ts` — persist + FIFO retry buffer RAM
- `services/memory/recall.ts` — RPC `match_memories` + bump async
- `services/memory/state.ts` — KV two-tier + Edge compact
- `services/memory/embeddings.ts` — OpenAI + insert `usage_events`
- `services/memory/usageSync.ts` — rapatrie `buck_memory_usage` → SQLite
- `services/memory/supabaseClient.ts` — singleton service_role
- `services/memory/tools.ts` — `recallTool` / `rememberTool` wrappers

### Routes
- `routes/auth.ts` — magic-link + callback + logout
- `routes/sessions.ts` — CRUD + favoris + ownership
- `routes/chat.ts` — POST streaming + tool loop + SSE events
- `routes/chat-tools.ts` — buildToolDefinitions/Handlers
- `routes/realtime.ts` — `/session` + `/usage` + `/transcript` + `/write-to-chat` + DELETE (gated `REALTIME_ENABLED`)
- `routes/mcp.ts` — GET/PATCH mcp_servers
- `routes/settings.ts` — GET/PATCH (incl. realtime_*)
- `routes/usage.ts` — GET /current (incl. byKind breakdown)
- `routes/workspace.ts` + `routes/attachments.ts` + `routes/health.ts`

### Middleware
- `middleware/auth.ts` — JWT cookie + session DB
- `middleware/budget-guard.ts` — 429 si budget dépassé
- `middleware/csrf.ts` — Double Submit (skip webdav)
- `middleware/rate-limit.ts` + `middleware/security-headers.ts`

### DB + defaults
- `db/schema.ts` — Drizzle schema complet
- `db/client.ts` — openDb()
- `db/migrate.ts` + `db/seed.ts`
- `migrations/0006_responses_api_fields.sql` — last_response_id + cached_input_tokens
- `migrations/0007_realtime.sql` — messages.source + usage_events.kind + user_settings.realtime_*
- `defaults/systems/{SYSTEM,MEMORY,TOOLS,RULES,LIVE}.md` — bootstrap workspace

## Web (packages/web/src/)

### Realtime (M8)
- `lib/realtime-client.ts` — classe WebRTC (PC, DC, AudioContext, usage agg, timers)
- `lib/realtime-api.ts` — `createSession/postUsage/postTranscript/writeToChat/closeSession`
- `stores/realtime-store.ts` — Zustand state + recentTranscripts
- `hooks/use-realtime-voice.ts` — **clientSingleton module-level**
- `hooks/use-realtime-hotkey.ts` — `Cmd+Shift+L`
- `components/live/notch.tsx` — pill fixed top-center (aria-live polite)
- `components/live/waveform.tsx` — canvas 32 barres RAF
- `components/settings/audio-live-section.tsx` — voix + VAD + silence + tools + permission micro
- `test/webrtc-stubs.ts` — stubs happy-dom

### Shell + Chat
- `routes/__root.tsx` — auth guard + `<Notch />`
- `routes/index.tsx` — Home + useRealtimeHotkey
- `routes/login.tsx` + `routes/settings.tsx`
- `components/layout/chat-shell.tsx` — shell 3 panneaux + kbd cmd+b/cmd+\\
- `components/layout/sidebar-left*.tsx` — sidebar gauche (groupes sessions)
- `components/layout/panel-right.tsx` — 4 cards flottantes
- `components/panel-right/card-{parametres,workspace,referentiel,mcp,todos}.tsx`
- `components/chat/chat-stream.tsx` — streaming SSE + voice messages injection
- `components/chat/chat-input.tsx` — textarea auto-grow + mic button + attachments
- `components/chat/{message-user,message-assistant,reasoning-collapsible,tool-calls-collapsible,tool-call-item}.tsx`
- `components/chat/{markdown-renderer,at-reference,attachment-display}.tsx`
- `components/settings/{account,general,budget,webdav-wizard}-section.tsx`
- `components/workspace/file-tree.tsx`
- `components/memory-badge.tsx` — warning mémoire indisponible

### Lib web
- `lib/api.ts` — apiFetch + CSRF + ApiError
- `lib/csrf.ts` / `lib/session.ts` / `lib/sessions.ts` / `lib/settings.ts`
- `lib/workspace.ts` / `lib/attachments.ts` / `lib/mcp.ts` / `lib/todos.ts`
- `lib/session-groups.ts` + test — favoris/today/7j/older
- `lib/use-panels-state.ts` — collapsed state localStorage
- `stores/memory-status.ts`

## Shared (packages/shared/src/)

- `schemas/{auth,chat,settings,workspace}.ts` — Zod + types
- `pricing/models.ts` — PRICING + `costOf` + `costOfRealtime` + `REALTIME_MODEL`
- `voice/voices.ts` — `REALTIME_VOICES` (10) + `DEFAULT_VOICE='coral'`
- `voice/turn-detection.ts` — `TurnDetectionConfig` + `normalizeTurnDetection`
- `billing/period.ts` — `getBillingPeriod`
- `models/ids.ts` — newId, isUuid

## Bible MCP (packages/bible-mcp/src/)

- `server.ts` — entry HTTP + migrations + listen
- `http.ts` — Streamable HTTP transport (@modelcontextprotocol/sdk)
- `mcp-server.ts` — factory, enregistre 51 tools
- `embeddings/openai.ts` — batching 100, text-embedding-3-large
- `db/schema.ts` + `db/migrations/{0000,0001}.sql`
- `tools/{characters,locations,events,interactions,world-rules,research,notes}.ts` — CRUD
- `tools/{search,export,import,duplicates,templates,reindex,backup,stats}.ts` — transverses

## Bible UI (packages/bible-ui/src/)

- `main.tsx` + `routes/__root.tsx` + `routes/index.tsx` (dashboard stats)
- `routes/{characters,locations,events,notes,research,world-rules,interactions}.tsx` — listes CRUD
- `routes/<entity>_.$id.tsx` — détail edit (underscore = no nesting)
- `routes/{search,timeline,graph,import-export,backups}.tsx`
- `components/graph/{graph-view,graph-events,graph-highlighter,graph-layout,graph-controls,graph-legend,node-detail}.tsx` — Sigma + ForceAtlas2
- `components/layout/{app-shell,topbar,sidebar-left,right-panel}.tsx`
- `api/mcp-client.ts` + `hooks/use-mcp.ts` + `hooks/use-graph.ts`
- `nginx.conf` — proxy `/mcp` → bible-mcp:7801

## Memory Edge (packages/api/supabase/)

- `migrations/20260418_0001_memory_schema.sql` — tables + RPC `match_memories`
- `migrations/20260418_0002_pgcron_schedule.sql` — nightly 03:00 UTC
- `functions/_shared/{auth,openai}.ts` — Bearer guard + fetch OpenAI Deno
- `functions/consolidate-memory/index.ts` — LLM extract + dedup 0.92
- `functions/compact-state/index.ts` — LLM compress à 60% budget

## Deploy / Infra

- `scripts/deploy-vps.sh` — git pull + scp env + build + up + healthchecks
- `Dockerfile.app` — multi-stage Node 20 Alpine
- `Dockerfile.bible-mcp` + `Dockerfile.bible-ui` + `Dockerfile.writing-tools-mcp`
- `docker-compose.yml` + `docker-compose.local.yml`
- `Caddyfile` (sur VPS `/opt/trinity-lifeos/caddy/Caddyfile`) — sites buck.* + bible.buck.*
- `.env.production` (gitignored) scp vers VPS `/opt/buck-writer-app/.env`
- `docs/deploy/{mcp-public-caddy,caddy-snippet-bible}.md`

## Docs

- `docs/superpowers/specs/` — une spec par milestone
- `docs/superpowers/plans/` — un plan TDD par milestone + checklists manuelles
- `CLAUDE.md` — instructions projet (stack, conventions, gerber, skills)
