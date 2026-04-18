# Web Redesign erom-design v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refaire le skin et la structure des composants de `@buck/web` en appliquant erom-design v2 (dark-first, OKLCH, amber brand), avec un shell 3-panneaux (sidebar gauche sessions + chat central + panel droit settings contextuels).

**Architecture:** Theme erom v2 dans `index.css`. Composants shadcn-new-york reinstallees. Chat-area eclate en sous-composants cibles. Nouvelle table de favoris via migration Drizzle. Route `/workspace` supprimee (file tree integre dans le panel droit). Route `/settings` fusionnee mono-page.

**Tech Stack:** React 19, TanStack Router, TanStack Query, Tailwind v4, shadcn new-york, erom-design v2 tokens, lucide-react, Figtree + JetBrains Mono, Vitest, Playwright, Drizzle ORM, SQLite.

**Spec:** `docs/superpowers/specs/2026-04-18-web-redesign-erom-v2-design.md`

---

## Phase 0 — Preparation

### Task 0: Creer la branche de travail

**Files:** aucune creation, setup git

- [ ] **Step 1: Verifier etat propre**

Run: `git status`
Expected: `nothing to commit, working tree clean`

- [ ] **Step 2: Creer la branche**

Run: `git checkout -b feat/web-redesign-erom-v2`
Expected: `Switched to a new branch 'feat/web-redesign-erom-v2'`

- [ ] **Step 3: Noter le point de depart**

Run: `git rev-parse HEAD > /tmp/buck-redesign-start.sha && cat /tmp/buck-redesign-start.sha`
Expected: affiche le SHA du commit de base (sur `main`)

---

## Phase 1 — Theme erom v2

### Task 1: Ajouter JetBrains Mono dep

**Files:**
- Modify: `packages/web/package.json`

- [ ] **Step 1: Ajouter dep**

Run:
```bash
cd packages/web && pnpm add @fontsource-variable/jetbrains-mono
```
Expected: installation reussie, package.json mis a jour.

- [ ] **Step 2: Verifier**

Run: `grep jetbrains-mono packages/web/package.json`
Expected: ligne `"@fontsource-variable/jetbrains-mono": "^..."`

- [ ] **Step 3: Commit**

```bash
git add packages/web/package.json pnpm-lock.yaml
git commit -m "chore(web): add @fontsource-variable/jetbrains-mono"
```

### Task 2: Index.css theme erom v2

**Files:**
- Modify: `packages/web/src/index.css` (reecrire complet)

- [ ] **Step 1: Reecrire `packages/web/src/index.css`**

