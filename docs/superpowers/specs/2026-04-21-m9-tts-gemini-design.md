# M9 — TTS Gemini sur chaque message — Design

> **Status** : Specs approuvées, prêtes à implémenter
> **Date** : 2026-04-21
> **Modèle** : `gemini-3.1-flash-tts-preview`
> **Flag** : `TTS_ENABLED`

---

## Objectif

Ajouter sur chaque message (user + assistant) de la conversation Buck un bouton **Play/Stop** à côté du bouton **Copier** qui synthétise vocalement le contenu via **Gemini 3.1 Flash TTS Preview**. L'audio généré est mis en cache côté serveur pour éviter de regénérer le même message au clic suivant.

---

## Choix validés

| Décision | Valeur |
|---|---|
| Modèle | `gemini-3.1-flash-tts-preview` |
| SDK | `@google/genai` (SDK officiel JS) |
| Clé API | `GEMINI_API_KEY` (dans `.env`) |
| UX | Bouton unique toggle ▶︎ ↔ ⏸︎ (aucune barre de lecture) |
| Scope | User **et** assistant |
| Autoplay | Jamais |
| Message trop long | Refus + toast (pas de chunking) |
| `usage_events.kind` | `'tts'` (nouvelle valeur) |
| Rate-limit | 10 req/min/user sur `POST /api/tts/:messageId` |
| Rétention | Indéfinie, cascade delete avec `messages` |
| Budget | Inclus dans `monthlyCostLimitUsd` global |
| Voix par défaut | `TTS_DEFAULT_VOICE` (`Kore` par défaut), override user via `user_settings.ttsDefaultVoice` |
| Cache | `(messageId, voice)` unique — régénère si voix change |
| Langue | Auto-détection par Gemini |
| Prompting | Fichier live-editable `workspace/systems/TTS.md` (style/ton du speaker) |

---

## Format audio — critique

Gemini Flash TTS renvoie **du PCM brut** :
- **Encoding** : 16-bit signed little-endian
- **Sample rate** : 24 000 Hz
- **Channels** : 1 (mono)
- **Transport** : base64 dans `response.candidates[0].content.parts[0].inlineData.data`

**Conséquence** : on **ne peut pas** lire le blob directement dans un `<audio>`. On doit **wrapper en WAV** (header 44 octets) avant stockage. C'est trivial (zéro dep) et le navigateur lit le WAV nativement.

Taille : 24000 × 2 × 1 = 48 KB/s → **~3 MB/min d'audio**. Acceptable pour Buck (messages de conversation, pas long-form).

---

## Voix disponibles (30)

Voir `packages/shared/src/tts/voices.ts`. Chaque voix a un `name` et une `character` (descriptif court).

```
Zephyr (Bright), Puck (Upbeat), Charon (Informative), Kore (Firm),
Fenrir (Excitable), Leda (Youthful), Orus (Firm), Aoede (Breezy),
Callirrhoe (Easy-going), Autonoe (Bright), Enceladus (Breathy),
Iapetus (Clear), Umbriel (Easy-going), Algieba (Smooth),
Despina (Smooth), Erinome (Clear), Algenib (Gravelly),
Rasalgethi (Informative), Laomedeia (Upbeat), Achernar (Soft),
Alnilam (Firm), Schedar (Even), Gacrux (Mature), Pulcherrima (Forward),
Achird (Friendly), Zubenelgenubi (Casual), Vindemiatrix (Gentle),
Sadachbia (Lively), Sadaltager (Knowledgeable), Sulafat (Warm)
```

Défaut : **Kore** (Firm) — neutre, convient aux messages techniques de Buck.

---

## Flux utilisateur

1. Hover sur un message → bouton **▶︎** apparaît à côté de **Copier** (même comportement `opacity-0 group-hover:opacity-100`).
2. Clic **▶︎** → état **loading** (spinner) → requête `POST /api/tts/:messageId`.
3. Réponse reçue → état **playing** (⏸︎), audio démarre via `<audio>` HTML natif.
4. Clic **⏸︎** pendant lecture → stop + reset à **▶︎**.
5. Fin naturelle de la lecture → retour **▶︎** (peut rejouer depuis cache navigateur).
6. Démarrer la lecture d'un autre message → **stoppe** automatiquement la lecture en cours (singleton).
7. Second clic **▶︎** sur même message → `POST /api/tts/:messageId` renvoie `cached: true`, **aucune génération Gemini**, audio sert depuis le disque local.

