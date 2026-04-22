# UX — Visibilité des tool calls et activités dans le chat — Design

> **Status** : Spec en relecture
> **Date** : 2026-04-22
> **Tâche gerber** : `83aea2c3-76cf-4529-ac55-e8469ca9848a` (high)
> **Origine** : Feedback Romain pendant le test M6 — *« on ne sait pas si il y a quelque chose qui tourne, dois-je attendre, refaire... »*

---

## Objectif

Rendre **visible et lisible** dans la bulle assistant tout ce que Buck est en train de faire entre l'envoi d'un message user et la réception finale de la réponse :

1. Extraction d'attachments (M6 MarkItDown).
2. Réflexion du modèle (« thinking » avant le premier token).
3. Tool calls locaux (recall, remember, file_*, shell_execute, todos_*, activate_skill).
4. Tool calls MCP (Bible, writing-tools).
5. Tools natifs OpenAI (web_search_preview, file_search).
6. Erreurs de tools (tooltip explicite + état rouge).

L'utilisateur doit savoir à tout moment **ce qui se passe**, **ce qui a réussi**, **ce qui a échoué**, et **pourquoi attendre encore**.

---

## Audit de l'existant (état 2026-04-22)

### Backend SSE — déjà solide

`packages/api/src/routes/chat.ts:375-682` émet déjà un flux structuré :

| Event | Payload | Émis quand |
|---|---|---|
| `content` | `{text}` | Delta de texte assistant |
| `tool_started` | `{callId, toolName}` | Tool local commence |
| `tool_result` | `{callId, toolName, result}` | Tool local termine |
| `tool_approval` | `{callId, toolName, args}` | Tool local nécessite approbation |
| `mcp_call_started` | `{itemId, serverLabel, toolName}` | Tool MCP commence |
| `mcp_call_done` | `{itemId, serverLabel, toolName}` | Tool MCP termine |
| `mcp_call_error` | `{itemId, serverLabel, toolName, error}` | Tool MCP échoue |
| `mcp_approval` | `{approvalRequestId, serverLabel, toolName, arguments}` | MCP approval |
| `memory_status` | `{degraded}` | Layer mémoire dégradé |
| `user_saved` / `assistant_saved` | `{id}` | IDs DB persistés |
| `done` | `{usage, pendingApproval}` | Fin du stream |
| `error` | `{code, message, link?}` | Erreur fatale |

### Backend extraction attachments — silencieux

`packages/api/src/services/attachmentExtractor.ts:62-110` est appelé **synchronement** dans `chat.ts:283` **avant** l'ouverture du stream SSE. Aucun event n'est émis pendant l'extraction. Les champs DB sont persistés (`extractedText`, `extractionStatus`, `extractionError`, `extractionSource`, `extractedAt`).

### Backend route attachment — incomplète

`packages/api/src/routes/attachments.ts:225-255` (`GET /api/attachments/:id`) ne retourne **que le binaire**. Aucune route n'expose les métadonnées d'extraction.

### Frontend — consomme partiellement

`packages/web/src/components/chat/chat-stream.tsx:269-414` traite tous les events SSE listés ci-dessus, mais le **rendu visuel se limite à un spinner unique** avec un label brut (`chat-stream.tsx:630-640`) :

```tsx
showActivity ? (
  <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
    <span className="inline-block size-2 animate-pulse rounded-full bg-primary" />
    {toolActivity.label}...
  </span>
)
```

Pas d'historique des tool calls passés, pas d'icône, pas d'état (pending/done/failed), pas de tooltip d'erreur, pas de timeline multi-step.

### Frontend — composant attachment orphelin

`packages/web/src/components/chat/attachment-display.tsx` existe mais **n'est jamais rendu**. `message-user.tsx:12-39` ignore complètement les attachments du message.

---

## Choix validés

