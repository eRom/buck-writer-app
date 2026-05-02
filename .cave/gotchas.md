# Gotchas — Buck Writer

> MAJ 2026-04-24 (M8B image_generation + drizzle migration skippée)

## M8B — Migration drizzle skippée silencieusement si `when` plus petit (session 2026-04-24)

**Symptôme** : Migration 0014_image_gen générée via `drizzle-kit generate --name image_gen` ajoutée proprement à `_journal.json`, tests unitaires verts, MAIS au boot de l'api en dev (`pnpm dev`) les logs disent `[api] migrations applied` puis chaque call API explose avec `SqliteError: no such column: "image_quality"`. La colonne n'existe physiquement pas dans `data/buck.db`, alors que la DB se dit à jour.

**Cause** : drizzle-kit pose un `when` timestamp basé sur `Date.now()` au moment du `generate`. Les migrations précédentes du repo avaient été **manuellement ré-écrites** avec des `when` futurs ordonnés artificiellement (0009 → 0013 entre `1777680000000` et `1777680240000`, soit ~mai 2026). Ma 0014 a pris le timestamp réel au moment du generate = `1777046580111` (2026-04-24). Drizzle migrate compare **par timestamp** : il voit que les timestamps "plus récents" sont déjà dans `__drizzle_migrations`, donc la 0014 est considérée comme "passée dans le passé" et SKIP. Aucune erreur, aucun warning.

**Fix ponctuel** (DB dev déjà polluée) :
```bash
sqlite3 data/buck.db "
  ALTER TABLE messages ADD images_json text;
  ALTER TABLE user_settings ADD image_quality text DEFAULT 'medium' NOT NULL;
  ALTER TABLE user_settings ADD image_size text DEFAULT '1024x1024' NOT NULL;
  INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('m8b_0014_image_gen', 1777680300000);
"
```

**Fix durable** : éditer `packages/api/migrations/meta/_journal.json` pour mettre la nouvelle migration avec un `when` **strictement supérieur** au max des précédentes. Pour M8B : `1777680300000` (juste après 0013).

**Règle** : à chaque nouvelle migration, vérifier `jq '[.entries[].when] | max' packages/api/migrations/meta/_journal.json` ≤ `when` de la nouvelle. Si non, éditer manuellement le journal. Les tests `pnpm test` passent quand même car ils tournent sur DB fresh — le bug ne se révèle qu'en DB existante.

---

## M6 — MarkItDown sidecar (session 2026-04-22)

### `${VAR}` interpolation vide dans compose.yml + env_file override → crash Zod au boot
Symptôme : `buck-app` boucle en `Restarting (1)` post-deploy, logs montrent `ZodError: String must contain at least 16 character(s) at path MARKITDOWN_INTERNAL_TOKEN`. Warning compose `"MARKITDOWN_INTERNAL_TOKEN" variable is not set. Defaulting to a blank string`.
Cause : compose.yml avait `- MARKITDOWN_INTERNAL_TOKEN=${MARKITDOWN_INTERNAL_TOKEN}` dans `environment:` de buck-app. Sur le VPS, compose tourne depuis `/opt/buck-writer-app/vps/` et il n'y a pas de `vps/.env` adjacent → `${...}` résout à `""` → écrase la valeur chargée par `env_file: ../.env`. Zod `min(16)` fail.
Pourquoi `MCP_SHARED_SECRET=${MCP_SHARED_SECRET}` ne crashait pas : pas dans le zod schema, donc pas validé, l'app démarre sans (fonctionnalité MCP remote peut-être dégradée silencieusement en prod — à auditer).
**Fix** : retirer toutes les lignes `${}` pour M6 d'environment: buck-app + worker, laisser `env_file: ../.env` fournir. Pattern à appliquer pour tout secret validé par Zod. Cf `patterns.md#env_file > ${...} interpolation`.

