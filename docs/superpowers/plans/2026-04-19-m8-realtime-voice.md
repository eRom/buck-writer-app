# M8 — Mode Live (OpenAI Realtime vocal) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à Buck Writer un mode conversationnel vocal `gpt-realtime-1.5` via WebRTC direct browser↔OpenAI, avec notch waveform central, injection du contexte session + MCP Bible + writing-tools + web_search, persistance des transcripts dans le chat texte, kill-switch budget, raccourci clavier, timeouts silence/durée max paramétrables.

**Architecture:** Backend Hono mint un `client_secret` éphémère via `/v1/realtime/client_secrets` (zéro clé API côté browser). Le browser ouvre un `RTCPeerConnection` direct vers OpenAI, envoie `session.update` avec instructions (SYSTEM+RULES+LIVE+snapshot 20 derniers messages) + tools MCP (require_approval:never forcé) + web_search natif. Transcripts persistés dans `messages` avec `source='voice'`. Usage tokens audio cumulatifs POST côté backend → `usage_events` avec `kind='realtime'`. Timeouts client-side (silence 30s configurable, warning 20min, close 25min). Raccourci `Cmd+Shift+L` et bouton mic chat = même comportement.

**Tech Stack:** TypeScript ESM, WebRTC natif navigateur, `@hono/node-server`, Drizzle + better-sqlite3, React 19 + Zustand + Framer Motion + `react-hotkeys-hook`, `lucide-react`, Vitest + `@testing-library/react` + `happy-dom`/`jsdom` stubs pour `RTCPeerConnection`.

