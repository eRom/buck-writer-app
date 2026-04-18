# M4 — Bible MCP Integration — Design Spec

**Date** : 2026-04-18
**Status** : Design validé, en attente du plan d'implémentation
**Milestone** : M4
**Scope** : MCP Bible uniquement (la couche mémoire est reportée à M5)

---

## Objectif

Intégrer le serveur MCP `barda-mcp-ecrivain-bible` (48 tools de gestion de bible d'écrivain : personnages, lieux, événements, recherche sémantique) dans Buck Writer, de sorte que le LLM OpenAI puisse consulter et enrichir la bible à chaque session de chat.

Bible **unique et partagée** pour toutes les sessions. Disponible par défaut, obligatoire. Le chat continue en mode dégradé si le MCP est injoignable, avec un feedback UI.

En bonus (cohérence), refactor des prompts système pour les rendre live-editable sans rebuild.

## Non-objectifs

- **Couche mémoire** (résumés conversationnels, vector store transversal) → M5
- **UI web de la bible** (dashboard, graph, timeline) → M5+ sous `packages/bible-ui`
- **Multi-bible** (une bible par session/projet) → pas prévu
- **Authentification réseau** entre buck-api et bible-mcp → network privé Docker suffit
- **Multi-tenancy MCP** (hériter d'autres serveurs MCP user-provided via `mcp_servers` table) → out of scope, table laissée en place mais non utilisée

## Architecture globale

```
┌──────────────────────────────────────────────────────────────────┐
│                   buck-writer-app monorepo                        │
│                                                                   │
│  packages/web  ──HTTP──▶  packages/api  ──JSON-RPC──▶  packages/bible-mcp
│  (SPA React)              (Hono + OpenAI)              (Express + SDK MCP)
│                                 │                           │
│                                 ▼                           ▼
│                           data/buck.db              data/bible/bible.db
│                           (SQLite app)              (SQLite + embeddings OpenAI)
└──────────────────────────────────────────────────────────────────┘

Prod : services Docker sur réseau `internal`, bible-mcp non exposé publiquement.
Dev  : `pnpm dev` lance bible-mcp en Node (parallèle), port 7801 exposé en local.
Dev alternatif : `docker-compose.local.yml` lance bible-mcp en container si besoin.
```

## Package `packages/bible-mcp`

Copie du MCP upstream (`/Users/recarnot/dev/barda-mcp-ecrivain-bible/packages/mcp/`) adaptée pour Buck Writer.

### Modifications par rapport à l'upstream

1. **Mode HTTP-only**
   - On supprime l'entry stdio (`src/index.ts` version CLI avec `bin:`).
   - Entry unique : un wrapper autour de `src/http.ts` qui démarre le serveur Express sur `BIBLE_HTTP_PORT`.
   - Scripts : `dev` (tsx watch), `build` (tsup), `start` (node dist).

2. **Embeddings OpenAI**
   - Suppression de la dep `@huggingface/transformers` et du dossier `src/embeddings/` local.
   - Nouveau `src/embeddings/openai.ts` : `fetch` direct sur `https://api.openai.com/v1/embeddings`, modèle par défaut `text-embedding-3-large` (3072 dims).
   - Batching 100 textes max par appel API.
   - Tool `reindex_embeddings` adapté (itère sur les batches OpenAI).
   - La table `embeddings` garde sa structure SQLite ; seule la dimension du vecteur change.

3. **Configuration par env**
   | Variable | Défaut | Description |
   |----------|--------|-------------|
   | `BIBLE_DB_PATH` | `./data/bible.db` | Chemin absolu ou relatif du fichier SQLite |
   | `BIBLE_HTTP_PORT` | `7801` | Port d'écoute HTTP |
   | `OPENAI_API_KEY` | (requis) | Fail-fast si absente |
   | `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-large` | Override pour tests/debug |

4. **Pas de UI web** — le dossier `packages/ui/` upstream n'est pas copié.

5. **Migration DB existante** — la DB de test (`/Users/recarnot/dev/barda-mcp-ecrivain-bible/data/bible.db`) contient des embeddings HuggingFace (dimension différente). Stratégie :
   - **Dev** : auto-drop+recreate de la table `embeddings` au démarrage si les dimensions divergent (détecté via une ligne meta `embeddings_meta` stockant le modèle utilisé). Le texte source reste intact dans les tables métier (personnages, lieux, etc.) ; seuls les vecteurs sont recalculés à la demande (premier appel à `search_semantic` ou `reindex_embeddings`).
   - **Prod** : commande manuelle `pnpm --filter @buck/bible-mcp bible:reindex` après le premier déploiement, exécute `reindex_embeddings` sur toute la base. Documentée dans le runbook de déploiement.

6. **Tests** — on garde les tests unitaires upstream qui passent ; les tests qui validaient les embeddings HuggingFace sont remplacés par des tests avec fetch mocké sur l'API OpenAI. Un test d'intégration basique : `tools/list` retourne les 48 tools, `tools/call search_fulltext` retourne un résultat formaté.

## Package `packages/api` — Client MCP

### Nouveau service `src/services/mcp-client.ts`

Interface :

```typescript
export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;  // JSON Schema
}

export interface McpClient {
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args: unknown): Promise<unknown>;
  isHealthy(): boolean;
  cachedTools(): McpTool[];
  onStatusChange(cb: (healthy: boolean) => void): () => void;  // unsubscribe
}

export function createMcpClient(opts: {
  url: string;         // ex: http://bible-mcp:7801
  timeoutMs?: number;  // défaut 5000
  healthPollMs?: number;  // défaut 30000
}): McpClient;
```

Implémentation : fetch JSON-RPC 2.0 sur `${url}/mcp`, parse `{ jsonrpc, id, result | error }`. Timeout via `AbortController`.

### Démarrage (`src/index.ts`)

1. Lit `MCP_BIBLE_URL` (défaut `http://bible-mcp:7801`).
2. `mcpClient.listTools()` avec timeout 5s.
3. **Si succès** : cache la liste, `healthy=true`.
4. **Si échec** : log warning `[api] bible-mcp unreachable, running in degraded mode`, `healthy=false`, démarrage continue.
5. Health-check périodique toutes les 30s (même appel `tools/list`). Si l'état change, notifie via `onStatusChange`.

Pas de `depends_on.condition: service_healthy` strict côté Docker — le buck-api doit démarrer même si bible-mcp tarde.

### Intégration dans le tool loop (`src/routes/chat.ts`)

**Tool definitions** : dans `buildToolDefinitions()`, après les tools workspace, on append les tools bible préfixés :

```typescript
if (deps.mcpClient.isHealthy()) {
  for (const bibleTool of deps.mcpClient.cachedTools()) {
    defs.push({
      type: 'function',
      function: {
        name: `bible_${bibleTool.name}`,
        description: bibleTool.description,
        parameters: bibleTool.inputSchema,
      },
    });
  }
}
```

**Tool handlers** : dans `buildToolHandlers()`, on ajoute une boucle pour les handlers `bible_*` :

```typescript
for (const toolName of deps.mcpClient.cachedTools().map(t => t.name)) {
  handlers[`bible_${toolName}`] = async (args) => {
    try {
      return await deps.mcpClient.callTool(toolName, args);
    } catch (err) {
      return { error: `bible-mcp call failed: ${err instanceof Error ? err.message : 'unknown'}` };
    }
  };
}
```

**Approval flow** : les tools bible ne passent **pas** par l'approval. Ils sont auto-exécutés comme `read_file` (pas de I/O destructif système, juste la DB bible).

**Kill switch** : aucun pour les tools bible (pas de commandes shell, pas de delete arbitraire — l'utilisateur garde le contrôle via le chat).

### Endpoint `GET /api/mcp/bible/status`

Auth : session app normale.

Réponse :
```json
{ "healthy": true, "toolCount": 48 }
```

Utilisé par le web pour le toast persistant.

## Package `packages/web` — Toast permanent bible

Nouveau hook `useBibleStatus()` (dans `src/lib/mcp.ts`) :
- Poll `GET /api/mcp/bible/status` toutes les 30s via TanStack Query
- État exposé : `healthy: boolean`, `toolCount: number`

Nouveau composant `<BibleStatusBanner />` affiché au-dessus du chat (même niveau que `<BudgetBanner />`) :
- Si `healthy=false` : bandeau warning persistant "La bible est injoignable. Le chat fonctionne mais les outils bible (recherche, personnages, lieux) sont indisponibles."
- Si `healthy=true` : rien (pas d'info inutile).

## Refactor des prompts système

### État actuel (bugs à corriger)

- `prompts/USER.md` est chargé mais jamais injecté dans les system messages → code mort, on supprime.
- `prompts/` vit à la racine du repo et est embarqué dans l'image Docker → rebuild requis pour changer.
- Pas de hot-reload.

### Nouvelle organisation

- Dossier cible : `$WORKSPACE_DIR/systems/` (hors `WORKSPACE_DIR/skills/`, pas dans le workspace utilisateur standard).
- Fichiers : `SYSTEM.md` (requis) + `RULES.md` (optionnel). USER.md supprimé.
- Live-editable : chokidar watch, reload à chaque save.
- Bootstrap : si le dossier n'existe pas ou est vide au démarrage, l'API copie les defaults embarqués (`packages/api/src/defaults/systems/*.md`) vers `$WORKSPACE_DIR/systems/`. L'utilisateur a toujours une bible fonctionnelle, et peut ensuite éditer librement.

### Service `src/services/prompts.ts` réécrit

```typescript
export interface Prompts {
  system: string;
  rules: string;
}

export function loadPrompts(systemsDir: string): Prompts;
export function createPromptsWatcher(systemsDir: string, onChange: (p: Prompts) => void): () => void;
```

Réutilise le pattern de `loadSkills` + `createSkillsWatcher` (chokidar).

### Ordre d'injection dans `chat.ts`

```typescript
systemMessages = [
  { role: 'system', content: prompts.system },
  ...(prompts.rules ? [{ role: 'system', content: prompts.rules }] : []),
  ...(skills.size > 0 ? [{ role: 'system', content: `Available skills: ...` }] : []),
];
```

### Migration one-shot

Dans le commit M4 qui active le refactor :
1. Déplacer `prompts/SYSTEM.md` et `prompts/RULES.md` → `workspace/systems/`.
2. Supprimer `prompts/USER.md` + le dossier `prompts/` racine.
3. Créer `packages/api/src/defaults/systems/{SYSTEM,RULES}.md` (copies pour le bootstrap).
4. Adapter `tsup.config.ts` pour copier les `defaults/` dans `dist/`.

En prod : au premier déploiement post-M4, bootstrap auto s'il n'y a rien dans le volume. Si le volume a déjà des prompts d'une version antérieure (issue du build), rien n'est écrasé.

## Docker

### `docker-compose.yml` (prod)

```yaml
services:
  bible-mcp:
    build:
      context: .
      dockerfile: Dockerfile.bible-mcp
    networks:
      - internal
    environment:
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      BIBLE_DB_PATH: /app/data/bible.db
      BIBLE_HTTP_PORT: 7801
    volumes:
      - ./data/bible:/app/data
    restart: unless-stopped

  buck:
    build:
      context: .
      dockerfile: Dockerfile.app
    networks:
      - caddy-public
      - internal
    environment:
      MCP_BIBLE_URL: http://bible-mcp:7801
      # ... reste inchangé
    volumes:
      - ./data/db:/app/data
      - ./data/workspace:/app/workspace
    depends_on:
      - bible-mcp
    restart: unless-stopped

networks:
  internal:
    driver: bridge
  caddy-public:
    external: true
```

### `Dockerfile.bible-mcp`

Mono-stage node:20-alpine. Installe pnpm, `pnpm install --frozen-lockfile --filter @buck/bible-mcp...`, build tsup, `CMD ["node", "dist/server.js"]`. Dépendances natives (better-sqlite3) compilées en Alpine avec les outils de build usuels (python3, make, g++).

### `docker-compose.local.yml` (dev optionnel)

```yaml
services:
  bible-mcp:
    build: { context: ., dockerfile: Dockerfile.bible-mcp }
    ports: ["7801:7801"]
    environment:
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      BIBLE_DB_PATH: /app/data/bible.db
    volumes:
      - /Users/recarnot/dev/barda-mcp-ecrivain-bible/data:/app/data:ro
```

Usage : `docker compose -f docker-compose.local.yml up -d bible-mcp`, puis `pnpm dev` classique.

### `pnpm dev` en mode Node pur (par défaut)

Ajout du script dev dans `packages/bible-mcp/package.json` : `"dev": "tsx watch src/server.ts"`.
Le script root `package.json` lance déjà `pnpm run --parallel --filter './packages/*' dev` → le nouveau package est picked up automatiquement.

`.env.development` : ajouter `MCP_BIBLE_URL=http://localhost:7801` et `BIBLE_DB_PATH=../../data/bible/bible.db` (relatif au cwd de bible-mcp lors de `pnpm dev`).

## Plan de tests

### Unitaires (par package)

- **bible-mcp** : tests upstream conservés, embeddings avec fetch OpenAI mocké, reindex batching.
- **api/services/mcp-client** : fetch mocké, teste `listTools`, `callTool` success/erreur, timeout, état `healthy` qui bascule.
- **api/services/prompts** : chargement, bootstrap, hot-reload via simulation chokidar.
- **api/routes/chat** : nouveau cas "avec tools bible" — fetch OpenAI mocké retourne un `tool_calls: bible_search_fulltext`, on vérifie que le handler appelle bien `mcpClient.callTool`.
- **api/routes/mcp** (nouveau fichier) : endpoint `/api/mcp/bible/status`, réponses healthy/unhealthy.

### Intégration

- **Démarrage dégradé** : démarrer l'API avec `MCP_BIBLE_URL` invalide → l'API démarre, `/api/mcp/bible/status` retourne `{ healthy: false }`, un chat fonctionne sans les tools bible.
- **Démarrage normal** : démarrer bible-mcp puis l'API → `/api/mcp/bible/status` retourne `{ healthy: true, toolCount: 48 }`.

Cible totale : **~240 tests** après M4 (vs 201 actuels).

## Variables d'environnement — récap

### Nouvelles

| Variable | Composant | Défaut | Usage |
|----------|-----------|--------|-------|
| `MCP_BIBLE_URL` | api | `http://bible-mcp:7801` | URL du serveur MCP |
| `BIBLE_DB_PATH` | bible-mcp | `./data/bible.db` | Chemin DB SQLite |
| `BIBLE_HTTP_PORT` | bible-mcp | `7801` | Port HTTP |
| `OPENAI_EMBEDDING_MODEL` | bible-mcp | `text-embedding-3-large` | Modèle embeddings |

### Partagées

- `OPENAI_API_KEY` — utilisée par api (chat) ET bible-mcp (embeddings).

### Supprimées / obsolètes

- Aucune (`MCP_BIBLE_URL` et la table `mcp_servers` existaient déjà).

## Sous-chantiers (découpe M4)

1. **Package bible-mcp** — copie, HTTP-only, embeddings OpenAI, tests.
2. **Client MCP api** — `mcp-client.ts`, intégration tool loop, endpoint status.
3. **Web** — hook + composant `<BibleStatusBanner />`.
4. **Prompts refactor** — service + bootstrap + hot-reload + migration.
5. **Docker** — `Dockerfile.bible-mcp`, compose prod + local.
6. **Tests + lint + docs** — finaliser et merger.

Le plan d'implémentation détaillera l'ordre et les commits.

## Risques identifiés

- **Dimension embeddings** : si la DB upstream a des embeddings HF (384/768d) et on passe à OpenAI (3072d), les anciens vecteurs deviennent inutilisables. Mitigation : auto-drop+recreate au démarrage si dim divergente, reindex manuel en prod.
- **Coût embeddings** : `text-embedding-3-large` = $0.13 / 1M tokens. Bible perso ≈ 50k tokens = 0.0065 $ pour un reindex complet. Négligeable.
- **Latence** : chaque appel `bible_search_semantic` déclenche un appel OpenAI pour l'embedding de la query + une recherche SQLite. ~300-500 ms. Acceptable.
- **Fiabilité MCP upstream** : on fork en copie, on perd les mises à jour upstream. Accepté par Romain. Si besoin d'un update futur, merge manuel.
- **SDK MCP** : `@modelcontextprotocol/sdk` est en version `^1.28.0` upstream, mais notre code ne l'utilise pas directement (on fait du JSON-RPC brut côté client). Moins de couplage. Le package bible-mcp garde la dep SDK pour son serveur.
