# M4 — Bible MCP Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Intégrer un serveur MCP bible (fork HTTP-only, embeddings OpenAI) comme package monorepo `@buck/bible-mcp`, connecté au buck-api via un client MCP avec tool discovery dynamique (`bible_*` préfixés), feedback UI sur statut, et refactor des prompts vers `$WORKSPACE_DIR/systems/` live-editable.

**Architecture:** Nouveau package `packages/bible-mcp` (copie upstream `barda-mcp-ecrivain-bible/packages/mcp`), embeddings swappés HF→OpenAI, mode HTTP-only sur port 7801. Client MCP côté api charge `tools/list` au démarrage, merge dans le tool loop avec préfixe `bible_`, exécution sans approval. Chat continue en mode dégradé si bible KO, web affiche toast persistant. Docker compose prod (service `bible-mcp` réseau interne) + compose dev optionnel.

**Tech Stack:** TypeScript ESM, Express + `@modelcontextprotocol/sdk` côté serveur (hérité upstream), `fetch` JSON-RPC 2.0 côté client, OpenAI embeddings API (`text-embedding-3-large`), better-sqlite3 + drizzle, Vitest, chokidar pour hot-reload.

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `packages/bible-mcp/` | Nouveau package workspace, serveur MCP HTTP-only |
| Create | `packages/bible-mcp/src/server.ts` | Entry HTTP, wrap `src/http.ts` upstream |
| Create | `packages/bible-mcp/src/embeddings/openai.ts` | Client embeddings OpenAI (remplace HF) |
| Modify | `packages/bible-mcp/src/db/*` | Dimension vecteurs `VECTOR(3072)`, meta modèle |
| Create | `packages/bible-mcp/package.json` | Dep strictes, script dev/build, `@buck/bible-mcp` |
| Create | `packages/bible-mcp/tsconfig.json` | Aligné sur les autres packages |
| Create | `packages/bible-mcp/tsup.config.ts` | Build dist/ |
| Create | `packages/bible-mcp/src/server.test.ts` | Tests démarrage + tools/list |
| Create | `packages/bible-mcp/src/embeddings/openai.test.ts` | Tests batching + fetch mocké |
| Create | `packages/api/src/services/mcp-client.ts` | Client JSON-RPC, tool cache, health check |
| Create | `packages/api/src/services/mcp-client.test.ts` | Tests timeout, error, status change |
| Modify | `packages/api/src/routes/chat.ts` | Merge tools bible, handlers `bible_*` |
| Modify | `packages/api/src/routes/chat.test.ts` | Cas avec mcpClient mocké |
| Create | `packages/api/src/routes/mcp.ts` | Endpoint GET /api/mcp/bible/status |
| Create | `packages/api/src/routes/mcp.test.ts` | Tests endpoint healthy/unhealthy |
| Modify | `packages/api/src/app.ts` | Mount `/api/mcp/*` |
| Modify | `packages/api/src/index.ts` | Init mcpClient, pass à deps |
| Create | `packages/api/src/services/prompts.ts` (rewrite) | Loader + bootstrap + watcher |
| Modify | `packages/api/src/services/prompts.test.ts` | Tests bootstrap + hot-reload |
| Create | `packages/api/src/defaults/systems/SYSTEM.md` | Template bootstrap |
| Create | `packages/api/src/defaults/systems/RULES.md` | Template bootstrap |
| Modify | `packages/api/tsup.config.ts` | Copier `defaults/` dans dist |
| Move | `prompts/SYSTEM.md` → `workspace/systems/SYSTEM.md` | Migration one-shot |
| Move | `prompts/RULES.md` → `workspace/systems/RULES.md` | Migration one-shot |
| Delete | `prompts/USER.md` + `prompts/` | Code mort |
| Create | `packages/web/src/lib/mcp.ts` | Hook `useBibleStatus` |
| Create | `packages/web/src/components/bible-status-banner.tsx` | Banner warning persistant |
| Modify | `packages/web/src/components/chat/chat-area.tsx` | Mount `<BibleStatusBanner />` |
| Create | `Dockerfile.bible-mcp` | Image bible-mcp |
| Modify | `docker-compose.yml` | Service `bible-mcp` + network `internal` |
| Create | `docker-compose.local.yml` | Dev hybride optionnel |
| Modify | `.env.example` | `MCP_BIBLE_URL`, `BIBLE_DB_PATH`, `BIBLE_HTTP_PORT`, `OPENAI_EMBEDDING_MODEL` |
| Modify | `.env.development` | Mêmes vars pour dev local |
| Modify | `packages/api/src/env.ts` | Schema Zod pour nouvelles vars |
| Modify | `packages/api/src/env.test.ts` | Tests nouvelles vars |
| Modify | `CLAUDE.md` | Doc package bible-mcp + nouvelle stack |

---

### Task 1: Scaffold `packages/bible-mcp` (copie + strip stdio)

**Files:**
- Create: `packages/bible-mcp/` (tout le contenu)

- [ ] **Step 1: Copier le source upstream**

```bash
cp -r /Users/recarnot/dev/barda-mcp-ecrivain-bible/packages/mcp packages/bible-mcp
rm -rf packages/bible-mcp/{dist,node_modules,.turbo,coverage}
rm -f packages/bible-mcp/pnpm-lock.yaml
```

- [ ] **Step 2: Supprimer tout ce qui touche au mode stdio**

```bash
# Le fichier index.ts upstream contient l'entry stdio (bin:). On le remplace.
rm packages/bible-mcp/src/index.ts
```

