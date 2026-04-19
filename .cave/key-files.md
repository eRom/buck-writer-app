# Fichiers cles — Buck Writer

> Derniere mise a jour : 2026-04-19 (M8 — mode Live vocal)

## M8 — Mode Live vocal

### API
- `packages/api/src/lib/realtime.ts` — `mintRealtimeClientSecret()`, payload strict `{type,model}`.
- `packages/api/src/services/realtime/session-config.ts` — build payload `session.update` (voice, VAD, tools avec require_approval=never, write_to_chat function, modalities).
- `packages/api/src/services/realtime/snapshot.ts` — 20 derniers messages formatés `[role]: text`.
- `packages/api/src/services/realtime/usage-tracker.ts` — `Map` monotone + GC 2min.
- `packages/api/src/services/billing/monthly-cost.ts` — helper SUM costUsd période courante.
- `packages/api/src/routes/realtime.ts` — 5 endpoints (`/session`, `/usage`, `/transcript`, `/write-to-chat`, `DELETE /session/:id`), gated par `REALTIME_ENABLED`.
- `packages/api/migrations/0007_realtime.sql` — messages.source, usage_events.kind, user_settings realtime_*.
- `packages/api/src/defaults/systems/{LIVE,MEMORY,TOOLS}.md` — prompts defaults.
- `packages/api/src/services/prompts.ts` — Prompts étendu `{system, memory, tools, rules, live}`, bootstrap + load des 5 fichiers.

### Web
- `packages/web/src/lib/realtime-client.ts` — classe WebRTC (PC, DC, AudioContext, AnalyserNode, usage agg, transcript queue, timers silence/duration).
- `packages/web/src/lib/realtime-api.ts` — `realtimeApi.{createSession,postUsage,postTranscript,writeToChat,closeSession}`.
- `packages/web/src/stores/realtime-store.ts` — Zustand state vocal + recentTranscripts.
- `packages/web/src/hooks/use-realtime-voice.ts` — **clientSingleton module-level**, binding events → store.
- `packages/web/src/hooks/use-realtime-hotkey.ts` — `Cmd+Shift+L` / `Ctrl+Shift+L` toggle.
- `packages/web/src/components/live/notch.tsx` — pill fixed top-center (`role="status"`, `aria-live="polite"`).
- `packages/web/src/components/live/waveform.tsx` — canvas 32 barres via `requestAnimationFrame`.
- `packages/web/src/components/settings/audio-live-section.tsx` — voix, VAD, silence timeout, tools, permission micro.
- `packages/web/src/test/webrtc-stubs.ts` — stubs happy-dom pour tests.

### Shared
- `packages/shared/src/voice/voices.ts` — `REALTIME_VOICES` (10), `DEFAULT_VOICE='coral'`.
- `packages/shared/src/voice/turn-detection.ts` — `TurnDetectionConfig`, `normalizeTurnDetection`.
- `packages/shared/src/pricing/models.ts` — `REALTIME_MODEL`, `costOfRealtime(usage, model?)`.

### Docs
- `docs/superpowers/specs/2026-04-19-m8-realtime-voice-design.md` — spec complète (13 sections).
- `docs/superpowers/plans/2026-04-19-m8-realtime-voice.md` — plan 10 phases TDD.
- `docs/superpowers/plans/2026-04-19-m8-manual-checklist.md` — checklist test manuel Chrome.

---

## QW1 — Approval flow MCP

## QW1 — Approval flow MCP

| Fichier | Role |
|---------|------|
| `packages/api/src/services/mcp-classifier.ts` | Au boot, `tools/list` sur chaque MCP core=1 via `@modelcontextprotocol/sdk`, classifie par préfixe (`delete_/restore_/reindex_` → always, reste → never), patche `mcp_servers.config_json.require_approval`. Fail-soft |
| `packages/api/src/services/mcp-classifier.test.ts` | 4 tests unitaires de `classifyToolNames` |
| `packages/web/src/components/chat/chat-stream.tsx` | `PendingApproval.kind: 'local' \| 'mcp'`, handler SSE `mcp_approval`, branching `mcpApproval` vs `toolApproval` sur POST `/api/chat` |


## M7 — Clés de la migration Responses API

