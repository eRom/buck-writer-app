# Gotchas — Buck Writer

> Derniere mise a jour : 2026-04-19 (M8 — OpenAI Realtime vocal)

## M8 — OpenAI Realtime WebRTC (2026-04-19)

### Mint payload strict en GA (contract trap #1)
`POST /v1/realtime/client_secrets` rejette avec `unknown_parameter 'session.voice'` si le body inclut autre chose que `{ type:'realtime', model }`. Voice, instructions, turn_detection, tools, modalities, input_audio_transcription : **tous à envoyer après via `session.update` sur le DataChannel**. Pas via le mint. Voir `packages/api/src/lib/realtime.ts`.

### Endpoint SDP GA (contract trap #2)
L'endpoint WebRTC beta était `POST /v1/realtime?model=...`. En GA 2026 c'est **`POST /v1/realtime/calls?model=...`**. Sinon : `api_version_mismatch "You cannot start a Realtime beta session with a GA client secret"`. Voir `packages/web/src/lib/realtime-client.ts:135`.

### Singleton RealtimeClient (architecture trap)
`useRealtimeVoice` doit **partager un `clientSingleton` module-level**, pas un `useRef` local. Sinon le `stop()` appelé depuis Notch opère sur une ref différente de celle créée par ChatInput/hotkey → la session OpenAI reste ouverte, mic reste allumé, facturation silencieuse. Cleanup via `beforeunload` listener. Voir `packages/web/src/hooks/use-realtime-voice.ts:20-22`.

### `clientSecret` shape flat, pas nested
Le backend retournait `clientSecret: minted` (object `{value, expiresAt}`) → le front envoyait `Bearer [object Object]` à OpenAI. Fixé : backend retourne `clientSecret: string + expiresAt: number` à plat.

### Tracker usage et idempotence transcript
Tracker usage = `Map` en mémoire mono-tab. Si l'API redémarre, les sessions en cours perdent leur cumul local → le client re-enverra les agrégats à la prochaine `response.done`. Idempotence transcript via `toolMeta = voice:${startedAt}:${role}`.

### Migration Drizzle : statement breakpoints
Migrations SQL multi-instructions nécessitent `-->statement-breakpoint` entre chaque ALTER/CREATE (contrainte better-sqlite3). Toutes les migrations générées par `drizzle-kit` les ont ; 0007 écrite à la main a dû être fixée post-hoc. Ajouter aussi une entrée dans `migrations/meta/_journal.json`.

