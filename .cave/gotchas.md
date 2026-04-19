# Gotchas — Buck Writer

> MAJ 2026-04-19 (M8)

## M8 — OpenAI Realtime WebRTC

### Contract GA : mint payload + endpoint SDP
- **Mint `/v1/realtime/client_secrets`** accepte UNIQUEMENT `{session: {type:'realtime', model}}`. Voice/instructions/turn_detection/tools/modalities sont rejetés (`unknown_parameter 'session.voice'`). Les envoyer via `session.update` sur le DataChannel après connexion.
- **Endpoint SDP** = `POST /v1/realtime/calls?model=...`. L'ancien `/v1/realtime` est le beta et rejette un `client_secret` GA (`api_version_mismatch`).

### Architecture WebRTC
- **`clientSingleton` module-level** dans `useRealtimeVoice`, pas `useRef` local. Sinon `stop()` no-op entre instances (Notch/ChatInput/hotkey) → session OpenAI reste ouverte, mic allumé, facturation silencieuse. Cleanup via `beforeunload`, pas unmount.
- **`clientSecret` shape flat** côté API response : `{clientSecret: string, expiresAt: number}`. Si nested `{value, expiresAt}` le front envoie `Bearer [object Object]`.
- **`flushUsage` avant `stop()`** : sinon la dernière fenêtre mergée localement est perdue.
- **Ownership sur `realtimeSessionId`** vide / cross-user : valider length ≥ 6 et vérifier que `sessionId` chat appartient au user avant `tracker.update()`.

### Polling todos désactivé
`card-todos.tsx` avait `refetchInterval: 8000` → spam `/api/todos`. Désactivé. Les todos créés par le LLM ne remontent plus automatiquement — à revoir en invalidant `['todos']` dans `chat-stream.tsx` en fin de stream.

---

## Drizzle / Migrations

### Statement breakpoints obligatoires
Migrations multi-instructions nécessitent `-->statement-breakpoint` entre chaque ALTER/CREATE (better-sqlite3 n'accepte qu'une instruction par appel). `drizzle-kit` les génère ; migrations écrites à la main doivent les ajouter + entrée `migrations/meta/_journal.json`.

### Snapshot meta out of sync
`pnpm db:generate` peut régénérer une migration avec N statements si le snapshot meta est out-of-sync (colonnes ajoutées à la main). Dette : régénérer le snapshot drizzle au prochain sprint DB.

### Numérotation auto
Les plans anticipent parfois un numéro (ex : `0008_foo`) mais `pnpm db:generate` décide de la numérotation. Suivre l'output.

### CLI guard ESM bundled
Tout bloc `if (import.meta.url === \`file://\${process.argv[1]}\`)` doit ALSO vérifier le filename suffix (`&& import.meta.url.endsWith('/migrate.js')`). Sinon le bundler re-fire au boot d'un autre entry qui l'a importé. Bug réel en prod (`db/migrate.ts` bundlé dans `dist/index.js` → re-lance `runMigrations()` sans `migrationsFolder` → ENOENT → crashloop).

### DATABASE_URL relatif
Relatif au cwd du process (packages/api). En dev, `.env.development` utilise `../../data/buck.db` pour pointer racine monorepo.

---

## MCP / Responses API

### OpenAI ne peut pas joindre localhost / Docker interne
MCP remote connectors appelés par l'infra OpenAI, PAS par Buck. `MCP_BIBLE_URL=http://bible-mcp:7801` ne marche pas — il faut une URL HTTPS publique (`https://bible-mcp.buck.romain-ecarnot.com`). Pas de dev MCP local testable sans tunnel (ngrok) OU test direct sur VPS.

### MCP Streamable HTTP transport : Accept header obligatoire
Transport officiel MCP renvoie 406 Not Acceptable si `Accept` ne contient pas **les deux** : `application/json, text/event-stream`. SDK `McpServer` exige un transport par server — utiliser une factory `() => createServer(...)`.