### Gestion d'erreurs

| Erreur | UX |
|---|---|
| Message > `TTS_MAX_CHARS` | Toast rouge : "Message trop long pour la synthèse ({N} / {MAX} caractères)" |
| 429 rate-limit | Toast jaune : "Trop de requêtes TTS, attendre quelques secondes" |
| 500 Gemini (text token bug) | **Retry automatique 1×** côté serveur. Si second échec → toast rouge "TTS indisponible, réessayer plus tard" |
| Budget dépassé | Toast rouge : "Budget TTS atteint" (réutilise le budget guard existant) |
| Audio corrompu | Log côté serveur + toast rouge |

---

## Architecture backend

### Route

```
POST /api/tts/:messageId
  → authGuard + budgetGuard + ttsRateLimiter
  → lookup tts_audio_cache WHERE (messageId, voice)
    → hit? INSERT usage_events (cached=true, costUsd=0) → return { url, cached: true, durationSec }
    → miss?
       → load message.contentJson (ownership check via session.userId)
       → extract plaintext, length check
       → call Gemini generateContent(model, text, voice, systemPrompt=TTS.md)
       → wrap PCM → WAV
       → write .tts_audio/{userId}/{messageId}_{voice}.wav
       → INSERT tts_audio_cache
       → INSERT usage_events (kind='tts', inputTokens, outputAudioSec, costUsd)
       → return { url, cached: false, durationSec, costUsd }

GET /api/tts/:messageId/audio?voice=XXX
  → authGuard
  → lookup tts_audio_cache, verify ownership
  → read WAV from disk, stream with Cache-Control: private, max-age=86400
  → Content-Type: audio/wav

DELETE /api/tts/:messageId  (optionnel, debug/admin)
  → authGuard + ownership
  → remove row + file
```

### Réponse `POST`

```json
{
  "url": "/api/tts/abc123def/audio?voice=Kore",
  "voice": "Kore",
  "durationSec": 12.4,
  "cached": false,
  "costUsd": 0.0023
}
```

### Réponse `GET /audio`

