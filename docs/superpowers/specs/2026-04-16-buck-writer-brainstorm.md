# Buck Writer — Brainstorm (conversation summary)

> Synthese des decisions prises pendant le brainstorming du 2026-04-16 entre Romain et Trinity.
> Base de comparaison pour review devil-spec de la spec v1.1.

---

## Contexte & intentions de depart (issus de `docs/perso/idee.md`)

**Commande** : un ecrivain (polar) veut un assistant IA sur-mesure.
- Gratuit pour l'ecrivain, opportunite de vitrine pour Romain
- Principe qualite : "fignoler" — securite, tests, donnees
- Open-source, dependances gratuites (sauf IA payante)

**Intentions brutes initiales** :
- Assistant Live + Texte, basé sur OpenAI
- Modeles visés : `gpt-5.4`, `gpt-5.4-mini`, `gpt-realtime-1.5`
- API Key OpenAI dans `.env`
- Format : web app pour couvrir Windows / Mac / Mobile
- Deploy initial envisagé : Vercel + Cloudflare (prod), Mac local (dev)
- Fonctionnalites demandees :
  - Porter les features de `barda-mcp-ecrivain-bible` **directement dans l'app** (ne PAS passer par MCP selon l'intuition initiale)
  - Workspace = un seul dossier sur disque dur, changeable
  - Chat complet : thinking visualisation, tools visualisation, MCP mngt, Skills mngt, attachments
  - Prompts uniques dans workspace : SYSTEM.md / USER.md / RULES.md
  - Selecteur de modele (flagship / mini)
  - Sessions CRUD
  - **Pas d'auth**
  - Memoire systeme (semantique / episodique / procedurale / court terme / structuree)
  - Module Live avec toggle voix libre / voix integree au chat
  - Backup mngt

---

## Phase 1 — Revue de faisabilite par Trinity (drapeaux rouges)

