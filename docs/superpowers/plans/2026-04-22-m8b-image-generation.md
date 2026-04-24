# M8B — Tool `image_generation` (gpt-image-2) — Plan d'implémentation

**Date** : 2026-04-22
**Status** : Plan — à exécuter par phases, chaque phase doit se terminer avec tests verts.
**Spec de référence** : `docs/superpowers/specs/2026-04-22-m8b-image-generation.md`
**Tâche gerber** : `a5dc0db0-bfd3-45ac-a9fc-63bbcfe755c4`

---

## Séquencement

6 phases ordonnées pour maximiser la valeur visible au plus tôt. Phase 1 et 2 sont les fondations (rien de visible) ; à partir de la phase 3, chaque phase est mergeable seule et livre un incrément démo-able.

| Phase | Périmètre | Effort | Bénéfice visible |
|---|---|---|---|
| 1 | DB + types + pricing helper | 45min | Pré-requis |
| 2 | Backend : injection tool + SSE relay + usage_events | 1h30 | Visible via DevTools SSE |
| 3 | Frontend : Settings > Images (UI complète) | 1h | Toggle + réglages fonctionnels |
| 4 | Frontend : ImageMessageBlock + streaming partial | 1h30 | **Images s'affichent dans le chat** |
| 5 | Frontend : SaveToWorkspaceModal + actions download/fullscreen | 1h | Sauvegarde workspace opérationnelle |
| 6 | Tests E2E + purge cron + polish | 1h | Garde-fou + housekeeping |

**Total estimé** : ~6h45.

---

## Phase 1 — DB, types, pricing helper

**Objectif** : schéma DB étendu, types `ToolDef` à jour, helper pricing prêt.

### Tâches

- [ ] **1.1** — Migration `packages/api/migrations/0014_image_gen.sql` :
  ```sql
  ALTER TABLE user_settings
    ADD COLUMN image_quality TEXT NOT NULL DEFAULT 'medium';
  ALTER TABLE user_settings
    ADD COLUMN image_size TEXT NOT NULL DEFAULT '1024x1024';
  ALTER TABLE messages
    ADD COLUMN images_json TEXT;
  ```
- [ ] **1.2** — Mettre à jour `packages/api/src/db/schema.ts` : ajouter `imageQuality`, `imageSize` sur `userSettings`, `imagesJson` sur `messages`.
- [ ] **1.3** — Étendre le type `ToolDef` dans `packages/api/src/lib/openai.ts` avec le variant `{ type: 'image_generation'; quality?; size?; partial_images?; output_format?; moderation?; background? }`.
- [ ] **1.4** — Créer `packages/shared/src/pricing.ts` additions :
  ```ts
  export type ImageQuality = 'low' | 'medium' | 'high';
  export type ImageOrientation = 'square' | 'landscape' | 'portrait';
  export const GPT_IMAGE_2_PRICING: Record<ImageQuality, Record<ImageOrientation, number>> = {
    low:    { square: 0.006, landscape: 0.005, portrait: 0.005 },
    medium: { square: 0.053, landscape: 0.041, portrait: 0.041 },
    high:   { square: 0.211, landscape: 0.165, portrait: 0.165 },
  };
  export function imageOrientation(size: string): ImageOrientation { /* ... */ }
  export function imageCost(quality: ImageQuality, size: string): number { /* ... */ }
  ```
  Export depuis `packages/shared/src/index.ts`.
- [ ] **1.5** — Type `ImageEntry` partagé dans `packages/shared/src/chat/image-entry.ts` :
  ```ts
  export interface ImageEntry {
    callId: string;
    b64: string;
    size: string;
    revisedPrompt?: string;
    savedToWorkspace?: string;
    createdAt: number;
  }
  ```
- [ ] **1.6** — Tests unitaires pricing :
  - `packages/shared/src/__tests__/pricing.test.ts` (extension) : tous les cas (low/medium/high × square/landscape/portrait), coût `imageCost('medium', '2048x2048') === 0.053`, `imageCost('low', '3840x2160') === 0.005`.

### Vérif phase 1

