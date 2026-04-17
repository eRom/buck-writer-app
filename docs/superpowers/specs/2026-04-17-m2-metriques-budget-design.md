# M2 — Metriques + Hard-Stop Budget

**Date** : 2026-04-17
**Scope** : Dashboard metriques usage, alertes seuils, hard-stop budget, page settings

## Contexte

M1 fournit le chat streaming avec persistance des messages et des `usageEvents` (tokens, cout par message). M2 ajoute le controle budgetaire : l'utilisateur configure une limite mensuelle, recoit des alertes, et le chat est bloque si le budget est atteint (hard stop).

## Decisions cles

- **Budget check cote API uniquement** — middleware Hono avant `POST /api/chat`, pas de polling client
- **Cout = total unique** — somme de tous les `costUsd` sur la periode, pas de ventilation par modele
- **2 alertes fixes** : 80% (toast warning) et 100% (hard stop)
- **Page settings dediee** (`/settings`) — route avec nav laterale, pas de dialog modale
- **Popover user** en sidebar footer pour acceder aux settings et se deconnecter
- **Provider limit** — toast avec lien direct vers le portail OpenAI quand 429 upstream
- **Jour de reset configurable** — calable sur le cycle de facturation OpenAI

## Architecture

```
Sidebar footer (popover user)
  → /settings (page avec nav laterale)
    → /settings/general  : modele par defaut, reasoning effort
    → /settings/budget   : limite, progress bar, jour reset, hard stop, alertes
    → /settings/account  : email, date inscription

POST /api/chat
  → budget-guard middleware (check limite avant stream)
  → streamText() + onFinish (insert alertTriggers si seuil franchi)
  → 429 budget_exceeded si 100% atteint
  → 502 provider_rate_limit si 429 OpenAI upstream

Client (apres chaque reponse)
  → GET /api/usage/current (dans onFinish cote useChat)
  → si alerts[].triggeredAt vient de changer → toast warning
```

### Flux hard stop

1. User envoie un message
2. Middleware `budget-guard` calcule `SUM(costUsd)` sur la periode courante
3. Si total >= limite ET hardStop=true → 429 `{ error: { code: 'budget_exceeded', usage: { total, limit, resetDate } } }`
4. Client affiche banner rouge + desactive input
5. User va dans `/settings/budget`, augmente la limite
6. `PATCH /api/settings` met a jour → prochain message passe

### Flux alerte 80%

1. `onFinish` dans `POST /api/chat` calcule le nouveau % du budget
2. Si 80% franchi et pas encore triggered ce mois → insert dans `alertTriggers`
3. Client appelle `GET /api/usage/current` dans le `onFinish` de `useChat`
4. Si `alerts[0].triggeredAt` est non-null et recent → toast warning "$16.00 / $20.00 (80%)"

### Flux provider limit

1. `streamText()` recoit un 429 de l'API OpenAI
2. L'API retourne 502 `{ error: { code: 'provider_rate_limit', link: 'https://platform.openai.com/settings/organization/limits' } }`
3. Client affiche toast error avec bouton "Voir les limites" → ouvre le lien

## Schema DB

### Table `userSettings` — modifications

| Colonne | Changement |
|---------|-----------|
| `monthlyCostLimitUsd` | Default 50 → **20** |
| `alertThresholdsJson` | Default `[50,80,95]` → **`[80,100]`** |
| `billingResetDay` | **Nouvelle colonne** — integer, default 1, valeurs 1-28 |

### Tables existantes inchangees

- `usageEvents` — alimentee par `onFinish`, aucune modification
- `alertTriggers` — structure existante parfaite (`userId`, `yearMonth`, `thresholdPercent`, `triggeredAt`)

### Migration

```sql
ALTER TABLE user_settings ADD COLUMN billing_reset_day INTEGER NOT NULL DEFAULT 1;
```