Supprimer dans `packages/bible-mcp/src/server.ts` tout code qui réfère à `StdioServerTransport` (s'il y en a).

- [ ] **Step 3: Réécrire `packages/bible-mcp/package.json`**

```json
{
  "name": "@buck/bible-mcp",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/server.js",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsup",
    "start": "node dist/server.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "db:generate": "drizzle-kit generate",
    "bible:reindex": "node dist/scripts/reindex.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.28.0",
    "better-sqlite3": "^12.8.0",
    "drizzle-orm": "^0.36.1",
    "express": "^4.21.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/express": "^5.0.0",
    "@types/node": "^22.8.6",
    "drizzle-kit": "^0.28.0",
    "tsup": "^8.3.5",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^3.0.0"
  },
  "engines": { "node": ">=20" }
}
```

Note : **on ne copie pas** `@huggingface/transformers` ni ses peer deps. Les packages upstream sérialisation markdown (si présents) sont copiés tels quels.

- [ ] **Step 4: Ajouter `tsconfig.json` et `tsup.config.ts`**

`packages/bible-mcp/tsconfig.json` :
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

`packages/bible-mcp/tsup.config.ts` :
```typescript
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/server.ts', 'src/scripts/reindex.ts'],
  format: 'esm',
  clean: true,
  sourcemap: true,
  target: 'node20',
});
```

- [ ] **Step 5: Installer et typecheck**

```bash
pnpm install
pnpm --filter @buck/bible-mcp typecheck
```

Expected : erreurs restantes concernent les imports vers `./embeddings/*` qui n'existent plus (HF) — on les résout en Task 2.

- [ ] **Step 6: Commit WIP**

```bash
git add packages/bible-mcp pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "feat(bible-mcp): scaffold workspace package (copy upstream, strip stdio)"
```

---

### Task 2: Embeddings OpenAI (remplace HuggingFace)

**Files:**
- Create: `packages/bible-mcp/src/embeddings/openai.ts`
- Create: `packages/bible-mcp/src/embeddings/openai.test.ts`
- Delete: fichiers HF existants dans `packages/bible-mcp/src/embeddings/`

- [ ] **Step 1: Inventorier les usages d'embeddings**

```bash
cd packages/bible-mcp && grep -rn "embeddings\|embedTexts\|@huggingface" src/ | head -30
```

Noter les fichiers qui importent l'ancien module. Cibles typiques : `src/tools/search.ts`, `src/tools/reindex.ts`, `src/embeddings/index.ts`.

- [ ] **Step 2: Écrire les tests pour le nouveau client OpenAI**

```typescript
// packages/bible-mcp/src/embeddings/openai.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { embedBatch, EMBEDDING_DIM } from './openai.js';

afterEach(() => vi.restoreAllMocks());

describe('embedBatch', () => {
  it('calls OpenAI embeddings endpoint with correct payload', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: [{ embedding: new Array(3072).fill(0.1) }],
        model: 'text-embedding-3-large',
        usage: { prompt_tokens: 5 },
      }), { headers: { 'content-type': 'application/json' } }),
    );

    const result = await embedBatch({ apiKey: 'sk-test', texts: ['hello'] });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Authorization': 'Bearer sk-test' }),
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(3072);
  });

  it('batches requests (100 texts max per call)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        data: new Array(100).fill({ embedding: new Array(3072).fill(0) }),
      })),
    );
    const texts = new Array(250).fill('x');
    await embedBatch({ apiKey: 'sk', texts });
    expect(fetchSpy).toHaveBeenCalledTimes(3); // 100 + 100 + 50
  });

  it('respects custom model env', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ embedding: [] }] })),
    );
    await embedBatch({ apiKey: 'sk', texts: ['x'], model: 'text-embedding-3-small' });
    const call = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body.model).toBe('text-embedding-3-small');
  });

  it('throws on non-2xx with payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }),
    );
    await expect(embedBatch({ apiKey: 'sk', texts: ['x'] })).rejects.toThrow(/401/);
  });
});

describe('EMBEDDING_DIM', () => {
  it('exports 3072 for large', () => {
    expect(EMBEDDING_DIM['text-embedding-3-large']).toBe(3072);
    expect(EMBEDDING_DIM['text-embedding-3-small']).toBe(1536);
  });
});
```

- [ ] **Step 3: Run tests — expect fail (module absent)**

```bash
pnpm --filter @buck/bible-mcp test src/embeddings/openai.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 4: Implémenter `openai.ts`**

```typescript
// packages/bible-mcp/src/embeddings/openai.ts
const OPENAI_URL = 'https://api.openai.com/v1/embeddings';
const BATCH_SIZE = 100;

export const EMBEDDING_DIM: Record<string, number> = {
  'text-embedding-3-large': 3072,
  'text-embedding-3-small': 1536,
};

export interface EmbedOpts {
  apiKey: string;
  texts: string[];
  model?: string;
}

export async function embedBatch(opts: EmbedOpts): Promise<number[][]> {
  const model = opts.model ?? process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-large';
  const results: number[][] = [];
  for (let i = 0; i < opts.texts.length; i += BATCH_SIZE) {
    const batch = opts.texts.slice(i, i + BATCH_SIZE);
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, input: batch }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`OpenAI embeddings ${res.status}: ${err}`);
    }
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    for (const item of data.data) results.push(item.embedding);
  }
  return results;
}

