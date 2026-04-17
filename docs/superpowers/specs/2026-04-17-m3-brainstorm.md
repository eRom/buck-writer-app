# Brainstorm M3 — Attachments + WebDAV + Workspace

**Date** : 2026-04-17
**Participants** : Romain, Trinity

## Intention initiale

Buck Writer M1 fournit le chat streaming, M2 les metriques/budget. M3 ajoute la gestion de fichiers : joindre des documents au chat, naviguer le workspace, et donner au LLM la capacite de lire/ecrire dans le workspace de l'utilisateur.

## Perimetre valide

Le scope M3 couvre tout le filesystem : attachments chat + WebDAV + file browser + file tools OpenAI + skills + workspace awareness. Le shell tool est reporte a M3.5 (additif, pas de refactor).

## Decisions prises pendant le brainstorm

### Attachments chat
- **Drag & drop + bouton clip + paste images** (combo complet)
- Types supportes : images (JPEG, PNG, GIF, WebP) via vision OpenAI + documents (PDF, TXT, MD, DOCX) via extraction texte
- Limite 20 MB par fichier, 5 fichiers par message
- Extraction texte : pdf-parse (PDF), mammoth (DOCX), lecture directe (TXT, MD)

### WebDAV
- Serveur WebDAV natif sur `/webdav/*` pour acces Finder/Explorer
- Token JWT scope `webdav` (longue duree 30 jours, revocable)
- Wizard connexion guide dans Settings avec detection OS (macOS: Cmd+K dans Finder, Windows: Map network drive)
- Motivation : l'utilisateur cible est un ecrivain non-tech, il faut guider

### File browser web
- **CRUD complet** : naviguer, upload, creer dossier, renommer, supprimer, download
- Deux presentations : page dediee `/workspace` (vue complete) + panel droit collapsible dans le chat (version compacte)
- Le panel droit est generique (pourra accueillir d'autres contenus plus tard), toggle comme la sidebar gauche
- Pas d'editeur inline (option ecartee) — l'edition se fait via les outils natifs (Finder/Explorer via WebDAV)

### File tools OpenAI
- 4 tools : `read_file`, `list_directory`, `create_file`, `delete_file`
- `read_file`, `list_directory`, `create_file` : execution directe sans approval
- `delete_file` : approval user requis dans le chat (Autoriser/Refuser)
- `create_file` : pas de confirmation (Romain a explicitement valide)
- Pattern d'approval generique pour accueillir `shell_exec` en M3.5
- Guards supplementaires via `prompts/RULES.md` pour cadrer le LLM (Windows/macOS)

### @Reference
- Autocomplete simple : l'utilisateur tape `@`, dropdown filtre sur l'arborescence workspace
- Pas de preview inline, pas de multi-select — juste selection et injection du contenu
- Le contenu du fichier selectionne est injecte dans le contexte du message envoye a OpenAI

### Skills workspace
- Dossier `skills/` dans le workspace, format OpenAI `SKILL.md` (frontmatter YAML name+description + body markdown)
- Conforme a la spec OpenAI skills (https://developers.openai.com/api/docs/guides/tools-skills)
- Le modele active un skill via un tool `activate_skill` — economie de tokens
- Rechargement a chaud via file watcher
- Pas d'UI de gestion — creation/modification via file browser ou Finder/Explorer

### Architecture
- **Option A retenue** : WebDAV lib + routes Hono separees (pas de service intermediaire)
- `assertSafePath` existant couvre la securite path traversal
- Deux chemins vers le filesystem : REST (file browser, tools, @ref) et WebDAV (OS natif)

### M3.5 — Shell tool (reporte)
- Shell tool OpenAI en mode local
- Meme pattern d'approval que `delete_file`
- Additif, aucun refactor de M3 necessaire
- Decision prise de separer pour garder M3 focus sur le filesystem

## Ce qui est explicitement hors scope M3

- Shell tool → M3.5
- RAG vectoriel / embeddings → M4
- MCP Bible → M4
- CI/CD / deploy → M5
- Module Live / realtime → futur
- Editeur inline dans le file browser → ecarte (WebDAV couvre le besoin)

## Points d'attention

- Table `attachments` deja dans le schema DB (M0) — aucune migration necessaire
- JWT scope `webdav` deja prevu dans le payload (M0)
- Vite proxy `/webdav` deja configure (M0)
- `WORKSPACE_DIR` et volume Docker deja en place (M0)
- `assertSafePath` deja implemente et teste (M0)
- ~98 tests existants a maintenir
