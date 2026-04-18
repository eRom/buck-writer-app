# M5 — Memory Layer (Supabase Cognitive Engine)

**Status** : draft, pending user review
**Date** : 2026-04-18
**Scope** : milestone M5 (Memory)
**Depends on** : M0 (auth, SQLite, users), M1 (chat + tools), M2 (usage_events + budget), M4 (déjà livré : bible-mcp)

---

## 1. Vision

Dotter Buck d'une mémoire persistante multi-couches, entièrement hébergée sur Supabase (Postgres managé + pgvector + Edge Functions + pg_cron). Le VPS reste l'orchestrateur ; Supabase encapsule stockage, recherche vectorielle et jobs de consolidation.

Le module `memory/` est conçu pour être **portable** : zéro couplage avec Buck au-delà du chat route qui l'appelle, API minimale (`buildContext`, tool `recall`, tool `remember`), deps = `@supabase/supabase-js` + `openai`.

## 2. Scope M5

**Dedans** :
- Deux tables Supabase : `buck_memories` (long terme, `episodic` + `semantic`) + `buck_state` (KV deux tiers).
- Une table utilitaire `buck_memory_usage` pour coûts Edge-side.
- Ingestion hybride : tool `remember(content, type, importance)` appelé par Buck + job nocturne `consolidate-memory`.
- Retrieval hybride : injection auto de `buck_state` dans le system prompt + tool `recall(query, type?, count?)`.
- Consolidation nocturne (`consolidate-memory`) : promotion épisodique → sémantique + déduplication vectorielle des sémantiques.
- Compaction on-demand (`compact-state`) pour les valeurs du tier `context` qui dépassent leur `token_budget`.
- Tracking des coûts : embeddings + recall côté Node dans `usage_events` SQLite ; consolidation + compaction côté Edge dans `buck_memory_usage` Supabase, rapatriés périodiquement dans `usage_events`.
- Dégradation gracieuse : timeout 1.5s, fail-soft, badge UI "mémoire indisponible", `retryBuffer` en RAM pour les `remember` qui échouent.
- Feature flag `MEMORY_ENABLED` pour rollout/rollback instant.

