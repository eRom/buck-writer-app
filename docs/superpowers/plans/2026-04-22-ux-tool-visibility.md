# UX — Visibilité des tool calls — Plan d'implémentation

**Date** : 2026-04-22
**Status** : Plan — à exécuter par phases, chaque phase doit se terminer avec tests verts.
**Spec de référence** : `docs/superpowers/specs/2026-04-22-ux-tool-visibility-design.md`
**Tâche gerber** : `83aea2c3-76cf-4529-ac55-e8469ca9848a`

---

## Séquencement

5 phases indépendantes, ordonnées par valeur visible. Chaque phase est mergeable seule.

| Phase | Périmètre | Effort | Bénéfice user |
|---|---|---|---|
| 1 | Backend : route `/meta` + persistance toolActivities | 1h | Pré-requis (rien de visible) |
| 2 | Frontend : extraction attachments visible (bulle user) | 1h30 | ✓ extrait / ✗ failed sur chaque PDF |
| 3 | Frontend : ToolActivityList + mapping icons (bulle assistant) | 2h | Tous les tool calls visibles avec état |
| 4 | Frontend : spinner « Buck réfléchit » + persistance après refresh | 45min | Plus jamais de doute « ça marche ou pas » |
| 5 | Tests E2E + polish | 1h | Garde-fou anti-régression |

**Total estimé** : ~6h.

---

## Phase 1 — Backend : exposition métadonnées + persistance

**Objectif** : route `GET /api/attachments/:id/meta` opérationnelle ; tool activities sérialisées dans `messages.metadata` à la fin du stream.

### Tâches

- [ ] **1.1** — Étendre `packages/api/src/routes/attachments.ts` : ajouter route `GET /:id/meta` (auth identique à la route binaire), retourne `{ id, filename, mimeType, sizeBytes, extractionStatus, extractionSource, extractionError, extractedChars, extractedAt }`. `extractedChars` calculé via `extractedText?.length ?? null`.
- [ ] **1.2** — Définir le type partagé `ToolActivityEntry` dans `packages/shared/src/chat/tool-activity.ts` (cf. spec) + export depuis `packages/shared/src/index.ts`.
- [ ] **1.3** — Dans `packages/api/src/routes/chat.ts`, accumuler les tool activities dans un array local au handler stream, alimenté à chaque `tool_started` / `tool_result` / `mcp_call_started` / `mcp_call_done` / `mcp_call_error`. Inclure `kind`, `toolName`, `status`, `startedAt`, `endedAt`, `error`.
- [ ] **1.4** — Juste avant l'event `assistant_saved` (chat.ts:741), persister `toolActivities` dans `messages.metadata` via update Drizzle (merger avec metadata existante).
- [ ] **1.5** — Tests unitaires :
  - `packages/api/src/routes/__tests__/attachments.test.ts` : nouvelle route `/meta` — 200 owner, 404 inconnu, 401 sans auth, 403 owner différent.
  - `packages/api/src/routes/__tests__/chat.test.ts` (extension) : un test qui mock un tool call et vérifie que `metadata.toolActivities` est sauvegardé après le stream.

### Vérif

```bash
pnpm --filter @buck/api typecheck
pnpm --filter @buck/api test
pnpm --filter @buck/shared build
curl -H 'cookie: ...' http://localhost:3000/api/attachments/<id>/meta | jq
```

---

## Phase 2 — Frontend : extraction visible dans la bulle user

**Objectif** : `<AttachmentDisplay />` rendu dans `message-user.tsx` avec badge d'extraction par attachment.

### Tâches

