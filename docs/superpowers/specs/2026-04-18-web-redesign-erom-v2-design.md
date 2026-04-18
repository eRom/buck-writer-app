# Web redesign — erom-design v2

**Date** : 2026-04-18
**Scope** : Refonte complete du skin et de la structure des composants de `@buck/web`. Logique metier, API, hooks et stores inchanges.
**Design system** : erom-design v2 (dark-first, OKLCH gris chauds, brand amber parametrique, borders > shadows).

## Objectif

Remplacer l'UI actuelle (shadcn stone, Figtree, routes `/settings` multi-pages, route `/workspace` dediee) par un shell 3-panneaux inspire de la demo desktop-style fournie par Romain, aligne sur erom-design v2.

Livrable : une app web monopage chat-first, avec sidebar gauche (sessions), zone chat centrale, panel droit (settings contextuels). Routes secondaires (`/settings`, `/login`) re-skinnees en coherence.

## Decisions produit validees

| Sujet | Choix |
|-------|-------|
| Perimetre | B — UI only + restructure composants, logique metier preservee |
| Layout global | Shell 3 panneaux sur route chat uniquement ; pas de shell global |
| Top bar | Aucune — toggles panels flottants dans coins sup des sidebars |
| Cards panel droit | 4 cards : Parametres / Workspace / Referentiel / MCP |
| Model selector | Dans card Parametres (panel droit), en premier |
| Budget counter | Dans card Parametres, pas de status bar dediee |
| Prompts SYSTEM/USER/RULES | Retires de l'UI (projet client, pas de jouage prompt en prod) |
| Outils toggle | Retires de l'UI (projet client, pas de YOLO mode) |
| Sidebar sections | Search + FAVORIS + AUJOURD'HUI + 7 DERNIERS JOURS + PLUS ANCIEN |
| Favoris | Migration Drizzle : `chat_sessions.is_favorite` |
| Bubble user | Sombre aligne a droite (style demo) |
| Bubble assistant | Sans fond ni bordure, avatar sparkle a gauche |
| Reasoning | Collapsible `> Reflexion` branche sur SSE reasoning events |
| Tool calls | Collapsible unique `> N outils utilises` wrappant tool-call + terminal + approval |
| Footer metadata message | Toujours visible, `opacity-40` |
| Approval inline | Bandeau amber dans le collapsible outils |
| Input bar | Textarea + chips attachments + paperclip + send (pas de micro) |
| Route `/workspace` | Supprimee — file tree integre dans card Workspace du panel droit |
| Route `/settings` | Fusion mono-page scrollable (sections Budget + Compte) |
| Login | Card centree re-skin, logique magic-link inchangee |
| Font | Figtree conservee (pas Inter) |
| Scrollbar | Custom 6px WebKit (pattern erom v2) |
| Toasts | Sonner re-skin dark + amber |

## Architecture composants

### Layout

```
src/components/layout/
  chat-shell.tsx              -- wrapper 3 panneaux, gere toggles + persistance state
  sidebar-left.tsx            -- container sidebar gauche (expand/collapse)
  sidebar-left-header.tsx     -- search input + toggle collapse
  sidebar-left-sessions.tsx   -- liste sessions groupees (Favoris / Today / 7j / Older)
  sidebar-left-footer.tsx     -- user pill + dropdown menu (settings, logout)
  panel-right.tsx             -- container panel droit (expand/collapse)
  panel-right-collapsed.tsx   -- stack icones quand collapsed
```

### Sidebar gauche — groupement sessions

- Tri : `isFavorite desc, updatedAt desc`.
- Groupes dans cet ordre : `FAVORIS` (tous `isFavorite=true`), `AUJOURD'HUI` (updatedAt >= minuit local), `7 DERNIERS JOURS` (date - 7j < updatedAt < minuit), `PLUS ANCIEN` (le reste).
- Un groupe vide n'est pas rendu.
- Section headers : `sticky top-0 z-10 bg-sidebar/95 backdrop-blur-sm text-[11px] font-semibold tracking-wide uppercase text-sidebar-foreground/40`.
- Item actif : `bg-sidebar-accent text-sidebar-accent-foreground`.
- Etoile favoris : bouton au hover de chaque item, amber si actif. Toggle via mutation TanStack Query.