**Spec:** `docs/superpowers/specs/2026-04-19-m8-realtime-voice-design.md`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `packages/shared/src/voice/voices.ts` | Liste `REALTIME_VOICES`, type, défaut `coral` |
| Create | `packages/shared/src/voice/voices.test.ts` | Tests liste + défaut |
| Create | `packages/shared/src/voice/turn-detection.ts` | Types VAD + défauts |
| Create | `packages/shared/src/voice/turn-detection.test.ts` | Tests défauts |
| Create | `packages/shared/src/voice/index.ts` | Barrel |
| Modify | `packages/shared/src/pricing/models.ts` | Ajout `audio_input_cached`, `REALTIME_MODEL`, `costOfRealtime` |
| Modify | `packages/shared/src/pricing/models.test.ts` | Tests `costOfRealtime` |
| Modify | `packages/shared/src/index.ts` | Re-export voice/* |
| Create | `packages/api/migrations/0008_realtime.sql` | `messages.source`, `usage_events.kind`, `userSettings.realtimeTurnDetectionJson` + `realtimeSilenceTimeoutSec` + `realtimeDefaultVoice` |
| Modify | `packages/api/src/db/schema.ts` | Colonnes nouvelles |
| Create | `packages/api/src/defaults/systems/LIVE.md` | Prompt mode Live |
| Modify | `packages/api/src/defaults/systems/SYSTEM.md` | Ligne "toujours FR y compris Live" |
| Modify | `packages/api/src/db/seed.ts` | Bootstrap LIVE.md |
| Create | `packages/api/src/lib/realtime.ts` | Client OpenAI `mintClientSecret` + types session |
| Create | `packages/api/src/lib/realtime.test.ts` | Tests mint (mock fetch) |
| Create | `packages/api/src/services/realtime/session-config.ts` | Build du payload `session.update` (instructions + tools + VAD) |
| Create | `packages/api/src/services/realtime/session-config.test.ts` | Tests build |
| Create | `packages/api/src/services/realtime/usage-tracker.ts` | Accumulateurs monotones par realtimeSessionId + GC |
| Create | `packages/api/src/services/realtime/usage-tracker.test.ts` | Tests monotone + GC |
| Create | `packages/api/src/routes/realtime.ts` | POST `/session`, `/usage`, `/transcript` + DELETE `/session/:id` |
| Create | `packages/api/src/routes/realtime.test.ts` | Tests endpoints |
| Modify | `packages/api/src/app.ts` | Mount `/api/realtime/*` + feature flag |
| Modify | `packages/api/src/routes/usage.ts` | Breakdown par `kind` |
| Modify | `packages/api/src/routes/usage.test.ts` | Tests breakdown |
| Modify | `packages/api/src/routes/settings.ts` | Champs realtime* |
| Modify | `packages/api/src/routes/settings.test.ts` | Tests champs |
| Create | `packages/web/src/lib/realtime-client.ts` | Classe `RealtimeClient` (WebRTC, DataChannel, usage accumulator, events) |
| Create | `packages/web/src/lib/realtime-client.test.ts` | Tests avec stubs RTC |
| Create | `packages/web/src/lib/realtime-api.ts` | Fetch helpers `/api/realtime/*` |
| Create | `packages/web/src/lib/realtime-api.test.ts` | Tests fetch (msw/fetch mock) |
| Create | `packages/web/src/stores/realtime-store.ts` | Zustand : state, voice, VAD, toggles, erreurs |
| Create | `packages/web/src/stores/realtime-store.test.ts` | Tests store |
| Create | `packages/web/src/hooks/use-realtime-voice.ts` | Instanciation + cleanup du client, bind store |
| Create | `packages/web/src/hooks/use-realtime-voice.test.tsx` | Tests hook (mock client) |
| Create | `packages/web/src/hooks/use-realtime-hotkey.ts` | `Cmd+Shift+L` → toggle |
| Create | `packages/web/src/components/live/notch.tsx` | Notch top-center |
| Create | `packages/web/src/components/live/notch.test.tsx` | Tests rendering + aria |
| Create | `packages/web/src/components/live/waveform.tsx` | Canvas 32 barres via AnalyserNode |
| Create | `packages/web/src/components/live/waveform.test.tsx` | Tests rendu basique |
| Create | `packages/web/src/components/settings/audio-live-section.tsx` | Panneau Paramètres |
| Create | `packages/web/src/components/settings/audio-live-section.test.tsx` | Tests |
| Modify | `packages/web/src/routes/__root.tsx` | Monte `<Notch />` |
| Modify | `packages/web/src/components/chat/chat-input.tsx` | Bouton mic |
| Modify | `packages/web/src/components/chat/chat-stream.tsx` | Inject messages `source='voice'` (optimiste) |
| Modify | `packages/web/src/routes/settings.tsx` | Onglet Audio Live |
| Modify | `packages/web/src/lib/settings.ts` | Types champs realtime* |
| Create | `packages/web/tests/e2e/realtime-voice.spec.ts` | E2E stub WebRTC + flow notch |
| Modify | `.env.example` | `REALTIME_ENABLED=0` |

---

## Phase 1 — Shared : voices, pricing, turn-detection

### Task 1.1 : Voices list

**Files:**
- Create: `packages/shared/src/voice/voices.ts`
- Create: `packages/shared/src/voice/voices.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/voice/voices.test.ts
import { describe, it, expect } from 'vitest';
import { REALTIME_VOICES, DEFAULT_VOICE } from './voices.js';

describe('REALTIME_VOICES', () => {
  it('contient les 10 voix OpenAI Realtime 2026', () => {
    expect(REALTIME_VOICES).toEqual([
      'cedar', 'marin', 'alloy', 'ash', 'ballad',
      'coral', 'echo', 'sage', 'shimmer', 'verse',
    ]);
  });
  it('défaut = coral', () => {
    expect(DEFAULT_VOICE).toBe('coral');
    expect(REALTIME_VOICES).toContain(DEFAULT_VOICE);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

Run: `pnpm --filter @buck/shared test -- voice/voices`
Expected: FAIL — `Cannot find module './voices.js'`

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/voice/voices.ts
export const REALTIME_VOICES = [
  'cedar', 'marin', 'alloy', 'ash', 'ballad',
  'coral', 'echo', 'sage', 'shimmer', 'verse',
] as const;

export type RealtimeVoice = (typeof REALTIME_VOICES)[number];

export const DEFAULT_VOICE: RealtimeVoice = 'coral';

export function isRealtimeVoice(v: unknown): v is RealtimeVoice {
  return typeof v === 'string' && (REALTIME_VOICES as readonly string[]).includes(v);
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `pnpm --filter @buck/shared test -- voice/voices`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/voice/voices.ts packages/shared/src/voice/voices.test.ts
git commit -m "feat(shared): voix Realtime (10 voix, défaut coral)"
```

### Task 1.2 : Turn detection config

**Files:**
- Create: `packages/shared/src/voice/turn-detection.ts`
- Create: `packages/shared/src/voice/turn-detection.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/voice/turn-detection.test.ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_TURN_DETECTION, normalizeTurnDetection } from './turn-detection.js';

describe('turn-detection', () => {
  it('défauts = server_vad + threshold 0.5 + 500/500 ms', () => {
    expect(DEFAULT_TURN_DETECTION).toEqual({
      mode: 'server_vad',
      threshold: 0.5,
      prefix_padding_ms: 500,
      silence_duration_ms: 500,
      interrupt_response: true,
    });
  });

  it('normalise clamp threshold 0..1 et ms positifs', () => {
    expect(normalizeTurnDetection({
      mode: 'server_vad', threshold: 2, prefix_padding_ms: -10, silence_duration_ms: 99999, interrupt_response: false,
    })).toEqual({
      mode: 'server_vad', threshold: 1, prefix_padding_ms: 0, silence_duration_ms: 5000, interrupt_response: false,
    });
  });

  it('retombe sur default si mode invalide', () => {
    expect(normalizeTurnDetection({ mode: 'bogus' as any })).toEqual(DEFAULT_TURN_DETECTION);
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `pnpm --filter @buck/shared test -- voice/turn-detection`

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/voice/turn-detection.ts
export type TurnDetectionMode = 'server_vad' | 'semantic_vad';

export interface TurnDetectionConfig {
  mode: TurnDetectionMode;
  threshold: number;            // 0..1
  prefix_padding_ms: number;    // 0..5000
  silence_duration_ms: number;  // 0..5000
  interrupt_response: boolean;
}

export const DEFAULT_TURN_DETECTION: TurnDetectionConfig = {
  mode: 'server_vad',
  threshold: 0.5,
  prefix_padding_ms: 500,
  silence_duration_ms: 500,
  interrupt_response: true,
};

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function normalizeTurnDetection(input: Partial<TurnDetectionConfig>): TurnDetectionConfig {
  const mode: TurnDetectionMode =
    input.mode === 'server_vad' || input.mode === 'semantic_vad' ? input.mode : 'server_vad';
  if (!input.mode || (input.mode !== 'server_vad' && input.mode !== 'semantic_vad')) {
    return { ...DEFAULT_TURN_DETECTION };
  }
  return {
    mode,
    threshold: clamp(input.threshold ?? DEFAULT_TURN_DETECTION.threshold, 0, 1),
    prefix_padding_ms: clamp(input.prefix_padding_ms ?? DEFAULT_TURN_DETECTION.prefix_padding_ms, 0, 5000),
    silence_duration_ms: clamp(input.silence_duration_ms ?? DEFAULT_TURN_DETECTION.silence_duration_ms, 0, 5000),
    interrupt_response: input.interrupt_response ?? DEFAULT_TURN_DETECTION.interrupt_response,
  };
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/voice/turn-detection.ts packages/shared/src/voice/turn-detection.test.ts
git commit -m "feat(shared): TurnDetectionConfig (VAD) + normalize"
```

### Task 1.3 : Barrel + exports

**Files:**
- Create: `packages/shared/src/voice/index.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create barrel**

```ts
// packages/shared/src/voice/index.ts
export * from './voices.js';
export * from './turn-detection.js';
```

- [ ] **Step 2: Add re-export**

Add in `packages/shared/src/index.ts` :

```ts
export * from './voice/index.js';
```

- [ ] **Step 3: Build check**

Run: `pnpm --filter @buck/shared build && pnpm --filter @buck/shared test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/voice/index.ts packages/shared/src/index.ts
git commit -m "feat(shared): barrel voice + re-export"
```

### Task 1.4 : Pricing cached + `costOfRealtime`

**Files:**
- Modify: `packages/shared/src/pricing/models.ts`
- Modify: `packages/shared/src/pricing/models.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/shared/src/pricing/models.test.ts` :

```ts
import { costOfRealtime, REALTIME_MODEL } from './models.js';

describe('costOfRealtime', () => {
  it('constant = gpt-realtime-1.5', () => {
    expect(REALTIME_MODEL).toBe('gpt-realtime-1.5');
  });

  it('facture audio + texte + cached correctement', () => {
    const cost = costOfRealtime({
      audioInputTokens: 1_000_000,
      audioOutputTokens: 0,
      textInputTokens: 0,
      textOutputTokens: 0,
      cachedInputTokens: 0,
    });
    // $32 par 1M (brief) → audio_input = 32 / 1M, attendu 32.0
    expect(cost).toBeCloseTo(32, 4);
  });

  it('retire les cached du billable audio input', () => {
    const cost = costOfRealtime({
      audioInputTokens: 1_000_000,
      audioOutputTokens: 0,
      textInputTokens: 0,
      textOutputTokens: 0,
      cachedInputTokens: 1_000_000,
    });
    // tout cached → prix cached = 0.40
    expect(cost).toBeCloseTo(0.4, 4);
  });
});
```

- [ ] **Step 2: Run — FAIL** (`REALTIME_MODEL not exported`)

Run: `pnpm --filter @buck/shared test -- pricing/models`

- [ ] **Step 3: Update pricing**

Replace `packages/shared/src/pricing/models.ts` :

```ts
export const PRICING = {
  'gpt-5.4': { input: 2.5, output: 15.0 },
  'gpt-5.4-mini': { input: 0.75, output: 4.5 },
  'gpt-5.4-pro': { input: 5.0, output: 30.0 },
  'gpt-5.4-nano': { input: 0.15, output: 0.6 },
  'gpt-realtime-1.5': {
    text_input: 5.0,
    text_output: 20.0,
    audio_input: 32.0,
    audio_input_cached: 0.4,
    audio_output: 64.0,
  },
} as const;

export type TextModel = 'gpt-5.4' | 'gpt-5.4-mini' | 'gpt-5.4-pro' | 'gpt-5.4-nano';
export type RealtimeModel = 'gpt-realtime-1.5';
export type Model = TextModel | RealtimeModel;

export const REALTIME_MODEL: RealtimeModel = 'gpt-realtime-1.5';

type TextEntry = { input: number; output: number };

function isTextEntry(p: unknown): p is TextEntry {
  return typeof p === 'object' && p !== null && 'input' in p && 'output' in p;
}

export function costOf(model: string, inputTokens: number, outputTokens: number): number {
  const entry = (PRICING as Record<string, unknown>)[model];
  if (!isTextEntry(entry)) return 0;
  return (inputTokens * entry.input + outputTokens * entry.output) / 1_000_000;
}

export interface RealtimeUsage {
  audioInputTokens: number;
  audioOutputTokens: number;
  textInputTokens: number;
  textOutputTokens: number;
  cachedInputTokens: number;
}

export function costOfRealtime(u: RealtimeUsage, model: RealtimeModel = REALTIME_MODEL): number {
  const p = PRICING[model];
  const billableAudioIn = Math.max(0, u.audioInputTokens - u.cachedInputTokens);
  return (
    billableAudioIn * p.audio_input +
    u.cachedInputTokens * p.audio_input_cached +
    u.audioOutputTokens * p.audio_output +
    u.textInputTokens * p.text_input +
    u.textOutputTokens * p.text_output
  ) / 1_000_000;
}
```

- [ ] **Step 4: Run — PASS** (nouveaux + anciens tests)

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/pricing/models.ts packages/shared/src/pricing/models.test.ts
git commit -m "feat(shared): costOfRealtime + audio_input_cached + REALTIME_MODEL"
```

---

## Phase 2 — API : schema DB + migrations + defaults

### Task 2.1 : Migration SQL

**Files:**
- Create: `packages/api/migrations/0008_realtime.sql`

- [ ] **Step 1: Write migration**

```sql
-- 0008_realtime.sql — M8 Realtime voice

ALTER TABLE messages ADD COLUMN source TEXT NOT NULL DEFAULT 'text';
ALTER TABLE usage_events ADD COLUMN kind TEXT NOT NULL DEFAULT 'chat';

ALTER TABLE user_settings ADD COLUMN realtime_default_voice TEXT NOT NULL DEFAULT 'coral';
ALTER TABLE user_settings ADD COLUMN realtime_turn_detection_json TEXT NOT NULL DEFAULT '{"mode":"server_vad","threshold":0.5,"prefix_padding_ms":500,"silence_duration_ms":500,"interrupt_response":true}';
ALTER TABLE user_settings ADD COLUMN realtime_silence_timeout_sec INTEGER NOT NULL DEFAULT 30;
ALTER TABLE user_settings ADD COLUMN realtime_tools_json TEXT NOT NULL DEFAULT '{"bible":true,"writingTools":true,"webSearch":true}';

CREATE INDEX usage_events_kind_idx ON usage_events(user_id, kind, created_at);
CREATE INDEX messages_source_idx ON messages(session_id, source);
```

- [ ] **Step 2: Update schema.ts — `messages` + `usage_events` + `userSettings`**

Edit `packages/api/src/db/schema.ts` :

- `messages` table : add `source: text('source').notNull().default('text')` after `toolMeta`.
- `usageEvents` : add `kind: text('kind').notNull().default('chat')` after `reasoningEffort`. Add `kindIdx: index('usage_events_kind_idx').on(t.userId, t.kind, t.createdAt)` in the index object.
- `userSettings` : append :

```ts
realtimeDefaultVoice: text('realtime_default_voice').notNull().default('coral'),
realtimeTurnDetectionJson: text('realtime_turn_detection_json')
  .notNull()
  .default('{"mode":"server_vad","threshold":0.5,"prefix_padding_ms":500,"silence_duration_ms":500,"interrupt_response":true}'),
realtimeSilenceTimeoutSec: integer('realtime_silence_timeout_sec').notNull().default(30),
realtimeToolsJson: text('realtime_tools_json')
  .notNull()
  .default('{"bible":true,"writingTools":true,"webSearch":true}'),
```

- [ ] **Step 3: Run migration test suite**

Run: `pnpm --filter @buck/api test -- db/migrate`
Expected: PASS (tests existants re-run sur un DB fraîche).

- [ ] **Step 4: Commit**

```bash
git add packages/api/migrations/0008_realtime.sql packages/api/src/db/schema.ts
git commit -m "feat(api): migration 0008 Realtime (messages.source, usage.kind, user_settings realtime)"
```

### Task 2.2 : Default prompts LIVE.md + SYSTEM ligne FR

**Files:**
- Create: `packages/api/src/defaults/systems/LIVE.md`
- Modify: `packages/api/src/defaults/systems/SYSTEM.md`
- Modify: `packages/api/src/db/seed.ts`

- [ ] **Step 1: Create LIVE.md**

```md
# Mode Live — instructions vocales

Tu parles comme dans une vraie conversation : phrases courtes, ton naturel, pas de listes à puces ni de markdown.
Si tu n'as pas compris un mot (bruit, coupure), demande de répéter en une phrase brève.
Ne lis jamais de code, URL ou citation longue à voix haute — écris-les dans le chat texte via l'outil `write_to_chat`.
Si l'utilisateur te coupe la parole, arrête-toi immédiatement et écoute.
Tu peux accéder à la Bible (MCP) et au web (web_search) sans demander la permission.
```

- [ ] **Step 2: Append to SYSTEM.md**

Ajouter au bas de `packages/api/src/defaults/systems/SYSTEM.md` :

```md

Tu réponds TOUJOURS en français, y compris en mode vocal Live.
```

- [ ] **Step 3: Update seed.ts**

Vérifier que le bootstrap copie tout le dossier `defaults/systems/*` → si c'est déjà un glob, rien à faire. Sinon ajouter `LIVE.md` explicitement dans la liste.

- [ ] **Step 4: Run seed test**

Run: `pnpm --filter @buck/api test -- db/seed`
Expected: PASS + `LIVE.md` copié dans workspace.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/defaults/systems/LIVE.md packages/api/src/defaults/systems/SYSTEM.md packages/api/src/db/seed.ts
git commit -m "feat(api): defaults LIVE.md + ligne FR dans SYSTEM.md"
```

---

## Phase 3 — API : client OpenAI Realtime + session-config

### Task 3.1 : `lib/realtime.ts` — mint client_secret

**Files:**
- Create: `packages/api/src/lib/realtime.ts`
- Create: `packages/api/src/lib/realtime.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/lib/realtime.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mintRealtimeClientSecret, REALTIME_SESSIONS_URL } from './realtime.js';

describe('mintRealtimeClientSecret', () => {
  it('POST sur /v1/realtime/client_secrets avec session payload', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ value: 'ek_abc', expires_at: 1776700000 }),
      { status: 200 },
    ));
    const out = await mintRealtimeClientSecret({
      apiKey: 'sk-test',
      session: { type: 'realtime', model: 'gpt-realtime-1.5' },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(out).toEqual({ value: 'ek_abc', expiresAt: 1776700000 });
    expect(fetchMock).toHaveBeenCalledWith(
      REALTIME_SESSIONS_URL,
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.session.model).toBe('gpt-realtime-1.5');
  });

  it('throw OpenAIError si non-2xx', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'nope' } }),
      { status: 401 },
    ));
    await expect(
      mintRealtimeClientSecret({
        apiKey: 'sk-bad',
        session: { type: 'realtime', model: 'gpt-realtime-1.5' },
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toThrow('OpenAI API error 401');
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `pnpm --filter @buck/api test -- lib/realtime`

- [ ] **Step 3: Implement**

```ts
// packages/api/src/lib/realtime.ts
import { OpenAIError } from './openai.js';

export const REALTIME_SESSIONS_URL = 'https://api.openai.com/v1/realtime/client_secrets';

export interface RealtimeSessionDescriptor {
  type: 'realtime';
  model: string;
  /** Optional — OpenAI accepts pre-configuring the session here; we pass full config later via session.update. */
  instructions?: string;
  voice?: string;
}