Contenu complet a ecrire (remplace l'existant) :

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "@fontsource-variable/figtree";
@import "@fontsource-variable/jetbrains-mono";

@custom-variant dark (&:where(.dark, .dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-card-border: var(--card-border);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover-border: var(--popover-border);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary-border: var(--primary-border);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary-border: var(--secondary-border);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-destructive-border: var(--destructive-border);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --radius-sm: calc(var(--radius) - 5px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
}

:root {
  --radius: 0.75rem;
  --font-sans: 'Figtree Variable', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono Variable', ui-monospace, monospace;
  --opaque-button-border-intensity: -8;

  --background: oklch(0.98 0 0);
  --foreground: oklch(0.15 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.15 0 0);
  --card-border: oklch(0.9 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.15 0 0);
  --popover-border: oklch(0.9 0 0);
  --primary: oklch(0.76 0.17 70);
  --primary-foreground: oklch(0.15 0 0);
  --primary-border: hsl(from oklch(0.76 0.17 70) h s calc(l + -8) / 1);
  --secondary: oklch(0.94 0 0);
  --secondary-foreground: oklch(0.2 0 0);
  --secondary-border: oklch(0.86 0 0);
  --muted: oklch(0.96 0 0);
  --muted-foreground: oklch(0.5 0 0);
  --accent: oklch(0.94 0 0);
  --accent-foreground: oklch(0.2 0 0);
  --destructive: oklch(0.63 0.22 27);
  --destructive-foreground: oklch(1 0 0);
  --destructive-border: hsl(from oklch(0.63 0.22 27) h s calc(l + -8) / 1);
  --border: oklch(0.9 0 0);
  --input: oklch(0.9 0 0);
  --ring: oklch(0.76 0.17 70);
  --sidebar: oklch(0.97 0 0);
  --sidebar-foreground: oklch(0.2 0 0);
  --sidebar-primary: oklch(0.76 0.17 70);
  --sidebar-primary-foreground: oklch(0.15 0 0);
  --sidebar-accent: oklch(0.94 0 0);
  --sidebar-accent-foreground: oklch(0.2 0 0);
  --sidebar-border: oklch(0.9 0 0);
  --sidebar-ring: oklch(0.76 0.17 70);
}

.dark {
  --opaque-button-border-intensity: 9;

  --background: oklch(0.155 0.006 28);
  --foreground: oklch(0.95 0 0);
  --card: oklch(0.19 0.007 28);
  --card-foreground: oklch(0.95 0 0);
  --card-border: oklch(0.27 0.007 28);
  --popover: oklch(0.19 0.007 28);
  --popover-foreground: oklch(0.95 0 0);
  --popover-border: oklch(0.27 0.007 28);
  --primary: oklch(0.82 0.17 70);
  --primary-foreground: oklch(0.15 0.01 40);
  --primary-border: hsl(from oklch(0.82 0.17 70) h s calc(l + 9) / 1);
  --secondary: oklch(0.24 0.007 28);
  --secondary-foreground: oklch(0.95 0 0);
  --secondary-border: oklch(0.32 0.007 28);
  --muted: oklch(0.22 0.007 28);
  --muted-foreground: oklch(0.65 0.005 28);
  --accent: oklch(0.27 0.008 28);
  --accent-foreground: oklch(0.95 0 0);
  --destructive: oklch(0.58 0.22 27);
  --destructive-foreground: oklch(0.98 0 0);
  --destructive-border: hsl(from oklch(0.58 0.22 27) h s calc(l + 9) / 1);
  --border: oklch(0.27 0.007 28);
  --input: oklch(0.24 0.007 28 / 0.6);
  --ring: oklch(0.82 0.17 70);
  --sidebar: oklch(0.17 0.006 28);
  --sidebar-foreground: oklch(0.88 0 0);
  --sidebar-primary: oklch(0.82 0.17 70);
  --sidebar-primary-foreground: oklch(0.15 0.01 40);
  --sidebar-accent: oklch(0.24 0.008 28);
  --sidebar-accent-foreground: oklch(0.95 0 0);
  --sidebar-border: oklch(0.24 0.007 28);
  --sidebar-ring: oklch(0.82 0.17 70);

  --elevate-1: oklch(1 0 0 / 0.04);
  --elevate-2: oklch(0 0 0 / 0.4);
}

:root {
  --elevate-1: oklch(0 0 0 / 0.04);
  --elevate-2: oklch(0 0 0 / 0.08);
}

@layer base {
  * {
    border-color: var(--border);
  }
  html {
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
  }
  body {
    background-color: var(--background);
    color: var(--foreground);
  }
  code, pre, kbd {
    font-family: var(--font-mono);
  }
  ::selection {
    background-color: var(--primary);
    color: var(--primary-foreground);
  }
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: var(--muted-foreground);
    border-radius: 3px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: var(--foreground);
  }
}

@layer utilities {
  .hover-elevate {
    transition: box-shadow 150ms ease, transform 150ms ease;
  }
  .hover-elevate:hover {
    box-shadow: var(--elevate-1) 0 0 0 1px, var(--elevate-2) 0 4px 8px;
    transform: translateY(-1px);
  }
  .active-elevate-2:active {
    box-shadow: var(--elevate-2) 0 0 0 1px;
    transform: translateY(0px);
  }
  .toggle-elevate {
    transition: box-shadow 150ms ease, transform 150ms ease;
  }
  .toggle-elevated {
    box-shadow: var(--elevate-1) 0 0 0 1px, var(--elevate-2) 0 4px 8px;
  }
  .no-default-active-elevate:active {
    transform: none !important;
    box-shadow: none !important;
  }
}
```

- [ ] **Step 2: Forcer `.dark` sur `<html>`**

Modifier `packages/web/index.html` ligne `<html lang="fr">` → `<html lang="fr" class="dark">`.

- [ ] **Step 3: Lancer dev et verifier visuellement**

Run (en background, monitor tab) : `cd packages/web && pnpm dev`
Ouvrir `http://localhost:5173` → l'app doit avoir un fond gris chaud fonce (`oklch(0.155 0.006 28)`) et texte blanc cassé. L'ancienne palette stone doit avoir disparu.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/index.css packages/web/index.html
git commit -m "feat(web): theme erom-design v2 (OKLCH, amber brand, dark-first)"
```

---

## Phase 2 — Migration DB favoris

### Task 3: Ajouter `is_favorite` au schema

**Files:**
- Modify: `packages/api/src/db/schema.ts:63-83`

- [ ] **Step 1: Ajouter le champ dans `chatSessions`**

Modifier le bloc `chatSessions` pour ajouter `isFavorite` avant `archived` :

```typescript
export const chatSessions = sqliteTable(
  'chat_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    model: text('model').notNull(),
    reasoningEffort: text('reasoning_effort').notNull(),
    isFavorite: integer('is_favorite').notNull().default(0),
    archived: integer('archived').notNull().default(0),
    deletedAt: integer('deleted_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    lastMessageAt: integer('last_message_at'),
  },
  (t) => ({
    userIdx: index('chat_sessions_user_idx').on(t.userId),
    updatedIdx: index('chat_sessions_updated_idx').on(t.updatedAt),
    favoriteIdx: index('chat_sessions_favorite_idx').on(t.isFavorite),
  }),
);
```

- [ ] **Step 2: Generer la migration**

Run: `cd packages/api && pnpm db:generate`
Expected: nouveau fichier `packages/api/migrations/0004_*.sql` avec `ALTER TABLE chat_sessions ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;` et la creation de l'index.

- [ ] **Step 3: Appliquer la migration**

Run: `cd packages/api && pnpm db:migrate`
Expected: migration appliquee sur la DB dev.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/db/schema.ts packages/api/migrations/0004_*.sql packages/api/migrations/meta/
git commit -m "feat(api): add chat_sessions.is_favorite column + index"
```

### Task 4: Route API toggle favorite

**Files:**
- Modify: `packages/api/src/routes/sessions.ts` (trouver et etendre la route PATCH existante)
- Test: `packages/api/src/routes/sessions.test.ts` (ajouter cas)

- [ ] **Step 1: Localiser la route PATCH**

Run: `grep -n "PATCH\|patch\|updateSession" packages/api/src/routes/sessions.ts`
Expected: voir la route `PATCH /:id` existante qui accepte `{ title?, archived? }`.

- [ ] **Step 2: Ajouter le test d'abord**

Dans `packages/api/src/routes/sessions.test.ts`, ajouter apres les autres tests PATCH :

```typescript
it('PATCH /api/sessions/:id toggles is_favorite', async () => {
  const session = await createTestSession(app, userId);
  const res = await request(app)
    .patch(`/api/sessions/${session.id}`)
    .set('Cookie', authCookie)
    .send({ isFavorite: true })
    .expect(200);
  expect(res.body.isFavorite).toBe(1);

  const res2 = await request(app)
    .patch(`/api/sessions/${session.id}`)
    .set('Cookie', authCookie)
    .send({ isFavorite: false })
    .expect(200);
  expect(res2.body.isFavorite).toBe(0);
});
```

Adapter `createTestSession`, `authCookie` selon la conv existante (regarder un autre test PATCH dans le fichier).

- [ ] **Step 3: Lancer le test pour verifier qu'il echoue**

Run: `cd packages/api && pnpm test sessions -- --run`
Expected: le nouveau test echoue ("isFavorite is not allowed" ou similaire).

- [ ] **Step 4: Etendre la route PATCH**

Dans le handler PATCH `/:id`, elargir le schema Zod de body :

```typescript
const patchSessionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  archived: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
});
```

Dans le handler, apres la validation, ajouter au patch object :

```typescript
if (body.isFavorite !== undefined) {
  patch.isFavorite = body.isFavorite ? 1 : 0;
}
```

Au retour, s'assurer que `isFavorite` est inclus dans la reponse (propager depuis la row SQL).

- [ ] **Step 5: Relancer le test**

Run: `cd packages/api && pnpm test sessions -- --run`
Expected: tous tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routes/sessions.ts packages/api/src/routes/sessions.test.ts
git commit -m "feat(api): PATCH /api/sessions/:id accepts isFavorite toggle"
```

### Task 5: Web lib `toggleFavorite`

**Files:**
- Modify: `packages/web/src/lib/sessions.ts`

- [ ] **Step 1: Ajouter le champ et la fonction**

Dans `packages/web/src/lib/sessions.ts` :

```typescript
export interface Session {
  id: string;
  title: string;
  model: string;
  isFavorite: number;
  archived: number;
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number | null;
}

export async function updateSession(
  id: string,
  data: { title?: string; archived?: boolean; isFavorite?: boolean },
): Promise<Session> {
  return apiFetch<Session>(`/api/sessions/${id}`, {
    method: 'PATCH',
    body: data,
  });
}

export async function toggleFavorite(id: string, isFavorite: boolean): Promise<Session> {
  return updateSession(id, { isFavorite });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/web && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/sessions.ts
git commit -m "feat(web): toggleFavorite helper + isFavorite field"
```

### Task 6: Grouping helper + tests

**Files:**
- Create: `packages/web/src/lib/session-groups.ts`
- Create: `packages/web/src/lib/session-groups.test.ts`

- [ ] **Step 1: Ecrire le test d'abord**

`packages/web/src/lib/session-groups.test.ts` :

```typescript
import { describe, it, expect } from 'vitest';
import { groupSessions } from './session-groups';
import type { Session } from './sessions';

const baseSession: Session = {
  id: '1',
  title: 't',
  model: 'gpt-4',
  isFavorite: 0,
  archived: 0,
  createdAt: 0,
  updatedAt: 0,
  lastMessageAt: null,
};

const NOW = new Date('2026-04-18T12:00:00Z').getTime();

describe('groupSessions', () => {
  it('places favorites in their own group at top, regardless of date', () => {
    const sessions: Session[] = [
      { ...baseSession, id: 'a', updatedAt: NOW - 1000 * 60 * 60 * 24 * 30, isFavorite: 1 },
      { ...baseSession, id: 'b', updatedAt: NOW - 1000, isFavorite: 0 },
    ];
    const groups = groupSessions(sessions, NOW);
    expect(groups[0].key).toBe('favorites');
    expect(groups[0].sessions.map((s) => s.id)).toEqual(['a']);
  });

  it('groups today / last 7 days / older', () => {
    const sessions: Session[] = [
      { ...baseSession, id: 'today', updatedAt: NOW - 1000 * 60 * 60 * 2 },
      { ...baseSession, id: 'week', updatedAt: NOW - 1000 * 60 * 60 * 24 * 3 },
      { ...baseSession, id: 'old', updatedAt: NOW - 1000 * 60 * 60 * 24 * 30 },
    ];
    const groups = groupSessions(sessions, NOW);
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g.sessions.map((s) => s.id)]));
    expect(byKey.today).toEqual(['today']);
    expect(byKey.week).toEqual(['week']);
    expect(byKey.older).toEqual(['old']);
  });

  it('omits empty groups', () => {
    const sessions: Session[] = [
      { ...baseSession, id: 'today', updatedAt: NOW - 1000 * 60 * 60 * 2 },
    ];
    const groups = groupSessions(sessions, NOW);
    expect(groups.map((g) => g.key)).toEqual(['today']);
  });
});
```

- [ ] **Step 2: Lancer le test (doit echouer)**

Run: `cd packages/web && pnpm test session-groups -- --run`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implementer**

`packages/web/src/lib/session-groups.ts` :

```typescript
import type { Session } from './sessions';

export type SessionGroupKey = 'favorites' | 'today' | 'week' | 'older';

export interface SessionGroup {
  key: SessionGroupKey;
  label: string;
  sessions: Session[];
}

const LABELS: Record<SessionGroupKey, string> = {
  favorites: 'FAVORIS',
  today: 'AUJOURD\'HUI',
  week: '7 DERNIERS JOURS',
  older: 'PLUS ANCIEN',
};