### require_approval : noms génériques = approval partout
Si `require_approval.tool_names` liste des tools qui n'existent PAS côté serveur, OpenAI retombe sur approval par défaut pour tout. Utiliser les vrais noms MCP (`list_characters`, `search_fulltext`, etc.) — JAMAIS `list_entities`, `create_entity`.

### Approval pendante bloque la chain
Si `chat_sessions.last_response_id` contient un `mcp_approval_request` non résolu et que l'user envoie un nouveau message, OpenAI répond `400: The following MCP approval requests do not have an approval`. `previous_response_id` exige la résolution. Workaround : nouvelle session. Fix durable : soit résoudre avant de chaîner, soit drop `previous_response_id` si approval en attente.

### Classifier MCP : approval uniquement sur ops irréversibles
Premier jet taggait tous les writes → insoutenable pour un écrivain en flow. Fix : seuls `delete_/restore_/reindex_` → `always`. Philosophie : l'user possède ses données, approve les ops **irréversibles** uniquement. Miroir du pattern workspace (`create_file` auto, `delete_file` approval).

### Bearer MCP via env var NAME, pas valeur
`mcp_servers.config_json` stocke `auth_header_env: "MCP_SHARED_SECRET"`. Le secret lui-même est resolved à request-time via `env[auth_header_env]`. Never store secrets in DB.

### Bearer container-level KO pour bible-mcp
Bible UI consomme `/mcp` via chemin interne (Caddy → nginx → bible-mcp) qui n'injecte pas Authorization. Un middleware Bearer dans le container lock out l'UI. → **Caddy edge only** pour l'auth publique. Container reste en trust dans réseau Docker interne.

### runSeed one-shot, runMcpSeed idempotent
`runSeed` gate `userCount === 0` (first-run only). `runMcpSeed` (upsert `ON CONFLICT UPDATE config_json`) appelé inconditionnellement au boot pour propager les changements de config MCP.

---

## Deploy / Docker / Infra

### deploy-vps.sh pull depuis origin/main, pas local
`scripts/deploy-vps.sh` fait `git fetch && git reset --hard origin/main`. **Toujours `git push` AVANT**. Sinon : nouveau fichier absent du container, package.json sans la dep fraichement ajoutée.

### docker compose recreate sans rebuild
`docker compose up -d --force-recreate buck-app` **ne rebuild pas l'image**. Toujours `docker compose build buck-app && docker compose up -d --force-recreate buck-app` après changement API.

### caddy reload ne relit PAS env vars
`docker compose exec caddy caddy reload` recharge le Caddyfile mais garde les env vars du démarrage. Les placeholders `{$VAR}` restent à l'ancienne valeur. → **Toujours** `docker compose up -d --force-recreate caddy` quand l'env change.

### Trinity docker-compose n'expose pas toutes les env vars à Caddy
Le bloc `environment:` de caddy dans `/opt/trinity-lifeos/docker-compose.yml` liste explicitement les vars exposées. Ajouter une nouvelle var à `.env.trinity` ne suffit pas — il faut ajouter `- VAR=${VAR}` au bloc. Check : `docker exec trinity-lifeos-caddy-1 env | grep VAR`.

### .env.production séparé du .env dev
Ne JAMAIS réutiliser `.env` dev en prod. Pièges trouvés : `E2E=1` → fail-fast au boot, `MEMORY_ENABLED` listé 2×, `RESEND_FROM=gmail` non vérifié. Maintenir `.env.production` gitignored + scp via deploy-vps.sh.

### bible-mcp Docker : pnpm deploy --prod + COPY /deploy → /app
Le runtime stage copiait `packages/bible-mcp/node_modules` mais pnpm workspace hoist vers `/app/node_modules` → `Cannot find package 'express'`. Fix : `pnpm deploy --filter @buck/bible-mcp --prod /deploy` au build, puis COPY `/deploy → /app` au runtime. Dir flat self-contained. Pattern à reproduire pour tout package pnpm workspace dockerisé.

