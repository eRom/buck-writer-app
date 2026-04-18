# M6 — MarkItDown Sidecar — Plan d'implémentation

**Date** : 2026-04-18
**Status** : Plan — à exécuter par étapes, chaque étape doit se terminer avec tests verts.
**Spec de référence** : `docs/superpowers/specs/2026-04-18-m6-markitdown-sidecar-design.md`

---

## Séquencement

Phases indépendantes testables. Ordre recommandé : 1 → 2 → 3 → 4 → 5 → 6.

### Phase 1 — Sidecar Python (services/markitdown-worker)

**Objectif** : image Docker buildable, healthcheck OK, `/api/convert` fonctionnel en local.

**Tâches** :
- [ ] `services/markitdown-worker/requirements.txt` : pin `fastapi`, `uvicorn[standard]`, `python-multipart`, `markitdown[pdf,docx,pptx,xlsx]`, `pytesseract`.
- [ ] `services/markitdown-worker/main.py` : FastAPI app avec `/health`, `/api/convert`, auth header, timeout, taille max, cleanup `/tmp`.
- [ ] `services/markitdown-worker/Dockerfile` avec tesseract + poppler-utils + langpacks fra/eng.
- [ ] `services/markitdown-worker/tests/test_convert.py` : 6 tests (health, auth, pdf, docx, too_large, unsupported).
- [ ] `services/markitdown-worker/README.md` : build, run local, env vars, limites connues.

**Vérif** :
- `docker build -t buck-markitdown ./services/markitdown-worker` OK.
- `docker run --rm -p 8000:8000 -e INTERNAL_TOKEN=test buck-markitdown` démarre.
- `curl -H 'X-Internal-Token: test' -F file=@sample.pdf http://localhost:8000/api/convert` renvoie du markdown.
- `pytest services/markitdown-worker/tests -v` : tous verts (skip OCR si tesseract absent).

### Phase 2 — Migration DB + schéma

**Objectif** : colonnes `extracted_text`, `extraction_status`, `extraction_error`, `extracted_at` sur `attachments`.

**Tâches** :
- [ ] Étendre `packages/api/src/db/schema.ts` (attachments).
- [ ] `pnpm --filter @buck/api db:generate` → nouvelle migration SQL dans `packages/api/migrations/`.
- [ ] Relire la migration (default values, nullabilité).
- [ ] `pnpm --filter @buck/api db:migrate` en dev, vérifier.
- [ ] Mettre à jour le type `Attachment` dans `@buck/shared` si exposé côté web.

**Vérif** :
- `pnpm --filter @buck/api test` : vert.
- `sqlite3 data/buck.db '.schema attachments'` montre les nouvelles colonnes.

### Phase 3 — Client MarkitdownClient + injection

**Objectif** : module `services/markitdown.ts` avec tests unitaires, branché dans `buildApp`.

**Tâches** :
- [ ] `packages/api/src/services/markitdown.ts` : `createMarkitdownClient` + types.
- [ ] `packages/api/src/services/__tests__/markitdown.test.ts` : mock fetch, cas succès, 400, 413, timeout, ECONNREFUSED, 401.
- [ ] `packages/api/src/index.ts` : lecture env `MARKITDOWN_URL`, `MARKITDOWN_INTERNAL_TOKEN`, instanciation conditionnelle.
- [ ] Mettre à jour `buildApp()` signature.
- [ ] `.env.example` : ajouter les deux variables.

**Vérif** :
- `pnpm --filter @buck/api test` : vert, nouveau fichier couvert.
- `pnpm --filter @buck/api typecheck` : vert.

### Phase 4 — Hook d'extraction post-upload

**Objectif** : à chaque upload d'attachment, extraction inline, persistence du résultat.

**Tâches** :
- [ ] Repérer le handler d'upload M3 (`packages/api/src/routes/attachments.ts` ou équivalent).
- [ ] Allowlist mime/ext extraite dans `packages/api/src/services/extractable.ts`.
- [ ] Appel `markitdown.extract` après insert DB (ou avant commit final selon le pattern existant).
- [ ] Mise à jour `extraction_status` + `extracted_text` + timestamps.
- [ ] Endpoint `POST /api/attachments/:id/reextract` (auth + csrf + rate-limit comme le reste).
- [ ] Tests d'intégration : upload PDF mocké, vérifier status `ok` + markdown stocké. Upload fichier non supporté → `skipped`. Sidecar down → `failed` + upload réussit quand même.

**Vérif** :
- `pnpm --filter @buck/api test` : vert.
- Smoke test manuel : upload un PDF via curl, `SELECT extraction_status FROM attachments ORDER BY createdAt DESC LIMIT 1;` → `ok`.

