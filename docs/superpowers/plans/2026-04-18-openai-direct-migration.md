# Migration OpenAI API Directe — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer Vercel AI SDK (ai + @ai-sdk/openai) par des appels fetch directs à l'API OpenAI Chat Completions, avec streaming SSE et tool calling natif.

**Architecture:** Client OpenAI léger (fetch + SSE parser), tool loop manuelle, streaming SSE structuré vers le client avec events typés.

**Tech Stack:** fetch (Node 20 natif), SSE, OpenAI Chat Completions API, Zod (validation input seulement, plus pour les schemas tools)

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `packages/api/src/lib/openai.ts` | Client OpenAI : streamChat, chat, parseSSE |
| Create | `packages/api/src/lib/openai.test.ts` | Tests du client (SSE parsing, tool accumulation) |
| Modify | `packages/api/src/routes/chat.ts` | Réécriture : tools en JSON Schema, tool loop, SSE structuré |
| Modify | `packages/api/src/routes/chat.test.ts` | Adapter mocks (fetch au lieu de vi.mock('ai')) |
| Modify | `packages/api/src/middleware/budget-guard.test.ts` | Adapter mocks |
| Modify | `packages/api/package.json` | Supprimer ai, @ai-sdk/openai |
| Modify | `packages/web/src/components/chat/chat-area.tsx` | Parser SSE events structurés |

---

### Task 1: Client OpenAI — SSE Parser

**Files:**
- Create: `packages/api/src/lib/openai.ts`
- Create: `packages/api/src/lib/openai.test.ts`

- [ ] **Step 1: Write failing tests for SSE parsing**

```typescript
// packages/api/src/lib/openai.test.ts
import { describe, it, expect } from 'vitest';
import { parseSSEChunks } from './openai.js';

describe('parseSSEChunks', () => {
  it('parses content delta', () => {
    const line = 'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}';
    const events = parseSSEChunks(line);
    expect(events).toEqual([{ type: 'content', text: 'Hello' }]);
  });

  it('parses tool_calls delta', () => {
    const line = 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read_file","arguments":""}}]},"finish_reason":null}]}';
    const events = parseSSEChunks(line);
    expect(events).toEqual([{
      type: 'tool_call_delta',
      index: 0,
      id: 'call_1',
      name: 'read_file',
      argumentsDelta: '',
    }]);
  });

  it('parses tool_calls argument continuation', () => {
    const line = 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"path\\""}}]},"finish_reason":null}]}';
    const events = parseSSEChunks(line);
    expect(events).toEqual([{
      type: 'tool_call_delta',
      index: 0,
      id: undefined,
      name: undefined,
      argumentsDelta: '{"path"',
    }]);
  });

  it('parses finish_reason stop', () => {
    const line = 'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}';
    const events = parseSSEChunks(line);
    expect(events).toEqual([{
      type: 'done',
      finishReason: 'stop',
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }]);
  });

  it('parses finish_reason tool_calls', () => {
    const line = 'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}';
    const events = parseSSEChunks(line);
    expect(events).toEqual([{ type: 'done', finishReason: 'tool_calls', usage: undefined }]);
  });

  it('handles [DONE] sentinel', () => {
    const events = parseSSEChunks('data: [DONE]');
    expect(events).toEqual([]);
  });

  it('skips empty lines', () => {
    const events = parseSSEChunks('');
    expect(events).toEqual([]);
  });
});

describe('accumulateToolCalls', () => {
  it('accumulates tool call deltas into complete tool calls', async () => {
    const { accumulateToolCalls } = await import('./openai.js');
    const acc = accumulateToolCalls();
    
    acc.push({ index: 0, id: 'call_1', name: 'read_file', argumentsDelta: '' });
    acc.push({ index: 0, id: undefined, name: undefined, argumentsDelta: '{"path"' });
    acc.push({ index: 0, id: undefined, name: undefined, argumentsDelta: ':"test.txt"}' });
    
    const result = acc.finish();
    expect(result).toEqual([{
      id: 'call_1',
      type: 'function',
      function: { name: 'read_file', arguments: '{"path":"test.txt"}' },
    }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/api && npx vitest run src/lib/openai.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement SSE parser and tool accumulator**

```typescript
// packages/api/src/lib/openai.ts