```bash
pnpm --filter @buck/api db:generate   # doit générer la migration cleanly
pnpm --filter @buck/api db:migrate    # applique sans erreur sur DB fresh
pnpm --filter @buck/shared test       # tests pricing verts
pnpm --filter @buck/api typecheck     # ToolDef étendu compile
```

---

## Phase 2 — Backend : injection tool + SSE relay + usage_events

**Objectif** : quand `chatToolsJson.imageGen=true`, le tool est envoyé à OpenAI ; les events partial/final sont relayés en SSE ; un row `usage_events.kind='image'` est créé.

### Tâches

- [ ] **2.1** — `packages/api/src/routes/chat.ts` : extraire `imageGen`, `imageQuality`, `imageSize` depuis `settingsRow` et `chatTools`. Injecter le tool si flag ON :
  ```ts
  if (chatTools.imageGen) {
    toolDefs.push({
      type: 'image_generation',
      action: 'auto',              // laisse le modèle choisir generate vs edit
      quality: settingsRow.imageQuality,
      size: settingsRow.imageSize,
      partial_images: 2,
      output_format: 'png',
      moderation: 'low',
      background: 'auto',
    });
  }
  ```
- [ ] **2.2** — Dans le parseur SSE (`packages/api/src/lib/openai.ts` ou handler `chat.ts`), ajouter le handling des events OpenAI (noms verbatim depuis doc officielle) :
  - `response.image_generation_call.generating` → ignoré (signal de début, couvert par `tool_started`).
  - `response.image_generation_call.in_progress` → ignoré (ou utilisé pour `tool_started` si `generating` absent).
  - `response.image_generation_call.partial_image` → payload `{ item_id, partial_image_index, partial_image_b64, output_index, sequence_number }` → émettre SSE Buck `image_partial` `{ callId: item_id, index: partial_image_index, b64: partial_image_b64 }`.
  - `response.image_generation_call.completed` → l'output item contient `{ id, type: 'image_generation_call', status: 'completed', result, revised_prompt }` → émettre SSE Buck `image_done` `{ callId: id, b64: result, revisedPrompt: revised_prompt, size }`.
  - En cas de `status: 'failed'` avec `error.code: 'moderation_blocked'` ou autre → SSE `image_error` `{ callId, code, message }`.
- [ ] **2.3** — Accumuler les images finales dans un array local `finalImages: ImageEntry[]` pendant le stream. À l'`assistant_saved`, persister dans `messages.imagesJson` (JSON.stringify).
- [ ] **2.4** — Créer le row `usage_events` à chaque `image_generation_call` completed :
  ```ts
  {
    id: newId(),
    userId,
    sessionId,
    createdAt: now,
    model: 'gpt-image-2',
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    costUsd: imageCost(imageQuality, imageSize),
    kind: 'image',
  }
  ```
  Le coût vient du helper flat, les tokens sont stockés pour audit future.
