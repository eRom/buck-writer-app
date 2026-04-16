# M1 — Chat OpenAI Streaming + Sessions CRUD

**Date** : 2026-04-17
**Scope** : Chat conversationnel streaming avec gestion de sessions, sans RAG (M4)

## Contexte

Buck Writer M0 fournit l'authentification magic-link, le shell SPA (TanStack Router), l'API Hono + SQLite/Drizzle, et le Docker build. M1 ajoute le coeur applicatif : un chat streaming connecte a l'API OpenAI avec persistance des sessions et messages.

## Decisions cles

- **Vercel AI SDK** (`ai` + `@ai-sdk/openai` + `@ai-sdk/react`) pour le streaming — provider-agnostic, hook `useChat` cote client, `streamText` cote API
- **Pas de ChatKit OpenAI** — Web Component Shadow DOM, lock-in, zero controle design
- **Composants React custom** avec le design system erom (preset shadcn `b1Gdz9c4A`)
- **Selecteur de modele par message** — l'utilisateur peut changer de modele entre chaque message
- **Creation de session implicite + explicite** — bouton "Nouveau chat" ou auto-creation au premier message
- **Prompts montes en dur** — 3 fichiers dans `prompts/` (SYSTEM.md, USER.md, RULES.md) lus au demarrage
- **RAG/Referentiels reportes a M4** — M1 = chat pur

## Architecture

```
Web (TanStack Router + @ai-sdk/react)
  |
  | useChat() — AI SDK protocol (SSE)
  |
API (Hono)
  |
  | POST /api/chat → streamText() via @ai-sdk/openai
  | + persistence messages/sessions en onFinish
  | + injection prompts SYSTEM/USER/RULES
  |
OpenAI API (streaming)
```

### Flux d'un message

1. L'utilisateur tape un message, `useChat.append()` envoie POST `/api/chat` avec `sessionId` + messages
2. L'API lit les prompts (caches en memoire), injecte le contexte, appelle OpenAI via `streamText()`
3. Le stream SSE revient au client, `useChat` met a jour les messages en temps reel
4. `onFinish` cote API : persiste messages user + assistant en DB, insere `usageEvent` avec tokens/cost, met a jour `lastMessageAt`
5. Si c'est le premier echange, un appel fire-and-forget a `gpt-5.4-nano` genere un titre de ~5 mots

## Schema DB

### Tables existantes (pas de changement)

- `chatSessions` — `id`, `userId`, `title`, `model`, `reasoningEffort`, `archived`, `deletedAt`, `createdAt`, `updatedAt`, `lastMessageAt`
- `usageEvents` — `id`, `userId`, `sessionId`, `model`, `inputTokens`, `outputTokens`, `reasoningTokens`, `costUsd`, etc.
- `userSettings` — `defaultModel`, `defaultReasoningEffort`, `monthlyCostLimitUsd`

### Migration M1

Ajout colonne `model` (text, nullable) sur la table `messages` pour stocker le modele utilise par message.

### Format contentJson

- `user` : `{ "text": "..." }`
- `assistant` : `{ "text": "..." }`
- `system` : pas stocke en DB (injecte a la volee depuis les fichiers prompts)

## Routes API

Toutes protegees par `authGuard`, sauf indication contraire.

### POST /api/chat (streaming)

- Body : `{ sessionId?: string, messages: Message[], model?: string }`
- Si pas de `sessionId` : creation implicite, retourne `x-session-id` dans les headers
- Lit `prompts/SYSTEM.md`, `prompts/RULES.md`, `prompts/USER.md` (caches en memoire, recharges au redemarrage)
- Appelle `streamText()` avec `@ai-sdk/openai` provider
- Modele : body.model > session.model > userSettings.defaultModel
- `onFinish` : persiste messages, insere usageEvent, met a jour session.lastMessageAt
- Rate limit : 30 req/min par user

### GET /api/sessions

- Query : `?q=<search>&archived=0&limit=50&cursor=<lastMessageAt>`
- Tri par `lastMessageAt DESC`
- Recherche fulltext sur `title` avec `LIKE %q%`
- Retourne : `{ sessions: [...], nextCursor?: string }`

