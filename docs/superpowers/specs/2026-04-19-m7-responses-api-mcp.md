# M7 — Migration /v1/responses + MCP connectors

Date : 2026-04-19
Branche : `feat/responses-api-mcp-connectors`
Brainstorm : [plans/2026-04-19-m7-responses-api-mcp-brainstorm.md](../plans/2026-04-19-m7-responses-api-mcp-brainstorm.md)

## But

1. Migrer `packages/api/src/lib/openai.ts` + `packages/api/src/routes/chat.ts` de `/v1/chat/completions` vers `/v1/responses` (streaming SSE).
2. Déclarer les serveurs MCP comme **remote connectors** côté API Responses (`tools: [{type: "mcp"}]`) au lieu de les appeler via un `McpClient` local.
3. Exposer `bible-mcp` et un nouveau `writing-tools-mcp` publiquement via Caddy avec auth Bearer partagée.
4. UI toggle on/off par serveur dans `card-mcp.tsx`, persisté en DB.
5. Supprimer `packages/api/src/services/mcp-client.ts` + tests + routes legacy.

## Non-goals M7

- Built-in tools OpenAI (code_interpreter, web_search, file_search, image_gen) — activables trivialement plus tard, architecture prête.
- CRUD UI des serveurs MCP custom (juste defaults hardcodés + toggle).
- Refactor workspace/memory tools (restent en local function calls).
- OpenAI "Skills" hosted framework (orthogonal à nos skills workspace markdown).

## In-scope revisé

**`previous_response_id` + `store: true` REQUIS** pour MCP approval (bible write tools). Docs OpenAI explicites : `mcp_approval_response` doit être chaîné via `previous_response_id`. On persiste le dernier `response_id` dans `chat_sessions.lastResponseId` (nouvelle colonne) pour reprendre proprement après approval.

## Phase 1 — Migration API Responses (iso-feature)

### P1.1 — `packages/api/src/lib/openai.ts`

Réécriture complète. Supprimer : `streamChat`, `chat`, `parseSSEChunks`, `accumulateToolCalls` (chat.completions). Ajouter :

```ts
// Input items pour /v1/responses — peut être :
// - message classique: { role, content }
// - tool result: { type: "function_call_output", call_id, content }
// - MCP approval: { type: "mcp_approval_response", approve, approval_request_id }
export type ResponsesInputItem =
  | { role: 'system' | 'user' | 'assistant' | 'developer'; content: string | Array<{ type: 'input_text' | 'input_image' | 'output_text'; text?: string; image_url?: string }> }
  | { type: 'function_call_output'; call_id: string; output: string }
  | { type: 'mcp_approval_response'; approve: boolean; approval_request_id: string };

// Function tool (local handlers — workspace, skills, memory)
// NB: internally-tagged, strict TRUE par défaut côté Responses API.
// Nos schemas JSON doivent être strict-compliant : tous les champs required,
// additionalProperties: false, pas de oneOf/anyOf/union flottant.
// Cas pénibles (args optionnels) → on passe strict: false.
export interface FunctionToolDef {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
}

// MCP remote connector tool
export interface McpToolDef {
  type: 'mcp';
  server_label: string;
  server_url: string;
  headers?: Record<string, string>;
  require_approval:
    | 'never'
    | 'always'
    | {
        never?: { tool_names: string[] };
        always?: { tool_names: string[] };
      };
  allowed_tools?: string[] | { tool_names: string[] };
}

export type ToolDef = FunctionToolDef | McpToolDef;

export interface ResponsesRequest {
  model: string;
  /** Top-level instructions (alternative au system message dans input). */
  instructions?: string;
  /** Soit une string courte, soit un array d'items (messages + function_call_output + mcp_approval_response). */
  input: string | ResponsesInputItem[];
  tools?: ToolDef[];
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'mcp'; mcp: { server_label: string; name?: string } };
  stream: true;
  /** Nécessaire pour MCP approval + continuation. M7 : on stocke le last response_id en DB. */
  previous_response_id?: string;
  /** Default true. Explicit pour lisibilité. */
  store?: boolean;
  reasoning?: { effort: 'low' | 'medium' | 'high'; summary?: 'auto' | 'concise' | 'detailed' };
  max_output_tokens?: number;
  /** Structured output. */
  text?: { format: { type: 'json_schema'; name: string; schema: Record<string, unknown>; strict?: boolean } };
}

export async function streamResponses(
  opts: { apiKey: string; body: ResponsesRequest; signal?: AbortSignal }
): Promise<Response> {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...opts.body, stream: true }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new OpenAIError(res.status, text);
  }
  return res;
}

// Non-streaming (pour auto-title par ex)
export async function respond(
  opts: { apiKey: string; body: Omit<ResponsesRequest, 'stream'> }
): Promise<{ text: string; usage: ResponsesUsage }> { ... }
```

