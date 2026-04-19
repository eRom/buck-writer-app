# M8 — Checklist manuelle (Chrome desktop, Romain)

Pré-requis :
- `.env` : `REALTIME_ENABLED=1`, `OPENAI_API_KEY` valide.
- Rebuild shared + restart api + vite dev.
- `bible-mcp` et `writing-tools-mcp` accessibles (sinon les toggles MCP échoueront silencieusement côté OpenAI, message vocal d'erreur côté IA — acceptable en dev).

## Procédure

1. **Settings > Audio Live visible**
   - [ ] Onglet Paramètres : section "Audio Live" présente entre Budget et bas de page.
   - [ ] Badge permission = "rechecker" au premier chargement si jamais demandé.
   - [ ] Clic "rechecker" → prompt Chrome natif. Accepter → badge passe à "disponible" (vert).

2. **Voix & VAD configurables**
   - [ ] Select affiche les 10 voix, défaut `coral`.
   - [ ] Slider silence timeout = 30s, range [10, 60].
   - [ ] 3 sliders VAD (sensibilité, padding début, durée silence) : modifs persistées (reload page → valeurs conservées).
   - [ ] Toggle "autoriser à couper la parole" actif par défaut.
   - [ ] Toggles Bible / Writing Tools / Web Search : on/off persisté.

3. **Ouverture session Live (bouton mic)**
   - [ ] Sur la page chat, une session sélectionnée, bouton micro visible à gauche du bouton Envoyer.
   - [ ] Clic mic → notch apparaît en haut centré (glassmorphism, rounded-full, ~260px).
   - [ ] IA démarre par un greeting vocal en français, voix `coral`.
   - [ ] Waveform ambre quand écoute, vert-lime quand parle.

4. **Raccourci clavier**
   - [ ] `Cmd+Shift+L` ouvre la session Live si idle.
   - [ ] Même combo quand session active → ferme.

5. **Interactions vocales**
   - [ ] Dire "Résume-moi la session en cours" → réponse orale correcte basée sur l'historique (contexte injecté OK).
   - [ ] Couper la parole pendant qu'elle parle → elle s'arrête sous 200 ms (barge-in).
   - [ ] Dire "cherche sur le web la dernière release de Tailwind CSS" → tool web_search, résultat transcrit dans le chat texte (badge voix).
   - [ ] Dire "écris dans la Bible que Buck est brun" → MCP call sans demande d'approval (flow continu).
   - [ ] Dire "écris dans le chat que je dois penser à..." → l'IA utilise `write_to_chat`, message apparaît dans le chat texte avec `source='voice-injected'`.

6. **Timeouts**
   - [ ] Rester silencieux 30s → session se ferme automatiquement, toast "silence prolongé".
   - [ ] (Optionnel, long test) : après 20 min, toast de warning. Après 25 min, close auto.

7. **Budget**
   - [ ] Settings > Budget affiche un breakdown `chat` vs `realtime` après une session Live.
   - [ ] Mettre `monthlyCostLimitUsd` à 0.01 + `hardStop=true` → tenter une session Live → le POST `/usage` renvoie 429 très rapidement, session fermée, toast "budget dépassé".

8. **Switch de session**
   - [ ] Live actif → cliquer sur une autre session chat dans la sidebar → Live se ferme automatiquement.

9. **Persistance transcripts**
   - [ ] Après session Live terminée, recharger la page : les messages prononcés apparaissent dans l'historique avec badge `[voix]`.
   - [ ] SQL check : `SELECT id, role, source, length(content_json) FROM messages WHERE source='voice' ORDER BY created_at DESC LIMIT 10;`
   - [ ] SQL check : `SELECT kind, model, audio_input_seconds, audio_output_seconds, cost_usd FROM usage_events WHERE kind='realtime' ORDER BY created_at DESC LIMIT 5;`

10. **Feature flag off**
    - [ ] `REALTIME_ENABLED=0` + restart api → bouton mic toujours présent côté web mais `POST /api/realtime/session` renvoie 404 `{error:{code:'not_enabled'}}`, toast d'erreur côté web.
    - [ ] Pas de casse fonctionnelle du chat texte.

## Notes

- Les tests unitaires (378 total) couvrent la logique côté server + hooks/stores.
- L'intégration WebRTC réelle ne peut être testée qu'en manuel (real mic + OpenAI).
- Si une voix autre que `coral` parle systématiquement anglais malgré le prompt FR, tester en re-basculant sur `coral` (qui semble mieux tenir les instructions de langue).
- Pour debug : onglet Network du devtools, filtrer sur `realtime` — on voit le handshake `/v1/realtime/client_secrets`, puis le POST SDP vers `api.openai.com/v1/realtime`, puis le DataChannel via WebRTC.