| Fichier | Role |
|---------|------|
| `packages/api/src/lib/openai.ts` | Client `/v1/responses` : `streamResponses`, `respond` (non-stream titre), `createSSEBuffer`, `parseResponsesEventBlock`. Types internally-tagged (`FunctionToolDef`, `McpToolDef`, `ResponsesInputItem`, `ResponsesEvent`) |
| `packages/api/src/routes/chat.ts` | Run loop Responses SSE : accumule function_call_arguments, handle MCP events, chaîne `previous_response_id` sur `chat_sessions.lastResponseId`, exec continuations via `function_call_output` items |
| `packages/api/src/services/mcp-registry.ts` | Lit `mcp_servers` DB → construit `McpToolDef[]` pour `tools[]`. Bearer via env var name (`auth_header_env`) résolu à request time |
| `packages/api/src/routes/mcp.ts` | GET /api/mcp (liste) + PATCH /api/mcp/:id (toggle enabled) |
| `packages/api/src/db/seed.ts` | `runSeed` (first run) + `runMcpSeed` (idempotent upsert au boot) |
| `packages/api/migrations/0006_responses_api_fields.sql` | `chat_sessions.last_response_id` + `usage_events.cached_input_tokens` |
| `packages/web/src/lib/mcp.ts` | `fetchMcpServers`, `setMcpEnabled`, `useBibleStatus` (derive de la liste) |
| `packages/web/src/components/panel-right/card-mcp.tsx` | UI badge on/off cliquable (disabled si core=1) |
| `packages/bible-mcp/src/http.ts` | Streamable HTTP transport officiel (@modelcontextprotocol/sdk), factory `McpServerFactory`, sessions stateful + fallback stateless |
| `Dockerfile.writing-tools-mcp` | Fork git wdm0006 + patch entrypoint FastMCP streamable-http port 7802 |
| `docker/writing-tools-mcp/entrypoint.py` | Load upstream server.py via importlib (contourne collision avec package server/) |
| `Caddyfile` | Blocs `bible-mcp.buck.*` + `writing-mcp.buck.*` avec matcher Bearer |
| `docs/deploy/mcp-public-caddy.md` | Guide rotation secret, DNS, sanity checks |
| `docs/superpowers/specs/2026-04-19-m7-responses-api-mcp.md` | Spec détaillée (fichier par fichier, event mapping, tests) |



## Deploy / Infra

| Fichier | Role |
|---------|------|
| `scripts/deploy-vps.sh` | Script idempotent : git pull VPS + scp .env.production + build + up + sanity HTTPS |
| `.env.production` (gitignored) | Variables prod scp vers /opt/buck-writer-app/.env sur VPS |
| `~/.ssh/id_vps20260131` | Clé SSH locale → VPS root@72.62.239.98 |
| `/Users/recarnot/dev/trinity-lifeos-agent/vps/docker/{docker-compose.yml,caddy/Caddyfile,.env}` | Stack Trinity (n8n + voice + caddy + qdrant) — Caddy attaché à `caddy-public` pour servir Buck + sites Buck dans Caddyfile |


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

## Memory (packages/api/src/services/memory/) — M5

| Fichier | Role |
|---------|------|
| `index.ts` | Barrel exports du module |
| `types.ts` | `MemoryType`, `RememberInput`, `RecallInput`, `RecallResult`, `MemoryContext`, `BuckStateRow` |
| `supabaseClient.ts` | `getSupabase(env)` — singleton client service_role, `__resetSupabaseForTest()` |
| `embeddings.ts` | `embedText(text, deps)` — OpenAI embeddings + insert `usage_events` (kind `memory_embedding`), pricing text-embedding-3-large |
| `memoryOrchestrator.ts` | `buildMemoryContext(userId, {supabase, timeoutMs})` — Promise.allSettled parallel fetch static/context, `degraded=true` sans throw |
| `remember.ts` | `createRememberService({supabase, embed, userId, bufferCap})` — persist + FIFO retry buffer RAM, `drain()` periodique |
| `recall.ts` | `createRecallService({supabase, embed, userId, threshold})` — RPC `match_memories` + bump `last_accessed_at` async |
| `state.ts` | `createStateService({supabase, userId, compact, tokenCounter})` — set two-tier, trigger `compact-state` Edge si `context` > budget, hard-truncate si compact fail |
| `usageSync.ts` | `syncMemoryUsage({supabase, userId, sinceCursor, insertUsage, saveCursor})` — rapatriement `buck_memory_usage` → `usage_events` SQLite (mapping `consolidation`→`memory_consolidation`, `compaction`→`memory_compaction`) |
| `tools.ts` | `recallTool(recall)` + `rememberTool(remember)` — wrappers `{ definition: ToolDefinition, handler: ToolHandler }` pour chat route (format OpenAI raw, pas Vercel AI SDK) |
| `bootstrap.ts` | `bootstrapMemory({env, insertUsageEvent, readUsageCursor, writeUsageCursor, tokenCounter}) → MemoryServices` — compose tout, no-op si flag off ou env incomplet |
| `*.test.ts` | 21 tests unit (7 fichiers, types.ts pas de test) |

