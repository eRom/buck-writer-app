# Gotchas — Buck Writer

> Derniere mise a jour : 2026-04-18 (M5 Memory Supabase mergee)

## Drizzle snapshot meta out of sync (2026-04-18)

- `pnpm db:generate` a regenere un 0004 avec **5 statements** au lieu de 2 : colonnes `messages.model`, `messages.tool_meta`, `user_settings.billing_reset_day` etaient presentes en DB mais absentes du snapshot meta
- Cause : migrations 0001/0002/0003 ont ete ecrites a la main sans passer par drizzle-kit, donc le snapshot n'a jamais ete mis a jour
- **Solution appliquee** : trim manuel du 0004_*.sql pour garder uniquement `is_favorite` + index, puis `pnpm db:migrate`
- A faire (dette) : regenerer le snapshot drizzle au prochain sprint DB

## Lint no-undef sur FileList (2026-04-18)

- La config eslint du package web ne declare pas la globale `FileList` → erreur `no-undef`
- **Solution** : utiliser `ArrayLike<File>` a la place (compatible FileList natif + File[], marche avec `Array.from(files)`)

## TanStack Router search params (2026-04-18)

- Pour acceder a `?session=xxx` sur la route `/`, ajouter `validateSearch: z.object({ session: z.string().optional() })` au `createFileRoute`
- Le `routeTree.gen.ts` se regenere automatiquement via le plugin Vite en dev
- Dans `SidebarLeftSessions` on utilise `useSearch({ strict: false })` pour lire depuis n'importe quelle route (typage `as { session?: string }`)

## Pattern opaque-button-border (erom v2)

- `--primary-border` est derive dynamiquement via `hsl(from oklch(...) h s calc(l + var(--opaque-button-border-intensity)) / 1)`
- `--opaque-button-border-intensity` = `-8` en light (plus sombre que le fill) / `9` en dark (plus claire que le fill)
- A reutiliser pour primary / secondary / destructive / sidebar-primary / sidebar-accent

## Migration OpenAI directe (plus d'AI SDK)

- AI SDK v6 (`ai`, `@ai-sdk/openai`) supprime le 2026-04-18 — trop d'instabilites : `as any` partout, `z.toJSONSchema` sur Zod 4 inexistant en Zod 3, streaming text-only qui forcait une regex heuristique pour detecter les approvals
- Remplace par fetch direct `https://api.openai.com/v1/chat/completions` dans `lib/openai.ts`
- Approval flow devient deterministe : SSE finish_reason=`tool_calls` declenche l'event `tool_approval` typé, plus de parsing heuristique cote client

## Env loading en dev

- `tsx watch` ne lit que `.env` du cwd par defaut. Les packages tournent depuis `packages/<name>/` → le `.env` racine n'est PAS lu
- **Solution** : scripts `dev` des packages api et bible-mcp utilisent `tsx watch --env-file=../../.env --env-file=../../.env.development ...`
- Later `--env-file` override, donc secrets restent dans `.env` (gitignored) et overrides dev dans `.env.development` (versionne)
- Meme gotcha s'applique a tout nouveau package qui a besoin de vars — pattern a reproduire

## Bible MCP — JSON Schema OpenAI-compatible

- L'upstream utilisait `z.toJSONSchema` (API Zod 4). Avec notre Zod 3 pinné, l'appel throw et fallback sur `{type: "object"}` — donc tous les tools arrivent a OpenAI sans `properties` → **400 "object schema missing properties"**
- **Fix** : `zod-to-json-schema` (lib dediee) dans `bible-mcp/src/http.ts`, strip `$schema/$ref/definitions`, garantir `properties: {}` sur les objets vides

## Bible MCP — startup race

- `pnpm dev` lance api + bible-mcp en parallele. L'api arrive souvent au `listTools()` avant que bible-mcp ecoute
- **Fix** : api fait 5 tentatives x 2s avant d'abandonner. `MCP_HEALTH_POLL_MS` (defaut 30s) pour le poll continu
- Le `startPolling()` doit etre appele **avant** le premier `rpc`, sinon en cas d'echec initial le polling ne demarre jamais (bug attrape en live)

## Bible MCP — embeddings dimensions

- Upstream utilisait HuggingFace (384 ou 768 dims). Buck utilise OpenAI `text-embedding-3-large` (3072 dims)
- Migration `0001_openai_embeddings.sql` drop+recreate la table `embeddings` + ajoute `embeddings_meta` (model, dim)
- Une DB peuplee avant M4 a des vecteurs HF → `bible_search_semantic` plante. **Solution** : appeler `bible_reindex_embeddings` depuis le chat apres avoir remplace la DB

