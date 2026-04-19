# Architecture — Buck Writer

> MAJ 2026-04-19 (M8 — mode Live vocal)

## Vue d'ensemble

Assistant d'écriture web connecté à OpenAI + archiviste d'univers (bible MCP). Auth magic-link, chat streaming, workspace (attachments, WebDAV, skills), bible (FTS + semantic OpenAI embeddings), mémoire Supabase (M5), mode vocal Realtime (M8).

## Stack

- **Runtime** : Node 20, pnpm workspaces.
- **API** : Hono + SQLite (better-sqlite3) + Drizzle ORM.
- **Web** : React 19 + TanStack Router + Vite + Tailwind v4 + shadcn new-york + erom-design v2 (OKLCH amber, dark-first, Figtree + JetBrains Mono).
- **LLM** : fetch direct OpenAI `/v1/responses` (M7, migré depuis Chat Completions), SSE events structurés. Pour Realtime : WebRTC direct browser ↔ OpenAI.
- **Auth** : magic-link (Resend), JWT cookie, CSRF Double Submit.
- **Bible MCP** : Express + @modelcontextprotocol/sdk, JSON-RPC HTTP, embeddings text-embedding-3-large (3072 dims).
- **Memory (M5)** : Supabase Postgres + pgvector halfvec + HNSW + pg_cron + Edge Functions Deno.
- **Docker** : Node 20 Alpine, multi-stage, pnpm deploy --prod.

## Arborescence

```
packages/
  shared/       Zod schemas, pricing, voices (tsup)
  api/          Hono + routes + services (memory, realtime, mcp-registry, billing)
  web/          React SPA (chat, workspace, settings, live)
  bible-mcp/    MCP bible HTTP (51 tools)
  bible-ui/     SPA bible (Sigma graph, CRUD entités)
workspace/systems/  SYSTEM → MEMORY → TOOLS → RULES (+ LIVE) — live-editable
data/           workspace/, bible/, db/
docs/superpowers/ specs/ + plans/
```

## M8 — Mode Live vocal (OpenAI Realtime gpt-realtime-1.5)

**WebRTC direct browser↔OpenAI**. Backend mint uniquement un `client_secret` éphémère via `POST /v1/realtime/client_secrets` (payload strict `{type:'realtime', model}` — voice/instructions/tools rejetés en GA).

```
Browser → /api/realtime/session → OpenAI mint
       ← { clientSecret, expiresAt, sessionConfig }
Browser: RTCPeerConnection → POST SDP → api.openai.com/v1/realtime/calls?model=...
       ← SDP answer
DataChannel "oai-events" ouvert → send session.update (voice, VAD, tools, instructions)
Audio : micro → OpenAI, remote → <audio> + AudioContext → AnalyserNode → waveform
```

**Endpoints `/api/realtime/*`** (flag `REALTIME_ENABLED`) :
- `POST /session` : ownership + budget guard + mint + sessionConfig
- `POST /usage` : update monotone tracker, `costOfRealtime`, 429 si budget, persist `usage_events kind='realtime'`
- `POST /transcript` : insert `messages source='voice'`, idempotent via `toolMeta = voice:${startedAt}:${role}`
- `POST /write-to-chat` : tool local, insert `source='voice-injected'`
- `DELETE /session/:id` : drop tracker + flush final

**Tools Live** : MCP Bible/writing-tools + `web_search` natif + `write_to_chat` fn. `require_approval='never'` forcé sur tous MCP.

**Tracker usage** : `Map<realtimeSessionId, TrackedUsage>` en mémoire, monotone strict, GC 60s/stale 2min, `unref()`.

**Singleton RealtimeClient** : `clientSingleton` module-level dans `use-realtime-voice.ts` — partagé entre Notch/ChatInput/hotkey. Cleanup `beforeunload`.

**Timeouts client** : silence = `userSettings.realtimeSilenceTimeoutSec` (10-60, défaut 30) ; warning 20min ; close auto 25min.