Les defaults de `monthlyCostLimitUsd` et `alertThresholdsJson` sont mis a jour dans le schema Drizzle (pas de migration SQL pour les defaults — ils n'affectent que les nouvelles lignes).

## Routes API

Toutes protegees par `authGuard`.

### Middleware budget-guard (avant POST /api/chat)

```
1. Lire userSettings (monthlyCostLimitUsd, hardStop, billingResetDay)
2. Si hardStop = false → next()
3. Calculer periodStart depuis billingResetDay
4. SELECT SUM(costUsd) FROM usageEvents WHERE userId = ? AND createdAt >= periodStart
5. Si total >= limite → 429 { error: { code: 'budget_exceeded', message, usage: { totalUsd, limitUsd, resetDate } } }
6. Sinon → next()
```

### GET /api/usage/current

Retourne l'etat du budget pour la periode courante.

```json
{
  "totalUsd": 4.23,
  "limitUsd": 20.00,
  "percent": 21,
  "periodStart": 1743465600000,
  "periodEnd": 1746057600000,
  "resetDay": 1,
  "alerts": [
    { "percent": 80, "triggeredAt": null },
    { "percent": 100, "triggeredAt": null }
  ]
}
```

### GET /api/settings

Retourne les `userSettings` complets.

```json
{
  "defaultModel": "gpt-5.4-mini",
  "defaultReasoningEffort": "low",
  "monthlyCostLimitUsd": 20.00,
  "alertThresholdsJson": [80, 100],
  "hardStop": true,
  "billingResetDay": 1
}
```

### PATCH /api/settings

Met a jour les settings. Body partiel, validation Zod.

```json
{
  "monthlyCostLimitUsd": 30.00,
  "billingResetDay": 15,
  "hardStop": true,
  "defaultModel": "gpt-5.4",
  "defaultReasoningEffort": "medium"
}
```

### Modifications route POST /api/chat

- **Header `x-budget-alert`** : ajoute dans `onFinish` si un seuil est franchi (valeur = le % franchi)
- **Insert `alertTriggers`** : dans `onFinish`, apres calcul du nouveau %, insert pour chaque seuil non-triggered
- **Catch 429 OpenAI** : retourne 502 `provider_rate_limit` avec le lien portail

## Gestion des erreurs

| Route | Cas d'erreur | HTTP | code |
|-------|-------------|------|------|
| POST /api/chat | Budget depasse + hardStop=true | 429 | `budget_exceeded` |
| POST /api/chat | 429 OpenAI upstream | 502 | `provider_rate_limit` |
| PATCH /api/settings | Body invalide (Zod) | 422 | `invalid_input` |
| GET /api/settings | Non authentifie | 401 | `unauthorized` |
| GET /api/usage/current | Non authentifie | 401 | `unauthorized` |

## UI

### Page /settings

Route dediee avec nav laterale + zone contenu.

```
+------------------+------------------------------------+
| Nav laterale     |  Contenu section                   |
| 200px            |  flex-1, max-w-2xl                 |
|                  |                                    |
|  General         |  [Contenu de la section active]    |
|  Budget          |                                    |
|  Compte          |                                    |
+------------------+------------------------------------+
  ← Retour au chat (bouton en haut)
```

Sous-routes : `/settings/general`, `/settings/budget`, `/settings/account`.

Mobile : nav laterale passe en tabs horizontales ou menu hamburger.

### Section General

- **Modele par defaut** : select avec les modeles de `PRICING`
- **Reasoning effort** : select (low / medium / high)

### Section Budget

- **En-tete** : "Budget {mois} {annee}" — `$X.XX / $XX.00` avec progress bar
- **Progress bar** : gradient vert→amber, marqueurs verticaux a 80% et 100%
- **Countdown** : "Reset dans X jours"
- **Configuration** :
  - Limite mensuelle : input numerique, defaut $20
  - Jour de reset : select 1-28, defaut 1er
  - Hard stop : toggle switch
- **Alertes** : 2 items fixes (80% warning, 100% hard stop), non configurables

### Section Compte

- Email (readonly)
- Date d'inscription (readonly)

### Popover user (sidebar footer)

Ajout en bas de la sidebar existante :
- Bouton avec email tronque
- `DropdownMenu` shadcn :
  - Parametres → `/settings`
  - Se deconnecter → logout

### Banner hard stop (zone chat)

Quand `POST /api/chat` retourne 429 `budget_exceeded` :
- Banner rouge fixe en haut de la zone chat
- Texte : "Budget mensuel atteint — modifie ta limite dans les Parametres" (lien vers `/settings/budget`)
- Input textarea desactivee, bouton submit disabled
- Disparait quand le user modifie sa limite et revient au chat

### Toast alerte 80%

Apres chaque reponse, le client appelle `GET /api/usage/current`. Si le seuil 80% vient d'etre franchi :
- Toast warning via `sonner` : "80% du budget mensuel consomme ($16.00 / $20.00)"
- Disparait apres 5 secondes

### Toast provider limit

Quand `POST /api/chat` retourne 502 `provider_rate_limit` :
- Toast error : "Limite OpenAI atteinte"
- Bouton "Voir les limites" → ouvre `platform.openai.com/settings/organization/limits` dans un nouvel onglet

## Composants nouveaux

| Composant | Responsabilite |
|-----------|---------------|
| `SettingsLayout` | Layout page settings avec nav laterale |
| `SettingsGeneral` | Section parametres generaux |
| `SettingsBudget` | Section budget avec progress bar et config |
| `SettingsAccount` | Section compte (email, date) |
| `UserMenu` | Popover user en sidebar footer |
| `BudgetBanner` | Banner hard stop dans la zone chat |

## Dependencies nouvelles

```
@buck/web:
  sonner  — toast notifications (si pas deja present)
```

Pas de nouvelle dependance cote API.

## Strategie de test

### Tests unitaires (Vitest)

| Fichier | Ce qu'il verifie |
|---------|-----------------|
| `budget-guard.test.ts` | Middleware laisse passer sous la limite, bloque a 429 au-dessus, respecte hardStop=false, calcul correct de la periode avec billingResetDay |
| `usage.test.ts` | Route `GET /api/usage/current` retourne le bon total, le bon %, les bonnes dates de periode |
| `settings.test.ts` | `GET /api/settings` retourne les settings, `PATCH /api/settings` met a jour, validation Zod des inputs |
| `chat.test.ts` (ajouts) | Insertion `alertTriggers` en `onFinish` au franchissement de seuil, catch 429 OpenAI → 502 |

### Tests e2e (Playwright)

- **Happy path settings** : login → naviguer vers `/settings` → modifier la limite budget → verifier la sauvegarde
- **Hard stop** : envoyer des messages jusqu'au budget → verifier le banner + input desactive → modifier la limite → verifier que le chat est debloque

## Hors scope M2

- Historique d'usage (graphiques par jour/semaine)
- Ventilation par modele
- Export CSV des usage events
- Alertes email (Resend)
- Gestion multi-provider (M4+)
