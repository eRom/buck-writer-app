# Patterns et conventions — Buck Writer

> Derniere mise a jour : 2026-04-17

## Architecture

- **Monorepo pnpm** : 3 packages (shared, api, web) + root
- **Dependency injection** : les routes Hono recoivent un objet `deps` (db, email, jwt, etc.)
- **Schema-first** : Zod dans shared, importe par api et web
- **Ownership guard** : toute route `:id` verifie `WHERE userId = currentUser AND deletedAt IS NULL`, retourne 404 (pas 403)

## Nommage

- **Fichiers** : kebab-case (`chat-area.tsx`, `rate-limit.ts`)
- **Routes Hono** : fonction `createXxxRoutes(deps)` retourne un `Hono` sub-app
- **Tests** : colocated (`auth.ts` → `auth.test.ts`)
- **Composants React** : PascalCase export (`ChatArea`), fichier kebab-case
- **DB tables** : camelCase JS (`chatSessions`), snake_case SQL (`chat_sessions`)

## Patterns de code

- **Error handling** : `HttpError` class avec `toJSON()`, format `{ error: { code, message } }`
- **Pagination** : cursor-based, fetch `limit + 1`, pop si overflow, retourne `nextCursor`
- **Auth** : JWT dans cookie `buck_session`, CSRF dans cookie `buck_csrf` + header `x-csrf-token`
- **Streaming** : `streamText()` serveur → `toTextStreamResponse()` → fetch + ReadableStream client
- **Soft delete** : `deletedAt` timestamp nullable, filtre `isNull(deletedAt)` partout

## Tests

- **Framework** : vitest
- **Pattern API** : temp SQLite DB par test, `runMigrations()` + `runSeed()`, JWT session directe
- **Pattern web** : vitest + @testing-library/react (happy-dom)
- **E2E** : Playwright, Chromium, mode E2E=1 pour bypass Resend

## Commits

- Format conventionnel : `feat(scope):`, `fix(scope):`, `chore:`, `docs:`
- Co-authored-by Claude quand genere par l'IA
- Commits atomiques par tache
