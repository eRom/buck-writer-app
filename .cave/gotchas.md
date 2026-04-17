# Gotchas — Buck Writer

> Derniere mise a jour : 2026-04-17 (M3 complete)

## AI SDK v6 — API cassantes

- `toDataStreamResponse()` n'existe plus → utiliser `toTextStreamResponse()`
- `DefaultChatTransport` attend le format UIMessageStream, pas du texte brut
- `useChat` avec `TextStreamChatTransport` efface l'historique au 2e echange
- **Solution** : hook custom fetch + ReadableStream (pas de useChat)
- `append()` renomme en `sendMessage({ text })`, `isLoading` remplace par `status` enum
- `message.content` remplace par `message.parts` (array de `{ type: 'text', text }`)
- `usage.promptTokens` → `usage.inputTokens`, `completionTokens` → `outputTokens`

## Docker / Alpine

- Alpine n'a pas `localhost` dans `/etc/hosts` → healthcheck doit utiliser `127.0.0.1`
- Cookie CSRF avec flag `Secure` ne fonctionne pas sur HTTP → conditionnel sur `NODE_ENV === 'production'`

## Env / Zod

- `RESEND_API_KEY`, `OPENAI_API_KEY`, `MCP_BIBLE_URL` sont optionnels (pas utilises avant M1+/M4+)
- Si Resend n'est pas configure, l'API fallback sur le E2E email service (ecrit le token dans un fichier)
- Le schema Zod `ChatRequestInput` est trop strict pour le body envoye par AI SDK v6 (champs extra `id`, `trigger`). Parsing manuel du body a la place.

## Tailwind v4

- Les plugins s'importent avec `@plugin` pas `@import` dans le CSS : `@plugin "@tailwindcss/typography"`
- `@tailwindcss/typography` v0.5.x fonctionne avec Tailwind v4 via `@plugin`

## ESLint

- Les types DOM (`HTMLDivElement`, `HTMLTextAreaElement`) doivent etre declares dans les globals browser du eslint.config.mjs
- Pattern Zod `const Foo = z.object({...}); type Foo = z.infer<typeof Foo>` → `no-redeclare` off

## DB / Drizzle

- Les migrations sont dans `packages/api/migrations/`, le journal est dans `meta/_journal.json`
- Si une migration existe sur disque mais pas dans le journal, Drizzle ne la voit pas → editer `_journal.json`
- `pnpm deploy --filter @buck/api --prod` cree un flat node_modules sans les devDependencies

## E2E / Playwright

- Le mode E2E (`E2E=1`) bypass Resend et ecrit le token magic-link dans `./data/e2e-last-token.json`
- La route `__e2e__/last-token` est gatee par `E2E=1 && NODE_ENV !== 'production'`
- Il faut seeder la DB e2e (sinon le user n'existe pas et `{"sent":true}` est retourne sans generer de token)
- `tsx watch` avec des env inline perd les variables au reload → utiliser `env $(grep ...)` ou `tsx` sans watch

## dotenv / loadDotenv

- `dotenv` (npm) est CJS — tsup le bundle en ESM et crash avec `Dynamic require of "fs" is not supported`
- **Solution** : `loadDotenv()` custom dans `utils/find-up.ts`, zero dep, parse KEY=VALUE, gere les quotes
- Le `.env.development` est charge en premier (priorite), puis `.env` comble les vars manquantes
- `loadDotenv()` ne surcharge PAS les vars deja dans `process.env`
- Ne PAS mettre `loadDotenv()` au top-level de `migrate.ts`/`seed.ts` — ca cree des problemes d'ordre d'import quand importe par `index.ts`. Le mettre uniquement dans le bloc CLI (`if import.meta.url === ...`)

## Budget guard / Usage

- La requete SUM(costUsd) doit filtrer par `periodStart <= createdAt < periodEnd` (pas juste `>= periodStart`)
- `getOrCreateSettings()` doit etre appele dans le budget-guard — sinon un user sans row settings bypass le hard stop
- Les `alertTriggers` sont keys par `yearMonth` derive de `periodStart` (pas du mois courant)

## Session implicite (premier message)

- Quand le premier message cree une session implicite, le `x-session-id` header trigger un `useEffect[sessionId]` qui fetchMessages() → retourne vide (messages pas encore persistes)
- **Fix** : `createdSessionRef` dans ChatArea pour skip le reload quand on vient de creer la session

## Rate limiter auth

- Le rate limiter sur `/api/auth/*` bloquait aussi `/api/auth/me` (appele a chaque navigation)
- **Fix** : monter `/api/auth/me` AVANT le rate limiter dans app.ts

## DATABASE_URL relatif

- `DATABASE_URL=file:./data/buck.db` est relatif au cwd du process
- tsx lance depuis `packages/api/` donc la DB est dans `packages/api/data/buck.db`
- Le `.env.development` doit refléter ce cwd, pas la racine monorepo

## AI SDK v6 — tool() overloads

- `tool()` de AI SDK v6 a des overloads stricts sur les types de retour
- Quand `execute` retourne une union (`{ ok: true } | { error: string }`), le type n'est pas assignable a `undefined` sur certains overloads
- **Workaround** : `tool({ ...config } as any)` sur les tools avec retours conditionnels
- Affecte : `read_file`, `list_directory`, `create_file`, `delete_file`, `activate_skill`

## pdf-parse ESM

- `pdf-parse` v2 a un export ESM mais le `.default` n'existe pas toujours
- **Fix** : `const pdfParse = pdfParseModule.default ?? pdfParseModule` avec cast `as any`

## ES2022 vs ES2023

- `findLastIndex()` n'est pas disponible avec `lib: ES2022` (c'est ES2023)
- **Fix** : utiliser `reduce()` pour simuler `findLastIndex`

## WebDAV CSRF

- Les clients WebDAV (Finder, Explorer) ne peuvent pas envoyer de token CSRF
- Le CSRF middleware doit etre bypass pour les routes `/webdav/*`
- Verifie dans `middleware/csrf.ts` : condition `c.req.path.startsWith('/webdav')` → skip

## Worktree tests

- Apres merge d'un worktree, `pnpm test` peut echouer si les deps ne sont pas installees sur main
- Toujours faire `pnpm install` apres merge dans le repo principal
