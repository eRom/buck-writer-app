# M9 — TTS Gemini sur chaque message — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL : Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Ajouter à Buck un bouton Play/Stop sur chaque message qui synthétise vocalement le texte via Gemini 3.1 Flash TTS Preview, avec cache serveur par `(messageId, voice)`, stockage WAV sur disque, usage tracking `kind='tts'` et 30 voix configurables.

**Architecture :** Backend Hono expose `POST /api/tts/:messageId` (génération ou cache-hit) et `GET /api/tts/:messageId/audio` (stream WAV). Service `@google/genai` appelle `gemini-3.1-flash-tts-preview` qui renvoie du PCM 24kHz/16-bit/mono en base64. On wrappe en WAV (44-byte header, zéro dep), on écrit dans `.tts_audio/{userId}/{messageId}_{voice}.wav`, on insère une ligne dans `tts_audio_cache` + `usage_events`. Front : composant `MessageTtsButton` à côté du bouton Copier, singleton audio module-level (un seul message lu à la fois), hook `useTts(messageId)` avec state machine `idle|loading|playing|error`.

**Tech Stack :** TypeScript ESM, Hono 4, Drizzle + better-sqlite3, `@google/genai` (nouveau), Zod validation, Pino logs. Front React 19 + TanStack Query + Zustand + Lucide (icônes Play/Pause/Loader2). Tests Vitest + Playwright.

**Spec :** `docs/superpowers/specs/2026-04-21-m9-tts-gemini-design.md`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `packages/shared/src/tts/voices.ts` | Liste `TTS_VOICES` (30 voix) + défaut `Kore` + type |
| Create | `packages/shared/src/tts/voices.test.ts` | Tests liste + défaut |
| Create | `packages/shared/src/pricing/tts.ts` | `TTS_MODEL`, `TTS_PRICING`, `costOfTts`, `estimateAudioTokens` |
| Create | `packages/shared/src/pricing/tts.test.ts` | Tests pricing |
| Modify | `packages/shared/src/index.ts` | Re-export `tts/*`, `pricing/tts` |
| Create | `packages/api/migrations/0011_tts.sql` | Table `tts_audio_cache` + col `user_settings.tts_default_voice` |
| Modify | `packages/api/src/db/schema.ts` | Définitions Drizzle `ttsAudioCache` + champ `ttsDefaultVoice` |
| Modify | `packages/api/src/env.ts` | `GEMINI_API_KEY`, `TTS_ENABLED`, `TTS_DEFAULT_VOICE`, `TTS_MAX_CHARS` |
| Modify | `packages/api/src/index.ts` | Thread env vers `buildApp()` |
| Create | `packages/api/src/defaults/systems/TTS.md` | Prompt système TTS (live-editable) |
| Modify | `packages/api/src/db/seed.ts` | Bootstrap `TTS.md` dans workspace |
| Create | `packages/api/src/services/tts/wav-encoder.ts` | `wrapPcmToWav` |
| Create | `packages/api/src/services/tts/wav-encoder.test.ts` | Tests header WAV |
| Create | `packages/api/src/services/tts/plaintext.ts` | `messageToPlaintext(contentJson)` |
| Create | `packages/api/src/services/tts/plaintext.test.ts` | Tests extraction |
| Create | `packages/api/src/services/tts/gemini-client.ts` | Wrapper `@google/genai` + retry policy |
| Create | `packages/api/src/services/tts/gemini-client.test.ts` | Tests mock SDK |
| Create | `packages/api/src/routes/tts.ts` | `POST /:messageId`, `GET /:messageId/audio`, `POST /__test__` |
| Create | `packages/api/src/routes/tts.test.ts` | Tests intégration routes |
| Modify | `packages/api/src/app.ts` | Mount `/api/tts/*` avec authGuard + budget + rate-limit |
| Modify | `packages/api/src/middleware/rate-limit.ts` | Factory `ttsRateLimiter` (10/min/user) |
| Modify | `packages/api/src/routes/settings.ts` | Exposer `ttsDefaultVoice` |
| Modify | `packages/api/src/routes/settings.test.ts` | Tests champs TTS |
| Modify | `packages/api/src/routes/config.ts` | Ajouter `ttsEnabled` au payload public |
| Create | `packages/web/src/hooks/use-tts.ts` | Hook + singleton audio module-level |
| Create | `packages/web/src/hooks/use-tts.test.ts` | Tests state machine + singleton |
| Create | `packages/web/src/components/chat/message-tts-button.tsx` | Bouton toggle Play/Pause |
| Create | `packages/web/src/components/chat/message-tts-button.test.tsx` | Tests rendering + interactions |
| Modify | `packages/web/src/components/chat/message-user.tsx` | Insert `<MessageTtsButton />` |
| Modify | `packages/web/src/components/chat/message-assistant.tsx` | Insert `<MessageTtsButton />` |
| Modify | `packages/web/src/components/settings/voice-section.tsx` | Ajouter select TTS voice + bouton Tester |
| Modify | `packages/web/src/lib/settings.ts` | Types front `ttsDefaultVoice` |
| Modify | `packages/web/src/lib/config.ts` | Lire `ttsEnabled` depuis `/api/config` |
| Create | `packages/web/tests/e2e/tts.spec.ts` | E2E flow Play → Pause → rejoue-from-cache |
| Modify | `.env.example` | Bloc TTS M9 |
| Modify | `CLAUDE.md` | Section Milestones : M9 ajouté |

