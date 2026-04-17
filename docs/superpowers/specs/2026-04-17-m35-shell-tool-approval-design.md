# M3.5 — Shell Tool + Système d'Approval Générique

**Date** : 2026-04-17
**Statut** : Draft
**Prérequis** : M3 (Attachments + WebDAV + Workspace) mergé

## Résumé

M3.5 ajoute deux fonctionnalités liées :

1. **Système d'approval générique** pour les tool calls OpenAI — certains tools nécessitent l'approbation explicite de l'utilisateur avant exécution.
2. **Shell tool** (`shell_execute`) — permet au modèle d'exécuter des commandes shell dans le workspace, sous approval obligatoire.

Le pattern approval est conçu pour être générique : tout tool peut être marqué comme nécessitant une approbation via configuration.

## Contexte

M3 a introduit les file tools (read_file, list_directory, create_file, delete_file) et le skill loading (activate_skill). Ces tools s'exécutent automatiquement via AI SDK v6 `streamText()` + `maxSteps: 5`. Le shell tool est un ajout plus risqué qui nécessite un garde-fou utilisateur.

L'application cible un écrivain qui utilise des tools ponctuellement — pas un développeur qui chaîne 50 tool calls. Le flow doit être simple et non intrusif.

## Classification des tools

| Tool | Approval | Justification |
|------|----------|---------------|
| `read_file` | Auto | Lecture seule, confiné au workspace |
| `list_directory` | Auto | Lecture seule, confiné au workspace |
| `activate_skill` | Auto | Chargement d'instructions, pas d'effet de bord |
| `create_file` | **Approval requis** | Écrit sur le filesystem |
| `delete_file` | **Approval requis** | Suppression de fichiers |
| `shell_execute` | **Approval requis** | Exécution arbitraire |

Configuration : tableau `TOOLS_REQUIRING_APPROVAL` dans la config API. Extensible pour les futurs tools.

## Architecture : Protocole Pause/Resume

### Principe

L'API reste **stateless**. Pas de table DB pour les approvals pendants, pas de WebSocket.

Quand un tool sous approval est appelé par le modèle, le tool retourne un résultat `requires_approval` au lieu de s'exécuter. Le stream se termine naturellement. Le client détecte ce résultat, affiche l'UI d'approval, et envoie une nouvelle requête avec la décision.

### Flow détaillé

```
1. Client POST /api/chat { messages }
   → API streamText() avec tools
   → Modèle appelle shell_execute("ls -la")
   → Tool wrapper détecte : shell_execute ∈ TOOLS_REQUIRING_APPROVAL
   → Tool execute() retourne { status: "requires_approval", toolName, args }
   → Le modèle reçoit ce résultat, le stream se termine

2. Client reçoit la fin du stream
   → Inspecte les messages : détecte tool_result avec status "requires_approval"
   → Affiche ApprovalBlock (commande, boutons Autoriser/Refuser)

3a. Utilisateur clique "Autoriser"
   → Client POST /api/chat {
       messages,
       toolApproval: { toolCallId, toolName, args, approved: true }
     }
   → API exécute réellement le tool
   → API relance streamText() avec le vrai résultat dans les messages
   → Stream reprend

3b. Utilisateur clique "Refuser"
   → Client POST /api/chat {
       messages,
       toolApproval: { toolCallId, toolName, args, approved: false }
     }
   → API injecte un tool_result "L'utilisateur a refusé l'exécution"
   → Le modèle s'adapte ("D'accord, je n'exécuterai pas cette commande")
```

### Distinction première requête vs reprise

Le champ `toolApproval` dans le body de la requête :
- **Absent** → requête normale, les tools sous approval retournent `requires_approval`
- **Présent avec `approved: true`** → l'API exécute le tool, injecte le résultat, et relance le stream
- **Présent avec `approved: false`** → l'API injecte un message de refus et relance le stream

## Shell Tool : `shell_execute`

### Définition

```typescript
shell_execute({
  command: string,     // Commande à exécuter
  cwd?: string,        // Répertoire de travail (défaut: workspaceDir)
})
```

### Exécution

- Méthode : `child_process.execFile('/bin/sh', ['-c', command])`
- Timeout : 30 secondes (SIGKILL)
- Max buffer : 100KB (stdout + stderr combinés)
- CWD : `cwd` si fourni (validé dans workspaceDir), sinon workspaceDir
- Environnement : PATH verrouillé à `/usr/local/bin:/usr/bin:/bin`, pas de secrets injectés

### Résultat retourné au modèle

```typescript
{
  stdout: string,
  stderr: string,
  exitCode: number,
  killed: boolean,      // true si timeout atteint
  truncated: boolean,   // true si output tronqué à 100KB
}
```

## Kill Switch pré-exécution

Dernière ligne de défense contre les hallucinations destructives du modèle. Vérifié côté serveur AVANT l'approval (la commande bloquée n'est jamais présentée à l'utilisateur pour approbation).

### Patterns bloqués (regex)

| Catégorie | Patterns |
|-----------|----------|
| Suppression système | `rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?/([^w]\|$)`, `rm\s+-rf\s+/\*` |
| Format/écrasement disque | `mkfs`, `dd\s+.*of=/dev/`, `wipefs` |
| Fork bomb | `:\(\)\s*\{.*\|.*&\s*\}\s*;?\s*:` et variantes |
| Permissions système | `chmod\s+(-R\s+)?[0-7]{3}\s+/[^w]`, `chown\s+-R\s+.*\s+/[^w]` |
| Redirection destructive | `>\s*/dev/sd`, `mv\s+.*\s+/dev/null` |
| Arrêt système | `shutdown`, `reboot`, `halt`, `poweroff`, `init\s+[06]` |
| Kernel/système | `insmod`, `rmmod`, `modprobe\s+-r`, `sysctl\s+-w` |

