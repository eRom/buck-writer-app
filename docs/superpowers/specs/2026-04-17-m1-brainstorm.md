# Brainstorm M1 — Chat OpenAI Streaming + Sessions CRUD

**Date** : 2026-04-17
**Participants** : Romain, Trinity

## Intention initiale

Buck Writer est un assistant d'ecriture connecte a OpenAI. M0 a pose les fondations (auth, SPA, API, Docker). M1 doit ajouter le coeur : un chat streaming avec gestion de sessions.

## Cas d'usage

- Chat generaliste : l'utilisateur peut parler de son bouquin comme de la meteo
- Pas de contexte force — c'est un assistant libre
- Systeme de referentiels RAG prevu (comme dans Cruchot) mais reporte a M4
- Quand les referentiels seront branches, toutes les sessions en profiteront automatiquement

## Decisions prises pendant le brainstorm

### Stack streaming
- **Vercel AI SDK** choisi (Romain connait deja via Cruchot)
- `useChat` cote client, `streamText` cote API
- Provider-agnostic : changement de provider possible sans refonte UI
- ChatKit OpenAI ecarte : Web Component Shadow DOM, lock-in total, zero controle design
- ChatKit-js explore (github.com/openai/chatkit-js) : confirme que c'est tout-ou-rien, pas de composants headless reutilisables

### Sessions
- Creation implicite (premier message cree la session) ET explicite (bouton "Nouveau chat")
- Titre auto-genere par gpt-5.4-nano apres le premier echange (fire-and-forget)
- Sidebar complete : liste + renommage + suppression soft + archivage + recherche + groupement par date (aujourd'hui / 7j / 30j / plus ancien)

### Modeles
- Selecteur de modele par message (pas par session)
- L'utilisateur peut changer de modele entre chaque message
- Modeles disponibles definis dans PRICING (shared) : gpt-5.4, gpt-5.4-mini, gpt-5.4-pro, gpt-5.4-nano

### Rendu markdown
- Markdown complet : gras, italique, listes, liens, code inline
- Blocs de code avec syntax highlighting
- Tableaux
- LaTeX
- Pas de visualisation d'outils detaillee — juste une indication discrète "Appel d'outil..." quand pertinent (different de Cruchot)

### Prompts
- 3 fichiers montes en dur dans le repo :
  - `prompts/SYSTEM.md` — personnalite / role
  - `prompts/USER.md` — template message utilisateur
  - `prompts/RULES.md` — regles / contraintes
- Lus au demarrage, caches en memoire
- Pas de sandbox en M1, donc fichiers dans le repo directement

### Design
- Design system erom deja en place via preset shadcn b1Gdz9c4A
- Dark-first, gris chauds, amber brand, borders > shadows
- Composants React custom (pas de librairie chat UI tierce)

## Ce qui est explicitement hors scope M1

- RAG / Referentiels → M4 (on prendra Cruchot comme reference)
- Attachments / uploads → M3
- Metriques / hard-stop budget → M2
- MCP Bible → M4
- CI/CD / deploy → M5
- CSRF refresh first-POST → M1 (finding review en attente)
- Graceful shutdown → M5 (finding review en attente)

## Points d'attention mentionnes

- Le schema DB est deja en place (chatSessions, messages, usageEvents, userSettings) — quasi rien a changer
- Seul ajout DB : colonne `model` sur `messages` pour le selecteur par message
- Le preset shadcn est deja installe, les CSS variables sont en place
- 58 tests unitaires + 1 e2e deja verts a maintenir