## Memory Edge Functions (packages/api/supabase/)

| Fichier | Role |
|---------|------|
| `migrations/20260418_0001_memory_schema.sql` | Tables `buck_memories` + `buck_state` + `buck_memory_usage` + RPC `match_memories` (plpgsql, valide filter_type enum) |
| `migrations/20260418_0002_pgcron_schedule.sql` | `cron.schedule('buck_nightly_consolidation', '0 3 * * *', ...)` avec Bearer depuis `vault.decrypted_secrets` |
| `functions/_shared/auth.ts` | `requireBearer(req, expectedKey)` — valide `Authorization: Bearer`, 401 sinon |
| `functions/_shared/openai.ts` | `chat()`, `embed()`, `chatCostUsd()`, `embedCostUsd()` — fetch direct OpenAI Deno-compatible |
| `functions/consolidate-memory/prompts.ts` | `CONSOLIDATION_SYSTEM` + `buildConsolidationUser(episodes)` |
| `functions/consolidate-memory/index.ts` | Fetch 7 derniers jours episodes → LLM extract facts (JSON schema) → dedup vectoriel @ 0.92 → insert/merge semantic → log usage |
| `functions/compact-state/index.ts` | Accept `{user_id, key, current_value, token_budget}` → LLM compress a 60% budget → insert usage |

## Memory Web (packages/web/src/)

| Fichier | Role |
|---------|------|
| `components/memory-badge.tsx` | `<MemoryBadge />` — affiche "⚠ memoire indisponible" si `useMemoryStatus().degraded` |
| `stores/memory-status.ts` | Store Zustand `{ degraded, lastSignalAt, setDegraded }` |
| `tests/e2e/memory.spec.ts` | Playwright round-trip remember/recall, gated par `MEMORY_E2E=1` |

## Scripts

| Fichier | Role |
|---------|------|
| `packages/api/scripts/seed-memory-defaults.ts` | Upsert 4 keys static dans `buck_state` : lang/tone/timezone/user_profile |

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

## Bible UI (packages/bible-ui/src/) — M7 (2026-04-18)