---

## Phase 1 — Shared : voices + pricing

### Task 1.1 — Voices list

**Files :**
- Create : `packages/shared/src/tts/voices.ts`
- Create : `packages/shared/src/tts/voices.test.ts`

- [ ] **Step 1 : Write the failing test**
```ts
import { describe, it, expect } from 'vitest';
import { TTS_VOICES, isValidVoice, DEFAULT_VOICE } from './voices';

describe('TTS voices', () => {
  it('exposes 30 voices', () => {
    expect(TTS_VOICES).toHaveLength(30);
  });
  it('default is Kore', () => {
    expect(DEFAULT_VOICE).toBe('Kore');
    expect(TTS_VOICES.find((v) => v.name === 'Kore')).toBeDefined();
  });
  it('validates voice names', () => {
    expect(isValidVoice('Kore')).toBe(true);
    expect(isValidVoice('NotAVoice')).toBe(false);
  });
  it('all entries have name + character', () => {
    for (const v of TTS_VOICES) {
      expect(v.name).toMatch(/^[A-Z][a-zA-Z]+$/);
      expect(v.character.length).toBeGreaterThan(2);
    }
  });
});
```
- [ ] **Step 2 : Implement**
```ts
export interface TtsVoice { name: string; character: string; }
export const TTS_VOICES: readonly TtsVoice[] = [
  { name: 'Zephyr', character: 'Bright' },
  { name: 'Puck', character: 'Upbeat' },
  { name: 'Charon', character: 'Informative' },
  { name: 'Kore', character: 'Firm' },
  // ... 30 au total (voir spec)
] as const;
export const DEFAULT_VOICE = 'Kore';
export function isValidVoice(name: string): boolean {
  return TTS_VOICES.some((v) => v.name === name);
}
```
- [ ] **Step 3 : Verify** — `pnpm --filter @buck/shared test voices`

### Task 1.2 — Pricing

**Files :**
- Create : `packages/shared/src/pricing/tts.ts`
- Create : `packages/shared/src/pricing/tts.test.ts`

- [ ] **Step 1 : Write the failing test**
```ts
import { describe, it, expect } from 'vitest';
import { costOfTts, estimateAudioTokens, TTS_MODEL } from './tts';
describe('TTS pricing', () => {
  it('TTS_MODEL constant', () => {
    expect(TTS_MODEL).toBe('gemini-3.1-flash-tts-preview');
  });
  it('costOfTts zero when no tokens', () => {
    expect(costOfTts({ inputTextTokens: 0, outputAudioTokens: 0 })).toBe(0);
  });
  it('costOfTts — input $0.50/M + output $10/M', () => {
    // 1M input + 1M output = 0.50 + 10 = 10.50
    expect(costOfTts({ inputTextTokens: 1_000_000, outputAudioTokens: 1_000_000 }))
      .toBeCloseTo(10.5, 6);
  });
  it('estimateAudioTokens — 1s = 32 tokens', () => {
    expect(estimateAudioTokens(1)).toBe(32);
    expect(estimateAudioTokens(10)).toBe(320);
  });
});
```
- [ ] **Step 2 : Implement** (voir spec §Pricing)
- [ ] **Step 3 : Verify** — `pnpm --filter @buck/shared test tts`