| Décision | Valeur |
|---|---|
| Périmètre | Tous les types de tools (locaux, MCP, OpenAI natifs) |
| Granularité | Une « ligne d'activité » par tool call, conservée après complétion |
| Position | Dans la bulle assistant en cours, **au-dessus** du texte streamé |
| États | `pending` (spinner) → `done` (✓) ou `failed` (✗ + tooltip) |
| Historique | Conservé après le `done` du stream — l'utilisateur peut relire les étapes |
| Stepping | Pas de compteur step explicite — l'enchaînement de tool calls **est** la timeline |
| Extraction attachment | Affichée dans la **bulle user**, pas la bulle assistant |
| Spinner « thinking » | Affiché tant qu'on n'a reçu **ni** `content` **ni** un tool event, pour combler le délai initial |
| Approval | Rendu existant conservé (carte d'approbation), inchangé |
| Erreurs tool | Tooltip au survol + ligne rouge ; pas de modale |
| i18n | Labels FR uniquement (cohérent avec le reste de Buck) |

---

## Architecture frontend cible

### Nouveau type `ToolActivityEntry`

```ts
type ToolActivityEntry = {
  id: string;              // callId | itemId
  kind: 'local' | 'mcp' | 'openai';
  toolName: string;        // 'recall', 'bible.search', 'web_search_preview', ...
  label: string;           // libellé FR humain
  icon: LucideIcon;        // mappé via toolName
  status: 'pending' | 'done' | 'failed';
  error?: string;          // message d'erreur si failed
  startedAt: number;
  endedAt?: number;
};
```

Stocké dans un `useState<ToolActivityEntry[]>` au niveau de `chat-stream.tsx`, persisté dans `messages.metadata.toolActivities` (JSON) côté API quand `assistant_saved` arrive — pour que l'historique reste visible après refresh.

### Nouveau composant `ToolActivityList`

`packages/web/src/components/chat/tool-activity-list.tsx`

- Rend une liste verticale compacte d'`<ToolActivityItem />`.
- Chaque item : icône + label + état (spinner / check / cross) + durée si done.
- Tooltip `shadcn/ui` au survol pour afficher l'erreur ou les args (debug).

### Mapping `toolName → label + icon`

Fichier `packages/web/src/components/chat/tool-activity-meta.ts` :

| toolName | Label FR | Icon Lucide |
|---|---|---|
| `recall` | Recherche dans ma mémoire | Brain |
| `remember` | Mise à jour de ma mémoire | Save |
| `read_file` | Lecture de fichier | FileText |
| `list_directory` | Liste de répertoire | FolderOpen |
| `create_file` | Création de fichier | FilePlus |
| `delete_file` | Suppression de fichier | FileX |
| `shell_execute` | Exécution shell | Terminal |
| `activate_skill` | Activation de skill | Sparkles |
| `todos_*` | Gestion des tâches | ListChecks |
| `web_search_preview` | Recherche web | Globe |
| `file_search` | Recherche fichiers OpenAI | Search |
| MCP `bible.*` | Bible — *toolName* | BookOpen |
| MCP `writing-tools.*` | Writing tools — *toolName* | PenTool |
| MCP autres | *serverLabel* — *toolName* | Plug |
| Fallback | *toolName* | Wrench |

### Spinner « thinking »

Tant que le state local `entries.length === 0 && streamedContent === ''`, afficher au-dessus de la bulle assistant :

```tsx
<span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
  <Loader2 className="size-3 animate-spin" />
  Buck réfléchit…
</span>
```

Disparaît dès qu'un event `content` ou un tool event arrive.

---

## Architecture backend

### Persistance des tool activities

Schéma `messages.metadata` (JSON déjà nullable) accueille un champ `toolActivities: ToolActivityEntry[]`. Pas de migration nécessaire (déjà JSON libre).

À la fin du stream, juste avant l'event `assistant_saved`, on sérialise les activités collectées dans `chat.ts` (en parallèle de l'accumulation actuelle) et on les persiste dans `messages.metadata`.

### Nouvelle route `GET /api/attachments/:id/meta`

`packages/api/src/routes/attachments.ts` — ajouter une route à côté de l'existante :

