C'est une demande d'un mec qui commence un livre (polar).
Il voudrait être assisté par une IA
C'est donc une "commande" (gratuit mais c'est une très bonne opportunité de me faire connaitre, en bien lol)
On va prendre son temps et fignoler ça ! (sécurité, tests, données)
On reste en opensource avec des dépendences gratuites (Sauf IA)

## Projet

- Assistant d'écrivain Live + Texte tournant sur OpenAI
- OpenAI :
  - Model LLM : gpt-5.4, gpt-5.4-mini
  - Model Live : gpt-realtime-1.5
    - Voix : Toutes ID des voix OpenAI (Alloy, ...)
  - API Key : Stocker dans `.env`

- Format : Type Web app car Desktop & Mobile ciblé

- Deploy :
  - Prod : Vercel + Cloudflare
  - Dev : Local sur Mac

- Platform :
  - Windows / Mac (ciblé Windows, dev sur Mac) et Mobile

- Mes Projets références :
  - Cruchot : /Users/recarnot/dev/claude-desktop-multi-llm
  - Trinity : /Users/recarnot/dev/trinity-lifeos-agent/voice-agent
  - Gerber : /Users/recarnot/dev/agent-brain
  - Fougasse : /Users/recarnot/dev/claude-desktop-mem
  - Bible (ecrivain) : /Users/recarnot/dev/barda-mcp-ecrivain-bible

- ShadCN : Preset b1Gdz9c4A (https://ui.shadcn.com/create?preset=b1Gdz9c4A&template=vite-monorepo)

## Documentation

- https://developers.openai.com/api/reference/overview
- OpenAI ChatKit ?
- https://developers.openai.com/apps-sdk

Il **faudra choisir** entre du code pure et app-sdk

## Fonctionnalités

- Inclure les fonctionnalités de :
 - /Users/recarnot/dev/barda-mcp-ecrivain-bible
 - Pas sous forme de MCP, directement dans l'application (App Standalone)

- Pouvoir associé un et unique dossier sur le disque dur (workspace)
  - pouvoir le changer

- Chat conversation complet
  - thinking visualisation
  - Tools visualisation
  - MCP mngt
  - Skills mngt (skills/ dans workspace)
  - Joindre des Fichiers + Images avec la requete


- Un et unique prompt systeme (prompts/SYSTEM.md) dans le workspace
- Un et unique prompt users (prompts/USER.md) dans le workspace
- Un et unique prompt régles (prompts/RULES.md) dans le workspace

- Sélecteur de modèle (gpt-5.4 / gpt-5.4-mini)

- Sessions mngt (créer, archiver, renommer, supprimer)

- Pas de Auth

- Mémoire système (autre que la bible)

| Type                    | Nature                                       | Stockage typique                 | Exemple concret                                               |
| ----------------------- | -------------------------------------------- | -------------------------------- | ------------------------------------------------------------- |
| Sémantique              | Faits, connaissances générales, préférences  | Base vectorielle, knowledge base | "L'utilisateur préfère TypeScript", "Cette API utilise OAuth" |
| Épisodique              | Événements passés avec contexte temporel     | DB vectorielle + timestamps      | Historique de conversations, actions passées et résultats     |
| Procédurale             | Savoir-faire, séquences d'actions, workflows | Fichiers, base structurée        | "Pour résoudre ce type de bug, voici les 4 étapes"            |
| Court terme             | Contexte immédiat de la session en cours     | Fenêtre de contexte LLM, cache   | Le fil de la conversation actuelle                            |
| Structurée (clé-valeur) | État discret, données métier                 | ?                                | Statut d'une tâche, préférences binaires                      |

- Module Live (gpt-realtime-1.5)
  - Bonus : Toggle : Voix libre ou interagit avec session (chat)
    - Voix libre :
      - Simple conversation realtime avec le user (a toute la mémoire du LLM)
      - Peut interrogé les docs de workspace
      - Interop Live et LLM

- Mngt Backup