### Drizzle-kit ignore les nouvelles migrations si leur `when` est dans le passé
Symptôme : `pnpm db:generate` produit `0013_xxx.sql`, `db:migrate` dit `[migrate] done` sans erreur, mais `PRAGMA table_info(attachments)` ne montre aucune nouvelle colonne. `__drizzle_migrations` ne contient pas la nouvelle row.
Cause : le `_journal.json` généré mettait `when: 1776839941386` (~2026-03-19) alors que l'horloge système Mac était bloquée à cette date — or la migration précédente 0012 avait `when: 1777680180000`. Drizzle compare sur `when` monotone, donc 0013 est considérée comme "déjà vue" ou hors ordre et skippée.
**Fix** : éditer `packages/api/migrations/meta/_journal.json` pour mettre un `when` supérieur à la dernière appliquée (`Date.now()` en ms ou +60000 après la précédente). Pattern : après chaque `db:generate`, vérifier que `when` de la nouvelle entrée > précédente, sinon corriger avant `db:migrate`.

### markitdown 0.1.x ne fait plus d'OCR automatique sur images
Symptôme : `MarkItDown(enable_plugins=False).convert('foo.jpg').text_content` → chaîne vide alors que l'image contient du texte. Idem pour `foo.pdf` si PDF scanné (pdfminer voit 0 char texte).
Cause : depuis markitdown 0.1.x, les images passent par un modèle LLM (si `llm_client` fourni) ou ne sont pas OCRisées du tout. Tesseract n'est plus appelé nativement. PDF : pdfminer extrait uniquement le texte natif, pas d'OCR sur pages image.
**Fix** (appliqué dans `services/markitdown-worker/main.py`) :
- Images → `pytesseract.image_to_string(Image.open(path), lang='fra+eng')` direct, pas via markitdown.
- PDF : tenter markitdown d'abord ; si `len(text.strip()) < PDF_OCR_MIN_CHARS` (20) → `pdf2image.convert_from_path(path, dpi=200)` + Tesseract page par page, markdown avec marker `<!-- page N -->`.
- Office (DOCX/PPTX/XLSX) : markitdown natif OK.

Retour `source` dans la réponse ∈ {`text`, `ocr`, `native`} — utile côté API Buck pour savoir si fallback Vision pertinent.

## M9 — TTS Gemini (session 2026-04-21)

## M9 — TTS Gemini (session 2026-04-21)

### gemini-3.1-flash-tts-preview rejette `systemInstruction`
Le client Gemini injectait conditionnellement `config.systemInstruction = prompts.current.tts` pour piloter le style de lecture. Première synthèse réelle → `400 INVALID_ARGUMENT: Developer instruction is not enabled for this model`. Les modèles `-tts` ne supportent pas developer instructions en GA (contrairement à `gemini-3.1-pro` / `flash`).
**Fix** (commit `17b5e1a`) : retirer `systemPrompt` de `SynthesizeParams` + le wiring `prompts` dans `TtsRoutesDeps`. `workspace/systems/TTS.md` reste live-editable et bootstrappé — juste plus injecté. À ré-activer si Google ouvre le champ.

### Messages chat : `localId` front jamais réconcilié avec ID DB → TTS 404
Le front `ChatStream` utilisait `localId()` (format `local-N-timestamp`) pour afficher les messages user en optimiste et streamer l'assistant. Le back `routes/chat.ts:finally` insérait avec un `newId()` indépendant sans jamais le renvoyer. Le bouton Play TTS tapait `/api/tts/local-1-...` → `resolveOwnedMessage` SELECT rien → `404 message not found`. Le TTS ne marchait que sur les messages rechargés (switch session ou refresh forçait `fetchMessages` → vrais IDs DB).
**Fix** (commit `a408892`) : émettre SSE `user_saved { id }` et `assistant_saved { id }` depuis le `finally` après INSERTs. Le front remplace l'ID local via `setMessages(prev => prev.map(m => m.id === localId ? {...m, id: realId} : m))`. Gérer aussi dans `handleApproval` (follow-up turns insèrent un assistant message aussi).