### Points identifies comme probleme ou contrainte
1. **Modeles `gpt-5.4` etc.** : inconnus dans le training de Trinity → a verifier via tech-deep-research
2. **Thinking visualisation** : OpenAI n'expose PAS le chain-of-thought dans l'API → feature impossible en l'etat
3. **Triple contradiction** "web app + workspace disque local + MCP" : impossible dans une web app pure (pas d'acces FS libre, pas de subprocess MCP)
4. **"Pas d'auth"** + deploy public Vercel : n'importe qui peut cramer la cle OpenAI
5. **OpenAI Apps SDK** : ne convient pas, tourne dans ChatGPT, pas de UI custom

### Re-examens
- Les modeles `gpt-5.4`, `gpt-5.4-mini`, `gpt-realtime-1.5` **existent** (confirme par deep-research avril 2026 — sortis fev/mars 2026, le training de Trinity etait a jour en mai 2025 donc les ignorait)
- Thinking reste hidden en API OpenAI (confirme deep-research)

---

## Phase 2 — Pivot infrastructure

### Decision 1 — Passage à Docker + VPS Hostinger
Romain propose : Docker sur VPS Hostinger (au lieu de Vercel + Cloudflare).

**Validé**. Débloque :
- MCP stdio subprocess possible (serverless n'y arrivait pas)
- Realtime WebSocket longue durée
- Workspace volume persistent cote serveur
- Cle OpenAI planquee cote backend
- Parite dev/prod via docker-compose

**Reste non résolu** :
- Le "workspace sur disque dur du user" n'est pas du tout un dossier **local** → workspace vit sur le VPS
- Besoin d'une auth (meme legere)

### Decision 2 — Tech deep research Docker/VPS Hostinger
Lancé via Gemini CLI. Resultats :
- Docker 28.3+, Hostinger VPS KVM supporte tout (kernel natif, FUSE ok, cgroup v2, rootless)
- Patterns 2025/2026 : bind mount + UID/GID mapping, rootless Docker
- Acces fichiers user : 4 strategies (volume Docker API, rclone sync, WebDAV via Caddy, Tauri)
- Gotchas : pas de `--privileged`, path traversal, UID mapping

### Decision 3 — Resolution du "workspace local"
Combo retenu : **workspace cote VPS + WebDAV via Caddy** → l'ecrivain monte son workspace comme lecteur reseau sur Mac/Windows/Mobile, l'edite localement (VSCode, Finder), le backend le voit en live.
→ **Plus besoin de Tauri**. Tout reste web pur.

---

## Phase 3 — Les 4 arbitrages fondateurs

Trinity demande à Romain 4 arbitrages :

| # | Question | Decision |
|---|---|---|
| 1 | Modeles OpenAI reels ? | Tech deep research → `gpt-5.4`, `gpt-5.4-mini`, `gpt-realtime-1.5` confirmes. reasoning_effort expose `low/medium/high` seulement (pas `none`/`xhigh`) |
| 2 | Thinking visualisation ? | **Abandonne**. OpenAI n'expose pas le CoT. Simple spinner "je reflechis — effort: X" |
| 3 | Auth ? | Le plus simple + securise, user n'a pas GitHub → **magic link email (Resend)** + **basicauth Caddy** en double rideau |
| 4 | Scope v1 ? | **v1 = chat+workspace+bible+base+metriques ; v2 = memoire ; v3 = module Live** |

### Decision 4 — Metriques & alertes cout
Ajout après-coup par Romain : besoin de tracker le cout total OpenAI avec alertes en % d'un plafond mensuel.
→ Feature v1 **obligatoire** (critique : Realtime v3 + `xhigh` pourraient cramer vite). Hard-stop par defaut.

---

## Phase 4 — Decoupage scope (v1.1 vs v1.2)

La v1 contenait 12 items. Decoupage retenu :
- **v1.1 "foundation"** : Docker + auth + workspace + chat + sessions + attachments + metriques
- **v1.2 "ecrivain tools"** : MCP mngt + Skills mngt + prompts editor + backup
- v2 : memoire semantique/episodique/procedurale/structuree + pgvector (ou sqlite-vec)
- v3 : module Live Realtime + toggle voix libre / session

---

## Phase 5 — Bible : port vs MCP

Romain avait ecrit "pas sous forme de MCP, directement dans l'application". Question "ba mais... on gagne vraiment avec le port ?"

Analyse comparee : **le port gagne peu** (UX marginalement plus fluide) **et coute beaucoup** (rewrite complet DB + UI + tools, fork interne, dette).

### Decision 5 — Bible reste en MCP
- Bible = **container MCP** a cote, non porte
- Branche par defaut dans Buck Writer comme **MCP core** (non-supprimable par le user)
- UX transparente : le user voit des tools dans son chat ("search_character", "add_location"), ne sait meme pas que c'est MCP
- UI Bible existante accessible via `/bible/*` en reverse proxy

**Impact** : v1.2 devient beaucoup plus légère (plus de port à faire). On garde quand même le decoupage v1.1/v1.2 (livraisons plus rapides).

---

## Phase 6 — Stack

### Decision 6 — Framework
Choix B : **React + Vite (front) + Hono (back) en monorepo pnpm**.
- `packages/web` + `packages/api` + `packages/shared`
- Hono = streaming SSE natif, WebSocket supporté, leger, TypeScript DX parfaite
- Rejete : Next.js (routes handlers moins propres pour MCP subprocess), SvelteKit/Remix/TanStack Start (eloignement ecosysteme)

### Decision 7 — DB
Choix A : **SQLite + Drizzle**.
- Mono-user, file-based, zero service DB
- Backup = `cp buck.db`
- Extension `sqlite-vec` disponible pour v2 vectoriel

### Decision 8 — Email provider
Choix A : **Resend** (Romain a deja un compte). Domaine `romain-ecarnot.com` pour DKIM/SPF.

### Decision 9 — Identite visuelle
shadcn/ui avec preset personnel de Romain :
```
pnpm dlx shadcn@latest init --preset b1Gdz9c4A --template vite --monorepo
```
Dark-first force en v1.1.

### Decision 10 — Attachments
Reco validee : **10 MB par fichier, 5 fichiers max par message, stockage dans le workspace user** (sous `workspace/sessions/<id>/attachments/`).
Types : images (png/jpg/webp), texte, md, pdf (via pdf-parse), docx (via mammoth).

### Decision 11 — Tests
Choix B : **Vitest (unit + integration) + Playwright (8 scenarios e2e critiques)**.
Pas de visual regression.

### Decision 12 — Deploy
Choix B : **GitHub Actions + GHCR + SSH deploy**.
Romain aura besoin d'un guide setup pas-a-pas au moment du deploy (secrets GH, workflow YAML, clef SSH dediee VPS).

---

## Phase 7 — Caddy existant sur VPS

Romain a deja un Caddy (container Trinity). Caddyfile existant :
```
{$N8N_HOST} { reverse_proxy n8n:5678 }
live.{$N8N_HOST} { basicauth ... reverse_proxy voice-agent:3000 }
```

### Decision 13 — Plug sur Caddy existant
Pattern retenu : **reseau Docker externe partage `caddy-public`**.
- `docker network create caddy-public` (une fois sur le VPS)
- Caddy Trinity rejoint ce reseau (ajout dans docker-compose Trinity)
- Buck a son propre docker-compose, se branche sur `caddy-public` (external)
- Pattern scalable pour futurs projets sur le VPS

### Decision 14 — Sous-domaine
**`buck.romain-ecarnot.com`** (domaine perso Romain, pas sous le domaine n8n). DNS A/CNAME vers VPS. Caddy auto-TLS Let's Encrypt.

### Decision 15 — Archi containers
Choix Arch 3 : **2 containers uniquement** — `buck-app` (Hono + static Vite + SQLite) + `bible-mcp` (Bible existant).
Rejete : Arch 1 monolithe fat (couplage Bible), Arch 2 multi-container strict (nginx interne overkill).

---

## Bilan : tous les points valides

| # | Decision | Commentaire |
|---|---|---|
| D1 | Docker sur VPS Hostinger | OK |
| D2 | Deep research Docker/VPS | OK, patterns 2025 confirmes |
| D3 | Workspace VPS + WebDAV Caddy | OK, plus besoin de Tauri |
| D4 | Modeles gpt-5.4 / mini / realtime-1.5 | OK, confirmes |
| D5 | Thinking visualisation | Abandonne |
| D6 | Auth = magic link + basicauth | OK, double rideau |
| D7 | Scope v1.1 / v1.2 / v2 / v3 | OK |
| D8 | Metriques & alertes cout obligatoire v1 | OK, hard-stop default |
| D9 | Bible = MCP core non-supprimable | OK |
| D10 | Stack Vite + Hono + pnpm monorepo | OK |
| D11 | SQLite + Drizzle | OK |
| D12 | Resend pour magic link | OK |
| D13 | shadcn preset b1Gdz9c4A --monorepo | OK |
| D14 | Attachments 10MB x 5 workspace | OK |
| D15 | Vitest + Playwright | OK |
| D16 | GitHub Actions + GHCR + SSH | OK |
| D17 | Reseau Docker externe caddy-public | OK |
| D18 | buck.romain-ecarnot.com | OK |
| D19 | Arch 3 : buck-app + bible-mcp | OK |

---

## Ce que le brainstorm N'A PAS tranche explicitement (delegue a la spec)

- Format exact SSE events (start/delta/tool_call/tool_result/usage/done/error)
- Schema SQLite detaille (tables et colonnes)
- Liste d'endpoints API
- Liste de composants React
- Scenarios Playwright precis
- Workflow GH Actions detaille
- Dockerfile multi-stage
- Script backup cron
- Rate limits par endpoint
- CSP exacte
- Nomage des cookies / headers
- Composants UI specifiques

La spec v1.1 `2026-04-16-buck-writer-v1-1-foundation-design.md` prend ces decisions de detail **dans l'esprit** des 19 decisions ci-dessus.
