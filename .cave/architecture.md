# Architecture — Buck Writer

> Derniere mise a jour : 2026-04-17

## Vue d'ensemble

Buck Writer est un assistant d'ecriture web connecte a OpenAI. L'utilisateur s'authentifie via magic link, discute en streaming avec un LLM, et gere ses sessions de chat. L'app sera enrichie de referentiels RAG (M4) et d'une bible MCP.

## Stack

- **Runtime** : Node 20, pnpm workspaces
- **API** : Hono + SQLite (better-sqlite3) + Drizzle ORM
- **Web** : React 19 + TanStack Router + Vite + Tailwind v4 + shadcn (preset b1Gdz9c4A)
- **Streaming** : Vercel AI SDK v6 cote API (`streamText`), fetch + ReadableStream custom cote client
- **Auth** : Magic link via Resend, JWT session cookie, CSRF Double Submit Cookie
- **Docker** : Node 20 Alpine, multi-stage build, pnpm deploy --prod

## Arborescence

```
buck-writer-app/
  packages/
    shared/       — Zod schemas, types, pricing models (tsup build)
    api/          — Hono API, routes, middleware, DB, services
    web/          — React SPA, TanStack Router, composants chat
  prompts/        — SYSTEM.md, USER.md, RULES.md (injectes par l'API)
  docs/superpowers/
    specs/        — specs de design par milestone
    plans/        — plans d'implementation
  docker-compose.yml, Dockerfile.app
```

## Flux de donnees

1. Client → POST /api/chat (messages JSON + sessionId + model)
2. API injecte prompts SYSTEM/RULES, appelle OpenAI via `streamText()`
3. Reponse streamee en texte brut via `toTextStreamResponse()`
4. Client lit le ReadableStream, accumule les chunks, met a jour le state React
5. `onFinish` cote API : persiste messages user+assistant, insere usageEvent, met a jour session

## Modules

- **Auth** : magic link (Resend), JWT, session cookie, authGuard middleware
- **Sessions** : CRUD complet, soft delete, recherche titre, pagination cursor
- **Chat** : streaming OpenAI, persistence messages, usage tracking, titre auto-genere
- **UI** : ChatLayout (sidebar collapsible), SessionList (groupee par date), ChatArea, MarkdownRenderer
