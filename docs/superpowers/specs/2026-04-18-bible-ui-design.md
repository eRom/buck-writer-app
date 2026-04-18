# Bible UI — Design Spec

**Date** : 2026-04-18
**Auteur** : Romain + Trinity
**Statut** : Validé brainstorming, prêt pour planning
**Milestone** : Post-M5 (Bible & Mémoire OK)

## 1. Contexte & objectif

Buck Writer dispose d'un serveur `bible-mcp` qui expose ~51 outils MCP (CRUD personnages, lieux, événements, notes, recherches, règles, interactions, timeline, graph, etc.) consommés en chat par l'app Buck via JSON-RPC. Aujourd'hui, **aucune UI dédiée** ne permet de naviguer, créer ou éditer ces entités directement — tout passe par le chat.

L'objectif : créer un **package frontend dédié `@buck/bible-ui`** qui offre une interface web complète sur ces outils, à la fois pour le dev local (Vite hot reload) et pour la prod (container Docker derrière Caddy basicauth, sous-domaine privé).

**Source d'inspiration fonctionnelle** : `/Users/recarnot/dev/barda-mcp-ecrivain-bible/packages/ui` — SPA Vite/React 19 qui couvre déjà tout le périmètre fonctionnel (Dashboard, Characters, Locations, Events, Notes, Research, WorldRules, Interactions, Timeline, Graph Sigma, ImportExport, Backups). Le portage est iso-fonctionnel mais le **design est entièrement repris de Buck (erom-design v2)**.

## 2. Architecture cible

### 2.1 Vue d'ensemble (3 services Docker indépendants)

```
┌─ Internet ─────────────────────────────────────┐
│                                                │
│  buck.romain-ecarnot.com ──┐  Caddy            │
│                            │                   │
│  bible.buck.romain-..com ──┤  + basicauth      │
└────────────────────────────┼───────────────────┘
                             │ caddy-public network
           ┌─────────────────┼─────────────────┐
           │                 │                 │
      ┌────▼────┐      ┌─────▼─────┐    ┌──────▼──────┐
      │ buck-app│      │ bible-ui  │    │  bible-mcp  │
      │  :3000  │      │  nginx:80 │    │   :7801     │
      │         │      │ (SPA +    │    │  (JSON-RPC) │
      │         │      │  proxy/mcp│    │             │
      └────┬────┘      └─────┬─────┘    └──────┬──────┘
           │                 │                 │
           └─────────────────┴─────internal────┘
```

### 2.2 Décisions structurelles

| Topic | Décision | Justification |
|---|---|---|
| Hébergement SPA | Container nginx dédié `bible-ui`, séparé de `bible-mcp` | Indépendance : on peut redémarrer l'un sans l'autre |
| Accès prod | `bible.buck.romain-ecarnot.com` + Caddy basicauth | Réutilise le pattern existant (voice-agent), zéro Tailscale supplémentaire |
| DNS | Wildcard `*.buck.romain-ecarnot.com` → IP VPS | Préparer l'avenir, un seul record A à gérer |
| Périmètre fonctionnel | Iso-portage de `barda/ui` (13 routes) | Pas d'invention, pas de scope creep |
| Design system | erom v2 amber, copie depuis `@buck/web` | Cohérence visuelle entre Buck et Bible |
| Routing | Migration `react-router-dom` → TanStack Router | Cohérence avec `@buck/web` |
| Interco MCP | Vite proxy en dev, nginx proxy en prod | Same-origin partout, zéro CORS browser |
| `.env` | Fichier unique racine + `envDir` dans les vite.config | Conserver le setup actuel Romain |
| Card-referentiel | Toute la card cliquable → nouvel onglet | Aucun bouton ajouté, modif minimale |

### 2.3 Indépendance vérifiée

- Restart `bible-ui` → buck-app pas affecté
- Restart `bible-mcp` → buck-app perd les outils Bible (déjà géré par `useBibleStatus`), bible-ui affiche erreurs sur ses fetch `/mcp` (toast destructive + écran dégradé)
- Restart `buck-app` → les deux autres OK

