# Patterns et conventions — Buck Writer

> MAJ 2026-04-21 (M9 TTS live)

## Pattern local-id → DB-id reconciliation via SSE

Le chat front gère des messages optimistes avec `localId()` (format `local-N-timestamp`) pour afficher le message user immédiatement et streamer l'assistant. Le back insère en DB avec ses propres `newId()` dans le `finally` du runLoop, sans propager l'ID au front — les IDs divergent, inutilisables pour toute action post-hoc (TTS, future édition, etc).

Pattern : dans le `finally` du back (après les INSERTs), émettre des SSE events dédiés `user_saved { id }` et `assistant_saved { id }`. Le front track `userMsgLocalId` et `assistantId` dans le scope du handler, et sur réception remplace l'ID via `setMessages(prev => prev.map(...))`. Gérer aussi dans `handleApproval` (follow-up turns insèrent un assistant message). React key change → re-render propre, pas de flicker visible.

À étendre pour toute feature post-hoc (édition inline, fork session, etc).

## Pattern race-safe cache write (TTS)

Cache disk + DB cache_row avec unicité `(message_id, voice)`. Problème : 2 POST concurrents passent le `cacheHit` check ensemble, synthétisent deux fois, et se disputent l'INSERT.

Pattern :
1. Transaction SQLite englobant `INSERT ... ON CONFLICT DO NOTHING` + INSERT usage_events + .returning().
2. Si `inserted.length === 0` → loser du race : unlink le WAV orphelin (best-effort), re-SELECT la row du winner, retourne `{cached:true, costUsd:0}`.
3. UNIQUE constraint = serializer réel, le cacheHit upstream reste une optim rapide.

Appliqué dans `routes/tts.ts`. Reproductible pour tout cache write coûteux (embeddings, PDF extract, etc).

## Pattern singleton front pour ressource exclusive

Composants React multiples peuvent vouloir contrôler UNE ressource audio/vidéo/WebRTC partagée. `useRef` local → chaque instance a son propre handle, coexistence silencieuse = catastrophe (audio qui continue, mic allumé, mémoire fuite).

Pattern : `let currentX: X | null = null; let currentOwnerId: string | null = null;` module-level, helpers `setActive(x, id)` + `stopCurrent()` exportés. Listeners `Set<(activeId) => void>` notifiés sur changement → autres hooks `setState('idle')` quand ils perdent la main.

Exemples : `use-tts.ts` (audio), `use-realtime-voice.ts` (clientSingleton). Cleanup dans `useEffect` return : si `currentOwnerId === myId` → `stopCurrent()`. Aussi `mountedRef = useRef(true)` pour bailer après chaque `await` post-unmount.

## Pattern hidden workspace dirs

`buildTree` dans `routes/workspace.ts` filtre les dirs internes que l'utilisateur ne doit pas voir : `.attachments` (cache uploads), `.tts_audio` (cache TTS). Filtre en dur : `if (entry.name === '.attachments' || entry.name === '.tts_audio') continue;`. Ajouter à la liste dès qu'un nouveau cache disk serveur arrive sous `WORKSPACE_DIR`.

## Pattern config-via-env-var

Quand un seuil ou une constante metier meriterait d'être tuné en prod sans redeploy, l'expose via `env.ts` avec un Zod `coerce.number()/boolean()` et un default sensé. Exemple : `MEMORY_RECALL_THRESHOLD` (default 0.5). Piper depuis le schema → `bootstrapXxx` dans les consommateurs, JAMAIS hardcoder dans le service lui-même.

## Pattern fail-soft sur dep externe

Pour chaque dep externe critique (Supabase, Edge Functions, MCP remote), le chat DOIT continuer à tourner même si la dep est down. Pattern :
1. `AbortSignal.timeout(timeoutMs)` sur chaque req (typical 1500ms).
2. `try/catch` autour du call.
3. Fallback local (buffer retry, empty result, `degraded: true` dans le context).
4. SSE event dédié pour le UI (`memory_status { degraded: true }`) → badge UI via zustand store.
5. Jamais `throw` qui remonterait à Hono et casserait le stream.