| Fichier | Role |
|---------|------|
| `main.tsx` | Bootstrap : RouterProvider + QueryClientProvider + ThemeProvider (dark default) |
| `routes/__root.tsx` | Layout racine : `<AppShell>` (TopBar + SidebarLeft + RightPanel) wrap `<Outlet/>` |
| `routes/index.tsx` | Dashboard : `useMcpQuery('get_bible_stats')`, grid 4-col cards stats par type |
| `routes/{characters,locations,events,notes,research,world-rules,interactions}.tsx` | Liste CRUD + Sheet creation (snake_case tool names) |
| `routes/{...}.$id.tsx` | Detail edit + ConfirmDialog delete |
| `routes/search.tsx` | Tabs fulltext/semantic, `search_fulltext` / `search_semantic` |
| `routes/timeline.tsx` | Frise verticale `get_timeline` (chapter+sortOrder, pas de date) |
| `routes/graph.tsx` | Compose `<GraphView>` + `<NodeDetail>` selon selectedNode (port UX barda) |
| `components/graph/graph-view.tsx` | SigmaContainer + compose GraphLoader/Events/Layout/Controls/Legend/Highlighter |
| `components/graph/graph-events.tsx` | clickNode → onSelectNode, clickStage → null |
| `components/graph/graph-highlighter.tsx` | nodeReducer/edgeReducer : dim non-voisins, scale x1.4 selectionne, restore camera |
| `components/graph/graph-layout.tsx` | useWorkerLayoutForceAtlas2 (web worker, barnesHut, 3s puis stop) |
| `components/graph/graph-controls.tsx` | Zoom +/−/Recentrer + filtres checkbox par type (hidden flag) |
| `components/graph/graph-legend.tsx` | Color key entity types |
| `components/graph/node-detail.tsx` | Panneau droit : badge + description + bouton "Voir la fiche" navigate /<type>/$id + liste Connexions cliquables |
| `routes/<entity>_.$id.tsx` | Renommé depuis `<entity>.$id.tsx` — underscore évite le nesting parent-child auto de TanStack flat-routing |
| `routes/import-export.tsx` | `export_bible` (Markdown !) + `import_bulk` |
| `routes/backups.tsx` | `list_backups` + `backup_bible` + `restore_bible` (id = backup_name) |
| `api/mcp-client.ts` | `callTool(name, params)` POST `/mcp` JSON-RPC + fallback markdown si JSON.parse fail |
| `hooks/use-mcp.ts` | `useMcpQuery` / `useMcpMutation` wrappers TanStack Query autour callTool |
| `hooks/use-graph.ts` | Compose nodes/edges depuis 4 list_* tools + parse CSV/JSON interactions.characters |
| `components/entities/{entity-card,entity-list,entity-form}.tsx` | Composants generiques CRUD multi-type (FIELDS config par type) |
| `components/layout/{app-shell,topbar,sidebar-left,right-panel}.tsx` | Shell 3 panneaux calque Buck |
| `components/ui/*.tsx` | 19 composants shadcn (7 copies depuis @buck/web + 12 installes) |
| `styles/globals.css` | Tokens erom v2 OKLCH (copie de @buck/web/src/index.css) |
| `theme-provider.tsx` | Copie de @buck/web (defaultTheme="dark") |
| `nginx.conf` | Sert dist/ + proxy `/mcp` → `bible-mcp:7801` (resolver Docker 127.0.0.11) |
| `vite.config.ts` | TanStackRouterVite + react + tailwind, port 5174, envDir racine, proxy `/mcp` → 7801 |

## Web (packages/web/src/) — erom-design v2 (2026-04-18)