export function getEmbeddingDim(model?: string): number {
  const m = model ?? process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-large';
  return EMBEDDING_DIM[m] ?? 3072;
}
```

- [ ] **Step 5: Adapter les appelants upstream**

Rechercher tous les fichiers qui utilisaient l'ancien module HF (`grep -rn "embeddings" src/tools`) et remplacer les appels par `embedBatch({ apiKey: process.env.OPENAI_API_KEY!, texts })`. Typiquement :

- `src/tools/search_semantic.ts` : appelle `embedBatch` pour la query, puis recherche cosine dans la table.
- `src/tools/reindex.ts` : batch sur tous les textes source, stocke les vecteurs.

Si l'upstream a un wrapper abstrait (`src/embeddings/index.ts`) qui expose `embed(texts)`, réécrire ce wrapper pour déléguer à `openai.ts` :

```typescript
// packages/bible-mcp/src/embeddings/index.ts
export { embedBatch as embed, getEmbeddingDim, EMBEDDING_DIM } from './openai.js';
```

- [ ] **Step 6: Supprimer les fichiers HF**

```bash
cd packages/bible-mcp/src/embeddings
ls  # lister
# Supprimer tout fichier qui importait @huggingface/transformers
trash <fichiers_hf>
```

- [ ] **Step 7: Fail-fast si `OPENAI_API_KEY` absente**

Dans `src/server.ts` (créé en Task 3) on ajoutera ce check. Pour l'instant, noter le besoin.

- [ ] **Step 8: Run tests**

```bash
pnpm --filter @buck/bible-mcp test
pnpm --filter @buck/bible-mcp typecheck
```

Expected: les tests openai passent. Les tests upstream qui testaient HF sont à skip/adapter : utiliser `it.skip` avec commentaire, ou réécrire pour mocker fetch.

- [ ] **Step 9: Adapter le schema DB pour 3072 dims**

Rechercher la migration existante (`src/db/migrations/*.sql` ou `src/db/schema.ts`) qui déclare la colonne embeddings. Noter que better-sqlite3 stocke les vecteurs en BLOB ou JSON selon l'upstream. Si la dimension est en dur dans une migration SQL, créer une nouvelle migration qui drop+recreate la table `embeddings` + ajoute une table `embeddings_meta` :

```sql
-- packages/bible-mcp/src/db/migrations/0002_openai_embeddings.sql
DROP TABLE IF EXISTS embeddings;
CREATE TABLE embeddings (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  vector BLOB NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);
CREATE TABLE IF NOT EXISTS embeddings_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR REPLACE INTO embeddings_meta (key, value) VALUES ('model', 'text-embedding-3-large');
INSERT OR REPLACE INTO embeddings_meta (key, value) VALUES ('dim', '3072');
```

- [ ] **Step 10: Commit**

```bash
git add packages/bible-mcp
git commit -m "feat(bible-mcp): swap HuggingFace embeddings for OpenAI text-embedding-3-large"
```

---

### Task 3: Serveur HTTP bible-mcp + tests

**Files:**
- Create: `packages/bible-mcp/src/server.ts`
- Create: `packages/bible-mcp/src/server.test.ts`

- [ ] **Step 1: Inspecter l'existant**

Lire `packages/bible-mcp/src/http.ts` (copié depuis l'upstream) pour comprendre la forme de l'`app` Express exporté. On cherche une fonction ou un objet `createHttpApp(mcpServer)` ou similaire. Adapter selon ce qu'on trouve.

- [ ] **Step 2: Écrire `server.ts`**

```typescript
// packages/bible-mcp/src/server.ts
import Database from 'better-sqlite3';
import { createHttpApp } from './http.js';
import { createMcpServer } from './server-mcp.js'; // ou le nom réel côté upstream
import { runMigrations } from './db/migrate.js';

const port = Number(process.env.BIBLE_HTTP_PORT ?? 7801);
const dbPath = process.env.BIBLE_DB_PATH ?? './data/bible.db';

if (!process.env.OPENAI_API_KEY) {
  console.error('[bible-mcp] OPENAI_API_KEY is required for embeddings');
  process.exit(1);
}

runMigrations(dbPath);
const db = new Database(dbPath);
const mcpServer = createMcpServer(db);
const app = createHttpApp(mcpServer);

app.listen(port, () => {
  console.warn(`[bible-mcp] listening on http://0.0.0.0:${port}`);
});
```

Adapter les imports aux noms réels dans l'upstream (qui peuvent différer).

- [ ] **Step 3: Test d'intégration**

```typescript
// packages/bible-mcp/src/server.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import type { AddressInfo } from 'node:net';
import { createHttpApp } from './http.js';
import { createMcpServer } from './server-mcp.js';
import { runMigrations } from './db/migrate.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

let server: ReturnType<typeof import('node:http').createServer>;
let baseUrl: string;
let dbFile: string;

beforeAll(async () => {
  process.env.OPENAI_API_KEY = 'sk-test';
  dbFile = path.join(os.tmpdir(), `bible-test-${Date.now()}.db`);
  runMigrations(dbFile);
  const db = new Database(dbFile);
  const mcp = createMcpServer(db);
  const app = createHttpApp(mcp);
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => {
  server.close();
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
});

describe('bible-mcp HTTP server', () => {
  it('tools/list returns the expected tool set', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { result: { tools: Array<{ name: string }> } };
    expect(body.result.tools.length).toBeGreaterThan(30);
    // Un sample de tools attendus
    const names = body.result.tools.map((t) => t.name);
    expect(names).toContain('search_fulltext');
    expect(names).toContain('create_character');
  });

  it('tools/call search_fulltext on empty DB returns empty results', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: { name: 'search_fulltext', arguments: { query: 'bob' } },
      }),
    });
    const body = await res.json() as { result: unknown };
    expect(body.result).toBeDefined();
  });
});
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @buck/bible-mcp test
```

Expected: serveur démarre, `tools/list` retourne ~48 tools, `search_fulltext` répond.

- [ ] **Step 5: Démarrer en dev manuellement pour valider**

```bash
OPENAI_API_KEY=$OPENAI_API_KEY pnpm --filter @buck/bible-mcp dev
```

Dans un autre terminal :
```bash
curl -s http://localhost:7801/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools | length'
```

Expected: `48` (ou le nombre réel upstream).

- [ ] **Step 6: Commit**

```bash
git add packages/bible-mcp
git commit -m "feat(bible-mcp): add HTTP entry point with integration tests"
```

---

### Task 4: Client MCP côté `packages/api`

**Files:**
- Create: `packages/api/src/services/mcp-client.ts`
- Create: `packages/api/src/services/mcp-client.test.ts`

- [ ] **Step 1: Tests**

```typescript
// packages/api/src/services/mcp-client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMcpClient } from './mcp-client.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createMcpClient', () => {
  it('listTools sends JSON-RPC tools/list and caches result', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        jsonrpc: '2.0', id: 1,
        result: { tools: [{ name: 'search_fulltext', description: 'Search', inputSchema: { type: 'object' } }] },
      })),
    );
    const client = createMcpClient({ url: 'http://bible-mcp:7801' });
    const tools = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('search_fulltext');
    expect(client.cachedTools()).toEqual(tools);
    expect(client.isHealthy()).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://bible-mcp:7801/mcp',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('callTool sends JSON-RPC tools/call and returns result', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        jsonrpc: '2.0', id: 1, result: { tools: [] },
      })),
    ).mockResolvedValueOnce(
      new Response(JSON.stringify({
        jsonrpc: '2.0', id: 2, result: { matches: ['Bob'] },
      })),
    );
    const client = createMcpClient({ url: 'http://bible-mcp:7801' });
    await client.listTools();
    const result = await client.callTool('search_fulltext', { query: 'Bob' });
    expect(result).toEqual({ matches: ['Bob'] });
  });

  it('listTools timeout flips healthy=false', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10_000)),
    );
    const client = createMcpClient({ url: 'http://bible-mcp:7801', timeoutMs: 500 });
    const p = client.listTools().catch(() => undefined);
    vi.advanceTimersByTime(600);
    await p;
    expect(client.isHealthy()).toBe(false);
  });

  it('onStatusChange fires when health flips', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools: [] } })),
    );
    const client = createMcpClient({ url: 'http://bible-mcp:7801' });
    const cb = vi.fn();
    client.onStatusChange(cb);
    await client.listTools();

    // Second poll fails
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await client.listTools().catch(() => undefined);
    expect(cb).toHaveBeenCalledWith(false);
  });

  it('callTool throws when server returns JSON-RPC error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        jsonrpc: '2.0', id: 1, result: { tools: [] },
      })),
    ).mockResolvedValueOnce(
      new Response(JSON.stringify({
        jsonrpc: '2.0', id: 2, error: { code: -32601, message: 'Method not found' },
      })),
    );
    const client = createMcpClient({ url: 'http://bible-mcp:7801' });
    await client.listTools();
    await expect(client.callTool('unknown_tool', {})).rejects.toThrow(/Method not found/);
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

```bash
pnpm --filter @buck/api test src/services/mcp-client.test.ts
```

- [ ] **Step 3: Implémentation**

```typescript
// packages/api/src/services/mcp-client.ts
export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpClient {
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args: unknown): Promise<unknown>;
  isHealthy(): boolean;
  cachedTools(): McpTool[];
  onStatusChange(cb: (healthy: boolean) => void): () => void;
  stop(): void;
}

interface McpClientOpts {
  url: string;
  timeoutMs?: number;
  healthPollMs?: number;
}

interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

export function createMcpClient(opts: McpClientOpts): McpClient {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const pollMs = opts.healthPollMs ?? 30_000;
  let rpcId = 0;
  let tools: McpTool[] = [];
  let healthy = false;
  const statusListeners = new Set<(h: boolean) => void>();
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function setHealth(next: boolean) {
    if (next !== healthy) {
      healthy = next;
      for (const cb of statusListeners) cb(healthy);
    }
  }

  async function rpc<T>(method: string, params?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${opts.url}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`MCP HTTP ${res.status}`);
      const body = (await res.json()) as JsonRpcResponse<T>;
      if (body.error) throw new Error(`MCP RPC ${body.error.code}: ${body.error.message}`);
      if (body.result === undefined) throw new Error('MCP empty result');
      return body.result;
    } finally {
      clearTimeout(timer);
    }
  }

  async function listTools(): Promise<McpTool[]> {
    try {
      const result = await rpc<{ tools: McpTool[] }>('tools/list');
      tools = result.tools;
      setHealth(true);
      return tools;
    } catch (err) {
      setHealth(false);
      throw err;
    }
  }

  async function callTool(name: string, args: unknown): Promise<unknown> {
    return rpc<unknown>('tools/call', { name, arguments: args });
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      listTools().catch(() => undefined);
    }, pollMs);
  }

  return {
    listTools: async () => {
      const result = await listTools().catch((err) => { throw err; }).catch(() => { return tools; });
      startPolling();
      return result ?? tools;
    },
    callTool,
    isHealthy: () => healthy,
    cachedTools: () => tools,
    onStatusChange: (cb) => {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    stop: () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      statusListeners.clear();
    },
  };
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @buck/api test src/services/mcp-client.test.ts
```

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/mcp-client.ts packages/api/src/services/mcp-client.test.ts
git commit -m "feat(api): add MCP JSON-RPC client with health polling"
```

---

### Task 5: Intégrer les tools bible dans le tool loop

**Files:**
- Modify: `packages/api/src/routes/chat.ts`
- Modify: `packages/api/src/routes/chat.test.ts`
- Modify: `packages/api/src/index.ts`

- [ ] **Step 1: Étendre `ChatRouteDeps`**

Ajouter dans `packages/api/src/routes/chat.ts` (header de fichier) :

```typescript
import type { McpClient } from '../services/mcp-client.js';

export interface ChatRouteDeps {
  db: DbHandles;
  prompts: Prompts;
  openaiApiKey: string;
  workspaceDir?: string;
  skills?: Map<string, Skill>;
  mcpClient?: McpClient;
  nowMs?: () => number;
}
```

- [ ] **Step 2: Étendre `buildToolDefinitions`**

Modifier la signature et le corps :

```typescript
function buildToolDefinitions(
  workspaceDir: string | undefined,
  skills: Map<string, Skill> | undefined,
  mcpClient: McpClient | undefined,
): ToolDefinition[] {
  const defs: ToolDefinition[] = [];
  // ... tous les ifs existants inchangés ...

  if (mcpClient && mcpClient.isHealthy()) {
    for (const tool of mcpClient.cachedTools()) {
      defs.push({
        type: 'function',
        function: {
          name: `bible_${tool.name}`,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      });
    }
  }

  return defs;
}
```

- [ ] **Step 3: Étendre `buildToolHandlers`**

```typescript
function buildToolHandlers(
  workspaceDir: string,
  skills: Map<string, Skill> | undefined,
  mcpClient: McpClient | undefined,
): Record<string, ToolHandler> {
  const handlers: Record<string, ToolHandler> = {
    read_file: /* inchangé */,
    list_directory: /* inchangé */,
    create_file: /* inchangé */,
    delete_file: /* inchangé */,
    shell_execute: /* inchangé */,
    activate_skill: /* inchangé */,
  };

  if (mcpClient) {
    for (const tool of mcpClient.cachedTools()) {
      handlers[`bible_${tool.name}`] = async (args) => {
        try {
          return await mcpClient.callTool(tool.name, args);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'unknown';
          return { error: `bible-mcp call failed: ${msg}` };
        }
      };
    }
  }

  return handlers;
}
```

- [ ] **Step 4: Adapter `buildToolHandlers` pour accepter workspace optionnel**

Refactor de la signature pour que les tools bible existent même sans workspace :

```typescript
function buildToolHandlers(
  workspaceDir: string | undefined,
  skills: Map<string, Skill> | undefined,
  mcpClient: McpClient | undefined,
): Record<string, ToolHandler> {
  const handlers: Record<string, ToolHandler> = {};

  if (workspaceDir) {
    handlers.read_file = async ({ path: filePath }) => { /* inchangé */ };
    handlers.list_directory = async ({ path: dirPath }) => { /* inchangé */ };
    handlers.create_file = async ({ path: filePath, content }) => { /* inchangé */ };
    handlers.delete_file = async ({ path: filePath }) => { /* inchangé */ };
    handlers.shell_execute = async ({ command, cwd }) => { /* inchangé */ };
  }

  if (skills) {
    handlers.activate_skill = async ({ name }) => { /* inchangé */ };
  }

  if (mcpClient) {
    for (const tool of mcpClient.cachedTools()) {
      handlers[`bible_${tool.name}`] = async (args) => {
        try {
          return await mcpClient.callTool(tool.name, args);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'unknown';
          return { error: `bible-mcp call failed: ${msg}` };
        }
      };
    }
  }

  return handlers;
}
```

- [ ] **Step 5: Adapter `createChatRoute`**

Remplacer :
```typescript
const toolDefs = buildToolDefinitions(deps.workspaceDir, deps.skills);
const toolHandlers: Record<string, ToolHandler> = deps.workspaceDir
  ? buildToolHandlers(deps.workspaceDir, deps.skills)
  : {};