- `200` : `audio/wav` en body, `Cache-Control: private, max-age=86400`
- `404` : pas encore généré (client doit appeler POST d'abord)

---

## Schéma DB

### Nouvelle table `tts_audio_cache`

```ts
export const ttsAudioCache = sqliteTable('tts_audio_cache', {
  id: text('id').primaryKey(),                       // uuid
  messageId: text('message_id').notNull()
    .references(() => messages.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  voice: text('voice').notNull(),                    // ex: 'Kore'
  model: text('model').notNull(),                    // 'gemini-3.1-flash-tts-preview'
  audioPath: text('audio_path').notNull(),           // relatif à WORKSPACE_DIR
  mimeType: text('mime_type').notNull().default('audio/wav'),
  sizeBytes: integer('size_bytes').notNull(),
  durationSec: real('duration_sec'),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  uniqMsgVoice: uniqueIndex('tts_unique_msg_voice').on(t.messageId, t.voice),
  byUser: index('tts_by_user').on(t.userId),
}));
```

### Migration `packages/api/src/db/schema.ts` — `user_settings`

Ajout :
```ts
ttsDefaultVoice: text('tts_default_voice'),  // null = fallback TTS_DEFAULT_VOICE env
```

*(Pas besoin de `ttsAutoplay` — Q7 a dit "jamais".)*

### Migration `usage_events.kind`

Aucune modif SQL — le champ `kind` est un `text` libre, on ajoute juste la valeur `'tts'` dans le code.

### Migration SQL

```sql
-- packages/api/migrations/0011_tts.sql
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

---

## Pricing

Gemini 3.1 Flash TTS Preview (avril 2026) :

| Type | Prix |
|---|---|
| Input (texte) | $0,50 / M tokens |
| Output (audio) | $10,00 / M tokens audio |

### Estimation tokens audio

D'après la doc Gemini, les **tokens audio** sont corrélés à la durée. Règle empirique (à raffiner via logs en prod) :
- **1 seconde d'audio ≈ 32 tokens audio**
- Soit : $10 / (1e6 / 32) = **$0,00032 / sec d'audio**
- Un message moyen de 300 chars ≈ 20 sec d'audio ≈ **$0,0064**

Input texte : pour 300 chars ≈ 75 tokens → $0,0000375 (négligeable vs audio).

### Fichier `packages/shared/src/pricing/tts.ts`

```ts
export const TTS_MODEL = 'gemini-3.1-flash-tts-preview';

export const TTS_PRICING = {
  inputTextPerMTokensUsd: 0.5,
  outputAudioPerMTokensUsd: 10,
} as const;

export const AUDIO_TOKENS_PER_SECOND = 32; // estimation — ajuster si Gemini renvoie un count précis

export function costOfTts(params: {
  inputTextTokens: number;
  outputAudioTokens: number;
}): number {
  const inputUsd = (params.inputTextTokens / 1_000_000) * TTS_PRICING.inputTextPerMTokensUsd;
  const outputUsd = (params.outputAudioTokens / 1_000_000) * TTS_PRICING.outputAudioPerMTokensUsd;
  return inputUsd + outputUsd;
}

export function estimateAudioTokens(durationSec: number): number {
  return Math.ceil(durationSec * AUDIO_TOKENS_PER_SECOND);
}
```

**Note** : si Gemini renvoie un `usageMetadata` avec `audioTokens` ou équivalent (à vérifier dans la response), on l'utilise directement plutôt que l'estimation.

---

## Variables d'environnement

Ajouts dans `.env.example` :
```
# ── TTS (M9) Gemini ─────────────────────────────────────────────
GEMINI_API_KEY=
TTS_ENABLED=1
TTS_DEFAULT_VOICE=Kore
TTS_MAX_CHARS=4500
```

Schéma Zod dans `packages/api/src/env.ts` :
```ts
GEMINI_API_KEY: z.string().min(1).optional(),
TTS_ENABLED: z.coerce.boolean().default(false),
TTS_DEFAULT_VOICE: z.string().default('Kore'),
TTS_MAX_CHARS: z.coerce.number().int().positive().default(4500),
```

Activation effective : `TTS_ENABLED === true && !!GEMINI_API_KEY`. Sinon → bouton masqué côté front, route renvoie `503` côté API.

---

## Prompt système TTS

Fichier bootstrap : `packages/api/src/defaults/systems/TTS.md` (copié au premier boot dans `workspace/systems/TTS.md`, **live-editable** via watcher chokidar comme SYSTEM.md / RULES.md / LIVE.md).

Contenu par défaut :

```md
# TTS — Speech synthesis style guide

Tu es le narrateur vocal de Buck Writer. Lis le texte qui suit de façon
naturelle, calme et claire, avec une diction soignée en français.

Style :
- Ton posé, proche d'un narrateur de podcast littéraire
- Pauses naturelles aux virgules et points
- Pas d'emphase artificielle — lecture sobre
- Nombres et dates lus en toutes lettres
- Blocs de code : lis uniquement le texte environnant, pas le code

Pacing : naturel, ni pressé ni trop lent.
```

Envoyé en tant que **`systemInstruction`** dans la requête Gemini, suivi du texte du message en tant que `contents[0].parts[0].text`.

Ce prompt est facultatif pour l'API Gemini (comportement par défaut acceptable), mais il permet de customiser le style sans changer de code.

---

## Intégration SDK `@google/genai`

```ts
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const response = await ai.models.generateContent({
  model: 'gemini-3.1-flash-tts-preview',
  contents: [{ parts: [{ text: messageText }] }],
  config: {
    systemInstruction: ttsSystemPrompt,  // depuis TTS.md
    responseModalities: ['AUDIO'],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: voice },
      },
    },
  },
});

const base64Pcm = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
if (!base64Pcm) throw new HttpError(502, 'TTS_NO_AUDIO', 'Gemini returned no audio');

