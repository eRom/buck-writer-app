# M8B — Tool `image_generation` (gpt-image-2) — Spec

> **Status** : Spec validée (prête pour plan)
> **Date** : 2026-04-22
> **Tâche gerber** : `a5dc0db0-bfd3-45ac-a9fc-63bbcfe755c4` (inbox → specification)
> **Dépend de** : M8 (tools natifs OpenAI injectés dans Responses API) · M6 (attachments workspace) · UX tool visibility (streaming live dans bulle)
> **Modèle cible** : `gpt-image-2` (snapshot `gpt-image-2-2026-04-21`)

---

## Objectif

Activer la génération d'images inline dans le chat Buck via le tool natif OpenAI `image_generation`. Cas d'usage principaux : covers de roman, moodboards d'ambiance, portraits de personnages bible, illustrations de scènes. Les images générées s'affichent progressivement dans la bulle assistant (streaming partiel), peuvent être sauvegardées dans le workspace en un clic, et sont comptabilisées dans le budget mensuel (token-based).

**Hors scope MVP** (voir « Backlog v2 » du plan) :
- Édition explicite d'image existante via attachment (le modèle peut néanmoins décider d'éditer en multi-turn grâce à `action: "auto"`, mais aucune UX dédiée n'est exposée).
- Réglages avancés (`partial_images`, `output_format`, `moderation`, `input_fidelity`, `output_compression`) dans l'UI — hardcodés.
- Tailles custom hors grille officielle (max 3840px, multiples de 16) — non exposées car hors pricing flat.
- Inpainting précis via `input_image_mask`.

---

## Modèle & pricing

`gpt-image-2` utilise un **pricing flat par (quality × orientation)**. Seul le ratio importe, pas la résolution exacte.

| Quality | Square (1024×1024) | Landscape (1536×1024) | Portrait (1024×1536) |
|---|---|---|---|
| low | $0.006 | $0.005 | $0.005 |
| medium | $0.053 | $0.041 | $0.041 |
| high | $0.211 | $0.165 | $0.165 |

**Conséquence UX** : le coût affiché dans Settings dépend uniquement de (quality × orientation). Les tailles custom (hors grille) existent dans l'API mais ne sont pas exposées v1 (pricing non garanti flat au-delà).

**Surcharge streaming** : chaque partial image ajoute ~100 output tokens. Avec `partial_images: 2` → +200 tokens (~$0.002 max à high).

**Rate limits** (Romain = **tier 2 → 20 IPM**) : plafond de 20 images par minute. Throttling improbable en usage normal (solo). UI affiche tout de même un toast clair sur 429.

**Latence** : jusqu'à 2 min pour un prompt complexe → SSE timeout à étendre.

---

## UX — Settings

Nouvelle section **Images** dans `/settings`, entre « Outils du chat » et « Voix ».

```
┌─ Images ────────────────────────────────────────────┐
│                                                     │
│ Génération d'images                        [toggle] │
│ Permet à Buck de créer covers, moodboards et        │
│ portraits depuis tes prompts.                       │
│                                                     │
│ ── (si activé) ────────────────────────────────────  │
│                                                     │
│ Qualité                                             │
│ ( ) Basse     ~$0.006 / image (carré)              │
│ (●) Moyenne   ~$0.053 / image (carré)              │
│ ( ) Haute     ~$0.211 / image (carré)              │
│                                                     │
│ Taille                                              │
│ [1024 × 1024 (carré)              ▾]                │
│ ≈ $0.053 / image à la config actuelle               │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Options du selecteur Size** (alignées sur la grille officielle OpenAI) :
- `1024x1024` — Carré (défaut)
- `1536x1024` — Paysage
- `1024x1536` — Portrait
- `auto` — Laisse le modèle choisir le ratio selon le prompt

Les tailles 2K/4K ne sont pas exposées v1 (voir Backlog v2 du plan).

---

## UX — Bulle assistant pendant streaming

Quand le modèle invoque `image_generation` :

**État 1 — `tool_started`** (tout de suite après l'appel) :
```
┌──────────────────────────────────────┐
│ 🎨 Buck peint une image…             │
│ ▓▓▓▓░░░░░░░░░░░░  indicateur lent    │
└──────────────────────────────────────┘
```
Spinner + texte. Pas d'estimation de temps (variable de 10s à 2min).

**État 2 — partial_image #1** (~30-50% du rendu) :
```
┌──────────────────────────────────────┐
│ 🎨 Aperçu…                            │
│ ┌────────────────┐                   │
│ │ [img base64]   │  flou, progress   │
│ │ 50%            │                   │
│ └────────────────┘                   │
└──────────────────────────────────────┘
```
L'image est affichée immédiatement dès réception du 1er partial. Overlay « Aperçu… » en haut gauche.

**État 3 — partial_image #2** (~70-85%) : remplace le partial #1, même cadre.

**État 4 — `image_generation_call` final (status: completed)** :
```
┌──────────────────────────────────────┐
│ ┌────────────────┐                   │
│ │ [img finale]   │  nette            │
│ │                │                   │
│ │          [💾] [⤓] [🔍]              │
│ └────────────────┘                   │
│ « Prompt révisé par le modèle… »     │
└──────────────────────────────────────┘
```
Actions :
- **💾 Sauver dans workspace** → modal « où ? » + nom fichier pré-rempli (`image_YYYY-MM-DD_HHmmss.png`).
- **⤓ Télécharger** → blob download local (dataURL → `<a download>`).
- **🔍 Agrandir** → modal fullscreen avec l'image native.

`revised_prompt` affiché en italique sous l'image (optionnel — si présent, collapsible « Voir le prompt »).

---

## Architecture backend

### Flag user_settings

Table `user_settings` déjà présente avec `chatToolsJson` :

**Migration** `0014_image_gen.sql` :

```sql
-- Ajoute imageGen au chatToolsJson (défaut false)
-- Ajoute colonnes image_quality, image_size
ALTER TABLE user_settings
  ADD COLUMN image_quality TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE user_settings
  ADD COLUMN image_size TEXT NOT NULL DEFAULT '1024x1024';
