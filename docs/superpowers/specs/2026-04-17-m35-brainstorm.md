# M3.5 — Brainstorm Shell Tool + Approval

**Date** : 2026-04-17

## Contexte

M3 a livré les file tools (read_file, list_directory, create_file, delete_file) et le skill loading (activate_skill). Ces tools s'exécutent automatiquement sans approbation utilisateur. Le split M3/M3.5 prévoyait que M3 pose un pattern générique "tool OpenAI -> approval user -> exécution -> retour résultat" et que M3.5 branche le shell tool dessus.

Constat : le pattern approval n'a pas été câblé en M3. Les tools s'exécutent en auto via AI SDK v6 streamText() + maxSteps: 5.

## Décisions

### Scope M3.5
M3.5 = système d'approval générique (pour tous les tools) + shell tool. Pas juste le shell tool seul.

### Classification approval
- **Sous approval obligatoire** : create_file, delete_file, shell_execute (tools avec effet de bord / destructifs)
- **Auto-exécutés** : read_file, list_directory, activate_skill (lecture seule, pas d'effet de bord)

### Sandboxing shell
Accès libre au filesystem. Le cwd par défaut = workspaceDir mais pas de confinement strict. L'approval est le garde-fou principal — l'utilisateur voit exactement la commande et décide. Modèle Claude Code.

### Protocole streaming
Pattern **Pause/Resume** : quand un tool nécessite approval, le stream se termine avec un résultat `requires_approval`. Le client affiche l'UI d'approval. L'utilisateur décide. Le client envoie une nouvelle requête POST avec la décision. L'API reprend. Pas de WebSocket, pas de SSE, HTTP classique. API stateless.

### UI output shell
Bloc terminal stylisé dédié : fond sombre, font mono, commande en header, stdout/stderr, exit code, collapsible si long.

### Sécurité
- **Kill switch pré-exécution** : regex côté serveur qui bloque les commandes destructives Linux AVANT l'approval. Dernière ligne de défense contre les hallucinations du LLM.
- **Timeout** : 30 secondes, SIGKILL
- **Troncature** : output limité à 100KB
- **Patterns bloqués** : rm -rf /, mkfs, dd destructifs, fork bombs, chmod/chown système, shutdown/reboot, etc.
- **Contexte** : Buck tourne dans Docker Linux, seuls les patterns POSIX/Linux sont pertinents
- **L'utilisateur humain** qui accède au workspace via WebDAV/explorateur n'est PAS contraint par le kill switch

### Approche implémentation
Approche stateless côté API. Pas de table DB pour les approvals pendants. Le client gère l'état de l'approval en React state. Si refresh, l'approval pending est perdu (non-problème pour un écrivain avec usage ponctuel).

Flag `toolApproval` dans le body de la requête POST /api/chat pour distinguer première requête vs reprise après approval.

### Persistance
Pas de nouvelle table. Champ `toolMeta` ajouté sur la table `messages` existante pour tracer les tool calls, décisions d'approval, et résultats.

### Test
Hello-world skill (`workspace/skills/hello-world/SKILL.md`) pour valider le flow complet : skill loading (auto) + shell tool (approval) + terminal block.

## Use cases cibles
Application pour écrivain. Usage ponctuel des tools, pas du chainage massif. Use cases :
- Manipulation fichiers/dossiers (create, move, rename, delete sous protection)
- Outils texte (grep, wc, sed)
- Potentiellement outils images (à voir plus tard)