### `.tts_audio` polluait la vue Dossier de travail
`buildTree` de `routes/workspace.ts` filtrait `.attachments` mais pas `.tts_audio`. Après quelques lectures, la sidebar Workspace affichait un dir `.tts_audio/{userId}/{messageId}_{voice}.wav` avec des dizaines de fichiers incompréhensibles pour l'utilisateur.
**Fix** (commit `5d9e...`) : ajouter `entry.name === '.tts_audio'` au filtre. Pattern : ajouter tout nouveau cache disk serveur à cette liste dès sa création.

### Worktree merge : rebuild `@buck/shared` obligatoire
Après `git merge worktree-feat-tts-gemini`, `pnpm install` puis `pnpm typecheck` sur main crashe avec `Module '"@buck/shared"' has no exported member 'isTtsVoice'` / `TTS_MODEL` / `costOfTts` / `AUDIO_TOKENS_PER_SECOND` / `TtsPostResponse`. Le bundle `packages/shared/dist/` est stale — les nouveaux exports existent dans `src/` mais pas dans `dist/`.
**Fix** : `pnpm --filter @buck/shared build` (tsup rebuild). En dev `pnpm dev` relance le watch tsup qui rebuild auto, mais un typecheck/test run hors `pnpm dev` échoue tant que le dist est pas refait. À documenter dans le README merge-post-worktree.

## M5 — Memory Supabase (session 2026-04-21)