const pcmBuffer = Buffer.from(base64Pcm, 'base64');
const wavBuffer = wrapPcmToWav(pcmBuffer, { sampleRate: 24000, bitsPerSample: 16, channels: 1 });
const durationSec = pcmBuffer.length / (24000 * 2); // 24kHz × 2 bytes
```

### Wrapper WAV (pur Node, zéro dep)

```ts
// packages/api/src/services/tts/wav-encoder.ts
export function wrapPcmToWav(pcm: Buffer, opts: {
  sampleRate: number; bitsPerSample: number; channels: number;
}): Buffer {
  const { sampleRate, bitsPerSample, channels } = opts;
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  const dataSize = pcm.length;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);                  // chunk size
  header.writeUInt16LE(1, 20);                   // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}
```

### Retry policy

```ts
async function synthesizeWithRetry(params: SynthesizeParams): Promise<SynthesisResult> {
  try {
    return await synthesize(params);
  } catch (err) {
    if (isGeminiTransient500(err)) {
      logger.warn({ messageId: params.messageId }, 'TTS Gemini 500, retrying once');
      return await synthesize(params);
    }
    throw err;
  }
}
```

---

## Extraction du plaintext depuis un message

`messages.contentJson` est une sérialisation JSON de l'array de `parts` (format OpenAI Responses API). Pour TTS, on récupère uniquement les `parts` de type `text` et on concatène :

```ts
function messageToPlaintext(contentJson: string): string {
  const parts = JSON.parse(contentJson) as Array<{ type: string; text?: string }>;
  return parts
    .filter((p) => p.type === 'text' || p.type === 'input_text' || p.type === 'output_text')
    .map((p) => p.text ?? '')
    .join('\n')
    .trim();
}
```

Tool calls, attachments, images → ignorés. Messages 100% outils → plaintext vide → renvoyer `422 TTS_EMPTY_TEXT`.

---

## UX front — composant

### `MessageTtsButton`

```tsx
// packages/web/src/components/chat/message-tts-button.tsx
interface Props { messageId: string; }

export function MessageTtsButton({ messageId }: Props) {
  const { state, toggle } = useTts(messageId);
  // state = 'idle' | 'loading' | 'playing' | 'error'
  return (
    <button
      onClick={toggle}
      aria-label={state === 'playing' ? 'Arrêter la lecture' : 'Lire à voix haute'}
      className="hover-elevate rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
    >
      {state === 'loading' ? <Loader2 className="size-3 animate-spin" />
       : state === 'playing' ? <Pause className="size-3" />
       : <Play className="size-3" />}
    </button>
  );
}
```

### Hook `useTts` + singleton

```ts
// packages/web/src/hooks/use-tts.ts
// Singleton module-level — un seul audio à la fois
let currentAudio: HTMLAudioElement | null = null;
let currentMessageId: string | null = null;
const listeners = new Set<(id: string | null) => void>();

function stopCurrent() {
  currentAudio?.pause();
  currentAudio = null;
  currentMessageId = null;
  listeners.forEach((l) => l(null));
}