**Dehors** (reporté) :
- Type `procedural` (enum présent, pas d'usage MVP). Note gerber créée.
- Decay d'importance / purge automatique basée sur `access_count` (M5+).
- Multi-user / RLS Supabase Auth (aujourd'hui : une instance = un user, `user_id` fixe).
- Working memory côté Supabase : remplacée par la fenêtre glissante sur `messages` SQLite existants.
- Panneau Settings "Memory health" (schéma prêt, UI plus tard).

## 3. Décisions clés (brainstorming)

| # | Question | Choix |
|---|---|---|
| 1 | Ingestion | Hybride : tool `remember()` + consolidation nocturne |
| 2 | Retrieval | Injection auto `buck_state` + tool `recall` |
| 3 | Working memory | Fenêtre `messages` SQLite, pas de table Supabase |
| 4 | Multi-user | Solo par instance. `user_id` UUID figé dans `.env` |
| 5 | Consolidation | Promotion épisodique → sémantique + dédup (decay plus tard) |
| 6 | Procedural | Hors scope M5, enum conservé |
| 7 | `buck_state` | Tier 1 statique + tier 2 contexte avec auto-compaction |
| 8 | Dégradation Supabase | Fail-soft avec signal UI + retry buffer |
| 9 | Tracking coûts | `usage_events` SQLite pour embeddings ; `buck_memory_usage` Supabase pour Edge, rapatrié |

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  VPS Hostinger (Docker)                                             │
│                                                                     │
│  @buck/api (Node / Hono)                                            │
│                                                                     │
│  services/memory/                                                   │
│  ├─ memoryOrchestrator.ts   (buildContext — parallel fetch)        │
│  ├─ embeddings.ts           (OpenAI embed + usage_events insert)    │
│  ├─ remember.ts             (insert + in-RAM retry buffer)          │
│  ├─ recall.ts               (RPC match_memories + bump access)     │
│  ├─ state.ts                (KV get/set + compaction trigger)       │
│  └─ supabaseClient.ts       (singleton + service_role key)          │
│                                                                     │
│  Chat route injecte preferences + activeContext + tools recall/    │
│  remember dans chaque request OpenAI.                               │
│                                                                     │
│  SQLite (inchangé): users, chat_sessions, messages, usage_events   │
└─────────────────────────────────────────────────────────────────────┘
                         │ HTTPS via @supabase/supabase-js
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Supabase (projet zconxtmchptchlmeqstu)                             │
│                                                                     │
│  Tables:  buck_memories       (halfvec(3072) + HNSW)                │
│           buck_state          (KV two-tier, token_budget)           │
│           buck_memory_usage   (coûts Edge-side)                     │
│                                                                     │
│  Extensions: vector, pgcrypto, pg_cron, pg_net                      │
│  Vault: OPENAI_API_KEY, EDGE_INVOKE_KEY                             │
│                                                                     │
│  RPC: match_memories(embedding, threshold, count, user, type?)     │
│                                                                     │
│  Edge Functions (Deno):                                             │
│    • consolidate-memory — nightly @ 3h via pg_cron                  │
│    • compact-state      — on-demand (value > token_budget)          │
└─────────────────────────────────────────────────────────────────────┘
```

Frontières et contrats :

- Chat route → `memory/` : 3 points d'entrée publics (`buildContext`, tool `recall`, tool `remember`).
- `memory/` → Supabase : client `@supabase/supabase-js` avec `service_role` (pas de user JWT, solo par instance).
- `memory/` → OpenAI : uniquement pour les embeddings (model `text-embedding-3-large`). Le LLM de chat reste invoqué par le chat route.
- Edge Functions → OpenAI : utilisent la clé stockée dans Supabase Vault, indépendamment de la clé `.env` du Node.
- Aucun import inverse : `services/memory/` n'importe rien depuis `routes/` ou les tables `chat_sessions`/`messages`.

## 5. Schéma Supabase

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Long-term memory
CREATE TABLE buck_memories (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL,
    memory_type      TEXT NOT NULL CHECK (memory_type IN ('episodic','semantic','procedural')),
    content          TEXT NOT NULL,
    embedding        halfvec(3072),
    metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
    importance       FLOAT NOT NULL DEFAULT 0.5 CHECK (importance BETWEEN 0 AND 1),
    access_count     INT NOT NULL DEFAULT 0,
    last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_ids       UUID[] NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_memories_type      ON buck_memories(memory_type);
CREATE INDEX idx_memories_user      ON buck_memories(user_id);
CREATE INDEX idx_memories_metadata  ON buck_memories USING GIN (metadata);
CREATE INDEX idx_memories_embedding ON buck_memories
    USING hnsw (embedding halfvec_cosine_ops);

-- KV state (two-tier)
CREATE TABLE buck_state (
    user_id      UUID NOT NULL,
    tier         TEXT NOT NULL CHECK (tier IN ('static','context')),
    key          TEXT NOT NULL,
    value        JSONB NOT NULL,
    token_budget INT,          -- NULL si tier=static
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, key)
);

-- Usage tracking (Edge-side costs)
CREATE TABLE buck_memory_usage (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL,
    kind           TEXT NOT NULL,
    model          TEXT NOT NULL,
    prompt_tok     INT NOT NULL DEFAULT 0,
    completion_tok INT NOT NULL DEFAULT 0,
    cost_usd       NUMERIC(10,6) NOT NULL DEFAULT 0,
    metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vector search RPC
CREATE OR REPLACE FUNCTION match_memories(
    query_embedding halfvec(3072),
    match_threshold FLOAT,
    match_count     INT,
    filter_user_id  UUID,
    filter_type     TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID, content TEXT, memory_type TEXT, metadata JSONB,
    importance FLOAT, similarity FLOAT, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
    SELECT m.id, m.content, m.memory_type, m.metadata, m.importance,
           1 - (m.embedding <=> query_embedding) AS similarity,
           m.created_at
    FROM buck_memories m
    WHERE m.user_id = filter_user_id
      AND (filter_type IS NULL OR m.memory_type = filter_type)
      AND 1 - (m.embedding <=> query_embedding) > match_threshold
    ORDER BY m.embedding <=> query_embedding
    LIMIT match_count;
$$;
```

Notes :

- `halfvec(3072)` (demi-précision) permet de monter un index HNSW sur 3072 dimensions (la limite par défaut du type `vector` est 2000). Impact précision négligeable pour cosine similarity dans ce contexte.
- Pas de RLS en M5. `filter_user_id` dans la RPC sert de guard logique (le jour où on active Supabase Auth, on pourra le remplacer par `auth.uid()` sans toucher au Node).
- `buck_state.token_budget` n'a de sens que pour `tier='context'`.

## 6. Module `services/memory/`

### 6.1 Contrat public

```typescript
// services/memory/index.ts
export interface MemoryContext {
  preferences: Record<string, unknown>;   // tier static, KV
  activeContext: Record<string, string>;  // tier context, valeurs déjà compactées
  degraded: boolean;
}

export async function buildMemoryContext(userId: string): Promise<MemoryContext>;

export const recallTool = {
  name: 'recall',
  description: 'Retrieve relevant memories by semantic similarity',
  schema: z.object({
    query: z.string(),
    type: z.enum(['episodic', 'semantic']).optional(),
    count: z.number().int().min(1).max(20).default(5),
  }),
  execute: (input, ctx) => Promise<RecallResult[]>,
};

export const rememberTool = {
  name: 'remember',
  description: 'Persist a durable fact or episode',
  schema: z.object({
    content: z.string().min(1).max(2000),
    type: z.enum(['episodic', 'semantic']),
    importance: z.number().min(0).max(1).default(0.5),
    metadata: z.record(z.unknown()).optional(),
  }),
  execute: (input, ctx) => Promise<{ ok: true; id?: string; deferred?: boolean }>,
};
```

### 6.2 Fichiers et responsabilités

| Fichier | Rôle | Lignes (cible) |
|---|---|---|
| `supabaseClient.ts` | Singleton client `service_role`, timeout 1.5s configuré | ~30 |
| `embeddings.ts` | `embedText(text) → halfvec + usage tracking SQLite` | ~60 |
| `memoryOrchestrator.ts` | `buildMemoryContext` — parallel allSettled, détection `degraded` | ~80 |
| `remember.ts` | `rememberTool` + `retryBuffer` (Map, cap 100, FIFO) + drain 30s | ~120 |
| `recall.ts` | `recallTool` + bump async `access_count` | ~80 |
| `state.ts` | `get/set`, vérifie `token_budget`, call `compact-state` | ~100 |
| `index.ts` | re-exports publics | ~15 |

### 6.3 Fail-soft & retry buffer

```typescript
// remember.ts — esquisse
const retryBuffer = new Map<string, RememberPayload>();  // key = uuid v4

async function remember(payload): Promise<{ ok: true; id?: string; deferred?: boolean }> {
  try {
    const emb = await embedText(payload.content);         // usage_events insert here
    const { data } = await supabase.from('buck_memories').insert({
      user_id: USER_ID, ...payload, embedding: emb,
    }).select('id').single().abortSignal(AbortSignal.timeout(1500));
    return { ok: true, id: data.id };
  } catch (err) {
    logger.warn({ err }, 'memory:remember failed, buffering');
    if (retryBuffer.size >= 100) {
      const oldest = retryBuffer.keys().next().value;
      retryBuffer.delete(oldest);
    }
    retryBuffer.set(randomUUID(), payload);
    return { ok: true, deferred: true };
  }
}

// drain every 30s
setInterval(drainRetryBuffer, 30_000);
```

### 6.4 Flux `buildMemoryContext`

```typescript
export async function buildMemoryContext(userId: string): Promise<MemoryContext> {
  const controller = AbortSignal.timeout(1500);
  const [staticRes, contextRes] = await Promise.allSettled([
    supabase.from('buck_state').select('key, value').eq('user_id', userId).eq('tier', 'static').abortSignal(controller),
    supabase.from('buck_state').select('key, value').eq('user_id', userId).eq('tier', 'context').abortSignal(controller),
  ]);

  const degraded = staticRes.status === 'rejected' || contextRes.status === 'rejected';
  if (degraded) {
    logger.warn({ staticRes, contextRes }, 'memory:orchestrator degraded');
    return { preferences: {}, activeContext: {}, degraded: true };
  }

  return {
    preferences: toKV(staticRes.value.data),
    activeContext: toKV(contextRes.value.data),
    degraded: false,
  };
}
```

Le chat route utilise `degraded` pour émettre un SSE event `memory_status` au tout début du stream.

## 7. Intégration chat route

Modifs dans `packages/api/src/routes/chat.ts` (ou équivalent) :

1. Au début du handler, appeler `buildMemoryContext(USER_ID)`.
2. Construire le system prompt :
   ```
   <base>SYSTEM.md + RULES.md (existant)</base>
   <preferences>{{JSON preferences}}</preferences>
   <active_context>{{JSON activeContext}}</active_context>
   ```
3. Ajouter `recallTool` et `rememberTool` à l'array `tools` passé à OpenAI, **uniquement si** `MEMORY_ENABLED=true`.
4. Si `degraded`, émettre en premier un SSE `{ event: 'memory_status', data: { degraded: true } }`.
5. Le reste du pipeline (streaming, usage tracking existant, budget guard M2) est inchangé.

Côté web (`packages/web`) :

- Écouter l'event SSE `memory_status`.
- Afficher un badge discret dans la status bar : `⚠ mémoire indisponible`. Disparaît au chat suivant si plus de signal.
- Pas de setting UI spécifique en M5. Le flag côté env suffit.

## 8. Edge Functions

### 8.1 `consolidate-memory` (nightly)

Trigger : `pg_cron` via `net.http_post` vers l'URL publique de la fonction, `Authorization: Bearer <EDGE_INVOKE_KEY>`.

Pseudo-algo :

1. Fetch épisodes `memory_type='episodic'`, `created_at >= NOW() - INTERVAL '7 days'`, non référencés dans `source_ids` d'un `semantic`. Skip si < 3.
2. Appel `gpt-4o-mini` avec prompt de consolidation (see `supabase/functions/consolidate-memory/prompts.ts`), `response_format: json_schema`. Récupère un array de `{ content, importance, source_ids: [uuid] }`.
3. Pour chaque fact :
   - Embed via OpenAI.
   - Dedup : `match_memories(embedding, threshold=0.92, count=1, filter_type='semantic')`.
   - Si match : UPDATE `source_ids` append + `importance` += 0.05 (clamp 1).
   - Sinon : INSERT `semantic`.
4. INSERT `buck_memory_usage` (kind=`consolidation`, modèle, tokens, coût).

Prompt de consolidation (esquisse, à affiner en impl) :

> Analyze these chat episodes and extract durable facts worth remembering long-term (user preferences, project context, explicit decisions). Ignore small-talk, ephemeral state, and one-off questions. Return at most 10 facts. Each fact links to the source episode IDs.

### 8.2 `compact-state` (on-demand)

Trigger : appel HTTP depuis `services/memory/state.ts` quand un set dépasse `token_budget`.

Body : `{ user_id, key, current_value, token_budget }`.
Processus : appel `gpt-4o-mini` avec prompt "summarize in ≤ `budget*0.6` tokens, keep actionable info".
Retour : `{ compacted_value }`.
Le Node fait l'UPDATE + insert `buck_memory_usage` (kind=`compaction`).

### 8.3 Secrets (Supabase Vault)

- `OPENAI_API_KEY` — accédée par les deux Edge Functions.
- `EDGE_INVOKE_KEY` — utilisée par `pg_cron` pour appeler `consolidate-memory`.

Créés une fois manuellement via l'UI Vault (`https://supabase.com/dashboard/project/zconxtmchptchlmeqstu/integrations/vault/overview`).

## 9. Tracking des coûts

**Côté Node** (synchrone) :
- Chaque appel `embedText` insère une row `usage_events` avec `kind: 'memory_embedding'`, `tokens`, `cost_usd`.
- Budget guard M2 voit ces lignes et peut déclencher les alertes existantes.

**Côté Edge** (asynchrone) :
- `consolidate-memory` et `compact-state` insèrent `buck_memory_usage`.
- Un cron Node (ajouter `services/memory/usageSync.ts`, interval 6h) :
  1. SELECT `buck_memory_usage` WHERE `created_at > last_sync`.
  2. Pour chaque row, INSERT `usage_events` SQLite avec `kind: 'memory_consolidation'` ou `memory_compaction`.
  3. UPDATE `user_settings.memory_usage_sync_cursor = NOW()`.

Ajouter une colonne `memory_usage_sync_cursor TIMESTAMPTZ` à `user_settings` via migration Drizzle.

## 10. Stratégie de tests

**Unit (Vitest)** dans `packages/api/src/services/memory/` :

| Fichier | Ce qui est testé |
|---|---|
| `memoryOrchestrator.test.ts` | parallel fetch OK, Supabase KO → `degraded=true` sans throw, timeout respecté |
| `embeddings.test.ts` | embed → row `usage_events` insérée, model + tokens corrects |
| `remember.test.ts` | insert OK ; insert fail → row dans buffer ; buffer FIFO ; buffer cap 100 ; drain vide le buffer au succès |
| `recall.test.ts` | RPC call avec threshold/count par défaut ; bump `access_count` appelé en async, n'impacte pas le retour |
| `state.test.ts` | set sous budget : pas de compact ; set above budget : appel `compact-state` + UPDATE |

Tous les tests mockent Supabase et OpenAI. `pnpm test` doit passer sans credentials.

**Integration** :
- Projet Supabase dédié tests (ou préfixe `buck_test_*` dans le projet existant).
- Migrations rejouées avant chaque run.
- Happy path : `remember()` → `recall()` sur même concept retourne `similarity > 0.7`.
- Edge case : 100 facts proches → `recall(count=5)` retourne les 5 plus similaires, pas de duplicate.
- Exécutés en CI uniquement, gated par env var `MEMORY_INTEGRATION_TESTS=1`.

**E2E (Playwright)** :
- `memory.spec.ts` : user "souviens-toi X", nouvelle session, user "qu'est-ce que tu sais sur X ?", assert mention dans réponse.
- Gated par présence des secrets Supabase dans CI.

## 11. Erreurs (synthèse)

| Scénario | Comportement | Visible user ? |
|---|---|---|
| Supabase unreachable (timeout 1.5s) | `buildContext` → `{ preferences: {}, activeContext: {}, degraded: true }` | Oui, badge SSE `memory_status` |
| `recall` fail | Tool retourne `{ error: 'memory_unavailable' }` au LLM | Non (Buck s'adapte) |
| `remember` fail | Push `retryBuffer`, tool retourne `{ ok: true, deferred: true }` | Non |
| Embedding OpenAI fail | Tool fail path pour `recall`/`remember` | Non |
| Consolidation crash | Log + row `buck_memory_usage` avec `metadata.error` ; retry au prochain cron | Non (admin-only) |
| Compaction LLM fail | Hard truncate à `token_budget` côté Node + log warn | Non |
| `retryBuffer` full (100) | Drop oldest + log warn | Non |

## 12. Migration & rollout

1. **Supabase provisioning (manuel, one-shot)** :
   - Activer extensions (`vector`, `pgcrypto`, `pg_cron`, `pg_net`).
   - Créer secrets Vault : `OPENAI_API_KEY`, `EDGE_INVOKE_KEY`.
   - Choisir un UUID fixe pour Romain → `BUCK_USER_ID=<uuid>` dans `.env`.

2. **Migrations SQL Supabase** :
   - Nouveau dossier `packages/api/supabase/migrations/` (distinct des migrations Drizzle SQLite).
   - Versionnées `YYYYMMDDHHMM_*.sql`.
   - Appliquées via `supabase db push` (ou MCP `apply_migration` pour dev).

3. **Migration Drizzle SQLite** : ajouter `memory_usage_sync_cursor` à `user_settings`.

4. **Seed `buck_state`** : script `scripts/seed-memory-defaults.ts` :
   - `tier=static` : `lang=fr`, `tone=trinity`, `timezone=Europe/Paris`, `user_profile={ name: 'Romain', role: 'founder' }`.
   - Idempotent (upsert).

5. **Edge Functions deploy** : `supabase functions deploy consolidate-memory compact-state`.

6. **Cron pg_cron** : SQL one-shot pour scheduler `nightly_consolidation` @ `0 3 * * *`.

7. **Feature flag `MEMORY_ENABLED`** :
   - `false` par défaut → orchestrateur no-op, tools non exposés, chat inchangé.
   - Bascule `true` après vérifs manuelles (seed OK, Edge Functions répondent, recall round-trip testé).

8. **Dockerfile** : `@supabase/supabase-js` ajouté aux deps (déjà en workspace-prune).

## 13. Observabilité

- Pino logger, namespace `memory:*` :
  - `memory:orchestrator` — latency `buildContext`, `degraded`.
  - `memory:recall` — count hits, latency.
  - `memory:remember` — success/defer ratio, buffer size.
  - `memory:state` — compactions déclenchées.
- Metrics (sans outil externe en M5) : simple logging structuré.
- Panneau Settings "Memory health" : out of scope M5.

## 14. Variables d'env (additions)

```
# .env (additions)
SUPABASE_URL=https://zconxtmchptchlmeqstu.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
BUCK_USER_ID=<uuid fixe>
MEMORY_ENABLED=false
OPENAI_EMBEDDING_MODEL=text-embedding-3-large
```

## 15. Critères de succès (go/no-go M5)

- [ ] Tables + RPC + Edge Functions déployées sur Supabase.
- [ ] `pnpm test` vert avec mocks (sans Supabase creds).
- [ ] Integration tests passent contre projet Supabase de test.
- [ ] E2E Playwright : mémoire round-trip OK.
- [ ] `MEMORY_ENABLED=true` : chat fonctionne identique à avant + Buck peut `remember()`/`recall()`.
- [ ] `MEMORY_ENABLED=false` : chat strictement identique à avant M5.
- [ ] Supabase coupé volontairement : chat continue, badge `degraded` visible, `retryBuffer` non-vide, logs `memory:orchestrator degraded`.
- [ ] Première consolidation nocturne exécutée : au moins 1 row `semantic` créée, `buck_memory_usage` insérée.
- [ ] Usage embeddings visible dans la page Settings M2 (budget guard).

## 16. Hors scope, à reprendre plus tard

- Decay d'importance + purge automatique.
- Type `procedural` (note gerber `f9b2bfd1-fe6d-482b-a1df-6fab87f95f6e`).
- Panneau Settings "Memory health" (schéma ready, UI later).
- Multi-user + RLS (instance-per-client OK en attendant).
- RAG sur documents longs (workspace files → embeddings) — séparé de la mémoire cognitive.
