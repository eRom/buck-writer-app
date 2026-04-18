# 🧠 Buck Memory Architecture

## La Vision : "Supabase-Native Cognitive Engine"

Une architecture élégante, sans friction, conçue pour un Agent IA Textuel (Buck). Cette architecture délègue 100% de la complexité de stockage et de recherche à **Supabase** (PostgreSQL managé), pendant que votre application (Node.js/Docker) tourne sereinement sur votre VPS Hostinger.

L'objectif : **Zéro maintenance base de données, 100% de performances cognitives.**

---

## 1. Pourquoi Supabase répond parfaitement aux 5 couches de mémoire

Plutôt que d'empiler des bases de données différentes (Redis + VectorDB + SQL), Supabase unifie l'ensemble grâce aux extensions PostgreSQL :

1. **Court Terme (⚡ Working Memory)** : Gérée dans une table SQL standard (ou via le State en mémoire de l'app Docker). Les suppressions automatiques sont gérées par **pg_cron** ou une requête de nettoyage en fin de session.
2. **Structurée (⚙️ Clé-Valeur)** : Le format natif **JSONB** de Postgres indexé (GIN) est imbattable pour stocker l'état, les préférences ou des variables de contexte.
3. **Épisodique (📅 Historique)** : Une table classique avec timestamp `created_at`. Postgres excelle dans les requêtes de séries temporelles ("Que s'est-il passé hier ?").
4. **Sémantique (🧠 Connaissances vectorielles)** : L'extension **`pgvector`** intégrée permet de chercher les faits par similarité cosinus directement dans le SQL.
5. **Procédurale (🛠️ Workflows)** : Les instructions/prompts combinés avec des embeddings pour que l'agent sache *quel* outil utiliser face à une situation donnée.

---

## 2. Le Schéma de Base de Données (Supabase SQL)

Ce schéma est optimisé pour être déployé directement via l'éditeur SQL de Supabase.

```sql
-- 1. Activer l'extension Vectorielle
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. La Table Cognitive Unifiée (Long Terme)
-- Héberge l'Épisodique, Sémantique et Procédural
CREATE TABLE buck_memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- Pour un futur multi-user
    memory_type TEXT NOT NULL CHECK (memory_type IN ('episodic', 'semantic', 'procedural')),
    
    content TEXT NOT NULL,
    embedding VECTOR(1536), -- Dimension OpenAI text-embedding-3-small
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Mécaniques cognitives
    importance FLOAT DEFAULT 0.5 CHECK (importance BETWEEN 0 AND 1),
    access_count INT DEFAULT 0,
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Pour la consolidation (Lien Sémantique -> Épisodes)
    source_ids UUID[] DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour la performance (Supabase scale avec ça)
CREATE INDEX idx_memories_type ON buck_memories(memory_type);
CREATE INDEX idx_memories_user ON buck_memories(user_id);
CREATE INDEX idx_memories_metadata ON buck_memories USING GIN (metadata);
-- Index HNSW pour des recherches vectorielles ultra-rapides
CREATE INDEX idx_memories_embedding ON buck_memories USING hnsw (embedding vector_l2_ops);

-- 3. La Table Session (Court Terme / Working Memory)
CREATE TABLE buck_sessions (
    session_id TEXT PRIMARY KEY,
    user_id UUID NOT NULL,
    context_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. L'État Structuré (KV Store)
CREATE TABLE buck_state (
    user_id UUID NOT NULL,
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, key)
);
```

---

## 3. Le Moteur de Consolidation : Supabase Edge Functions + pg_cron

La "Consolidation" est le moment où Buck réfléchit à ce qui s'est passé (Épisodique) pour en tirer des leçons persistantes (Sémantique).

**Comment faire de manière propre ?**
Au lieu d'alourdir le VPS avec cette tâche, on utilise l'infrastructure Serverless de Supabase.

1. On crée une **Edge Function** Supabase `consolidate-memory`.
2. On utilise **pg_cron** (disponible dans Supabase) pour déclencher cette fonction (ex: tous les jours à 3h du matin, ou après inactivité).

```sql
-- Activer pg_cron sur Supabase
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Déclencher un webhook vers l'Edge Function tous les jours à 3h
SELECT cron.schedule(
  'nightly_consolidation',
  '0 3 * * *',
  $$
    SELECT net.http_post(
        url:='https://[PROJET_ID].supabase.co/functions/v1/consolidate-memory',
        headers:='{"Authorization": "Bearer [SERVICE_ROLE_KEY]"}'::jsonb
    );
  $$
);
```

*Résultat : Buck apprend "pendant son sommeil", sans consommer de ressources sur votre VPS principal.*

---

## 4. Flux de Requête : Le "Retrieval Orchestrator" dans le VPS

Votre application Node.js (qui tourne sur le Docker Hostinger) contient l'intelligence d'orchestration.

Quand l'utilisateur envoie un message, l'app Node.js effectue un "Parallel Fetch" via le SDK Supabase JS (`@supabase/supabase-js`) :

```typescript
// Exemple conceptuel de l'orchestrateur Node.js
async function buildAgentContext(userId: string, query: string, queryEmbedding: number[]) {
  const [session, state, relevantMemories, recentEpisodes] = await Promise.all([
    
    // 1. Court Terme (Actif)
    supabase.from('buck_sessions').select('*').eq('user_id', userId).single(),
    
    // 2. Structuré (Préférences)
    supabase.from('buck_state').select('*').eq('user_id', userId),
    
    // 3. Sémantique (Vector Search via RPC function sur Supabase)
    supabase.rpc('match_memories', { 
      query_embedding: queryEmbedding, 
      match_threshold: 0.7, 
      match_count: 5,
      filter_type: 'semantic'
    }),

    // 4. Épisodique (Historique récent)
    supabase.from('buck_memories')
      .select('content, created_at')
      .eq('memory_type', 'episodic')
      .order('created_at', { ascending: false })
      .limit(10)
  ]);

  // Merge & Format pour le prompt OpenAI...
  return formatForLLM(session, state, relevantMemories, recentEpisodes);
}
```

*Note : La recherche vectorielle nécessite une fonction RPC simple à ajouter dans Supabase, permettant le calcul cosinus depuis le SDK JS.*

---

## 5. Pourquoi cette architecture est le "Sweet Spot" absolu

1. **Extrêmement Rapide** : Les requêtes (même vectorielles via HNSW) sur Supabase prennent quelques millisecondes. Votre VPS n'a qu'à faire des requêtes HTTP (via le SDK).
2. **0% Maintenance** : Pas de Redis à monitorer, pas de PgBouncer à configurer, pas de RAM à ajuster. Supabase gère le compute de la DB.
3. **RAM Libérée** : Votre VPS de 8 GB RAM est 100% dédié à la logique métier (Node.js). C'est gigantesque pour une simple API de chat.
4. **Évolution Facile** : Si le projet décolle, Supabase "scale up" en 1 clic. Le code Node.js reste inchangé.
5. **Sécurité (RLS)** : Grâce au Row Level Security de Supabase, même si votre API Node.js est compromise, les règles au niveau de la DB garantissent que l'User A ne verra jamais la mémoire de l'User B.