### Auth silent-drop quand whitelisted email absent de la DB
`routes/auth.ts:62-68` retournait un `{sent:true}` factice si l'email était dans `AUTH_ALLOWED_EMAILS` mais pas dans la table `users` (cas "seed missed?"). Le seed auto ne re-tourne qu'au premier boot (`userCount === 0`), donc ajouter un email à l'env après coup ne débloquait rien : magic-link jamais envoyé, zéro log d'erreur, 30 min de debug gaspillées.
**Fix** (commit `5a48176`) : auto-provision — INSERT la row `users` à la volée si whitelist hit + DB miss, log audit (UUID only, jamais l'email pour ne pas leaker la whitelist). La sécurité reste identique : le whitelist check est avant, un email inconnu sort toujours en 200 factice.

### PUBLIC_BASE_URL dev désaligné avec port Vite → CSRF 403 muet
`csrfMiddleware` compare `Origin` request vs `PUBLIC_BASE_URL`. En dev avec Vite :5173 proxy → API :3000, le browser envoie `Origin: http://localhost:5173` mais `.env.development` avait `PUBLIC_BASE_URL=http://localhost:3000`. Toutes les mutations POST partaient en 403 silencieux, l'UI rendait les prompts user optimistiquement → `getByText(X)` dans un test E2E matchait la prompt elle-même → **faux-vert total**, remember/recall jamais exercés.
**Fix** (commit `cac5920`) : `PUBLIC_BASE_URL=http://localhost:5173` dans `.env.development`. Vite prend :5173 en premier choix, mais si un zombie occupe le port, Vite fallback :5174/5175 et le matching casse. Si l'E2E reprend à planter, `lsof -nP -i TCP:5173 -sTCP:LISTEN` pour repérer le zombie.

### Recall threshold 0.7 trop strict pour text-embedding-3-large FR
Mesure empirique : cosine similarity entre `"Quel est mon langage préféré ?"` et `"Le langage préféré de Philippe est X"` atteint ~0.65 (sous le 0.7 hardcodé dans `match_memories`). Recall retournait [] malgré rows en DB. Plafond observé entre 2 memories très proches : 0.73.
**Fix** (commit `cac5920`) : `MEMORY_RECALL_THRESHOLD` env var (0..1, default 0.5). Raise en prod si Buck surface des memories off-topic, baisser à 0.3 si legitimate recalls miss.

### `insertUsageEvent` oubliait `kind` → memory events tagués `chat`
`packages/api/src/index.ts#insertUsageEvent` construisait l'INSERT sans copier `r.kind`. Tous les embedding calls (remember/recall + Edge usageSync) landaient en `usage_events` avec default `kind='chat'`. `/api/usage/current` retournait `byKind: { chat: X + MEMORY, realtime: Y }` — mélange silencieux des coûts mémoire dans le budget chat.
**Fix** (commit `01cfcfd`) : ajouter `kind: r.kind`. Query pour vérifier : `SELECT DISTINCT kind FROM usage_events;` doit inclure `memory_embedding`.

### `byKind.memory` absent de `UsageResponse` + UI
Le endpoint retournait `byKind: { chat, realtime }` seulement. Le shared schema `UsageResponse` n'avait pas `byKind` du tout (strip côté frontend). UI Settings ne montrait que le total.
**Fix** (commit `01cfcfd`) : extend `UsageResponse` avec `byKind: { chat, realtime, memory }`, summing des 4 memory kinds côté backend, 3 petites lignes sous la barre budget dans `budget-section.tsx`. Memory près de $0.00 sur les 1-2 premiers remember (~2e-6 USD chacun), mais la ligne doit exister.

### `env_file` manquant sur bible-mcp (deploy prod)
`vps/compose.yml` déclarait `OPENAI_API_KEY: ${OPENAI_API_KEY}` et `MCP_SHARED_SECRET: ${MCP_SHARED_SECRET:-}` via `environment:`. Docker Compose ne substitue `${VAR}` que depuis son propre shell (pas depuis un env_file d'un autre service). `deploy.sh` fait `docker compose up -d` sans sourcer `.env.production` → warning visible `"OPENAI_API_KEY variable is not set. Defaulting to a blank string"`. Résultat : bible-mcp boot **sans clé OpenAI** → embeddings bible cassées en prod. Silencieux jusqu'au 1er appel MCP.
**Fix** (commit `77f747a`) : `env_file: ../.env` sur bible-mcp (même path que buck-app). Path relatif au compose.yml (dans `vps/`) → remonte à `/opt/buck-writer-app/.env` côté VPS.

### Conflit container_name au re-deploy
Après un rename/move du project compose (`/opt/buck-writer-app/` → `/opt/buck-writer-app/vps/`), les anciens containers nommés `buck-*` survivent au nouveau projet. `docker compose up -d` tape un `Conflict. The container name is already in use`.
**Remède** : `docker rm -f buck-bible-mcp buck-bible-ui buck-app` sur le VPS, puis re-run deploy.

### Edge Functions 500 sur path complet
`consolidate-memory` retourne 200 "skipped: only N episodes" tant que <3 episodes (OK). Avec ≥3 episodes injectés, 500 → path LLM ou upsert. `compact-state` retourne 500 sur payload bien formé. Pas tracé (pas de try/catch + console.error dans le code Deno). Non-bloquant (pg_cron retry nightly et fail-soft sur crash), mais à fixer pour débloquer la consolidation réelle.

### MCP remote désactivés en DB dev locale (workaround dev)
`bible` dans `mcp_servers` a `url: http://bible-mcp:7801/mcp` — resolvable dans le Docker compose prod mais pas depuis OpenAI en dev. Quand OpenAI fait tools/list → 400 Bad Request → Buck stream plante avec `Responses API error`. En dev local, set `enabled=0` en DB :
```sql
UPDATE mcp_servers SET enabled=0 WHERE name = 'bible';
```
Le seed ne re-force pas `enabled` (ON CONFLICT DO UPDATE SET config_json, core — pas enabled). Pour retester bible en local : ngrok tunnel + override `MCP_BIBLE_URL` vers l'URL ngrok, ou pointer vers la prod publique.

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
