-- packages/api/supabase/migrations/20260418_0001_memory_schema.sql

-- Extensions (idempotent, runbook les crée mais on garantit)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Long-term memories (episodic + semantic; procedural enum réservé)
CREATE TABLE IF NOT EXISTS buck_memories (
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

CREATE INDEX IF NOT EXISTS idx_memories_type     ON buck_memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_memories_user     ON buck_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_metadata ON buck_memories USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_memories_embedding ON buck_memories
    USING hnsw (embedding halfvec_cosine_ops);

-- KV state (two-tier)
CREATE TABLE IF NOT EXISTS buck_state (
    user_id      UUID NOT NULL,
    tier         TEXT NOT NULL CHECK (tier IN ('static','context')),
    key          TEXT NOT NULL,
    value        JSONB NOT NULL,
    token_budget INT,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, key)
);

-- Edge-side usage tracking
CREATE TABLE IF NOT EXISTS buck_memory_usage (
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

CREATE INDEX IF NOT EXISTS idx_memory_usage_user_created
    ON buck_memory_usage(user_id, created_at);

-- RPC vector search (valide filter_type contre l'enum)
CREATE OR REPLACE FUNCTION match_memories(
    query_embedding halfvec(3072),
    match_threshold FLOAT,
    match_count     INT,
    filter_user_id  UUID,
    filter_type     TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    memory_type TEXT,
    metadata JSONB,
    importance FLOAT,
    similarity FLOAT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
    IF filter_type IS NOT NULL AND filter_type NOT IN ('episodic','semantic','procedural') THEN
        RAISE EXCEPTION 'invalid filter_type: %', filter_type
          USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT m.id, m.content, m.memory_type, m.metadata, m.importance,
           1 - (m.embedding <=> query_embedding) AS similarity,
           m.created_at
    FROM buck_memories m
    WHERE m.user_id = filter_user_id
      AND (filter_type IS NULL OR m.memory_type = filter_type)
      AND 1 - (m.embedding <=> query_embedding) > match_threshold
    ORDER BY m.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
