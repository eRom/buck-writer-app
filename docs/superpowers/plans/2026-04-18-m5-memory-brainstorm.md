# M5 Memory — Brainstorm

**Date** : 2026-04-18
**Source vision** : `docs/perso/Buck-Memory-Architecture.md` (Romain)
**Output** : `docs/superpowers/specs/2026-04-18-m5-memory-design.md`

## Contexte

Romain a produit un document de vision décrivant une "Supabase-Native Cognitive Engine" pour Buck : une architecture de mémoire multi-couches (court terme, structurée, épisodique, sémantique, procédurale) entièrement sur Supabase (pgvector + pg_cron + Edge Functions + RLS), avec un orchestrator côté Node sur le VPS.

Ce brainstorm raffine la vision en décisions concrètes avant rédaction de la spec M5.

## Pré-décisions (validées avant les Q&A)

- **Scope** : couche mémoire uniquement. SQLite existant (users, chat_sessions, messages, usage_events, user_settings) conservé intact pour M5. Pas de migration big-bang.
- **Vault Supabase** : utilisé pour `OPENAI_API_KEY` côté Edge Functions.
- **Embedding model** : `text-embedding-3-large` (3072 dim), cohérent avec `bible-mcp`. Nécessite `halfvec(3072)` pour index HNSW (limite `vector` = 2000 dim).
- **UUID** : `gen_random_uuid()` via `pgcrypto` (pas `uuid_generate_v4()` qui est obsolète côté Supabase).
- **Milestone** : ce sera **M5** (M4 = Bible MCP, déjà livré).

## Décisions clés (9 questions)

### Q1 — Ingestion : comment les mémoires se créent ?

**Choix : C — Hybride** (tool `remember()` + consolidation nocturne).

- A = Auto post-session (opaque, coût OpenAI récurrent) → rejeté
- B = Tool explicite seul (Buck peut oublier) → rejeté
- **C = Tool `remember(content, type, importance)` quand Buck juge important + job nocturne qui dédupe/fusionne/promeut**

### Q2 — Retrieval : comment Buck accède aux mémoires pendant le chat ?

**Choix : C — Hybride minimal** (auto + tool).

- A = Injection auto complète (gonfle chaque requête) → rejeté
- B = Tool `recall(query)` seul (risque trous de mémoire) → rejeté
- **C = Injection auto uniquement de `buck_state` (préférences + contexte actif) + tool `recall(query, type?)` pour sémantique/épisodique à la demande**

### Q3 — Court terme / Working Memory

**Choix : B — Pas de table Supabase dédiée.**

- A = Table `buck_sessions` séparée → rejeté (duplique session existante)
- **B = Fenêtre glissante sur `messages` SQLite (les N derniers messages = working memory, déjà dans le context OpenAI)**
- C = Scratchpad RAM côté Node → rejeté (YAGNI)

**Conséquence** : seulement deux tables Supabase (`buck_memories` + `buck_state`), plus `buck_memory_usage` utilitaire.

### Q4 — Multi-user ?

**Choix : Solo, une instance = un user.**

- Buck est pour un seul utilisateur par instance (client unique, potentiellement réplicable en nouvelles instances dédiées par client).
- Schéma multi-user-ready : `user_id UUID NOT NULL` présent partout, mais RLS non activée en M5. UUID fixe stocké dans `BUCK_USER_ID` (env).
- Le jour où on ouvre à du multi-user sur la même instance : ajouter RLS avec `auth.uid()`, zéro migration de schéma.

### Q5 — Consolidation nocturne : quoi consolider ?

**Choix : A + B** (decay = C reporté post-M5).

- **A = Promotion épisodique → sémantique** (LLM extrait des faits durables depuis les épisodes des derniers jours, crée des rows `semantic` avec `source_ids[]` pointant vers les épisodes).
- **B = Déduplication sémantique** (recherche vectorielle interne, si similarité > 0.92 → fusion `source_ids` + bump `importance`).
- C = Decay d'importance → post-M5 (on verra la forme des données d'abord).

### Q6 — Procedural memory dans M5 ?

**Choix : B — Hors scope M5, enum conservé.**

- Le type `procedural` reste dans l'enum `memory_type` (`episodic|semantic|procedural`) pour éviter migration future.
- Aucune ingestion/recall procedural implémentée en M5.
- `SYSTEM.md` + `RULES.md` continuent de driver le comportement Buck.
- **Noté dans gerber** (note id `f9b2bfd1-fe6d-482b-a1df-6fab87f95f6e`) pour reconsidération post-M5 (parser RULES.md en chunks embeddés ?).

### Q7 — Contenu de `buck_state` (KV injecté auto)

**Choix : A + contexte actif avec auto-compaction.**

Structure à deux tiers :
- **Tier 1 — statique** : préférences figées (`lang`, `tone`, `timezone`, `user_profile`). Pas de compaction, ~200 tokens max total.
- **Tier 2 — contexte** : contexte projet actif (`current_project`, `current_chapter`, `recent_focus`). Chaque row a un `token_budget` (ex: 300 tokens). Si dépassement lors d'un `set` → Edge Function `compact-state` résume à 60% du budget.

Garde-fou : soft limit (warn logs) + hard cap (truncate si compaction échoue).

### Q8 — Dégradation si Supabase est down

**Choix : C — Fail-soft avec signal UI.**

- Timeout court sur les calls Supabase (1.5s).
- Si fail : Buck répond sans mémoire, badge UI discret "⚠ mémoire indisponible" (via SSE event `memory_status`) + log serveur.
- Le tool `remember()` buffer les rows en RAM (Map, cap 100, FIFO) et retry toutes les 30s au succès.

### Q9 — Tracking des coûts OpenAI

**Choix : C — Hybride.**

- **Embeddings (côté Node, synchrone)** → `usage_events` SQLite, vu par le budget guard M2.
- **Consolidation + compaction (côté Edge, asynchrone)** → table Supabase `buck_memory_usage`, rapatriée toutes les 6h dans `usage_events` SQLite par un cron Node.
- Nouveaux `kind` dans `usage_events` : `memory_embedding`, `memory_consolidation`, `memory_compaction`.

## Fidélité à la vision originale

La spec M5 :
- **Respecte** les 5 couches conceptuelles de la vision (même si court terme + procedural sont dégradés/reportés).
- **Respecte** les choix technologiques : Supabase, pgvector, pg_cron, Edge Functions, RLS-ready.
- **Raffine** la vision sur : modèle embedding (large > small), type vectoriel (halfvec), idioms UUID (gen_random_uuid), mécaniques d'erreur (fail-soft explicite), tracking (dual SQLite + Supabase).
- **Restreint** le scope pour livrer un MVP : procedural hors scope, decay reporté, RLS reportée, working memory non persistée.

## Principes retenus

1. **Module portable** : `services/memory/` est isolé (3 points d'entrée publics), réutilisable hors Buck.
2. **YAGNI** : pas de table pour ce que SQLite fait déjà (working memory).
3. **Fail-soft > fail-hard** : Buck reste utilisable si Supabase tombe.
4. **Feature flag** : `MEMORY_ENABLED` permet rollback instant.
5. **Observabilité avant features** : logs structurés namespace `memory:*`, panneau Settings Memory health reporté post-M5.