### Task 1.3 — Barrel

- [ ] Modify `packages/shared/src/index.ts` : `export * from './tts/voices'; export * from './pricing/tts';`
- [ ] **Verify** — `pnpm --filter @buck/shared typecheck && pnpm --filter @buck/shared test`

---

## Phase 2 — DB : migration + schema Drizzle

### Task 2.1 — Migration SQL

**Files :**
- Create : `packages/api/migrations/0011_tts.sql`

- [ ] **Step 1 : Write SQL**
```sql
CREATE TABLE tts_audio_cache (
  id TEXT PRIMARY KEY NOT NULL,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  voice TEXT NOT NULL,
  model TEXT NOT NULL,
  audio_path TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'audio/wav',
  size_bytes INTEGER NOT NULL,
  duration_sec REAL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX tts_unique_msg_voice ON tts_audio_cache(message_id, voice);
CREATE INDEX tts_by_user ON tts_audio_cache(user_id);

ALTER TABLE user_settings ADD COLUMN tts_default_voice TEXT;
```
- [ ] **Step 2 : Verify** — `pnpm db:migrate` sur DB vide + `sqlite3 data/buck.db '.schema tts_audio_cache'`

### Task 2.2 — Drizzle schema

**Files :**
- Modify : `packages/api/src/db/schema.ts`

- [ ] **Step 1 : Add table** (voir spec §Schéma DB)
- [ ] **Step 2 : Add col to `userSettings`** : `ttsDefaultVoice: text('tts_default_voice')`
- [ ] **Step 3 : Verify** — `pnpm --filter @buck/api typecheck`

---

## Phase 3 — Env + TTS.md prompt

### Task 3.1 — Env schema

**Files :**
- Modify : `packages/api/src/env.ts`
- Modify : `packages/api/src/index.ts`
- Modify : `.env.example`

