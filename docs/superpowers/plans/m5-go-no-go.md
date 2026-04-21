# M5 Memory — Go/No-Go Checklist

Avant d'activer `MEMORY_ENABLED=true` en production, valider chaque item ci-dessous.
Référence : `docs/superpowers/plans/2026-04-18-m5-memory.md` — Task 23.

## Infrastructure Supabase

- [x] Migrations Supabase appliquées : `buck_memories`, `buck_state`, `buck_memory_usage`, RPC `match_memories`, schedule `pg_cron`.
- [x] Edge Functions `consolidate-memory` et `compact-state` déployées (retournent 401 sans bearer).
- [x] Seed `buck_state` tier `static` exécuté (4 keys : `lang`, `tone`, `timezone`, `user_profile`).
- [x] Smoke test vector stack : insert halfvec(3072) + `match_memories` round-trip similarity=1.0, validation enum `filter_type` lève `22023` (vérifié 2026-04-18 via MCP).

## Backend Buck

- [x] Drizzle migration `memory_usage_sync_cursor` appliquée.
- [x] `pnpm test` vert sur tous les packages (359/359 côté API au 2026-04-21).
- [x] `pnpm typecheck` vert.
- [x] Module `services/memory/` câblé dans la route chat avec feature flag `MEMORY_ENABLED`.

## Tests E2E / Régression

- [x] E2E `memory.spec.ts` PASS avec `MEMORY_E2E=1` (validé 2026-04-21, round-trip remember→recall en 8-10s, row `buck_memories` créée par scope `BUCK_USER_ID`, tool_meta `recall` visible). Dev server sur `:5173`, `PUBLIC_BASE_URL` aligné, `MEMORY_RECALL_THRESHOLD=0.5` (commit `cac5920`).
- [x] `MEMORY_ENABLED=false` : validé par revue code (`chat.ts:289` gate `memory?.enabled`, `bootstrap.ts:34` retourne `makeDisabled()` avec `enabled=false`) + tests unitaires (359/359).
- [x] `MEMORY_ENABLED=true` : Buck peut appeler `remember` et `recall` (confirmé E2E). Badge `degraded` validé par revue code + tests existants (`chat.test.ts:289` émission SSE `memory_status`, `memoryOrchestrator.test.ts:33,52` fail-soft sur timeout + error Supabase, `memory-badge.tsx` consomme via zustand).

## Observabilité

- [x] Usage `memory_embedding` visible dans Settings budget après premier `remember` (bug corrigé en route — `insertUsageEvent` propage `kind`, `byKind.memory` exposé côté API, ligne UI dans `budget-section.tsx`, commit `01cfcfd`).
- [~] Consolidation nocturne Edge Function : path nominal validé 2026-04-21 (401 sans bearer, 200 `"skipped: only N episodes"` sur path court). **Gap** : 500 quand ≥3 episodes injectés (path LLM + upsert). À investiguer (probablement secret Vault manquant ou format JSON OpenAI) — ne bloque pas M5 car pg_cron retry nightly et fail-soft sur crash. `compact-state` 500 également sur payload bien formé — idem.

## Rollout

- [x] Bump `MEMORY_ENABLED=true` commité, image Docker déployée, vérif en prod (2026-04-21 ~12:18 CEST). Smoke test sur buck.romain-ecarnot.com : session A `Souviens-toi que mon projet s'appelle Buck Writer...` → Buck confirme + 2 rows `buck_memories` créées (user `3c2245f3-...`, memory_type `semantic`, importance 0.9). Session B nouvelle : `Quel est le deadline...` → Buck rappelle correctement « fin juin 2026 ».

## Bugs fixes M5 (découverts pendant validation 2026-04-21)

- `packages/api/src/routes/auth.ts` : silent-drop réparé quand whitelisted email absent de DB (commit `5a48176`).
- `.env.development` PUBLIC_BASE_URL aligné sur port Vite `:5173` (résout Origin mismatch CSRF) (commit `cac5920`).
- `MEMORY_RECALL_THRESHOLD` configurable via env, default 0.5 (0.7 trop strict sur text-embedding-3-large FR) (commit `cac5920`).
- `insertUsageEvent` propage `kind` pour memory_embedding → chat/memory correctement distingués dans budget (commit `01cfcfd`).
- `byKind.memory` ajouté à `UsageResponse` et affiché dans `budget-section.tsx` (commit `01cfcfd`).

## Gaps connus / dette

- Edge `consolidate-memory` et `compact-state` : 500 sur path complet. À logger + fixer (ajouter try/catch + `console.error` dans le code Deno, redéployer).
- MCP remote (`bible`, `writing-tools`) désactivés en DB locale dev (OpenAI ne peut pas joindre `localhost:*`). À réactiver pour dev avec ngrok / tunnel public si besoin tester.
- **UX 1er call cold-start** : après un deploy ou container restart, le **premier** POST `/api/chat` affiche un toast `Responses API error` côté web. Re-tenter le même message passe immédiatement. Hypothèse : OpenAI Responses fait un `tools/list` sur les MCP remote (bible-mcp, writing-tools-mcp) au premier appel ; un des deux met >N secondes à répondre cold (writing-tools-mcp charge ~3 GB torch/transformers/spacy), OpenAI timeout → `external_connector_error` → stream `event: error` → Buck re-throw. 2e call : containers chauds, list cachée côté OpenAI, OK. Non-bloquant (le 2e essai marche toujours), mais UX pénible. Fix possible : warmup ping des MCP au boot `buck-app`, ou retry silencieux côté web au premier `Responses API error`. Pas tracé serveur pour l'instant (le catch dans `chat.ts:584` envoie l'erreur au client via SSE sans `console.warn`) — à instrumenter si l'occurrence se répète.
