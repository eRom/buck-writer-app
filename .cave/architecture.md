# Architecture — Buck Writer

> Derniere mise a jour : 2026-04-17 (M3 complete)

## Vue d'ensemble

Buck Writer est un assistant d'ecriture web connecte a OpenAI. L'utilisateur s'authentifie via magic link, discute en streaming avec un LLM, gere ses sessions de chat, et dispose d'un workspace de fichiers (attachments, WebDAV, file browser, skills). L'app sera enrichie de referentiels RAG (M4) et d'une bible MCP.

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
    web/          — React SPA, TanStack Router, composants chat + workspace
  prompts/        — SYSTEM.md, USER.md, RULES.md (injectes par l'API)
  data/workspace/ — workspace utilisateur (fichiers, skills/, .attachments/)
  docs/superpowers/
    specs/        — specs de design par milestone
    plans/        — plans d'implementation
  docker-compose.yml, Dockerfile.app
```

## Flux de donnees

### Chat streaming
1. Client → POST /api/chat (messages JSON + sessionId + model + attachmentIds? + references?)
2. API injecte prompts SYSTEM/RULES + skills summary, charge attachments/references dans le contexte
3. Appelle OpenAI via `streamText()` avec file tools (read_file, list_directory, create_file, delete_file, activate_skill)
4. Reponse streamee en texte brut via `toTextStreamResponse()`, maxSteps: 5 pour multi-tool
5. Client lit le ReadableStream, accumule les chunks, met a jour le state React
6. `onFinish` cote API : persiste messages user+assistant, insere usageEvent, met a jour session

### Workspace
- REST API `/api/workspace/*` (tree, file CRUD) pour file browser + @reference
- WebDAV `/webdav/*` (Hono-native, RFC 4918) pour acces Finder/Explorer, auth JWT scope webdav
- Attachments `/api/attachments` (upload multipart, serve par ID) stockes dans WORKSPACE_DIR/.attachments/
- Skills `WORKSPACE_DIR/skills/*/SKILL.md` charges au demarrage, hot-reload via chokidar

## Modules

- **Auth** : magic link (Resend), JWT, session cookie, authGuard middleware, dev-login bypass (E2E)
- **Sessions** : CRUD complet, soft delete, recherche titre, pagination cursor
- **Chat** : streaming OpenAI, persistence messages, usage tracking, titre auto-genere, budget-guard middleware (429 si budget depasse)
- **Settings** : GET/PATCH /api/settings (modele, effort, budget, reset day, hard stop)
- **Usage** : GET /api/usage/current (total cout, % budget, alertes 80%/100%)
- **Budget** : middleware budget-guard, alert triggers dans onFinish, provider limit catch (429 OpenAI → 502)
- **Workspace** : REST routes filesystem, WebDAV server Hono-native, attachments upload/serve, skills loader (SKILL.md + chokidar watcher), file tools OpenAI (read/list/create/delete + activate_skill), text extraction (PDF/DOCX/TXT/MD)
- **UI** : ChatLayout (sidebar collapsible + right panel collapsible), SessionList (groupee par date), ChatArea (attachments, @reference, tool calls), WorkspacePanel + FileTree, workspace page /workspace, MarkdownRenderer, AttachmentPreview/Display, ApprovalBlock, ToolCallDisplay, AtReference autocomplete, UserMenu, Settings page (/settings avec 3 sections + WebDAV wizard), BudgetBanner

## DX

- `.env.development` (versionne) override les chemins Docker pour le dev local
- `loadDotenv()` custom dans `utils/find-up.ts` — remonte les dossiers parents, charge `.env.development` > `.env`
- Auto-migrate + auto-seed au demarrage serveur (index.ts)
- `GET /api/__e2e__/dev-login?email=...` — connexion instantanee sans magic link (E2E=1)