## Bible MCP — DB peuplee

- La DB par defaut du repo upstream (`barda-mcp-ecrivain-bible/data/bible.db`) est vide (que les tables FTS auto-creees)
- La vraie DB Matrix de Romain vit dans `packages/mcp/data/bible.db` du repo upstream (440KB, 12 persos, 10 lieux, 19 events)

## Approval flow — scope

- Design intent : approval uniquement pour operations vraiment sensibles (`create_file`, `delete_file`). `shell_execute` NE fait PAS partie de `TOOLS_REQUIRING_APPROVAL` — le kill-switch bloque les destructives (`rm`, `chmod`, etc.) et les commandes safe (`ls`, `date`, `pwd`) s'executent sans friction

## Prompts refactor

- `prompts/USER.md` existait mais n'etait jamais injecte — code mort supprime
- Les prompts vivent maintenant dans `$WORKSPACE_DIR/systems/` (live-editable, hot-reload chokidar)
- Bootstrap : si `$WORKSPACE_DIR/systems/` est vide au demarrage, l'api copie les defaults de `packages/api/src/defaults/systems/` (embarques dans dist via tsup `onSuccess`)
- `AppDeps.prompts` est un `PromptsRef = { current: Prompts }` — mutable wrapper pour que chokidar puisse swap sans redemarrer l'api

## Docker / Alpine

- Alpine n'a pas `localhost` dans `/etc/hosts` → healthcheck doit utiliser `127.0.0.1`
- Cookie CSRF avec flag `Secure` ne fonctionne pas sur HTTP → conditionnel sur `NODE_ENV === 'production'`

## Env / Zod

- `RESEND_API_KEY`, `OPENAI_API_KEY`, `MCP_BIBLE_URL` sont optionnels dans env.ts (pas utilises avant M1+/M4+)
- Si Resend n'est pas configure, l'API fallback sur le E2E email service (ecrit le token dans un fichier)

## Tailwind v4

- Les plugins s'importent avec `@plugin` pas `@import` : `@plugin "@tailwindcss/typography"`

## ESLint

- Les types DOM (`HTMLDivElement`, etc.) doivent etre declares dans les globals browser du eslint.config.mjs
- Pattern Zod `const Foo = z.object({...}); type Foo = z.infer<typeof Foo>` → `no-redeclare: off`
- 12 erreurs pre-M4 pre-existantes dans le code (web/routes/workspace, services/webdav, etc.) — a traiter un jour, pas bloquant

## DB / Drizzle

- Les migrations api sont dans `packages/api/migrations/`, le journal dans `meta/_journal.json`
- Drizzle 0.36 exige `sqliteTable('x', cols, (t) => ({ key: ... }))` (objet), 0.45+ acceptait les arrays
- `pnpm deploy --filter @buck/api --prod` cree un flat node_modules sans devDependencies

## E2E / Playwright

- `E2E=1` bypass Resend et ecrit le token magic-link dans `./data/e2e-last-token.json`
- La route `__e2e__/last-token` est gatee par `E2E=1 && NODE_ENV !== 'production'`

## Budget guard / Usage

- SUM(costUsd) filtre par `periodStart <= createdAt < periodEnd` (pas juste `>= periodStart`)
- `getOrCreateSettings()` appele dans budget-guard — sinon user sans row bypass hard stop
- `alertTriggers` keys par `yearMonth` derive de `periodStart` (pas mois courant)

## Session implicite

- Premier message cree session implicite → `x-session-id` header trigger useEffect[sessionId] → fetchMessages() → vide
- **Fix** : `createdSessionRef` dans ChatArea skip le reload

## Rate limiter auth

- `/api/auth/me` doit etre monte AVANT le rate limiter (appele a chaque navigation)

## DATABASE_URL relatif

- `DATABASE_URL=file:./data/buck.db` est relatif au cwd du process (packages/api)
- En dev, `.env.development` utilise `../../data/buck.db` pour pointer sur la racine monorepo

## pdf-parse ESM

- v2 a un export ESM mais `.default` n'existe pas toujours → `const pdfParse = pdfParseModule.default ?? pdfParseModule`

## ES2022 vs ES2023

- `findLastIndex()` n'existe pas en ES2022 → `reduce()` pour simuler

## WebDAV CSRF

- Clients WebDAV (Finder, Explorer) ne peuvent pas envoyer de token CSRF
- `middleware/csrf.ts` : condition `c.req.path.startsWith('/webdav')` → skip

## Worktree tests

- Apres merge worktree, `pnpm install` requis sur main avant `pnpm test`

## M5 — FK constraint silencieuse sur usage_events (2026-04-18)