```

Par (appel unique, signatures cohérentes) :
```typescript
const toolDefs = buildToolDefinitions(deps.workspaceDir, deps.skills, deps.mcpClient);
const toolHandlers = buildToolHandlers(deps.workspaceDir, deps.skills, deps.mcpClient);
```

- [ ] **Step 6: Ajouter test unitaire "chat avec bible"**

Dans `packages/api/src/routes/chat.test.ts`, après les tests existants :

```typescript
describe('POST /api/chat — with bible MCP', () => {
  it('exposes bible_* tools when mcpClient is healthy', async () => {
    ctx = await makeCtx();
    // On a besoin d'injecter un mcpClient dans les deps. La factory makeCtx
    // doit être étendue pour accepter un override.
    // ...
    // Mock fetch OpenAI qui renvoie un tool_call bible_search_fulltext
    // Vérifier que le handler appelle mcpClient.callTool('search_fulltext', {query:'...'})
  });
});
```

Pour l'instant, si l'injection d'un `mcpClient` dans `makeCtx` demande trop de refactor, on peut se contenter d'un test séparé qui appelle directement `buildToolDefinitions` avec un mock :

```typescript
// packages/api/src/routes/chat-tools.test.ts (nouveau, focus unitaire)
import { describe, it, expect } from 'vitest';
// Il faudra exporter buildToolDefinitions depuis chat.ts (le rendre testable)
// ou créer un module séparé packages/api/src/routes/chat-tools.ts
```

**Décision simplificatrice** : extraire `buildToolDefinitions` et `buildToolHandlers` dans `packages/api/src/routes/chat-tools.ts` (nouveau fichier), les exporter, et tester directement avec mcpClient mocké. Ça évite de refactorer les fixtures de test du chat complet.

```typescript
// packages/api/src/routes/chat-tools.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildToolDefinitions, buildToolHandlers } from './chat-tools.js';
import type { McpClient } from '../services/mcp-client.js';