- [ ] **2.1** — Créer le hook `packages/web/src/hooks/use-attachment-meta.ts` (TanStack Query, queryKey `['attachment-meta', id]`, fetch `/api/attachments/:id/meta`, staleTime 5min).
- [ ] **2.2** — Étendre `packages/web/src/components/chat/attachment-display.tsx` :
  - Nouveau sous-composant `<ExtractionBadge attachmentId={id} />` qui consomme le hook et rend :
    - `extractionStatus === 'ok'` → badge `text-green-600` `✓ extrait • {chars} car. • {source}` (label source : « MarkItDown » / « texte brut »).
    - `extractionStatus === 'skipped'` → badge `text-muted-foreground` `— non extrait` + tooltip « Type de fichier non supporté ».
    - `extractionStatus === 'failed'` → badge `text-red-600` `✗ extraction échouée` + tooltip avec `extractionError`.
    - Loading → squelette de 12px.
- [ ] **2.3** — `packages/web/src/components/chat/message-user.tsx` :
  - Passer `attachments` depuis le `Message` props.
  - Brancher `<AttachmentDisplay attachments={message.attachments} />` sous le contenu texte.
- [ ] **2.4** — Vérifier que `Message` typé (depuis `@buck/shared`) expose bien `attachments`. Sinon, étendre le type ou la requête.
- [ ] **2.5** — Tests :
  - `attachment-display.test.tsx` : rend les 3 états (ok / skipped / failed) avec mocks MSW.

### Vérif

```bash
pnpm --filter @buck/web typecheck
pnpm --filter @buck/web test
# Test manuel : pnpm dev → upload PDF → envoyer → badge visible.
```

---

## Phase 3 — Frontend : ToolActivityList dans la bulle assistant

**Objectif** : chaque tool call rendu en temps réel avec icône, label FR, état pending/done/failed, tooltip erreur.

### Tâches

- [ ] **3.1** — Créer `packages/web/src/components/chat/tool-activity-meta.ts` : `getToolActivityMeta(toolName, kind, serverLabel?)` → `{ label, icon }` selon le mapping de la spec. Cas MCP : préfixe par serverLabel.
- [ ] **3.2** — Créer `packages/web/src/components/chat/tool-activity-list.tsx` :
  - Props : `entries: ToolActivityEntry[]`.
  - Rend une `<ul>` compacte (text-xs, line-height serré).
  - Chaque item : `<icon className="size-3.5" />` + label + état (Loader2 spin / Check vert / X rouge) + durée si done (format `1.2s` ou `120ms`).
  - Tooltip `shadcn/ui` au survol pour `failed` (affiche `entry.error`).
- [ ] **3.3** — Refactor `packages/web/src/components/chat/chat-stream.tsx` :
  - Remplacer le state `toolActivity` (single object, lignes 380-400) par `toolActivities: ToolActivityEntry[]` (array).
  - Sur `tool_started` / `mcp_call_started` : push entry pending.
  - Sur `tool_result` / `mcp_call_done` : update status → done + endedAt.
  - Sur `mcp_call_error` : update status → failed + error.
  - Supprimer l'ancien rendu `showActivity` (lignes 630-640), remplacer par `<ToolActivityList entries={toolActivities} />` placé **au-dessus** du contenu streamé.
- [ ] **3.4** — Tests :
  - `tool-activity-meta.test.ts` : un cas par toolName listé dans la spec + fallback.
  - `tool-activity-list.test.tsx` : rend pending/done/failed correctement, tooltip apparaît sur failed.
  - `chat-stream.test.tsx` (extension) : envoyer une séquence d'events SSE mockés et vérifier le state final.

### Vérif

```bash
pnpm --filter @buck/web typecheck
pnpm --filter @buck/web test
# Test manuel : message déclenchant recall + bible → 2 lignes visibles.
```

---

## Phase 4 — Spinner « Buck réfléchit » + persistance après refresh

**Objectif** : indicateur initial avant le premier event ; les tool activities restent visibles après reload.

### Tâches

- [ ] **4.1** — Dans `chat-stream.tsx`, ajouter un state `isThinking` initialisé à `true` au moment où on envoie le POST. Passer à `false` au premier event `content` ou tool event reçu.
- [ ] **4.2** — Rendre, **avant** `<ToolActivityList>` quand `isThinking && toolActivities.length === 0 && streamedContent === ''` :
  ```tsx
  <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
    <Loader2 className="size-3 animate-spin" />
    Buck réfléchit…
  </span>
  ```