### writing-tools-mcp : fichier `server.py` ET package `server/`
Upstream wdm0006/writing-tools-mcp a les deux → `ImportError`. Fix : charger `server.py` via `importlib.util.spec_from_file_location` directement.

### uv-created venvs n'ont PAS pip
`uv sync` crée un `.venv/` minimal sans pip. `python -m spacy download ...` crash. Fix : `uv pip install --python .venv/bin/python <URL wheel GitHub>`.

### Alpine : pas de `localhost` dans /etc/hosts
Healthcheck doit utiliser `127.0.0.1`. Cookie CSRF `Secure` flag sur HTTP KO → conditionnel `NODE_ENV === 'production'`.

---

## Auth / Sécurité / SSO

### Cookie Domain : se relogger après changement
Les cookies présents gardent leur ancien `Domain`. Changer `COOKIE_DOMAIN` serveur ne rétroagit pas. Logout + nouveau magic-link requis. Verif DevTools : Domain doit être `.romain-ecarnot.com` (pas `buck.*`).

### SSO : `.env` VPS pas re-sync automatiquement
Changer `.env.production` local ne suffit pas — rejouer `scripts/deploy-vps.sh` (qui fait `scp .env.production`) OU `ssh vps + echo >> /opt/buck-writer-app/.env && docker compose up -d buck-app`. Restart seul ne recharge pas les env vars.

### verify-session DOIT être monté avant le rate-limiter
Bible UI fire 1 req HTTP par asset → chaque asset déclenche un `forward_auth` Caddy → `/api/auth/verify-session`. Si sous rate-limiter `/api/auth/*` (5 req/min) → crash après 5 assets. Monter explicitement avant `rateLimiter()` comme `/api/auth/me` et `/api/auth/webdav-token`.

### Rate limiter / `/api/auth/me`
Doit être monté AVANT le rate limiter (appelé à chaque navigation).

### Audit sécu : 5 vulns patchées
- **VULN-001 P0** : `shell_execute` blacklist contournable → strict whitelist 35 binaires + tokenizer refusant métacaractères + `execFile` direct. Voir `lib/kill-switch.ts`.
- **VULN-002 P1** : `DELETE /file?path=prompts/SYSTEM.md` pas bloqué → `isProtectedPath()` check `===` ET `startsWith(dir + '/')`.
- **VULN-003 P1** : X-Forwarded-For spoofing → env `TRUST_PROXY=true` UNIQUEMENT si derrière reverse-proxy trust, sinon socket peer via `getConnInfo`.
- **VULN-004 P2** : E2E backdoor → fail-fast au boot si `E2E=1 && NODE_ENV=production`.
- **VULN-005 P2** : WebDAV CSRF OK (tests de régression cookie-auth rejected).

### Resend : domaine d'envoi doit être vérifié
`RESEND_FROM=gmail.com` → 422 `domain not verified`. Utiliser `dev@romain-ecarnot.com` (verifié SPF+DKIM) ou `onboarding@resend.dev` workaround.

---

## TanStack / Vite

### Flat-routing : underscore = non-nested
`parent.tsx` devient automatiquement layout de `parent.child.tsx`. Si pas de `<Outlet/>`, la route child ne monte jamais (bug silencieux "click fait rien"). Fix : renommer `parent_.child.tsx` (underscore suffix). Appliquer à toutes les `<entity>_.$id.tsx`.

### validateSearch pour query params
Pour lire `?session=xxx` sur route `/`, ajouter `validateSearch: z.object({ session: z.string().optional() })` au `createFileRoute`. `useSearch({ strict: false })` pour lire depuis n'importe quelle route.

### routeTree.gen.ts auto-régénéré
Via plugin Vite, ignore par `.gitignore`.