### Prompt découpé en 4 fichiers — ordre respecté
Ordre : **SYSTEM → MEMORY → TOOLS → RULES** (+ skills list pour chat, + LIVE + snapshot pour realtime). `buildSystemPromptWithMemory(base=system)` injecte les préférences/contexte dynamiques DANS le bloc SYSTEM avant MEMORY (qui est la doc statique de l'outil recall/remember).

### Polling todos désactivé
`card-todos.tsx` avait `refetchInterval: 8000` → spam `/api/todos` toutes les 8s. Désactivé. Les todos créés par le LLM ne remontent plus automatiquement — à revoir en invalidant `['todos']` dans `chat-stream.tsx` en fin de stream.

---



## QW1 — deploy-vps.sh pull depuis origin/main, pas le local (2026-04-19)

`scripts/deploy-vps.sh` ligne 89 : `git fetch --all && git reset --hard origin/main`. Le VPS ne récupère PAS ton repo local — il pull la remote. Commit local non pushé = deploy avec l'ancien code. Symptôme : nouveau fichier absent du container (`ls node_modules/@modelcontextprotocol` → No such file), package.json sans la dep fraichement ajoutée. **Toujours `git push` AVANT de lancer deploy-vps.sh**.

## QW1 — Classifier MCP : approval uniquement sur ops destructives (2026-04-19)

Premier jet QW1 taggait tous les writes (`create_/update_/delete_/import_/restore_/reindex_/backup_`) comme `always` approval. Insoutenable pour un écrivain en flow — chaque `create_character` ou `update_event` ouvrait une dialog. Fix final (`mcp-classifier.ts`) : seuls `delete_/restore_/reindex_` déclenchent approval. Mirror du pattern workspace (`create_file` auto, `delete_file` approval). Philosophie : l'user possède ses données, approve seulement les ops **irréversibles**.

## QW1 — Session chat avec mcp_approval_request pendant = crashloop (2026-04-19)

Si le dernier `response.id` d'une session contient un `mcp_approval_request` non résolu et que l'user envoie un nouveau message, OpenAI répond `400: The following MCP approval requests do not have an approval: mcpr_...`. Le chaînage `previous_response_id` exige que toute approval pendante soit résolue avant d'avancer. Workaround : nouvelle session. Fix durable non-scoped QW1 : soit nettoyer l'approval pendante avant de chainer, soit drop `previous_response_id` si une approval traine. À surveiller post-migration `'never'` → classif granulaire.

## QW1 — MCP SDK dans @buck/api nécessaire pour tools/list au boot (2026-04-19)

Le classifier fait un vrai handshake MCP (initialize + tools/list) via `@modelcontextprotocol/sdk` (`StreamableHTTPClientTransport` + `Client`). Pas de raw JSON-RPC, pas d'appel "stateless" — le transport gère session_id, headers, Accept `application/json, text/event-stream`. Fail-soft : si `tools/list` échoue, on garde le seed default (`'never'` global). Auth : header Bearer depuis `env[auth_header_env]` (même pattern que `mcp-registry.ts`).


## M7 — docker compose recreate SANS rebuild = ancien binaire (2026-04-19)

`docker compose up -d --force-recreate buck-app` **ne rebuild pas l'image** si elle existe déjà. Le container reprend l'ancien binaire → les changements de code (seed, routes, etc.) ne prennent pas effet. Toujours `docker compose build buck-app && docker compose up -d --force-recreate buck-app` après un changement API.

Symptôme : les logs montrent `[api] mcp_servers refreshed` mais la DB garde l'ancien JSON config (parce que le seed embarqué dans le binaire est l'ancien).

## M7 — Caddy `caddy reload` ne relit PAS les env vars (2026-04-19)

`docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile` recharge le Caddyfile mais le process Caddy garde les env vars du démarrage. Les placeholders `{$MCP_SHARED_SECRET}` restent à leur ancienne valeur (ou vides). → **Toujours** `docker compose up -d --force-recreate caddy` quand l'env change, jamais juste reload. Le deploy-vps.sh fait désormais ça.

## M7 — Trinity docker-compose n'expose pas toutes les env vars à Caddy (2026-04-19)

Trinity's Caddy service liste explicitement ses env vars : `N8N_HOST`, `VOICE_USER`, `VOICE_PASSWORD_HASH`, `BUCK_HOST_BASE`. Ajouter une nouvelle var à `.env.trinity` ne suffit pas — il faut ajouter `- MCP_SHARED_SECRET=${MCP_SHARED_SECRET}` au bloc `environment:` de caddy dans `/opt/trinity-lifeos/docker-compose.yml`. Sans ça, le placeholder `{$MCP_SHARED_SECRET}` reste littéralement la string dans le Caddyfile, et tout bearer réel tombe en 401.

Check : `docker exec trinity-lifeos-caddy-1 env | grep MCP`.

## M7 — writing-tools-mcp : upstream a fichier `server.py` ET package `server/` (2026-04-19)

Le repo wdm0006/writing-tools-mcp a les deux. `from server import mcp` résolue → package (`server/__init__.py`) qui n'exporte pas `mcp` → `ImportError`. Fix : charger `server.py` via `importlib.util.spec_from_file_location` directement. Bonus : loader via importlib garde `__name__ != "__main__"` donc le guard stdio de l'upstream ne se déclenche pas.

## M7 — uv-created venvs n'ont PAS pip (2026-04-19)

