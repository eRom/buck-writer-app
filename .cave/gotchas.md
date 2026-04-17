# Gotchas — Buck Writer

> Derniere mise a jour : 2026-04-17

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