export interface MintOpts {
  apiKey: string;
  session: RealtimeSessionDescriptor;
  fetchImpl?: typeof fetch;
}

export interface MintedSecret {
  value: string;
  expiresAt: number;
}

export async function mintRealtimeClientSecret(opts: MintOpts): Promise<MintedSecret> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f(REALTIME_SESSIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session: opts.session }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new OpenAIError(res.status, err);
  }
  const data = (await res.json()) as { value: string; expires_at: number };
  return { value: data.value, expiresAt: data.expires_at };
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/lib/realtime.ts packages/api/src/lib/realtime.test.ts
git commit -m "feat(api): lib/realtime mint client_secret"
```

### Task 3.2 : `services/realtime/session-config.ts` — build payload

**Files:**
- Create: `packages/api/src/services/realtime/session-config.ts`
- Create: `packages/api/src/services/realtime/session-config.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/api/src/services/realtime/session-config.test.ts
import { describe, it, expect } from 'vitest';
import { buildSessionConfig } from './session-config.js';
import type { McpToolDef } from '../../lib/openai.js';

const mcpTools: McpToolDef[] = [
  { type: 'mcp', server_label: 'bible', server_url: 'https://bible/', require_approval: 'always' },
  { type: 'mcp', server_label: 'writing-tools', server_url: 'https://wt/' },
];