`uv sync` crée un `.venv/` minimal sans pip. `python -m spacy download en_core_web_sm` crash `No module named pip`. Fix : installer le model wheel directement via `uv pip install --python .venv/bin/python <URL wheel GitHub>`.

## M7 — MCP Streamable HTTP transport exige `Accept: application/json, text/event-stream` (2026-04-19)

Le transport officiel MCP côté serveur renvoie **406 Not Acceptable** si le header `Accept` ne contient pas les DEUX types. OpenAI's Responses connector envoie le bon header ; les clients custom (comme notre ancien bible-ui) doivent être mis à jour. Aussi : le SDK `McpServer` exige **un transport par server** — ne pas partager une instance entre sessions. Utiliser une **factory** `() => createServer(...)` passée à l'http layer.

## M7 — Bearer container-level KO pour bible-mcp (2026-04-19)

Bible UI consomme `/mcp` via un chemin interne (Caddy → bible-ui nginx → bible-mcp:7801) qui n'injecte pas le header Authorization. Un middleware Bearer dans le container bible-mcp lock out l'UI. → **Caddy edge only** pour l'auth publique (bible-mcp.buck.*). Le container reste en trust dans le réseau Docker interne. Le middleware Bearer dans `http.ts` existe toujours mais est désactivé par absence de `MCP_SHARED_SECRET` dans l'env du container (garder pour future migration ZTNA).

## M7 — `require_approval` generic names → OpenAI demande approval pour tout (2026-04-19)

Si `require_approval: {never: {tool_names: [...]}, always: {tool_names: [...]}}` liste des tools qui n'existent PAS côté serveur MCP, OpenAI retombe sur le comportement par défaut = requires approval. Le chat enchaine `mcp_approval_request` → 400 au tour suivant si pas d'approval envoyée. Solution scope M7 : `require_approval: 'never'` global pour les MCP solo-owned (bible). Flow approval UI reporté M7.1.

Ne JAMAIS mettre des noms génériques comme `list_entities`, `create_entity` : les tools bible-mcp sont domain-specific (`list_characters`, `search_fulltext`, `create_character`, etc.).

## M7 — `runSeed` one-shot, `runMcpSeed` idempotent (2026-04-19)

Le seed initial ne tourne qu'à DB vide (gate `userCount === 0`). Donc en prod les changements de config MCP ne se propagent jamais après le premier boot. Fix : `runMcpSeed` (upsert `ON CONFLICT UPDATE config_json`) appelé inconditionnellement au boot de `index.ts`. Users reste first-run only (safe). Le log `[api] mcp_servers refreshed` confirme l'exécution.

## M7 — OpenAI ne peut pas joindre localhost/Docker interne (2026-04-19)

Les MCP remote connectors sont appelés par l'infra OpenAI, PAS par Buck. Donc `MCP_BIBLE_URL=http://bible-mcp:7801` ne marche pas — OpenAI doit recevoir une URL HTTPS publique (`https://bible-mcp.buck.romain-ecarnot.com`). Implication : pas de dev MCP local testable sans tunnel (ngrok) OU tester directement sur VPS. Les tests unitaires mockent `fetch` ; les tests e2e MCP = smoke manuels post-deploy.



## SSO cookie : `.env` VPS n'est PAS re-sync automatiquement par docker compose (2026-04-19)

Ajouter `COOKIE_DOMAIN=.romain-ecarnot.com` à `.env.production` **local** ne suffit pas : tant que `scripts/deploy-vps.sh` n'est pas rejoué (qui fait le `scp .env.production`), le VPS garde l'ancien `.env`. Et même une fois la ligne présente, il faut **recréer** le container (`docker compose up -d buck-app`) — un simple restart ne recharge pas les env vars.
Symptôme : `docker exec buck-app env | grep COOKIE_DOMAIN` renvoie vide → cookie set sans Domain → bible.buck.* renvoie `{"error":"no session"}`.
**Fix rapide sans redeploy** : `ssh vps` + `echo 'COOKIE_DOMAIN=...' >> /opt/buck-writer-app/.env && docker compose up -d buck-app`.