### TanStackRouterVite plugin crash sans __root.tsx
Ajouter le plugin AVANT que `src/routes/__root.tsx` existe → `rootRouteNode must not be undefined`. Workaround setup initial : retirer plugin, créer root, re-ajouter.

### envDir Vite pour .env racine unique
`envDir: path.resolve(__dirname, '../..')` dans tous les `vite.config.ts`. Vite n'expose au browser QUE les vars `VITE_*` — secrets serveur safe dans `.env` racine.

### EADDRINUSE pnpm dev + pnpm dev:bible
`pnpm dev` racine lance TOUS les packages. Lancer `pnpm dev:bible` en plus → EADDRINUSE sur 7801. Un seul terminal. Possible futur : exclure bible-* de `pnpm dev` racine.

---

## Bible MCP / Bible UI

### MCP tools snake_case sans namespace
51 tools en `list_characters`, `get_event`, `update_world_rule`, etc. PAS de namespace dotted (`bible.characters.list` → faux). Toujours vérifier via `tools/list` réel.

### list_* response shapes inconsistantes
- `list_characters` → `{characters: [...]}`
- `list_events` → `{events: [...]}`
- `list_notes` → `{notes: [...]}`
- `list_research` → `{research: [...]}`
- `list_world_rules` → `{worldRules: [...]}` (camelCase, pas snake)
- `list_locations` → `{results: [...]}` + limit/offset
- `list_interactions` → `{results: [...]}` + limit/offset

Helper défensif `extractArray<T>()` qui prend la première valeur Array. Voir `hooks/use-graph.ts`.

### get_bible_stats shape
`{entities: {characters, locations, events, interactions, worldRules, research, notes}, totalEntities, totalEmbeddings, database}`. `worldRules` camelCase parmi d'autres clés snake-friendly. `total` en sortie sœur de `entities`.

### Entités hétérogènes (pas de `name` partout)
`event.title`, `note.content`, `world_rule.title+category`, `research.topic+content`, `interaction.description+nature+characters`. Extracteur `getTitle(entity)` par type.

### CSV strings end-to-end
`event.characters`, `interaction.characters` en CSV string OU JSON array selon tool. Parse via `JSON.parse` + fallback `,` split. Ne PAS split/join systématiquement côté client.

### export_bible = Markdown, pas JSON
`mcp-client.ts` : try/catch `JSON.parse(text)` + fallback `return first.text`.

### restore_bible prend `backup_name` (pas `id`)
`list_backups` retourne `name` (string) comme identifiant.

### JSON Schema OpenAI-compatible
Upstream utilisait `z.toJSONSchema` (API Zod 4). Buck pinné Zod 3 → throw → fallback `{type:"object"}` sans properties → **400 "object schema missing properties"**. Fix : `zod-to-json-schema` (lib dédiée), strip `$schema/$ref/definitions`, garantir `properties:{}` sur objets vides.

### Startup race bible-mcp
`pnpm dev` parallélisé → api arrive au `listTools()` avant que bible-mcp écoute. Fix : api fait 5 tentatives x 2s. `MCP_HEALTH_POLL_MS` (défaut 30s) pour le poll continu. `startPolling()` AVANT le premier rpc, sinon polling jamais démarré si échec initial.

### Embeddings dimensions migration
Upstream HuggingFace (384 ou 768 dims). Buck OpenAI `text-embedding-3-large` (3072 dims). Migration `0001_openai_embeddings.sql` drop+recreate `embeddings` + ajoute `embeddings_meta`. DB peuplée avant M4 avec vecteurs HF → `bible_search_semantic` plante. Fix : appeler `bible_reindex_embeddings`.

### RightPanel mort dans bible-ui
`AppShell` rendait inconditionnellement un `<RightPanel>` que aucune route ne peuplait → colonne permanente "Sélectionner une entité…". Fichier supprimé. Pattern : panneau droit contextuel → au niveau route, pas shell.

### Shadcn `toast` deprecated → `sonner`
Upstream deprecated. `import { toast } from 'sonner'`.

---

