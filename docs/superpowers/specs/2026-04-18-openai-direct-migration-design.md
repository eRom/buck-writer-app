# Migration AI SDK → OpenAI API Directe

**Date** : 2026-04-18
**Statut** : Draft
**Type** : Refactor (zéro changement fonctionnel)

## Motivation

L'AI SDK v6 (Vercel) cause des problèmes systématiques :
- `as any` sur chaque tool definition (overloads TS incompatibles avec les retours union)
- Sérialisation schema cassée (`type: "None"` envoyé à OpenAI)
- API Responses (`/v1/responses`) par défaut qu'il faut contourner avec `.chat()`
- Streaming text-only (`toTextStreamResponse()`) qui force une détection heuristique pour l'approval flow
- Extraction `toolMeta` fragile (format `response.messages` mal documenté)
- 2 dépendances (`ai@6.x`, `@ai-sdk/openai@3.x`) pour abstraire un seul provider

Pour une app single-provider (OpenAI), l'API directe est plus simple, plus fiable, et donne un contrôle total.

## Périmètre

**Fichiers impactés :**

| Fichier | Changement |
|---------|-----------|
| `packages/api/src/routes/chat.ts` | Réécriture majeure — remplace streamText/generateText/tool par fetch + SSE |
| `packages/api/src/lib/openai.ts` | **Nouveau** — client OpenAI léger (fetch + SSE reader + tool loop) |
| `packages/api/src/lib/openai.test.ts` | **Nouveau** — tests du client |
| `packages/api/src/routes/chat.test.ts` | Adapter les mocks (plus de vi.mock('ai')) |
| `packages/api/src/middleware/budget-guard.test.ts` | Adapter les mocks |
| `packages/api/package.json` | Supprimer `ai` et `@ai-sdk/openai` |
| `packages/web/src/components/chat/chat-area.tsx` | Adapter le parsing de la réponse streaming (SSE avec tool_calls) |

**Pas touché :**
- Les tool handlers (buildFileTools, buildShellTool, buildSkillTools) — la logique d'exécution reste identique
- L'approval flow (wrapToolsWithApproval) — le pattern reste, mais l'implémentation change
- La DB, les schemas, le frontend (sauf chat-area.tsx parsing)
- kill-switch, prompts, skills, attachments

## Architecture cible

### 1. Client OpenAI léger (`packages/api/src/lib/openai.ts`)

Trois fonctions exportées :

```typescript
// Streaming chat avec tools — retourne un ReadableStream<SSEEvent>
export async function streamChat(opts: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
}): Promise<ReadableStream<Uint8Array>>

// Chat non-streaming (pour la génération de titre)
export async function chat(opts: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
}): Promise<{ text: string; usage: Usage }>

// Parse un stream SSE en events structurés
export async function* parseSSE(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<SSEEvent>
```

**Types :**

```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface SSEEvent {
  type: 'content' | 'tool_call' | 'done' | 'error';
  // Pour content :
  text?: string;
  // Pour tool_call :
  toolCalls?: ToolCall[];
  // Pour done :
  usage?: { prompt_tokens: number; completion_tokens: number };
  finishReason?: 'stop' | 'tool_calls';
}
```

### 2. Tool definitions — Zod → JSON Schema

Les tools sont actuellement définis avec `tool()` d'AI SDK + Zod. On les transforme en JSON Schema pur.

**Avant (AI SDK) :**
```typescript
read_file: tool({
  description: '...',
  parameters: z.object({ path: z.string() }),
  execute: async ({ path }) => { ... },
} as any),
```

**Après (OpenAI direct) :**
```typescript
// Définition envoyée à OpenAI (JSON Schema)
const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '...',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
  // ...
];

// Handlers (logique d'exécution inchangée)
const TOOL_HANDLERS: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
  read_file: async ({ path }) => { ... },
  // ...
};
```

Plus de `tool()`, plus de `as any`, plus de Zod pour les schemas API.

### 3. Streaming et approval flow

**Avant (AI SDK) :**
```
streamText() → toTextStreamResponse() → text brut
Détection approval : regex heuristique sur le texte
```