**Pricing** : `$32/1M audio_in`, `$0.40/1M cached`, `$64/1M audio_out`, `$5/1M text_in`, `$20/1M text_out`. `costOfRealtime(usage, model?)` dans `@buck/shared`.

**DB** : migration 0007 — `messages.source`, `usage_events.kind`, `user_settings.realtime_*` (4 colonnes). Indexes `usage_events_kind_idx`, `messages_source_idx`.

**UI** : `<Notch>` fixed top-center avec waveform canvas 32 barres. Raccourci `Cmd+Shift+L`. Settings > Audio Live : voix (10, défaut `coral`), 3 sliders VAD, slider timeout, toggles MCP/web_search, badge permission (`navigator.permissions.query`).

## M7 — Responses API + MCP remote connectors

Buck utilise `/v1/responses` (plus `/v1/chat/completions`). Les serveurs MCP sont déclarés dans `tools: [{type:"mcp", server_label, server_url, headers}]` — **OpenAI les appelle directement**, pas de McpClient local.

```
Chat → Buck /api/chat → OpenAI Responses (stream SSE)
                            ↓ (appel direct Bearer)
                        Caddy (bible-mcp.buck.* / writing-mcp.buck.*)
                            ↓ (reverse_proxy si Bearer OK)
                        buck-bible-mcp:7801 / buck-writing-tools-mcp:7802
```

SSE events : `content`, `mcp_call_started/done/error`, `mcp_approval`, `tool_approval` (local fn), `tool_result`, `done`, `error`.

**Stateful** : `chat_sessions.last_response_id` chaîné via `previous_response_id` — le front n'envoie que le NOUVEAU message à partir du tour 2.

**Auth MCP publique** : Caddy matcher `@auth header Authorization "Bearer {$MCP_SHARED_SECRET}"`.

## M5 — Memory Supabase

- 3 tables : `buck_memories` halfvec(3072) + HNSW cosine ; `buck_state` KV two-tier static/context ; `buck_memory_usage` logs Edge.
- RPC `match_memories(query_embedding, threshold, count, user_id, type?)`.
- Edge Functions Deno (Bearer `EDGE_INVOKE_KEY`) : `consolidate-memory` (pg_cron `0 3 * * *`), `compact-state` (on-demand).
- `buildMemoryContext(userId)` parallel fetch timeout 1.5s, fail-soft → `<preferences>` + `<active_context>` injectés au system prompt.
- Tools `recall`/`remember` appendées si `MEMORY_ENABLED=true`.
- SSE event `memory_status {degraded:true}` avant premier token si fail-soft.
- Cost dual : embeddings Node → `usage_events` SQLite ; Edge → `buck_memory_usage` rapatriée 6h par `syncMemoryUsage()`.
- Feature flag `MEMORY_ENABLED` — rollback instant.

## Production

- **URLs** : `buck.romain-ecarnot.com` (auth), `bible.buck.romain-ecarnot.com` (SSO via Caddy `forward_auth` → `/api/auth/verify-session`).
- **VPS** : Hostinger 72.62.239.98, `/opt/buck-writer-app` via deploy key SSH.
- **DNS** : Cloudflare `buck` + `*.buck` en grey (DNS only) pour Caddy challenge HTTP.
- **Caddy** : stack Buck + Trinity sur réseau `caddy-public`. Caddyfile source `/opt/trinity-lifeos/caddy/Caddyfile`.
- **SSO** : cookie `buck_session` avec `Domain=.romain-ecarnot.com`.
- **Deploy** : `scripts/deploy-vps.sh` (git pull + scp .env + build + healthchecks). Pas de CI/CD.

## DX

- `.env.development` versionné + tsx `--env-file=...`.
- Auto-migrate + auto-seed au démarrage API.
- `GET /api/__e2e__/dev-login?email=...` (E2E=1).
- `pnpm dev` = 4 packages en parallèle.