#### Parser SSE events

```ts
export type ResponsesEvent =
  | { type: 'response.created'; response_id: string }
  | { type: 'response.in_progress' }
  | { type: 'response.output_item.added'; output_index: number; item: OutputItem }
  | { type: 'response.output_item.done'; output_index: number; item: OutputItem }
  | { type: 'response.output_text.delta'; delta: string; output_index: number; item_id: string }
  | { type: 'response.output_text.done'; output_index: number; item_id: string; text: string }
  | { type: 'response.function_call_arguments.delta'; item_id: string; delta: string }
  | { type: 'response.function_call_arguments.done'; item_id: string; arguments: string; call_id: string; name: string }
  | { type: 'response.mcp_call.in_progress'; item_id: string; server_label: string }
  | { type: 'response.mcp_call.completed'; item_id: string; server_label: string }
  | { type: 'response.mcp_call.failed'; item_id: string; server_label: string; error: string }
  | { type: 'response.mcp_list_tools.completed'; server_label: string; tools: unknown[] }
  | { type: 'response.mcp_approval_request'; approval_request_id: string; server_label: string; name: string; arguments: string }
  | { type: 'response.completed'; response: CompletedResponse }
  | { type: 'response.failed'; response: { error: { message: string } } }
  | { type: 'response.incomplete'; response: unknown }
  | { type: 'error'; error: { message: string } }
  | { type: 'unknown'; raw: string };

export interface CompletedResponse {
  id: string;
  status: 'completed' | 'incomplete' | 'failed';
  output: OutputItem[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
  };
}

export interface OutputItem {
  type: 'message' | 'function_call' | 'mcp_call' | 'mcp_list_tools' | 'mcp_approval_request' | 'reasoning';
  id: string;
  // discriminant...
}

export function parseResponsesEventLine(line: string): ResponsesEvent | null {
  // parse "event: xxx\ndata: {...}"
  // retourne null si ligne vide / keepalive
}

// Stream parser utility
export function* parseSSEStream(chunk: string): IterableIterator<ResponsesEvent> {
  // split \n\n, parse each block's "event:" + "data:" lines
}
```

#### Tests `openai.test.ts`

- `streamResponses` POST correct body
- `parseResponsesEventLine` chaque type d'event avec fixtures
- `OpenAIError` sur 4xx/5xx
- `respond` (non-stream) retourne text + usage

### P1.2 — `packages/api/src/routes/chat.ts`