function fakeMcpClient(tools: Array<{ name: string; description: string; inputSchema: unknown }>, healthy = true): McpClient {
  return {
    listTools: vi.fn().mockResolvedValue(tools),
    callTool: vi.fn().mockResolvedValue({ ok: true }),
    isHealthy: () => healthy,
    cachedTools: () => tools as never,
    onStatusChange: () => () => undefined,
    stop: () => undefined,
  };
}

describe('buildToolDefinitions with bible', () => {
  it('prefixes bible tools with bible_', () => {
    const mcp = fakeMcpClient([
      { name: 'search_fulltext', description: 'FTS', inputSchema: { type: 'object' } },
    ]);
    const defs = buildToolDefinitions(undefined, undefined, mcp);
    expect(defs.map((d) => d.function.name)).toContain('bible_search_fulltext');
  });

  it('skips bible tools if unhealthy', () => {
    const mcp = fakeMcpClient([{ name: 'x', description: 'y', inputSchema: {} }], false);
    const defs = buildToolDefinitions(undefined, undefined, mcp);
    expect(defs).toHaveLength(0);
  });
});

describe('buildToolHandlers with bible', () => {
  it('routes bible_X to mcpClient.callTool(X, args)', async () => {
    const mcp = fakeMcpClient([{ name: 'search_fulltext', description: '', inputSchema: {} }]);
    const handlers = buildToolHandlers('', undefined, mcp);
    const result = await handlers['bible_search_fulltext']({ query: 'bob' });
    expect(mcp.callTool).toHaveBeenCalledWith('search_fulltext', { query: 'bob' });
    expect(result).toEqual({ ok: true });
  });

  it('returns error shape when callTool throws', async () => {
    const mcp = fakeMcpClient([{ name: 'x', description: '', inputSchema: {} }]);
    (mcp.callTool as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    const handlers = buildToolHandlers('', undefined, mcp);
    const result = await handlers['bible_x']({});
    expect(result).toEqual({ error: expect.stringContaining('boom') });
  });
});
```

- [ ] **Step 7: Extraire `buildToolDefinitions` et `buildToolHandlers` vers `chat-tools.ts`**

Créer le nouveau fichier `packages/api/src/routes/chat-tools.ts` qui exporte les deux fonctions, et mettre à jour `chat.ts` pour les importer au lieu de les définir inline.

- [ ] **Step 8: Init mcpClient dans `packages/api/src/index.ts`**

```typescript
import { createMcpClient } from './services/mcp-client.js';

const mcpClient = createMcpClient({
  url: env.MCP_BIBLE_URL ?? 'http://bible-mcp:7801',
});
try {
  await mcpClient.listTools();
  console.warn(`[api] bible-mcp ok (${mcpClient.cachedTools().length} tools)`);
} catch (err) {
  console.warn('[api] bible-mcp unreachable, running in degraded mode', (err as Error).message);
}
```

Et dans la création de l'app :

```typescript
const app = buildApp({
  // ... existants
  mcpClient,
});
```

- [ ] **Step 9: Étendre `AppDeps`**

Dans `packages/api/src/app.ts` :

```typescript
export interface AppDeps {
  // ... existants
  mcpClient?: McpClient;
}
```

Passer `mcpClient` à `createChatRoute`.

- [ ] **Step 10: Run tests**

```bash
pnpm --filter @buck/api test
pnpm --filter @buck/api typecheck
```

- [ ] **Step 11: Commit**

```bash
git add packages/api/src packages/api/src/index.ts
git commit -m "feat(api): integrate bible MCP tools into chat tool loop"
```

---

### Task 6: Endpoint status + web banner

**Files:**
- Create: `packages/api/src/routes/mcp.ts`
- Create: `packages/api/src/routes/mcp.test.ts`
- Modify: `packages/api/src/app.ts`
- Create: `packages/web/src/lib/mcp.ts`
- Create: `packages/web/src/components/bible-status-banner.tsx`
- Modify: `packages/web/src/components/chat/chat-area.tsx`

- [ ] **Step 1: Test endpoint**

```typescript
// packages/api/src/routes/mcp.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { createMcpRoutes } from './mcp.js';
import type { McpClient } from '../services/mcp-client.js';

function fakeClient(healthy: boolean, toolCount = 0): McpClient {
  return {
    listTools: vi.fn(), callTool: vi.fn(),
    isHealthy: () => healthy,
    cachedTools: () => new Array(toolCount).fill({ name: '', description: '', inputSchema: {} }),
    onStatusChange: () => () => undefined,
    stop: () => undefined,
  };
}

describe('GET /api/mcp/bible/status', () => {
  it('returns healthy when client is up', async () => {
    const app = new Hono();
    app.route('/api/mcp', createMcpRoutes({ mcpClient: fakeClient(true, 48) }));
    const res = await app.request('/api/mcp/bible/status');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ healthy: true, toolCount: 48 });
  });

  it('returns unhealthy when client is down', async () => {
    const app = new Hono();
    app.route('/api/mcp', createMcpRoutes({ mcpClient: fakeClient(false) }));
    const res = await app.request('/api/mcp/bible/status');
    expect(await res.json()).toEqual({ healthy: false, toolCount: 0 });
  });

  it('returns unhealthy when no client', async () => {
    const app = new Hono();
    app.route('/api/mcp', createMcpRoutes({ mcpClient: undefined }));
    const res = await app.request('/api/mcp/bible/status');
    expect(await res.json()).toEqual({ healthy: false, toolCount: 0 });
  });
});
```

- [ ] **Step 2: Implémenter `mcp.ts`**

```typescript
// packages/api/src/routes/mcp.ts
import { Hono } from 'hono';
import type { McpClient } from '../services/mcp-client.js';