### Panel droit — cards

```
src/components/panel-right/
  card-parametres.tsx     -- model selector + counter budget
  card-workspace.tsx      -- path WORKSPACE_DIR + file tree compact
  card-referentiel.tsx    -- toggle Bible MCP on/off
  card-mcp.tsx            -- liste serveurs MCP (hors Bible) avec toggle chacun
```

Collapsed panel : stack d'icones `w-10` centrees, cliquer une icone ouvre le panel et scrolle vers la card correspondante.

### Chat area

Le `chat-area.tsx` actuel (16.2 KB, mixe logique + rendu) est eclate :

```
src/components/chat/
  chat-stream.tsx              -- container, scroll auto, streaming state
  chat-empty-state.tsx         -- empty state centre (sparkle + CTA)
  message-user.tsx             -- bubble droite sombre + bouton copy hover
  message-assistant.tsx        -- avatar sparkle + children + footer metadata
  reasoning-collapsible.tsx    -- "> Reflexion" collapsible
  tool-calls-collapsible.tsx   -- "> N outils utilises" collapsible, wrap sous-composants
  tool-call-item.tsx           -- rendu d'un tool call individuel (selon type)
  message-footer.tsx           -- metadata : provider + model + duree + tokens + cost
  chat-input.tsx               -- textarea + attachments chips + actions
  attachment-chip.tsx          -- chip fichier attache avec remove
```

Garde : `markdown-renderer.tsx`, `at-reference.tsx`, `attachment-preview.tsx` (usage logique inchange, juste restylises).

Supprime : `message-bubble.tsx` (remplace par `message-user` + `message-assistant`), `approval-block.tsx` (absorbe dans `tool-call-item.tsx` selon type), `terminal-block.tsx` (absorbe idem), `tool-call-display.tsx` (remplace par `tool-call-item.tsx`), `sidebar.tsx` (remplace par nouveau `sidebar-left-*`), `chat-layout.tsx` (remplace par `chat-shell.tsx`), `bible-status-banner.tsx` (info rendue dans card Referentiel du panel droit).

### Primitives UI (shadcn)

Reinstaller depuis zero avec preset erom v2 :
- `button`, `input`, `textarea`, `dialog`, `dropdown-menu`, `scroll-area` (deja presents, a regenerer)
- Ajouts : `tooltip`, `popover`, `collapsible`, `switch`, `select`, `separator`, `avatar`, `sheet` (pour mobile sidebar)
- MCP shadcn utilise pour ajouter les composants (`shadcn@latest add ...`) avec config erom v2.

## Tokens & theme

`packages/web/src/index.css` reconstruit :

1. `@import "tailwindcss"` + `@import "tw-animate-css"`.
2. `@custom-variant dark (&:where(.dark, .dark *))`.
3. Bloc `@theme inline` mappant les CSS vars → couleurs, radius, font.
4. `:root` avec vars OKLCH light (pour fallback, meme si app dark-first).
5. `.dark` avec vars OKLCH dark = valeurs issues de `semantic-dark.tokens.json`.
6. Vars `--primary` = brand amber (defaut), `--primary-border` calcule via `hsl(from ... / alpha)`.
7. `@layer utilities` : `hover-elevate`, `active-elevate-2`, `toggle-elevate`, `toggle-elevated`, `no-default-active-elevate` (copie exacte depuis erom v2).
8. Scrollbar custom 6px WebKit.
9. `::selection` amber.
10. `html.dark` force par defaut sur `<html>` dans `index.html`.