**Implémentation** : tableau de regex compilées, testées séquentiellement. Si match → le tool retourne immédiatement `{ error: "Commande bloquée : opération destructive détectée" }` avec `status: "blocked"`. Le modèle reçoit l'erreur et peut reformuler.

**Contexte** : Buck tourne dans Docker Linux. Seuls les patterns POSIX/Linux sont pertinents. L'utilisateur qui accède au workspace via WebDAV/explorateur de fichiers n'est pas contraint par ce kill switch — il ne s'applique qu'aux commandes exécutées par le modèle.

## UI

### ApprovalBlock (composant existant à adapter)

- **Header** : icône + nom du tool (`shell_execute`, `create_file`, `delete_file`)
- **Body** : action formatée en font mono
  - Shell : `$ commande` sur fond sombre
  - File tools : path + action ("Créer fichier `path`", "Supprimer `path`")
- **Footer** : boutons **Autoriser** (vert) / **Refuser** (rouge)
- **État résolu** : boutons remplacés par badge "Autorisé" (vert) ou "Refusé" (rouge)

### TerminalBlock (nouveau composant)

- Fond sombre, font mono (style terminal)
- **Header** : `$ commande` + badge exit code (vert si 0, rouge sinon)
- **Body** : stdout en blanc, stderr en rouge/orange. Codes ANSI strippés (pas de lib de rendu couleur)
- **Collapsible** si output > 10 lignes : affiche les 5 premières + "voir plus"
- **Indicateurs** :
  - Si tronqué : "(output tronqué à 100KB)"
  - Si timeout : "(commande interrompue après 30s)"

### Flow visuel dans le chat

```
Assistant: "Je vais lister les fichiers du workspace."

┌─ shell_execute ────────────────────────┐
│ $ ls -la                               │
│                                        │
│  [Autoriser]  [Refuser]                │
└────────────────────────────────────────┘

→ Utilisateur clique "Autoriser"

┌─ shell_execute ─────────────── [✓ 0] ──┐
│ $ ls -la                               │
│                                        │
│ total 48                               │
│ drwxr-xr-x  5 user user 4096 ...      │
│ -rw-r--r--  1 user user  220 ...      │
│ ...                                    │
└────────────────────────────────────────┘
```

## Persistance

### Pas de nouvelle table

Les tool calls et résultats sont persistés dans la table `messages` existante.

- Messages avec `role: 'assistant'` contiennent les tool calls (sérialisés par AI SDK)
- Messages avec `role: 'tool'` contiennent les résultats

### Champ additionnel `toolMeta` sur `messages`

```typescript
toolMeta?: {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  status: 'approved' | 'denied' | 'auto' | 'blocked'
  result?: {
    stdout?: string
    stderr?: string
    exitCode?: number
    killed?: boolean
    truncated?: boolean
  }
}
```

Permet de :
- Reconstruire l'historique complet au reload (approvals résolus, TerminalBlocks)
- Afficher le bon état des composants sans re-demander l'approval
- Tracer les décisions pour debug

### Migration DB

Une migration Drizzle ajoute la colonne `tool_meta` (TEXT, JSON sérialisé, nullable) à la table `messages`.

## Tests

### Tests unitaires

- **Kill switch** : chaque pattern regex testé — commande destructive → bloqué, commande légitime → passe
- **Tool wrapper approval** : tools sous approval retournent `requires_approval`, tools auto s'exécutent directement
- **Shell execute** : commande simple (`echo hello`), timeout, output tronqué, exit code non-zero
- **Parsing client** : détection du `requires_approval` dans les messages assistant

### Tests e2e

- **Flow approval complet** : message déclenchant un tool call → approval affiché → clic Autoriser → TerminalBlock avec résultat
- **Flow refus** : même flow → clic Refuser → modèle s'adapte
- **Kill switch** : commande destructive → message d'erreur, jamais présentée en approval

### Hello-world skill de test

Fichier `workspace/skills/hello-world/SKILL.md` :

```markdown
# Hello World

Tu es un assistant de test. Quand l'utilisateur te dit "hello",
réponds "Hello World!" et utilise shell_execute pour afficher
la date du jour avec la commande `date`.
```

Valide le flow complet : skill loading (auto) + shell tool (approval) + TerminalBlock.

## Fichiers impactés

### @buck/shared
- `src/schemas/workspace.ts` — enrichir `ToolApprovalChunk`, `ToolApprovalDecision`, ajouter types `ToolMeta`

### @buck/api
- `src/routes/chat.ts` — wrapper approval sur tools, gestion du champ `toolApproval` dans le body, nouveau `buildShellTool()`
- `src/lib/kill-switch.ts` — nouveau fichier, patterns regex + fonction de validation
- `src/db/schema.ts` — colonne `toolMeta` sur `messages`
- `migrations/` — migration pour la colonne

### @buck/web
- `src/components/chat/approval-block.tsx` — adapter pour multi-tools (shell, file)
- `src/components/chat/terminal-block.tsx` — nouveau composant
- `src/components/chat/chat-area.tsx` — détection `requires_approval`, gestion du flow pause/resume, champ `toolApproval` dans les requêtes
- `src/components/chat/message-bubble.tsx` — rendu des TerminalBlocks et ApprovalBlocks résolus dans l'historique

## Hors scope

- Approval pour `read_file`, `list_directory`, `activate_skill` (restent auto)
- Configuration UI des tools sous approval (hardcodé côté API)
- WebSocket ou SSE (on reste en HTTP classique)
- Historique des approvals dans les settings
- Shell interactif (stdin, TTY)