export interface McpRoutesDeps {
  mcpClient?: McpClient;
}

export function createMcpRoutes(deps: McpRoutesDeps): Hono {
  const app = new Hono();
  app.get('/bible/status', (c) => {
    return c.json({
      healthy: deps.mcpClient?.isHealthy() ?? false,
      toolCount: deps.mcpClient?.cachedTools().length ?? 0,
    });
  });
  return app;
}
```

- [ ] **Step 3: Mount dans `app.ts`**

```typescript
import { createMcpRoutes } from './routes/mcp.js';
// ... dans buildApp, après les routes auth/chat/etc.
app.route('/api/mcp', createMcpRoutes({ mcpClient: deps.mcpClient }));
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @buck/api test src/routes/mcp.test.ts
```

- [ ] **Step 5: Hook web**

```typescript
// packages/web/src/lib/mcp.ts
import { useQuery } from '@tanstack/react-query';

export interface BibleStatus {
  healthy: boolean;
  toolCount: number;
}

async function fetchBibleStatus(): Promise<BibleStatus> {
  const res = await fetch('/api/mcp/bible/status', { credentials: 'include' });
  if (!res.ok) return { healthy: false, toolCount: 0 };
  return res.json();
}

export function useBibleStatus() {
  return useQuery({
    queryKey: ['mcp', 'bible', 'status'],
    queryFn: fetchBibleStatus,
    refetchInterval: 30_000,
  });
}
```

- [ ] **Step 6: Composant banner**

```typescript
// packages/web/src/components/bible-status-banner.tsx
import { useBibleStatus } from '@/lib/mcp';

export function BibleStatusBanner() {
  const { data } = useBibleStatus();
  if (!data || data.healthy) return null;
  return (
    <div className="bg-yellow-100 dark:bg-yellow-900/30 border-b border-yellow-300 dark:border-yellow-700 px-4 py-2 text-sm text-yellow-900 dark:text-yellow-100">
      La bible est injoignable. Le chat fonctionne mais les outils bible (recherche, personnages, lieux) sont indisponibles.
    </div>
  );
}
```

- [ ] **Step 7: Mount dans `chat-area.tsx`**

Ajouter l'import :
```typescript
import { BibleStatusBanner } from '@/components/bible-status-banner';
```

Dans le JSX retourné, juste avant `<BudgetBanner />` :
```tsx
<BibleStatusBanner />
{budgetExceeded && <BudgetBanner ... />}
```

- [ ] **Step 8: Typecheck web**

```bash
pnpm --filter @buck/web typecheck
```

- [ ] **Step 9: Commit**

```bash
git add packages/api/src/routes/mcp.ts packages/api/src/routes/mcp.test.ts packages/api/src/app.ts packages/web/src
git commit -m "feat(api+web): add bible MCP status endpoint and persistent UI banner"
```

---

### Task 7: Refactor prompts → `$WORKSPACE_DIR/systems/`

**Files:**
- Modify: `packages/api/src/services/prompts.ts`
- Modify: `packages/api/src/services/prompts.test.ts`
- Create: `packages/api/src/defaults/systems/SYSTEM.md`
- Create: `packages/api/src/defaults/systems/RULES.md`
- Modify: `packages/api/tsup.config.ts`
- Modify: `packages/api/src/index.ts`
- Modify: `packages/api/src/routes/chat.ts`
- Move: `prompts/SYSTEM.md` → `workspace/systems/SYSTEM.md`
- Move: `prompts/RULES.md` → `workspace/systems/RULES.md`
- Delete: `prompts/USER.md`, `prompts/` dir

- [ ] **Step 1: Copier les prompts actuels comme defaults**

```bash
mkdir -p packages/api/src/defaults/systems
cp prompts/SYSTEM.md packages/api/src/defaults/systems/SYSTEM.md
cp prompts/RULES.md packages/api/src/defaults/systems/RULES.md
```

- [ ] **Step 2: Déplacer les prompts actuels vers workspace**

```bash
mkdir -p workspace/systems
mv prompts/SYSTEM.md workspace/systems/SYSTEM.md
mv prompts/RULES.md workspace/systems/RULES.md
trash prompts/USER.md prompts
```

- [ ] **Step 3: Écrire les tests du nouveau service**

```typescript
// packages/api/src/services/prompts.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadPrompts, bootstrapPrompts } from './prompts.js';

let dir: string;
let defaultsDir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buck-systems-'));
  defaultsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buck-defaults-'));
  fs.writeFileSync(path.join(defaultsDir, 'SYSTEM.md'), 'DEFAULT_SYSTEM');
  fs.writeFileSync(path.join(defaultsDir, 'RULES.md'), 'DEFAULT_RULES');
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(defaultsDir, { recursive: true, force: true });
});

describe('loadPrompts', () => {
  it('reads SYSTEM.md and RULES.md', () => {
    fs.writeFileSync(path.join(dir, 'SYSTEM.md'), 'You are Buck.');
    fs.writeFileSync(path.join(dir, 'RULES.md'), 'Be kind.');
    const p = loadPrompts(dir);
    expect(p.system).toBe('You are Buck.');
    expect(p.rules).toBe('Be kind.');
  });

  it('allows empty rules', () => {
    fs.writeFileSync(path.join(dir, 'SYSTEM.md'), 'S');
    const p = loadPrompts(dir);
    expect(p.rules).toBe('');
  });

  it('throws if SYSTEM.md missing', () => {
    expect(() => loadPrompts(dir)).toThrow(/SYSTEM\.md/);
  });
});

describe('bootstrapPrompts', () => {
  it('copies defaults if systems dir missing', () => {
    fs.rmSync(dir, { recursive: true });
    bootstrapPrompts(dir, defaultsDir);
    expect(fs.existsSync(path.join(dir, 'SYSTEM.md'))).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'SYSTEM.md'), 'utf8')).toBe('DEFAULT_SYSTEM');
  });

  it('copies defaults if SYSTEM.md absent but other files present', () => {
    fs.writeFileSync(path.join(dir, 'OTHER.md'), 'x');
    bootstrapPrompts(dir, defaultsDir);
    expect(fs.existsSync(path.join(dir, 'SYSTEM.md'))).toBe(true);
  });

  it('does not overwrite existing SYSTEM.md', () => {
    fs.writeFileSync(path.join(dir, 'SYSTEM.md'), 'CUSTOM');
    bootstrapPrompts(dir, defaultsDir);
    expect(fs.readFileSync(path.join(dir, 'SYSTEM.md'), 'utf8')).toBe('CUSTOM');
  });
});
```

- [ ] **Step 4: Run tests — expect fail (service à réécrire)**

```bash
pnpm --filter @buck/api test src/services/prompts.test.ts
```

- [ ] **Step 5: Réécrire `prompts.ts`**

```typescript
// packages/api/src/services/prompts.ts
import fs from 'node:fs';
import path from 'node:path';
import chokidar from 'chokidar';