- [ ] **2.5** — Étendre `tool_started` / `tool_result` pour `image_generation` (cohérence panneau visibilité UX tool) : callId = `ig_xxx`, toolName = `image_generation`. Le label humanisé (« Génération d'image ») est géré côté front.
- [ ] **2.6** — Émettre `tool_started` avec callId dès réception du 1er event OpenAI `response.image_generation_call.generating` (sinon `.in_progress`, sinon au 1er `.partial_image`).
- [ ] **2.7** — Tests API :
  - `chat.test.ts` : quand `imageGen=true`, le body OpenAI contient bien le tool `image_generation` avec quality/size de settings.
  - `chat.test.ts` : fixture SSE avec 2 partials + 1 completed → vérifier 2 events `image_partial` puis 1 `image_done` émis côté Buck.
  - `chat.test.ts` : `usage_events` row créé après completion avec coût flat correct (`0.053` pour medium square).
  - `chat.test.ts` : `messages.imagesJson` persisté avec le bon contenu après stream done.

### Vérif phase 2

```bash
pnpm --filter @buck/api test
```

Tests ajoutés verts. DevTools (manuel) : ouvrir une session, activer `imageGen` en DB (SQL direct), envoyer prompt « génère un renard » → SSE stream contient `tool_started image_generation`, `image_partial` × 2, `image_done`, `assistant_saved`.

---

## Phase 3 — Frontend : Settings > Images

**Objectif** : nouvelle section dans `/settings` permettant de toggle la feature et choisir quality/size.

### Tâches

- [ ] **3.1** — Composant `packages/web/src/components/settings/images-section.tsx` :
  - Toggle `imageGenEnabled` (bind sur `chatToolsJson.imageGen`).
  - Radio group `quality` (low/medium/high, default medium).
  - Select `size` — 4 options hardcodées : `1024x1024` (square, défaut), `1024x1536` (portrait), `1536x1024` (landscape), `auto`. Les tailles custom (hors grille) ne sont pas exposées car le pricing flat ne s'y applique pas.
  - Ligne coût estimé sous le select : `≈ $X / image à la config actuelle` via `imageCost(quality, size)`.
  - États disabled des radio/select quand toggle off.
- [ ] **3.2** — API client side : étendre `packages/web/src/lib/api/settings.ts` pour envoyer `imageQuality`, `imageSize` + merger `chatToolsJson.imageGen` sur le PATCH settings.
- [ ] **3.3** — Auto-save : debounce 500ms sur change (pattern existant des autres sections Settings).
- [ ] **3.4** — Intégration dans `packages/web/src/routes/settings.tsx` : insérer `<ImagesSection />` entre « Outils du chat » et « Voix ».
- [ ] **3.5** — Endpoint backend : vérifier que `PATCH /api/settings` accepte déjà `imageQuality`, `imageSize` (sinon l'étendre dans `packages/api/src/routes/settings.ts` avec validation Zod : enum `['low','medium','high']`, enum taille parmi `['1024x1024','1024x1536','1536x1024','auto']`).
- [ ] **3.6** — Tests unit :
  - `images-section.test.tsx` : toggle off désactive radio/select ; change quality déclenche PATCH après 500ms ; coût estimé affiché cohérent avec config.
  - `settings.test.ts` (API) : PATCH avec valeurs invalides (`quality: 'ultra'`, `size: '999x999'`) renvoie 400.

### Vérif phase 3

```bash
pnpm --filter @buck/web test
pnpm --filter @buck/api test
pnpm dev
```

Manuel : ouvrir `/settings`, activer toggle Images, changer quality/size, vérifier que le coût estimé change, F5 persistant.

---

## Phase 4 — Frontend : ImageMessageBlock + streaming partial

**Objectif** : les images générées s'affichent progressivement dans la bulle assistant pendant le streaming, puis en version finale nette.

### Tâches

- [ ] **4.1** — Composant `packages/web/src/components/chat/image-message-block.tsx` :
  - Props : `{ callId, entry: Partial<ImageEntry> & { status: 'pending' | 'partial' | 'done' | 'failed' }, onSave, onDownload, onZoom }`.
  - State `pending` : spinner + texte « 🎨 Buck peint une image… » + barre de progression indéterminée.
  - State `partial` : `<img src={`data:image/png;base64,${b64}`} />` + overlay badge « Aperçu… ».
  - State `done` : image nette + 3 boutons actions (💾 save / ⤓ download / 🔍 zoom) en overlay bas-droite, collapsible « Voir le prompt révisé » sous l'image si `revisedPrompt`.
  - State `failed` : bloc rouge avec message d'erreur clair (moderation_blocked → « Le modèle a refusé ce prompt pour raisons de modération »).
- [ ] **4.2** — `packages/web/src/features/chat/chat-stream.tsx` : étendre le state local avec `imagesInFlight: Map<callId, ImageEntry & { status }>`. Handlers SSE :
  - `image_partial` → upsert dans la map, status=`partial`.
  - `image_done` → update map, status=`done`, b64 final.
  - `image_error` → status=`failed` + message.
- [ ] **4.3** — Rendu dans la bulle assistant : après le texte, mapper `imagesInFlight` + `message.imagesJson` (cas reload) → `<ImageMessageBlock>` par image. Les images de `imagesJson` (persistées) sont merged avec celles in-flight, dédupées par `callId`.
- [ ] **4.4** — `ToolCallItem` (composant UX visibility) : mapping `image_generation` → icône 🎨 + label « Génération d'image ». Quand un `image_generation_call` est en cours, le ToolCallItem le représente dans le panneau, mais le rendu visuel principal reste `ImageMessageBlock` inline (le ToolCallItem reste minimal, pas d'image dedans).
- [ ] **4.5** — Reload session : la route `GET /api/chat/sessions/:id` doit retourner `message.imagesJson` déjà parsé dans le payload JSON (étendre le mapper DB→API). Vérifier dans `chat.ts` ou équivalent.
- [ ] **4.6** — Tests unit :
  - `image-message-block.test.tsx` : transitions pending → partial → done ; boutons actions présents seulement en state done ; revisedPrompt collapsible fonctionne.
  - `chat-stream.test.tsx` (extension) : mock SSE fixture avec `image_partial` × 2 + `image_done` → ImageMessageBlock rendu 3 fois avec les bons b64.

### Vérif phase 4

```bash
pnpm --filter @buck/web test
pnpm dev
```

Manuel : avec la feature ON, envoyer « Dessine un paysage arctique » → voir spinner → apparition progressive floue → image nette avec actions. F5 puis réouvrir session → image re-apparaît au même endroit.

---

## Phase 5 — SaveToWorkspaceModal + actions

**Objectif** : bouton save fonctionnel (écrit le PNG dans workspace/), download local, fullscreen.

### Tâches

- [ ] **5.1** — Endpoint `POST /api/images/save` :
  - Body : `{ messageId: string, callId: string, path: string }` (path relatif à `WORKSPACE_DIR`).
  - Sécurité : rejeter tout `path` contenant `..` ou débutant par `/` (path traversal).
  - Lit `messages.imagesJson`, trouve l'entry par `callId`, décode base64, écrit le PNG.
  - Met à jour l'entry `savedToWorkspace` dans `imagesJson`.
  - Retourne `{ absPath, sizeBytes }`.
- [ ] **5.2** — Composant `packages/web/src/components/chat/save-to-workspace-modal.tsx` :
  - shadcn `<Dialog>`.
  - Call `GET /api/workspace/tree` pour récupérer l'arborescence (route existante à vérifier, sinon simple text input).
  - Select dossier + input nom fichier pré-rempli `image_YYYY-MM-DD_HHmmss.png`.
  - Valide extension `.png`, refuse path invalide.
  - POST sur submit, toast succès avec `absPath` + bouton « Ouvrir le dossier ».
- [ ] **5.3** — Action download : handler sur bouton ⤓ crée un `<a href={`data:image/png;base64,${b64}`} download={filename} />` programmatique, click, cleanup.
- [ ] **5.4** — Action zoom : modal fullscreen simple (shadcn Dialog taille max) avec l'image centrée, fond noir, click outside → close.
- [ ] **5.5** — Tests :
  - `images-save.test.ts` (API) : 200 succès, 400 path traversal `../secret`, 404 callId inconnu, 403 owner différent.
  - `save-to-workspace-modal.test.tsx` : submit valide appelle POST avec les bons args, toast succès affiché.

### Vérif phase 5

```bash
pnpm --filter @buck/api test
pnpm --filter @buck/web test
pnpm dev
```

Manuel : générer image, click 💾, choisir dossier, save → vérifier PNG présent dans `workspace/...` + entry `savedToWorkspace` mise à jour (F5 → bouton save remplacé par indicateur « Sauvegardé dans X »).

---

## Phase 6 — E2E, purge, polish

**Objectif** : garde-fou anti-régression + cleanup automatique des images non sauvegardées > 30 jours.

### Tâches

- [ ] **6.1** — Cron purge : job `packages/api/src/services/image-purge.ts` qui :
  - S'exécute au démarrage + toutes les 24h (setInterval simple, pas besoin de node-cron).
  - Parcourt `messages` avec `imagesJson IS NOT NULL`.
  - Pour chaque entry, si `createdAt < now - 30j` ET `savedToWorkspace` absent → retire l'entry du JSON, update la row.
  - Si `imagesJson` devient `[]` après cleanup → `NULL`.
  - Logs INFO par run (`images purged: N`).
- [ ] **6.2** — Test unit purge : fixtures 3 images (1 récente, 1 ancienne non savée, 1 ancienne savée) → seule la 2e est purgée.
- [ ] **6.3** — Playwright `packages/web/tests/e2e/chat-image-gen.spec.ts` (gated `IMAGE_GEN_E2E=1`) :
  - Dev login.
  - Activer le flag via SQL direct ou UI.
  - Mock OpenAI SSE avec fixture `image_partial` × 2 + `image_done`.
  - Envoyer « test image ».
  - Vérifier : spinner affiché, image partial apparaît, image finale nette avec 3 boutons actions.
  - Click save → modal affiché.
- [ ] **6.4** — Prompt système `TOOLS.md` (workspace) : ajouter section documentant `image_generation` (quand l'utiliser, cas d'usage bible).
- [ ] **6.5** — Vérifier `keepAliveInterval` SSE côté Caddy et Node pour supporter 2min de latence OpenAI. Si timeout < 120s → étendre à 180s dans la config.
- [ ] **6.6** — Extension budget/alertes : la page `/settings > Budget` doit maintenant afficher le sous-total `kind='image'` séparé du chat (cohérent avec voice/tts). Étendre le composant `UsageBreakdown` si pas déjà générique.

### Vérif phase 6

```bash
pnpm --filter @buck/api test
pnpm --filter @buck/web test
pnpm lint
pnpm typecheck
IMAGE_GEN_E2E=1 pnpm test:e2e -- chat-image-gen
```

Tout vert. Purge validée en unit. E2E passe en local.

---

## Déploiement

- [ ] Merge PR principale → main.
- [ ] Migration auto au boot container (pattern Buck existant).
- [ ] Romain active le flag via `/settings > Images` en prod.
- [ ] Premier test réel : générer 1 image medium 1024² → valider que `usage_events.kind='image'` enregistre `$0.053` + tokens.
- [ ] Vérifier budget mensuel prend bien en compte le nouveau `kind`.
- [ ] Observer 24h : latence moyenne, taux de `moderation_blocked`, usage disque workspace.

---

## Backlog v2 (hors périmètre M8B)

Features supportées par l'API officielle mais volontairement exclues de la v1 pour rester simple :

- **`input_fidelity: 'high' | 'low'`** — contrôle le matching de style/facial quand une image d'entrée est fournie. Pertinent si on ajoute l'édition explicite.
- **`output_compression` (0-100)** — uniquement pour `webp`/`jpeg`. On reste sur `png` en v1.
- **Multi-turn édition** — via `previous_response_id` **+** passage de l'`id` du `image_generation_call` précédent dans `input[]`. Le tool auto-détecte grâce à `action: 'auto'` (doc officielle). À câbler quand on voudra dire « retravaille la dernière image ».
- **Tailles custom** — max 3840px, multiples de 16, aspect ratio max 3:1. Hors grille pricing flat, donc à exposer seulement si on bascule sur un pricing dynamique.
- **Inpainting précis** via `input_image_mask.file_id`.

---

## Rollback

- Flag `chatToolsJson.imageGen=false` coupe la feature sans rollback code nécessaire.
- Migration réversible : `ALTER TABLE DROP COLUMN` sur les 3 colonnes ajoutées (en cas d'urgence).

---

## Dépendances & ordre des PRs

- **PR 1 (phase 1+2)** : DB + types + backend complet (mergeable sans UI, feature invisible user). Tests verts, déployable.
- **PR 2 (phase 3)** : Settings UI. Permet à Romain d'activer/désactiver mais n'affiche toujours pas d'image (backend seul la génère).
- **PR 3 (phase 4+5)** : rendu images + save. **La feature est vraiment utilisable ici.**
- **PR 4 (phase 6)** : E2E + purge + polish budget. Hardening post-feature.

Possibilité de merger en 1 seule grosse PR si préféré (6h total), mais le découpage permet de tester à chaque palier et limite le diff à reviewer.