### Phase 5 — Injection dans le prompt

**Objectif** : les attachments extraits sont passés au LLM sous forme de blocs `<attachment>...</attachment>`.

**Tâches** :
- [ ] Repérer le builder de messages système/user qui inclut les attachments (M3 path).
- [ ] Ajouter la sérialisation Markdown tronqué à 20k chars par attachment, ordre stable.
- [ ] Truncation policy : si >20k, garder les 18k premiers + `\n...[tronqué, {n} chars omis]...\n` + 2k derniers.
- [ ] Mettre à jour les tests du prompt builder.
- [ ] Vérifier que les usage_events comptabilisent correctement les tokens ajoutés.

**Vérif** :
- `pnpm --filter @buck/api test` : vert.
- Test manuel : session avec un PDF attaché, le LLM peut citer le contenu.

### Phase 6 — UI web

**Objectif** : badge statut sur chaque attachment, bouton "réextraire" si failed.

**Tâches** :
- [ ] Composant `AttachmentStatusBadge` dans `packages/web/src/components/chat/` (variantes ok/pending/failed/skipped).
- [ ] Intégration dans la liste des attachments du chat.
- [ ] Bouton "Réextraire" avec mutation TanStack Query vers l'endpoint admin.
- [ ] Toast succès/erreur (shadcn sonner).
- [ ] Tests composant (Testing Library).

**Vérif** :
- `pnpm --filter @buck/web test` : vert.
- `pnpm --filter @buck/web lint` : vert.
- Smoke test browser : upload un PDF, badge devient `extrait` après ~1s.

### Phase 7 — Docker + docker-compose

**Objectif** : worker intégré au compose prod + compose local.

**Tâches** :
- [ ] Ajouter service `markitdown-worker` à `docker-compose.yml` (spec §Docker).
- [ ] Ajouter le réseau `buck-internal` (internal: true) entre buck-app et worker.
- [ ] Vérifier que `caddy-public` reste le réseau d'entrée (buck-app dans les deux).
- [ ] `docker-compose.local.yml` : variante avec port `8808:8000` exposé local.
- [ ] Générer un `MARKITDOWN_INTERNAL_TOKEN` (32+ chars) et l'ajouter au `.env` VPS (hors git).
- [ ] Mettre à jour `README.md` racine + section `## Commandes` de CLAUDE.md (ligne dev hybride).

**Vérif** :
- `docker compose config` : pas d'erreur de syntaxe.
- `docker compose up -d --build markitdown-worker` en staging : healthy sous 30s.
- `docker compose logs markitdown-worker` : démarrage propre, pas d'erreur.

### Phase 8 — E2E + déploiement VPS

**Objectif** : feature en prod, vérifiée bout-en-bout.

**Tâches** :
- [ ] Playwright e2e : upload PDF → badge vert → LLM cite le contenu. Skip si `MARKITDOWN_URL` absent.
- [ ] Déploiement VPS : `git pull` + `docker compose up -d --build`.
- [ ] Vérif healthchecks + premier upload réel.
- [ ] Script optionnel `scripts/reextract-all.ts` pour backfill des attachments existants.
- [ ] Commit + tag + release (skill `release`).

**Vérif** :
- `pnpm test:e2e` : vert.
- Healthcheck worker OK en prod.
- Un upload réel en prod montre `extracted_text` non vide dans la DB.

---

## Estimation

- Phase 1 : ~3h (FastAPI + Dockerfile + tests)
- Phase 2 : ~1h
- Phase 3 : ~2h
- Phase 4 : ~3h (intégration la plus sensible, branchement M3)
- Phase 5 : ~2h
- Phase 6 : ~2h
- Phase 7 : ~1h
- Phase 8 : ~2h

**Total indicatif** : ~16h, splittable sur 2-3 sessions.

## Points de vigilance

- **Phase 4** : si le flux M3 n'a pas de transaction claire upload→DB, l'extraction inline peut allonger sensiblement la latence perçue. Mesurer, si >3s sur PDF moyen → passer en async fire-and-forget avec polling côté web.
- **Phase 7** : bien vérifier que `buck-app` reste sur `caddy-public` (trafic entrant) ET `buck-internal` (vers worker). Double réseau.
- **Phase 8** : backup DB avant déploiement (la migration ajoute des colonnes, reversible mais par précaution).

## Go/No-Go avant de commencer

- [ ] Spec M6 relue et validée.
- [ ] Pas de conflit en cours avec M5 Memory (si M5 en vol, finir M5 d'abord).
- [ ] VPS a ~1.5G RAM libre pour le worker.
- [ ] Token `MARKITDOWN_INTERNAL_TOKEN` généré.