export interface SSEContentEvent {
  type: 'content';
  text: string;
}

export interface SSEToolCallDelta {
  type: 'tool_call_delta';
  index: number;
  id?: string;
  name?: string;
  argumentsDelta: string;
}

export interface SSEDoneEvent {
  type: 'done';
  finishReason: 'stop' | 'tool_calls';
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export type SSEEvent = SSEContentEvent | SSEToolCallDelta | SSEDoneEvent;

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export function parseSSEChunks(line: string): SSEEvent[] {
  if (!line.startsWith('data: ')) return [];
  const data = line.slice(6).trim();
  if (data === '[DONE]') return [];

  try {
    const parsed = JSON.parse(data);
    const choice = parsed.choices?.[0];
    if (!choice) return [];

    const events: SSEEvent[] = [];
    const delta = choice.delta;

    if (delta?.content) {
      events.push({ type: 'content', text: delta.content });
    }

    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        events.push({
          type: 'tool_call_delta',
          index: tc.index,
          id: tc.id,
          name: tc.function?.name,
          argumentsDelta: tc.function?.arguments ?? '',
        });
      }
    }

    if (choice.finish_reason) {
      events.push({
        type: 'done',
        finishReason: choice.finish_reason,
        usage: parsed.usage,
      });
    }

    return events;
  } catch {
    return [];
  }
}

