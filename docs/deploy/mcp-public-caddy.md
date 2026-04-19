# Exposer les MCP servers à OpenAI via Caddy

Date : 2026-04-19 (M7 — Responses API + MCP connectors)

## Contexte

Depuis M7, Buck déclare ses serveurs MCP à l'API Responses comme **remote
connectors** (`tools: [{type: "mcp", server_url, headers}, ...]`). C'est OpenAI
qui appelle le serveur MCP directement — pas Buck. Donc les MCP doivent être
**publiquement joignables** en HTTPS.

La sécurité est assurée par un Bearer token partagé (`MCP_SHARED_SECRET`) :

- Buck injecte `Authorization: Bearer $MCP_SHARED_SECRET` dans les `headers` du
  tool connector.
- OpenAI copie ce header dans chaque requête qu'elle fait au MCP.
- Caddy vérifie le header avant de reverse_proxy vers le container MCP.

Surface d'attaque : si quelqu'un trouve l'URL publique sans le secret → 401.

## Prérequis

### DNS (Hostinger)

Deux records (ou un wildcard `*.buck.romain-ecarnot.com` qui existe déjà) :

- `bible-mcp.buck.romain-ecarnot.com` → IP du VPS
- `writing-mcp.buck.romain-ecarnot.com` → IP du VPS

### Secret partagé

Sur le VPS, `.env` Buck :

```env
MCP_SHARED_SECRET=<64-char hex généré localement>
MCP_BIBLE_URL=https://bible-mcp.buck.romain-ecarnot.com
MCP_WRITING_TOOLS_URL=https://writing-mcp.buck.romain-ecarnot.com
```

Générer :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Sur l'env Caddy (`trinity-lifeos-agent/vps/docker/caddy/.env`), **le même secret** :

```env
BUCK_HOST_BASE=romain-ecarnot.com
MCP_SHARED_SECRET=<même valeur qu'au-dessus>
```

## Bloc Caddyfile

`trinity-lifeos-agent/vps/docker/caddy/Caddyfile` :

```caddy
bible-mcp.buck.{$BUCK_HOST_BASE} {
    @auth header Authorization "Bearer {$MCP_SHARED_SECRET}"
    handle @auth {
        reverse_proxy buck-bible-mcp:7801
    }
    handle {
        respond "Unauthorized" 401
    }
}

writing-mcp.buck.{$BUCK_HOST_BASE} {
    @auth header Authorization "Bearer {$MCP_SHARED_SECRET}"
    handle @auth {
        reverse_proxy buck-writing-tools-mcp:7802
    }
    handle {
        respond "Unauthorized" 401
    }
}
```

Caddy + containers doivent partager le réseau `caddy-public` (déjà le cas pour
`buck-bible-mcp` et `buck-writing-tools-mcp` dans `docker-compose.yml`).

## Déploiement (ordre important)

1. Générer `MCP_SHARED_SECRET` et l'ajouter dans les deux `.env` (Buck + Caddy).
2. Sur le VPS, rebuild + up :
   ```bash
   cd /path/to/buck-writer-app
   docker compose up -d --build
   ```
   Première build writing-tools-mcp : ~5 min (torch + transformers + spacy model).
3. Patch Caddyfile → reload :
   ```bash
   ssh vps "cd /path/to/trinity && docker compose -f vps/docker/docker-compose.yml exec caddy caddy reload --config /etc/caddy/Caddyfile"
   ```

## Sanity checks

```bash
# Sans secret → 401
curl -i https://bible-mcp.buck.romain-ecarnot.com/mcp
curl -i https://writing-mcp.buck.romain-ecarnot.com/mcp

# Avec secret → 200 ou réponse MCP valide
curl -i -H "Authorization: Bearer $MCP_SHARED_SECRET" \
  https://bible-mcp.buck.romain-ecarnot.com/mcp

curl -i -H "Authorization: Bearer $MCP_SHARED_SECRET" \
  https://writing-mcp.buck.romain-ecarnot.com/mcp

# Chat Buck : tester un tool bible via OpenAI
# Depuis /chat, envoyer : "Liste les locations de la bible."
# Attendu côté stream SSE : events mcp_call_started → mcp_call_done.
# Côté log bible-mcp : requête JSON-RPC tools/call avec méthode list_entities.
```

## Rotation du secret

1. Générer un nouveau secret.
2. L'ajouter sur les deux `.env`.
3. **Rebuild Buck ET reload Caddy en sync** (un des deux seul casse les calls
   MCP le temps de la rotation).
4. Vérifier `usage_events` / logs : pas de 401 en cascade.

## Rollback

Retirer les blocs Caddyfile + `docker compose down writing-tools-mcp` + toggle
`writing-tools` OFF dans `/api/mcp`. Bible reste accessible via l'UI interne
inchangée.

## Gotchas

- **OpenAI ne joint pas localhost** : en dev, `MCP_BIBLE_URL=http://bible-mcp:7801`
  (hostname Docker interne) ne marche pas. Soit test via tunnel ngrok, soit
  validation end-to-end directement en prod.
- **Bearer logging** : Caddy logge les headers Authorization par défaut ? Non,
  par défaut il logge juste la requête. Vérifier qu'aucune extension log n'active
  le dump de headers.
- **writing-tools image lourde** : ~3 GB. Build local avec `docker compose build
  writing-tools-mcp` avant un `up` pour ne pas bloquer la prod pendant 5 min.