```ts
GET /api/attachments/:id/meta
→ { id, filename, mimeType, sizeBytes,
    extractionStatus: 'ok' | 'failed' | 'skipped',
    extractionSource: 'plain' | 'markitdown' | null,
    extractionError: string | null,
    extractedChars: number | null,
    extractedAt: number | null }
```

Auth : même middleware que la route binaire existante.

---

## Architecture frontend — bulle user (extraction)

`packages/web/src/components/chat/message-user.tsx` :

- Brancher `<AttachmentDisplay attachments={message.attachments} />` (composant orphelin réutilisé).
- Étendre `AttachmentDisplay` pour fetcher `/api/attachments/:id/meta` (TanStack Query) et afficher pour chaque attachment :
  - **OK** : badge vert `✓ extrait • {chars} caractères • {source}` (markitdown / plain).
  - **Skipped** : badge gris `— non extrait` + tooltip mime non supporté.
  - **Failed** : badge rouge `✗ extraction échouée` + tooltip avec `extractionError`.

---

## Stratégie de test

### Tests unitaires (Vitest)

- `tool-activity-meta.test.ts` : vérifie le mapping toolName → label/icon pour chaque cas listé + fallback.
- `chat-stream.test.tsx` (extension) : un test par event SSE qui vérifie qu'une entry est créée/mise à jour avec le bon état.
- `attachments.test.ts` (api) : nouvelle route `/meta` retourne les bons champs, 404 sur id inconnu, 403 si pas owner.

### Tests E2E (Playwright)

Un seul test ciblé `tool-visibility.spec.ts` :

1. Login dev, upload PDF, envoyer message « résume ».
2. Assert : badge `✓ extrait` visible sur la bulle user.
3. Assert : ligne `🧠 Recherche dans ma mémoire` apparaît puis passe à l'état `done` dans la bulle assistant.
4. Assert : spinner « Buck réfléchit » visible avant le premier token, disparaît après.

### Tests manuels

- Cas erreur : tuer markitdown-worker, upload PDF → badge rouge + tooltip.
- Cas multi-step : poser une question qui déclenche `recall` → `bible.search` → réponse, vérifier la timeline ordonnée.
- Cas refresh : reload une session passée → les tool activities persistées sont rendues.

---

## Out of scope (volontaire)

- Pas de **timeline horizontale** ni de compteur `Step N/8` — l'enchaînement vertical des tool calls suffit.
- Pas de **graphe d'appels** ni de visualisation des arguments structurés.
- Pas de **stream des résultats** de tool dans l'UI (les résultats restent invisibles, seul l'état est exposé).
- Pas de **ré-essai** au clic sur un tool failed.
- Pas de modification du système d'**approval** existant.

---

## Risques / points d'attention

1. **Stream truncation** : si le stream coupe avant `assistant_saved`, les `toolActivities` ne sont pas persistées. Mitigation : on les recalcule côté front à partir des events reçus, et on les sauvegarde uniquement quand `assistant_saved` arrive (status quo, accepté).
2. **Bruit visuel** : un message qui déclenche 8 tools va afficher 8 lignes. Décision : compact (line-height serré, icône 14px), accepté par défaut.
3. **Compatibilité messages anciens** : les messages assistant pré-feature n'ont pas de `metadata.toolActivities` → on ne rend rien, pas de fallback. OK.
4. **Coût route `/meta`** : 1 fetch par attachment user. Acceptable (rarement > 3 attachments par message).

---

## Critères de succès

- [ ] Spinner « Buck réfléchit » visible dans les 200ms après envoi.
- [ ] Chaque tool call apparaît avec son icône + label FR + état.
- [ ] Erreur MCP affichée avec tooltip lisible.
- [ ] Bulle user affiche l'état d'extraction de chaque attachment (✓ / — / ✗).
- [ ] Refresh d'une session conserve l'historique des tool activities.
- [ ] Test E2E `tool-visibility.spec.ts` vert.
- [ ] Aucun event SSE ignoré silencieusement (review manuelle de `chat-stream.tsx`).
