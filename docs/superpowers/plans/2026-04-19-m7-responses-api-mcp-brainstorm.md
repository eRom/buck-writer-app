# M7 — Responses API + MCP connectors — Brainstorm

Date : 2026-04-19
Branche : `feat/responses-api-mcp-connectors`

## Contexte

Buck utilise aujourd'hui `/v1/chat/completions` en fetch direct, avec un `McpClient` HTTP mono-serveur (bible-mcp) et un tool loop maison qui préfixe les tools `bible_*`. Plan d'évolution : passer à `/v1/responses` qui supporte nativement :
- MCP remote connectors (multi-serveurs, multiplexés côté OpenAI)
- `previous_response_id` (state conversation serveur-side)
- Built-in tools futurs (code_interpreter, web_search, file_search, image_gen)
- Orchestration multi-outils améliorée

## Objectif

Migrer l'intégralité du streaming chat vers Responses API. Supprimer `McpClient` et son roundtrip local. Exposer bible-mcp + writing-tools-mcp publiquement avec auth Bearer, déclarés via `tools: [{type: "mcp"}]` côté API Responses.

## Scope

**In** :
- Migration `/v1/chat/completions` → `/v1/responses` (streaming)
- MCP connectors remote (bible + writing-tools) avec toggle on/off en DB
- Sidecar `writing-tools-mcp` (Dockerfile + Caddy public)
- Exposition publique `bible-mcp` (Caddy public + Bearer auth)
- UI `card-mcp.tsx` : liste + Switch
- Suppression `McpClient` + tests associés

