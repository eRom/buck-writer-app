# Architecture — Buck Writer

> Derniere mise a jour : 2026-04-18 (M4 complete, migration OpenAI directe)

## Vue d'ensemble

Buck Writer est un assistant d'ecriture web connecte a OpenAI, double d'un archiviste d'univers narratif via bible MCP. L'utilisateur s'authentifie via magic link, discute en streaming avec un LLM, gere ses sessions de chat, dispose d'un workspace (attachments, WebDAV, file browser, skills), et accede a une bible d'ecrivain (personnages, lieux, evenements) via un serveur MCP dedie avec recherche FTS + semantique (embeddings OpenAI).

## Stack

- **Runtime** : Node 20, pnpm workspaces
- **API** : Hono + SQLite (better-sqlite3) + Drizzle ORM
- **Web** : React 19 + TanStack Router + Vite + Tailwind v4 + shadcn (preset b1Gdz9c4A)
- **Streaming** : fetch direct OpenAI Chat Completions (plus d'AI SDK depuis le 2026-04-18), SSE events structures (`content`, `tool_approval`, `tool_result`, `done`, `error`)
- **Auth** : Magic link via Resend, JWT session cookie, CSRF Double Submit Cookie
- **Bible MCP** : Express + @modelcontextprotocol/sdk, transport JSON-RPC HTTP, embeddings OpenAI text-embedding-3-large (3072 dims)
- **Docker** : Node 20 Alpine, multi-stage build, pnpm deploy --prod

## Arborescence

```
buck-writer-app/
  packages/
    shared/       — Zod schemas, types, pricing models (tsup build)
    api/          — Hono API, routes, middleware, DB, services, MCP client
    web/          — React SPA, TanStack Router, composants chat + workspace
    bible-mcp/    — Serveur MCP bible (HTTP, 51 tools, OpenAI embeddings)
  workspace/systems/  — SYSTEM.md + RULES.md (live-editable, hot-reload)
  data/workspace/     — workspace utilisateur (fichiers, skills/, .attachments/)
  data/bible/         — SQLite bible (characters, locations, events, embeddings)
  docs/superpowers/
    specs/        — specs de design par milestone
    plans/        — plans d'implementation
  docker-compose.yml, docker-compose.local.yml, Dockerfile.app, Dockerfile.bible-mcp
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

## Modules

- **Auth** : magic link (Resend), JWT, session cookie, authGuard middleware, dev-login bypass (E2E)
- **Sessions** : CRUD complet, soft delete, recherche titre, pagination cursor
- **Chat** : fetch direct OpenAI, tool loop manuelle, approval flow deterministe (SSE events structures, plus de regex heuristique), persistence, usage tracking, titre auto-genere, budget-guard (429 si budget)
- **Bible MCP** : client JSON-RPC (`mcp-client.ts`) avec tool cache + health polling, tools prefixes `bible_*`, auto-executes (pas d'approval — graines bible destructives toutefois bloquees par kill-switch hote si appelle shell)
- **Prompts** : SYSTEM + RULES injectes, `PromptsRef` wrapper pour hot-reload atomic, bootstrap depuis defaults embarques si workspace vide
- **Settings / Usage / Budget** : inchange depuis M2
- **Workspace** : REST + WebDAV + skills + file tools (read/list/create/delete + shell_execute + activate_skill); `shell_execute` auto-execute, destructif bloque par `isDestructiveCommand`
- **UI** : ChatLayout, SessionList, ChatArea, WorkspacePanel, MarkdownRenderer, ApprovalBlock, ToolCallDisplay, AtReference, UserMenu, Settings, BudgetBanner, **BibleStatusBanner** (M4)

## DX

- `.env.development` (versionne) override les chemins Docker pour le dev local
- tsx charge `.env` + `.env.development` via `--env-file=...` dans les scripts dev des packages api et bible-mcp
- Auto-migrate + auto-seed au demarrage api (index.ts)
- `GET /api/__e2e__/dev-login?email=...` — connexion instantanee sans magic link (E2E=1)
- `pnpm dev` lance les 4 packages en parallele ; `docker-compose.local.yml` dispo pour bible-mcp en container si besoin