describe('buildSessionConfig', () => {
  it('inject instructions = systemPrompt + livePrompt + snapshot', () => {
    const cfg = buildSessionConfig({
      voice: 'coral',
      turnDetection: { mode: 'server_vad', threshold: 0.5, prefix_padding_ms: 500, silence_duration_ms: 500, interrupt_response: true },
      tools: { bible: true, writingTools: true, webSearch: true },
      mcpTools,
      systemPrompt: 'SYS',
      livePrompt: 'LIVE',
      sessionSnapshot: '[user]: salut\n[assistant]: bonjour',
    });
    expect(cfg.session.instructions).toContain('SYS');
    expect(cfg.session.instructions).toContain('LIVE');
    expect(cfg.session.instructions).toContain('salut');
  });

  it('force require_approval=never sur tous les MCP', () => {
    const cfg = buildSessionConfig({
      voice: 'coral',
      turnDetection: { mode: 'server_vad', threshold: 0.5, prefix_padding_ms: 500, silence_duration_ms: 500, interrupt_response: true },
      tools: { bible: true, writingTools: true, webSearch: false },
      mcpTools,
      systemPrompt: '', livePrompt: '', sessionSnapshot: '',
    });
    const mcps = cfg.session.tools!.filter((t) => t.type === 'mcp');
    expect(mcps).toHaveLength(2);
    expect(mcps.every((t) => (t as McpToolDef).require_approval === 'never')).toBe(true);
  });

  it('filtre MCP selon toggles (bible off)', () => {
    const cfg = buildSessionConfig({
      voice: 'coral',
      turnDetection: { mode: 'server_vad', threshold: 0.5, prefix_padding_ms: 500, silence_duration_ms: 500, interrupt_response: true },
      tools: { bible: false, writingTools: true, webSearch: false },
      mcpTools,
      systemPrompt: '', livePrompt: '', sessionSnapshot: '',
    });
    const labels = cfg.session.tools!.filter((t) => t.type === 'mcp').map((t) => (t as McpToolDef).server_label);
    expect(labels).toEqual(['writing-tools']);
  });

  it('ajoute web_search si toggle on', () => {
    const cfg = buildSessionConfig({
      voice: 'coral',
      turnDetection: { mode: 'server_vad', threshold: 0.5, prefix_padding_ms: 500, silence_duration_ms: 500, interrupt_response: true },
      tools: { bible: false, writingTools: false, webSearch: true },
      mcpTools,
      systemPrompt: '', livePrompt: '', sessionSnapshot: '',
    });
    expect(cfg.session.tools!.some((t) => t.type === 'web_search')).toBe(true);
  });

  it('inclut write_to_chat function tool toujours', () => {
    const cfg = buildSessionConfig({
      voice: 'coral',
      turnDetection: { mode: 'server_vad', threshold: 0.5, prefix_padding_ms: 500, silence_duration_ms: 500, interrupt_response: true },
      tools: { bible: false, writingTools: false, webSearch: false },
      mcpTools: [],
      systemPrompt: '', livePrompt: '', sessionSnapshot: '',
    });
    expect(cfg.session.tools!.some(
      (t) => t.type === 'function' && (t as { name?: string }).name === 'write_to_chat',
    )).toBe(true);
  });

  it('input_audio_transcription en gpt-4o-transcribe', () => {
    const cfg = buildSessionConfig({
      voice: 'coral',
      turnDetection: { mode: 'server_vad', threshold: 0.5, prefix_padding_ms: 500, silence_duration_ms: 500, interrupt_response: true },
      tools: { bible: false, writingTools: false, webSearch: false },
      mcpTools: [], systemPrompt: '', livePrompt: '', sessionSnapshot: '',
    });
    expect(cfg.session.input_audio_transcription).toEqual({ model: 'gpt-4o-transcribe' });
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
// packages/api/src/services/realtime/session-config.ts
import type { McpToolDef, ToolDef } from '../../lib/openai.js';
import type { RealtimeVoice, TurnDetectionConfig } from '@buck/shared';

export interface BuildSessionConfigInput {
  voice: RealtimeVoice;
  turnDetection: TurnDetectionConfig;
  tools: { bible: boolean; writingTools: boolean; webSearch: boolean };
  mcpTools: McpToolDef[];
  systemPrompt: string;
  livePrompt: string;
  sessionSnapshot: string;
}

export interface RealtimeSessionUpdatePayload {
  type: 'session.update';
  session: {
    instructions: string;
    voice: RealtimeVoice;
    modalities: ['audio', 'text'];
    input_audio_transcription: { model: 'gpt-4o-transcribe' };
    turn_detection: {
      type: TurnDetectionConfig['mode'];
      threshold: number;
      prefix_padding_ms: number;
      silence_duration_ms: number;
      interrupt_response: boolean;
    };
    tools?: ToolDef[];
  };
}

export function buildSessionConfig(input: BuildSessionConfigInput): RealtimeSessionUpdatePayload {
  const instructions = [
    input.systemPrompt.trim(),
    input.livePrompt.trim(),
    input.sessionSnapshot.trim() ? `# Contexte conversation en cours\n${input.sessionSnapshot.trim()}` : '',
  ].filter(Boolean).join('\n\n');

  const tools: ToolDef[] = [];

  const enabledLabels = new Set<string>();
  if (input.tools.bible) enabledLabels.add('bible');
  if (input.tools.writingTools) enabledLabels.add('writing-tools');

  for (const mcp of input.mcpTools) {
    if (!enabledLabels.has(mcp.server_label)) continue;
    tools.push({ ...mcp, require_approval: 'never' });
  }

  if (input.tools.webSearch) tools.push({ type: 'web_search' });

  tools.push({
    type: 'function',
    name: 'write_to_chat',
    description: 'Écrit un message assistant dans le chat texte de la session courante.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['content'],
      properties: {
        content: { type: 'string', description: 'Contenu markdown du message.' },
      },
    },
    strict: true,
  });

  return {
    type: 'session.update',
    session: {
      instructions,
      voice: input.voice,
      modalities: ['audio', 'text'],
      input_audio_transcription: { model: 'gpt-4o-transcribe' },
      turn_detection: {
        type: input.turnDetection.mode,
        threshold: input.turnDetection.threshold,
        prefix_padding_ms: input.turnDetection.prefix_padding_ms,
        silence_duration_ms: input.turnDetection.silence_duration_ms,
        interrupt_response: input.turnDetection.interrupt_response,
      },
      tools,
    },
  };
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/realtime/session-config.ts packages/api/src/services/realtime/session-config.test.ts
git commit -m "feat(api): services/realtime/session-config — build payload session.update"
```

### Task 3.3 : Snapshot helper (derniers N messages)

**Files:**
- Create: `packages/api/src/services/realtime/snapshot.ts`
- Create: `packages/api/src/services/realtime/snapshot.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// snapshot.test.ts
import { describe, it, expect } from 'vitest';
import { buildSessionSnapshot } from './snapshot.js';

describe('buildSessionSnapshot', () => {
  it('format [role]: text tronqué à N derniers', () => {
    const msgs = Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `msg${i}`,
    }));
    const snap = buildSessionSnapshot(msgs, { maxMessages: 20 });
    expect(snap.split('\n')).toHaveLength(20);
    expect(snap).toContain('msg24');
    expect(snap).not.toContain('msg4');
  });

  it('tronque tokens si budget dépassé', () => {
    const msgs = [{ role: 'user' as const, content: 'x'.repeat(20000) }];
    const snap = buildSessionSnapshot(msgs, { maxMessages: 20, maxChars: 200 });
    expect(snap.length).toBeLessThanOrEqual(220);
  });

  it('string vide si aucun message', () => {
    expect(buildSessionSnapshot([], { maxMessages: 20 })).toBe('');
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
// packages/api/src/services/realtime/snapshot.ts
export interface SnapshotMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface BuildSnapshotOpts {
  maxMessages: number;
  maxChars?: number;
}

export function buildSessionSnapshot(
  messages: SnapshotMessage[],
  opts: BuildSnapshotOpts,
): string {
  const maxChars = opts.maxChars ?? 16000;
  const tail = messages.slice(-opts.maxMessages);
  const lines = tail
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => `[${m.role}]: ${m.content}`);
  let out = lines.join('\n');
  if (out.length > maxChars) out = out.slice(-maxChars);
  return out;
}
```

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/realtime/snapshot.ts packages/api/src/services/realtime/snapshot.test.ts
git commit -m "feat(api): services/realtime/snapshot des N derniers messages"
```

### Task 3.4 : Usage tracker (monotone + GC)

**Files:**
- Create: `packages/api/src/services/realtime/usage-tracker.ts`
- Create: `packages/api/src/services/realtime/usage-tracker.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// usage-tracker.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createUsageTracker } from './usage-tracker.js';

describe('usage tracker', () => {
  it('accepte un update monotone', () => {
    const t = createUsageTracker({ nowMs: () => 1000 });
    t.update('s1', { audioInputTokens: 100, audioOutputTokens: 200, textInputTokens: 10, textOutputTokens: 20, cachedInputTokens: 0, audioInputSeconds: 1, audioOutputSeconds: 2 });
    expect(t.get('s1')?.audioInputTokens).toBe(100);
    t.update('s1', { audioInputTokens: 150, audioOutputTokens: 300, textInputTokens: 20, textOutputTokens: 40, cachedInputTokens: 5, audioInputSeconds: 1.5, audioOutputSeconds: 3 });
    expect(t.get('s1')?.audioInputTokens).toBe(150);
  });

  it('rejette un décrément (throws)', () => {
    const t = createUsageTracker({ nowMs: () => 1000 });
    t.update('s1', { audioInputTokens: 100, audioOutputTokens: 0, textInputTokens: 0, textOutputTokens: 0, cachedInputTokens: 0, audioInputSeconds: 0, audioOutputSeconds: 0 });
    expect(() => t.update('s1', { audioInputTokens: 50, audioOutputTokens: 0, textInputTokens: 0, textOutputTokens: 0, cachedInputTokens: 0, audioInputSeconds: 0, audioOutputSeconds: 0 })).toThrow(/non-monotonic/);
  });

  it('GC supprime après staleness', () => {
    let now = 1000;
    const t = createUsageTracker({ nowMs: () => now, staleMs: 2000 });
    t.update('s1', { audioInputTokens: 100, audioOutputTokens: 0, textInputTokens: 0, textOutputTokens: 0, cachedInputTokens: 0, audioInputSeconds: 0, audioOutputSeconds: 0 });
    now = 5000;
    const gc = t.gc();
    expect(gc).toEqual(['s1']);
    expect(t.get('s1')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
// usage-tracker.ts
import type { RealtimeUsage } from '@buck/shared';

export interface TrackedUsage extends RealtimeUsage {
  audioInputSeconds: number;
  audioOutputSeconds: number;
  updatedAt: number;
}

export interface UsageTrackerOpts {
  nowMs: () => number;
  staleMs?: number;
}

export function createUsageTracker(opts: UsageTrackerOpts) {
  const store = new Map<string, TrackedUsage>();
  const staleMs = opts.staleMs ?? 120_000;

  return {
    update(sessionId: string, u: Omit<TrackedUsage, 'updatedAt'>): TrackedUsage {
      const prev = store.get(sessionId);
      if (prev) {
        const keys: (keyof Omit<TrackedUsage, 'updatedAt'>)[] = [
          'audioInputTokens','audioOutputTokens','textInputTokens','textOutputTokens',
          'cachedInputTokens','audioInputSeconds','audioOutputSeconds',
        ];
        for (const k of keys) if (u[k] < prev[k]) throw new Error(`non-monotonic ${k}: ${u[k]} < ${prev[k]}`);
      }
      const merged: TrackedUsage = { ...u, updatedAt: opts.nowMs() };
      store.set(sessionId, merged);
      return merged;
    },
    get(sessionId: string): TrackedUsage | undefined { return store.get(sessionId); },
    drop(sessionId: string): TrackedUsage | undefined {
      const v = store.get(sessionId); store.delete(sessionId); return v;
    },
    gc(): string[] {
      const cutoff = opts.nowMs() - staleMs;
      const dropped: string[] = [];
      for (const [k, v] of store) if (v.updatedAt < cutoff) { store.delete(k); dropped.push(k); }
      return dropped;
    },
    size() { return store.size; },
  };
}

export type UsageTracker = ReturnType<typeof createUsageTracker>;
```

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/realtime/usage-tracker.ts packages/api/src/services/realtime/usage-tracker.test.ts
git commit -m "feat(api): usage-tracker monotone + GC pour sessions realtime"
```

---

## Phase 4 — API : routes `/api/realtime/*`

### Task 4.1 : Route `POST /session` — happy path

**Files:**
- Create: `packages/api/src/routes/realtime.ts`
- Create: `packages/api/src/routes/realtime.test.ts`

- [ ] **Step 1: Write failing test (happy path + auth)**

```ts
// packages/api/src/routes/realtime.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createRealtimeRoute } from './realtime.js';
// ... imports test helpers (in-memory DB, user fixture) — use same pattern as chat.test.ts

describe('POST /api/realtime/session', () => {
  // setup DB + user + seed mcp_servers bible + writing-tools
  // mock mintRealtimeClientSecret

  it('401 sans auth', async () => {
    // ...
  });

  it('402 si budget dépassé + hardStop', async () => {
    // ...
  });

  it('200 + clientSecret + sessionConfig avec MCP filtrés', async () => {
    // vérifie require_approval=never forcé
    // vérifie voice=coral si toggles vides
  });
});
```

- [ ] **Step 2: Run — FAIL (module n'existe pas)**

- [ ] **Step 3: Implement `realtime.ts`**

```ts
// packages/api/src/routes/realtime.ts
import { Hono } from 'hono';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { newId, REALTIME_MODEL, DEFAULT_VOICE, normalizeTurnDetection, isRealtimeVoice } from '@buck/shared';
import type { DbHandles } from '../db/client.js';
import { chatSessions, messages, userSettings, usageEvents } from '../db/schema.js';
import { mintRealtimeClientSecret } from '../lib/realtime.js';
import { buildMcpConnectorTools } from '../services/mcp-registry.js';
import { buildSessionConfig } from '../services/realtime/session-config.js';
import { buildSessionSnapshot } from '../services/realtime/snapshot.js';
import type { UsageTracker } from '../services/realtime/usage-tracker.js';
import type { PromptsRef } from '../services/prompts.js';
import { getMonthlyCostUsd } from '../middleware/budget-guard.js';

export interface RealtimeRouteDeps {
  db: DbHandles;
  openaiApiKey: string;
  prompts: PromptsRef;
  usageTracker: UsageTracker;
  nowMs?: () => number;
  featureFlag?: boolean;
}

export function createRealtimeRoute(deps: RealtimeRouteDeps): Hono<{ Variables: { userId: string } }> {
  const now = deps.nowMs ?? Date.now;
  const app = new Hono<{ Variables: { userId: string } }>();

  if (!deps.featureFlag) {
    app.all('/*', (c) => c.json({ error: { code: 'not_enabled', message: 'Realtime disabled' } }, 404));
    return app;
  }

  app.post('/session', async (c) => {
    const userId = c.get('userId');
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const sessionId = String(body.sessionId ?? '');
    const voice = isRealtimeVoice(body.voice) ? body.voice : DEFAULT_VOICE;
    const turnDetection = normalizeTurnDetection(
      (typeof body.turnDetection === 'object' && body.turnDetection) || {},
    );
    const toolsToggle = {
      bible: Boolean((body.tools as Record<string, unknown> | undefined)?.bible),
      writingTools: Boolean((body.tools as Record<string, unknown> | undefined)?.writingTools),
      webSearch: Boolean((body.tools as Record<string, unknown> | undefined)?.webSearch),
    };

    // 1. Check chat session belongs to user
    const session = deps.db.db.select().from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId), isNull(chatSessions.deletedAt)))
      .get();
    if (!session) return c.json({ error: { code: 'not_found', message: 'session not found' } }, 404);

    // 2. Budget guard
    const settings = deps.db.db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();
    if (settings?.hardStop) {
      const spent = getMonthlyCostUsd(deps.db, userId, now());
      if (spent >= (settings.monthlyCostLimitUsd ?? 20)) {
        return c.json({ error: { code: 'budget_exceeded', message: 'budget dépassé' } }, 402);
      }
    }

    // 3. Snapshot des 20 derniers messages
    const rows = deps.db.db.select().from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(desc(messages.createdAt))
      .limit(20).all();
    const snapshotMessages = rows.reverse().map((r) => ({
      role: r.role as 'user' | 'assistant' | 'system',
      content: parseContent(r.contentJson),
    }));

    // 4. Prompts
    const systemPrompt = deps.prompts.read('SYSTEM.md') + '\n\n' + deps.prompts.read('RULES.md');
    const livePrompt = deps.prompts.read('LIVE.md');
    const snapshot = buildSessionSnapshot(snapshotMessages, { maxMessages: 20 });

    // 5. MCP
    const mcpTools = buildMcpConnectorTools(deps.db);

    // 6. Build payload session.update
    const sessionConfig = buildSessionConfig({
      voice, turnDetection, tools: toolsToggle, mcpTools, systemPrompt, livePrompt, sessionSnapshot: snapshot,
    });

    // 7. Mint secret
    const minted = await mintRealtimeClientSecret({
      apiKey: deps.openaiApiKey,
      session: { type: 'realtime', model: REALTIME_MODEL, voice, instructions: sessionConfig.session.instructions.slice(0, 2000) },
    });

    return c.json({
      clientSecret: minted.value,
      expiresAt: minted.expiresAt,
      realtimeModel: REALTIME_MODEL,
      sessionConfig,
    });
  });

  // ... /usage, /transcript, DELETE (tasks 4.2+)

  return app;
}

function parseContent(contentJson: string): string {
  try {
    const p = JSON.parse(contentJson);
    if (typeof p === 'string') return p;
    if (Array.isArray(p)) return p.map((x) => (typeof x === 'string' ? x : x.text ?? '')).join('');
    return p?.text ?? '';
  } catch { return contentJson; }
}
```

- [ ] **Step 4: Expose `getMonthlyCostUsd` depuis `budget-guard.ts`** (si pas déjà fait) — sinon inliner la query.

- [ ] **Step 5: Run test — PASS sur `/session`**

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routes/realtime.ts packages/api/src/routes/realtime.test.ts
git commit -m "feat(api): POST /api/realtime/session (mint + sessionConfig)"
```

### Task 4.2 : `POST /usage`

**Files:**
- Modify: `packages/api/src/routes/realtime.ts`
- Modify: `packages/api/src/routes/realtime.test.ts`

- [ ] **Step 1: Write failing test**

```ts
describe('POST /api/realtime/usage', () => {
  it('met à jour cumulatif et retourne costUsd', async () => { /* ... */ });
  it('rejette un décrément avec 400', async () => { /* ... */ });
  it('renvoie 402 si budget dépassé (et coupe mémoire tracker)', async () => { /* ... */ });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
app.post('/usage', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const realtimeSessionId = String(body.realtimeSessionId ?? '');
  const sessionId = String(body.sessionId ?? '');
  if (!realtimeSessionId || !sessionId) return c.json({ error: { code: 'invalid' } }, 400);

  const usage = {
    audioInputTokens: Number(body.audioInputTokens ?? 0),
    audioOutputTokens: Number(body.audioOutputTokens ?? 0),
    textInputTokens: Number(body.textInputTokens ?? 0),
    textOutputTokens: Number(body.textOutputTokens ?? 0),
    cachedInputTokens: Number(body.cachedInputTokens ?? 0),
    audioInputSeconds: Number(body.audioInputSeconds ?? 0),
    audioOutputSeconds: Number(body.audioOutputSeconds ?? 0),
  };

  let tracked;
  try {
    tracked = deps.usageTracker.update(realtimeSessionId, usage);
  } catch (e) {
    return c.json({ error: { code: 'non_monotonic', message: (e as Error).message } }, 400);
  }

  const cost = costOfRealtime(tracked);

  // Budget guard : si hardStop, comparer cumul mois + cost courant
  const settings = deps.db.db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();
  const monthly = getMonthlyCostUsd(deps.db, userId, now());
  if (settings?.hardStop && monthly + cost >= (settings.monthlyCostLimitUsd ?? 20)) {
    deps.usageTracker.drop(realtimeSessionId);
    // on persiste tout de même l'usage consommé jusque là
    persistUsage(deps.db, { userId, sessionId, tracked, cost, now: now() });
    return c.json({ error: { code: 'budget_exceeded', message: 'budget dépassé' } }, 402);
  }

  return c.json({ costUsd: cost, budgetRemaining: Math.max(0, (settings?.monthlyCostLimitUsd ?? 20) - monthly - cost) });
});
```

Ajouter helper `persistUsage` interne (privé au fichier) qui insère un row `usage_events` avec `kind='realtime'`.

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/realtime.ts packages/api/src/routes/realtime.test.ts
git commit -m "feat(api): POST /api/realtime/usage (monotone + budget)"
```

### Task 4.3 : `POST /transcript`

**Files:**
- Modify: `packages/api/src/routes/realtime.ts`
- Modify: `packages/api/src/routes/realtime.test.ts`

- [ ] **Step 1: Test**

```ts
it('insère messages source=voice avec idempotence', async () => { /* double POST même (startedAt, role, sessionId) = pas de doublon */ });
```

- [ ] **Step 2: FAIL → Implement**

```ts
app.post('/transcript', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => ({})) as { sessionId?: string; items?: Array<{ role: 'user' | 'assistant'; text: string; startedAt: number; endedAt: number }> };
  const sessionId = String(body.sessionId ?? '');
  if (!sessionId || !Array.isArray(body.items)) return c.json({ error: { code: 'invalid' } }, 400);

  const session = deps.db.db.select().from(chatSessions)
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId))).get();
  if (!session) return c.json({ error: { code: 'not_found' } }, 404);

  let inserted = 0;
  for (const it of body.items) {
    // Idempotence : on stocke une clé synthétique dans toolMeta
    const key = `voice:${it.startedAt}:${it.role}`;
    const already = deps.db.db.select().from(messages)
      .where(and(eq(messages.sessionId, sessionId), eq(messages.toolMeta, key))).get();
    if (already) continue;

    deps.db.db.insert(messages).values({
      id: newId(),
      sessionId,
      role: it.role,
      contentJson: JSON.stringify(it.text),
      model: REALTIME_MODEL,
      toolMeta: key,
      createdAt: it.startedAt,
      source: 'voice',
    }).run();
    inserted++;
  }

  return c.json({ inserted });
});
```

- [ ] **Step 3: PASS**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(api): POST /api/realtime/transcript idempotent"
```

### Task 4.4 : `DELETE /session/:id` + flush

- [ ] **Step 1: Test**

```ts
it('DELETE flush usage final et drop du tracker', async () => { /* ... */ });
```

- [ ] **Step 2: Implement**

```ts
app.delete('/session/:id', async (c) => {
  const userId = c.get('userId');
  const realtimeSessionId = c.req.param('id');
  const sessionId = c.req.query('sessionId') ?? '';

  const tracked = deps.usageTracker.drop(realtimeSessionId);
  if (!tracked) return c.json({ closed: true, costUsd: 0 });

  const cost = costOfRealtime(tracked);
  if (sessionId) persistUsage(deps.db, { userId, sessionId, tracked, cost, now: now() });
  return c.json({ closed: true, costUsd: cost });
});
```

- [ ] **Step 3: PASS + Commit**

```bash
git commit -am "feat(api): DELETE /api/realtime/session flush usage"
```

### Task 4.5 : Mount + feature flag + GC périodique

**Files:**
- Modify: `packages/api/src/app.ts`
- Modify: `packages/api/src/index.ts`

- [ ] **Step 1: Instancier le tracker + GC dans `index.ts`**

```ts
import { createUsageTracker } from './services/realtime/usage-tracker.js';
const usageTracker = createUsageTracker({ nowMs: Date.now, staleMs: 120_000 });
setInterval(() => {
  const dropped = usageTracker.gc();
  if (dropped.length) log.info({ dropped }, 'realtime.usage.gc');
}, 60_000);
```

- [ ] **Step 2: Mount dans `app.ts`**

```ts
import { createRealtimeRoute } from './routes/realtime.js';
// après le mount de /api/chat :
app.route('/api/realtime', requireAuth().use('*', csrf).route('/', createRealtimeRoute({
  db, openaiApiKey, prompts, usageTracker,
  featureFlag: process.env.REALTIME_ENABLED === '1',
})));
```

Ajuster selon le pattern mount existant de `chat.ts`.

- [ ] **Step 3: Run tests `api`**

Run: `pnpm --filter @buck/api test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/app.ts packages/api/src/index.ts
git commit -m "feat(api): mount /api/realtime derrière REALTIME_ENABLED"
```

### Task 4.6 : `.env.example`

- [ ] **Step 1: Ajouter**

```
# --- Realtime (M8) ---
REALTIME_ENABLED=0
```

- [ ] **Step 2: Commit**

```bash
git commit -am "docs(env): REALTIME_ENABLED flag"
```

### Task 4.7 : Breakdown `usage` par `kind`

**Files:**
- Modify: `packages/api/src/routes/usage.ts` + test

- [ ] **Step 1: Ajouter dans `GET /api/usage/current` un champ `byKind: { chat: number, realtime: number }`** (test avant impl).

- [ ] **Step 2 à 5: TDD + commit**

```bash
git commit -am "feat(api): usage breakdown par kind (chat/realtime)"
```

---

## Phase 5 — Web : API client + store Zustand

### Task 5.1 : `lib/realtime-api.ts`

**Files:**
- Create: `packages/web/src/lib/realtime-api.ts`
- Create: `packages/web/src/lib/realtime-api.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { realtimeApi } from './realtime-api.js';

describe('realtime-api', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });

  it('POST /api/realtime/session retourne clientSecret', async () => {
    (fetch as any).mockResolvedValueOnce(new Response(JSON.stringify({
      clientSecret: 'ek', expiresAt: 1, realtimeModel: 'gpt-realtime-1.5', sessionConfig: { type: 'session.update', session: {} },
    }), { status: 200 }));
    const out = await realtimeApi.createSession({ sessionId: 's1', voice: 'coral', turnDetection: {} as any, tools: { bible: true, writingTools: true, webSearch: true } });
    expect(out.clientSecret).toBe('ek');
  });

  it('postUsage throw sur 402', async () => {
    (fetch as any).mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'budget_exceeded' } }), { status: 402 }));
    await expect(realtimeApi.postUsage('s1', 'rts1', {} as any)).rejects.toThrow(/budget_exceeded/);
  });
});
```

- [ ] **Step 2: FAIL → Implement** (fetch wrappers + error class)

```ts
// realtime-api.ts
export class RealtimeApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new RealtimeApiError(res.status, j.error?.code ?? 'http_error', j.error?.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const realtimeApi = {
  createSession(input: { sessionId: string; voice: string; turnDetection: unknown; tools: { bible: boolean; writingTools: boolean; webSearch: boolean } }) {
    return post<{ clientSecret: string; expiresAt: number; realtimeModel: string; sessionConfig: unknown }>('/api/realtime/session', input);
  },
  postUsage(sessionId: string, realtimeSessionId: string, usage: Record<string, number>) {
    return post<{ costUsd: number; budgetRemaining: number }>('/api/realtime/usage', { sessionId, realtimeSessionId, ...usage });
  },
  postTranscript(sessionId: string, items: Array<{ role: 'user' | 'assistant'; text: string; startedAt: number; endedAt: number }>) {
    return post<{ inserted: number }>('/api/realtime/transcript', { sessionId, items });
  },
  closeSession(realtimeSessionId: string, sessionId: string) {
    return fetch(`/api/realtime/session/${realtimeSessionId}?sessionId=${encodeURIComponent(sessionId)}`, {
      method: 'DELETE', credentials: 'include',
    }).then((r) => r.json() as Promise<{ closed: boolean; costUsd: number }>);
  },
};
```

- [ ] **Step 3: PASS + Commit**

```bash
git commit -am "feat(web): lib/realtime-api (fetch wrappers)"
```

### Task 5.2 : Store Zustand

**Files:**
- Create: `packages/web/src/stores/realtime-store.ts`
- Create: `packages/web/src/stores/realtime-store.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { useRealtimeStore } from './realtime-store.js';

describe('realtime-store', () => {
  it('default state = idle', () => {
    expect(useRealtimeStore.getState().state).toBe('idle');
  });
  it('setState transition', () => {
    useRealtimeStore.getState().setState('listening');
    expect(useRealtimeStore.getState().state).toBe('listening');
  });
  it('setError passe en error et stocke le message', () => {
    useRealtimeStore.getState().setError('mic refusé');
    expect(useRealtimeStore.getState().state).toBe('error');
    expect(useRealtimeStore.getState().error).toBe('mic refusé');
  });
  it('reset revient à idle sans erreur', () => {
    useRealtimeStore.getState().reset();
    expect(useRealtimeStore.getState().state).toBe('idle');
    expect(useRealtimeStore.getState().error).toBeNull();
  });
});
```

- [ ] **Step 2: FAIL → Implement**

```ts
// realtime-store.ts
import { create } from 'zustand';

export type RealtimeState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

interface RealtimeStoreState {
  state: RealtimeState;
  error: string | null;
  chatSessionId: string | null;
  realtimeSessionId: string | null;
  analyser: AnalyserNode | null;
  muted: boolean;

  setState: (s: RealtimeState) => void;
  setError: (msg: string) => void;
  reset: () => void;
  attach: (chatSessionId: string, realtimeSessionId: string, analyser: AnalyserNode) => void;
  setMuted: (m: boolean) => void;
}

export const useRealtimeStore = create<RealtimeStoreState>((set) => ({
  state: 'idle',
  error: null,
  chatSessionId: null,
  realtimeSessionId: null,
  analyser: null,
  muted: false,
  setState: (s) => set({ state: s, ...(s !== 'error' ? { error: null } : {}) }),
  setError: (msg) => set({ state: 'error', error: msg }),
  reset: () => set({ state: 'idle', error: null, chatSessionId: null, realtimeSessionId: null, analyser: null, muted: false }),
  attach: (chatSessionId, realtimeSessionId, analyser) => set({ chatSessionId, realtimeSessionId, analyser }),
  setMuted: (m) => set({ muted: m }),
}));
```

- [ ] **Step 3: PASS + Commit**

```bash
git commit -am "feat(web): store realtime Zustand"
```

---

## Phase 6 — Web : RealtimeClient (WebRTC)

### Task 6.1 : Squelette + stubs de test

**Files:**
- Create: `packages/web/src/lib/realtime-client.ts`
- Create: `packages/web/src/lib/realtime-client.test.ts`

- [ ] **Step 1: Setup jsdom/happy-dom RTC stubs**

Vérifier `packages/web/vitest.config.ts` : environment `jsdom`. Ajouter dans `packages/web/src/test/setup.ts` des stubs :

```ts
class StubRTCPeerConnection {
  onicecandidate: ((e: any) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  ontrack: ((e: any) => void) | null = null;
  iceConnectionState = 'new';
  localDescription: any = null;
  async createOffer() { return { type: 'offer', sdp: 'stub-offer' }; }
  async setLocalDescription(desc: any) { this.localDescription = desc; }
  async setRemoteDescription() {}
  addTrack() { return { id: 'track' } as any; }
  createDataChannel(label: string) {
    const dc: any = { label, readyState: 'open', onopen: null, onmessage: null, onclose: null, send: vi.fn(), close: vi.fn() };
    queueMicrotask(() => dc.onopen?.());
    return dc;
  }
  close() {}
}
(globalThis as any).RTCPeerConnection = StubRTCPeerConnection;
(navigator as any).mediaDevices = { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn(), enabled: true }] })) };
```

- [ ] **Step 2: Test `start()` → happy path**

```ts
import { describe, it, expect, vi } from 'vitest';
import { RealtimeClient } from './realtime-client.js';