## 3. Package `@buck/bible-ui`

### 3.1 Stack technique

Alignée Buck (cohérence monorepo) :

- React 19 + Vite 6 (TypeScript ESM)
- TanStack Router file-based + TanStack Query 5
- Tailwind CSS 4.2 + shadcn/ui (style new-york, baseColor stone)
- Lucide icons, Inter + JetBrains Mono + Georgia
- Zustand si état partagé nécessaire (sinon TanStack Query suffit)
- ESLint flat config commune au monorepo

Spécifique Bible :

- `sigma` + `graphology` + `@react-sigma/core` + `@react-sigma/layout-forceatlas2` (pour la page Graph)

### 3.2 Structure de fichiers

```
packages/bible-ui/
├── src/
│   ├── routes/                  # TanStack Router (migration depuis pages/)
│   │   ├── __root.tsx           # Layout racine (Sidebar + TopBar + Right panel)
│   │   ├── index.tsx            # Dashboard
│   │   ├── characters.tsx       # Liste personnages
│   │   ├── characters.$id.tsx   # Détail personnage
│   │   ├── locations.tsx
│   │   ├── locations.$id.tsx
│   │   ├── events.tsx
│   │   ├── events.$id.tsx
│   │   ├── notes.tsx
│   │   ├── notes.$id.tsx
│   │   ├── research.tsx
│   │   ├── research.$id.tsx
│   │   ├── world-rules.tsx
│   │   ├── world-rules.$id.tsx
│   │   ├── interactions.tsx
│   │   ├── interactions.$id.tsx
│   │   ├── timeline.tsx
│   │   ├── graph.tsx
│   │   ├── search.tsx
│   │   ├── import-export.tsx
│   │   └── backups.tsx
│   ├── components/
│   │   ├── ui/                  # Copie depuis @buck/web/src/components/ui
│   │   ├── layout/              # Sidebar, TopBar, RightPanel adaptés Bible
│   │   ├── entities/            # EntityCard, EntityList, EntityForm restylés
│   │   ├── graph/               # GraphView (Sigma), GraphLegend, GraphControls, NodeDetail
│   │   ├── search/              # SearchBar, SearchResults
│   │   └── common/              # ConfirmDialog, EntityLink, Toaster, TemplateSelector
│   ├── api/
│   │   └── mcp-client.ts        # callTool / listTools (porté tel quel)
│   ├── hooks/
│   │   ├── useMcp.ts            # useMcpQuery / useMcpMutation
│   │   ├── useGraph.ts          # Hook Sigma data loader
│   │   ├── useToast.ts
│   │   └── useTheme.ts
│   ├── types/
│   │   └── index.ts             # Character, Location, Event, Note, etc.
│   ├── styles/
│   │   └── globals.css          # Tokens erom v2 copiés depuis @buck/web
│   ├── theme-provider.tsx       # Copie de @buck/web
│   └── main.tsx
├── public/
├── nginx.conf                   # Sert dist/ + proxy /mcp
├── Dockerfile (référencé depuis racine via Dockerfile.bible-ui)
├── package.json
├── tsconfig.json
├── vite.config.ts
└── components.json              # config shadcn
```

### 3.3 Design — application erom-design v2

**Source de vérité visuelle** : copie en bloc depuis `@buck/web` au démarrage du package :

- `packages/web/src/index.css` → `packages/bible-ui/src/styles/globals.css`
- `packages/web/src/components/ui/*` → `packages/bible-ui/src/components/ui/*`
- `packages/web/src/components/layout/*` → adapté pour la nav Bible
- `theme-provider.tsx` à l'identique
- Tailwind config / Vite config patterns alignés

**Patterns en réserve** : si un composant manque (ex: command palette pour search), s'inspirer de `skills/erom-design/references/vite-demo-sources/src/components/demo.tsx`.

**Couleur brand** : amber (défaut, comme Buck) — sibling visuel, pas de différenciation chromatique.

**Layout app shell desktop** :