Font `Figtree` chargee via `@fontsource-variable/figtree`, JetBrains Mono pour code/metadata via `@fontsource-variable/jetbrains-mono` (ajout dep). Figtree = `--font-sans`, JetBrains Mono = `--font-mono`.

## Routes

### `/` (chat)

Shell 3 panneaux. State panels persiste dans `localStorage` (`buck.sidebarCollapsed`, `buck.panelRightCollapsed`). Pas de session active → chat-empty-state avec CTA "Nouvelle conversation" qui cree et focus l'input.

### `/login`

Card centree `max-w-sm`, logo `Buck Writer` + icone sparkle, input email, bouton primary "Recevoir le lien magique". Dark fond uni (`bg-background`). En mode dev (`E2E=1`), bouton secondaire "Dev login" visible.

### `/settings`

Layout simple : titre "Parametres" + lien retour chat en haut, page scrollable avec sections ancrees :
- **Compte** : email, logout, dernier login.
- **Budget** : budget mensuel editable, consommation du mois, seuils d'alerte.

Suppression de la structure multi-pages (`/settings/general|budget|compte`). Migration des composants `packages/web/src/components/settings/*` si compatibles, sinon reecriture minimale. La section Compte et Budget sont chacune un `<Card>` erom v2.

### `/auth/callback`

Inchangee (transparent, redirect).

### `/workspace`

**Supprimee.** Le file tree vit desormais dans la card Workspace du panel droit.

## Flow de donnees

Inchange cote API : `fetchMe`, `fetchSessions`, `fetchWorkspaceTree`, `useChat` (AI SDK), etc. Ajouts :

- `toggleFavorite(sessionId)` → `PATCH /api/sessions/:id { isFavorite }`. Nouvelle route API, mutation TanStack Query invalidant la liste.
- `fetchMcpServers()` / `toggleMcpServer(name, enabled)` → existants M4 (Bible MCP), etendus pour les autres serveurs MCP.

## Migration DB

Une seule migration Drizzle :

```sql
ALTER TABLE chat_sessions ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_chat_sessions_is_favorite ON chat_sessions(is_favorite);
```

Schema TS : `chatSessions.isFavorite: integer('is_favorite').notNull().default(0)`.

## Comportements cles

**Toggle collapse sidebar gauche** (icone `[<]` en top-right de la sidebar) : anime `width 300px ↔ 52px` via `transition-[width] duration-200 ease-out`. Quand collapsed, sections devient stack d'icones de conversations (on montre les N favoris + N recents comme icones bulles).

**Toggle collapse panel droit** (icone `[>]` en top-left du panel) : anime `width 300px ↔ 40px`. Collapsed = stack d'icones (1 par card).

