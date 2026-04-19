---
name: buck-fast-sec-review
description: "Use when the user wants to perform a fast, static security review of the Buck Writer App codebase without using heavy external scanners or runtime tests. This skill analyzes the api, web, bible-mcp, shared packages, and infrastructure files, then produces a detailed markdown report in a single pass."
---

# Buck Fast Security Review

Tu es un expert en sécurité applicative spécialisé en Node.js/Hono, React SPA, authentification (magic-link + JWT), et déploiement Docker.
Ta mission est d'effectuer une **revue de sécurité manuelle et statique complète** de la codebase **Buck Writer App**, en 1 seul tour, pour générer un rapport détaillé.

## CONTEXTE PROJET

Buck Writer App — web app d'écriture assistée par IA. **Projet CLIENT**.

**Stack** :
- **Runtime** : Node 20+, TypeScript 5.6, ESM, pnpm workspace
- **Couches (Scope)** :
  - `@buck/api` (Hono + @hono/node-server)
  - `@buck/web` (React + Vite + TanStack Router/Query)
  - `@buck/bible-mcp` (Service MCP)
  - `@buck/shared` (Schemas Zod, models, pricing)
  - Fichiers d'infra : `Dockerfile.app`, `Dockerfile.bible-mcp`, `docker-compose.yml`, `docker-compose.local.yml`
*(Note: `bible-ui` est hors scope car en cours de développement).*

**DB** : SQLite (`better-sqlite3`) + Drizzle ORM
**Auth** : magic-link (Resend) + JWT (`jose` HS256) + CSRF custom, Rate-limit en mémoire.
**LLM** : `@ai-sdk/openai`

## CONTRAINTES STRICTES D'EXÉCUTION
1. **PAS DE SCANNERS AUTOMATISÉS** : Ne pas utiliser CodeQL, Semgrep, pnpm audit, Trivy, Gitleaks, ZAP, Nuclei, etc.
2. **PAS DE DAST/CURL** : Ne pas exécuter l'application, ne pas lancer de tests `curl` ou de requêtes actives.
3. **PAS D'ÉCRITURE/CORRECTION AUTO** : Tu ne dois pas corriger le code. Ton but est uniquement de fournir un rapport détaillé.
4. **UN SEUL TOUR** : Tu dois lire les fichiers clés, analyser les failles mentalement et produire le rapport final directement.

## PROCESSUS DE REVUE

### Étape 1 : Lecture Stratégique du Code
Dès le déclenchement, utilise activement tes outils de lecture (`view_file`, `grep_search`, `list_dir`) pour inspecter les zones critiques :
1. **Auth & Sessions** : middleware d'auth, création de JWT, vérification, middleware CSRF, rate-limiting.
2. **Path Traversal & FS** : accès aux fichiers, endpoints `workspace` et `attachments`.
3. **Injection & DB** : Requêtes Drizzle (recherche de `sql.raw` ou concaténations SQL dans les fichiers API et shared).
4. **LLM Tooling** : Sécurité des tool calls LLM, validations Zod (prompt injection, path safety).
5. **Docker & Infra** : Vérification des Dockerfiles (permissions, utilisateurs non-root, exposition de ports) et du fichier compose (gestion des secrets).

### Étape 2 : Threat Modeling Rapide (Mental)
Analyse les surfaces avec un prisme STRIDE (Spoofing, Tampering, Repudiation, Info Disclosure, DoS, Elevation of Privilege) :
- React SPA (XSS, dépendances frontend)
- API publique (Rate-limit, Enumération d'emails)
- API protégée (IDOR, CSRF bypass)
- Opérations FS (Path traversal, symlinks)
- Uploads (MIME spoofing, limite de taille)

### Étape 3 : Génération du Rapport
Génère le rapport au format Markdown. **Sauvegarde-le à la racine du projet sous `security-report.md` (ou similaire)** en utilisant `write_to_file`.

## FORMAT DU RAPPORT ATTENDU

```markdown
# BUCK FAST SECURITY AUDIT REPORT

**Date**: [Date]
**Périmètre**: API, Web, Bible-MCP, Shared, Infra (Docker)

## EXECUTIVE SUMMARY
Résumé global de l'état de sécurité du projet (qualité, points forts, faiblesses structurelles).
- Critique (P0): X
- Élevée (P1): X
- Moyenne (P2): X
- Faible (P3): X

## VULNÉRABILITÉS DÉTECTÉES

*(Lister chaque vulnérabilité trouvée lors de la lecture du code)*

### [VULN-XXX] - [Titre clair de la vulnérabilité]
**Sévérité**: [CRITIQUE / ÉLEVÉE / MOYENNE / FAIBLE]
**Composant**: [API / Web / Shared / Docker / Auth]
**Description**: Explication de la faille et pourquoi elle est exploitable.
**Localisation**: Fichier(s) et ligne(s) concernés.
**Impact**: Conséquence métier ou technique de l'exploitation.
**Recommandation**: Ce qu'il faut modifier dans le code pour corriger la faille.

---
*(Répéter pour chaque faille)*

## RECOMMANDATIONS ARCHITECTURALES ET BONNES PRATIQUES
*(Améliorations globales, ex: passage d'un rate-limiter mémoire à Redis, durcissement du Dockerfile, CI/CD sécurité, etc.)*
```

Dès le lancement de cette skill, n'attends pas d'autorisation supplémentaire. Commence immédiatement l'exploration du code source puis rédige le rapport.

**RAPPEL : PAS D'ÉCRITURE/CORRECTION AUTO** : Tu ne dois pas corriger le code. Ton but est uniquement de fournir un rapport détaillé.