| Fichier | Role |
|---------|------|
| `index.css` | Theme erom-design v2 complet : OKLCH, amber brand, dark-first, utilities hover-elevate, scrollbar 6px, font Figtree + JetBrains Mono |
| `routes/index.tsx` | Route / — ChatShell + SidebarLeft + PanelRight + ChatStream ; `?session=xxx` validateSearch |
| `routes/login.tsx` + `-login.view.tsx` | Login magic link re-skinnne card centree + dev login si DEV |
| `routes/settings.tsx` | Mono-page scrollable (AccountSection + GeneralSection + BudgetSection) |
| `routes/__root.tsx` | Root route (auth guard global) |
| `components/layout/chat-shell.tsx` | Shell 3 panneaux, persiste collapsed state + kbd shortcuts cmd+b / cmd+\\ |
| `components/layout/sidebar-left.tsx` | Container sidebar gauche — search state + logout |
| `components/layout/sidebar-left-header.tsx` | Search input + toggle collapse |
| `components/layout/sidebar-left-sessions.tsx` | Liste groupee (favoris/today/7j/older) + mutation toggleFavorite optimiste |
| `components/layout/session-item.tsx` | Lien session + etoile toggle amber |
| `components/layout/sidebar-left-footer.tsx` | User pill + dropdown settings/logout |
| `components/layout/panel-right.tsx` | Panel droit flottant (pas de bg/border) — 4 cards + stack d'icones collapsed |
| `components/panel-right/card-parametres.tsx` | Selecteurs Modele + Raisonnement + budget bar (mutation session ou user_settings) |
| `components/panel-right/card-workspace.tsx` | File tree compact avec refresh |
| `components/panel-right/card-referentiel.tsx` | Badge status Bible MCP (on/off via useBibleStatus) |
| `components/panel-right/card-mcp.tsx` | Placeholder "Aucun serveur MCP configure" |
| `components/chat/chat-stream.tsx` | Logique streaming SSE (successeur de chat-area.tsx, prefere les sous-composants) |
| `components/chat/chat-input.tsx` | Textarea auto-grow (max 33vh) + chips attachments + paperclip + send ; pas de model selector |
| `components/chat/chat-empty-state.tsx` | Empty state BookOpen + CTA FR tutoyee |
| `components/chat/message-user.tsx` | Bubble sombre aligne droite + copy hover |
| `components/chat/message-assistant.tsx` | Avatar Sparkles + slots reasoning/toolCalls/footer |
| `components/chat/message-footer.tsx` | Metadata provider/model/ms/tokens/cost font-mono opacity-40 |
| `components/chat/reasoning-collapsible.tsx` | "> Reflexion" toggle |
| `components/chat/tool-calls-collapsible.tsx` | "> N outils utilises" auto-open sur pending approval |
| `components/chat/tool-call-item.tsx` | Rendu 1 tool call (absorbe approval/terminal/tool-call-display selon state) |
| `components/chat/markdown-renderer.tsx` | react-markdown + rehype-highlight + katex |
| `components/chat/at-reference.tsx` | Dropdown autocomplete @file |
| `components/chat/attachment-display.tsx` | Affichage attachments dans messages |
| `components/chat/model-selector.tsx` | Legacy (plus monte dans l'UI, a nettoyer si vraiment inutilise) |
| `components/settings/account-section.tsx` | Section compte (email readonly) |
| `components/settings/general-section.tsx` | Section general (defaultModel + defaultReasoningEffort + WebDavWizard) |
| `components/settings/budget-section.tsx` | Section budget (usage bar + limite + resetDay + hardStop) |
| `components/settings/webdav-wizard.tsx` | Token WebDAV + instructions OS |
| `components/workspace/file-tree.tsx` | Arborescence recursive (prop `entries`, onSelect, onInsertReference) |
| `components/ui/switch.tsx` | Ajoute via shadcn, pour cards MCP/Referentiel |
| `lib/use-panels-state.ts` | Hook collapsed state + localStorage + kbd shortcuts |
| `lib/session-groups.ts` + test | groupSessions() : favoris/today/7j/older |
| `lib/sessions.ts` | Client API sessions (Session.isFavorite + reasoningEffort, toggleFavorite helper) |
| `lib/api.ts` | apiFetch() — CSRF auto, error handling |
| `lib/csrf.ts` | readCsrfCookie() |
| `lib/session.ts` | fetchMe() — auth state |
| `lib/settings.ts` | Client API settings + usage |
| `lib/workspace.ts` | Client API workspace |
| `lib/attachments.ts` | Client API attachments (upload multipart) |
| `lib/mcp.ts` | useBibleStatus — poll 30s sur /api/mcp/bible/status |

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
| `.env.example` | Template variables d'environnement (+ M5 : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BUCK_USER_ID, MEMORY_ENABLED, OPENAI_EMBEDDING_MODEL, EDGE_INVOKE_KEY) |
| `.env.development` | Overrides dev local, chemins relatifs `../../` depuis packages/ |
| `Dockerfile.app` | Multi-stage build Node 20 Alpine pour buck (api+web) |
| `Dockerfile.bible-mcp` | Multi-stage Node 20 Alpine pour bible-mcp |
| `Dockerfile.bible-ui` | Multi-stage Node 20 builder + nginx alpine runtime (M7), proxy `/mcp` vers bible-mcp |
| `docker-compose.yml` | Services buck + bible-mcp + **bible-ui** (M7), networks caddy-public + internal |
| `docs/deploy/caddy-snippet-bible.md` | Snippet Caddy `forward_auth` (SSO) pour `bible.buck.romain-ecarnot.com` + rollback basicauth |
| `docker-compose.local.yml` | Dev hybride : bible-mcp Docker + buck pnpm dev |
| `eslint.config.mjs` | ESLint flat config monorepo |
| `workspace/systems/{SYSTEM,RULES}.md` | Prompts live-editable, committed (dev) |
