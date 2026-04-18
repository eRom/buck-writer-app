# M5 Memory — Go/No-Go Checklist

Avant d'activer `MEMORY_ENABLED=true` en production, valider chaque item ci-dessous.
Référence : `docs/superpowers/plans/2026-04-18-m5-memory.md` — Task 23.

## Infrastructure Supabase

- [x] Migrations Supabase appliquées : `buck_memories`, `buck_state`, `buck_memory_usage`, RPC `match_memories`, schedule `pg_cron`.
- [x] Edge Functions `consolidate-memory` et `compact-state` déployées (retournent 401 sans bearer).
- [x] Seed `buck_state` tier `static` exécuté (4 keys : `lang`, `tone`, `timezone`, `user_profile`).

## Backend Buck

- [x] Drizzle migration `memory_usage_sync_cursor` appliquée.
- [x] `pnpm test` vert sur tous les packages (243/243 côté API).
- [x] `pnpm typecheck` vert.
- [x] Module `services/memory/` câblé dans la route chat avec feature flag `MEMORY_ENABLED`.

## Tests E2E / Régression

- [ ] E2E `memory.spec.ts` PASS avec `MEMORY_E2E=1` (nécessite serveur lancé + secrets).
- [ ] `MEMORY_ENABLED=false` : chat strictement identique à avant M5 (régression manuelle sur une conversation).
- [ ] `MEMORY_ENABLED=true` : Buck peut appeler `remember` et `recall` ; badge `degraded` apparaît si Supabase coupé (tester en mettant `SUPABASE_URL` invalide 30s).

## Observabilité

- [ ] Usage `memory_embedding` visible dans Settings budget après premier `remember`.
- [ ] Une première consolidation nocturne réussie (ou forcée manuellement via curl) : au moins une row `semantic` créée si épisodes suffisants.

## Rollout

- [ ] Bump `MEMORY_ENABLED=true` commité, image Docker déployée, vérif en prod.