```
TopBar 38px (titre "Bible — <projet>" + breadcrumb route + theme toggle)
├─ Sidebar gauche 300px / 52px collapsible
│   Sections sticky : Univers / Personnages / Lieux / Événements
│                     / Notes / Recherches / Règles / Interactions
│                     / Timeline / Graph / Outils
├─ Main (flex-1) — pages portées
└─ Right panel 300px / 40px (optionnel) — détail contextuel
```

**Composants shadcn à installer** (preset `b1Gdz9c4A`, baseColor stone) :
button, card, input, textarea, label, badge, dialog, dropdown-menu, popover, select, separator, sheet, sidebar, tabs, toast, tooltip, command.

**Détails finition** :
- `.dark` par défaut sur `<html>`, dark only (pas de toggle light)
- Tokens OKLCH en CSS variables (zéro hex en dur sauf badges semantiques)
- Inter (UI), JetBrains Mono (slugs / IDs entités), Georgia (zone description longue, clin d'œil "livre")
- Scrollbar custom 6px, `::selection` amber
- Pattern `hover-elevate` sur boutons, badges, cards cliquables

### 3.4 Composants métier portés

Portés depuis `barda/ui/src/components/`, **réécrits avec uniquement les briques shadcn de Buck** (Card, Button, Input, Badge, Dialog, etc.) :

| Composant | Rôle |
|---|---|
| `EntityCard` | Carte d'entité (Character, Location, Event...) — Card erom + badge type |
| `EntityList` | Liste d'entités, virtualisée si >100 items |
| `EntityForm` | Form CRUD générique (champs dynamiques selon le type) |
| `EntityLink` | Lien interne vers une autre entité (hover-elevate, tooltip preview) |
| `SearchBar` | Input large + autocomplete via tools/list (command palette pattern) |
| `SearchResults` | Résultats groupés par type d'entité, badges semantiques |
| `GraphView` | Wrapper Sigma + theme dark gris chauds |
| `GraphLegend` / `GraphControls` / `NodeDetail` | Popover backdrop-blur, boutons icon ghost |
| `ConfirmDialog` | Dialog destructive (delete inline pattern) |
| `Toaster` | Notifications (popover backdrop-blur, position bottom-right) |
| `TemplateSelector` | Sélecteur de template d'entité (porté tel quel) |

## 4. Interco bible-ui ↔ bible-mcp

### 4.1 API client

Porté tel quel depuis `barda/ui/src/api/mcp-client.ts` :

```ts
export async function callTool(name: string, params: Record<string, unknown>): Promise<unknown>
export async function listTools(): Promise<Array<{ name; description; inputSchema }>>
```

Wrappers TanStack Query :

```ts
export function useMcpQuery<T>(toolName: string, params?: object, options?): UseQueryResult<T>
export function useMcpMutation(toolName: string, invalidateKeys?: string[]): UseMutationResult
```

### 4.2 Résolution `/mcp` selon environnement

Le SPA appelle toujours `/mcp` en URL **relative**. La résolution diffère :

| Env | Résolution `/mcp` |
|---|---|
| Dev local Vite | `vite.config.ts` : `server.proxy['/mcp'] = 'http://localhost:7801'` |
| Prod VPS | `nginx.conf` : `location /mcp { proxy_pass http://bible-mcp:7801; }` |

→ Same-origin partout côté browser, **zéro CORS à gérer**, le code SPA n'a jamais besoin de var d'env pour le MCP.

### 4.3 Hardening

- Health check au boot : `listTools()` au mount du root → si KO, écran "Bible MCP indisponible — réessayer" plutôt qu'écran blanc
- Erreurs réseau / JSON-RPC → toast destructive via `Toaster`
- Types stricts sur les retours d'outils Bible (`Character`, `Location`, etc.)

## 5. Workflow Dev local

### 5.1 Commandes

À la racine du monorepo (ajout dans `package.json` racine) :

```bash
pnpm dev              # Existant : api + web (chat Buck)
pnpm dev:bible        # NOUVEAU : bible-mcp + bible-ui en parallèle
pnpm dev:all          # NOUVEAU : tout en parallèle
```

`pnpm dev:bible` (via `concurrently` ou `pnpm -r --parallel run dev`) :
- `bible-mcp` : `tsx watch src/server.ts` → `http://localhost:7801`
- `bible-ui` : `vite` → `http://localhost:5174` (5173 réservé à `@buck/web`)

### 5.2 `vite.config.ts` du package bible-ui

```ts
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';

export default defineConfig({
  plugins: [TanStackRouterVite(), react(), tailwindcss()],
  envDir: path.resolve(__dirname, '../..'),
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 5174,                               // 5173 est déjà pris par @buck/web
    proxy: { '/mcp': 'http://localhost:7801' },
  },
  build: { outDir: 'dist', sourcemap: true },
});
```

Note : si le port 5173 est occupé par `@buck/web`, on assigne un port distinct (ex: 5174) à bible-ui.

### 5.3 `vite.config.ts` du package web (modif)

Ajouter `envDir: path.resolve(__dirname, '../..')` pour lire le `.env` racine.

### 5.4 Variables `.env` racine

```env
# ... vars existantes (OPENAI_API_KEY, AUTH_JWT_SECRET, etc.)

# URL externe de bible-ui (différente selon environnement)
VITE_BIBLE_UI_URL=http://localhost:5174             # dev local (port bible-ui)
# VITE_BIBLE_UI_URL=https://bible.buck.romain-ecarnot.com   # prod (override par compose)
```

Vite n'expose au browser que les variables préfixées `VITE_*` → les secrets restent côté serveur.

### 5.5 Tests

- Vitest unit : composants + hooks (`pnpm -F @buck/bible-ui test`)
- Pas de Playwright e2e dans cette itération
- ESLint + typecheck : intégrés au pipeline monorepo existant

## 6. Build Docker & déploiement

### 6.1 `Dockerfile.bible-ui` (racine du repo)

```dockerfile
# Stage 1 : build SPA
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/bible-ui/package.json ./packages/bible-ui/
RUN pnpm install --frozen-lockfile --filter @buck/bible-ui...
COPY packages/bible-ui ./packages/bible-ui
RUN pnpm -F @buck/bible-ui build

# Stage 2 : nginx alpine
FROM nginx:1.27-alpine
COPY packages/bible-ui/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/packages/bible-ui/dist /usr/share/nginx/html
EXPOSE 80
```

### 6.2 `packages/bible-ui/nginx.conf`

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location /mcp {
        proxy_pass http://bible-mcp:7801;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_http_version 1.1;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 6.3 `docker-compose.yml` (modif)

Ajout du service `bible-ui` :

```yaml
services:
  bible-mcp:
    # ... inchangé (réseau internal uniquement)

  bible-ui:                                # NOUVEAU
    build:
      context: .
      dockerfile: Dockerfile.bible-ui
    container_name: buck-bible-ui
    restart: unless-stopped
    networks:
      - caddy-public
      - internal
    depends_on:
      - bible-mcp

  buck-app:
    # ... inchangé, on ajoute juste l'ARG/ENV au build pour VITE_BIBLE_UI_URL
    build:
      context: .
      dockerfile: Dockerfile.app
      args:
        VITE_BIBLE_UI_URL: https://bible.buck.romain-ecarnot.com

networks:
  internal:
    driver: bridge
  caddy-public:
    external: true
```

### 6.4 `Dockerfile.app` (modif)

Ajouter au stage builder :

```dockerfile
ARG VITE_BIBLE_UI_URL
ENV VITE_BIBLE_UI_URL=${VITE_BIBLE_UI_URL}
# ... pnpm build (Vite inline la var dans le bundle)
```

### 6.5 Caddyfile (`trinity-lifeos-agent/vps/docker/caddy/CaddyFile`)

Ajout :

```
buck.{$BUCK_HOST_BASE} {
    reverse_proxy buck-app:3000
}

bible.buck.{$BUCK_HOST_BASE} {
    basicauth {
        {$BIBLE_USER} {$BIBLE_PASSWORD_HASH}
    }
    reverse_proxy bible-ui:80
}
```

(à adapter aux variables d'env existantes du Caddyfile au moment de l'implémentation)

### 6.6 DNS

Wildcard `*.buck.romain-ecarnot.com` → IP VPS (un seul record A wildcard).

### 6.7 Variables `.env` VPS à ajouter

```env
BUCK_HOST_BASE=romain-ecarnot.com
BIBLE_USER=romain
BIBLE_PASSWORD_HASH=<bcrypt généré via `caddy hash-password`>
```

## 7. Modif côté Buck : card-referentiel

### 7.1 `packages/web/src/components/panel-right/card-referentiel.tsx`

Modifs minimales :
- Toute la card devient cliquable (wrapper `<a>` avec `target="_blank"` + `rel="noopener noreferrer"`)
- Href = `import.meta.env.VITE_BIBLE_UI_URL`
- Hover-elevate + cursor pointer (cohérent erom v2)
- Si `!healthy` : opacity réduite, `pointer-events-none`, tooltip "Bible MCP indisponible"
- **Aucun bouton ajouté, aucun nouveau texte** — uniquement le comportement clic

### 7.2 Comportement UX

- Clic sur la card "Bible MCP actif · 51 outils" → nouvel onglet sur bible-ui
- En prod : Caddy demande login basicauth (cached par le browser ensuite)
- En dev : nécessite `pnpm dev:bible` lancé, sinon onglet en erreur

## 8. Success criteria

- [ ] `pnpm dev:bible` lance bible-mcp + bible-ui, `http://localhost:5174` affiche le Dashboard avec stats Bible
- [ ] Toutes les pages chargent sans erreur console, CRUD fonctionnels (create/read/update/delete sur chaque type d'entité)
- [ ] Page Graph affiche le réseau Sigma avec nodes/edges
- [ ] Search retourne des résultats sur les entités
- [ ] Visuellement : indistinguable d'une page Buck (mêmes tokens, mêmes patterns, dark amber)
- [ ] `docker compose build && docker compose up -d` → 3 containers up & healthy
- [ ] `https://bible.buck.romain-ecarnot.com` demande login, après auth → SPA chargé, routes naviguables, fetch `/mcp` OK
- [ ] Restart `bible-mcp` → bible-ui en état dégradé propre (toast erreur, pas de crash), buck-app affiche `Bible MCP indisponible`
- [ ] Card-referentiel dans Buck → clic → nouvel onglet bible-ui
- [ ] Vitest passe sur bible-ui
- [ ] `pnpm typecheck` et `pnpm lint` passent sur tout le monorepo

## 9. Hors scope (volontairement)

- Tests Playwright e2e sur bible-ui
- Auth bible-ui partagée avec Buck (basicauth Caddy suffit pour cette itération)
- Mode light pour bible-ui (dark only)
- Migration / réorganisation des données Bible (le bible-mcp lit déjà sa DB existante)
- Multi-projet Bible (un seul univers pour l'instant, comme aujourd'hui)
- Édition collaborative temps réel
- Versioning / undo intégré dans l'UI (les backups existants suffisent)

## 10. Risques & mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Migration `react-router-dom` → TanStack Router lourde | Délai | 13 routes mécaniques, ~2h de boulot, pas de logique business à toucher |
| Outils MCP Bible manquants par rapport à `barda/ui` | Pages cassées | Inventaire à faire au démarrage du portage : `listTools()` côté barda vs côté bible-mcp Buck, gaps documentés et soit ajoutés au bible-mcp soit pages désactivées |
| Sigma pas trivial à styler dark | Page Graph moche | Lib supporte les thèmes, on aligne sur les tokens OKLCH ; fallback : palette manuelle dans `GraphView` |
| Build Docker bible-ui lourd (deps front) | Image > 200MB | Stage builder isolé, l'image finale = nginx alpine + dist/ uniquement (~30MB) |
| Conflit port 5173 entre `@buck/web` et `@buck/bible-ui` en dev | `pnpm dev:all` casse | Bible-ui sur 5174 par défaut |
| Var `VITE_BIBLE_UI_URL` non setée au build prod | Card-referentiel ouvre `undefined` | Vérifier la présence dans `Dockerfile.app` (ARG required), build CI fail si manquant |
