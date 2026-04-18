# Patterns et conventions — Buck Writer

> Derniere mise a jour : 2026-04-18 (M4 complete)

## Architecture

- **Monorepo pnpm** : 4 packages (shared, api, web, bible-mcp) + root
- **Dependency injection** : les routes Hono recoivent un objet `deps` (db, email, jwt, prompts, mcpClient, etc.)
- **Schema-first** : Zod dans shared, importe par api et web
- **Ownership guard** : toute route `:id` verifie `WHERE userId = currentUser AND deletedAt IS NULL`, retourne 404 (pas 403)
- **Mutable refs pour hot-reload** : `PromptsRef = { current: Prompts }` passe aux deps — chokidar swap `.current`, le chat lit toujours la derniere version sans redemarrage

## Nommage

- **Fichiers** : kebab-case (`chat-area.tsx`, `rate-limit.ts`)
- **Routes Hono** : fonction `createXxxRoutes(deps)` retourne un `Hono` sub-app
- **Tests** : colocated (`auth.ts` → `auth.test.ts`)
- **Composants React** : PascalCase export (`ChatArea`), fichier kebab-case
- **DB tables** : camelCase JS (`chatSessions`), snake_case SQL (`chat_sessions`)
- **Bible tools** : prefixe `bible_` cote api (chat tool list), nom upstream cote MCP server

## Patterns de code

- **Error handling** : `HttpError` class avec `toJSON()`, format `{ error: { code, message } }`. `OpenAIError` inclut le `error.message` du payload OpenAI dans le message
- **Pagination** : cursor-based, fetch `limit + 1`, pop si overflow, retourne `nextCursor`
- **Auth** : JWT dans cookie `buck_session`, CSRF dans cookie `buck_csrf` + header `x-csrf-token`
- **Streaming OpenAI** : fetch direct `https://api.openai.com/v1/chat/completions` avec `stream: true`, SSE parse manuel via `parseSSEChunks`, tool calls accumules via `accumulateToolCalls`
- **SSE events vers client** : `event: <type>\ndata: <json>\n\n` — types `content`, `tool_approval`, `tool_result`, `done`, `error`. Parser cote web dans `parseSSEBuffer`
- **Tool loop** : max 5 steps, finish_reason=`tool_calls` → execute ou demande approval, finish_reason=`stop` → done
- **Approval** : `TOOLS_REQUIRING_APPROVAL = ['create_file', 'delete_file']` (shell_execute NOT listed — kill-switch suffit, auto-execute pour commandes safe)
- **Bible tools** : auto-executes via `mcpClient.callTool()`, errors wrappees `{ error: ... }` pour ne pas crasher le chat
- **Soft delete** : `deletedAt` timestamp nullable, filtre `isNull(deletedAt)` partout
- **Settings upsert** : `getOrCreateSettings(db, userId)` — insere defaults si pas de row
- **Budget guard** : middleware Hono avant chat, SUM(costUsd) sur la periode courante, 429 si depasse
- **Alert triggers** : insert dans `alertTriggers` dans la persistance finale quand un seuil est franchi (idempotent)
- **Env loading** : tsx charge `.env` + `.env.development` via flag `--env-file=../../<path>` dans les scripts `dev` (packages/api et packages/bible-mcp), later wins pour les overrides
- **File tools** : plus de `tool()` AI SDK — handlers directement dans `chat-tools.ts`, schemas JSON Schema bruts dans `buildToolDefinitions`
- **WebDAV** : implementation Hono-native, CSRF bypass sur `/webdav/*`, auth Bearer/Basic JWT scope webdav
- **Skills** : `SKILL.md` (frontmatter YAML name+description + body), charges dans un `Map` mutable, hot-reload chokidar
- **Systems (prompts)** : `SYSTEM.md` + `RULES.md` dans `$WORKSPACE_DIR/systems/`, bootstrap depuis `packages/api/src/defaults/systems/` si absent, hot-reload chokidar
- **Workspace** : `WORKSPACE_DIR` env var, `assertSafePath()` partout, `.attachments/` cache, `systems/` et `skills/` protegees en deletion
- **MCP client** : JSON-RPC 2.0 sur `${url}/mcp`, timeout via AbortController, health polling setInterval independant du premier listTools (demarre inconditionnellement). Status notifie via onStatusChange callback
- **Embeddings bible** : batching 100 textes/call, `text-embedding-3-large` (3072 dims) par defaut, `OPENAI_EMBEDDING_MODEL` override possible. Table `embeddings_meta` stocke `model` + `dim` pour detecter les mismatches au runtime
- **JSON Schema pour tools** : `zod-to-json-schema` cote bible-mcp (compat Zod 3), strip `$schema/$ref/definitions`, force `properties: {}` sur les objets vides (OpenAI le refuse sinon)

## Tests

- **Framework** : vitest
- **Pattern API** : temp SQLite DB par test, `runMigrations()` + `runSeed()`, JWT session directe
- **Pattern web** : vitest + @testing-library/react (happy-dom)
- **Pattern bible-mcp** : temp SQLite, serveur HTTP sur port 0 (ephemerique), fetch vers `/mcp`
- **Mock OpenAI** : `vi.spyOn(globalThis, 'fetch')` + Response SSE fabriquee ; mock differencie `stream=true` (SSE) vs non-streaming (JSON)
- **E2E** : Playwright, Chromium, mode E2E=1 pour bypass Resend

## Commits

- Format conventionnel : `feat(scope):`, `fix(scope):`, `chore:`, `docs:`, `refactor:`, `test:`
- Co-authored-by Claude quand genere par l'IA
- Commits atomiques par tache