## Memory (M5)

### FK constraint silencieuse sur usage_events
`BUCK_USER_ID` (UUID Supabase-side) n'existe PAS dans `users` SQLite. `embedText` insert `usage_events` → `FOREIGN KEY constraint failed`. Le `catch` fail-soft swallow → buffer RAM, pas de row en DB, diagnostic impossible. Fix : `insertUsageEvent` lookup premier user SQLite (solo-per-instance). Leçon : `console.warn` dans chaque catch fail-soft.

### halfvec(3072) vs vector(3072) HNSW
Type `vector` limite 2000 dims pour HNSW. `text-embedding-3-large` = 3072 → dépasse. Fix : `halfvec(3072)` (FP16) + `halfvec_cosine_ops`. Perte négligeable. Inserts supabase-js `number[]` → PostgREST cast automatique.

### Edge Function Secrets != Vault
Supabase a 2 endroits : **Vault** (`vault.decrypted_secrets`, SQL, pg_cron) ET **Edge Function Secrets** (`Deno.env.get()`). Indépendants. Dupliquer `OPENAI_API_KEY` et `EDGE_INVOKE_KEY` dans les deux. `BUCK_USER_ID` seulement Edge Secrets.

### Supabase v2 abortSignal chain
`.abortSignal()` pas exposé sur le builder retourné par `.single()` (typage v2). Cast `as unknown as { abortSignal: ... }` pour TS, runtime OK.

### Tools format OpenAI raw (pas Vercel AI SDK)
Le plan M5 spécifiait Zod + `tool()` AI SDK. Buck utilise raw OpenAI (`ToolDefinition` + JSONSchema) depuis migration 2026-04-18. `services/memory/tools.ts` retourne `{definition, handler}` compat `buildToolDefinitions` + `buildToolHandlers`.

---

## Divers

### RESEND optionnel / E2E file
`RESEND_API_KEY`, `OPENAI_API_KEY`, `MCP_BIBLE_URL` optionnels dans `env.ts`. Si Resend pas configuré → fallback E2E email service (token dans fichier).

### pdf-parse ESM
v2 : `.default` pas toujours présent → `const pdfParse = pdfParseModule.default ?? pdfParseModule`.

### ES2022 vs ES2023
`findLastIndex()` inexistant en ES2022 → `reduce()`.

### WebDAV CSRF
Finder/Explorer ne peuvent pas envoyer token CSRF. Middleware skip `c.req.path.startsWith('/webdav')`.

### Session implicite / skip reload
Premier message crée session implicite → `x-session-id` header trigger `useEffect[sessionId]` → `fetchMessages()` vide. Fix : `createdSessionRef` skip le reload.

### Tailwind v4 plugins
Import via `@plugin` pas `@import` : `@plugin "@tailwindcss/typography"`.

### ESLint
Types DOM (`HTMLDivElement`) à déclarer dans globals browser. Pattern `const Foo = z.object; type Foo = z.infer` → `no-redeclare: off`.

### Pattern opaque-button-border (erom v2)
`--primary-border = hsl(from oklch(...) h s calc(l + var(--opaque-button-border-intensity)) / 1)`. Intensity = -8 light / 9 dark. À réutiliser pour primary/secondary/destructive/sidebar-*.

### Lint FileList globale absente
Utiliser `ArrayLike<File>` (compat FileList + File[], marche avec `Array.from`).

### Worktree tests
Après merge worktree, `pnpm install` requis sur main avant `pnpm test`.

### Budget guard / Usage
SUM filtré par `periodStart <= createdAt < periodEnd`. `getOrCreateSettings()` appelé dans budget-guard (sinon user sans row bypass hard stop). `alertTriggers` keys par `yearMonth` dérivé de `periodStart`.

### MemoryBadge collapsed sidebar
Collapsed ~52px → pas de place pour texte. Badge monte seulement expanded. Future : icône compacte `<AlertTriangle />` en collapsed.