- [ ] **Step 1 : Add Zod schema** (voir spec §Variables d'env)
- [ ] **Step 2 : Thread vers `buildApp()` via `AppDeps`** — champs `geminiApiKey`, `ttsEnabled`, `ttsDefaultVoice`, `ttsMaxChars`
- [ ] **Step 3 : `.env.example` bloc M9**
- [ ] **Step 4 : Verify** — `pnpm --filter @buck/api typecheck && pnpm --filter @buck/api dev` démarre sans erreur avec `TTS_ENABLED=0`

### Task 3.2 — Prompt système TTS

**Files :**
- Create : `packages/api/src/defaults/systems/TTS.md` (contenu spec §Prompt système)
- Modify : `packages/api/src/db/seed.ts` — copier `TTS.md` dans `workspace/systems/` au premier boot

- [ ] **Step 1 : Write TTS.md**
- [ ] **Step 2 : Seed bootstrap** (copier pattern existant pour `LIVE.md`)
- [ ] **Step 3 : Verify** — booter, vérifier présence `workspace/systems/TTS.md`

---

## Phase 4 — Services API (WAV, plaintext, Gemini client)

### Task 4.1 — WAV encoder

**Files :**
- Create : `packages/api/src/services/tts/wav-encoder.ts`
- Create : `packages/api/src/services/tts/wav-encoder.test.ts`

- [ ] **Step 1 : Write failing test**
```ts
import { describe, it, expect } from 'vitest';
import { wrapPcmToWav } from './wav-encoder';
describe('wrapPcmToWav', () => {
  it('produces a 44-byte header + PCM data', () => {
    const pcm = Buffer.alloc(100);
    const wav = wrapPcmToWav(pcm, { sampleRate: 24000, bitsPerSample: 16, channels: 1 });
    expect(wav.length).toBe(144);
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.subarray(8, 12).toString()).toBe('WAVE');
    expect(wav.subarray(12, 16).toString()).toBe('fmt ');
    expect(wav.subarray(36, 40).toString()).toBe('data');
    expect(wav.readUInt32LE(4)).toBe(36 + 100);    // RIFF size
    expect(wav.readUInt16LE(22)).toBe(1);          // channels
    expect(wav.readUInt32LE(24)).toBe(24000);      // sample rate
    expect(wav.readUInt16LE(34)).toBe(16);         // bits
  });
});
```
- [ ] **Step 2 : Implement** (spec §Wrapper WAV)
- [ ] **Step 3 : Verify** — `pnpm --filter @buck/api test wav-encoder`

### Task 4.2 — Plaintext extractor

**Files :**
- Create : `packages/api/src/services/tts/plaintext.ts`
- Create : `packages/api/src/services/tts/plaintext.test.ts`

- [ ] **Step 1 : Write failing test** — cas text-only, cas mixte text+tool_call, cas all-tools (→ empty), cas malformed JSON (→ throw).
- [ ] **Step 2 : Implement** — parser robuste qui filtre `type in {text,input_text,output_text}`.
- [ ] **Step 3 : Verify**

### Task 4.3 — Gemini client wrapper

**Files :**
- Create : `packages/api/src/services/tts/gemini-client.ts`
- Create : `packages/api/src/services/tts/gemini-client.test.ts`

**Install :**
- [ ] `pnpm --filter @buck/api add @google/genai`

- [ ] **Step 1 : Write failing test** avec mock du SDK :
  - Génère PCM + retourne `{ wavBuffer, durationSec, inputTextTokens, outputAudioTokens }`.
  - 500 transitoire → retry 1× → succès.
  - 500 × 2 → throw `HttpError(502, 'TTS_GEMINI_FAILED', ...)`.
  - Réponse sans `inlineData.data` → throw `HttpError(502, 'TTS_NO_AUDIO', ...)`.

- [ ] **Step 2 : Implement**
```ts
import { GoogleGenAI } from '@google/genai';
import { wrapPcmToWav } from './wav-encoder';
import { HttpError } from '../../lib/http-error';

export interface SynthesizeParams {
  apiKey: string;
  text: string;
  voice: string;
  systemPrompt?: string;
}
export interface SynthesisResult {
  wavBuffer: Buffer;
  durationSec: number;
  inputTextTokens: number;
  outputAudioTokens: number;
  model: string;
}
export async function synthesize(p: SynthesizeParams): Promise<SynthesisResult> {
  const ai = new GoogleGenAI({ apiKey: p.apiKey });
  const res = await callWithRetry(() => ai.models.generateContent({
    model: 'gemini-3.1-flash-tts-preview',
    contents: [{ parts: [{ text: p.text }] }],
    config: {
      systemInstruction: p.systemPrompt,
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: p.voice } },
      },
    },
  }));
  const base64 = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64) throw new HttpError(502, 'TTS_NO_AUDIO', 'Gemini returned no audio');
  const pcm = Buffer.from(base64, 'base64');
  const wavBuffer = wrapPcmToWav(pcm, { sampleRate: 24000, bitsPerSample: 16, channels: 1 });
  const durationSec = pcm.length / (24000 * 2);
  const usage = res.usageMetadata ?? {};
  return {
    wavBuffer, durationSec,
    inputTextTokens: usage.promptTokenCount ?? 0,
    outputAudioTokens: usage.candidatesTokenCount ?? Math.ceil(durationSec * 32),
    model: 'gemini-3.1-flash-tts-preview',
  };
}
```
- [ ] **Step 3 : Verify**

---

## Phase 5 — Route `/api/tts`

### Task 5.1 — Rate-limiter dédié

**Files :**
- Modify : `packages/api/src/middleware/rate-limit.ts`

- [ ] Exporter `createTtsRateLimiter()` → 10 req / 60s par `userId`. Réutiliser la mémoire LRU existante.
- [ ] Test : 11ᵉ requête → 429 avec `Retry-After`.

### Task 5.2 — Route TTS

**Files :**
- Create : `packages/api/src/routes/tts.ts`
- Create : `packages/api/src/routes/tts.test.ts`

- [ ] **Step 1 : Write failing tests** (spec §Tests intégration)
- [ ] **Step 2 : Implement** `createTtsRoutes(deps)` :
  - `POST /:messageId` :
    1. Validate `voice` via `isValidVoice`.
    2. Resolve voice = `body.voice ?? user.ttsDefaultVoice ?? env.TTS_DEFAULT_VOICE`.
    3. Load message → ownership check via session.
    4. Lookup cache `(messageId, voice)` → hit → return `{ url, cached: true, durationSec }`.
    5. Miss → extract plaintext → length check → call `synthesize` avec `TTS.md` comme systemPrompt.
    6. Write file `.tts_audio/{userId}/{messageId}_{voice}.wav`.
    7. INSERT cache + usage_events.
    8. Return `{ url, cached: false, durationSec, costUsd }`.
  - `GET /:messageId/audio?voice=X` :
    1. Resolve voice (même logique).
    2. Lookup cache → 404 si absent.
    3. Read file, stream avec `Content-Type: audio/wav`, `Cache-Control: private, max-age=86400`.
  - `POST /__test__` :
    1. Synthétise `"Bonjour, je lis un texte de test."` avec voix fournie, sans cache, retourne le WAV directement en body.
- [ ] **Step 3 : Mount dans `app.ts`** :
```ts
if (deps.ttsEnabled && deps.geminiApiKey) {
  app.use('/api/tts/*', authGuard(...));
  app.use('/api/tts/*', budgetGuard(...));
  app.use('/api/tts/:messageId', ttsRateLimiter({...}));
  app.route('/api/tts', createTtsRoutes({...}));
}
```
- [ ] **Step 4 : Verify** — `pnpm --filter @buck/api test tts`

### Task 5.3 — Config + Settings expose

**Files :**
- Modify : `packages/api/src/routes/config.ts` — ajouter `ttsEnabled: deps.ttsEnabled && !!deps.geminiApiKey`
- Modify : `packages/api/src/routes/settings.ts` — GET/PATCH `ttsDefaultVoice` (validation via `isValidVoice`)
- Modify : `packages/api/src/routes/settings.test.ts`

- [ ] Tests round-trip settings.
- [ ] **Verify** — `pnpm --filter @buck/api test`

---

## Phase 6 — Front

### Task 6.1 — Config front

**Files :**
- Modify : `packages/web/src/lib/config.ts`

- [ ] Exposer `useTtsEnabled()` hook qui lit `/api/config`.

### Task 6.2 — Hook `useTts`

**Files :**
- Create : `packages/web/src/hooks/use-tts.ts`
- Create : `packages/web/src/hooks/use-tts.test.ts`

- [ ] **Step 1 : Write failing tests** — transitions idle→loading→playing, singleton (démarrer messageB stoppe messageA), erreur → toast.
- [ ] **Step 2 : Implement** (spec §Hook useTts + singleton)
- [ ] **Step 3 : Verify**

### Task 6.3 — Composant `MessageTtsButton`

**Files :**
- Create : `packages/web/src/components/chat/message-tts-button.tsx`
- Create : `packages/web/src/components/chat/message-tts-button.test.tsx`

- [ ] **Step 1 : Write RTL tests** — rendu Play/Pause/Loader selon state, click appelle `toggle`, aria-label correct, masqué si `!ttsEnabled`.
- [ ] **Step 2 : Implement** (spec §UX front)
- [ ] **Step 3 : Verify**

### Task 6.4 — Intégration dans les 2 composants messages

**Files :**
- Modify : `packages/web/src/components/chat/message-user.tsx`
- Modify : `packages/web/src/components/chat/message-assistant.tsx`

- [ ] Insérer `<MessageTtsButton messageId={id} />` immédiatement après le bouton Copier (même classes Tailwind pour l'espacement).
- [ ] **Verify** — lancer `pnpm dev`, hover sur un message, bouton Play visible, click → synthèse (si `TTS_ENABLED=1` + clé Gemini en `.env`).

### Task 6.5 — Settings — section voix TTS

**Files :**
- Modify : `packages/web/src/components/settings/voice-section.tsx`
- Modify : `packages/web/src/lib/settings.ts`

- [ ] Ajouter un `<Select>` avec les 30 voix (affichage `Name — Character`).
- [ ] Bouton "Tester cette voix" → POST `/api/tts/__test__` → lit le WAV en retour.
- [ ] Persist via PATCH settings.
- [ ] **Verify** — changer de voix, tester, sauvegarder, recharger.

---

## Phase 7 — E2E

### Task 7.1 — Playwright spec

**Files :**
- Create : `packages/web/tests/e2e/tts.spec.ts`

- [ ] **Scénario 1 : flow nominal avec mocks**
  - Mock `/api/tts/m1` → renvoie `{ url: '/fake/audio.wav', cached: false, durationSec: 5 }`.
  - Mock `/fake/audio.wav` → petit WAV de test (silence 100ms, généré en fixture).
  - Hover message m1 → bouton Play apparaît.
  - Click → spinner → Pause visible.
  - Click Pause → Play revient.

- [ ] **Scénario 2 : cache rejouable**
  - Compter les POST `/api/tts/m1` : après 2 clics successifs avec onended entre, 2 POSTs, mais le second retourne `cached: true`.

- [ ] **Scénario 3 : singleton**
  - Click m1 → lecture → click m2 → m1 stoppé (pause shown sur m2, play sur m1).

- [ ] **Verify** — `pnpm test:e2e tts.spec.ts`

---

## Phase 8 — Docs + CLAUDE.md

- [ ] Update `CLAUDE.md` — ajouter entrée M9 dans la liste Milestones.
- [ ] Update `.env.example` (si pas déjà fait en phase 3).
- [ ] **Verify final** :
  - `pnpm lint && pnpm typecheck && pnpm test`
  - `pnpm dev` — tester manuellement le bouton sur un vrai message
  - `pnpm build` — build complet OK

---

## Critères de succès (goal-driven)

- [ ] Bouton visible à côté de Copier sur chaque message quand `TTS_ENABLED=1` + clé Gemini présente.
- [ ] Clic 1 génère l'audio (vérifiable via log Pino + usage_events avec `kind='tts'`).
- [ ] Clic 2 sur le même message **ne fait pas** d'appel Gemini (vérifiable via `cached: true` dans la réponse + pas de nouvelle row usage_events avec coût non-zéro).
- [ ] Changement de voix via Paramètres → génération séparée (row distincte dans `tts_audio_cache`).
- [ ] Message > 4500 chars → toast erreur, pas d'appel Gemini.
- [ ] Budget atteint → toast erreur, route renvoie 402.
- [ ] 11 clics successifs en <60s → 429 sur le 11ᵉ.
- [ ] Démarrer la lecture d'un 2ᵉ message stoppe le 1ᵉʳ.
- [ ] Page Settings > Usage affiche le coût TTS cumulé du mois.
- [ ] Tests unitaires + intégration + E2E tous verts.

---

## Notes d'exécution

- **Ordre suggéré** : phases 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Les phases 1 et 2 peuvent être parallélisées (shared et migration n'interfèrent pas).
- **Dépendance SDK** : `pnpm --filter @buck/api add @google/genai` — vérifier la version stable au moment du `pnpm install` (elle doit supporter `responseModalities: ['AUDIO']`).
- **Risque** : si Gemini renvoie un `usageMetadata` différent de ce qu'on attend, ajuster `gemini-client.ts` pour mapper correctement `inputTextTokens` et `outputAudioTokens`. Ajouter un log Pino au debug pendant les premiers tests pour capter la vraie shape.
- **Régression potentielle** : M8 Realtime utilise aussi un prompt live-editable — vérifier que l'ajout de `TTS.md` dans le watcher chokidar ne casse pas le hot-reload des autres prompts.
- **Migration** : la col `user_settings.tts_default_voice` est ajoutée nullable → compat ascendante OK, aucune backfill nécessaire.