**Kbd shortcut** : `cmd/ctrl + b` toggle sidebar gauche ; `cmd/ctrl + \` toggle panel droit.

**Mobile** (`< lg`) : sidebar gauche devient `Sheet` (radix) overlay, trigger hamburger floating top-left. Panel droit devient un `Sheet` right, trigger floating top-right. Chat occupe toute la largeur.

**Streaming message** : pendant le stream, le collapsible `> Reflexion` est auto-ouvert si du reasoning arrive ; se referme automatiquement quand le message termine. Le footer metadata n'apparait qu'apres fin de stream.

**Approval request** : un tool call en attente d'approbation rend le collapsible outils auto-ouvert, scroll vers le block, les boutons Autoriser/Refuser sont amber (Autoriser) et secondary (Refuser), pattern erom v2.

## Ordre de travail suggere

Le plan d'implementation detaille sera produit ensuite. Sequence generale :

1. **Tokens & theme** : `index.css` erom v2, `<html class="dark">`, fontsource.
2. **Primitives shadcn** : reinstall avec preset/palette erom v2 via MCP shadcn.
3. **Layout shell** : `chat-shell`, `sidebar-left`, `panel-right` avec toggles fonctionnels, sans contenu metier.
4. **Sidebar gauche** : migration `is_favorite`, API toggle, groupement sessions, user pill.
5. **Panel droit** : les 4 cards branchees sur les APIs existantes.
6. **Chat area** : eclatement `chat-area.tsx`, reasoning/tools collapsibles, footer metadata.
7. **Input** : chips attachments, textarea + actions.
8. **Route `/settings`** mono-page.
9. **Route `/login`** reskin.
10. **Suppression route `/workspace`** + cleanup imports.
11. **Tests** : mise a jour des tests composants existants (Testing Library) pour pointer vers les nouveaux noms/IDs, mise a jour Playwright e2e pour les nouveaux selectors.

## Checklist de conformite erom v2

Chaque composant livre doit respecter :

- [ ] `.dark` par defaut sur `<html>`.
- [ ] CSS variables OKLCH, zero hex en dur.
- [ ] Bordures > shadows pour la hierarchie.
- [ ] Surfaces dark en gris chaud hue 24-30.
- [ ] `--primary` = amber.
- [ ] Texte principal `text-sm`, nav `text-[13px]`, badges `text-[10px]`.
- [ ] Pattern `hover-elevate` sur boutons et badges.
- [ ] Popovers : `bg-popover/95 backdrop-blur-xl`.
- [ ] Sticky headers : `bg-sidebar/95 backdrop-blur-sm`.
- [ ] `lucide-react` uniquement, `w-4 h-4` standard.
- [ ] Badges semantiques : `bg-{color}-500/10 text-{color}-400`.
- [ ] Transitions 150-200ms `ease-out`.
- [ ] Scrollbar custom 6px.
- [ ] `::selection` amber.

## Hors scope

- Mode clair (light theme) : le theme light est mappe dans les tokens erom v2 mais n'est pas active pour cette refonte. `html.dark` est hard-code.
- Tabs `Chat` / `Taches` / `Arena` de la demo : non implementes (pas de backend).
- Section `MEET` de la demo : non implementee.
- Section `Eleve` / `Role` persona : non implementees.
- Options `Recherche web` / `Mode Plan` / `Referentiel custom` / `Remote` / `VCR Recording` : non implementees.
- Micro vocal dans l'input : non implemente.
- Traffic lights macOS / drag handle : non implementes (on est en web pur).
- Prompts SYSTEM/USER/RULES editables cote UI : retires (le backend continue a hot-reload depuis `$WORKSPACE_DIR/systems/`, mais pas d'editeur dans l'app).
- Toggle YOLO / bypass approval : retire.

## Risques identifies

- **Regression streaming** : l'eclatement de `chat-area.tsx` doit preserver exactement la meme gestion du stream AI SDK. Atenuation : tests e2e Playwright sur un scenario complet avant de supprimer l'ancien code.
- **Regression approval system** : absorber `approval-block.tsx` dans `tool-call-item.tsx` doit preserver les flows M3.5. Atenuation : tests unitaires Testing Library sur le composant qui mockent les 3 etats (pending / authorized / denied).
- **Favoris migration** : ajout de colonne sur une table en prod. Atenuation : migration idempotente (`ALTER ... DEFAULT 0`), testee en local sur la DB existante.
- **File tree dans panel droit** : densite visuelle, risque d'illisibilite a 300px. Atenuation : arbre scrollable, indentation 12px, font `text-xs`, truncate names avec tooltip au hover.

## Reference design

- Screenshots demo Romain (sidebar + panel droit + chat en streaming) : vus en brainstorming, non joints au repo.
- Mockup M3 initial (`docs/ui/` si present) : sert d'ancrage pour le layout 3 panneaux et le pattern approval inline.
- Skill `erom-design` v2 : `~/.claude/skills/erom-design/` — source de verite pour tokens, patterns et composants.
- Demo Vite+TS erom v2 : `~/.claude/skills/erom-design/references/vite-demo-sources/` — reference d'implementation shadcn.
