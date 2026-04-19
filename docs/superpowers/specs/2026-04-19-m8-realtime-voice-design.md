# M8 — Mode Live (OpenAI Realtime vocal)

Date : 2026-04-19
Branche cible : `feat/realtime-voice`
Pré-requis : M7 (Responses API + MCP connectors) mergé.
Brief de recherche : voir annexe en fin de doc (extrait Gemini 2026-04-19).

---

## 1. But

Ajouter un mode conversationnel vocal bidirectionnel à Buck Writer, basé sur `gpt-realtime-1.5` (modèle déjà référencé dans `packages/shared/src/pricing/models.ts:6-11`).

Parcours utilisateur :
1. Romain active Audio Live depuis **Paramètres > Audio Live** (toggle master + choix de voix + VAD).
2. Un **notch central en haut de fenêtre** apparaît dès qu'une session live est ouverte. Il contient la waveform audio et un bouton mute / close.
3. Romain clique sur le mic → connexion WebRTC → greeting vocal de l'IA.
4. Dialogue naturel : il parle, l'IA répond en voix, il peut **couper la parole** (barge-in).
5. L'IA peut : lire le contexte de la session courante, interroger/écrire Bible (MCP), chercher sur le web (tool natif), et **écrire des messages dans le chat texte** en parallèle.
6. Les transcripts (in + out) sont persistés dans `messages` avec `role: 'user' | 'assistant'` et un flag `source: 'voice'`.
7. La consommation (audio in/out + tokens texte + tool calls) est loggée dans `usage_events` et débitée du budget mensuel. Kill-switch existant (`hard_stop`) coupe l'ouverture de session si seuil dépassé.

## 2. Non-goals M8