## Pattern container env en Docker Compose

Pour éviter le piège `${VAR}` qui se résout en blank : préférer `env_file:` au lieu de `environment: KEY: ${KEY}`. Seule exception : les vars dérivées avec `:-default` ou les vars runtime-only.



## Architecture

- **Monorepo pnpm** : shared, api, web, bible-mcp, bible-ui + root.
- **Dependency injection** : routes Hono reçoivent un `deps` (db, email, jwt, prompts, mcpClient, usageTracker…). Tests 100% mockable.
- **Schema-first** : Zod dans shared, importé api + web.
- **Ownership guard** : routes `:id` filtrent `WHERE userId = current AND deletedAt IS NULL`, retournent 404 (pas 403).
- **Mutable refs hot-reload** : `PromptsRef = { current: Prompts }` — chokidar swap `.current`, chat lit la dernière version sans redémarrage.

## M8 — Realtime vocal

- **Ephemeral token mint backend** : jamais d'`OPENAI_API_KEY` browser. `/v1/realtime/client_secrets` côté serveur → `{clientSecret: string, expiresAt: number, sessionConfig}` (shape flat, pas d'object imbriqué). Browser utilise Bearer pour POST SDP `/v1/realtime/calls`.
- **Singleton module-level** : pour ressources partagées entre composants React (RealtimeClient, WebSocket, AudioContext) → `const singleton = { current: null }` module-level, pas `useRef` local. Sinon `stop()` no-op silencieux entre instances. Cleanup sur `beforeunload`, pas sur unmount.
- **Usage tracker monotone** : `Map<sessionId, TrackedUsage>` en mémoire, throw si valeur décroît, GC périodique sur `updatedAt`. Persist uniquement à la fermeture (DELETE) ou 429 budget.
- **Prompt assembly order** : SYSTEM → MEMORY → TOOLS → RULES (+ LIVE pour vocal). Tous dans `workspace/systems/` live-editable via chokidar. Bootstrap depuis `packages/api/src/defaults/systems/`. `buildSystemPromptWithMemory(base=system)` injecte préférences/contexte dynamiques dans le bloc SYSTEM avant MEMORY.
- **Stubs happy-dom WebRTC** : `packages/web/src/test/webrtc-stubs.ts` — `RTCPeerConnection`, `AudioContext`, `getUserMedia`. `createDataChannel` simule `onopen` via `queueMicrotask`.

## M7 — Responses API + MCP