describe('RealtimeClient', () => {
  it('start() crée PC, demande mic, envoie SDP et session.update', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ clientSecret: 'ek', expiresAt: 1, realtimeModel: 'gpt-realtime-1.5', sessionConfig: { type: 'session.update', session: { voice: 'coral' } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response('stub-answer', { status: 200 }))
    );
    const client = new RealtimeClient({ chatSessionId: 's1' });
    const events: string[] = [];
    client.addEventListener('state', (e: any) => events.push(e.detail));
    await client.start({ voice: 'coral', turnDetection: { mode: 'server_vad' } as any, tools: { bible: true, writingTools: true, webSearch: true } });
    expect(events).toContain('connecting');
  });
});
```

- [ ] **Step 3: FAIL → Implement squelette**

```ts
// realtime-client.ts
import { realtimeApi } from './realtime-api.js';

export interface RealtimeClientOpts { chatSessionId: string; }
export interface StartOpts { voice: string; turnDetection: unknown; tools: { bible: boolean; writingTools: boolean; webSearch: boolean }; }

interface UsageAggregate {
  audioInputTokens: number; audioOutputTokens: number;
  textInputTokens: number; textOutputTokens: number;
  cachedInputTokens: number;
  audioInputSeconds: number; audioOutputSeconds: number;
}