- Multi-langue explicite (on laisse le VAD d'OpenAI détecter).
- Persistance audio (on ne stocke pas les chunks PCM — uniquement les transcripts).
- Mode téléphonique / SIP (hors scope app web perso).
- UI visuelle avancée (3D, oscilloscope temps réel) : waveform basique basée sur `AnalyserNode` suffit.
- Mobile offline / PWA install : session HTTPS online uniquement.
- Mode "push-to-talk" — M8 = VAD serveur uniquement.

## 3. Décision architecturale : WebRTC côté client

**Transport retenu : WebRTC direct browser ↔ OpenAI**, le backend Hono ne fait que frapper `/v1/realtime/client_secrets` pour émettre un **ephemeral client token** (durée ≤ 60 min).

Raisons :
- Latence glass-to-glass < 300 ms (confirmé 2026 docs, cible OpenAI).
- Media streams gérés nativement par le navigateur (pas de proxy audio binaire dans Hono, qui serait coûteux en RAM/CPU et ajouterait latence).
- Le pattern "ephemeral token mint en backend" est le pattern canonique OpenAI pour les apps web (équivalent Stripe `setup_intent` / Twilio capability tokens).

Conséquences :
- **Aucun secret `OPENAI_API_KEY` ne traverse le browser**. Le browser reçoit uniquement un `client_secret.value` de courte durée avec scopes limités.
- Le backend ne voit **pas les chunks audio bruts**, seulement le `usage` final qu'on récupère en fin de session via l'event `response.done` côté client **puis** POST vers `/api/realtime/usage` (côté client donc non fiable) **+** réconciliation secondaire via webhook / API `GET /v1/realtime/sessions/:id` (fallback anti-triche, optionnel M8.1).
- Les tools MCP & web_search sont résolus **côté OpenAI** (via `server_url` + headers) exactement comme en M7 — aucun relais nécessaire côté backend.

Alternative rejetée : WebSocket depuis backend Hono. Simple mais double-hop = +150 ms latence et saturation Node sur audio binaire.

## 4. Impacts transverses

### 4.1 Shared (`@buck/shared`)

**Ajouts :**

```ts
// packages/shared/src/voice/voices.ts (nouveau)
export const REALTIME_VOICES = [
  'cedar', 'marin',          // exclusives Realtime, plus expressives
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse',
] as const;
export type RealtimeVoice = typeof REALTIME_VOICES[number];
export const DEFAULT_VOICE: RealtimeVoice = 'coral';

// packages/shared/src/voice/turn-detection.ts (nouveau)
export type TurnDetectionMode = 'server_vad' | 'semantic_vad' | 'off';
export interface TurnDetectionConfig {
  mode: TurnDetectionMode;
  threshold?: number;          // server_vad : 0..1, défaut 0.5
  prefix_padding_ms?: number;  // défaut 300
  silence_duration_ms?: number;// défaut 700
  eagerness?: 'low' | 'medium' | 'high' | 'auto'; // semantic_vad
}
```

**Modifications :**

```ts
// packages/shared/src/pricing/models.ts
// Ajouter helper dédié Realtime (prix actuels : $32/1M in, $64/1M out, $0.40/1M cached ≈ $0.06/min in, $0.24/min out)
export interface RealtimeUsage {
  audioInputTokens: number;
  audioOutputTokens: number;
  textInputTokens: number;
  textOutputTokens: number;
  cachedInputTokens: number;
}

export function costOfRealtime(u: RealtimeUsage, model: RealtimeModel = 'gpt-realtime-1.5'): number {
  const p = PRICING[model];
  const billable = u.audioInputTokens - u.cachedInputTokens;
  return (
    billable * p.audio_input +
    u.cachedInputTokens * p.audio_input_cached + // voir mise à jour PRICING ci-dessous
    u.audioOutputTokens * p.audio_output +
    u.textInputTokens * p.text_input +
    u.textOutputTokens * p.text_output
  ) / 1_000_000;
}
```

Mettre à jour `PRICING['gpt-realtime-1.5']` pour inclure `audio_input_cached: 0.4`.

### 4.2 API (`@buck/api`)

**Nouveaux fichiers :**

- `src/routes/realtime.ts` (POST `/session`, POST `/usage`, POST `/transcript`)
- `src/lib/realtime.ts` (wrapper `POST /v1/realtime/client_secrets`)
- `src/routes/realtime.test.ts`

**Modifications :**

- `src/app.ts` : monte `/api/realtime/*` (protégé par auth + budget guard avant `/session`).
- `src/middleware/budget-guard.ts` : vérifier que la vérification fonctionne aussi hors chat (on partage la logique).
- `src/db/schema.ts` :
  - Table `messages` → ajouter colonne `source TEXT DEFAULT 'text'` (valeurs : `'text' | 'voice'`).
  - Table `usage_events` : champs `audio_input_seconds` et `audio_output_seconds` existent déjà, on les réutilise. Ajouter un champ `kind TEXT DEFAULT 'chat'` (valeurs : `'chat' | 'realtime'`) pour segmenter.
- `src/routes/usage.ts` : le breakdown par `kind` est retourné dans `/api/usage/current` pour afficher un graphique dans Settings > Budget.

**Endpoints détaillés :**

```http
POST /api/realtime/session
Auth: cookie JWT
Body: {
  sessionId: string,                    // chat_sessions.id existant — on s'y accroche
  voice: RealtimeVoice,
  turnDetection: TurnDetectionConfig,
  tools: { bible: boolean, writingTools: boolean, webSearch: boolean } // toggles issus settings
}
Resp 200: {
  clientSecret: string,                 // ephemeral, expire dans 60min
  expiresAt: number,                    // epoch ms
  realtimeModel: 'gpt-realtime-1.5',
  sessionConfig: RealtimeSessionUpdatePayload   // blob session.update à envoyer côté client
}
Resp 402: { error: { code: 'budget_exceeded', ... } }  // hard_stop actif
```

`sessionConfig` est pré-construit côté serveur pour injecter :
- **instructions** : concat `systems/SYSTEM.md` + `systems/RULES.md` + snapshot des 20 derniers messages de `sessionId` (format "[user|assistant]: <text>") + date courante. Injecté dans `session.instructions` (équivalent top-level `instructions` de Responses).
- **tools** : `[{type:'mcp', ...bible}, {type:'mcp', ...writingTools}, {type:'web_search'}]` — exactement `buildMcpConnectorTools()` filtré par les toggles + le web_search natif Realtime.
- **voice**, **input_audio_transcription: { model: 'gpt-4o-transcribe' }**, **turn_detection**, **modalities: ['audio','text']**.

Le client POST ce `sessionConfig` au serveur OpenAI via un event `session.update` juste après handshake.

```http
POST /api/realtime/transcript
Auth: cookie JWT
Body: {
  sessionId: string,
  realtimeSessionId: string,   // reçu sur l'event session.created
  items: Array<{
    role: 'user' | 'assistant',
    text: string,
    startedAt: number,         // epoch ms
    endedAt: number,
    source: 'voice'
  }>
}
Resp 200: { inserted: number }
```

Appelé par batch côté client toutes les 2 s (debounce) ou à la fermeture. Persiste dans `messages` avec `source='voice'`. Idempotence : dédupliquer sur (sessionId, startedAt, role).

```http
POST /api/realtime/usage
Auth: cookie JWT
Body: {
  sessionId: string,
  realtimeSessionId: string,
  audioInputTokens: number,
  audioOutputTokens: number,
  cachedInputTokens: number,
  textInputTokens: number,
  textOutputTokens: number,
  audioInputSeconds: number,
  audioOutputSeconds: number,
  toolCalls: Array<{ name: string, ms: number }>   // informatif
}
Resp 200: { costUsd: number, budgetRemaining: number }
```

Appelé à la fermeture ou à chaque `response.done` (agrégat cumulatif). Le serveur **ignore toute tentative de baisser un compteur** (monotone croissant par realtimeSessionId, stocké en mémoire ou colonne temporaire). Insert un `usage_events` avec `kind='realtime'` quand la session se ferme définitivement.

### 4.3 Web (`@buck/web`)

**Nouveaux fichiers :**

- `src/stores/realtime-store.ts` — Zustand : état (`idle | connecting | listening | speaking | error`), voice, turnDetection, toggles tools, sessionId lié, erreur.
- `src/lib/realtime-client.ts` — classe `RealtimeClient` qui encapsule RTCPeerConnection, DataChannel, local MediaStream, gestion des events, émetteur d'events custom (EventTarget).
- `src/components/live/notch.tsx` — composant positionné `fixed top-2 left-1/2 -translate-x-1/2`, largeur ~ 240 px, hauteur 44 px, rounded-full, arrière-plan glassmorphism stone-900/80, affiche waveform + bouton mute + bouton close. Apparaît/disparaît via `AnimatePresence`.
- `src/components/live/waveform.tsx` — canvas 2D, lit `AnalyserNode.getByteTimeDomainData`, rendu 32 barres animées selon état :
  - `listening` : barres amber (couleur brand).
  - `speaking` : barres sage.
  - `connecting` : pulse loader.
- `src/components/settings/audio-live-section.tsx` — panneau Paramètres :
  - Toggle "Activer Audio Live"
  - Select voix (10 entrées, défaut **coral**, fallback : juste le nom affiché en M8 — samples MP3 backlog).
  - **3 sliders de détection de silence** (pattern voice-agent) :
    - Sensibilité détection (threshold 0..1, défaut 0.5)
    - Padding début (prefix_padding_ms, défaut 500)
    - Durée de silence (silence_duration_ms, défaut 500)
  - Toggle "Autoriser à couper la parole" (interrupt_response, défaut on)
  - Toggles MCP (Bible / Writing Tools) et Web Search pour Audio Live spécifiquement (indépendants du chat texte).
- `src/hooks/use-realtime-hotkey.ts` — binding global `Cmd+Shift+L` (ou `Ctrl+Shift+L`) pour toggle la session Live. Utilise `react-hotkeys-hook` (à ajouter si pas déjà présent).
- `src/hooks/use-realtime-voice.ts` — hook React qui lit le store, instancie `RealtimeClient`, expose `{ start, stop, toggleMute, state, transcript }`.
- Tests : `live/waveform.test.tsx`, `realtime-store.test.ts`, `lib/realtime-client.test.ts` (mock RTCPeerConnection via `vitest-environment-jsdom` + stubs).

**Modifications :**

- `src/routes/__root.tsx` : monte `<Notch />` au root (toujours visible dès que store `state !== 'idle'`).
- `src/components/chat/chat-stream.tsx` : bouton mic dans la toolbar (à côté du bouton envoyer), ouvre la session live liée à la session courante. Écoute les events du `RealtimeClient` via hook pour injecter les messages `source='voice'` dans le flux affiché (optimistic insert).
- `src/components/settings/index.tsx` (si existe, sinon adapter `settings.tsx`) : ajoute un onglet "Audio Live".
- `packages/web/src/index.css` : variables additionnelles pour couleur "voice-listen" (amber) et "voice-speak" (sage).

### 4.4 Prompts live-editable

Ajouter `systems/LIVE.md` (bootstrap depuis `packages/api/src/defaults/systems/LIVE.md`) : prompt système additionnel pour le mode vocal (style oral, phrases plus courtes, demande clarification si bruit/mot inaudible). Concaténé à SYSTEM.md + RULES.md quand on mint une session Realtime.

Hot-reload chokidar existant le récupère.

### 4.5 Docker / Caddy

Rien à changer côté container Buck. Caddy laisse passer le WebSocket upgrade déjà (inutile ici car on est en WebRTC direct OpenAI).

**TURN server** : pas besoin. WebRTC vers `api.openai.com` fonctionne sur STUN public ; OpenAI fournit son propre TURN derrière.

---

## 5. Flow technique détaillé

### 5.1 Ouverture de session

```
Browser                     Hono API                   OpenAI
   |                            |                         |
   | POST /api/realtime/session |                         |
   |--------------------------->|                         |
   |                            | budget_guard check      |
   |                            | POST /v1/realtime/client_secrets
   |                            |------------------------>|
   |                            |<------------------------|
   |                            | { client_secret, expires_at }
   |<---------------------------|                         |
   | { clientSecret, sessionConfig }                      |
   |                                                      |
   | RTCPeerConnection.createOffer()                      |
   | POST https://api.openai.com/v1/realtime?model=...     |
   |   Header: Authorization: Bearer <clientSecret>       |
   |   Body: SDP offer                                    |
   |----------------------------------------------------->|
   |<-----------------------------------------------------|
   | SDP answer                                           |
   |                                                      |
   | DataChannel 'oai-events' ouvert                      |
   |                                                      |
   | send({type:'session.update', session: sessionConfig})|
   |----------------------------------------------------->|
   |                                                      |
   | getUserMedia({audio:true}) → addTrack(stream, pc)    |
   | MediaStream local feeds OpenAI                       |
   |                                                      |
   | pc.ontrack → <audio> element joue le remote stream   |
```

### 5.2 Barge-in (interruption)

- Quand l'IA parle (`response.audio.delta` actifs), la VAD serveur détecte que l'utilisateur commence à parler (`input_audio_buffer.speech_started`).
- OpenAI envoie `response.cancelled` + `conversation.item.truncate`.
- Côté client : on doit **arrêter immédiatement la playback de `<audio>`** et vider le buffer pour éviter de continuer à entendre l'IA 1 s après.
- Pattern : utiliser `MediaStreamTrack.stop()` sur le remote track est trop brutal ; mieux vaut piper le remote stream dans un `MediaStreamAudioDestinationNode` → `<audio>` → on coupe le node source à la demande.

### 5.3 Persistance transcript

`gpt-4o-transcribe` émet `conversation.item.input_audio_transcription.completed` pour l'entrée utilisateur. Pour l'assistant, l'event `response.audio_transcript.done` donne le texte synchrone à l'audio.

Côté client, on accumule dans un buffer local, et on POST `/api/realtime/transcript` :
- Toutes les 2 s (debounce), ou
- À chaque `response.done`, ou
- À la fermeture de session (`beforeunload` + `pagehide`).

### 5.4 Écriture dans le chat texte

L'utilisateur peut dire "ajoute-moi ça dans le chat comme plan". On expose un tool **local function** côté session Realtime :

```json
{ "type": "function", "name": "write_to_chat",
  "description": "Écrit un message dans le chat texte de la session courante (visible dans l'UI du chat, persisté).",
  "parameters": { "type":"object", "required":["content"],
    "properties": { "content": { "type":"string" }, "role": { "type":"string", "enum":["assistant"] } }
  } }
```

Quand l'IA appelle ce tool, le DataChannel reçoit `response.function_call_arguments.done` → le client POST `/api/sessions/:id/messages` (endpoint existant) avec le contenu + `source: 'voice-injected'` + renvoie un `conversation.item.create` type `function_call_output` `{ ok: true, message_id }`.

### 5.5 Accès Bible & Web search

- Bible : inclus via `tools: [{ type: 'mcp', server_label: 'bible', ... }]` exactement comme en M7. OpenAI appelle le MCP lui-même (le serveur Bible est déjà exposé publiquement derrière Caddy avec Bearer). `require_approval: 'never'` pour les lectures, `'always'` pour les écritures → OpenAI envoie un `response.mcp_approval_request` qu'on doit intercepter côté client et transformer en demande vocale ("Tu veux que j'écrive ça dans la Bible ?") + appeler le tool `write_to_chat` pour logger visuellement la demande.
- Web search : `tools: [{ type: 'web_search' }]` natif Realtime en 2026. Les résultats sont transcrits comme message assistant classique.

### 5.6 Mesure d'usage

OpenAI émet `response.done` avec `usage: { input_tokens, output_tokens, input_token_details: { text_tokens, audio_tokens, cached_tokens }, output_token_details: { text_tokens, audio_tokens } }`.

On agrège côté client par `realtimeSessionId` et on POST cumulatif à `/api/realtime/usage` à la fermeture. Durées audio calculées : `audio_tokens / 200` pour l'output et `audio_tokens / 50` pour l'input (approximations selon tarifs actuels — le serveur ne s'en sert que pour l'affichage, le coût utilise les tokens bruts).

Kill-switch côté serveur : si `POST /api/realtime/usage` fait dépasser `monthlyCostLimitUsd` et `hardStop=1`, on répond `402` et le client affiche une alerte + ferme la session live immédiatement.

---

## 6. Composant Notch — spécification visuelle

```
┌────────────────────────────────────────────────┐
│  🎤  ▂▃▄▅▆▅▄▃▂▃▄▅▆▅▄▃▂  🔇  ✕          │
└────────────────────────────────────────────────┘
```

- **Position** : `fixed top-2 left-1/2 -translate-x-1/2`, `z-50`.
- **Dimensions** : `h-11 w-[260px] rounded-full`.
- **Fond** : `bg-stone-900/80 backdrop-blur-md border border-stone-800`.
- **Mic icon** (gauche) : `lucide-react/Mic`, état :
  - `idle` : non affiché (notch masqué).
  - `connecting` : pulse amber.
  - `listening` : amber plein.
  - `speaking` : sage plein.
- **Waveform** (centre) : 32 barres, largeur 2 px, gap 2 px, hauteur animée 4-28 px, couleur selon état.
- **Mute** (droite 1) : toggle local muet (ne coupe pas la session, coupe juste `track.enabled`).
- **Close** (droite 2) : ferme la session + POST usage final.

Animation d'entrée : `translateY(-20) → 0` + `opacity(0) → 1` sur 200 ms (Framer Motion, déjà présent dans stack).

---

## 7. Tests

### 7.1 Unitaires

- `packages/shared/src/pricing/models.test.ts` : ajouter cas `costOfRealtime` pour les 4 combinaisons (audio in/out, text in/out, cached).
- `packages/shared/src/voice/voices.test.ts` : liste complète.
- `packages/api/src/routes/realtime.test.ts` :
  - `POST /session` sans auth → 401.
  - avec budget dépassé → 402.
  - nominal → mock `/v1/realtime/client_secrets` + vérifie `sessionConfig.tools` contient les MCP activés uniquement.
  - `POST /usage` monotone : tentative de décrémenter = 400.
  - `POST /transcript` idempotence sur `(sessionId, startedAt)`.
- `packages/api/src/lib/realtime.test.ts` : mock fetch sur OpenAI.
- `packages/web/src/lib/realtime-client.test.ts` : mock RTCPeerConnection, vérifie que `start()` appelle `/session`, crée offer, set remote answer, envoie `session.update` sur DataChannel ouvert.

### 7.2 E2E Playwright

- `tests/e2e/realtime-voice.spec.ts` : scénario mock — stub OpenAI via MSW dans `playwright.config.ts`, simule un handshake WebRTC, vérifie que le notch s'affiche, que le transcript est persisté, qu'un message `source='voice'` apparaît dans le chat.

### 7.3 Manuel

Impossible à scripter complètement (microphone réel). Checklist :
- Activer Audio Live dans Settings, choisir Cedar.
- Cliquer mic dans chat.
- Dire "Résume-moi la session en cours" → IA doit répondre vocalement en ≤ 2 s avec un résumé correct (contexte bien injecté).
- Couper la parole → IA s'arrête ≤ 200 ms.
- Dire "Cherche sur le web la release notes de Tailwind 4.3" → tool web_search s'exécute, résultat transcrit en chat.
- Dire "Écris dans la Bible que Buck est brun" → MCP approval request → IA demande confirmation vocale → oui → tool exécuté.
- Fermer notch → `usage_events` inséré avec `kind='realtime'`, budget mis à jour dans Settings.

---

## 8. Sécurité

1. **Jamais d'API key dans le browser.** Uniquement `client_secret` éphémère, scopé à une session, expirant en 60 min.
2. **Auth** : `/api/realtime/*` protégé par le middleware JWT existant.
3. **Budget** : vérifié **avant** le mint du token + à chaque `POST /usage`.
4. **CSRF** : routes POST protégées par `csrf-middleware` existant (token en header).
5. **Rate limit** : ajouter un bucket "realtime-session-mint" à 10 req/h/user pour éviter l'abus.
6. **Logs** : aucune donnée audio loggée, uniquement texte transcrit + compteurs. Pino en mode `info` sur événements de cycle de vie (`realtime.session.created`, `realtime.session.closed`, `realtime.usage.persisted`).
7. **MCP écritures** : require_approval='always' sur Bible write → l'IA doit demander confirmation vocale explicite. Le tool `write_to_chat` est sans approval mais scopé à la session.

---

## 9. Migration & rollout

1. Migration Drizzle `0008_realtime.sql` : ajoute `messages.source`, `usage_events.kind`.
2. Seed : ajoute `systems/LIVE.md` default.
3. Feature flag `REALTIME_ENABLED=1` en env. Si off, route `/api/realtime/session` renvoie 404 et le bouton mic du chat est masqué.
4. Déployer d'abord en env dev (local), tester vocal manuellement, puis prod VPS Hostinger.
5. Rollback : juste désactiver le flag, aucun impact DB persistent (messages voice restent lisibles comme texte normal).

---

## 10. Risques & questions ouvertes

| Risque | Mitigation |
|---|---|
| Rate limit OpenAI Realtime (tier 5+ requis pour concurrent sessions élevées) | App perso → 1 session concurrente max, on est large. |
| Usage client-side non fiable (dev tools manipulés) | Reconciliation via `GET /v1/realtime/sessions/:id` côté serveur en fin de session (M8.1). Pour M8, on documente le risque mais on fait confiance (app perso mono-user). |
| Latence > 300 ms sur réseau mobile | Afficher indicateur dans notch (RTT depuis `RTCPeerConnection.getStats`). Fallback : bouton "repasser en texte". |
| VAD capte bruit ambiant et déclenche à tort | Threshold configurable + mode push-to-talk en backlog M9. |
| `gpt-4o-transcribe` non dispo pour une voix/langue | Fallback `whisper-1` dans `input_audio_transcription.model`. |
| `cedar` / `marin` disparaissent du catalogue | Liste dans `shared` est la source de vérité, le serveur valide + renvoie 400 si voix invalide. |
| Prompt "contexte session" qui fait exploser le `instructions` | On tronque à 20 derniers messages ET max 4000 tokens (estimation rapide). |
| Bible MCP offline au moment du mint | L'IA reçoit un `mcp_list_tools.failed`, on log mais on n'empêche pas la session — on perd juste l'accès Bible. |

### Décisions tranchées avec Romain (2026-04-19 16:42)

- **Voix par défaut : `coral`** (override Cedar).
- **VAD : oui**, activé par défaut. Pas de push-to-talk (Romain écrit en parallèle, toggler un bouton casse le flow).
- **Raccourci clavier : OUI** en plus du notch. Proposition : `Cmd+Shift+L` (L = Live), bascule ouvrir/fermer la session. Fallback `Ctrl+Shift+L` sur non-Mac. Handler global via `useHotkeys`.
- **Enregistrement audio local : NON**. Créer issue gerber pour version future (tag `buck-writer-app`, titre "Enregistrement audio local des sessions Live — replay/debug").
- **Filtres de silence à 3 niveaux** (inspiré de `trinity-lifeos-agent/voice-agent/src/gemini/client.ts:86-96` et `config.ts:17-24`) : port du pattern Gemini vers OpenAI Realtime. Équivalences :

| Gemini (voice-agent)         | OpenAI Realtime                         | Défaut repris           |
|------------------------------|-----------------------------------------|-------------------------|
| `startOfSpeechSensitivity`   | `turn_detection.threshold` (0..1)       | `HIGH` → `threshold: 0.5` |
| `endOfSpeechSensitivity`     | `turn_detection.silence_duration_ms`    | `HIGH` → `500 ms`         |
| `prefixPaddingMs`            | `turn_detection.prefix_padding_ms`      | `500 ms`                  |
| `silenceDurationMs`          | idem ci-dessus (même champ)             | `500 ms`                  |
| `activityHandling=START_OF_ACTIVITY_INTERRUPTS` | `turn_detection.interrupt_response: true` | `true` (barge-in) |

On expose les 3 filtres dans **Settings > Audio Live** comme l'app voice-agent (3 sliders distincts : "Sensibilité détection", "Padding début", "Durée de silence"). Valeurs stockées dans `userSettings.realtimeTurnDetectionJson`. Exposer aussi le toggle `interruptResponse` comme "Autoriser à couper la parole".

Mode VAD : on part sur `server_vad` pour M8 (cohérent avec Gemini voice-agent). `semantic_vad` reste testable via une option cachée (env `REALTIME_SEMANTIC_VAD=1`).

### Questions restantes (non bloquantes)

- `write_to_chat` : autoriser seulement pour role=assistant (pas d'injection "Romain a dit") → à confirmer mais c'est le défaut safe.
- Voix preview dans Settings : pré-générer 10 samples MP3 offline ou juste afficher le nom ? → défaut : nom seul en M8, samples en backlog.

---

## 12. Décisions cycle de vie session (2026-04-19 17:50)

### 12.1 Permission microphone

- Au premier clic mic (ou raccourci), on appelle `navigator.mediaDevices.getUserMedia({ audio: true })`.
- Le navigateur affiche son prompt natif oui/non.
- Post-réponse, on reflète l'état dans **Settings > Audio Live** avec un badge à côté du toggle master :
  - `disponible` (vert) — permission accordée.
  - `rechecker` (amber, cliquable) — permission refusée ou non encore demandée, au clic on retente `getUserMedia` (re-prompt Chrome si l'utilisateur a reset manuellement, sinon le badge explique "Autoriser le microphone dans les réglages du navigateur").
- Côté notch : si `getUserMedia` échoue au démarrage, on affiche un toast d'erreur et la session ne démarre pas.
- Permission vérifiée via `navigator.permissions.query({ name: 'microphone' })` au mount de Settings pour afficher l'état sans prompter.

### 12.2 Durée & timeouts

**Silence prolongé = fin de session.**

- Détection client : compteur réinitialisé sur tout event `input_audio_buffer.speech_started` ou `response.created`.
- Seuil par défaut **30 secondes** de silence ininterrompu → close session automatique + toast "Session Live fermée (silence)".
- **Paramétrable dans Settings > Audio Live** : slider `silenceTimeoutSeconds` range **10-60**, défaut 30, stocké dans `userSettings.realtimeSilenceTimeoutSec`.

**Durée max session.**

- **À 20 min** : toaster non-bloquant "Session Live en cours depuis 20 min — fermeture automatique dans 5 min".
- **À 25 min** : fermeture automatique + toast "Session Live fermée (durée max)".
- Compteur démarre à `response.created` initial (= première interaction, pas l'ouverture WebRTC).
- Romain peut toujours fermer manuellement via notch ou raccourci avant.

### 12.3 Refresh du client_secret

Le `client_secret` expire à 60 min. La session peut être coupée avant (25 min max, cf 12.2), donc **aucun besoin de refresh**. Si on décidait un jour de lever la limite 25 min, pattern recommandé OpenAI : re-mint un nouveau secret au backend ~5 min avant expiration et envoyer un event `session.update` avec le nouveau token (ou reconnexion transparente). **Hors scope M8.**

### 12.4 Budget dépassé mid-session

- `POST /api/realtime/usage` (appelé par le client à chaque `response.done` cumulatif) compare contre `monthlyCostLimitUsd` si `hardStop=1`.
- Si dépassement → le serveur répond `402 { error: { code: 'budget_exceeded' } }`.
- Le client **coupe immédiatement le DataChannel + les MediaStream** sans attendre la fin de la réponse en cours. Toast rouge "Budget mensuel dépassé, session Live fermée".
- Pas de grâce, pas de warning à 80/90 % côté Realtime (les alertes existantes dans `alertTriggers` restent valables).

### 12.5 Concurrence sessions

Ignoré côté serveur — si Romain ouvre 2 onglets, 2 sessions Realtime en parallèle, chacune facturée. Pas de verrou (app mono-user, pas de risque).

### 12.6 Switch de session chat pendant Live ouvert

**Règle simple : 1 session chat = 1 session live.**

- Si l'utilisateur clique sur une autre session chat dans la sidebar alors qu'une session Live est active → on appelle `RealtimeClient.stop()` avant de naviguer.
- Déclencheur : listener global dans `use-realtime-voice` sur le changement de `sessionId` (via TanStack Router hook ou subscribe Zustand).
- Toast informatif "Session Live fermée (changement de chat)".

### 12.7 Navigateur cible & ICE

- **Cible primaire : Chrome desktop** (ce que Romain utilise). Pas d'effort sur Safari/Firefox en M8.
- Pas d'ICE servers custom — on laisse les défauts de `RTCPeerConnection` (pas de `iceServers` passés au constructeur). OpenAI fait le nécessaire côté serveur.
- Conformité aux best practices OpenAI (docs officielles 2026) pour tout le reste : en cas de doute, on privilégie le pattern de la doc plutôt qu'une optim maison.

### 12.8 Langue & prompt système

- Ajout d'une ligne dans `workspace/systems/SYSTEM.md` :

  ```
  Tu réponds TOUJOURS en français, y compris en mode vocal (Live).
  ```

- Fichier supplémentaire `workspace/systems/LIVE.md` (bootstrap depuis `packages/api/src/defaults/systems/LIVE.md`) concaténé uniquement en mode Live. Contenu initial suggéré :

  ```md
  # Mode Live — instructions vocales

  Tu parles comme dans une vraie conversation : phrases courtes, ton naturel, pas de listes à puces ou de markdown.
  Si tu n'as pas compris un mot (bruit, coupure), demande de répéter en une phrase.
  Ne lis jamais de code ou d'URL à voix haute — écris-les dans le chat texte via l'outil `write_to_chat`.
  Si l'utilisateur te coupe la parole, arrête-toi immédiatement et écoute.
  Tu peux accéder à la Bible (MCP) et au web (web_search) sans demander la permission.
  ```

### 12.9 Modèle OpenAI

`gpt-realtime-1.5` — nom officiel confirmé, correspond à `PRICING['gpt-realtime-1.5']` déjà présent. Constant exportée `REALTIME_MODEL = 'gpt-realtime-1.5'` dans `@buck/shared`.

### 12.10 Fin de session explicite

Nouvel endpoint :

```http
DELETE /api/realtime/session/:realtimeSessionId
Auth: cookie JWT
Resp 200: { closed: true, costUsd: number }
```

- Flush final : insère le `usage_events` avec les cumulateurs reçus via `/usage` (dernière valeur mémorisée côté serveur).
- Appelé par le client en `beforeunload` + en cleanup du hook `use-realtime-voice`.
- Si le client crashe sans appeler DELETE, un GC côté serveur ferme les sessions Realtime "abandonnées" (pas d'update usage depuis > 2 min) via un setInterval — MVP suffit, pas besoin de job externe.

### 12.11 Pas d'approval MCP en mode Live

Override du comportement M7 : tous les serveurs MCP exposés à la session Live ont `require_approval: 'never'` forcé côté backend lors du build de `sessionConfig.tools`, **indépendamment** du `config_json` de `mcp_servers`. Rationale : Romain contrôle ses propres MCP, la friction vocale ("tu veux que j'écrive ?") casse le flow. Documenté dans `routes/realtime.ts` avec un commentaire explicite.

### 12.12 Accessibilité notch

- Composant `<Notch>` : `role="status"` + `aria-live="polite"`.
- Attribut `aria-label` dynamique : `"Live actif — écoute"` / `"Live actif — parole"` / `"Live actif — muet"`.
- Waveform = effet visuel uniquement (`aria-hidden="true"`).

### 12.13 Bouton mic = raccourci

Même comportement : ouvre la session Live avec la **dernière config utilisée** (voix + VAD + toggles MCP/web) stockée dans `userSettings`. Pas de flow différent entre les deux.

### 12.14 Heartbeat DataChannel

- Pas utilisé pour détecter les déconnexions silencieuses (on se repose sur le `silenceTimeoutSec` + l'event `iceConnectionState='disconnected'` du `RTCPeerConnection`).
- Si `iceConnectionState` passe à `disconnected` ou `failed` pendant plus de 5 s → on close et on toaste "Connexion Live perdue".

---

## 13. Récap checklist avant plan

- [x] Voix : coral
- [x] VAD : server_vad + 3 sliders paramétrables
- [x] Raccourci : Cmd+Shift+L
- [x] Pas de push-to-talk
- [x] Pas d'enregistrement audio local (issue gerber créée)
- [x] Permission micro : prompt navigateur + badge Settings
- [x] Timeouts : silence 30s (10-60 paramétrable), session max 25 min, warning 20 min
- [x] Budget dépassé : coupe direct
- [x] Switch session chat : ferme Live
- [x] Concurrence : ignorée
- [x] Chrome only
- [x] Prompt FR dans SYSTEM.md + LIVE.md dédié
- [x] Modèle : gpt-realtime-1.5
- [x] Endpoint DELETE session + GC serveur
- [x] Pas d'approval MCP en Live
- [x] Pas de telemetry client
- [x] Accessibilité notch : aria-live
- [x] Bouton mic = raccourci (même config)
- [x] Heartbeat via iceConnectionState (pas ping custom)

**Spec prête pour le plan.**

---

## 11. Plan de découpage (à dérouler dans le plan M8)

1. **P1** — Shared + schema : voices.ts, pricing helpers, migration `0008`, seed.
2. **P2** — API : `lib/realtime.ts`, `routes/realtime.ts` (`/session` only), tests. Feature flag.
3. **P3** — Web lib : `realtime-client.ts` + store + tests mock WebRTC.
4. **P4** — UI notch + waveform + hook `use-realtime-voice`.
5. **P5** — Intégration chat (bouton mic, transcript insert optimiste, write_to_chat tool local).
6. **P6** — Settings > Audio Live : voix picker, VAD, toggles tools.
7. **P7** — Usage & budget (`POST /usage`, affichage breakdown realtime dans budget-section).
8. **P8** — Prompts live (SYSTEM/RULES/LIVE concat), injection snapshot session.
9. **P9** — MCP approval vocal (interception `mcp_approval_request`, demande vocale, POST mcp_approval_response).
10. **P10** — Tests E2E + manuel + doc.

Estimation : 3 à 4 sessions de travail denses.

---

## Annexe — Brief de recherche (extrait Gemini 2026-04-19)

```
ARCHITECTURE
- Transport recommandé SPA + Backend : WebRTC (DataChannels + MediaStream) via Node/Hono proxy.
- Session lifecycle : POST /v1/realtime/client_secrets côté backend (15-60 min).

VOIX DISPONIBLES (2026) — 10 voix
Cedar, Marin (exclusives Realtime), Alloy, Ash, Ballad, Coral, Echo, Sage, Shimmer, Verse.

TARIFS
- Audio input  : $32 / 1M tokens  (~$0.06/min)
- Audio output : $64 / 1M tokens  (~$0.24/min)
- Cached input : $0.40 / 1M tokens

EVENTS CRITIQUES
session.update, conversation.item.create, input_audio_buffer.append,
response.output_audio.delta, function_call_arguments.done.

TOOLS / MCP / WEB_SEARCH
- MCP Remote : server_url + headers + require_approval natif.
- web_search : tool natif Realtime 2026 (+ piping possible vers /v1/responses).

TRANSCRIPTION + EXPORT
- Modèles : gpt-4o-transcribe (natif Realtime) ou whisper-1.
- Export via /v1/responses (store:true) pour transformer la session en historique texte.

GOTCHAS
- Latence : WebRTC indispensable pour <200 ms glass-to-glass.
- Barge-in : conversation.interrupted, rollback buffer audio local.
- Billing : token-based (100 ms in ≈ 1 token, 50 ms out ≈ 1 token).
- Rate limits : concurrent sessions supprimées Tier 5+.
```