export interface Prompts {
  system: string;
  rules: string;
}

function readIfExists(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').trim() : '';
}

export function loadPrompts(systemsDir: string): Prompts {
  const system = readIfExists(path.join(systemsDir, 'SYSTEM.md'));
  if (!system) {
    throw new Error(`SYSTEM.md missing in ${systemsDir}`);
  }
  const rules = readIfExists(path.join(systemsDir, 'RULES.md'));
  return { system, rules };
}

export function bootstrapPrompts(systemsDir: string, defaultsDir: string): void {
  if (!fs.existsSync(systemsDir)) {
    fs.mkdirSync(systemsDir, { recursive: true });
  }
  for (const file of ['SYSTEM.md', 'RULES.md']) {
    const target = path.join(systemsDir, file);
    const source = path.join(defaultsDir, file);
    if (!fs.existsSync(target) && fs.existsSync(source)) {
      fs.copyFileSync(source, target);
    }
  }
}

export function createPromptsWatcher(
  systemsDir: string,
  onChange: (p: Prompts) => void,
): () => void {
  const watcher = chokidar.watch(path.join(systemsDir, '*.md'), {
    ignoreInitial: true,
  });
  const reload = () => {
    try {
      onChange(loadPrompts(systemsDir));
    } catch (err) {
      console.warn('[api] prompts reload failed:', (err as Error).message);
    }
  };
  watcher.on('add', reload);
  watcher.on('change', reload);
  watcher.on('unlink', reload);
  return () => { void watcher.close(); };
}
```

- [ ] **Step 6: Mettre à jour `tsup.config.ts` pour copier les defaults**

```typescript
// packages/api/tsup.config.ts
import { defineConfig } from 'tsup';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

export default defineConfig({
  entry: [/* existants */],
  format: 'esm',
  clean: true,
  onSuccess: async () => {
    const src = path.resolve('src/defaults/systems');
    const dst = path.resolve('dist/defaults/systems');
    mkdirSync(dst, { recursive: true });
    for (const f of readdirSync(src)) {
      copyFileSync(path.join(src, f), path.join(dst, f));
    }
  },
});
```

Adapter aux options réelles du `tsup.config.ts` existant (ne pas écraser ce qui marche déjà).

- [ ] **Step 7: Intégrer dans `index.ts`**

```typescript
import { loadPrompts, bootstrapPrompts, createPromptsWatcher } from './services/prompts.js';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const systemsDir = path.resolve(env.WORKSPACE_DIR, 'systems');
const defaultsDir = path.resolve(here, 'defaults', 'systems');

bootstrapPrompts(systemsDir, defaultsDir);

let prompts: Prompts;
try {
  prompts = loadPrompts(systemsDir);
} catch (err) {
  console.error('[api] failed to load prompts:', (err as Error).message);
  process.exit(1);
}

// Hot reload
createPromptsWatcher(systemsDir, (p) => {
  console.warn('[api] prompts reloaded');
  prompts = p;
  // Pour que le chat pick up : passer une ref mutable dans AppDeps.
  deps.prompts = p; // Voir step suivant
});
```

Pour que chokidar fonctionne avec le pattern où `deps.prompts` doit être mutable, on a deux options :
- **A)** `deps.prompts` = `() => Prompts` (getter) — `chat.ts` appelle `deps.prompts()`
- **B)** Un objet wrapper `deps.promptsRef = { current: prompts }` — `chat.ts` lit `deps.promptsRef.current`

Retenu : **B** (plus simple côté callsite).

Adapter `AppDeps` et `ChatRouteDeps` :
```typescript
export interface PromptsRef {
  current: Prompts;
}
// ... ChatRouteDeps et AppDeps: prompts: PromptsRef au lieu de Prompts
```

Et dans `chat.ts`, lire `deps.prompts.current.system` au lieu de `deps.prompts.system`.

- [ ] **Step 8: Adapter `chat.ts`**

Remplacer chaque occurrence de `deps.prompts.system` par `deps.prompts.current.system`, pareil pour `rules`. Supprimer toute référence à `prompts.user` / USER.md.

- [ ] **Step 9: Adapter les tests existants**

`chat.test.ts` et `budget-guard.test.ts` créent `prompts` via `loadPrompts(promptsDirPath)` puis le passent à `AppDeps`. Adapter :

```typescript
const prompts = loadPrompts(promptsDirPath);
// ...
const deps: AppDeps = {
  // ...
  prompts: { current: prompts },
};
```

Et dans les fixtures, `tmpPromptsDir()` écrit toujours SYSTEM.md + RULES.md. Supprimer la ligne qui écrit USER.md (s'il y en a une).

- [ ] **Step 10: Run tests**

```bash
pnpm --filter @buck/api test
pnpm --filter @buck/api typecheck
```

- [ ] **Step 11: Commit**

```bash
git add packages/api prompts workspace
git commit -m "refactor(api): move prompts to workspace/systems with hot-reload and bootstrap"
```

---

### Task 8: Docker + Dockerfile.bible-mcp + compose

**Files:**
- Create: `Dockerfile.bible-mcp`
- Modify: `docker-compose.yml`
- Create: `docker-compose.local.yml`
- Modify: `.env.example`
- Modify: `.env.development`
- Modify: `packages/api/src/env.ts`
- Modify: `packages/api/src/env.test.ts`

- [ ] **Step 1: `Dockerfile.bible-mcp`**

```dockerfile
# Dockerfile.bible-mcp
FROM node:20-alpine AS base
RUN apk add --no-cache python3 make g++ sqlite
WORKDIR /app

# Copier seulement ce qu'il faut pour le package bible-mcp
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/bible-mcp/package.json packages/bible-mcp/
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate && \
    pnpm install --frozen-lockfile --filter @buck/bible-mcp...

COPY packages/bible-mcp packages/bible-mcp

RUN pnpm --filter @buck/bible-mcp build

FROM node:20-alpine AS runtime
RUN apk add --no-cache sqlite
WORKDIR /app
COPY --from=base /app/packages/bible-mcp/dist ./dist
COPY --from=base /app/packages/bible-mcp/node_modules ./node_modules
COPY --from=base /app/packages/bible-mcp/package.json ./
RUN mkdir -p /app/data
ENV NODE_ENV=production
EXPOSE 7801
CMD ["node", "dist/server.js"]
```

- [ ] **Step 2: Modifier `docker-compose.yml`**

```yaml
# docker-compose.yml (diff conceptuel, adapter au fichier réel)
services:
  bible-mcp:
    build:
      context: .
      dockerfile: Dockerfile.bible-mcp
    networks:
      - internal
    environment:
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      BIBLE_DB_PATH: /app/data/bible.db
      BIBLE_HTTP_PORT: "7801"
      OPENAI_EMBEDDING_MODEL: ${OPENAI_EMBEDDING_MODEL:-text-embedding-3-large}
    volumes:
      - ./data/bible:/app/data
    restart: unless-stopped

  buck:
    # ... config existante ...
    environment:
      # ... existantes ...
      MCP_BIBLE_URL: http://bible-mcp:7801
    networks:
      - caddy-public
      - internal
    depends_on:
      - bible-mcp