function startOfToday(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function groupSessions(sessions: Session[], nowMs: number = Date.now()): SessionGroup[] {
  const favorites: Session[] = [];
  const today: Session[] = [];
  const week: Session[] = [];
  const older: Session[] = [];
  const todayStart = startOfToday(nowMs);
  const weekStart = todayStart - 1000 * 60 * 60 * 24 * 7;

  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  for (const s of sorted) {
    if (s.isFavorite) {
      favorites.push(s);
      continue;
    }
    if (s.updatedAt >= todayStart) today.push(s);
    else if (s.updatedAt >= weekStart) week.push(s);
    else older.push(s);
  }

  const groups: SessionGroup[] = [];
  for (const [key, list] of [
    ['favorites', favorites],
    ['today', today],
    ['week', week],
    ['older', older],
  ] as const) {
    if (list.length > 0) groups.push({ key, label: LABELS[key], sessions: list });
  }
  return groups;
}
```

- [ ] **Step 4: Test doit passer**

Run: `cd packages/web && pnpm test session-groups -- --run`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/session-groups.ts packages/web/src/lib/session-groups.test.ts
git commit -m "feat(web): groupSessions helper with tests (favorites/today/7d/older)"
```

---

## Phase 3 — Layout shell

### Task 7: Composant `chat-shell`

**Files:**
- Create: `packages/web/src/components/layout/chat-shell.tsx`
- Create: `packages/web/src/lib/use-panels-state.ts`

- [ ] **Step 1: Hook state panels**

`packages/web/src/lib/use-panels-state.ts` :

```typescript
import { useEffect, useState } from 'react';

const LS_LEFT = 'buck.sidebarCollapsed';
const LS_RIGHT = 'buck.panelRightCollapsed';

function read(key: string): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(key) === '1';
}

export function usePanelsState() {
  const [leftCollapsed, setLeftCollapsed] = useState<boolean>(() => read(LS_LEFT));
  const [rightCollapsed, setRightCollapsed] = useState<boolean>(() => read(LS_RIGHT));

  useEffect(() => {
    window.localStorage.setItem(LS_LEFT, leftCollapsed ? '1' : '0');
  }, [leftCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(LS_RIGHT, rightCollapsed ? '1' : '0');
  }, [rightCollapsed]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setLeftCollapsed((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setRightCollapsed((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return { leftCollapsed, setLeftCollapsed, rightCollapsed, setRightCollapsed };
}
```

- [ ] **Step 2: Composant chat-shell**

`packages/web/src/components/layout/chat-shell.tsx` :

```tsx
import { type ReactNode } from 'react';
import { usePanelsState } from '@/lib/use-panels-state';

interface Props {
  sidebarLeft: (args: { collapsed: boolean; onToggle: () => void }) => ReactNode;
  main: ReactNode;
  panelRight: (args: { collapsed: boolean; onToggle: () => void }) => ReactNode;
}

export function ChatShell({ sidebarLeft, main, panelRight }: Props) {
  const { leftCollapsed, setLeftCollapsed, rightCollapsed, setRightCollapsed } = usePanelsState();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <aside
        className="shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out"
        style={{ width: leftCollapsed ? 52 : 300 }}
      >
        {sidebarLeft({ collapsed: leftCollapsed, onToggle: () => setLeftCollapsed((v) => !v) })}
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">{main}</main>
      <aside
        className="shrink-0 border-l border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out"
        style={{ width: rightCollapsed ? 40 : 300 }}
      >
        {panelRight({ collapsed: rightCollapsed, onToggle: () => setRightCollapsed((v) => !v) })}
      </aside>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd packages/web && pnpm typecheck`
Expected: PASS (le composant n'est pas encore utilise, c'est normal).

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/layout/chat-shell.tsx packages/web/src/lib/use-panels-state.ts
git commit -m "feat(web): ChatShell layout + usePanelsState hook"
```

---

## Phase 4 — Sidebar gauche

### Task 8: Sidebar headers + toggle collapse

**Files:**
- Create: `packages/web/src/components/layout/sidebar-left.tsx`
- Create: `packages/web/src/components/layout/sidebar-left-header.tsx`
- Create: `packages/web/src/components/layout/sidebar-left-footer.tsx`

- [ ] **Step 1: Header (search + toggle)**

`packages/web/src/components/layout/sidebar-left-header.tsx` :

```tsx
import { Search, PanelLeftClose, PanelLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  query: string;
  onQueryChange: (q: string) => void;
}

export function SidebarLeftHeader({ collapsed, onToggle, query, onQueryChange }: Props) {
  if (collapsed) {
    return (
      <div className="flex h-10 items-center justify-center">
        <button
          onClick={onToggle}
          aria-label="Deployer la sidebar"
          className="hover-elevate rounded-md p-1.5 text-sidebar-foreground/70 hover:text-sidebar-foreground"
        >
          <PanelLeft className="size-4" />
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 p-2">
      <div className="relative flex-1">
        <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-sidebar-foreground/40" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Rechercher..."
          className="h-8 pl-7 text-[13px]"
        />
      </div>
      <button
        onClick={onToggle}
        aria-label="Replier la sidebar"
        className="hover-elevate rounded-md p-1.5 text-sidebar-foreground/70 hover:text-sidebar-foreground"
      >
        <PanelLeftClose className="size-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Footer (user pill)**

`packages/web/src/components/layout/sidebar-left-footer.tsx` :

```tsx
import { Link } from '@tanstack/react-router';
import { User, Settings, LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Props {
  collapsed: boolean;
  email: string;
  onLogout: () => void;
}

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

export function SidebarLeftFooter({ collapsed, email, onLogout }: Props) {
  if (collapsed) {
    return (
      <div className="border-t border-sidebar-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="hover-elevate flex h-8 w-full items-center justify-center rounded-md bg-sidebar-accent text-[11px] font-semibold text-sidebar-accent-foreground"
              aria-label="Menu utilisateur"
            >
              {initials(email)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end">
            <DropdownMenuItem asChild>
              <Link to="/settings">
                <Settings className="mr-2 size-4" /> Parametres
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onLogout}>
              <LogOut className="mr-2 size-4" /> Deconnexion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }
  return (
    <div className="border-t border-sidebar-border p-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="hover-elevate flex w-full items-center gap-2 rounded-md p-2 text-left">
            <span className="flex size-8 items-center justify-center rounded-md bg-sidebar-accent text-[11px] font-semibold text-sidebar-accent-foreground">
              {initials(email)}
            </span>
            <span className="truncate text-[13px] text-sidebar-foreground">{email}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start">
          <DropdownMenuItem asChild>
            <Link to="/settings">
              <Settings className="mr-2 size-4" /> Parametres
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onLogout}>
            <LogOut className="mr-2 size-4" /> Deconnexion
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

- [ ] **Step 3: Container sidebar**

`packages/web/src/components/layout/sidebar-left.tsx` :

```tsx
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { SidebarLeftHeader } from './sidebar-left-header';
import { SidebarLeftSessions } from './sidebar-left-sessions';
import { SidebarLeftFooter } from './sidebar-left-footer';
import { apiFetch } from '@/lib/api';

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  email: string;
}

export function SidebarLeft({ collapsed, onToggle, email }: Props) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  async function onLogout() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    navigate({ to: '/login' });
  }

  return (
    <div className="flex h-full flex-col select-none overflow-hidden">
      <SidebarLeftHeader collapsed={collapsed} onToggle={onToggle} query={query} onQueryChange={setQuery} />
      <div className="flex-1 overflow-y-auto">
        <SidebarLeftSessions collapsed={collapsed} query={query} />
      </div>
      <SidebarLeftFooter collapsed={collapsed} email={email} onLogout={onLogout} />
    </div>
  );
}
```

Note : `SidebarLeftSessions` est cree dans la tache suivante — l'import cassera temporairement le typecheck. C'est attendu.

- [ ] **Step 4: Commit (provisoire)**

```bash
git add packages/web/src/components/layout/sidebar-left.tsx \
  packages/web/src/components/layout/sidebar-left-header.tsx \
  packages/web/src/components/layout/sidebar-left-footer.tsx
git commit -m "feat(web): SidebarLeft header + footer"
```

### Task 9: Liste de sessions groupees

**Files:**
- Create: `packages/web/src/components/layout/sidebar-left-sessions.tsx`
- Create: `packages/web/src/components/layout/session-item.tsx`

- [ ] **Step 1: SessionItem**

`packages/web/src/components/layout/session-item.tsx` :

```tsx
import { Link } from '@tanstack/react-router';
import { MessageSquare, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Session } from '@/lib/sessions';

interface Props {
  session: Session;
  active: boolean;
  onToggleFavorite: (id: string, next: boolean) => void;
  collapsed: boolean;
}

export function SessionItem({ session, active, onToggleFavorite, collapsed }: Props) {
  if (collapsed) {
    return (
      <Link
        to="/"
        search={{ session: session.id }}
        aria-label={session.title}
        className={cn(
          'hover-elevate mx-auto my-0.5 flex size-8 items-center justify-center rounded-md',
          active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70',
        )}
      >
        <MessageSquare className="size-4" />
      </Link>
    );
  }
  const isFav = Boolean(session.isFavorite);
  return (
    <Link
      to="/"
      search={{ session: session.id }}
      className={cn(
        'hover-elevate group flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px]',
        active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/80',
      )}
    >
      <MessageSquare className="size-3.5 shrink-0 text-sidebar-foreground/40" />
      <span className="flex-1 truncate">{session.title}</span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleFavorite(session.id, !isFav);
        }}
        aria-label={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        className={cn(
          'shrink-0 transition-opacity',
          isFav ? 'opacity-100 text-primary' : 'opacity-0 group-hover:opacity-60 hover:!opacity-100',
        )}
      >
        <Star className={cn('size-3.5', isFav && 'fill-primary')} />
      </button>
    </Link>
  );
}
```

- [ ] **Step 2: SidebarLeftSessions**

`packages/web/src/components/layout/sidebar-left-sessions.tsx` :

```tsx
import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { fetchSessions, toggleFavorite, type Session, type SessionsResponse } from '@/lib/sessions';
import { groupSessions } from '@/lib/session-groups';
import { SessionItem } from './session-item';