## SSO : se relogger après changement du cookie Domain (2026-04-19)

Les cookies déjà présents dans le navigateur gardent leur ancien `Domain` attribute. Changer `COOKIE_DOMAIN` côté serveur ne rétroagit pas sur les sessions en cours. Il faut logout + nouveau magic-link pour que le browser stocke un cookie avec le bon Domain parent.
Verif côté browser : DevTools → Application → Cookies → colonne `Domain` doit être `.romain-ecarnot.com` (pas `buck.romain-ecarnot.com`).

## SSO : `verify-session` DOIT être monté avant le rate-limiter (2026-04-19)

Bible UI fire 1 req HTTP par asset (HTML + JS + CSS + fonts + API), chacune déclenche un `forward_auth` Caddy → `/api/auth/verify-session`. Si l'endpoint est sous le rate-limiter `/api/auth/*` (5 req/min), la page crash après 5 assets. Le monter explicitement avant `app.use('/api/auth/*', rateLimiter(...))` dans `app.ts`, comme `/api/auth/me` et `/api/auth/webdav-token`.



## Bug critique : migrate.ts CLI block re-fired in bundled dist/index.js (2026-04-19)

`tsup` bundle `src/db/migrate.ts` INTO `dist/index.js`. Le legacy CLI guard
`if (import.meta.url === \`file://\${process.argv[1]}\`)` matchait dans LES DEUX cas :
- direct invocation : argv[1]=/app/dist/db/migrate.js, meta=...db/migrate.js ✓
- bundled boot : argv[1]=/app/dist/index.js, meta=/app/dist/index.js ✓ (faux positif)
Au boot de l'app le bloc bundlé re-lance `runMigrations({databaseUrl:...})` SANS `migrationsFolder`
→ drizzle defaulte à cwd-relative `/migrations` → ENOENT → crashloop sur le VPS.
**Fix** : ajouter `&& import.meta.url.endsWith('/migrate.js')` à la guard.
Pattern à appliquer à tout fichier qui contient un bloc CLI-only ET est importé par un autre entry.

## Bug critique : TanStack flat-routing nesting silencieux (bible-ui, 2026-04-19)

Avec TanStack Router file-based + flat dot-notation, `events.tsx` devient automatiquement
le **layout parent** de `events.$id.tsx`. Si `events.tsx` n'a pas `<Outlet/>`, naviguer
vers `/events/<uuid>` change l'URL mais affiche toujours le grid de events (le child detail
ne monte jamais). Symptome : "le click sur Card ne fait rien".
**Fix** : renommer `events.$id.tsx` → `events_.$id.tsx` (underscore = non-nested route).
URL inchangée, parent-child link rompu. Appliqué à characters, events, locations, interactions, notes, research, world-rules.

## bible-mcp Docker : ERR_MODULE_NOT_FOUND express RÉSOLU (2026-04-19)

Le Dockerfile.bible-mcp copiait `packages/bible-mcp/node_modules` au runtime stage,
mais pnpm workspace hoiste vers `/app/node_modules`. Crash `Cannot find package 'express'`.
**Fix** : utiliser `pnpm deploy --filter @buck/bible-mcp --prod /deploy` au build stage,
puis COPY /deploy → /app au runtime. Crée un dir flat self-contained avec toutes les deps.
Pattern à reproduire pour tout package pnpm workspace dockerisé.

## Sécurité : 5 vulns patchées par audit Gemini (2026-04-19)

Toutes mergées commit `49ee6e6` :
- **VULN-001 P0** : `shell_execute` blacklist contournable (r\\m, base64|sh, $(...)).
  Replaced by strict whitelist (35 binaires) + tokenizer rejetant tous métacaractères shell + `execFile` direct (plus de `/bin/sh -c`). Voir `lib/kill-switch.ts`.
- **VULN-002 P1** : `DELETE /file?path=prompts/SYSTEM.md` n'était pas bloqué (set check
  exact match). Fix : `isProtectedPath()` check `===` ET `startsWith(dir + '/')`.
- **VULN-003 P1** : `X-Forwarded-For` spoofing du rate-limiter. Fix : env `TRUST_PROXY=true`
  uniquement si derrière reverse-proxy de confiance, sinon socket peer address via `getConnInfo`.
- **VULN-004 P2** : E2E backdoor. Fail-fast au boot si `E2E=1 && NODE_ENV=production`.
  ⚠️ piège trouvé en prod : le `.env` Romain avait `E2E=1` → boot a planté → fix `.env.production` séparé.
- **VULN-005 P2** : WebDAV CSRF (déjà OK, juste tests de régression cookie-auth rejected).

## RightPanel mort dans bible-ui (2026-04-19)

`AppShell` rendait inconditionnellement un `<RightPanel>` que **aucune route ne peuplait**,
résultant en colonne permanente "Sélectionner une entité…" (et double-sidebar avec NodeDetail
sur /graph). Fichier supprimé, prop retirée. Si besoin futur d'un panneau droit contextuel,
le poser au niveau de la route, pas du shell.

## use-graph : extractArray() défensive pour shape MCP inconsistante (2026-04-19)

Les `list_*` MCP retournent `.results` (locations, interactions) ou `.<typeName>`
(characters, events). Pour `useGraph()` qui consomme les 4, helper `extractArray<T>()`
qui prend la première valeur Array de l'objet. Plus robuste qu'un dispatch par tool name.
Source : pattern emprunté à `barda-mcp-ecrivain-bible/packages/ui/src/hooks/useGraph.ts`.

## Resend : domaine d'envoi doit être vérifié (2026-04-19)

`RESEND_FROM=romain.ecarnot@gmail.com` → 422 `gmail.com domain is not verified`.
Resend exige un domaine custom vérifié (SPF + DKIM via Cloudflare). Romain a déjà
`romain-ecarnot.com` vérifié → utiliser `dev@romain-ecarnot.com` (ou `noreply@`, `buck@`).
Workaround quick : `onboarding@resend.dev` (pas joli mais marche).

## Deploy VPS : pattern git-on-vps + deploy key (2026-04-19)

Pas de CI/CD. Pattern adopté :
1. Repo cloné sur VPS dans `/opt/buck-writer-app` via deploy key SSH github (read-only).
   Config SSH : `Host github-buck` dans `~/.ssh/config` qui pointe vers `~/.ssh/id_ed25519_buck`.
2. `.env.production` (gitignored) scp depuis local → VPS comme `.env`.
3. `git pull && docker compose build && docker compose up -d`.
4. Script `scripts/deploy-vps.sh` automatise tout (idempotent, sanity HTTPS curls finaux).

Réseau Docker : `caddy-public` (external) partagé entre la stack Buck et le Caddy
de Trinity (qui sert aussi n8n + voice-agent sur le même VPS). Caddy attaché aux 2 réseaux
(`trinity-network` + `caddy-public`).

## .env.production séparé du .env dev (2026-04-19)

Ne pas réutiliser le `.env` local pour la prod. Pièges trouvés en prod sur le `.env` perso :
- `E2E=1` (dev local) → fail-fast en prod ✓ (sécurité)
- `MEMORY_ENABLED` listé 2× (true puis false → la dernière gagne)
- `BIBLE_PASSWORD_HASH=None` (placeholder oublié)
- `TRUST_PROXY` absent
- `RESEND_FROM` = email gmail non vérifié dans Resend
**Pattern** : maintenir `.env.production` dédié + `.gitignore` (déjà fait).



## Bible-mcp Docker runtime cassé : ERR_MODULE_NOT_FOUND express (M7, 2026-04-18)

`Dockerfile.bible-mcp` (pré-existant sur main, pas introduit par M7) crash au runtime avec `Cannot find package 'express'`. Cause probable : le stage runtime copie `packages/bible-mcp/node_modules` mais en pnpm workspace les deps sont symlinkées via `/app/node_modules` (hoisting). Fix probable : copier aussi `/app/node_modules` ou utiliser `pnpm install --shamefully-hoist`. **Bloquera la mise en prod (Phase 9 deferred).** Issue à ouvrir.

## MCP tools snake_case sans namespace (M7, 2026-04-18)

Le serveur `bible-mcp` expose 51 tools en **snake_case sans namespace** (`list_characters`, `get_event`, `update_world_rule`, etc.). Le brainstorming initial assumait des noms dotted (`bible.characters.list`) — faux. Toujours vérifier l'inventaire réel via `tools/list` avant d'écrire des routes consommatrices. Inventaire complet capturé dans `packages/bible-ui/README.md`.

## MCP list_* response shapes inconsistantes (M7, 2026-04-18)

Les `list_*` tools de bible-mcp retournent des wrappers **inconsistants** :
- `list_characters` → `{total, characters: [...]}`
- `list_events` → `{total, events: [...]}`
- `list_notes` → `{total, notes: [...]}`
- `list_research` → `{total, research: [...]}`
- `list_world_rules` → `{total, worldRules: [...]}` (camelCase, pas snake !)
- `list_locations` → `{total, limit, offset, results: [...]}`
- `list_interactions` → `{total, limit, offset, results: [...]}`

Au lieu d'un array brut. Cause : différents auteurs des tools côté bible-mcp. Workaround côté bible-ui : chaque route déballe explicitement (`raw?.<key>`). Idéalement à harmoniser côté bible-mcp un jour.

## get_bible_stats shape avec worldRules camelCase (M7, 2026-04-18)

`get_bible_stats` retourne `{entities: {characters, locations, events, interactions, worldRules, research, notes}, totalEntities, totalEmbeddings, database}`. Note `worldRules` (camelCase) parmi des autres clés snake-friendly. Pas un wrapper avec total au top level — total est en sortie sœur de entities.

## export_bible retourne du Markdown, pas du JSON (M7, 2026-04-18)

`export_bible` retourne du **texte Markdown**, pas du JSON. Le `mcp-client.ts` faisait `JSON.parse(text)` unconditionnellement → throw sur le markdown. Fix : try/catch JSON.parse avec fallback `return first.text`. Le bouton "Exporter" affiche le résultat dans une `<Textarea readOnly>`.

## restore_bible parameter = backup_name (M7, 2026-04-18)

`list_backups` retourne des backups avec `name` (string) comme identifiant, pas `id`. Le tool `restore_bible` prend `backup_name` en paramètre, pas `id`. À ne pas confondre.

## EADDRINUSE quand on lance pnpm dev + pnpm dev:bible (M7, 2026-04-18)

`pnpm dev` racine lance TOUS les packages en parallèle (api+web+shared+bible-mcp+bible-ui). Lancer `pnpm dev:bible` en plus tente de redémarrer bible-mcp sur 7801 → EADDRINUSE. Solution : un seul terminal, soit `pnpm dev` soit `pnpm dev:bible`. Possible amélioration future : exclure bible-* de `pnpm dev` racine et faire 3 scripts distincts (`dev`, `dev:bible`, `dev:all`).

## TanStackRouterVite plugin crash sans __root.tsx (M7, 2026-04-18)

Si on ajoute le plugin `TanStackRouterVite()` à `vite.config.ts` AVANT que `src/routes/__root.tsx` n'existe, Vite crash au boot avec `rootRouteNode must not be undefined`. Workaround pendant le setup initial : retirer temporairement le plugin, créer `__root.tsx`, puis re-ajouter le plugin.

## envDir Vite et .env racine unique (M7, 2026-04-18)

Romain n'a qu'un `.env` racine. Vite par défaut cherche dans le cwd du package. Solution : `envDir: path.resolve(__dirname, '../..')` dans tous les `vite.config.ts` (web + bible-ui). Vite n'expose au browser QUE les vars préfixées `VITE_*` (sécurité par défaut), donc le `.env` racine peut continuer à contenir des secrets serveur.

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