export function accumulateToolCalls() {
  const calls: Map<number, { id: string; name: string; args: string }> = new Map();

  return {
    push(delta: { index: number; id?: string; name?: string; argumentsDelta: string }) {
      const existing = calls.get(delta.index);
      if (existing) {
        existing.args += delta.argumentsDelta;
      } else {
        calls.set(delta.index, {
          id: delta.id ?? '',
          name: delta.name ?? '',
          args: delta.argumentsDelta,
        });
      }
    },
    finish(): ToolCall[] {
      return [...calls.values()].map((c) => ({
        id: c.id,
        type: 'function' as const,
        function: { name: c.name, arguments: c.args },
      }));
    },
    clear() {
      calls.clear();
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/api && npx vitest run src/lib/openai.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/lib/openai.ts packages/api/src/lib/openai.test.ts
git commit -m "feat(api): add OpenAI SSE parser and tool call accumulator"
```

---

### Task 2: Client OpenAI — streamChat + chat

**Files:**
- Modify: `packages/api/src/lib/openai.ts`
- Modify: `packages/api/src/lib/openai.test.ts`

- [ ] **Step 1: Write tests for streamChat and chat**

Add to `openai.test.ts`:

```typescript
import { vi } from 'vitest';

describe('streamChat', () => {
  it('calls OpenAI API with correct headers and body', async () => {
    const { streamChat } = await import('./openai.js');
    const mockResponse = new Response('data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}\n\ndata: [DONE]\n\n', {
      headers: { 'content-type': 'text/event-stream' },
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const stream = await streamChat({
      apiKey: 'sk-test',
      model: 'gpt-5.4-mini',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer sk-test',
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(stream).toBeTruthy();
    fetchSpy.mockRestore();
  });
});

describe('chat', () => {
  it('returns text and usage from non-streaming call', async () => {
    const { chat } = await import('./openai.js');
    const mockResponse = new Response(JSON.stringify({
      choices: [{ message: { content: 'Test title' } }],
      usage: { prompt_tokens: 10, completion_tokens: 3 },
    }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const result = await chat({
      apiKey: 'sk-test',
      model: 'gpt-5.4-nano',
      messages: [{ role: 'user', content: 'Hello' }],
      maxTokens: 30,
    });

    expect(result.text).toBe('Test title');
    expect(result.usage).toEqual({ prompt_tokens: 10, completion_tokens: 3 });
    fetchSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Implement streamChat and chat**

Add to `openai.ts`:

```typescript
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface StreamChatOpts {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
}

interface ChatOpts {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export async function streamChat(opts: StreamChatOpts): Promise<Response> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
    body.tool_choice = 'auto';
  }

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new OpenAIError(res.status, err);
  }

  return res;
}

export async function chat(opts: ChatOpts): Promise<{ text: string; usage: { prompt_tokens: number; completion_tokens: number } }> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
  };
  if (opts.maxTokens) body.max_completion_tokens = opts.maxTokens;

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new OpenAIError(res.status, err);
  }

  const data = await res.json();
  return {
    text: data.choices?.[0]?.message?.content ?? '',
    usage: data.usage ?? { prompt_tokens: 0, completion_tokens: 0 },
  };
}

export class OpenAIError extends Error {
  constructor(public status: number, public data: unknown) {
    super(`OpenAI API error ${status}`);
  }
}
```

- [ ] **Step 3: Run tests**

Run: `cd packages/api && npx vitest run src/lib/openai.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/lib/openai.ts packages/api/src/lib/openai.test.ts
git commit -m "feat(api): add streamChat and chat functions for OpenAI direct"
```

---

### Task 3: Réécriture chat.ts — Tool definitions + handlers

**Files:**
- Modify: `packages/api/src/routes/chat.ts`

Remplacer les `buildFileTools`, `buildSkillTools`, `buildShellTool` par :
1. Un tableau `TOOL_DEFINITIONS` (JSON Schema pur, envoyé à OpenAI)
2. Un objet `TOOL_HANDLERS` (fonctions d'exécution, même logique)
3. Supprimer `wrapToolsWithApproval` — l'approval est géré dans la tool loop

- [ ] **Step 1: Réécrire les tool definitions**

Remplacer les 3 fonctions `build*` par :

```typescript
function buildToolDefinitions(workspaceDir?: string, skills?: Map<string, Skill>): ToolDefinition[] {
  const defs: ToolDefinition[] = [];
  if (workspaceDir) {
    defs.push(
      { type: 'function', function: { name: 'read_file', description: 'Read the content of a file in the workspace', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
      { type: 'function', function: { name: 'list_directory', description: 'List files and directories at a given path in the workspace', parameters: { type: 'object', properties: { path: { type: 'string', description: 'Relative path, defaults to workspace root' } } } } },
      { type: 'function', function: { name: 'create_file', description: 'Create or overwrite a file in the workspace', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
      { type: 'function', function: { name: 'delete_file', description: 'Delete a file in the workspace', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
      { type: 'function', function: { name: 'shell_execute', description: 'Execute a shell command. The user will be asked for confirmation before execution.', parameters: { type: 'object', properties: { command: { type: 'string', description: 'The shell command to execute' }, cwd: { type: 'string', description: 'Working directory (relative to workspace)' } }, required: ['command'] } } },
    );
  }
  if (skills && skills.size > 0) {
    const list = [...skills.values()].map((s) => `${s.name}: ${s.description}`).join('; ');
    defs.push({ type: 'function', function: { name: 'activate_skill', description: `Activate a skill. Available: ${list}`, parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } } });
  }
  return defs;
}
```

- [ ] **Step 2: Réécrire les tool handlers**

```typescript
function buildToolHandlers(workspaceDir: string, skills?: Map<string, Skill>): Record<string, (args: Record<string, unknown>) => Promise<unknown>> {
  return {
    read_file: async ({ path: filePath }) => {
      // ... même logique qu'avant
    },
    list_directory: async ({ path: dirPath }) => {
      // ... même logique qu'avant
    },
    create_file: async ({ path: filePath, content }) => {
      // ... même logique qu'avant
    },
    delete_file: async ({ path: filePath }) => {
      // ... même logique qu'avant
    },
    shell_execute: async ({ command, cwd }) => {
      // ... même logique qu'avant (avec kill switch)
    },
    activate_skill: async ({ name }) => {
      const skill = skills?.get(name as string);
      if (!skill) return { error: `skill not found: ${name}` };
      return { name: skill.name, instructions: skill.body };
    },
  };
}
```

- [ ] **Step 3: Supprimer les imports AI SDK**

Remplacer :
```typescript
import { streamText, generateText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
```
Par :
```typescript
import { streamChat, chat, parseSSEChunks, accumulateToolCalls, OpenAIError } from '../lib/openai.js';
import type { ChatMessage, ToolDefinition, ToolCall } from '../lib/openai.js';
```

- [ ] **Step 4: Vérifier que ça compile**

Run: `cd packages/api && npx tsc --noEmit`
Expected: Erreurs attendues dans le POST handler (pas encore réécrit)

- [ ] **Step 5: Commit (WIP)**

```bash
git add packages/api/src/routes/chat.ts
git commit -m "refactor(api): replace AI SDK tool definitions with JSON Schema"
```

---

### Task 4: Réécriture chat.ts — POST handler (streaming + tool loop)

**Files:**
- Modify: `packages/api/src/routes/chat.ts`

C'est le coeur de la migration. Réécrire le POST handler pour :
1. Appeler streamChat() au lieu de streamText()
2. Parser le SSE, gérer la tool loop
3. Streamer des events typés au client (content, tool_approval, tool_result, done)
4. Gérer l'approval flow dans la tool loop

- [ ] **Step 1: Réécrire le POST handler**

Le nouveau flow :

```typescript
app.post('/', async (c) => {
  // ... parsing body, session, model (inchangé)
  
  const toolDefs = buildToolDefinitions(deps.workspaceDir, deps.skills);
  const toolHandlers = deps.workspaceDir ? buildToolHandlers(deps.workspaceDir, deps.skills) : {};
  const messages: ChatMessage[] = [...systemMessages, ...typedUserMessages];
  
  // Si c'est une reprise après approval
  if (toolApproval) {
    // Ajouter le tool_call assistant + le tool result à l'historique
    // ... (voir spec)
  }

  // Créer un TransformStream pour envoyer des events SSE au client
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  
  function sendEvent(type: string, data: unknown) {
    writer.write(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
  }
  
  // Tool loop
  (async () => {
    try {
      let step = 0;
      const maxSteps = 5;
      
      while (step < maxSteps) {
        step++;
        const res = await streamChat({
          apiKey: deps.openaiApiKey,
          model: resolvedModel,
          messages,
          tools: toolDefs.length > 0 ? toolDefs : undefined,
        });
        
        // Parse SSE stream
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finishReason = '';
        let accumulatedText = '';
        const toolAcc = accumulateToolCalls();
        let usage = { prompt_tokens: 0, completion_tokens: 0 };
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop()!;
          
          for (const line of lines) {
            const events = parseSSEChunks(line);
            for (const event of events) {
              if (event.type === 'content') {
                accumulatedText += event.text;
                sendEvent('content', { text: event.text });
              } else if (event.type === 'tool_call_delta') {
                toolAcc.push(event);
              } else if (event.type === 'done') {
                finishReason = event.finishReason;
                if (event.usage) usage = event.usage;
              }
            }
          }
        }
        
        if (finishReason === 'stop' || finishReason === '') {
          // Modèle a fini
          sendEvent('done', { usage });
          // Persist (voir step suivant)
          break;
        }
        
        if (finishReason === 'tool_calls') {
          const toolCalls = toolAcc.finish();
          toolAcc.clear();
          
          // Ajouter le message assistant avec tool_calls à l'historique
          messages.push({ role: 'assistant', content: null, tool_calls: toolCalls });
          
          for (const tc of toolCalls) {
            const args = JSON.parse(tc.function.arguments);
            const name = tc.function.name;
            
            // Check approval
            if (TOOLS_REQUIRING_APPROVAL.includes(name)) {
              // Envoyer l'event d'approval au client et arrêter
              sendEvent('tool_approval', {
                toolCallId: tc.id,
                toolName: name,
                args,
              });
              sendEvent('done', { usage, pendingApproval: true });
              // Persist partiel (texte accumulé + tool calls)
              break;
            }
            
            // Auto-execute
            const handler = toolHandlers[name];
            if (!handler) {
              messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ error: `unknown tool: ${name}` }) });
              continue;
            }
            const result = await handler(args);
            messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
            sendEvent('tool_result', { toolCallId: tc.id, toolName: name, result });
          }
          
          // Si on a envoyé un approval, arrêter la boucle
          if (toolCalls.some((tc) => TOOLS_REQUIRING_APPROVAL.includes(tc.function.name))) {
            break;
          }
          // Sinon continuer la boucle
        }
      }
    } catch (err) {
      sendEvent('error', { message: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      writer.close();
    }
  })();
  
  const headers = new Headers({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  if (isNewSession) headers.set('x-session-id', sessionId!);
  return new Response(readable, { headers });
});
```

- [ ] **Step 2: Ajouter la persistance dans la tool loop**

Après le `sendEvent('done', ...)`, persister messages + usage (même logique qu'avant, adaptée).

- [ ] **Step 3: Gérer la reprise après approval**

Au début du handler, si `toolApproval` est présent :
```typescript
if (toolApproval) {
  if (toolApproval.approved) {
    const handler = toolHandlers[toolApproval.toolName];
    const result = handler ? await handler(toolApproval.args) : { error: 'unknown tool' };
    // Reconstruire les messages avec le tool_call + result
    messages.push(
      { role: 'assistant', content: null, tool_calls: [{ id: toolApproval.toolCallId, type: 'function', function: { name: toolApproval.toolName, arguments: JSON.stringify(toolApproval.args) } }] },
      { role: 'tool', tool_call_id: toolApproval.toolCallId, content: JSON.stringify(result) },
    );
  } else {
    messages.push(
      { role: 'assistant', content: null, tool_calls: [{ id: toolApproval.toolCallId, type: 'function', function: { name: toolApproval.toolName, arguments: JSON.stringify(toolApproval.args) } }] },
      { role: 'tool', tool_call_id: toolApproval.toolCallId, content: JSON.stringify({ status: 'denied', message: "L'utilisateur a refusé l'exécution." }) },
    );
  }
}
```

- [ ] **Step 4: Adapter generateText pour le titre**

Remplacer :
```typescript
generateText({ model: openai.chat('gpt-5.4-nano'), messages: [...], maxOutputTokens: 30 })
```
Par :
```typescript
chat({ apiKey: deps.openaiApiKey, model: 'gpt-5.4-nano', messages: [...], maxTokens: 30 })
```

- [ ] **Step 5: Supprimer les restes AI SDK**

Supprimer `const openai = createOpenAI(...)`, les `buildFileTools`, `buildSkillTools`, `buildShellTool`, `wrapToolsWithApproval`.

- [ ] **Step 6: Vérifier compilation**

Run: `cd packages/api && npx tsc --noEmit`
Expected: Clean (possibles warnings dans les tests, pas encore adaptés)

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/routes/chat.ts
git commit -m "refactor(api): rewrite chat route with direct OpenAI API"
```

---

### Task 5: Adapter les tests API

**Files:**
- Modify: `packages/api/src/routes/chat.test.ts`
- Modify: `packages/api/src/middleware/budget-guard.test.ts`

- [ ] **Step 1: Remplacer vi.mock('ai') par mock de fetch**

Dans `chat.test.ts`, remplacer le mock AI SDK :

```typescript
// Avant
vi.mock('ai', () => ({ streamText: ..., generateText: ..., tool: ... }));

// Après — mock fetch globalement
const mockSSEResponse = 'data: {"choices":[{"delta":{"content":"Hello!"},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\ndata: [DONE]\n\n';

vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
  if (String(url).includes('openai.com')) {
    return new Response(mockSSEResponse, {
      headers: { 'content-type': 'text/event-stream' },
    });
  }
  throw new Error(`Unexpected fetch: ${url}`);
});
```

- [ ] **Step 2: Adapter les assertions**

Les réponses sont maintenant des SSE events, pas du texte brut.

- [ ] **Step 3: Même chose pour budget-guard.test.ts**

- [ ] **Step 4: Run all tests**

Run: `cd packages/api && npx vitest run`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/chat.test.ts packages/api/src/middleware/budget-guard.test.ts
git commit -m "test(api): adapt tests for direct OpenAI API"
```

---

### Task 6: Supprimer les dépendances AI SDK

**Files:**
- Modify: `packages/api/package.json`

- [ ] **Step 1: Remove packages**

```bash
cd packages/api && pnpm remove ai @ai-sdk/openai
```

- [ ] **Step 2: Verify no remaining imports**

```bash
grep -r "from 'ai'" packages/api/src/ && echo "STILL IMPORTS AI SDK" || echo "CLEAN"
grep -r "@ai-sdk" packages/api/src/ && echo "STILL IMPORTS AI SDK" || echo "CLEAN"
```

- [ ] **Step 3: Run full test suite**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: Clean

- [ ] **Step 5: Commit**

```bash
git add packages/api/package.json pnpm-lock.yaml
git commit -m "chore(api): remove ai and @ai-sdk/openai dependencies"
```

---

### Task 7: Frontend — Parser SSE events structurés

**Files:**
- Modify: `packages/web/src/components/chat/chat-area.tsx`

- [ ] **Step 1: Écrire le parser SSE client**

Remplacer l'accumulation de texte brut par un parser d'events SSE :

```typescript
// Helper pour parser les SSE events dans le stream
function* parseSSELines(text: string): Generator<{ event: string; data: string }> {
  const lines = text.split('\n');
  let currentEvent = '';
  let currentData = '';
  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7);
    } else if (line.startsWith('data: ')) {
      currentData = line.slice(6);
    } else if (line === '' && currentData) {
      yield { event: currentEvent || 'message', data: currentData };
      currentEvent = '';
      currentData = '';
    }
  }
}
```

- [ ] **Step 2: Adapter handleSubmit pour parser les events**

```typescript
// Dans la boucle de lecture du stream
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  
  // Parser les events complets
  for (const { event, data } of parseSSELines(buffer)) {
    const parsed = JSON.parse(data);
    switch (event) {
      case 'content':
        accumulated += parsed.text;
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: accumulated } : m));
        break;
      case 'tool_approval':
        setPendingApproval({
          toolCallId: parsed.toolCallId,
          toolName: parsed.toolName,
          args: parsed.args,
          messageHistory: allMessages,
        });
        break;
      case 'tool_result':
        // Store for display
        break;
      case 'done':
        break;
    }
  }
  // Garder le reste du buffer (ligne incomplète)
  const lastNewline = buffer.lastIndexOf('\n');
  buffer = lastNewline >= 0 ? buffer.slice(lastNewline + 1) : buffer;
}
```

- [ ] **Step 3: Supprimer la regex heuristique d'approval**

Supprimer le bloc `try { const approvalMatch = accumulated.match(...)` qui faisait la détection par regex.

- [ ] **Step 4: Verify build**

Run: `cd packages/web && npx tsc --noEmit`
Expected: Clean

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/chat/chat-area.tsx
git commit -m "feat(web): parse structured SSE events in ChatArea"
```

---

### Task 8: Test complet + cleanup

**Files:** All

- [ ] **Step 1: Run full typecheck**

Run: `pnpm typecheck`
Expected: Clean

- [ ] **Step 2: Run all tests**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: No new errors

- [ ] **Step 4: Verify no AI SDK remnants**

```bash
grep -r "ai-sdk\|from 'ai'\|@ai-sdk\|streamText\|generateText\|tool(" packages/ --include="*.ts" | grep -v node_modules | grep -v ".test." | grep -v plans | grep -v specs
```

- [ ] **Step 5: Commit fixes if needed**

```bash
git add -A
git commit -m "fix: cleanup after AI SDK removal"
```