interface Props {
  query: string;
  collapsed: boolean;
}

export function SidebarLeftSessions({ query, collapsed }: Props) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['sessions', query],
    queryFn: () => fetchSessions(query || undefined),
  });
  const activeId = (useSearch({ strict: false }) as { session?: string }).session;

  const mutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: boolean }) => toggleFavorite(id, next),
    onMutate: async ({ id, next }) => {
      await qc.cancelQueries({ queryKey: ['sessions'] });
      const prev = qc.getQueriesData<SessionsResponse>({ queryKey: ['sessions'] });
      prev.forEach(([key, value]) => {
        if (!value) return;
        qc.setQueryData<SessionsResponse>(key, {
          ...value,
          sessions: value.sessions.map((s) => (s.id === id ? { ...s, isFavorite: next ? 1 : 0 } : s)),
        });
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.prev.forEach(([key, value]) => qc.setQueryData(key, value));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });

  const groups = useMemo(() => groupSessions(data?.sessions ?? []), [data]);

  if (collapsed) {
    const flat: Session[] = groups.flatMap((g) => g.sessions).slice(0, 20);
    return (
      <div className="py-1">
        {flat.map((s) => (
          <SessionItem
            key={s.id}
            session={s}
            active={s.id === activeId}
            collapsed
            onToggleFavorite={(id, next) => mutation.mutate({ id, next })}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="pb-2">
      {groups.map((g) => (
        <div key={g.key} className="mt-3 first:mt-0">
          <div className="sticky top-0 z-10 bg-sidebar/95 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/40 backdrop-blur-sm">
            {g.label}
          </div>
          <div className="px-1">
            {g.sessions.map((s) => (
              <SessionItem
                key={s.id}
                session={s}
                active={s.id === activeId}
                collapsed={false}
                onToggleFavorite={(id, next) => mutation.mutate({ id, next })}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd packages/web && pnpm typecheck`
Expected: PASS. Si erreurs sur `useSearch` strict, adapter au pattern TanStack Router du projet (voir `routes/__root.tsx`).

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/layout/sidebar-left-sessions.tsx \
  packages/web/src/components/layout/session-item.tsx
git commit -m "feat(web): SidebarLeftSessions with grouping + favorite toggle"
```

---

## Phase 5 — Panel droit

### Task 10: PanelRight container + toggle

**Files:**
- Create: `packages/web/src/components/layout/panel-right.tsx`

- [ ] **Step 1: Composant**

```tsx
import { PanelRightClose, PanelRight as PanelRightIcon, Sliders, Folder, BookOpen, Plug } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CardParametres } from '@/components/panel-right/card-parametres';
import { CardWorkspace } from '@/components/panel-right/card-workspace';
import { CardReferentiel } from '@/components/panel-right/card-referentiel';
import { CardMcp } from '@/components/panel-right/card-mcp';

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  sessionId: string | null;
}

const COLLAPSED_ICONS = [
  { key: 'parametres', icon: Sliders, label: 'Parametres' },
  { key: 'workspace', icon: Folder, label: 'Workspace' },
  { key: 'referentiel', icon: BookOpen, label: 'Referentiel' },
  { key: 'mcp', icon: Plug, label: 'MCP' },
];

export function PanelRight({ collapsed, onToggle, sessionId }: Props) {
  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center py-2">
        <button
          onClick={onToggle}
          aria-label="Deployer le panneau"
          className="hover-elevate mb-3 rounded-md p-1.5 text-sidebar-foreground/70"
        >
          <PanelRightIcon className="size-4" />
        </button>
        {COLLAPSED_ICONS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={onToggle}
            aria-label={label}
            className={cn('hover-elevate my-0.5 rounded-md p-1.5 text-sidebar-foreground/70')}
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end p-2">
        <button
          onClick={onToggle}
          aria-label="Replier le panneau"
          className="hover-elevate rounded-md p-1.5 text-sidebar-foreground/70"
        >
          <PanelRightClose className="size-4" />
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-3 pb-3">
        <CardParametres sessionId={sessionId} />
        <CardWorkspace />
        <CardReferentiel />
        <CardMcp />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck (va echouer sur les 4 cards manquantes — on les fait ensuite)**

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/layout/panel-right.tsx
git commit -m "feat(web): PanelRight container with 4 cards + collapsed stack"
```

### Task 11: Card Parametres (model + budget)

**Files:**
- Create: `packages/web/src/components/panel-right/card-parametres.tsx`
- Modify: `packages/web/src/lib/settings.ts` (reutiliser existant)

- [ ] **Step 1: Lire la lib existante**

Run: `cat packages/web/src/lib/settings.ts`
Noter la shape de `fetchSettings`/`updateSettings` et les champs exposes (budget, alertes, etc.).

- [ ] **Step 2: Lire le composant existant**

Run: `ls packages/web/src/components/chat/model-selector.tsx && cat packages/web/src/components/chat/model-selector.tsx`
Noter les props : liste de models, callback onChange.

- [ ] **Step 3: Card**

```tsx
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { fetchSettings } from '@/lib/settings';
import { fetchSessions } from '@/lib/sessions';

interface Props {
  sessionId: string | null;
}

export function CardParametres({ sessionId }: Props) {
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
  const { data: sessions } = useQuery({ queryKey: ['sessions'], queryFn: () => fetchSessions() });

  const session = sessions?.sessions.find((s) => s.id === sessionId) ?? null;
  const model = session?.model ?? settings?.defaultModel ?? 'gpt-4.1';
  const monthly = settings?.monthlyBudgetUsd ?? 0;

  return (
    <section className="rounded-lg border border-card-border bg-card p-3">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold">Parametres</h3>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </header>
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-md border border-border bg-background/40 px-2 py-1.5">
          <span className="text-xs text-muted-foreground">Model</span>
          <span className="font-mono text-[11px]">{model}</span>
        </div>
        <div className="flex items-center justify-between rounded-md border border-border bg-background/40 px-2 py-1.5">
          <span className="text-xs text-muted-foreground">Budget mensuel</span>
          <span className="font-mono text-[11px]">${monthly.toFixed(2)}</span>
        </div>
      </div>
    </section>
  );
}
```

Note : la card est lecture seule pour v1. Le changement de modele se fait ailleurs (header chat-area) ; la card affiche le model courant.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/panel-right/card-parametres.tsx
git commit -m "feat(web): PanelRight CardParametres (model + budget read-only)"
```

### Task 12: Card Workspace + file tree

**Files:**
- Create: `packages/web/src/components/panel-right/card-workspace.tsx`
- Reuse: `packages/web/src/components/workspace/file-tree.tsx` (deja existant)

- [ ] **Step 1: Card**

```tsx
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Folder, ChevronDown, RefreshCw } from 'lucide-react';
import { fetchWorkspaceTree } from '@/lib/workspace';
import { FileTree } from '@/components/workspace/file-tree';
import type { FileEntry } from '@buck/shared';

export function CardWorkspace() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['workspace-tree'], queryFn: fetchWorkspaceTree });
  const [selected, setSelected] = useState<FileEntry | null>(null);

  return (
    <section className="rounded-lg border border-card-border bg-card p-3">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Folder className="size-3.5 text-muted-foreground" />
          Dossier de travail
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ['workspace-tree'] })}
            aria-label="Rafraichir"
            className="hover-elevate rounded-md p-1 text-muted-foreground"
          >
            <RefreshCw className="size-3.5" />
          </button>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </div>
      </header>
      <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-background/40 p-1.5 text-xs">
        {isLoading ? (
          <p className="p-2 text-muted-foreground">Chargement...</p>
        ) : (
          <FileTree tree={data ?? []} selected={selected} onSelect={setSelected} />
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Adapter FileTree si necessaire**

Verifier que `FileTree` accepte une prop `tree` de type `FileEntry[]` et une callback `onSelect`. Si l'API differe, adapter l'import et les props (ou refactor mineur du composant existant pour exposer cette API simple).

- [ ] **Step 3: Typecheck**

Run: `cd packages/web && pnpm typecheck`

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/panel-right/card-workspace.tsx packages/web/src/components/workspace/file-tree.tsx
git commit -m "feat(web): PanelRight CardWorkspace with embedded file tree"
```

### Task 13: Card Referentiel (Bible MCP)

**Files:**
- Create: `packages/web/src/components/panel-right/card-referentiel.tsx`

- [ ] **Step 1: Inspecter lib MCP existante**

Run: `cat packages/web/src/lib/mcp.ts`
Noter la signature (fetchMcpServers, toggleMcpServer, types).

- [ ] **Step 2: Card**

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, ChevronDown } from 'lucide-react';
import { fetchMcpServers, toggleMcpServer } from '@/lib/mcp';
import { Switch } from '@/components/ui/switch';

const BIBLE_NAME = 'bible';

export function CardReferentiel() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['mcp-servers'], queryFn: fetchMcpServers });
  const mutation = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) => toggleMcpServer(name, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp-servers'] }),
  });
  const bible = data?.find((s) => s.name === BIBLE_NAME);
  const enabled = bible?.enabled ?? false;

  return (
    <section className="rounded-lg border border-card-border bg-card p-3">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
          <BookOpen className="size-3.5 text-muted-foreground" />
          Referentiel
        </h3>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </header>
      <div className="flex items-center justify-between rounded-md border border-border bg-background/40 px-2 py-1.5">
        <div className="flex flex-col">
          <span className="text-xs">Bible MCP</span>
          <span className="text-[10px] text-muted-foreground">
            {bible?.status ?? (bible ? 'inactif' : 'non configure')}
          </span>
        </div>
        <Switch
          checked={enabled}
          disabled={!bible || mutation.isPending}
          onCheckedChange={(next) => bible && mutation.mutate({ name: BIBLE_NAME, enabled: next })}
        />
      </div>
    </section>
  );
}
```

Note : si `toggleMcpServer` n'existe pas cote web, creer la fonction dans `packages/web/src/lib/mcp.ts` et exposer la route API correspondante. Si la route n'existe pas cote API, ajouter un endpoint `PATCH /api/mcp/:name { enabled }` avec test dans une sous-tache.

- [ ] **Step 3: Si `toggleMcpServer` manque**

Ajouter dans `packages/web/src/lib/mcp.ts` :

```typescript
export async function toggleMcpServer(name: string, enabled: boolean) {
  return apiFetch<McpServer>(`/api/mcp/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    body: { enabled },
  });
}
```

Et cote API, verifier/ajouter la route dans `packages/api/src/routes/mcp.ts`. Si manquant, ajouter handler et test avant de continuer.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/panel-right/card-referentiel.tsx packages/web/src/lib/mcp.ts packages/api/src/routes/mcp.ts packages/api/src/routes/mcp.test.ts
git commit -m "feat(web): PanelRight CardReferentiel (Bible MCP toggle)"
```

### Task 14: Card MCP (autres serveurs)

**Files:**
- Create: `packages/web/src/components/panel-right/card-mcp.tsx`

- [ ] **Step 1: Card**

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plug, ChevronDown } from 'lucide-react';
import { fetchMcpServers, toggleMcpServer } from '@/lib/mcp';
import { Switch } from '@/components/ui/switch';

export function CardMcp() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['mcp-servers'], queryFn: fetchMcpServers });
  const mutation = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) => toggleMcpServer(name, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp-servers'] }),
  });
  const servers = (data ?? []).filter((s) => s.name !== 'bible');

  return (
    <section className="rounded-lg border border-card-border bg-card p-3">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Plug className="size-3.5 text-muted-foreground" />
          MCP
        </h3>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </header>
      {servers.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground">
          Aucun serveur MCP configure
        </p>
      ) : (
        <div className="space-y-1.5">
          {servers.map((s) => (
            <div key={s.name} className="flex items-center justify-between rounded-md border border-border bg-background/40 px-2 py-1.5">
              <div className="flex flex-col">
                <span className="text-xs">{s.name}</span>
                <span className="text-[10px] text-muted-foreground">{s.status ?? ''}</span>
              </div>
              <Switch
                checked={s.enabled}
                disabled={mutation.isPending}
                onCheckedChange={(next) => mutation.mutate({ name: s.name, enabled: next })}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/panel-right/card-mcp.tsx
git commit -m "feat(web): PanelRight CardMcp (non-Bible servers toggle)"
```

---

## Phase 6 — Chat area eclate

### Task 15: Recuperer snapshot chat-area

**Files:**
- Read: `packages/web/src/components/chat/chat-area.tsx`

- [ ] **Step 1: Lire entierement l'existant**

Run: `cat packages/web/src/components/chat/chat-area.tsx`
Noter : entrees (props, hooks AI SDK), sortie (JSX), logique streaming, gestion reasoning, tool calls, approval. C'est le contrat a preserver dans l'eclatement.

- [ ] **Step 2: Test e2e smoke existant**

Run: `cd packages/web && pnpm test:e2e -g "chat" --project=chromium` (ou equivalent)
Si un scenario chat e2e existe, noter son nom et les selectors qu'il utilise. Si pas de scenario e2e chat, continuer.

Pas de commit.

### Task 16: Empty state

**Files:**
- Create: `packages/web/src/components/chat/chat-empty-state.tsx`

- [ ] **Step 1: Composant**

```tsx
import { Sparkles } from 'lucide-react';

export function ChatEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Sparkles className="size-5" />
      </div>
      <h2 className="text-lg font-semibold">Commencez une nouvelle conversation</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Selectionnez ou creez une conversation pour echanger avec vos modeles preferes.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/chat/chat-empty-state.tsx
git commit -m "feat(web): ChatEmptyState"
```

### Task 17: Message user + assistant

**Files:**
- Create: `packages/web/src/components/chat/message-user.tsx`
- Create: `packages/web/src/components/chat/message-assistant.tsx`
- Create: `packages/web/src/components/chat/message-footer.tsx`

- [ ] **Step 1: message-footer**

```tsx
interface Props {
  provider?: string;
  model?: string;
  durationMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}

function fmtDuration(ms?: number): string {
  if (!ms) return '';
  return `${(ms / 1000).toFixed(1)}s`;
}

export function MessageFooter({ provider, model, durationMs, tokensIn, tokensOut, costUsd }: Props) {
  const parts: string[] = [];
  if (provider) parts.push(provider);
  if (model) parts.push(model);
  if (durationMs) parts.push(fmtDuration(durationMs));
  if (tokensIn !== undefined && tokensOut !== undefined) parts.push(`${tokensIn} in / ${tokensOut} out`);
  if (costUsd !== undefined) parts.push(`$${costUsd.toFixed(3)}`);
  if (parts.length === 0) return null;
  return (
    <div className="mt-1 flex justify-end gap-2 font-mono text-[10px] text-muted-foreground opacity-40">
      {parts.map((p, i) => (
        <span key={i}>{p}</span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: message-user**

```tsx
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  content: string;
}

export function MessageUser({ content }: Props) {
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="group flex flex-col items-end gap-1">
      <div className="max-w-[70%] whitespace-pre-wrap rounded-2xl border border-border bg-secondary px-3.5 py-2 text-sm text-secondary-foreground">
        {content}
      </div>
      <button
        onClick={onCopy}
        aria-label="Copier"
        className={cn(
          'hover-elevate rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100',
        )}
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: message-assistant**

```tsx
import { type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { MessageFooter } from './message-footer';

interface Props {
  reasoning?: ReactNode;
  toolCalls?: ReactNode;
  children: ReactNode;
  footer?: Parameters<typeof MessageFooter>[0];
}

export function MessageAssistant({ reasoning, toolCalls, children, footer }: Props) {
  return (
    <div className="flex gap-3">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Sparkles className="size-3.5" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {reasoning}
        {toolCalls}
        <div className="text-sm leading-relaxed">{children}</div>
        {footer && <MessageFooter {...footer} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/chat/message-user.tsx \
  packages/web/src/components/chat/message-assistant.tsx \
  packages/web/src/components/chat/message-footer.tsx
git commit -m "feat(web): MessageUser / MessageAssistant / MessageFooter"
```

### Task 18: ReasoningCollapsible + ToolCallsCollapsible

**Files:**
- Create: `packages/web/src/components/chat/reasoning-collapsible.tsx`
- Create: `packages/web/src/components/chat/tool-calls-collapsible.tsx`
- Create: `packages/web/src/components/chat/tool-call-item.tsx`

- [ ] **Step 1: reasoning-collapsible**

```tsx
import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  children: ReactNode;
  defaultOpen?: boolean;
  label?: string;
}

export function ReasoningCollapsible({ children, defaultOpen = false, label = 'Reflexion' }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} />
        {label}
      </button>
      {open && (
        <div className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted/30 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
          {children}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: tool-call-item (absorbe approval/terminal/tool-call-display)**

```tsx
import { Check, X, Terminal, Wrench, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToolCallState = 'pending-approval' | 'running' | 'success' | 'error' | 'denied';

interface Props {
  name: string;
  args?: string;
  output?: string;
  state: ToolCallState;
  onApprove?: () => void;
  onDeny?: () => void;
}

export function ToolCallItem({ name, args, output, state, onApprove, onDeny }: Props) {
  const isShell = name === 'shell_execute';
  const Icon = isShell ? Terminal : Wrench;

  if (state === 'pending-approval') {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-primary">
          <AlertCircle className="size-3.5" />
          L'assistant souhaite utiliser <span className="font-mono">{name}</span>
        </div>
        {args && <pre className="mb-2 whitespace-pre-wrap rounded bg-muted/50 px-2 py-1 font-mono text-[10px] text-muted-foreground">{args}</pre>}
        <div className="flex gap-2">
          <button
            onClick={onApprove}
            className="hover-elevate active-elevate-2 rounded-md border border-primary-border bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
          >
            Autoriser
          </button>
          <button
            onClick={onDeny}
            className="hover-elevate rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"
          >
            Refuser
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-md border px-2.5 py-1.5 font-mono text-[11px]',
        state === 'error' || state === 'denied'
          ? 'border-destructive/30 bg-destructive/5 text-destructive-foreground'
          : 'border-border bg-muted/30 text-muted-foreground',
      )}
    >
      <div className="flex items-center gap-1.5">
        <Icon className="size-3" />
        <span className="font-semibold text-foreground">{name}</span>
        {args && <span className="truncate opacity-60">{args}</span>}
        {state === 'success' && <Check className="ml-auto size-3 text-emerald-400" />}
        {(state === 'error' || state === 'denied') && <X className="ml-auto size-3 text-destructive" />}
      </div>
      {output && state !== 'running' && (
        <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-[10px] opacity-80">{output}</pre>
      )}
    </div>
  );
}
```

- [ ] **Step 3: tool-calls-collapsible**

```tsx
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  count: number;
  hasPendingApproval: boolean;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function ToolCallsCollapsible({ count, hasPendingApproval, children, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (hasPendingApproval) setOpen(true);
  }, [hasPendingApproval]);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1 text-[11px] font-mono',
          hasPendingApproval ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} />
        {count} outil{count > 1 ? 's' : ''} utilise{count > 1 ? 's' : ''}
      </button>
      {open && <div className="mt-1 space-y-1.5">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/chat/reasoning-collapsible.tsx \
  packages/web/src/components/chat/tool-calls-collapsible.tsx \
  packages/web/src/components/chat/tool-call-item.tsx
git commit -m "feat(web): Reasoning + ToolCalls collapsibles + ToolCallItem"
```

### Task 19: ChatStream — nouveau composant recupere la logique chat-area

**Files:**
- Create: `packages/web/src/components/chat/chat-stream.tsx`
- Keep (pour l'instant): `packages/web/src/components/chat/chat-area.tsx` (supprime Task 27)

- [ ] **Step 1: Ecrire chat-stream en reprenant la logique de chat-area**

Ouvre `chat-area.tsx`. Repere ses hooks (`useChat`, `useStream`, etc.), ses appels API, sa boucle de rendu messages. Recupere **1:1** la logique metier, mais rends les messages via les nouveaux sous-composants :

```tsx
// Squelette minimal a remplir avec la logique exacte du chat-area existant
import { useChat } from '@ai-sdk/react';
import { MessageUser } from './message-user';
import { MessageAssistant } from './message-assistant';
import { MarkdownRenderer } from './markdown-renderer';
import { ReasoningCollapsible } from './reasoning-collapsible';
import { ToolCallsCollapsible } from './tool-calls-collapsible';
import { ToolCallItem } from './tool-call-item';
import { ChatEmptyState } from './chat-empty-state';

interface Props {
  sessionId: string | null;
}

export function ChatStream({ sessionId }: Props) {
  // Recopier les hooks existants de chat-area.tsx (useChat, fetch messages initial, etc.)
  // Puis rendre :
  // - Si pas de sessionId OU messages vide -> <ChatEmptyState />
  // - Sinon la liste des messages :
  //    - role user -> <MessageUser content={...} />
  //    - role assistant -> <MessageAssistant reasoning={...} toolCalls={...} footer={...}>
  //                           <MarkdownRenderer>{content}</MarkdownRenderer>
  //                         </MessageAssistant>
  return null; // A remplir
}
```

Pour le remplissage detaille, l'engineer doit :
1. Copier la logique `useChat`/state de `chat-area.tsx`.
2. Pour chaque message assistant, derouler les `parts` (AI SDK) :
   - `type: 'reasoning'` -> buffer texte dans `reasoning`.
   - `type: 'tool-call'` / `tool-result` / `tool-approval-request` -> buffer dans `toolCalls`, un `<ToolCallItem>` par tool call avec son `state`.
   - `type: 'text'` -> buffer dans `textContent`.
3. Construire le `footer` a partir de `message.metadata` ou equivalent (provider, model, durationMs, tokensIn/out, costUsd).

- [ ] **Step 2: Commit meme si incomplet, pour checkpoint**

```bash
git add packages/web/src/components/chat/chat-stream.tsx
git commit -m "feat(web): ChatStream skeleton using new sub-components"
```

### Task 20: Input bar avec chips attachments

**Files:**
- Create: `packages/web/src/components/chat/chat-input.tsx` (remplace l'existant)
- Rename: ancien `chat-input.tsx` en `chat-input.old.tsx` avant reecriture pour garder la logique de reference

- [ ] **Step 1: Sauvegarder l'ancien**

```bash
git mv packages/web/src/components/chat/chat-input.tsx packages/web/src/components/chat/chat-input.old.tsx
```

Pas de commit seul, enchainer.

- [ ] **Step 2: Nouveau input**

```tsx
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Paperclip, ArrowUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PendingAttachment {
  id: string;
  name: string;
  kind: 'img' | 'pdf' | 'doc' | 'other';
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  attachments: PendingAttachment[];
  onRemoveAttachment: (id: string) => void;
  onPickFiles: (files: FileList) => void;
  disabled?: boolean;
}

export function ChatInput({
  value, onChange, onSubmit, attachments, onRemoveAttachment, onPickFiles, disabled,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim() && attachments.length === 0) return;
    onSubmit();
  }
  function onFiles(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) onPickFiles(e.target.files);
    e.target.value = '';
  }

  return (
    <form onSubmit={handleSubmit} className="px-4 pb-4">
      <div className={cn(
        'rounded-xl border bg-card transition-colors',
        focused ? 'border-ring' : 'border-card-border',
      )}>
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 border-b border-border px-2 pt-2">
            {attachments.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[11px]">
                <span className="font-mono text-muted-foreground">{a.kind.toUpperCase()}</span>
                <span className="max-w-32 truncate">{a.name}</span>
                <button type="button" onClick={() => onRemoveAttachment(a.id)} aria-label="Retirer" className="text-muted-foreground hover:text-foreground">
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as unknown as FormEvent);
            }
          }}
          placeholder="Envoyer un message..."
          rows={2}
          disabled={disabled}
          className="block w-full resize-none bg-transparent px-3 pt-2.5 text-sm placeholder:text-muted-foreground focus:outline-none"
        />
        <div className="flex items-center justify-between px-2 pb-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Joindre un fichier"
            className="hover-elevate rounded-md p-1.5 text-muted-foreground hover:text-foreground"
          >
            <Paperclip className="size-4" />
          </button>
          <input ref={fileInputRef} type="file" multiple hidden onChange={onFiles} />
          <button
            type="submit"
            disabled={disabled || (!value.trim() && attachments.length === 0)}
            aria-label="Envoyer"
            className="hover-elevate active-elevate-2 flex size-7 items-center justify-center rounded-full border border-primary-border bg-primary text-primary-foreground disabled:opacity-50"
          >
            <ArrowUp className="size-3.5" />
          </button>
        </div>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/chat/chat-input.tsx packages/web/src/components/chat/chat-input.old.tsx
git commit -m "feat(web): new ChatInput with attachments chips (old kept as .old.tsx)"
```

---

## Phase 7 — Integration route principale

### Task 21: Route `/` utilise ChatShell + nouveaux composants

**Files:**
- Modify: `packages/web/src/routes/index.tsx`

- [ ] **Step 1: Lire l'existant**

Run: `cat packages/web/src/routes/index.tsx`

- [ ] **Step 2: Reecrire**

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { fetchMe } from '@/lib/session';
import { ChatShell } from '@/components/layout/chat-shell';
import { SidebarLeft } from '@/components/layout/sidebar-left';
import { PanelRight } from '@/components/layout/panel-right';
import { ChatStream } from '@/components/chat/chat-stream';

const search = z.object({ session: z.string().optional() });

export const Route = createFileRoute('/')({
  validateSearch: search,
  beforeLoad: async () => {
    const me = await fetchMe();
    if (!me) throw redirect({ to: '/login' });
    return { me };
  },
  component: ChatPage,
});

function ChatPage() {
  const { me } = Route.useRouteContext();
  const { session } = Route.useSearch();
  const sessionId = session ?? null;

  return (
    <ChatShell
      sidebarLeft={({ collapsed, onToggle }) => (
        <SidebarLeft collapsed={collapsed} onToggle={onToggle} email={me.email} />
      )}
      main={<ChatStream sessionId={sessionId} />}
      panelRight={({ collapsed, onToggle }) => (
        <PanelRight collapsed={collapsed} onToggle={onToggle} sessionId={sessionId} />
      )}
    />
  );
}
```

- [ ] **Step 3: Regenerer la route tree**

Run: `cd packages/web && pnpm dev` (une fois, ou lancer `tsr generate` si present), verifier que `routeTree.gen.ts` reflete la nouvelle searchParams.

- [ ] **Step 4: Smoke visuel**

Ouvrir `http://localhost:5173/api/__e2e__/dev-login?email=romain.ecarnot@gmail.com`, verifier :
- Shell 3 panneaux visible
- Toggle sidebar gauche (cmd+b) fonctionne
- Toggle panel droit (cmd+\) fonctionne
- Liste de sessions groupee visible
- Toggle favorite etoile fonctionne sur un session item
- Panel droit affiche les 4 cards

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/routes/index.tsx packages/web/src/routeTree.gen.ts
git commit -m "feat(web): route / uses new ChatShell + SidebarLeft + PanelRight"
```

---

## Phase 8 — Route /settings mono-page

### Task 22: Fusion /settings en mono-page

**Files:**
- Modify: `packages/web/src/routes/settings.tsx` (reecrire complet)
- Potentiellement delete : `packages/web/src/routes/settings/` sous-routes

- [ ] **Step 1: Lister sous-routes settings**

Run: `ls packages/web/src/routes/settings/`
Noter les fichiers (probablement `general.tsx`, `budget.tsx`, `account.tsx`).

- [ ] **Step 2: Reecrire `settings.tsx` en mono-page**

```tsx
import { createFileRoute, redirect, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { fetchMe } from '@/lib/session';
import { AccountSection } from '@/components/settings/account-section';
import { BudgetSection } from '@/components/settings/budget-section';

export const Route = createFileRoute('/settings')({
  beforeLoad: async () => {
    const me = await fetchMe();
    if (!me) throw redirect({ to: '/login' });
    return { me };
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { me } = Route.useRouteContext();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-6 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Retour au chat
          </Link>
          <h1 className="text-sm font-semibold">Parametres</h1>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-8 px-6 py-8">
        <AccountSection me={me} />
        <BudgetSection />
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Creer ou migrer les sections**

Pour chaque ancienne sous-route (`general`, `budget`, `account`), creer un composant section correspondant dans `packages/web/src/components/settings/` qui reprend le contenu (formulaire, hooks, etc.) sans la chrome de layout. Squelette d'une section :

```tsx
export function AccountSection({ me }: { me: { email: string } }) {
  return (
    <section className="rounded-xl border border-card-border bg-card p-6">
      <h2 className="text-lg font-semibold">Compte</h2>
      <p className="mt-1 text-sm text-muted-foreground">Gerez votre compte.</p>
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Email</span>
          <span className="font-mono text-sm">{me.email}</span>
        </div>
        {/* Ajouter logout, derniere connexion, etc., depuis l'ancien compte.tsx */}
      </div>
    </section>
  );
}
```

Meme principe pour `BudgetSection` — transposer le formulaire de budget existant.

- [ ] **Step 4: Supprimer les sous-routes**

```bash
trash packages/web/src/routes/settings
```

(Attention : le fichier `settings.tsx` est a la racine de `routes/`, pas dans le dossier supprime. Verifier avec `ls packages/web/src/routes/` apres.)

- [ ] **Step 5: Regenerer routeTree**

Run: `cd packages/web && pnpm dev` (attendre hot reload de `tsr`) ou `pnpm build` pour forcer la regeneration.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/routes/settings.tsx packages/web/src/components/settings \
  packages/web/src/routeTree.gen.ts
git commit -m "feat(web): /settings becomes single scrollable page (Account + Budget)"
```

---

## Phase 9 — Login reskin

### Task 23: Reskin login en card centree

**Files:**
- Modify: `packages/web/src/routes/-login.view.tsx` (ou equivalent `login.view.tsx`)
- Modify: `packages/web/src/routes/login.tsx` (wrapper route)

- [ ] **Step 1: Localiser la view**

Run: `cat packages/web/src/routes/-login.view.tsx 2>/dev/null || cat packages/web/src/routes/login.view.tsx 2>/dev/null`

- [ ] **Step 2: Reecrire la view**

```tsx
import { useState, type FormEvent } from 'react';
import { Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';

export function LoginView({ isDev }: { isDev?: boolean }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiFetch('/api/auth/request-link', { method: 'POST', body: { email } });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-card-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">Buck Writer</h1>
            <p className="text-[11px] text-muted-foreground">Connexion par lien magique</p>
          </div>
        </div>
        {sent ? (
          <p className="rounded-md border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
            Lien envoye a <span className="font-mono text-foreground">{email}</span>. Verifiez votre boite.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Email</span>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="romain@example.com"
              />
            </label>
            {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="hover-elevate active-elevate-2 w-full rounded-md border border-primary-border bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {loading ? 'Envoi...' : 'Recevoir le lien magique'}
            </button>
            {isDev && (
              <a
                href="/api/__e2e__/dev-login?email=romain.ecarnot@gmail.com"
                className="hover-elevate block rounded-md border border-border py-2 text-center text-xs text-muted-foreground"
              >
                Dev login
              </a>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: S'assurer que le wrapper route passe `isDev`**

Dans `routes/login.tsx`, passer `isDev={import.meta.env.DEV}` a `<LoginView />`.

- [ ] **Step 4: Verifier visuellement**

Ouvrir `http://localhost:5173/login` (apres logout ou en navigation privee). Card centree, champs visibles, amber brand sur le bouton, Inter/Figtree applique, fond `--background` sombre.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/routes/-login.view.tsx packages/web/src/routes/login.tsx
git commit -m "feat(web): login reskin erom v2 (centered card, amber CTA)"
```

---

## Phase 10 — Suppression /workspace

### Task 24: Supprimer la route `/workspace`

**Files:**
- Delete: `packages/web/src/routes/workspace.tsx`

- [ ] **Step 1: Verifier qu'aucun lien n'y pointe**

Run: `grep -rn "to=\"/workspace\"\|href=\"/workspace\"" packages/web/src`
Expected: aucun resultat (sinon, corriger les liens pour pointer ailleurs avant suppression).

- [ ] **Step 2: Supprimer**

```bash
trash packages/web/src/routes/workspace.tsx
```

- [ ] **Step 3: Regenerer routeTree**

Run: `cd packages/web && pnpm build` (ou laisser `pnpm dev` regenerer).

- [ ] **Step 4: Verifier que `/workspace` renvoie 404**

Run: `curl -I http://localhost:5173/workspace`
Expected: 404 (ou redirect selon `__root.tsx`).

- [ ] **Step 5: Commit**

```bash
git add -u packages/web/src/routes/workspace.tsx packages/web/src/routeTree.gen.ts
git commit -m "chore(web): remove /workspace route (file tree lives in panel right)"
```

---

## Phase 11 — Cleanup composants obsoletes

### Task 25: Supprimer composants remplaces

**Files a supprimer:**
- `packages/web/src/components/chat/chat-area.tsx`
- `packages/web/src/components/chat/chat-input.old.tsx`
- `packages/web/src/components/chat/chat-layout.tsx`
- `packages/web/src/components/chat/message-bubble.tsx`
- `packages/web/src/components/chat/approval-block.tsx`
- `packages/web/src/components/chat/terminal-block.tsx`
- `packages/web/src/components/chat/tool-call-display.tsx`
- `packages/web/src/components/chat/sidebar.tsx`
- `packages/web/src/components/chat/session-list.tsx`
- `packages/web/src/components/chat/user-menu.tsx`
- `packages/web/src/components/chat/bible-status-banner.tsx`

- [ ] **Step 1: Verifier qu'aucun import ne pointe vers ces fichiers**

Run:
```bash
for f in chat-area chat-input.old chat-layout message-bubble approval-block terminal-block tool-call-display sidebar session-list user-menu bible-status-banner; do
  echo "=== $f ===";
  grep -rn "chat/$f" packages/web/src --include='*.ts' --include='*.tsx';
done
```
Expected: aucun resultat. Si un import subsiste, corriger d'abord.

- [ ] **Step 2: Supprimer**

```bash
trash packages/web/src/components/chat/chat-area.tsx \
  packages/web/src/components/chat/chat-input.old.tsx \
  packages/web/src/components/chat/chat-layout.tsx \
  packages/web/src/components/chat/message-bubble.tsx \
  packages/web/src/components/chat/approval-block.tsx \
  packages/web/src/components/chat/terminal-block.tsx \
  packages/web/src/components/chat/tool-call-display.tsx \
  packages/web/src/components/chat/sidebar.tsx \
  packages/web/src/components/chat/session-list.tsx \
  packages/web/src/components/chat/user-menu.tsx \
  packages/web/src/components/chat/bible-status-banner.tsx
```

- [ ] **Step 3: Typecheck + lint**

Run: `cd packages/web && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -u packages/web/src/components/chat
git commit -m "chore(web): remove obsolete chat components (replaced by new structure)"
```

---

## Phase 12 — Tests & verification

### Task 26: Mise a jour tests composants

**Files:**
- Modify: `packages/web/src/routes/login.test.tsx` (si casse)
- Create/Modify: tests composants nouveaux (`message-user.test.tsx`, `tool-call-item.test.tsx`)

- [ ] **Step 1: Lancer les tests**

Run: `cd packages/web && pnpm test -- --run`
Expected: identifier les tests casses (ancien chat-area, ancien sidebar, etc.).

- [ ] **Step 2: Supprimer les tests orphelins**

Pour chaque test pointant vers un composant supprime, le supprimer aussi :

```bash
# exemple
trash packages/web/src/components/chat/message-bubble.test.tsx 2>/dev/null || true
```

- [ ] **Step 3: Ajouter un test pour ToolCallItem (etat approval)**

`packages/web/src/components/chat/tool-call-item.test.tsx` :

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolCallItem } from './tool-call-item';

describe('ToolCallItem', () => {
  it('shows approve/deny buttons in pending-approval state', () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    render(
      <ToolCallItem
        name="shell_execute"
        args='{"cmd":"ls"}'
        state="pending-approval"
        onApprove={onApprove}
        onDeny={onDeny}
      />,
    );
    fireEvent.click(screen.getByText('Autoriser'));
    expect(onApprove).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Refuser'));
    expect(onDeny).toHaveBeenCalled();
  });

  it('shows success check in success state', () => {
    const { container } = render(
      <ToolCallItem name="read_file" state="success" output="ok" />,
    );
    expect(container.textContent).toContain('read_file');
  });
});
```

- [ ] **Step 4: Lancer**

Run: `cd packages/web && pnpm test -- --run`
Expected: PASS sur tout.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/chat/tool-call-item.test.tsx
git add -u packages/web/src/components/chat
git commit -m "test(web): add ToolCallItem tests, remove orphan tests"
```

### Task 27: E2E smoke Playwright

**Files:**
- Modify: `packages/web/tests/e2e/*.spec.ts` (selector updates)

- [ ] **Step 1: Lancer e2e existants**

Run: `cd packages/web && pnpm test:e2e`
Expected: identifier les selectors casses (anciens data-testid, anciennes classes).

- [ ] **Step 2: Adapter les selectors**

Pour chaque test casse, remplacer les selectors par :
- Sidebar gauche : `aria-label="Replier la sidebar"`, role `search` pour la searchbar
- Message user : role par defaut ou classe `bg-secondary`
- Input chat : placeholder `"Envoyer un message..."`
- Bouton send : `aria-label="Envoyer"`
- Bouton favorite : `aria-label="Ajouter aux favoris"` / `"Retirer des favoris"`
- Approval : `Autoriser` / `Refuser` textes

- [ ] **Step 3: Relancer**

Run: `cd packages/web && pnpm test:e2e`
Expected: PASS sur tout.

- [ ] **Step 4: Commit**

```bash
git add -u packages/web/tests/e2e
git commit -m "test(web): update e2e selectors for new UI structure"
```

### Task 28: Verification finale

- [ ] **Step 1: typecheck + lint + test sur tous les packages**

Run : `pnpm -w typecheck && pnpm -w lint && pnpm -w test`
Expected: PASS.

- [ ] **Step 2: Build complet**

Run: `pnpm -w build`
Expected: PASS, aucun bundle en erreur.

- [ ] **Step 3: Smoke manuel**

Ouvrir l'app en dev, parcourir :
- Login → dev login
- Chat : voir shell 3 panneaux, toggle panels, changer de session, favori, message user/assistant, tool call, approval amber
- Settings : sections Account + Budget visibles, retour chat fonctionne
- Logout via user pill

- [ ] **Step 4: Commit final de synthese (si changements non commites)**

```bash
git status
# Si vide :
echo "Nothing to commit, redesign complete"
```

- [ ] **Step 5: Pousser la branche**

```bash
git push -u origin feat/web-redesign-erom-v2
```

- [ ] **Step 6: Creer la PR**

Run (manuel) : commande `gh pr create` avec titre "feat(web): refonte UI erom-design v2 (shell 3 panneaux)" et body resumant :
- Theme erom v2 (OKLCH, amber brand)
- Shell 3 panneaux sur chat
- Panel droit 4 cards (Parametres / Workspace / Referentiel / MCP)
- Sidebar gauche avec Favoris (migration is_favorite)
- Chat-area eclate en sous-composants
- Routes /workspace supprimee, /settings fusionnee

---

## Notes pour l'engineer

- **Ne pas faire de refactor adjacent** : chaque composant nouveau remplace un ancien 1:1 (logique identique). Si tu vois une opportunite d'ameliorer autre chose, ecris-la dans une note, ne la fais pas.
- **Lancer `pnpm dev` en permanence** et verifier visuellement apres chaque tache. Le design erom v2 a des details qui echappent au typecheck (spacing, opacity, borders).
- **Si un test e2e revele un flow manquant** (ex: le collapsible reasoning ne s'ouvre pas auto pendant stream), le reporter comme bug a corriger, pas comme feature a ajouter.
- **Les sous-composants shadcn manquants** (Switch, Tooltip, Popover, Collapsible, Avatar) doivent etre ajoutes via `pnpm dlx shadcn@latest add switch tooltip popover collapsible avatar` apres le task 2 si pas deja presents. MCP shadcn peut aussi etre utilise (`search_items_in_registries` puis `view_items_in_registries`).
- **Respecter les patterns erom v2** : `hover-elevate` sur tout bouton interactif, `bg-popover/95 backdrop-blur-xl` sur popovers, `sticky + backdrop-blur-sm` sur headers sticky, transitions 150-200ms.
- **Commit frequent** : chaque sous-tache est autonome, commit meme si visuellement incomplet, tant que `typecheck` passe.