### POST /api/sessions

- Body : `{ title?: string, model?: string }`
- Creation explicite d'une session (bouton "Nouveau chat")
- Title par defaut : "Nouvelle conversation"

### GET /api/sessions/:id

- Retourne la session avec metadata

### PATCH /api/sessions/:id

- Body : `{ title?: string, archived?: boolean, model?: string }`
- Rename, archive, changement de modele par defaut de la session

### DELETE /api/sessions/:id

- Soft delete : set `deletedAt = now()`
- Les sessions soft-deleted ne remontent plus dans GET /api/sessions

### GET /api/sessions/:id/messages

- Query : `?limit=50&cursor=<createdAt>`
- Cursor-based, tri par `createdAt ASC`
- Retourne : `{ messages: [...], nextCursor?: string }`

## Prompts

Trois fichiers markdown dans `prompts/` a la racine du repo :

- `prompts/SYSTEM.md` — personnalite et role de l'assistant
- `prompts/USER.md` — template de wrapping du message utilisateur (si necessaire)
- `prompts/RULES.md` — regles et contraintes

L'API les lit au demarrage (`fs.readFileSync`) et les cache. Ils sont injectes dans chaque appel a `streamText()` :
- SYSTEM.md → role `system` en premier
- RULES.md → role `system` en second
- USER.md → utilise comme template si non vide, sinon le message user est envoye tel quel

## UI

### Layout

```
+----------------+-------------------------------+
|  Sidebar       |  Chat Area                    |
|  240px         |  flex-1                       |
|  collapsible   |                               |
|                |  Messages scrollable          |
|  [+ Nouveau]   |  (bulles user/assistant)      |
|                |                               |
|  Search...     |  Streaming indicator          |
|                |                               |
|  Aujourd'hui   |                               |
|   > Session1   |                               |
|   > Session2   |                               |
|                |  [Model v] [Input        ] >  |
|  7 derniers    |                               |
|   > Session3   |                               |
+----------------+-------------------------------+
```

### Composants

| Composant | Responsabilite |
|-----------|---------------|
| `ChatLayout` | Shell sidebar + zone principale |
| `Sidebar` | Collapsible, bouton nouveau chat, search, liste groupee |
| `SessionList` | Groupes par date (aujourd'hui / 7j / 30j / plus ancien), item actif, menu contextuel (renommer / archiver / supprimer) |
| `ChatArea` | Messages + input, gere `useChat()` |
| `MessageBubble` | Rendu markdown, alignement user (droite) / assistant (gauche) |
| `MarkdownRenderer` | `react-markdown` + `rehype-highlight` + `remark-gfm` + `rehype-katex` + `remark-math` |
| `ModelSelector` | Dropdown dans la barre d'input, modeles depuis `PRICING` dans shared |
| `ChatInput` | Textarea auto-resize, Enter = submit, Shift+Enter = newline, bouton stop pendant streaming |
| `ToolCallIndicator` | Texte discret "Appel d'outil..." (pas de rendu visuel detaille) |

### Design

Design system erom via preset shadcn `b1Gdz9c4A` — dark-first, gris chauds (hue 90), amber brand, borders > shadows. Les CSS variables du preset sont deja en place.

## Markdown

Rendu complet dans les reponses assistant :
- Gras, italique, listes, liens, code inline
- Blocs de code avec syntax highlighting (rehype-highlight)
- Tableaux (remark-gfm)
- LaTeX (remark-math + rehype-katex)

## Dependencies nouvelles

```
@buck/api:
  ai                   — Vercel AI SDK core
  @ai-sdk/openai       — provider OpenAI

@buck/web:
  @ai-sdk/react        — useChat hook
  react-markdown       — rendu markdown
  rehype-highlight     — syntax highlighting
  remark-gfm           — tables, strikethrough
  rehype-katex         — rendu LaTeX
  remark-math          — parsing LaTeX
```

## Hors scope M1

- RAG / Referentiels (M4)
- Attachments / uploads (M3)
- Metriques / hard-stop budget (M2)
- MCP Bible (M4)
- CI/CD / deploy (M5)
