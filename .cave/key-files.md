# Fichiers clés — Buck Writer

> MAJ 2026-04-22 (M6 MarkItDown shipped)

## M6 — MarkItDown sidecar (2026-04-22)

### Sidecar Python (hors monorepo pnpm)
- `services/markitdown-worker/main.py` — FastAPI `/health` + `/api/convert`, router PDF/image/office, OCR pytesseract direct + pdf2image fallback pour PDF scannés
- `services/markitdown-worker/requirements.txt` — `markitdown[pdf,docx,pptx,xlsx]==0.1.5` + `pytesseract` + `pdf2image` + `fastapi`
- `services/markitdown-worker/Dockerfile` — Python 3.12 slim + tesseract-ocr fra/eng/osd + poppler-utils, user `app` non-root, healthcheck `curl /health`
- `services/markitdown-worker/tests/test_convert.py` — 7 tests pytest (health, auth, pdf, image, unsupported, too_large)
- `services/markitdown-worker/pytest.ini` — testpaths + pythonpath
- `services/markitdown-worker/README.md` — build, dev local (`uv venv`), smoke test curl

### Backend API (TypeScript)
- `packages/api/src/services/markitdown.ts` — `createMarkitdownClient(baseUrl, token)` + `MarkitdownError` 6 codes (unauthorized/too_large/unsupported/timeout/unreachable/worker_error), `AbortController` timeout
- `packages/api/src/services/markitdown.test.ts` — 9 tests mock fetch (succès, tous codes d'erreur, AbortError→timeout)
- `packages/api/src/services/attachmentExtractor.ts` — `extractAttachment()` route par mime (TEXT_MIMES direct / MARKITDOWN_MIMES sidecar) + cache DB + persist status/source, `truncateForPrompt` 20k (18k head + 2k tail + marker), `formatAttachmentBlock` → `<attachment filename="..." mime="...">md</attachment>`
- `packages/api/src/services/attachmentExtractor.test.ts` — 12 tests (cache hit, txt, json, pdf via markitdown, image, skipped, failed, truncation, format)
- `packages/api/migrations/0013_tricky_harry_osborn.sql` — ALTER TABLE attachments ADD 5 colonnes (`extracted_text`, `extraction_status` default 'pending', `extraction_error`, `extracted_at`, `extraction_source`) + index `attachments_status_idx`

### Wiring
- `packages/api/src/db/schema.ts` — attachments étendu 5 colonnes + index statut
- `packages/api/src/env.ts` — `MARKITDOWN_URL` (url optional), `MARKITDOWN_INTERNAL_TOKEN` (string min 16 optional), `MARKITDOWN_TIMEOUT_MS` (default 65000)
- `packages/api/src/index.ts` — instancie `createMarkitdownClient` conditionnel si URL+TOKEN, passé à `buildApp({ markitdown })`
- `packages/api/src/app.ts` — `AppDeps.markitdown?: MarkitdownClient` pipé à `createChatRoute`
- `packages/api/src/routes/chat.ts` — remplace ancienne boucle `for (att of attachmentIds)` + `extractText` par `extractAttachment` + `formatAttachmentBlock`, injection au `lastUserIdx` uniquement
- `packages/api/src/routes/attachments.ts` — allowlist étendue (PPTX, XLSX, JSON) + `mimeMatches` zip magic bytes + `extFromMime` map
- `packages/shared/src/schemas/workspace.ts` — `ALLOWED_MIME_TYPES` + 3 entrées (JSON, PPTX, XLSX)

### Docker
- `vps/compose.yml` — service `markitdown-worker` sur réseau `internal`, `env_file: ../.env`, healthcheck, limits 1 CPU / 1G RAM, buck-app dépend_on + env_file fournit MARKITDOWN_URL/TOKEN (PAS d'override `${...}` dans environment)
- `vps/compose.local.yml` — worker exposé port `8765:8000` pour dev hybride, default token si var absente

### Env files
- `.env.example` — section M6 avec 3 vars
- `.env.development` — `MARKITDOWN_URL=http://localhost:8765` + `MARKITDOWN_INTERNAL_TOKEN=local-dev-token-do-not-use-in-prod` (≥16 chars)
- `vps/.env.production` (hors git) — `MARKITDOWN_INTERNAL_TOKEN` 48 bytes urlsafe généré via `python -c "import secrets; print(secrets.token_urlsafe(48))"`

## M9 — TTS Gemini (2026-04-21)

## M9 — TTS Gemini (2026-04-21)

### Backend API
- `packages/api/src/routes/tts.ts` — POST /:messageId (synthèse + cache) + GET /:messageId/audio (replay), `purgeUserTtsByMessages` helper
- `packages/api/src/services/tts/gemini-client.ts` — `synthesize()`, `withTimeout` 30s, retry 1× sur 5xx/INTERNAL/DEADLINE, 429 quota exhausted
- `packages/api/src/services/tts/wav-encoder.ts` — `wrapPcmToWav`, `pcmDurationSec`
- `packages/api/src/services/tts/plaintext.ts` — `messageToPlaintext` strip markdown → texte brut lisible
- `packages/api/migrations/0012_tts.sql` — table `tts_audio_cache` UNIQUE(message_id, voice)
- `packages/api/src/defaults/systems/TTS.md` — prompt style (non injecté actuellement)

### Frontend Web
- `packages/web/src/hooks/use-tts.ts` — singleton `currentAudio` module-level + hook `useTts(messageId)`
- `packages/web/src/hooks/use-features.ts` — query `/api/settings` → flags.tts
- `packages/web/src/components/chat/message-tts-button.tsx` — Play/Pause icon button + état loading
- `packages/web/src/components/settings/tts-section.tsx` — toggle + voix défaut + max chars

### Shared
- `packages/shared/src/tts/voices.ts` — 30 voix Gemini + `isTtsVoice` + `DEFAULT_VOICE='Kore'`
- `packages/shared/src/tts/response.ts` — `TtsPostResponse` type partagé
- `packages/shared/src/pricing/tts.ts` — `costOfTts({inputTextTokens, outputAudioTokens})` + `TTS_MODEL` + `AUDIO_TOKENS_PER_SECOND`

### Wiring
- `packages/api/src/app.ts` — `createTtsRoutes` + middleware postOnly rate-limit + budget
- `packages/api/src/env.ts` — `TTS_ENABLED`, `GEMINI_API_KEY`, `TTS_DEFAULT_VOICE` (validé via `isTtsVoice`), `TTS_MAX_CHARS` (4500)
- `packages/api/src/routes/workspace.ts:48-49` — filtre `.tts_audio` + `.attachments` dans buildTree
- `packages/api/src/routes/chat.ts:690-725` — émet SSE `user_saved`/`assistant_saved` avec vrais IDs DB après insert (fix TTS 'message not found')
- `packages/web/src/components/chat/chat-stream.tsx` — handler `user_saved`/`assistant_saved` remplace `localId` par ID DB réel

## Fichiers M5 sensibles (touchés pendant la validation 2026-04-21)

- `packages/api/src/env.ts` — ajout `MEMORY_RECALL_THRESHOLD` (0..1, default 0.5).
- `packages/api/src/services/memory/bootstrap.ts` — threshold lit depuis `env.MEMORY_RECALL_THRESHOLD` au lieu d'être hardcodé.
- `packages/api/src/routes/auth.ts` — auto-provision user row quand whitelist hit + DB miss.
- `packages/api/src/routes/usage.ts` — `byKind.memory` somme les 4 kinds memory.
- `packages/api/src/index.ts#insertUsageEvent` — propage `kind` (bug fix).
- `packages/shared/src/schemas/settings.ts` — `UsageResponse.byKind` (chat/realtime/memory).
- `packages/web/src/components/settings/budget-section.tsx` — 3 lignes sous la barre budget.
- `packages/web/tests/e2e/memory.spec.ts` — refactor selectors sémantiques + URL assert post-click "Nouvelle session".
- `.env.development` — `PUBLIC_BASE_URL=http://localhost:5173` (align Vite port).
- `vps/compose.yml` — `env_file: ../.env` ajouté sur bible-mcp + writing-tools-mcp.
- `docs/superpowers/plans/m5-go-no-go.md` — validation complète + gaps tracés.

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