- `BUCK_USER_ID` (UUID Supabase-side, dans `.env`) n'existe PAS dans la table SQLite `users`. Quand `embedText` tente d'inserer un row `usage_events` avec `user_id = BUCK_USER_ID`, la FK vers `users.id` fail → `SqliteError: FOREIGN KEY constraint failed`
- Le `catch` dans `remember.ts` swallow silencieusement l'erreur et buffer en RAM → pas de row dans `buck_memories`, diagnostic quasi impossible sans log
- **Fix applique** : dans `insertUsageEvent` de `packages/api/src/index.ts`, lookup du premier user SQLite (solo-per-instance) pour satisfaire la FK. Le user_id Supabase-side reste `BUCK_USER_ID` (coherent pour `buck_memories.user_id` / `buck_state.user_id`)
- **Leçon** : toujours avoir un log warn dans le catch du fail-soft pour ne pas perdre la debuggabilite. Patch applique dans `remember.ts` : `console.warn('[memory:remember] failed, buffering', err.message)`

## M5 — halfvec(3072) vs vector(3072) HNSW

- Le type `vector` par defaut a une limite 2000 dimensions pour les index HNSW (ivfflat idem). `text-embedding-3-large` = 3072 dims → depasse
- **Fix** : utiliser `halfvec(3072)` (demi-precision FP16) qui accepte 3072 avec `halfvec_cosine_ops` pour HNSW. Perte de precision negligeable pour cosine similarity
- Les inserts depuis `supabase-js` passent un `number[]` (double precision) → PostgREST cast automatiquement vers halfvec. Pas besoin de `::halfvec(3072)` explicite

## M5 — Edge Function Secrets != Vault

- Supabase a deux endroits distincts pour les secrets : **Vault** (`vault.decrypted_secrets`, accessible via SQL, utilise par pg_cron/postgres) ET **Edge Function Secrets** (accessible via `Deno.env.get()` depuis les Edge Functions)
- Les deux sont **independants**. Vault n'est PAS automatiquement exposé aux Edge Functions
- **Pattern applique** : dupliquer `OPENAI_API_KEY` et `EDGE_INVOKE_KEY` dans les deux endroits. `BUCK_USER_ID` uniquement dans Edge Secrets (Vault pas necessaire pour cron)

## M5 — Supabase v2 abortSignal chain

- Le type `SupabaseClient` v2 n'expose PAS `.abortSignal()` sur le builder retourne par `.single()` — la methode existe sur le FilterBuilder en amont
- Dans `remember.ts` on cast `as unknown as { abortSignal: ... }` sur la chain pour satisfaire TS tout en preservant le runtime (la methode existe bien a l'execution)
- Les mocks de test reproduisent cette chain mais via des helpers types-laxistes (`as never`)

## M5 — Vercel AI SDK vs OpenAI raw

- Le plan initial M5 specifiait des tools en format Zod + `tool()` Vercel AI SDK. Or la chat route Buck utilise le format OpenAI raw (`ToolDefinition` avec `parameters: JSONSchema`) depuis la migration OpenAI directe (2026-04-18)
- **Adaptation** : `services/memory/tools.ts` retourne `{ definition: ToolDefinition, handler: ToolHandler }` compatibles avec `buildToolDefinitions` + `buildToolHandlers` existants
- Le chat route append `rc.definition, rm.definition` dans `toolDefs` et `toolHandlers[rc.definition.function.name] = rc.handler`

## M5 — MemoryBadge dans sidebar collapsed

- La sidebar en collapsed n'a que ~52px de largeur — pas de place pour le badge texte "⚠ memoire indisponible"
- Decision : badge monte uniquement dans le variant expanded de `SidebarLeftFooter`. Acceptable car la degradation est rare et le footer expand sur interaction utilisateur
- A envisager plus tard : icone compacte type `<AlertTriangle className="text-amber-500 size-3.5" />` dans collapsed

## M5 — Bouton nouvelle session oublie par erom v2

- Le redesign UI erom v2 (2026-04-18) n'a pas porte le bouton de creation de session → utilisateur bloque apres une session
- **Fix** : ajout `<SquarePen />` dans `sidebar-left-header.tsx`, mutation `createSession()` + navigate. En collapsed : empile verticalement (toggle en haut, new session en dessous) pour eviter debordement horizontal

## M5 — Drizzle migration numerotation

- Le plan M5 anticipait `0009_memory_usage_sync_cursor.sql` mais `pnpm db:generate` a genere `0005_spicy_nightshade.sql` (numerotation auto basee sur les migrations existantes)
- Pas grave — noter juste que la numerotation des plans est indicative, Drizzle decide