**Changements clefs** :
- On ne construit plus un `llmMessages: ChatMessage[]` à la chat.completions. On construit un `inputItems: ResponsesInputItem[]` (items hétérogènes).
- System prompt → paramètre `instructions` (plus `role:"system"` messages dans input).
- Tool output = item `{type:"function_call_output", call_id, output: JSON.stringify(result)}` ajouté à `inputItems`.
- Chaînage continuation : chaque appel stocke le `response_id` reçu dans `response.created`. Au tour suivant on passe `previous_response_id` + seulement les nouveaux items (function_call_output de l'étape précédente) — pas de replay complet.
- Approval MCP : le SSE `mcp_approval_request` est relayé au client, stream fermé avec `pendingApproval`. Au re-POST /api/chat avec `{mcpApproval: {approvalId, approved}}`, on charge `session.lastResponseId` comme `previous_response_id` et on envoie `input: [{type:"mcp_approval_response", approve, approval_request_id}]`.
- Approval local function : idem mais avec `function_call_output` comme item de continuation.
- Persistance : nouvelle colonne `chat_sessions.lastResponseId` (text, nullable). Mise à jour à chaque `response.completed`.

Rewrite du `runLoop` :

```ts
async function runLoop() {
  let accumulatedText = '';
  const totalUsage = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedInputTokens: 0 };
  const collectedToolMetas: ToolMeta[] = [];
  let step = 0;
  const maxSteps = 8;

  // Local function call accumulators
  const pendingFnCalls = new Map<string, { name: string; args: string }>();

  while (step < maxSteps) {
    step++;
    const body: ResponsesRequest = {
      model: resolvedModel,
      input: buildResponsesInput(llmMessages),
      tools: [...localFunctionTools, ...mcpConnectorTools],
      tool_choice: 'auto',
      stream: true,
      store: false, // on ne persiste pas côté OpenAI pour M7
    };

    const res = await streamResponses({ apiKey: deps.openaiApiKey, body });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let stepFnCalls: Array<{ call_id: string; name: string; arguments: string }> = [];
    let stepDone = false;

    while (!stepDone) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const ev = parseResponsesEventLine(block);
        if (!ev) continue;
        switch (ev.type) {
          case 'response.output_text.delta':
            accumulatedText += ev.delta;
            sendEvent('content', { text: ev.delta });
            break;
          case 'response.function_call_arguments.delta':
            // accumulate per item_id
            break;
          case 'response.function_call_arguments.done':
            stepFnCalls.push({ call_id: ev.call_id, name: ev.name, arguments: ev.arguments });
            break;
          case 'response.mcp_call.in_progress':
            sendEvent('mcp_call_started', { server_label: ev.server_label });
            break;
          case 'response.mcp_call.completed':
            sendEvent('mcp_call_done', { server_label: ev.server_label });
            collectedToolMetas.push({ toolCallId: ev.item_id, toolName: `mcp:${ev.server_label}`, args: {}, status: 'auto', result: {} });
            break;
          case 'response.mcp_call.failed':
            sendEvent('mcp_call_error', { server_label: ev.server_label, error: ev.error });
            break;
          case 'response.mcp_approval_request':
            sendEvent('mcp_approval', {
              approvalId: ev.approval_request_id,
              serverLabel: ev.server_label,
              toolName: ev.name,
              arguments: ev.arguments,
            });
            // Le client doit re-POST /api/chat avec { mcpApproval: { id, approved } }
            // On sort de la loop, l'état est persisté dans llmMessages (+ previous_response_id plus tard)
            pendingApproval = true;
            stepDone = true;
            break;
          case 'response.completed': {
            const u = ev.response.usage;
            totalUsage.inputTokens += u.input_tokens;
            totalUsage.outputTokens += u.output_tokens;
            totalUsage.reasoningTokens += u.output_tokens_details?.reasoning_tokens ?? 0;
            totalUsage.cachedInputTokens += u.input_tokens_details?.cached_tokens ?? 0;
            stepDone = true;
            break;
          }
          case 'response.failed':
          case 'error':
            throw new Error(ev.type === 'error' ? ev.error.message : ev.response.error.message);
        }
      }
    }

    // Traiter function calls locales (workspace/skills/memory)
    if (stepFnCalls.length === 0) break;

    // Push assistant message + function_call_output dans llmMessages
    for (const fc of stepFnCalls) {
      const args = parseJsonSafe(fc.arguments);
      const name = fc.name;

      if (TOOLS_REQUIRING_APPROVAL.includes(name)) {
        sendEvent('tool_approval', { toolCallId: fc.call_id, toolName: name, args });
        collectedToolMetas.push({ ...metaFor(fc, 'requires_approval') });
        pendingApproval = true;
        stepDone = true;
        break;
      }

      const handler = toolHandlers[name];
      const result = handler ? await handler(args) : { error: `unknown tool: ${name}` };
      llmMessages.push({ role: 'tool', tool_call_id: fc.call_id, content: JSON.stringify(result) });
      collectedToolMetas.push({ ...metaFor(fc, 'auto', result) });
      sendEvent('tool_result', { toolCallId: fc.call_id, toolName: name, result });
    }

    if (pendingApproval) break;
  }

  sendEvent('done', { usage: totalUsage, pendingApproval });
}
```

#### Construction de `input` (messages → ResponsesInput)

Shape messages actuelle compatible : on passe directement `[{role, content}]` avec `content: string`. Les images/attachments deviennent `content: [{type: 'input_text', text}, {type: 'input_image', image_url}]` — hors scope M7 texte-only.

#### Construction de `mcpConnectorTools`

```ts
const mcpConnectorTools = loadEnabledMcpServers(db).map((s) => ({
  type: 'mcp' as const,
  server_label: s.name,
  server_url: s.config.url,
  headers: s.config.auth_header_env
    ? { Authorization: `Bearer ${process.env[s.config.auth_header_env] ?? ''}` }
    : undefined,
  require_approval: s.config.require_approval ?? 'never',
  allowed_tools: s.config.allowed_tools,
}));
```

Helper `loadEnabledMcpServers(db)` lit `mcp_servers WHERE enabled = 1`.

### P1.3 — Resume après tool approval

Le body POST /api/chat accepte :
```ts
{
  toolApproval?: { callId, approved, args? },        // local fn approval (function_call_output)
  mcpApproval?: { approvalRequestId, approved },     // MCP (mcp_approval_response)
}
```

**Flow local approval** :
1. Charge `previous_response_id` = `session.lastResponseId`
2. Si approved : exec handler local → `input: [{type:"function_call_output", call_id: toolApproval.callId, output: JSON.stringify(result)}]`
3. Si denied : `input: [{type:"function_call_output", call_id, output: JSON.stringify({status:"denied"})}]`
4. POST /v1/responses avec `{previous_response_id, input, tools: [...]}` — OpenAI reconstitue tout le contexte

**Flow MCP approval** :
1. Charge `previous_response_id`
2. `input: [{type:"mcp_approval_response", approve, approval_request_id}]`
3. POST /v1/responses — OpenAI fait l'appel MCP si approved

Cette architecture (ne plus envoyer le full messages array au-delà du premier turn) divise drastiquement la conso tokens sur sessions longues. C'est l'un des gains majeurs de Responses API.

### P1.4 — Tests

`packages/api/src/routes/chat.test.ts` :
- Mock `fetch` pour retourner des SSE events fixture (créer `packages/api/test/fixtures/responses-events/`)
- Cas 1 : simple text → accumulation + usage event inséré
- Cas 2 : function_call → handler exécuté → continuation → final text
- Cas 3 : requires_approval → event `tool_approval` émis, stream fermé, pas de continuation
- Cas 4 : resume avec toolApproval.approved=true → handler exécuté → final text
- Cas 5 : `mcp_call` event → SSE mcp_call_* propagés, pas d'exécution locale
- Cas 6 : `response.failed` → SSE error

`packages/api/src/lib/openai.test.ts` :
- `parseResponsesEventLine` pour chaque event type
- `streamResponses` vérifie le POST body

## Phase 2 — Registry MCP + UI

### P2.1 — DB : seed étendu

`packages/api/src/db/seed.ts` :

```ts
const servers = [
  {
    name: 'bible',
    core: 1,
    enabled: 1,
    transport: 'http-streamable',
    configJson: JSON.stringify({
      url: `${opts.mcpBibleUrl}/mcp`,
      auth_header_env: 'MCP_SHARED_SECRET',
      require_approval: {
        never: { tool_names: ['list_entities', 'get_entity', 'search', 'semantic_search', 'list_events', 'get_stats'] },
        always: { tool_names: ['create_entity', 'update_entity', 'delete_entity', 'create_event', 'update_event'] },
      },
    }),
  },
  {
    name: 'writing-tools',
    core: 0,
    enabled: 0,
    transport: 'http-streamable',
    configJson: JSON.stringify({
      url: `${opts.mcpWritingToolsUrl ?? 'http://writing-tools-mcp:7802'}/mcp`,
      auth_header_env: 'MCP_SHARED_SECRET',
      require_approval: 'never',
    }),
  },
];
```

### P2.2 — Routes API MCP

Nouveau `packages/api/src/routes/mcp.ts` :

```ts
app.get('/', (c) => {
  const servers = deps.db.db.select().from(mcpServers).all();
  return c.json({ servers: servers.map(serializeServer) });
});

app.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const { enabled } = await c.req.json<{ enabled: boolean }>();
  deps.db.db.update(mcpServers).set({ enabled: enabled ? 1 : 0 }).where(eq(mcpServers.id, id)).run();
  return c.json({ ok: true });
});
```

Suppression `/bible/status` (plus pertinent, on ne maintient plus de McpClient local).

### P2.3 — UI `card-mcp.tsx`

```tsx
export function CardMcp() {
  const { data } = useQuery({ queryKey: ['mcp'], queryFn: () => api.get('/api/mcp') });
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch(`/api/mcp/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp'] }),
  });

  return (
    <section className="rounded-lg border border-card-border bg-card p-3">
      <header className="mb-2 flex items-center gap-1.5">
        <Plug className="size-3.5 text-muted-foreground" />
        <h3 className="text-[13px] font-semibold">MCP</h3>
      </header>
      {data?.servers.length ? (
        <ul className="space-y-1.5">
          {data.servers.map((s) => (
            <li key={s.id} className="flex items-center justify-between text-[12px]">
              <span>{s.name}</span>
              <Switch
                checked={s.enabled === 1}
                onCheckedChange={(v) => toggle.mutate({ id: s.id, enabled: v })}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="...">Aucun serveur MCP configure</p>
      )}
    </section>
  );
}
```

### P2.4 — Suppression code legacy

- `packages/api/src/services/mcp-client.ts` → delete
- `packages/api/src/services/mcp-client.test.ts` → delete
- `packages/api/src/routes/chat-tools.ts` : retirer le bloc MCP (lignes 114-125 pour defs, 246-257 pour handlers)
- `packages/api/src/app.ts` : retirer `mcpClient` de AppDeps et ChatRouteDeps
- `packages/api/src/index.ts` : retirer createMcpClient + retry loop

## Phase 3 — Sidecar writing-tools-mcp + Caddy

### P3.1 — Dockerfile.writing-tools-mcp

```dockerfile
FROM python:3.11-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends git build-essential && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir uv

WORKDIR /opt
RUN git clone --depth=1 https://github.com/wdm0006/writing-tools-mcp /opt/src
WORKDIR /opt/src
RUN uv sync --frozen

# Patch entrypoint : force streamable-http transport
COPY docker/writing-tools-mcp/entrypoint.py /opt/src/entrypoint.py

ENV HOST=0.0.0.0 PORT=7802
EXPOSE 7802
CMD ["uv", "run", "entrypoint.py"]
```

Fichier `docker/writing-tools-mcp/entrypoint.py` :
```python
import os
from server import mcp  # import existing FastMCP instance
if __name__ == "__main__":
    mcp.run(
        transport="streamable-http",
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "7802")),
    )