networks:
  internal:
    driver: bridge
  caddy-public:
    external: true
```

- [ ] **Step 3: `docker-compose.local.yml`**

```yaml
# docker-compose.local.yml
services:
  bible-mcp:
    build:
      context: .
      dockerfile: Dockerfile.bible-mcp
    ports:
      - "7801:7801"
    environment:
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      BIBLE_DB_PATH: /app/data/bible.db
      OPENAI_EMBEDDING_MODEL: ${OPENAI_EMBEDDING_MODEL:-text-embedding-3-large}
    volumes:
      - /Users/recarnot/dev/barda-mcp-ecrivain-bible/data:/app/data:ro
```

- [ ] **Step 4: `.env.example`**

Ajouter :
```
# ── MCP Bible ───────────────────────────────────────────────────
MCP_BIBLE_URL=http://bible-mcp:7801
BIBLE_DB_PATH=/app/data/bible.db
BIBLE_HTTP_PORT=7801
OPENAI_EMBEDDING_MODEL=text-embedding-3-large
```

- [ ] **Step 5: `.env.development`**

Ajouter :
```
MCP_BIBLE_URL=http://localhost:7801
BIBLE_DB_PATH=../../data/bible/bible.db
OPENAI_EMBEDDING_MODEL=text-embedding-3-large
```

- [ ] **Step 6: Mettre à jour `env.ts`**

```typescript
// packages/api/src/env.ts (ajouts au schema Zod)
const Schema = z.object({
  // ... existants
  MCP_BIBLE_URL: z.string().url().optional(),
  // Les vars BIBLE_* et OPENAI_EMBEDDING_MODEL ne sont pas lues par l'api,
  // elles vivent côté bible-mcp. Pas besoin de les ajouter ici.
});
```

`MCP_BIBLE_URL` était déjà présent dans `env.test.ts`, vérifier que c'est bien aligné.

- [ ] **Step 7: Tests env**

Pas de nouveau test requis si le schema acceptait déjà `MCP_BIBLE_URL`. Sinon ajouter un cas.

- [ ] **Step 8: Setup dir pour dev local**

```bash
mkdir -p data/bible
cp /Users/recarnot/dev/barda-mcp-ecrivain-bible/data/bible.db data/bible/bible.db
cp /Users/recarnot/dev/barda-mcp-ecrivain-bible/data/bible.db-shm data/bible/ 2>/dev/null || true
cp /Users/recarnot/dev/barda-mcp-ecrivain-bible/data/bible.db-wal data/bible/ 2>/dev/null || true
```

Ajouter `data/bible/` au `.gitignore` (déjà fait pour `data/db/` et `data/workspace/` probablement).

```bash
grep -q "^data/bible" .gitignore || echo "data/bible/" >> .gitignore
```

- [ ] **Step 9: Validation manuelle**

```bash
# 1. Démarrer tout en Node pur
pnpm dev
```

Attendu :
- bible-mcp écoute sur `http://localhost:7801`
- api log `[api] bible-mcp ok (48 tools)`
- web accessible sur http://localhost:5173

```bash
# 2. Tester un chat qui déclenche un bible tool
# Login: http://localhost:5173/api/__e2e__/dev-login?email=romain.ecarnot@gmail.com
# Chat: "cherche bob dans la bible" → doit déclencher bible_search_fulltext ou search_semantic
```

- [ ] **Step 10: Commit**

```bash
git add Dockerfile.bible-mcp docker-compose.yml docker-compose.local.yml .env.example .env.development .gitignore packages/api/src/env.ts
git commit -m "feat(docker): add bible-mcp service + local-dev compose"
```

---

### Task 9: Cleanup final + CLAUDE.md + tests globaux

**Files:**
- Modify: `CLAUDE.md`
- Vérifications globales

- [ ] **Step 1: Mettre à jour `CLAUDE.md`**

Ajouter dans la section "Monorepo" :
```
| `@buck/bible-mcp` | Serveur MCP Bible (HTTP-only, embeddings OpenAI) | `src/server.ts` (port 7801) |
```

Ajouter dans "Commandes" si non déjà présent :
```
docker compose -f docker-compose.local.yml up -d bible-mcp   # dev hybride (bible en Docker, buck en pnpm dev)
```

Ajouter dans "Milestones" la ligne M4 comme terminée après merge.

- [ ] **Step 2: Full test suite**

```bash
pnpm test
```

Expected: ~240 tests (201 actuels + ~40 nouveaux), tous verts.

- [ ] **Step 3: Full typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 4: Full lint**

```bash
pnpm lint
```

Expected: pas plus d'erreurs qu'avant M4 (on connaît les 12 pré-existantes).

- [ ] **Step 5: Full build**

```bash
pnpm build
```

Expected: tous les packages se buildent.

- [ ] **Step 6: Verify no AI SDK remnants or dead code**

```bash
grep -rE "USER\.md|prompts/USER" packages/ docs/ --include="*.ts" --include="*.tsx" --include="*.md" 2>/dev/null | grep -v plans | grep -v specs
```

Expected: 0 match (tout nettoyé).

- [ ] **Step 7: Commit docs + final**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for M4 (bible-mcp package, local dev compose)"
```

- [ ] **Step 8: Push**

```bash
git push origin main
```

Expected: CI passe (tests + lint + build).

---

## Résumé attendu après M4

- Nouveau package `@buck/bible-mcp` (mode HTTP-only, embeddings OpenAI)
- Client MCP côté buck-api avec tool discovery + préfixe `bible_` + graceful degradation
- Endpoint `GET /api/mcp/bible/status` + banner UI persistant
- Prompts système déplacés vers `$WORKSPACE_DIR/systems/` avec hot-reload, USER.md supprimé
- Docker : service `bible-mcp` en prod + compose dev optionnel
- ~240 tests verts, typecheck + build clean

**Risques ouverts à surveiller post-merge :**
- Coût et latence des embeddings OpenAI lors d'un reindex complet (devrait rester < 0.01 $)
- Compatibilité DB upstream si Romain veut sync une future version du `barda-mcp-ecrivain-bible`
- Edge case : buck-api démarre avant bible-mcp en Docker → le health poll rattrape au bout de 30s max