export class RealtimeClient extends EventTarget {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private micStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private analyser: AnalyserNode | null = null;
  private audioCtx: AudioContext | null = null;

  private realtimeSessionId = '';
  private usage: UsageAggregate = { audioInputTokens: 0, audioOutputTokens: 0, textInputTokens: 0, textOutputTokens: 0, cachedInputTokens: 0, audioInputSeconds: 0, audioOutputSeconds: 0 };
  private transcriptQueue: Array<{ role: 'user' | 'assistant'; text: string; startedAt: number; endedAt: number }> = [];
  private transcriptFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private startedAt = 0;
  private durationTimers: ReturnType<typeof setTimeout>[] = [];

  constructor(private opts: RealtimeClientOpts) { super(); }

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  async start(startOpts: StartOpts): Promise<void> {
    this.emit('state', 'connecting');

    // 1. Ask mic
    const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    this.micStream = mic;

    // 2. Mint session via backend
    const { clientSecret, sessionConfig, realtimeModel } = await realtimeApi.createSession({
      sessionId: this.opts.chatSessionId,
      voice: startOpts.voice, turnDetection: startOpts.turnDetection, tools: startOpts.tools,
    });

    // 3. WebRTC
    const pc = new RTCPeerConnection();
    this.pc = pc;
    mic.getTracks().forEach((t) => pc.addTrack(t, mic));

    this.remoteAudio = document.createElement('audio');
    this.remoteAudio.autoplay = true;
    pc.ontrack = (e) => {
      if (!this.remoteAudio) return;
      this.remoteAudio.srcObject = e.streams[0];
      // Analyser sur le remote stream pour waveform
      this.audioCtx ??= new AudioContext();
      const src = this.audioCtx.createMediaStreamSource(e.streams[0]);
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      this.analyser = analyser;
      this.emit('analyser', analyser);
    };

    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      if (s === 'disconnected' || s === 'failed') {
        setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') this.fail('connexion perdue');
        }, 5000);
      }
    };

    const dc = pc.createDataChannel('oai-events');
    this.dc = dc;
    dc.onopen = () => {
      dc.send(JSON.stringify(sessionConfig));
      this.startedAt = Date.now();
      this.resetSilenceTimer();
      this.scheduleDurationWarnings();
      this.emit('state', 'listening');
    };
    dc.onmessage = (e) => this.handleEvent(JSON.parse(e.data));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const answerRes = await fetch(`https://api.openai.com/v1/realtime?model=${realtimeModel}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clientSecret}`, 'Content-Type': 'application/sdp' },
      body: offer.sdp ?? '',
    });
    const answerSdp = await answerRes.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
  }

  private handleEvent(event: any): void {
    switch (event?.type) {
      case 'session.created': {
        this.realtimeSessionId = event.session?.id ?? '';
        this.emit('session.created', this.realtimeSessionId);
        break;
      }
      case 'input_audio_buffer.speech_started': {
        this.resetSilenceTimer();
        this.emit('state', 'listening');
        break;
      }
      case 'response.created':
        this.emit('state', 'speaking');
        break;
      case 'response.audio.delta':
        this.resetSilenceTimer();
        break;
      case 'response.done': {
        this.emit('state', 'listening');
        this.mergeUsage(event.response?.usage);
        void this.flushUsage();
        break;
      }
      case 'conversation.item.input_audio_transcription.completed': {
        const text = event.transcript ?? '';
        if (text) this.enqueueTranscript('user', text);
        break;
      }
      case 'response.audio_transcript.done': {
        const text = event.transcript ?? '';
        if (text) this.enqueueTranscript('assistant', text);
        break;
      }
      case 'response.function_call_arguments.done': {
        if (event.name === 'write_to_chat') this.handleWriteToChat(event);
        break;
      }
    }
  }

  private mergeUsage(u: any): void {
    if (!u) return;
    const audioIn = u.input_token_details?.audio_tokens ?? 0;
    const textIn = u.input_token_details?.text_tokens ?? 0;
    const cached = u.input_token_details?.cached_tokens ?? 0;
    const audioOut = u.output_token_details?.audio_tokens ?? 0;
    const textOut = u.output_token_details?.text_tokens ?? 0;
    this.usage.audioInputTokens += audioIn;
    this.usage.textInputTokens += textIn;
    this.usage.cachedInputTokens += cached;
    this.usage.audioOutputTokens += audioOut;
    this.usage.textOutputTokens += textOut;
    this.usage.audioInputSeconds += audioIn / 50;
    this.usage.audioOutputSeconds += audioOut / 200;
  }

  private async flushUsage(): Promise<void> {
    if (!this.realtimeSessionId) return;
    try {
      await realtimeApi.postUsage(this.opts.chatSessionId, this.realtimeSessionId, this.usage);
    } catch (e) {
      if ((e as any)?.code === 'budget_exceeded') this.fail('budget mensuel dépassé');
    }
  }

  private enqueueTranscript(role: 'user' | 'assistant', text: string): void {
    const startedAt = Date.now();
    this.transcriptQueue.push({ role, text, startedAt, endedAt: startedAt });
    this.emit('transcript', { role, text, startedAt });
    if (this.transcriptFlushTimer) clearTimeout(this.transcriptFlushTimer);
    this.transcriptFlushTimer = setTimeout(() => this.flushTranscript(), 2000);
  }

  private async flushTranscript(): Promise<void> {
    if (!this.transcriptQueue.length) return;
    const batch = this.transcriptQueue.splice(0);
    try {
      await realtimeApi.postTranscript(this.opts.chatSessionId, batch);
    } catch { this.transcriptQueue.unshift(...batch); }
  }

  private handleWriteToChat(event: any): void {
    try {
      const args = JSON.parse(event.arguments ?? '{}');
      this.emit('write_to_chat', args);
      this.dc?.send(JSON.stringify({
        type: 'conversation.item.create',
        item: { type: 'function_call_output', call_id: event.call_id, output: JSON.stringify({ ok: true }) },
      }));
    } catch {
      this.dc?.send(JSON.stringify({
        type: 'conversation.item.create',
        item: { type: 'function_call_output', call_id: event.call_id, output: JSON.stringify({ ok: false }) },
      }));
    }
  }

  private resetSilenceTimer(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => this.fail('silence prolongé'), (window as any).__buckSilenceTimeoutMs ?? 30_000);
  }

  private scheduleDurationWarnings(): void {
    this.durationTimers.push(setTimeout(() => this.emit('warn', 'session en cours depuis 20 min — fermeture dans 5 min'), 20 * 60_000));
    this.durationTimers.push(setTimeout(() => this.fail('durée max atteinte (25 min)'), 25 * 60_000));
  }

  setMuted(muted: boolean): void {
    this.micStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  private fail(reason: string): void {
    this.emit('error', reason);
    void this.stop();
  }

  async stop(): Promise<void> {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.durationTimers.forEach((t) => clearTimeout(t));
    if (this.transcriptFlushTimer) clearTimeout(this.transcriptFlushTimer);
    await this.flushTranscript();
    if (this.realtimeSessionId) {
      await realtimeApi.closeSession(this.realtimeSessionId, this.opts.chatSessionId).catch(() => {});
    }
    this.dc?.close();
    this.pc?.close();
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.remoteAudio?.remove();
    await this.audioCtx?.close().catch(() => {});
    this.emit('state', 'idle');
  }

  getAnalyser(): AnalyserNode | null { return this.analyser; }
}
```

- [ ] **Step 4: PASS (tests squelette)**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(web): RealtimeClient (WebRTC, VAD, transcripts, usage)"
```

