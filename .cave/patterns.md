# Patterns et conventions — Buck Writer

> Derniere mise a jour : 2026-04-18 (M5 Memory Supabase mergee)

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

## UI / erom-design v2 (2026-04-18)

- **Source de verite** : skill `~/.claude/skills/erom-design/` (tokens DTCG + patterns). Ne pas y deroger.
- **Theme** : OKLCH uniquement, zero hex en dur. `--primary` = amber (`oklch(0.82 0.17 70)` dark). Gris chauds hue 28 sur surfaces dark. `<html class="dark">` force par defaut.
- **Borders > shadows** : hierarchie visuelle via `border`, pas via `shadow-*`. Shadows reservees aux elements flottants (dialogs, popovers).
- **Hover** : pattern `hover-elevate` + `active-elevate-2` sur boutons et liens interactifs (utilities custom dans `index.css`).
- **Popovers** : `bg-popover/95 backdrop-blur-xl`. Sticky headers : `bg-sidebar/95 backdrop-blur-sm`.
- **Badges semantiques** : `bg-{color}-500/10 text-{color}-400` — TOUJOURS ce pattern.
- **Textes** : principal `text-sm`, nav `text-[13px]`, badges/metadata `text-[11px]` ou `text-[10px]`, section headers `text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/40`.
- **Icones** : `lucide-react` uniquement, `w-4 h-4` ou `size-4` par defaut.
- **Fonts** : Figtree (sans) + JetBrains Mono (code/metadata), via `@fontsource-variable/*`.
- **Primitive shadcn** : style "new-york", installees a la demande via `pnpm dlx shadcn@latest add xxx`.
- **Reecriture UI 2026-04-18** : chat-area.tsx eclate en sous-composants nommes par responsabilite (`message-user`, `message-assistant`, `reasoning-collapsible`, `tool-calls-collapsible`, `tool-call-item`, `chat-stream`, `chat-empty-state`, `message-footer`). 14 composants obsoletes supprimes (chat-area, chat-layout, sidebar, session-list, message-bubble, approval-block, terminal-block, tool-call-display, user-menu, budget-banner, attachment-preview, bible-status-banner, workspace-panel + route /workspace).
- **Layout** : `ChatShell` dans `components/layout/`, 3 panneaux (sidebar 300/52 + chat + panel droit 300/40). Panel droit sans bg/border (flotte sur bg chat). Kbd shortcuts : cmd/ctrl+B (sidebar), cmd/ctrl+\\ (panel droit). Etat collapsed persistent dans localStorage.
- **Grouping sessions** : `groupSessions()` dans `lib/session-groups.ts` — favoris > today > 7d > older. Omit les groupes vides. Section headers sticky avec blur.
- **Favoris** : migration Drizzle 0004 `chat_sessions.is_favorite INTEGER DEFAULT 0` + index. API `PATCH /api/sessions/:id { isFavorite }`. Mutation optimiste cote web (invalidate sur onSettled).
- **Model / Raisonnement** : 2 selects dans `CardParametres`. Si session active → `PATCH session { model | reasoningEffort }`, sinon `PATCH user_settings { defaultModel | defaultReasoningEffort }`. Liste modeles ordonnee `nano / mini / normal / pro (disabled)` dans un array local (pas `MODELS` brut de shared).
- **Input chat** : textarea auto-grow via `useEffect` (rows=1, `el.style.height = Math.min(el.scrollHeight, window.innerHeight/3)`). Pas de model selector dans l'input (deplace en panel droit).
- **Empty state chat** : BookOpen icone (pas Sparkles), copy tutoyee FR ("Commence une nouvelle conversation", "Selectionne ou cree une conversation pour continuer ton recit").

## Memory layer (M5, 2026-04-18)

- **Module portable** : `services/memory/` depend uniquement de `@supabase/supabase-js` + `openai`. Zero couplage avec Buck. Reutilisable ailleurs.
- **Dependency injection** : toutes les fonctions prennent leurs deps explicitement (`createRememberService({supabase, embed, userId, bufferCap})`). Tests 100% mockable.
- **Factory pattern** : `createRememberService` / `createRecallService` / `createStateService` retournent des closures stateful (pas de classes). `__setClientForTest` permet de swap le client sans redemarrer.
- **Feature flag isolation** : `bootstrapMemory` retourne un `MemoryServices` no-op si `MEMORY_ENABLED=false` ou envs incomplets. Aucun `if (memory.enabled)` dans le chat route, juste `memory.buildContext(...)` qui retourne `{preferences:{}, activeContext:{}, degraded:false}` en no-op.
- **Fail-soft par defaut** : timeout 1.5s sur toutes les calls Supabase critiques. `buildMemoryContext` retourne `degraded=true` au lieu de throw. `remember.remember` buffer en RAM si fail (deferred). `recall.recall` retourne `[]` si fail. Jamais le chat ne crash pour une panne memory.
- **Retry buffer FIFO** : `Map` avec cap 100, drop oldest si full. Drain periodique (30s) tente de persister tout le buffer ; stop on first failure pour eviter thundering herd.
- **halfvec(3072) + HNSW cosine** : `vector` type par defaut a une limite 2000 dim pour HNSW → `halfvec` (demi-precision) permet 3072 dim avec tres peu de perte. `embedding <=> x` = cosine distance, `1 - (embedding <=> x)` = cosine similarity.
- **RPC avec validation enum** : `match_memories` est en plpgsql (pas sql) pour pouvoir `RAISE EXCEPTION 'invalid filter_type' USING ERRCODE='22023'`. La couche DB enforce la regle metier independamment du code applicatif.
- **Edge Functions Bearer auth** : `requireBearer(req, expectedKey)` helper partage. Les deux functions (`consolidate-memory`, `compact-state`) sont deployees avec `verify_jwt: false` + custom Bearer `EDGE_INVOKE_KEY`. Obligatoire pour eviter abus financier (LLM invoke public).
- **Secrets dual location** : Vault Supabase (accessible via SQL `vault.decrypted_secrets`, utilise par pg_cron) ET Edge Function Secrets (`Deno.env.get()`). Pas le meme scope. Dupliquer les valeurs dans les deux endroits pour `OPENAI_API_KEY` et `EDGE_INVOKE_KEY`.
- **Cost tracking dual** : embeddings Node-side → `usage_events` SQLite (synchrone, visible dans budget guard M2). Edge-side (consolidate/compact) → `buck_memory_usage` Supabase + rapatriement cron 6h via `syncMemoryUsage` avec cursor `user_settings.memory_usage_sync_cursor`.
- **SSE memory_status** : le chat route emet `event: memory_status\ndata: {"degraded": true}\n\n` AVANT le premier token si `buildMemoryContext` retourne degraded. Parse cote web dans `lib/chat.ts`, update store Zustand `useMemoryStatus`.
- **Usage des tools** : encourage dans `workspace/systems/RULES.md` (section "Memoire long terme"). Interdit d'affirmer avoir memorise sans appeler le tool. `remember` pour prefs stables / decisions / entites. `recall` pour questions contextuelles / coherence / introspection.

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