```

### P3.2 — docker-compose.yml

```yaml
  writing-tools-mcp:
    build:
      context: .
      dockerfile: Dockerfile.writing-tools-mcp
    container_name: buck-writing-tools-mcp
    networks:
      - caddy-public
      - internal
    restart: unless-stopped
    environment:
      MCP_SHARED_SECRET: ${MCP_SHARED_SECRET}
    healthcheck:
      test: ["CMD-SHELL", "wget -q -O - http://127.0.0.1:7802/mcp || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
```

Ajout à `bible-mcp` :
```yaml
  bible-mcp:
    ...
    networks:
      - caddy-public      # nouveau
      - internal
    environment:
      ...
      MCP_SHARED_SECRET: ${MCP_SHARED_SECRET}
```

### P3.3 — Caddy (trinity-lifeos-agent/vps/docker/caddy/Caddyfile)

```caddy
bible-mcp.buck.{$BUCK_HOST_BASE} {
    @auth header Authorization "Bearer {$MCP_SHARED_SECRET}"
    handle @auth {
        reverse_proxy buck-bible-mcp:7801
    }
    handle {
        respond "Unauthorized" 401
    }
}

writing-mcp.buck.{$BUCK_HOST_BASE} {
    @auth header Authorization "Bearer {$MCP_SHARED_SECRET}"
    handle @auth {
        reverse_proxy buck-writing-tools-mcp:7802
    }
    handle {
        respond "Unauthorized" 401
    }
}
```

Note : bible-mcp actuellement **n'applique pas** d'auth native côté container. L'auth est déportée 100% sur Caddy. Acceptable tant que le container n'est pas exposé autrement.

### P3.4 — Auth niveau container (défense en profondeur — optionnel M7)

À terme, ajouter dans bible-mcp + writing-tools-mcp un middleware Bearer match sur `MCP_SHARED_SECRET`. Reporté M8 si pas bloquant.

### P3.5 — Env vars

`.env` (et `.env.example`) :
```
MCP_SHARED_SECRET=<64-char random hex>
MCP_BIBLE_URL=https://bible-mcp.buck.romain-ecarnot.com
MCP_WRITING_TOOLS_URL=https://writing-mcp.buck.romain-ecarnot.com
```

`MCP_BIBLE_URL` devient l'URL **publique** passée à OpenAI, pas l'URL interne Docker. Dev hybride : utiliser l'URL interne `http://bible-mcp:7801` + pas d'auth (flag `MCP_DEV_NO_AUTH=1`), ou tunnel ngrok.

**Gotcha dev** : OpenAI ne peut pas joindre `localhost` ou `bible-mcp:7801`. Pour tester MCP en local :
- Option A : mocker au niveau du fetch dans les tests
- Option B : tunnel ngrok (`ngrok http 7801`) → URL publique temporaire
- Option C : déployer tôt sur VPS et tester directement en prod

Recommandation : option A pour les tests, option C pour la validation end-to-end. Pas de dev MCP local sans tunnel.

## Phase 4 — Polish + docs

- `docs/deploy/mcp-public-caddy.md` : guide rotation secret, DNS, test auth
- `README.md` : section MCP servers
- Vérifier que la compaction / session titles / budget guard marchent toujours (usage_events cachedInputTokens, migration DB)

### P4.1 — Migrations DB

`packages/api/migrations/00XX_add_cached_tokens_and_response_id.sql` :
```sql
ALTER TABLE usage_events ADD COLUMN cached_input_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_sessions ADD COLUMN last_response_id TEXT;
```

+ update `packages/api/src/db/schema.ts` :
- `usageEvents.cachedInputTokens: integer('cached_input_tokens').notNull().default(0)`
- `chatSessions.lastResponseId: text('last_response_id')`

## Ordre d'exécution recommandé

1. **P1.1 + P1.2 + P1.4** (openai.ts + chat.ts + tests) — iso-feature, pas de MCP côté tools. Bible garde McpClient tant que P2 pas fini → dev branch intermédiaire peut rester green.
2. **P4.1** (migration DB cached_tokens) — avant de commit usage
3. **P3.1-P3.3** (sidecar writing-tools + Caddy config) — prépare l'infra
4. **P2.1-P2.4** (registry + UI + suppression McpClient) — bascule la logique MCP
5. **Deploy VPS** — test end-to-end avec bible + writing exposés
6. **Commit + PR**

## Considérations "fully compliant"

### Strict mode par défaut
Responses force `strict: true` sur les function tools sauf opt-out. Il faut auditer nos schemas existants (`read_file`, `list_directory`, `create_file`, `delete_file`, `shell_execute`, `activate_skill`, `recall`, `remember`) :
- Champs optionnels (`cwd` dans shell_execute, `path` dans list_directory) → soit on les rend `required` + nullable, soit on passe `strict: false` sur ces tools.
- `additionalProperties: false` ajouté partout.
- Pas d'union/oneOf dans les parameters.

### Instructions vs system in input
On migre les prompts système (`prompts.current.system` + `prompts.current.rules` + memory preferences) vers le paramètre top-level `instructions`. Plus simple, évite un item `role:"system"` en tête d'input à chaque turn.

Cas à trancher : la liste des skills workspace (injectée actuellement comme 3ème system message). À concaténer dans `instructions`, séparée par `---`.

### Zero Data Retention & `store`
Par défaut `store: true` + OpenAI garde 30 jours. Pour Buck (données narratives perso), acceptable. Si un jour on veut ZDR : `store: false` + `include: ["reasoning.encrypted_content"]`. Hors scope M7.

### Future-proof built-in tools
Architecture tools[] accepte trivialement :
```ts
{ type: 'web_search' }              // opt-in via setting user
{ type: 'image_generation' }        // idem
{ type: 'file_search', vector_store_ids: [...] }  // M8+ avec vector store workspace
```
→ prévoir dans `user_settings` des flags `webSearchEnabled`, `imageGenEnabled` (bool, off par défaut) mais **pas** les implémenter en M7.

## Success criteria

- [ ] `pnpm test` all green (api + web + shared)
- [ ] `pnpm typecheck` all green
- [ ] `pnpm lint` all green
- [ ] Dev login → chat simple → réponse streaming OK
- [ ] Chat avec tool call `list_directory` → fonctionne
- [ ] Chat avec tool call `create_file` → event `tool_approval` émis, confirm/deny marche
- [ ] Deploy VPS : bible + writing-tools joignables via Caddy avec Bearer
- [ ] Chat prod : tool bible search → OpenAI call via connector, event `mcp_call_started/done` streamé
- [ ] Toggle `writing-tools` ON dans UI → request chat suivante contient le connector dans `tools`, tool call visible en stream
- [ ] Toggle OFF → connector absent du body, plus visible
- [ ] `usage_events.cached_input_tokens` peuplé quand applicable
- [ ] `chat_sessions.last_response_id` peuplé après chaque completion
- [ ] Resume après MCP approval : POST avec `mcpApproval` → suite du stream OK
- [ ] Strict-compliant JSON schemas sur tous les function tools (ou `strict:false` explicite)
- [ ] `/api/health` OK, `McpClient` supprimé, aucun import orphelin

## Risques & atténuations

| Risque | Impact | Mitigation |
|---|---|---|
| Streaming events mal parsés | Stream cassé silencieux | Fixtures exhaustives, logger les events `unknown` |
| MCP approval stateless KO | Feature MCP write inutilisable | Fallback `require_approval: never` + report M8 |
| Caddy secret fuit | Bible exposée | Rotation facile, monitor 401s, rate-limit |
| OpenAI down sur MCP | Tool fail = modèle confus | Set `require_approval: never` + response.mcp_call.failed → modèle ré-explique |
| Image writing-tools 3 GB | Build CI lent | Pre-push ghcr.io, reuse layer |
| Migration cassant sessions existantes | Messages anciens illisibles | Pas de migration de format messages, juste du code serveur |

## Tests e2e

`packages/web/tests/e2e/mcp-toggle.spec.ts` (nouveau) :
- Login → panel MCP affiche bible (ON) + writing-tools (OFF)
- Toggle writing-tools ON → verifier PATCH emis
- Reload → state persiste

Chat e2e avec MCP réel = post-deploy manuel, pas dans Playwright.