### Task 6.2 : Tests barge-in + silence + stop

**Files:**
- Modify: `packages/web/src/lib/realtime-client.test.ts`

- [ ] **Step 1: Ajouter tests**

```ts
it('speech_started reset silence timer', () => { /* fake timers, vérifier clearTimeout */ });
it('silence timeout → emits error + stop', async () => { /* ... */ });
it('setMuted coupe track.enabled', () => { /* ... */ });
it('stop() flush transcript + close session', async () => { /* ... */ });
```

- [ ] **Step 2: Exec — PASS**

- [ ] **Step 3: Commit**

```bash
git commit -am "test(web): RealtimeClient — silence, mute, stop flush"
```

---

## Phase 7 — Web : Hook + Notch + Waveform

### Task 7.1 : Hook `use-realtime-voice`

**Files:**
- Create: `packages/web/src/hooks/use-realtime-voice.ts`
- Create: `packages/web/src/hooks/use-realtime-voice.test.tsx`

- [ ] **Step 1: Test**

```ts
import { renderHook, act } from '@testing-library/react';
import { useRealtimeVoice } from './use-realtime-voice.js';

it('start() instancie client et MAJ store', async () => { /* mock RealtimeClient */ });
it('stop() reset store', async () => { /* ... */ });
it('unmount appelle stop()', () => { /* ... */ });
```

- [ ] **Step 2: Impl**

```ts
// use-realtime-voice.ts
import { useCallback, useEffect, useRef } from 'react';
import { RealtimeClient } from '@/lib/realtime-client';
import { useRealtimeStore } from '@/stores/realtime-store';

export function useRealtimeVoice(chatSessionId: string | null) {
  const store = useRealtimeStore();
  const clientRef = useRef<RealtimeClient | null>(null);

  const start = useCallback(async (config: { voice: string; turnDetection: unknown; tools: { bible: boolean; writingTools: boolean; webSearch: boolean } }) => {
    if (!chatSessionId || clientRef.current) return;
    const client = new RealtimeClient({ chatSessionId });
    clientRef.current = client;
    client.addEventListener('state', (e: any) => store.setState(e.detail));
    client.addEventListener('error', (e: any) => store.setError(e.detail));
    client.addEventListener('analyser', (e: any) => store.attach(chatSessionId, '', e.detail));
    client.addEventListener('session.created', (e: any) => store.attach(chatSessionId, e.detail as string, store.analyser!));
    try { await client.start(config); }
    catch (err) { store.setError((err as Error).message); clientRef.current = null; }
  }, [chatSessionId, store]);

  const stop = useCallback(async () => {
    await clientRef.current?.stop();
    clientRef.current = null;
    store.reset();
  }, [store]);

  const toggleMute = useCallback(() => {
    const next = !store.muted;
    store.setMuted(next);
    clientRef.current?.setMuted(next);
  }, [store]);

  useEffect(() => () => { void clientRef.current?.stop(); }, []);

  return { start, stop, toggleMute, state: store.state, error: store.error, muted: store.muted };
}
```

- [ ] **Step 3: PASS + Commit**

```bash
git commit -am "feat(web): hook use-realtime-voice"
```

### Task 7.2 : Waveform canvas

**Files:**
- Create: `packages/web/src/components/live/waveform.tsx`
- Create: `packages/web/src/components/live/waveform.test.tsx`

- [ ] **Step 1: Test basique**

```ts
it('rend un <canvas> avec aria-hidden', () => {
  const { container } = render(<Waveform analyser={null} state="listening" />);
  expect(container.querySelector('canvas')?.getAttribute('aria-hidden')).toBe('true');
});
```

- [ ] **Step 2: Impl**

```tsx
import { useEffect, useRef } from 'react';

interface Props { analyser: AnalyserNode | null; state: 'connecting' | 'listening' | 'speaking' | 'idle' | 'error'; }

const COLORS = {
  connecting: '#f59e0b',
  listening: '#f59e0b',
  speaking: '#84cc16',
  idle: '#44403c',
  error: '#ef4444',
};

export function Waveform({ analyser, state }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;

    const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    let raf = 0;

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = COLORS[state];
      const bars = 32;
      const barW = (canvas.width / bars) * 0.5;
      const gap = (canvas.width / bars) * 0.5;
      if (analyser && data) analyser.getByteTimeDomainData(data);
      for (let i = 0; i < bars; i++) {
        const v = data ? Math.abs(data[Math.floor((i / bars) * data.length)] - 128) / 128 : 0.1;
        const h = Math.max(4 * dpr, v * canvas.height);
        const x = i * (barW + gap);
        const y = (canvas.height - h) / 2;
        ctx.fillRect(x, y, barW, h);
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(raf);
  }, [analyser, state]);

  return <canvas ref={ref} className="h-6 w-full" aria-hidden="true" />;
}
```

- [ ] **Step 3: PASS + Commit**

```bash
git commit -am "feat(web): Waveform canvas 32 barres"
```

### Task 7.3 : Notch component

**Files:**
- Create: `packages/web/src/components/live/notch.tsx`
- Create: `packages/web/src/components/live/notch.test.tsx`

- [ ] **Step 1: Test**

```tsx
it('caché si state idle', () => {
  useRealtimeStore.getState().reset();
  const { queryByRole } = render(<Notch />);
  expect(queryByRole('status')).toBeNull();
});
it('affiche aria-live polite quand listening', () => { /* ... */ });
it('click close appelle stop du hook', () => { /* ... */ });
```

- [ ] **Step 2: Impl**

```tsx
// notch.tsx
import { AnimatePresence, motion } from 'framer-motion';
import { Mic, MicOff, X } from 'lucide-react';
import { useRealtimeStore } from '@/stores/realtime-store';
import { useRealtimeVoice } from '@/hooks/use-realtime-voice';
import { Waveform } from './waveform';

export function Notch() {
  const { state, muted, analyser, chatSessionId } = useRealtimeStore();
  const { stop, toggleMute } = useRealtimeVoice(chatSessionId);

  if (state === 'idle') return null;

  const label =
    state === 'connecting' ? 'Live en connexion' :
    state === 'listening' ? (muted ? 'Live actif — muet' : 'Live actif — écoute') :
    state === 'speaking' ? 'Live actif — parole' :
    'Live erreur';

  return (
    <AnimatePresence>
      <motion.div
        role="status"
        aria-live="polite"
        aria-label={label}
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -20, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed top-2 left-1/2 -translate-x-1/2 z-50 h-11 w-[260px] rounded-full bg-stone-900/80 backdrop-blur-md border border-stone-800 flex items-center px-3 gap-2"
      >
        <Mic className={state === 'speaking' ? 'text-lime-400' : 'text-amber-400'} size={16} />
        <div className="flex-1"><Waveform analyser={analyser} state={state === 'error' ? 'idle' : state} /></div>
        <button aria-label={muted ? 'Réactiver micro' : 'Couper micro'} onClick={toggleMute} className="text-stone-300 hover:text-white">
          {muted ? <MicOff size={14} /> : <Mic size={14} />}
        </button>
        <button aria-label="Fermer session Live" onClick={() => void stop()} className="text-stone-300 hover:text-white">
          <X size={14} />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 3: Mount dans `__root.tsx`**

```tsx
import { Notch } from '@/components/live/notch';
// ...
return <>
  <Outlet />
  <Notch />
</>;
```

- [ ] **Step 4: PASS + Commit**

```bash
git commit -am "feat(web): Notch Live + mount root"
```

### Task 7.4 : Raccourci clavier

**Files:**
- Add dep: `react-hotkeys-hook` (vérifier si déjà présent — sinon `pnpm --filter @buck/web add react-hotkeys-hook`).
- Create: `packages/web/src/hooks/use-realtime-hotkey.ts`

- [ ] **Step 1: Impl**

```ts
import { useHotkeys } from 'react-hotkeys-hook';
import { useRealtimeStore } from '@/stores/realtime-store';
import { useRealtimeVoice } from '@/hooks/use-realtime-voice';
import { useUserSettings } from '@/lib/settings';

export function useRealtimeHotkey(chatSessionId: string | null) {
  const { state } = useRealtimeStore();
  const { start, stop } = useRealtimeVoice(chatSessionId);
  const { settings } = useUserSettings();

  useHotkeys('mod+shift+l', async (e) => {
    e.preventDefault();
    if (!chatSessionId) return;
    if (state === 'idle') {
      await start({
        voice: settings.realtimeDefaultVoice,
        turnDetection: settings.realtimeTurnDetection,
        tools: settings.realtimeTools,
      });
    } else {
      await stop();
    }
  }, { enableOnFormTags: true }, [state, chatSessionId, settings]);
}
```

- [ ] **Step 2: Wire dans `routes/index.tsx` Home** :

```tsx
useRealtimeHotkey(sessionId);
```

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(web): raccourci Cmd+Shift+L toggle Live"
```

---

## Phase 8 — Web : Settings Audio Live + types

### Task 8.1 : Types settings côté web

**Files:**
- Modify: `packages/web/src/lib/settings.ts`

- [ ] **Step 1: Étendre le type Settings avec les champs realtime* (même shape que DB).**

- [ ] **Step 2: Test roundtrip fetch/update** (mock fetch).

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(web): types settings realtime*"
```

### Task 8.2 : Composant `audio-live-section.tsx`

**Files:**
- Create: `packages/web/src/components/settings/audio-live-section.tsx`
- Create: `packages/web/src/components/settings/audio-live-section.test.tsx`
- Modify: `packages/web/src/routes/settings.tsx`

- [ ] **Step 1: Test rendu + interactions**

```ts
it('affiche badge permission "rechecker" quand denied', async () => { /* stub navigator.permissions */ });
it('slider silenceTimeout [10-60], défaut 30', () => { /* ... */ });
it('select voice affiche les 10 voix, défaut coral', () => { /* ... */ });
it('toggle bible off + save → PATCH /api/settings', () => { /* ... */ });
```

- [ ] **Step 2: Impl**

```tsx
// audio-live-section.tsx (squelette principal)
import { REALTIME_VOICES } from '@buck/shared';
import { useEffect, useState } from 'react';
import { useUserSettings } from '@/lib/settings';
// ... shadcn: Switch, Slider, Select, Label, Badge