- `/v1/responses` (plus `/v1/chat/completions`). SSE events structurés.
- MCP déclarés dans `tools: [{type:"mcp", server_label, server_url, headers}]` — **OpenAI appelle directement**, pas de proxy backend.
- Stateful via `previous_response_id` chaîné depuis `chat_sessions.last_response_id`. Front envoie uniquement le NOUVEAU message à partir du tour 2.
- MCP auto-classifier (`services/mcp-classifier.ts`) : préfixes `delete_/restore_/reindex_` → `require_approval: 'always'`, reste → `'never'`. Patche `mcp_servers.config_json` au boot.
- **Exception Realtime** : `require_approval='never'` forcé pour TOUS les MCP en mode Live (pas d'approval vocal).

## Nommage

- Fichiers kebab-case (`chat-area.tsx`, `rate-limit.ts`).
- Routes Hono : `createXxxRoutes(deps)` retourne un Hono sub-app.
- Tests colocated (`auth.ts` → `auth.test.ts`).
- Composants React PascalCase export, fichier kebab-case.
- DB : camelCase JS (`chatSessions`), snake_case SQL (`chat_sessions`).

## Code

- **Erreurs API** : `HttpError` + `{error:{code, message}}`. `OpenAIError` wrap le payload OpenAI.
- **Pagination** : cursor-based, fetch `limit+1`, pop overflow, retourne `nextCursor`.
- **Auth** : JWT cookie `buck_session` + CSRF cookie `buck_csrf` + header `x-csrf-token`.
- **Streaming OpenAI** : fetch direct `/v1/responses` avec `stream:true`, SSE parse via `createSSEBuffer`, tool calls via `accumulateToolCalls`.
- **SSE vers client** : `event: <type>\ndata: <json>\n\n` — types `content`, `tool_approval`, `mcp_approval`, `tool_result`, `done`, `error`, `memory_status`.
- **Tool loop** : max 5 steps (chat), `finish_reason='tool_calls'` → execute ou approval, `'stop'` → done.
- **Approval** : `TOOLS_REQUIRING_APPROVAL = ['create_file', 'delete_file']`. `shell_execute` auto-execute (kill-switch + whitelist).
- **Soft delete** : `deletedAt` nullable, filtre `isNull(deletedAt)`.
- **Settings upsert** : `getOrCreateSettings(db, userId)`.
- **Budget guard** : middleware avant chat, SUM(costUsd) période courante, 429 si dépassé.
- **Alert triggers** : insert idempotent sur seuils franchis.
- **Env loading** : tsx `--env-file=../../<path>` dans scripts dev.
- **WebDAV** : Hono-native, CSRF bypass `/webdav/*`, Bearer/Basic JWT scope webdav.
- **Skills** : `SKILL.md` frontmatter + body, chargés dans un `Map` mutable, chokidar.
- **Workspace** : `WORKSPACE_DIR` env, `assertSafePath()` partout, `.attachments/` cache, `systems/` + `skills/` protégés en deletion.
- **Embeddings** : `text-embedding-3-large` (3072 dims), batching 100/call, `OPENAI_EMBEDDING_MODEL` override. `embeddings_meta` stocke model+dim pour détecter mismatches.
- **JSON Schema tools** : `zod-to-json-schema`, strip `$schema/$ref/definitions`, force `properties:{}` sur objets vides.

## Sécurité

- **Shell** : whitelist + tokenizer, jamais blacklist. `packages/api/src/lib/kill-switch.ts` : `validateShellCommand()` tokenize (quotes, refuse métacaractères `|&;<>(){}\`$\\`), argv[0] dans `ALLOWED_BINS` (35 binaires). `execFile(bin, args)` direct, **jamais `/bin/sh -c`**.
- **TRUST_PROXY=true** derrière Caddy pour rate-limiter (X-Forwarded-For leftmost). Jamais en déploiement direct.
- **Test bundle ESM CLI guard** : `if (import.meta.url === \`file://\${process.argv[1]}\` && import.meta.url.endsWith('/migrate.js'))` — sinon le bundler re-fire au boot d'un autre entry.
- **Realtime** : `client_secret` éphémère ≤ 60 min, budget check AVANT mint + à chaque cumul usage client.

## UI / erom-design v2

- Source : skill `erom-design` (tokens DTCG + patterns).
- OKLCH uniquement, zéro hex. `--primary` = amber. Gris chauds hue 28. `<html class="dark">` forcé par défaut.
- **Borders > shadows** pour hiérarchie. Shadows réservées aux flottants.
- Hover : `hover-elevate` + `active-elevate-2` utilities.
- Popovers `bg-popover/95 backdrop-blur-xl`. Sticky headers `bg-sidebar/95 backdrop-blur-sm`.
- Badges sémantiques : `bg-{color}-500/10 text-{color}-400`.
- Tailles texte : principal `text-sm`, nav `text-[13px]`, metadata `text-[11px]`, section headers `text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/40`.
- Icônes `lucide-react`, `w-4 h-4` / `size-4`.
- Fonts Figtree + JetBrains Mono via `@fontsource-variable/*`.
- Shadcn style "new-york", installés à la demande.
- Chat shell 3 panneaux (sidebar 300/52 + chat + panel 300/40). Panel droit flottant sans bg/border. Shortcuts cmd+B (sidebar), cmd+\\ (panel droit). Collapsed persistent localStorage.
- Grouping sessions : favoris > today > 7d > older (`groupSessions()`, omit groupes vides, headers sticky blur).
- Chat input : textarea auto-grow (rows=1, `el.style.height = Math.min(scrollHeight, window.innerHeight/3)`).

## Memory (M5)

- **Module portable** `services/memory/` : dépend uniquement de `@supabase/supabase-js` + `openai`, zéro couplage Buck.
- **Factory pattern** stateful closures (pas classes). `__setClientForTest` swap sans redémarrer.
- **Feature flag isolation** : `bootstrapMemory` retourne un `MemoryServices` no-op si flag off. Aucun `if (memory.enabled)` dans le chat route.
- **Fail-soft** : timeout 1.5s, `degraded=true` sans throw, retry buffer FIFO cap 100 drain 30s.
- **halfvec(3072)** pour contourner limite HNSW 2000 dim du type `vector`. `embedding <=> x` = cosine distance.
- **RPC plpgsql** `match_memories` avec `RAISE EXCEPTION 'invalid filter_type' USING ERRCODE='22023'` — validation enum en DB.
- **Edge Functions Bearer auth** : `requireBearer(req, expectedKey)`, `verify_jwt: false` + `EDGE_INVOKE_KEY` custom.
- **Secrets dual location** : Vault Supabase (pg_cron lit via `vault.decrypted_secrets`) + Edge Function Secrets (`Deno.env.get()`). Dupliquer `OPENAI_API_KEY` et `EDGE_INVOKE_KEY`.
- **Cost tracking dual** : embeddings Node → `usage_events` SQLite. Edge → `buck_memory_usage` Supabase, rapatrié 6h via `syncMemoryUsage` avec cursor.
- **SSE `memory_status`** émis AVANT premier token si `degraded`.

## Bible UI (M7)

- Tools MCP **snake_case sans namespace** (`list_characters`, `get_character`).
- `list_*` retournent `{total, <typeName>: [...]}` ou `{total, limit, offset, results: [...]}` selon tool — extracteur défensif `extractArray<T>(data)` qui prend la première valeur Array de l'objet.
- Entités hétérogènes : pas de champ `name` partout (`event.title`, `note.content`, etc.). EntityCard utilise `getTitle(entity)` par type.
- **CSV strings end-to-end** (`event.characters`, `interaction.characters`) : parse via `JSON.parse` puis fallback `,`.
- **TanStack Router file-based** : `parent_.child.tsx` (underscore suffix) = sibling au lieu de nested. À utiliser pour TOUTES les `<entity>_.$id.tsx`.
- `mcp-client.ts` : `JSON.parse(text)` avec fallback `return text` (cas `export_bible` markdown).
- MCP via nginx : SPA appelle `/mcp` relatif. Dev Vite proxy, prod nginx resolver Docker `127.0.0.11`. Same-origin partout, zéro CORS.
- Versions deps alignées sur `@buck/web` pour éviter drift monorepo.
- Shadcn copie depuis `@buck/web/components/ui/` ce qui existe, install manquant. `toast` deprecated → `sonner`.

## Tests

- **Framework** vitest.
- **API** : temp SQLite par test, `runMigrations()` + `runSeed()`, JWT session directe.
- **Web** : vitest + @testing-library/react (happy-dom). Stubs WebRTC dans `test/webrtc-stubs.ts`.
- **Bible-mcp** : temp SQLite, serveur HTTP port 0 éphémère.
- **Mock OpenAI** : `vi.spyOn(globalThis, 'fetch')` + Response SSE. Différencie `stream=true` vs JSON.
- **E2E Playwright** Chromium, `E2E=1` bypass Resend.

## Commits

- Format conventionnel : `feat(scope):`, `fix(scope):`, `chore:`, `docs:`, `refactor:`, `test:`.
- `Co-Authored-By: Claude` quand généré par IA.
- Commits atomiques par tâche.