-- chatToolsJson reçoit la clé imageGen, pas besoin de colonne dédiée
```

Le flag `imageGen: boolean` vit dans `chatToolsJson` (default `false`) pour rester cohérent avec `webSearch` et `fileSearch`.

### Injection du tool

`packages/api/src/routes/chat.ts:313-322` (bloc déjà présent pour web_search et file_search) :

```ts
if (chatTools.imageGen) {
  toolDefs.push({
    type: 'image_generation',
    action: 'auto',                       // laisse le modèle choisir generate vs edit (multi-turn)
    quality: settingsRow.imageQuality,    // 'low' | 'medium' | 'high'
    size: settingsRow.imageSize,          // '1024x1024' | '1536x1024' | '1024x1536' | 'auto'
    partial_images: 2,                    // hardcodé
    output_format: 'png',                 // hardcodé
    moderation: 'low',                    // hardcodé (contextes narratifs)
    background: 'auto',
  });
}
```

**Type ToolDef** (`packages/api/src/lib/openai.ts`) à étendre :

```ts
type ToolDef =
  | LocalFunctionTool
  | McpConnectorTool
  | { type: 'web_search_preview' | 'web_search' }
  | { type: 'file_search'; vector_store_ids: string[]; max_num_results?: number }
  | {
      type: 'image_generation';
      action?: 'auto' | 'generate' | 'edit';
      quality?: 'low' | 'medium' | 'high' | 'auto';
      size?: '1024x1024' | '1536x1024' | '1024x1536' | 'auto';
      partial_images?: 0 | 1 | 2 | 3;
      output_format?: 'png' | 'jpeg' | 'webp';
      moderation?: 'auto' | 'low';
      background?: 'transparent' | 'opaque' | 'auto';
      // Backlog v2 : input_fidelity, output_compression, input_image_mask
    };
```

### Streaming SSE — nouveaux events

`chat.ts` doit parser les events OpenAI suivants (noms verbatim depuis doc officielle) et les relayer au client :

| Event OpenAI | Payload OpenAI | Event Buck SSE | Payload Buck |
|---|---|---|---|
| `response.image_generation_call.generating` | `{item_id, output_index, sequence_number}` | `tool_started` | `{callId: item_id, toolName: 'image_generation'}` |
| `response.image_generation_call.in_progress` | idem | *(ignoré — redondant avec `generating`)* | — |
| `response.image_generation_call.partial_image` | `{item_id, partial_image_index, partial_image_b64, output_index, sequence_number}` | `image_partial` | `{callId: item_id, index: partial_image_index, b64: partial_image_b64}` |
| `response.image_generation_call.completed` | Output item `{id, type: 'image_generation_call', status: 'completed', result, revised_prompt}` | `image_done` | `{callId: id, b64: result, revisedPrompt: revised_prompt, size}` |
| `response.image_generation_call.completed` (avec `status: 'failed'`) | `{error: {code, message}}` | `image_error` | `{callId, code, message}` |

`tool_started` / `tool_result` existants sont **aussi** émis pour cohérence avec le panneau visibilité (nom tool = `image_generation`, label humanisé = « Génération d'image »).

### Usage events — budget

Chaque `image_generation_call` final génère un row `usage_events` :

```ts
{
  kind: 'image',
  model: 'gpt-image-2',
  inputTokens: usage.input_tokens,      // prompt text tokens
  outputTokens: usage.output_tokens,    // image tokens (dominant)
  costUsd: /* calculé via helper */,
  // reasoningTokens, audio*, cachedInputTokens = 0
}
```

**Helper pricing** (`packages/shared/src/pricing.ts`) — flat table `(quality, orientation) → $` (le pricing OpenAI est flat pour gpt-image-2, pas token-based côté output) :

```ts
type Orientation = 'square' | 'landscape' | 'portrait';
type Quality = 'low' | 'medium' | 'high';