export function useTts(messageId: string) {
  const [state, setState] = useState<'idle'|'loading'|'playing'|'error'>('idle');

  useEffect(() => {
    const listener = (activeId: string | null) => {
      if (activeId !== messageId) setState('idle');
    };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, [messageId]);

  const toggle = async () => {
    if (currentMessageId === messageId && currentAudio && !currentAudio.paused) {
      stopCurrent();
      return;
    }
    stopCurrent();
    setState('loading');
    try {
      const res = await fetch(`/api/tts/${messageId}`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error(await extractErrorMessage(res));
      const { url } = await res.json();
      const audio = new Audio(url);
      currentAudio = audio;
      currentMessageId = messageId;
      listeners.forEach((l) => l(messageId));
      audio.onended = () => { stopCurrent(); setState('idle'); };
      audio.onerror = () => { stopCurrent(); setState('error'); };
      await audio.play();
      setState('playing');
    } catch (err) {
      setState('error');
      toast.error(String(err));
      setTimeout(() => setState('idle'), 2000);
    }
  };

  return { state, toggle };
}
```

### Intégration dans `message-user.tsx` et `message-assistant.tsx`

Ajouter `<MessageTtsButton messageId={id} />` juste après le bouton Copier existant. Même classe Tailwind pour l'alignement.

Les deux composants sont déjà hover-reveal via `group-hover:opacity-100` — aucun changement de layout.

### Feature flag côté front

Nouvel endpoint `GET /api/config` (ou enrichir l'existant) → `{ ttsEnabled: boolean }`. Le bouton n'est rendu que si `ttsEnabled === true`.

### Paramètres — section Voix

Dans `packages/web/src/routes/settings.tsx` (onglet Voix existant — partagé avec Realtime M8), ajouter une section **TTS** :
- Select `voice_name` parmi les 30 voix (affiche `Name — Character`)
- Bouton "Tester" qui joue un sample ("Bonjour, je lis un texte de test.") via `/api/tts/__test__` (endpoint dédié avec texte court hardcodé, pas de cache)

---

## Rate-limit

Pattern existant dans le projet : `packages/api/src/middleware/rate-limit.ts` (déjà utilisé pour auth).

Instance dédiée pour TTS : 10 requêtes/min/user sur `POST /api/tts/:messageId`. Key = `userId`. Réponse 429 avec `Retry-After`.

Le `GET /audio` **n'est pas rate-limité** — c'est du serving de fichier cached.

---

## Sécurité

- Ownership systématique : `message.sessionId` → `session.userId === currentUserId`. Sinon 404 (pas 403, pour ne pas leak l'existence).
- Path traversal : le nom de fichier est `{messageId}_{voice}.wav`, où `messageId` est un uuid contrôlé et `voice` vient d'une whitelist stricte (30 noms). Pas d'input utilisateur dans le path.
- `voice` param validé contre `VOICES` whitelist avant toute écriture/lecture disque.
- `TTS_MAX_CHARS` : hard cap avant appel Gemini pour éviter abuse.
- Budget guard appliqué **avant** l'appel Gemini, comme pour OpenAI.

---

## Observabilité

- Log Pino sur chaque synthèse : `{ msg: 'tts synthesize', messageId, voice, chars, durationSec, costUsd, cached, elapsedMs }`.
- Métrique : `usage_events` avec `kind='tts'` est automatiquement agrégée par `/api/usage` (cf. `packages/api/src/routes/usage.ts`).
- Affichage page Settings > Usage : ligne dédiée "TTS (Gemini)" avec coût cumulé du mois.

---

## Tests

### Unitaires (Vitest)
- `wrapPcmToWav` : header correct (RIFF/WAVE/fmt/data, tailles, endianness).
- `messageToPlaintext` : filtre tool_calls, concatène text parts, trim.
- `costOfTts` + `estimateAudioTokens`.
- Service Gemini avec mock fetch : OK, 500 retry, 500 second fail.
- Rate-limiter : 11ᵉ requête → 429.

### Intégration (Vitest + SQLite in-memory)
- `POST /api/tts/:messageId` : génère, insère cache + usage_event, renvoie url.
- `POST` 2ᵉ fois : `cached: true`, **pas** d'usage_event nouveau avec coût.
- `POST` avec voix différente : nouvelle ligne cache (même message, 2 voix).
- `GET /api/tts/:messageId/audio` : stream WAV, 200.
- Ownership cross-user : 404.
- Budget dépassé : 402.
- Message > MAX_CHARS : 413.
- Message vide (tool-only) : 422.

### E2E (Playwright)
- Mock `/api/tts/*` pour éviter appels Gemini réels.
- Hover message → bouton Play visible.
- Clic Play → spinner → Pause visible.
- Clic Pause → Play revient.
- Clic sur un autre message pendant lecture → premier stoppé, second démarre.
- Reclic même message après fin → **0 appel** au POST (vérifié via `route.fulfill` count).

---

## Rollout

1. Déployer avec `TTS_ENABLED=0` par défaut en prod → bouton masqué partout.
2. Ajouter `GEMINI_API_KEY` dans secrets VPS.
3. Flip `TTS_ENABLED=1`.
4. Monitoring coût via `/api/usage` quelques jours.

---

## Hors scope (V2+)

- Vitesse de lecture variable (slow/fast)
- Téléchargement WAV/MP3
- Conversion MP3 à la volée (libmp3lame — économie disque ~10×)
- Multi-speaker (deux voix pour user/assistant)
- Prompt audio tags `[excited]` injectables par l'utilisateur
- Purge auto > 30j
- Surlignage mot-par-mot pendant la lecture (nécessite timestamps, pas supportés par Flash TTS Preview)