- [ ] **4.3** — Dans le composant qui rend les messages **persistés** (vraisemblablement `chat-history.tsx` ou équivalent — à confirmer pendant l'impl), lire `message.metadata?.toolActivities` et passer à `<ToolActivityList />` également pour les bulles assistant historiques.
- [ ] **4.4** — Étendre le type `Message` côté shared (ou la query GET messages) pour exposer `metadata.toolActivities` typé.
- [ ] **4.5** — Tests :
  - `chat-stream.test.tsx` : `isThinking` true au mount, false au premier event.
  - Test E2E couvert en phase 5.

### Vérif

```bash
pnpm --filter @buck/web typecheck
pnpm --filter @buck/web test
# Test manuel : envoyer message → spinner visible 200-500ms → disparaît.
# Test manuel : reload page → tool activities historiques rendues sur les anciens messages.
```

---

## Phase 5 — Tests E2E + polish

**Objectif** : Playwright `tool-visibility.spec.ts` vert + revue finale.

### Tâches

- [ ] **5.1** — Créer `packages/web/tests/e2e/tool-visibility.spec.ts` :
  - Login dev (`/api/__e2e__/dev-login`).
  - Upload PDF de fixture.
  - Envoyer un message « résume ce document ».
  - Assert badge `✓ extrait` visible sur la bulle user.
  - Assert spinner `Buck réfléchit` visible avant le premier token.
  - Assert au moins une ligne de tool activity apparaît avec état `done`.
  - Reload la page, assert que les tool activities sont toujours rendues.
- [ ] **5.2** — Fixture PDF dans `packages/web/tests/e2e/fixtures/sample.pdf` (1 page lisible).
- [ ] **5.3** — Revue manuelle de `chat-stream.tsx` : aucun event SSE ignoré silencieusement (chaque case `switch` doit être traité ou commenté `// intentionally ignored`).
- [ ] **5.4** — Lint + typecheck monorepo complet.
- [ ] **5.5** — Update `CLAUDE.md` avec une ligne dans la section milestones décrivant la livraison.

### Vérif

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e --grep tool-visibility
```

---

## Critères globaux de validation (rappel spec)

- [ ] Spinner « Buck réfléchit » visible dans les 200ms après envoi.
- [ ] Chaque tool call apparaît avec icône + label FR + état.
- [ ] Erreur MCP affichée avec tooltip lisible.
- [ ] Bulle user affiche l'état d'extraction (✓ / — / ✗).
- [ ] Refresh conserve l'historique des tool activities.
- [ ] Test E2E `tool-visibility.spec.ts` vert.
- [ ] Aucun event SSE ignoré silencieusement.

---

## Stratégie git

Une branche par phase, mergeable indépendamment dans `main` :

```
ux/tool-vis-1-backend
ux/tool-vis-2-attachment-display
ux/tool-vis-3-tool-activity-list
ux/tool-vis-4-thinking-spinner
ux/tool-vis-5-e2e
```

Ou, si Romain préfère, **une seule branche** `ux/tool-visibility` avec 5 commits squashables. À confirmer avant de démarrer la Phase 1.

---

## Risques & mitigations (rappel spec)

| Risque | Mitigation |
|---|---|
| Stream coupé avant `assistant_saved` → tool activities non persistées | Status quo : front a déjà rendu, reload affiche bulle assistant sans timeline. Acceptable. |
| Bruit visuel sur 8 tool calls | Rendu compact (text-xs, gap-1, icône 14px). |
| Anciens messages sans `metadata.toolActivities` | Pas de fallback, on ne rend rien. |
| Coût route `/meta` | 1 fetch par attachment, cache TanStack 5min. Acceptable. |