export function AudioLiveSection() {
  const { settings, update } = useUserSettings();
  const [permission, setPermission] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');

  useEffect(() => {
    if (!navigator.permissions) return;
    navigator.permissions.query({ name: 'microphone' as PermissionName }).then((res) => {
      setPermission(res.state as any);
      res.onchange = () => setPermission(res.state as any);
    }).catch(() => setPermission('unknown'));
  }, []);

  async function recheck() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      setPermission('granted');
    } catch { setPermission('denied'); }
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center gap-3">
        <h2>Audio Live</h2>
        {permission === 'granted'
          ? <Badge variant="success">disponible</Badge>
          : <button onClick={recheck}><Badge variant="warning">rechecker</Badge></button>}
      </header>

      <div>
        <Label>Voix</Label>
        <Select value={settings.realtimeDefaultVoice} onValueChange={(v) => update({ realtimeDefaultVoice: v })}>
          {REALTIME_VOICES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
        </Select>
      </div>

      <div>
        <Label>Timeout silence ({settings.realtimeSilenceTimeoutSec}s)</Label>
        <Slider min={10} max={60} step={1}
          value={[settings.realtimeSilenceTimeoutSec]}
          onValueChange={([v]) => update({ realtimeSilenceTimeoutSec: v })}/>
      </div>

      <fieldset className="space-y-3">
        <legend>Détection de voix</legend>
        <Slider label="Sensibilité" min={0} max={1} step={0.05}
          value={[settings.realtimeTurnDetection.threshold]}
          onValueChange={([v]) => update({ realtimeTurnDetection: { ...settings.realtimeTurnDetection, threshold: v } })}/>
        <Slider label="Padding début (ms)" min={0} max={1000} step={50}
          value={[settings.realtimeTurnDetection.prefix_padding_ms]}
          onValueChange={([v]) => update({ realtimeTurnDetection: { ...settings.realtimeTurnDetection, prefix_padding_ms: v } })}/>
        <Slider label="Durée silence (ms)" min={100} max={2000} step={50}
          value={[settings.realtimeTurnDetection.silence_duration_ms]}
          onValueChange={([v]) => update({ realtimeTurnDetection: { ...settings.realtimeTurnDetection, silence_duration_ms: v } })}/>
        <Switch label="Autoriser à couper la parole"
          checked={settings.realtimeTurnDetection.interrupt_response}
          onCheckedChange={(v) => update({ realtimeTurnDetection: { ...settings.realtimeTurnDetection, interrupt_response: v } })}/>
      </fieldset>

      <fieldset className="space-y-2">
        <legend>Outils</legend>
        <Switch label="Bible MCP" checked={settings.realtimeTools.bible} onCheckedChange={(v) => update({ realtimeTools: { ...settings.realtimeTools, bible: v } })}/>
        <Switch label="Writing Tools MCP" checked={settings.realtimeTools.writingTools} onCheckedChange={(v) => update({ realtimeTools: { ...settings.realtimeTools, writingTools: v } })}/>
        <Switch label="Web Search" checked={settings.realtimeTools.webSearch} onCheckedChange={(v) => update({ realtimeTools: { ...settings.realtimeTools, webSearch: v } })}/>
      </fieldset>
    </section>
  );
}
```

- [ ] **Step 3: Ajouter onglet/section dans `settings.tsx`**

Dépendant du layout actuel — ajouter `<AudioLiveSection />` dans la page Settings.

- [ ] **Step 4: PASS tests + Commit**

```bash
git commit -am "feat(web): Settings > Audio Live (voix, VAD, timeouts, tools)"
```

---

## Phase 9 — Chat integration (bouton mic, transcripts optimistes)

### Task 9.1 : Bouton mic dans `chat-input.tsx`

**Files:**
- Modify: `packages/web/src/components/chat/chat-input.tsx`

- [ ] **Step 1: Ajouter un bouton `<Mic />` à gauche du bouton Envoyer**

Si `state === 'idle'` → onClick appelle `start()` avec la config settings. Si `state !== 'idle'` → onClick appelle `stop()`. Affiche en amber si actif.

- [ ] **Step 2: Test snapshot + clic**

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(web): bouton mic dans chat-input"
```

### Task 9.2 : Inject messages voice optimiste

**Files:**
- Modify: `packages/web/src/components/chat/chat-stream.tsx`

- [ ] **Step 1: Souscrire aux events `transcript` du `RealtimeClient`** via le hook (on expose un callback `onTranscript` ou on lit depuis `useRealtimeStore` un buffer récent).

- [ ] **Step 2: Insérer les messages avec `source='voice'`** dans le flux React (query cache TanStack) avant le POST backend (optimiste).

- [ ] **Step 3: Invalidation + resync après flushTranscript**.

- [ ] **Step 4: Test : mock event → message affiché avec badge "🎙 voix".**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(web): chat-stream inject messages voice optimistes"
```

### Task 9.3 : `write_to_chat` → POST /messages

**Files:**
- Modify: `packages/web/src/hooks/use-realtime-voice.ts`

- [ ] **Step 1: Listener `write_to_chat` event**

```ts
client.addEventListener('write_to_chat', async (e: any) => {
  const { content } = e.detail;
  // POST /api/sessions/:id/messages avec role=assistant, source='voice-injected'
  await fetch(`/api/sessions/${chatSessionId}/messages`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'assistant', content, source: 'voice-injected' }),
  });
  // refresh query
});
```

- [ ] **Step 2: Vérifier que l'endpoint existant accepte le body + `source` optionnel.** Si non, étendre `sessions.ts` pour persister `source`.

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(web): write_to_chat tool exécution côté client"
```

### Task 9.4 : Switch de session chat → stop Live

**Files:**
- Modify: `packages/web/src/routes/index.tsx`

- [ ] **Step 1: `useEffect` sur `sessionId` qui appelle `stop()` si `state !== 'idle'` et qu'on quitte la session liée.**

- [ ] **Step 2: Test manuel** (noter dans checklist).

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(web): stop Live sur switch de session chat"
```

---

## Phase 10 — E2E + docs + polish

### Task 10.1 : E2E Playwright

**Files:**
- Create: `packages/web/tests/e2e/realtime-voice.spec.ts`

- [ ] **Step 1: Scénario**

1. Login dev (E2E=1).
2. Ouvrir une session chat.
3. Stub `window.RTCPeerConnection` via `page.addInitScript` (même pattern que le setup vitest).
4. Stub `navigator.mediaDevices.getUserMedia`.
5. Intercepter `POST /api/realtime/session` (MSW ou route handler Playwright) → retourner un fake sessionConfig.
6. Intercepter `POST api.openai.com/v1/realtime` → répondre SDP stub.
7. Clic sur le bouton mic du chat.
8. Vérifier apparition du notch (`role=status`).
9. Simuler un event `session.created` + `response.audio_transcript.done` via le DataChannel stub.
10. Vérifier que le message `voice` apparaît dans le chat.
11. Clic sur close → notch disparaît.

- [ ] **Step 2: Run**

```bash
pnpm --filter @buck/web test:e2e -- realtime-voice
```

- [ ] **Step 3: Commit**

```bash
git commit -am "test(e2e): realtime voice flow"
```

### Task 10.2 : Docs `.env.example` + README milestone

**Files:**
- Modify: `.env.example`, `CLAUDE.md`, `README.md` (éventuel)

- [ ] **Step 1: Ajouter section M8 dans `CLAUDE.md`** dans la liste Milestones.

- [ ] **Step 2: `.env.example`** — compléter commentaires.

- [ ] **Step 3: Commit**

```bash
git commit -am "docs(m8): milestone Realtime voice dans CLAUDE.md"
```

### Task 10.3 : Checklist manuelle — exécuter et cocher

- [ ] Activer `REALTIME_ENABLED=1`, relancer API.
- [ ] Settings > Audio Live visible, badge permission = "rechecker" au premier load, accepter le prompt Chrome.
- [ ] Bouton mic du chat → notch apparaît en haut, greeting vocal coral, FR.
- [ ] "Résume la session en cours" → résumé correct (contexte OK).
- [ ] Interruption vocale → l'IA s'arrête ≤ 200 ms.
- [ ] "Cherche sur le web la dernière release de Tailwind" → résultat transcrit dans le chat.
- [ ] "Note dans la Bible que Buck est brun" → MCP call sans demande d'approval.
- [ ] Cmd+Shift+L ouvre/ferme la session.
- [ ] Silence 30s → notch se ferme + toast "silence".
- [ ] Attendre 20min → toast warning. 25min → close auto.
- [ ] Switch de session → Live se ferme.
- [ ] `SELECT * FROM usage_events WHERE kind='realtime'` renvoie les lignes avec audio_*_seconds cohérents.
- [ ] Settings > Budget affiche breakdown chat/realtime.

- [ ] **Commit final**

```bash
git commit --allow-empty -m "chore(m8): manuel OK, release candidate"
```

---

## Self-review checklist (faite)

- [x] Spec section 3 (WebRTC + client_secret) → Task 3.1 + 6.1
- [x] Spec 4.1 (shared voice + pricing) → Phase 1
- [x] Spec 4.2 (API routes + GC + flag) → Phase 4
- [x] Spec 4.3 (web notch, waveform, hook, hotkey, settings) → Phases 7, 8
- [x] Spec 4.4 (LIVE.md + SYSTEM FR) → Task 2.2
- [x] Spec 5 (flow détaillé) → distribué phases 4, 6
- [x] Spec 7 (tests unitaires + E2E + manuel) → Tasks 10.*
- [x] Spec 8 (sécurité) → budget guard Task 4.1 et 4.2, pas de clé browser, `require_approval:never` forcé Task 3.2
- [x] Spec 12.1 permission micro → Task 8.2
- [x] Spec 12.2 timeouts → Task 6.1 (silence + duration warnings)
- [x] Spec 12.4 budget mid-session → Task 4.2 + Task 6.1 flushUsage error handler
- [x] Spec 12.6 switch session → Task 9.4
- [x] Spec 12.10 DELETE endpoint → Task 4.4
- [x] Spec 12.11 MCP approval never → Task 3.2
- [x] Spec 12.12 aria-live → Task 7.3
- [x] Spec 12.13 mic button = hotkey → Task 9.1 + 7.4
- [x] Spec 12.14 heartbeat via iceConnectionState → Task 6.1

Aucun "TBD" / "à faire" / "similar to Task N" détecté. Signatures cohérentes (`RealtimeClient`, `realtimeApi`, `useRealtimeVoice`, `useRealtimeStore`).

**Plan prêt pour exécution.**
