# M3 — Attachments + WebDAV + Workspace

**Date** : 2026-04-17
**Scope** : Upload de fichiers dans le chat, serveur WebDAV, file browser, file tools OpenAI, skills workspace

## Contexte

Buck Writer M1 fournit le chat streaming OpenAI avec sessions CRUD. M2 ajoute les metriques et le budget. M3 enrichit l'experience avec la gestion de fichiers : l'utilisateur peut joindre des documents a ses messages, naviguer son workspace depuis le navigateur ou via Finder/Explorer, et l'assistant peut lire/ecrire des fichiers de maniere autonome.

## Decisions cles

- **Attachments** : drag & drop + bouton clip + paste images dans le chat input
- **Types supportes** : images (JPEG, PNG, GIF, WebP) via vision OpenAI + documents (PDF, TXT, MD, DOCX) via extraction texte
- **WebDAV** : serveur natif sur `/webdav/*`, accès Finder/Explorer avec token dedie
- **File browser web** : page dediee `/workspace` + panel droit collapsible dans le chat
- **File tools OpenAI** : `read_file`, `list_directory`, `create_file` (execution directe), `delete_file` (approval user)
- **@Reference** : autocomplete workspace dans le chat input, injection contenu dans le contexte
- **Skills** : dossier `skills/` dans le workspace, format OpenAI `SKILL.md` (frontmatter YAML), activation par le modele via tool `activate_skill`
- **Architecture** : WebDAV lib + routes Hono separees (pas de service intermediaire), `assertSafePath` pour la securite
- **Shell tool** reporte a M3.5 (additif, meme pattern d'approval)

## Architecture

```
Web (React SPA)
  |
  |--- POST /api/chat (streaming, avec attachments + file tools)
  |--- GET/POST/PATCH/DELETE /api/workspace/* (file ops REST)
  |--- POST /api/attachments (upload multipart)
  |--- @ autocomplete (via GET /api/workspace/tree)
  |
  |--- File Browser page (/workspace)
  |--- File Browser panel (dans le chat, panel droit collapsible)
  |
API (Hono)
  |
  |--- /api/workspace/* — routes REST pour file ops
  |--- /api/attachments  — upload/gestion des pieces jointes
  |--- /webdav/*         — handler WebDAV (lib) pour acces natif OS
  |--- /api/chat         — streaming + file tools OpenAI + skills
  |
  |--- WORKSPACE_DIR (filesystem)
  |     |-- skills/      — SKILL.md files (format OpenAI)
  |     |-- prompts/     — SYSTEM.md, USER.md, RULES.md (existant)
  |     |-- .attachments/ — fichiers joints stockes
  |     +-- ...          — fichiers utilisateur libres
  |
OpenAI API
  |--- streamText() avec tools: [read_file, list_directory, create_file, delete_file, activate_skill]
  |--- images via vision (attachments)
  |--- documents texte injectes dans le contexte
```

### Flux d'un message avec attachments

1. L'utilisateur attache des fichiers (drag & drop / clip / paste) — preview inline dans le ChatInput
2. Au submit, les fichiers sont uploades via `POST /api/attachments` (multipart) — stockes dans `WORKSPACE_DIR/.attachments/<userId>/<uuid>-<filename>`
3. L'API retourne les metadata (id, filename, mimeType, sizeBytes, path)
4. Le message est envoye a `/api/chat` avec les IDs d'attachments dans le body
5. Cote API : images envoyees a OpenAI via vision (content part `image_url`), documents extraits en texte et injectes comme content part `text`
6. Les attachments sont lies au message en DB (table `attachments`, colonne `messageId`)

### Flux d'un @reference

1. L'utilisateur tape `@` dans le chat input — dropdown autocomplete filtre sur l'arborescence workspace
2. A la selection, le contenu du fichier est fetch via `GET /api/workspace/file?path=...`
3. Injecte dans le body du message : `{ references: [{ path, content }] }`
4. Cote API, les references sont ajoutees comme content parts `text` dans le message user avant l'appel OpenAI

## Schema DB

### Tables existantes (pas de changement)

- `attachments` — `id`, `messageId` (nullable, FK messages), `userId` (FK users), `filename`, `mimeType`, `sizeBytes`, `path`, `createdAt`

Aucune migration necessaire. La table `attachments` existe deja avec exactement les colonnes requises.

## Routes API

Toutes protegees par `authGuard`.

### POST /api/attachments

- Body : multipart form-data avec un ou plusieurs fichiers
- Validation : type MIME whitelist, taille max 20 MB par fichier, max 5 fichiers par requete
- Stockage : `WORKSPACE_DIR/.attachments/<userId>/<uuid>-<filename>`
- Retourne : `{ attachments: [{ id, filename, mimeType, sizeBytes, path }] }`
- Types acceptes : image/jpeg, image/png, image/gif, image/webp, text/plain, text/markdown, application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document

### GET /api/workspace/tree

- Retourne l'arborescence complete du `WORKSPACE_DIR`
- Format : `{ tree: [{ name, path, type: 'file'|'directory', children?, size?, mimeType? }] }`
- Utilise par le `@` autocomplete et le file browser

### GET /api/workspace/file?path=...

- Lire/telecharger un fichier du workspace
- `assertSafePath(WORKSPACE_DIR, path)` obligatoire
- Retourne le contenu avec le bon Content-Type

### POST /api/workspace/file

- Body : multipart form-data (fichier + path destination)
- Cree ou ecrase un fichier dans le workspace
- `assertSafePath` obligatoire

### PATCH /api/workspace/file?path=...

- Body : `{ newName: string }`
- Renomme le fichier ou dossier
- `assertSafePath` sur l'ancien et le nouveau path

### DELETE /api/workspace/file?path=...

- Supprime un fichier ou dossier
- `assertSafePath` obligatoire
- Interdit de supprimer `prompts/` et `skills/` eux-memes (le contenu oui, les dossiers racine non)

### POST /api/workspace/directory

- Body : `{ path: string }`
- Cree un dossier (recursif si necessaire)
- `assertSafePath` obligatoire

## WebDAV

### Serveur

- Lib `webdav-server` (npm, RFC 4918)
- Monte sur `/webdav/*` dans Hono via adaptateur
- Root = `WORKSPACE_DIR`
- Auth : Bearer token JWT avec scope `webdav`
- Read/write complet

### Token WebDAV

- Genere dans la page Settings via `POST /api/auth/webdav-token`
- JWT longue duree (30 jours), scope `webdav`
- Session en DB (`sessions_auth` avec scope `webdav`) — revocable
- Affiche une seule fois a la generation

### Wizard connexion (Settings)

- Detection OS via User-Agent
- Instructions step-by-step :
  - **macOS** : Finder → Aller → Se connecter au serveur (Cmd+K) → `https://<host>/webdav` → nom d'utilisateur quelconque, token comme mot de passe
  - **Windows** : Explorateur → Connecter un lecteur reseau → `https://<host>/webdav` → token comme mot de passe
- Section dediee dans la page Settings existante

## File Tools OpenAI

Tools declares dans l'appel `streamText()` :

### read_file

- Parametres : `{ path: string }`
- Execution directe (pas d'approval)
- `assertSafePath` obligatoire
- Limite : 1 MB max retourne au modele
- Retourne le contenu texte du fichier

### list_directory

- Parametres : `{ path?: string }` (default = root workspace)
- Execution directe
- `assertSafePath` obligatoire
- Retourne la liste des fichiers/dossiers avec type et taille

### create_file

- Parametres : `{ path: string, content: string }`
- Execution directe (pas d'approval)
- `assertSafePath` obligatoire
- Interdit d'ecrire dans `prompts/` (reserve)
- Autorise dans `skills/` et le reste

### delete_file

- Parametres : `{ path: string }`
- **Approval requis**
- `assertSafePath` obligatoire

### Approval flow (generique)

1. Le modele appelle un tool a approval (ex: `delete_file`)
2. L'API detecte que c'est un tool a approval, suspend le stream
3. Renvoie un chunk special au client : `{ type: 'tool_approval', toolName, args }`
4. Le client affiche un bloc dans le chat : "L'assistant veut supprimer `<path>` — **Autoriser** / **Refuser**"
5. Le client renvoie la decision via le protocole AI SDK
6. L'API reprend le stream avec le resultat du tool (succes ou refus)

Ce pattern est generique — M3.5 branchera `shell_exec` dessus sans modification.

## Skills workspace

### Chargement

- Au demarrage de l'API, scan de `WORKSPACE_DIR/skills/*/SKILL.md`
- Chaque `SKILL.md` est parse : frontmatter YAML (`name`, `description`) + body markdown (instructions)
- Stockes en memoire dans un `Map<name, Skill>`
- Rechargement via file watcher (`fs.watch` sur `skills/`) — ajout/suppression/modification detectes a chaud

### Injection dans le contexte OpenAI

- L'arborescence des skills disponibles (nom + description) est ajoutee au system prompt
- Tool `activate_skill({ name })` : le modele l'appelle pour charger les instructions completes d'un skill
- Le tool retourne le contenu markdown complet du SKILL.md
- Economie de tokens : seuls les skills actives sont charges en contexte

### Format SKILL.md

```yaml
---
name: polar-structure
description: Guide de structure narrative pour roman policier
---

# Structure narrative polar

## Regles
- Chaque chapitre doit faire avancer l'intrigue ET reveler un trait de personnage
...
```

### Pas d'UI de gestion des skills

L'utilisateur cree/modifie les skills via le file browser web ou via Finder/Explorer (WebDAV). Le rechargement est automatique.

## Securite

### Path traversal

Toutes les operations filesystem passent par `assertSafePath(WORKSPACE_DIR, path)` (existant M0). Aucun acces en dehors du workspace.

### Guards LLM (RULES.md)

Le fichier `prompts/RULES.md` inclut des contraintes pour cadrer le modele :
- Interdiction de supprimer en masse
- Interdiction de sortir du workspace
- Comportement attendu sur Windows et macOS

### Attachments

- Types MIME whitelistes strictement
- Taille max 20 MB par fichier, 5 fichiers par message
- Stockage dans `.attachments/` (sous-dossier du workspace, pas expose directement dans le file browser)

### WebDAV

- Auth JWT scope `webdav` obligatoire
- Token revocable via Settings
- Meme `WORKSPACE_DIR` que les routes REST

## UI

### Layout global

```
+----------------+-------------------------------+----------------+
|  Sidebar       |  Chat Area                    |  Workspace     |
|  gauche        |  flex-1                       |  Panel droit   |
|  240px         |                               |  240px         |
|  collapsible   |  Messages avec attachments    |  collapsible   |
|                |  (thumbnails, chips docs)     |                |
|  Sessions      |                               |  Arborescence  |
|  (existant)    |  Tool call indicators         |  fichiers      |
|                |  Approval blocks              |                |
|                |                               |  Actions:      |
|                |  [+] [@...input...] [Envoyer] |  Upload, New+  |
+----------------+-------------------------------+----------------+
```

### Composants nouveaux

| Composant | Responsabilite |
|-----------|---------------|
| `AttachmentPreview` | Preview inline dans ChatInput (thumbnail images, chip documents avec icone + nom + taille, bouton supprimer) |
| `AttachmentDisplay` | Rendu des attachments dans un message envoye (thumbnail cliquable pour images, chip pour docs) |
| `ApprovalBlock` | Bloc approval tool dans le chat (bordure amber, boutons Autoriser/Refuser) |
| `ToolCallIndicator` | Indicateur discret d'appel de tool (nom du tool + arguments) |
| `WorkspacePanel` | Panel droit collapsible, arborescence fichiers, actions CRUD |
| `WorkspacePage` | Page dediee `/workspace` — vue complete grille/liste, breadcrumb, drag & drop upload |
| `FileTree` | Arborescence navigable (partage entre panel et page) |
| `AtReference` | Dropdown autocomplete `@` dans le ChatInput |
| `WebDavWizard` | Section Settings : generation token + instructions connexion OS |

### Design

Design system erom via preset shadcn `b1Gdz9c4A` — dark-first, gris chauds (hue 90), amber brand, borders > shadows. Les CSS variables du preset sont deja en place.

### Extraction texte documents

- TXT, MD → lecture directe (`fs.readFile`)
- PDF → `pdf-parse` (lib legere, extraction texte)
- DOCX → `mammoth` (extraction texte depuis Word)

## Dependencies nouvelles

```
@buck/api:
  webdav-server         — serveur WebDAV RFC 4918
  pdf-parse             — extraction texte PDF
  mammoth               — extraction texte DOCX

@buck/web:
  (aucune)              — drag & drop / paste / autocomplete = natif React + shadcn existants

@buck/shared:
  (aucune)              — schemas Zod pour attachments/workspace ajoutes dans le package existant
```

## Strategie de test

### Tests unitaires (Vitest)

- **Routes `/api/workspace/*`** : CRUD fichiers/dossiers, `assertSafePath` bloque les traversals, limites taille, types MIME
- **Routes `/api/attachments`** : upload multipart, validation type/taille, liaison au message
- **File tools OpenAI** : `read_file`/`list_directory`/`create_file` execution directe, `delete_file` approval flow
- **Skills loader** : parse frontmatter, rechargement a chaud, skill invalide ignore
- **@reference** : resolution path, injection contenu dans le message
- **Extraction docs** : PDF → texte, DOCX → texte, MD/TXT passthrough
- **Composants web** : FileTree rendu, AttachmentPreview, ApprovalBlock, WorkspacePanel

### Tests e2e (Playwright)

- Upload fichier dans le chat → visible dans le message → assistant le voit
- File browser : naviguer, creer dossier, upload, renommer, supprimer
- `@reference` : taper @, autocomplete, selectionner, envoyer

### Objectif

Maintenir la base existante (~98 tests) et ajouter ~25-30 tests unitaires + 2-3 scenarios e2e.

## Variables d'environnement

Aucune nouvelle variable. `WORKSPACE_DIR` existe deja.

## Hors scope M3

- Shell tool (→ M3.5, additif, meme pattern d'approval)
- RAG vectoriel / embeddings (→ M4)
- MCP Bible (→ M4)
- CI/CD / deploy (→ M5)
- Module Live / realtime (→ futur)