const GPT_IMAGE_2_PRICING: Record<Quality, Record<Orientation, number>> = {
  low:    { square: 0.006, landscape: 0.005, portrait: 0.005 },
  medium: { square: 0.053, landscape: 0.041, portrait: 0.041 },
  high:   { square: 0.211, landscape: 0.165, portrait: 0.165 },
};

export function imageOrientation(size: string): Orientation {
  const [w, h] = size.split('x').map(Number);
  if (w === h) return 'square';
  return w > h ? 'landscape' : 'portrait';
}

export function imageCost(quality: Quality, size: string): number {
  return GPT_IMAGE_2_PRICING[quality][imageOrientation(size)];
}
```

Note : on stocke aussi `input_tokens` / `output_tokens` dans `usage_events` pour traçabilité et audit future (si OpenAI passe en token-based, migration facile).

### Sauvegarde workspace

Endpoint `POST /api/images/save` :
```ts
body: { messageId: string, callId: string, path: string }
// Lit l'image depuis le message (base64 stocké côté DB ou memoire transitoire)
// Écrit le fichier PNG dans $WORKSPACE_DIR/{path}
// Réponse : { absPath, size }
```

**Décision (Romain 2026-04-22)** : Option A — base64 persisté en DB dans `messages.images_json`, avec purge auto à 30 jours des images non sauvegardées dans workspace. Source unique, reload propre, pas de perte au refresh.

### Persistance côté message

Ajouter colonne `images_json TEXT` sur `messages` :

```sql
ALTER TABLE messages ADD COLUMN images_json TEXT;
```

Format :
```json
[
  {
    "callId": "ig_abc123",
    "b64": "iVBORw0KGgo...",
    "size": "1024x1024",
    "revisedPrompt": "A close-up portrait...",
    "savedToWorkspace": "research/covers/cover_v1.png"
  }
]
```

Au reload de session : le web parse `imagesJson` et ré-affiche les images au même endroit.

---

## Frontend — composants

### ToolCallItem — nouveau label

`packages/web/src/components/chat/tool-call-item.tsx` : mapper `image_generation` → icône 🎨 + label « Génération d'image ».

### ImageMessageBlock — nouveau

`packages/web/src/components/chat/image-message-block.tsx` :
- Props : `{ callId, b64, status, revisedPrompt?, size, onSaveToWorkspace, onDownload }`.
- States : `pending` (spinner) | `partial` (image + overlay « Aperçu… ») | `done` (image + actions).
- Stream handling : le parent `chat-stream.tsx` maintient un state `imagesInFlight: Map<callId, {b64, status, revisedPrompt?}>` et remplace `b64` à chaque `image_partial`.

### SaveToWorkspaceModal — nouveau

Modal shadcn Dialog :
- Liste les dossiers workspace (via endpoint `/api/workspace/tree`).
- Input « nom du fichier » pré-rempli.
- Bouton « Sauver » → POST `/api/images/save`.
- Toast succès avec chemin + lien « ouvrir le dossier ».

### Settings — section Images

`packages/web/src/routes/settings.tsx` : ajouter section `<ImagesSettings />` entre outils chat et voix. Composant simple :
- Toggle `imageGenEnabled` (push vers `chatToolsJson.imageGen`).
- Radio group `quality` (3 options : low/medium/high).
- Select `size` (4 options : `1024x1024`, `1536x1024`, `1024x1536`, `auto`).
- Auto-save sur change (debounce 500ms).

---

## Tests

### Unit — API

1. **`chat.test.ts`** — quand `chatToolsJson.imageGen=true`, le tool est injecté dans le body OpenAI avec les bons params (quality/size issus de user_settings).
2. **`chat.test.ts`** — events `response.image_generation_call.partial_image` relayés en `image_partial` SSE ; `image_generation_call` final → `image_done`.
3. **`pricing.test.ts`** — helper `imageCost` calcule correctement pour (low/medium/high × 1024²/1536×1024).
4. **`images.test.ts`** (nouveau) — endpoint `/api/images/save` écrit le PNG au bon endroit + refuse les path traversal (`../`).

### Unit — Web

5. **`ImageMessageBlock.test.tsx`** — transitions pending → partial (x2) → done ; actions save/download cliquables quand status=done.
6. **`settings-images.test.tsx`** — toggle off désactive radio+select ; auto-save déclenche bon PATCH.

### E2E — Playwright (gated `IMAGE_GEN_E2E=1`)

7. **`chat-image-gen.spec.ts`** — activer le flag, envoyer « Dessine un renard roux », vérifier spinner → partial → image finale + bouton save visible. Mock OpenAI SSE fixture.

---

## Migration & rollout

1. Migration `0014_image_gen.sql` : colonnes `image_quality`, `image_size` + `images_json` sur messages.
2. Backfill : aucun (valeurs par défaut).
3. Déploiement : flag `imageGen: false` par défaut → zero impact sur users existants.
4. Activation : Romain active manuellement depuis Settings.
5. Monitoring premier usage : watcher sur `usage_events.kind='image'` → valider le pricing réel vs placeholder.

---

## Gotchas identifiés

1. **Latence 2 min max** : la SSE connection doit tenir. Vérifier `keepAliveInterval` côté Caddy et Node. Si timeout < 120s → rallonger.
2. **Partial images manquants** : si le modèle décide de ne pas streamer (< partial_images tokens générés), l'UI doit supporter passer directement de `pending` à `done` sans partial. Testé en unit.
3. **Base64 lourd en DB** : une image 1024² PNG = ~500KB-2MB en base64, 1536×1024 = ~1-3MB. À 10 images / session → DB gonfle. Routine de cleanup (purge `imagesJson` des messages > 30 jours, sauf si `savedToWorkspace` est set).
4. **revised_prompt parfois absent** : selon la complexité du prompt original. UI doit gérer `undefined`.
5. **Moderation `low`** : accepte contenus matures narratifs (violence, sensualité) mais **pas NSFW explicite**. Si refus OpenAI → event `image_generation_call` avec `status: "failed"` + `error: {code: "moderation_blocked"}`. UI doit afficher erreur claire.
6. **Rate limit IPM** : tier 2 = 20 IPM, marge confortable. Gérer tout de même 429 avec retry-after respecté + toast UI explicite.
7. **Taille PNG workspace** : une 1536×1024 = ~1-3MB. Toast de save affiche la taille fichier.
8. **Message Buck reload** : au refresh de la conversation, les images doivent ré-apparaître depuis `imagesJson`, pas être regénérées. Testé e2e.

---

## Estimation révisée

| Phase | Scope | Estimation |
|---|---|---|
| 1 | Migration + schema + types ToolDef | 30min |
| 2 | Backend injection tool + SSE relay + usage_events | 1h |
| 3 | Persistance `imagesJson` + endpoint `/save` | 45min |
| 4 | UI Settings > Images | 45min |
| 5 | ImageMessageBlock + streaming partials | 1h30 |
| 6 | SaveToWorkspaceModal + actions | 45min |
| 7 | Tests unit + e2e gated | 1h |
| **Total** | | **~6h** (vs 4h estimé initialement) |

Le surcoût vs estimation initiale vient du streaming partial (nouveau depuis gpt-image-2) et de la persistance DB.

---

## Artefacts

- Spec : ce fichier
- Plan d'implémentation : à créer après validation (`docs/superpowers/plans/2026-04-22-m8b-image-generation.md`)
- Tâche gerber : `a5dc0db0` (à passer `inbox → specification` après relecture Romain, puis `specification → plan`)

---

## Décisions tranchées (2026-04-22)

1. ✅ **Persistance base64** : Option A — `messages.images_json` en DB.
2. ✅ **Purge auto** : 30 jours pour les images non sauvegardées dans workspace (cron quotidien ou purge lazy à l'INSERT).
3. ✅ **Tier OpenAI** : tier 2 (20 IPM) — marge confortable.
4. ✅ **Pricing** : flat `(quality × orientation)` — table intégrée au helper. Tailles custom hors grille non exposées v1.
5. ✅ **Coût estimé** affiché sous le selector Size dans Settings (pédagogie budget).
