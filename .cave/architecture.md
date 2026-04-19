# Architecture — Buck Writer

> Derniere mise a jour : 2026-04-19 (M8 — mode Live vocal OpenAI Realtime + module todos)

## M8 — Mode Live vocal (OpenAI Realtime `gpt-realtime-1.5`)

Buck supporte un mode conversationnel vocal **WebRTC direct browser↔OpenAI**. Le backend ne voit pas l'audio : il ne fait que mint un `client_secret` éphémère via `POST /v1/realtime/client_secrets` (payload strict `{ type:'realtime', model }` — **pas** de voice/instructions, OpenAI rejette en GA).

Flux :
```
Browser → Buck /api/realtime/session  → OpenAI mint (server)
         ← { clientSecret, sessionConfig }
Browser: RTCPeerConnection → POST SDP → api.openai.com/v1/realtime/calls?model=...
  (Authorization: Bearer <clientSecret>)
         ← SDP answer
DataChannel "oai-events" ouvert → send `session.update` (voice, VAD, tools, instructions)
Audio streams : micro → OpenAI, remote → <audio> + AudioContext → AnalyserNode → waveform
```

**Endpoints /api/realtime/*** (flag `REALTIME_ENABLED`) :
- `POST /session` : ownership + budget guard + mint + build session.update payload
- `POST /usage` : update monotone du tracker, recalcul `costOfRealtime`, 429 si budget dépassé, persist en `usage_events kind='realtime'`
- `POST /transcript` : insert messages `source='voice'`, idempotent via toolMeta `voice:${startedAt}:${role}`
- `POST /write-to-chat` : insert message assistant `source='voice-injected'` (tool local que l'IA appelle en Live)
- `DELETE /session/:id` : drop tracker + flush usage final

**Prompts** : 4 fichiers dans `workspace/systems/` chargés dans l'ordre SYSTEM → MEMORY → TOOLS → RULES (tous live-editable, chokidar watch). LIVE.md ajouté pour le mode vocal. Bootstrap depuis `packages/api/src/defaults/systems/`.

**Tools Live** : MCP Bible/writing-tools + web_search natif Realtime + `write_to_chat` function local. `require_approval: 'never'` forcé sur tous les MCP (décision produit 12.11, pas d'approval vocal).

**Tracker usage** : `Map<realtimeSessionId, TrackedUsage>` en mémoire, monotone strict, GC setInterval 60s (stale > 2min). `unref()` pour ne pas bloquer shutdown.

**Singleton RealtimeClient** : côté web, `clientSingleton` module-level dans `use-realtime-voice.ts` — une seule instance partagée par Notch/ChatInput/hotkey/index. Cleanup sur `beforeunload`. Sinon stop() no-op entre composants.

**Timeouts client-side** :
- Silence : reset sur `input_audio_buffer.speech_started` / `response.audio.delta`. Seuil = `userSettings.realtimeSilenceTimeoutSec` (10-60, défaut 30).
- Warning : 20 min via `emit('warn')`.
- Close : 25 min via `fail('durée max atteinte')`.

**Pricing** : `gpt-realtime-1.5` = $32/1M audio_input, $0.40/1M cached, $64/1M audio_output, $5/1M text_input, $20/1M text_output. `costOfRealtime(usage, model?)` dans `@buck/shared`.

**DB** : migration 0007 ajoute `messages.source TEXT DEFAULT 'text'`, `usage_events.kind TEXT DEFAULT 'chat'`, `user_settings.realtime_*` (4 colonnes). Indexes `usage_events_kind_idx`, `messages_source_idx`.

**UI** : `<Notch>` fixed top-center avec waveform canvas 32 barres (AnalyserNode `getByteTimeDomainData`), raccourci `Cmd+Shift+L`, bouton mic dans `chat-input.tsx`. Settings > Audio Live : voix (10 options, défaut `coral`), 3 sliders VAD (threshold / prefix_padding / silence_duration), slider timeout silence, toggles MCP/web_search, badge permission micro ("disponible" / "rechecker" via `navigator.permissions.query`).

## M7 — Remote MCP connectors via OpenAI Responses API

## M7 — Remote MCP connectors via OpenAI Responses API

Buck est passé de `/v1/chat/completions` à `/v1/responses`. Les serveurs MCP (bible, writing-tools) ne sont plus appelés par Buck : ils sont déclarés dans `tools: [{type:"mcp", server_label, server_url, headers}]`, OpenAI les joint directement. Zéro McpClient local.

Flux :
```
Chat → Buck /api/chat → OpenAI Responses (stream SSE)
                            ↓  (appel direct, avec Bearer)
                        Caddy (bible-mcp.buck.* / writing-mcp.buck.*)
                            ↓  (reverse_proxy si Bearer OK)
                        buck-bible-mcp:7801 / buck-writing-tools-mcp:7802
```

Événements SSE relayés au browser : `content`, `mcp_call_started/done/error`, `mcp_approval`, `tool_approval` (local fn), `tool_result`, `done`, `error`. Voir `packages/api/src/lib/openai.ts` + `routes/chat.ts`.

Stateful : chaque session persiste `last_response_id` (DB), chaque tour suivant chaîne via `previous_response_id`. Le front n'envoie que le NOUVEAU message user à partir du 2e tour — économie tokens massive.

Sidecar writing-tools-mcp : Dockerfile fork git de wdm0006/writing-tools-mcp, patch entrypoint streamable-http (FastMCP 2.14), image ~3 GB (torch + transformers + spacy). Seed DB en `enabled=1`, toggle via UI (badge cliquable dans card-mcp). Bible en `core=1`, badge figé.

Auth MCP publique : Caddy matcher `@auth header Authorization "Bearer {$MCP_SHARED_SECRET}"` → reverse_proxy si match, sinon 401. Container-level Bearer désactivé sur bible-mcp (conflit UI interne, cf gotchas).



## Production

- **URLs** : `https://buck.romain-ecarnot.com` (auth magic-link), `https://bible.buck.romain-ecarnot.com` (SSO via Caddy `forward_auth` → `/api/auth/verify-session` sur `buck-app`, depuis 2026-04-19)
- **VPS** : Hostinger 72.62.239.98, repo cloné dans `/opt/buck-writer-app` via deploy key GitHub SSH
- **DNS** : Cloudflare records `buck` + `*.buck` (proxy=DNS only/grey, sinon Caddy ne peut pas faire challenge HTTP)
- **Réseau Docker** : `caddy-public` (external) partagé entre stack Buck et Caddy Trinity (n8n + voice-agent + qdrant). Caddy attaché aux 2 réseaux.
- **Caddyfile** : 4 sites — `trinity.romain-ecarnot.com` (n8n), `live.trinity.*` (voice basicauth), **`buck.*` (buck-app:3000)**, **`bible.buck.*` (`forward_auth buck-app:3000 /api/auth/verify-session` + `copy_headers X-User-Id` → buck-bible-ui:80)**. Source : `/opt/trinity-lifeos/caddy/Caddyfile` sur le VPS.
- **SSO** : cookie `buck_session` set avec `Domain=.romain-ecarnot.com` (env `COOKIE_DOMAIN`) → partagé entre `buck.*` et `bible.buck.*`.
- **Deploy** : `scripts/deploy-vps.sh` (git pull + scp .env.production + docker compose build/up + healthchecks). Pas de CI/CD.



## Vue d'ensemble

Buck Writer est un assistant d'ecriture web connecte a OpenAI, double d'un archiviste d'univers narratif via bible MCP. L'utilisateur s'authentifie via magic link, discute en streaming avec un LLM, gere ses sessions de chat, dispose d'un workspace (attachments, WebDAV, file browser, skills), et accede a une bible d'ecrivain (personnages, lieux, evenements) via un serveur MCP dedie avec recherche FTS + semantique (embeddings OpenAI).

## Stack

- **Runtime** : Node 20, pnpm workspaces
- **API** : Hono + SQLite (better-sqlite3) + Drizzle ORM
- **Web** : React 19 + TanStack Router + Vite + Tailwind v4 + shadcn new-york + **erom-design v2** (OKLCH, amber brand, dark-first, gris chauds hue 28, Figtree + JetBrains Mono)
- **Streaming** : fetch direct OpenAI Chat Completions (plus d'AI SDK depuis le 2026-04-18), SSE events structures (`content`, `tool_approval`, `tool_result`, `done`, `error`)
- **Auth** : Magic link via Resend, JWT session cookie, CSRF Double Submit Cookie
- **Bible MCP** : Express + @modelcontextprotocol/sdk, transport JSON-RPC HTTP, embeddings OpenAI text-embedding-3-large (3072 dims)
- **Memory (M5)** : Supabase (Postgres + pgvector halfvec(3072) + HNSW cosine + pg_cron + Edge Functions Deno). Module `services/memory/` cote api (@supabase/supabase-js). Tools `recall`/`remember` injectes dans le chat si `MEMORY_ENABLED=true`. Consolidation nocturne (epi->semantique + dedup) et compaction on-demand via Edge Functions Bearer-authed
- **Docker** : Node 20 Alpine, multi-stage build, pnpm deploy --prod

## Arborescence

```
buck-writer-app/
  packages/
    shared/       — Zod schemas, types, pricing models (tsup build)
    api/          — Hono API, routes, middleware, DB, services, MCP client
      src/services/memory/   — Module memory portable (M5)
      supabase/migrations/   — Migrations SQL Supabase (memory schema + pg_cron)
      supabase/functions/    — Edge Functions Deno (consolidate-memory, compact-state, _shared/)
    web/          — React SPA, TanStack Router, composants chat + workspace
    bible-mcp/    — Serveur MCP bible (HTTP, 51 tools, OpenAI embeddings)
    bible-ui/     — SPA Vite/React 19 (TanStack Router + Query, shadcn) consommant bible-mcp via JSON-RPC, servie par nginx en prod (M7)
  workspace/systems/  — SYSTEM.md + RULES.md (live-editable, hot-reload)
  data/workspace/     — workspace utilisateur (fichiers, skills/, .attachments/)
  data/bible/         — SQLite bible (characters, locations, events, embeddings)
  docs/superpowers/
    specs/        — specs de design par milestone
    plans/        — plans d'implementation (+ m5-supabase-provisioning, m5-go-no-go runbooks)
  docker-compose.yml, docker-compose.local.yml, Dockerfile.app, Dockerfile.bible-mcp, Dockerfile.bible-ui
```

## Flux de donnees

### Chat streaming (fetch direct OpenAI)
1. Client → POST /api/chat (messages JSON + sessionId + model + attachmentIds? + references? + toolApproval?)
2. API injecte prompts SYSTEM+RULES (via PromptsRef, hot-reloadable) + skills summary, charge attachments/references
3. Construit `toolDefs` (workspace + skills + bible_* via mcpClient.cachedTools())
4. Appelle `streamChat({apiKey, model, messages, tools})` sur `https://api.openai.com/v1/chat/completions` (stream=true)
5. Parse SSE OpenAI via `parseSSEChunks`, accumule tool_calls via `accumulateToolCalls`
6. Tool loop manuelle : max 5 steps. Si finish_reason='tool_calls' → execute ou demande approval. Les tools `bible_*` passent par `mcpClient.callTool()`
7. Streame des events structures au client : `content`, `tool_approval`, `tool_result`, `done`, `error`
8. Persiste messages user+assistant, insere usageEvent, maj session, genere titre si nouvelle session

### Bible MCP
- bible-mcp ecoute sur port 7801, endpoint `POST /mcp` JSON-RPC 2.0
- api appelle `tools/list` au demarrage (5 retries x 2s pour winning race vs startup), cache les 51 tools
- `MCP_HEALTH_POLL_MS` (defaut 30s) poll regulier pour detecter reconnexion
- `GET /api/mcp/bible/status` → `{ healthy, toolCount }`, poll par useBibleStatus (30s)
- `<BibleStatusBanner />` affiche warning persistant si injoignable

### Workspace (inchange)
- REST API `/api/workspace/*`, WebDAV `/webdav/*`, attachments `/api/attachments`
- Skills `WORKSPACE_DIR/skills/*/SKILL.md`, systems `WORKSPACE_DIR/systems/{SYSTEM,RULES}.md`, tous deux hot-reload chokidar

### Memory (M5, 2026-04-18)
- Module `services/memory/` isole, 3 entry points : `buildMemoryContext(userId)`, tool `recall`, tool `remember`
- `bootstrapMemory({ env, insertUsageEvent, readUsageCursor, writeUsageCursor, tokenCounter })` compose les services (no-op si `MEMORY_ENABLED=false` ou env incomplet)
- Flow chat request : `buildMemoryContext` (parallel fetch `buck_state` static+context, timeout 1.5s, fail-soft `degraded=true` sans throw) → inject `<preferences>` + `<active_context>` au system prompt → tools `recall`/`remember` appendees si enabled → SSE event `memory_status { degraded: true }` avant premier token si necessaire
- Supabase : 3 tables (`buck_memories` halfvec(3072) + HNSW cosine ; `buck_state` KV two-tier static/context avec token_budget ; `buck_memory_usage` logs Edge-side). RPC `match_memories(query_embedding, threshold, count, user_id, type?)` avec validation enum (RAISE 22023 si invalide)
- Edge Functions Deno : `consolidate-memory` (pg_cron `0 3 * * *` UTC, LLM extract + dedup vectoriel @ 0.92 similarity), `compact-state` (on-demand si value > token_budget, LLM compresse a 60% du budget). Les deux valident `Authorization: Bearer ${EDGE_INVOKE_KEY}` via helper `_shared/auth.ts`. Secrets Edge : `OPENAI_API_KEY`, `EDGE_INVOKE_KEY`, `BUCK_USER_ID`. pg_cron lit `EDGE_INVOKE_KEY` depuis Vault (`vault.decrypted_secrets`)
- Cost tracking dual : embeddings Node-side → `usage_events` SQLite avec `input_tokens` = prompt_tokens (budget guard M2 visible) ; Edge-side → `buck_memory_usage` Supabase, rapatriee toutes les 6h par `syncMemoryUsage()` (cron Node dans `index.ts`)
- Fail-soft : `createRememberService` a un retry buffer en RAM (Map, FIFO cap 100), drainee toutes les 30s quand `memory.enabled`. Insert Supabase fail → buffer + deferred result au tool handler
- Feature flag `MEMORY_ENABLED=true/false` — rollback instant, code path strictement identique a pre-M5 si false
- UI : `<MemoryBadge />` monte dans `SidebarLeftFooter` (expanded only), affiche "⚠ memoire indisponible" si `useMemoryStatus().degraded=true`. Store Zustand `memory-status.ts`. SSE event `memory_status` parse dans `lib/chat.ts`

## Modules

- **Auth** : magic link (Resend), JWT, session cookie, authGuard middleware, dev-login bypass (E2E)
- **Sessions** : CRUD complet, soft delete, recherche titre, pagination cursor
- **Chat** : fetch direct OpenAI, tool loop manuelle, approval flow deterministe (SSE events structures, plus de regex heuristique), persistence, usage tracking, titre auto-genere, budget-guard (429 si budget)
- **Bible MCP** : client JSON-RPC (`mcp-client.ts`) avec tool cache + health polling, tools prefixes `bible_*`, auto-executes (pas d'approval — graines bible destructives toutefois bloquees par kill-switch hote si appelle shell)
- **Prompts** : SYSTEM + RULES injectes, `PromptsRef` wrapper pour hot-reload atomic, bootstrap depuis defaults embarques si workspace vide
- **Settings / Usage / Budget** : inchange depuis M2
- **Workspace** : REST + WebDAV + skills + file tools (read/list/create/delete + shell_execute + activate_skill); `shell_execute` auto-execute, destructif bloque par `isDestructiveCommand`
- **Memory (M5)** : orchestrator parallel fetch avec fail-soft, services `remember` (retry buffer) / `recall` (bump access async) / `state` (KV + compaction Edge), `embedText` wrappe OpenAI + insert `usage_events`, `syncMemoryUsage` cursor-based cross-DB, `bootstrap.ts` compose tout et retourne `MemoryServices { enabled, buildContext, remember, recall, state, syncUsage, drainRetryBuffer }`
- **Bible UI (M7, 2026-04-18)** : nouveau package `@buck/bible-ui` (SPA Vite/React 19 + TanStack Router + Query 5 + shadcn). 13 routes file-based : Dashboard (`get_bible_stats`), CRUD pour 7 entites (characters/locations/events/notes/research/world-rules/interactions), pages speciales Search (fulltext+semantic via Tabs), Timeline (`get_timeline`), Graph (Sigma + graphology, edges depuis interactions.characters), Import/Export (export = Markdown), Backups. AppShell : TopBar 38px + SidebarLeft 300px + RightPanel 300px, layout calque sur Buck. Conso MCP via `useMcpQuery`/`useMcpMutation` (TanStack Query wrappers autour de `callTool` JSON-RPC). Card-referentiel de Buck devient `<a target="_blank">` vers `VITE_BIBLE_UI_URL` (default `http://localhost:5174`). Prod : container nginx alpine (`Dockerfile.bible-ui`, image 53MB) qui sert le SPA + proxy `/mcp` vers `bible-mcp:7801` via reseau Docker `internal`. Caddy basicauth prevu sur `bible.buck.romain-ecarnot.com` (snippet pret dans `docs/deploy/caddy-snippet-bible.md`, deploiement VPS differe).
- **UI (erom-design v2, 2026-04-18)** : `ChatShell` (shell 3 panneaux, panel droit sans bg/border flottant) + `SidebarLeft` (search + favoris/today/7j/older + user pill dropdown) + `PanelRight` avec 4 cards (Parametres = modele + raisonnement + budget / Workspace = file tree / Referentiel = Bible MCP status / MCP placeholder). Chat eclate en `ChatStream` + `MessageUser` + `MessageAssistant` + `ReasoningCollapsible` + `ToolCallsCollapsible` + `ToolCallItem` (absorbe approval/terminal/tool-call-display) + `ChatEmptyState` + `MessageFooter`. `ChatInput` auto-grow vertical (max 33vh) + chips attachments. Route `/settings` mono-page (Compte + General + Budget sections). Route `/workspace` supprimee. Login re-skinne en card centree.

## DX

- `.env.development` (versionne) override les chemins Docker pour le dev local
- tsx charge `.env` + `.env.development` via `--env-file=...` dans les scripts dev des packages api et bible-mcp
- Auto-migrate + auto-seed au demarrage api (index.ts)
- `GET /api/__e2e__/dev-login?email=...` — connexion instantanee sans magic link (E2E=1)
- `pnpm dev` lance les 4 packages en parallele ; `docker-compose.local.yml` dispo pour bible-mcp en container si besoin