**Après (OpenAI direct) :**
```
fetch(/v1/chat/completions, { stream: true }) → SSE events
Le stream contient des events structurés :
  - delta.content → texte, streamé au client
  - delta.tool_calls → tool call détecté
  - finish_reason: 'tool_calls' → le modèle attend un résultat

Approval flow :
  1. On parse le stream SSE
  2. Si un tool_call arrive pour un tool dans TOOLS_REQUIRING_APPROVAL :
     → On arrête le stream
     → On renvoie un event JSON au client : { type: 'tool_approval', toolCallId, toolName, args }
     → Le client affiche l'ApprovalBlock
  3. Le client POST avec toolApproval → l'API exécute ou refuse, relance le stream
```

C'est **déterministe** — plus de regex heuristique. Le `tool_calls` est un champ structuré dans le SSE.

### 4. Multi-step tool loop

**Avant :** AI SDK gère ça avec `maxSteps: 5`.

**Après :** Boucle manuelle côté serveur :

```typescript
async function chatWithTools(messages, tools, maxSteps = 5) {
  for (let step = 0; step < maxSteps; step++) {
    const response = await streamChat({ messages, tools });
    // Parse response, accumulate content + tool_calls
    
    if (finishReason === 'stop') {
      // Modèle a fini — retourner le texte
      return { text, usage };
    }
    
    if (finishReason === 'tool_calls') {
      // Vérifier approval
      for (const toolCall of toolCalls) {
        if (TOOLS_REQUIRING_APPROVAL.includes(toolCall.name)) {
          // Arrêter ici, retourner l'approval request
          return { type: 'approval_needed', toolCall };
        }
        // Auto-execute
        const result = await TOOL_HANDLERS[toolCall.name](args);
        messages.push(assistantMsg, { role: 'tool', tool_call_id, content: JSON.stringify(result) });
      }
      // Continue loop
    }
  }
}
```

### 5. Format de réponse au client

**Avant :** text/event-stream brut (juste du texte).

**Après :** SSE structuré avec types d'events :

```
event: content
data: {"text": "Voici le contenu..."}

event: tool_approval
data: {"toolCallId": "call_123", "toolName": "shell_execute", "args": {"command": "date"}}

event: tool_result
data: {"toolCallId": "call_123", "toolName": "shell_execute", "result": {"stdout": "...", "exitCode": 0}}

event: done
data: {"usage": {"inputTokens": 150, "outputTokens": 42}}
```

Le client parse ces events au lieu de faire du regex sur du texte.

### 6. Client (chat-area.tsx)

**Avant :**
```typescript
const decoder = new TextDecoder();
let accumulated = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  accumulated += decoder.decode(value, { stream: true });
  // regex pour détecter requires_approval...
}
```

**Après :**
```typescript
const eventSource = new EventSource(/* ou parsing SSE manuel */);
// Ou parsing manuel des events dans le stream :
for await (const event of parseSSEStream(reader)) {
  switch (event.type) {
    case 'content':
      accumulated += event.text;
      setMessages(prev => ...);
      break;
    case 'tool_approval':
      setPendingApproval({ ...event });
      break;
    case 'tool_result':
      // Afficher TerminalBlock
      break;
    case 'done':
      break;
  }
}
```

Plus de regex. Parsing déterministe.

## Ce qui ne change PAS

- Les tool handlers (logique d'exécution read_file, list_directory, etc.)
- Le kill switch
- L'approval flow (pattern pause/resume, même UX)
- La persistance (messages, toolMeta, usageEvents)
- Les composants frontend (ApprovalBlock, TerminalBlock, MessageBubble)
- L'auth, le budget guard, les sessions

## Dépendances supprimées

- `ai` (6.0.167) — ~2.5MB
- `@ai-sdk/openai` (3.0.53) — ~500KB

**Dépendance ajoutée : aucune.** Tout est fait avec `fetch` (natif Node 20+).

## Tests

- Tests unitaires du client OpenAI (SSE parsing, tool call accumulation, error handling)
- Tests existants adaptés (remplacer vi.mock('ai') par mock de fetch)
- Tests d'intégration approval flow (déterministe cette fois)

## Risques

- **Le format SSE OpenAI peut changer** — on dépend directement de l'API, pas d'un SDK qui absorberait les changements. Mitigé par : les tests, et OpenAI ne casse presque jamais le format Chat Completions.
- **Pas de retry automatique** — AI SDK avait un retry intégré. On peut ajouter un retry simple si besoin (429 → backoff).