**Out** :
- `previous_response_id` (on garde l'envoi full messages pour l'instant, migration incrémentale possible en M8)
- Built-in tools OpenAI (code_interpreter, web_search, file_search) — hors scope
- CRUD custom MCP servers (juste defaults hardcodés + toggle pour l'instant)
- Memory layer — inchangé (reste en local tools `recall`/`remember`)
- Workspace tools locaux (read_file, create_file, delete_file, shell_execute) — inchangés, restent function calls classiques

## Décisions

### 1. Tous les tools en Responses API

Responses supporte les deux formats côté `tools` :
```ts
tools: [
  // Local tools (shape légèrement différente de chat.completions — plus de wrapper `function`)
  { type: "function", name: "read_file", description: "...", parameters: {...} },
  // MCP connectors remote
  { type: "mcp", server_label: "bible", server_url: "https://bible-mcp.buck...", headers: { Authorization: "Bearer ..." }, require_approval: {...} },
]
```

Les MCP tools sont appelés par OpenAI directement, on ne les gère plus côté Buck.

### 2. Exposition MCP publique

- `bible-mcp.buck.romain-ecarnot.com` (Caddy → bible-mcp:7801)
- `writing-mcp.buck.romain-ecarnot.com` (Caddy → writing-tools-mcp:7802)
- Auth Bearer via Caddy : matcher `@auth header Authorization "Bearer ${MCP_SHARED_SECRET}"`, 401 sinon
- Secret stocké en `.env` Buck + injecté dans `headers` du tool connector côté Responses API

### 3. Approval MCP

- `bible-mcp` : read tools (search, list) → `require_approval: "never"`, write tools (create_entity, update, delete) → `require_approval: "always"`. Forme object `{ never: { tool_names: [...] }, always: { tool_names: [...] } }`.
- `writing-tools-mcp` : tous read-only → `require_approval: "never"`.
- Approval flow : intercepter `response.mcp_approval_requested` dans le stream, envoyer au client via SSE `mcp_approval`, le user confirm/deny, on renvoie une requête continuation avec `mcp_approval_response`.

### 4. Toggle on/off en DB

Table `mcp_servers` déjà présente :
```
id | name | core | enabled | transport | config_json | created_at
```

Seed insère :
- `bible` (core=1, enabled=1, transport=`http-streamable`, config=`{url, auth_header_env, approval}`)
- `writing-tools` (core=0, enabled=0 par défaut, même shape)

À chaque request chat, on lit les serveurs `enabled=1` et on injecte leurs entrées dans `tools`.

### 5. Sidecar writing-tools

Dockerfile fork upstream minimal :
```Dockerfile
FROM python:3.11-slim
RUN apt-get update && apt-get install -y git build-essential && rm -rf /var/lib/apt/lists/*
RUN pip install uv
RUN git clone https://github.com/wdm0006/writing-tools-mcp /app/src && \
    cd /app/src && uv sync
# Patch transport : on remplace le `mcp.run()` par `mcp.run(transport="streamable-http", host="0.0.0.0", port=7802)`
COPY writing-tools-patch.py /app/src/server_http.py
WORKDIR /app/src
EXPOSE 7802
CMD ["uv", "run", "server_http.py"]
```

Image lourde (torch, transformers) → ~3 GB. Acceptable, on build une fois.

### 6. Streaming events Responses API

Les events SSE sont différents de chat.completions. Mapping vers notre SSE interne :

| Responses event | → Buck SSE event | Payload |
|---|---|---|
| `response.output_text.delta` | `content` | `{ text }` |
| `response.function_call_arguments.delta` | (accumulé) | — |
| `response.output_item.done` (function_call) | (trigger tool handler) | — |
| `response.mcp_call.in_progress` | `mcp_call_started` | `{ server_label, tool_name }` |
| `response.mcp_call.completed` | `mcp_call_done` | `{ server_label, tool_name, output }` |
| `response.mcp_call.failed` | `mcp_call_error` | `{ server_label, tool_name, error }` |
| `response.mcp_approval_requested` | `mcp_approval` | `{ approval_id, server_label, tool_name, arguments }` |
| `response.completed` | `done` | `{ usage }` |
| `response.failed` / `error` | `error` | `{ message }` |

### 7. Usage

`response.completed` payload contient `response.usage` :
```
{ input_tokens, output_tokens, total_tokens, input_tokens_details: { cached_tokens }, output_tokens_details: { reasoning_tokens } }
```

Mapping vers `usage_events` :
- `inputTokens` = `input_tokens`
- `outputTokens` = `output_tokens`
- `reasoningTokens` = `output_tokens_details.reasoning_tokens ?? 0`
- cached_tokens → à stocker (nouvelle colonne `cachedInputTokens` ?)

### 8. previous_response_id — choix

**Pour M7 : non, on continue d'envoyer le full messages array.** Raisons :
- Migration incrémentale, plus safe
- Les mutations tool (approval mid-turn) demandent replay, `previous_response_id` force un flow différent
- Pas de gain UX tangible à ce stade

Migration `previous_response_id` = M8 potentiel, quand on voudra optimiser tokens sur sessions longues.

## Architecture cible

```
Client (web) ←SSE──→ Buck API /api/chat
                        │
                        ├─ Build input (messages + system)
                        ├─ Build tools[] :
                        │    ├─ local function tools (workspace, skills, memory)
                        │    └─ MCP connectors (bible, writing-tools, … depuis DB)
                        ├─ POST /v1/responses {stream:true, tools, input, ...}
                        │
                        └─ Stream loop :
                             ├─ parse SSE events Responses
                             ├─ local tool_call → exec local handler → continuation
                             ├─ MCP call → OpenAI le gère directement (visible mais pas exécuté côté Buck)
                             └─ approval requested → SSE mcp_approval → user response → continuation
```

MCP servers exposés publiquement :
```
                         ┌─ bible-mcp.buck.romain-ecarnot.com ─→ bible-mcp:7801
OpenAI Responses API ────┤
                         └─ writing-mcp.buck.romain-ecarnot.com ─→ writing-tools-mcp:7802
                                │
                                └─ Caddy vérifie Authorization: Bearer ${MCP_SHARED_SECRET}
```

## Risques

1. **Rewrite streaming est touche-à-tout**. Tests `chat.test.ts` à réécrire (mock fetch events différents). Prévoir e2e smoke.
2. **Bible exposée publiquement**. Bearer est faible sans TLS mutual, mais Caddy + secret long + rate-limit = acceptable pour scope perso.
3. **require_approval granulaire** : mapping précis des tools bible read vs write à maintenir quand on ajoute des tools upstream. À factoriser en une source unique (config JSON par server).
4. **Secret rotation** : si on rotate `MCP_SHARED_SECRET`, il faut redéployer Caddy + Buck en sync. OK pour une app solo.
5. **writing-tools build lourd**. 3 GB image. CI doit accepter. Option : pre-build + push sur ghcr.
6. **OpenAI indisponibilité MCP** : si bible-mcp down, le call MCP fail côté OpenAI avec `response.mcp_call.failed`. Le modèle peut retry ou abandonner — on ne contrôle plus le retry. Tradeoff du connector.

## Deliverables

- `docs/superpowers/specs/2026-04-19-m7-responses-api-mcp.md` — spec implémentation détaillée (fichier par fichier)
- Code : API + web + Docker + Caddy
- Tests : unit + e2e + smoke bible/writing-tools via Responses
- Doc deploy : `docs/deploy/mcp-public-caddy.md`
- Migration DB `packages/api/migrations/` pour nouvelles colonnes éventuelles (cachedInputTokens)
