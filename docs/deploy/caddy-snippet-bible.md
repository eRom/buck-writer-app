# Caddy snippet pour bible-ui — à appliquer sur le VPS lors du déploiement

## DNS prérequis (Hostinger)

Créer un record wildcard :
- Type: `A`
- Nom: `*.buck`
- Valeur: IP du VPS
- TTL: défaut

Couvre `buck.romain-ecarnot.com` ET `bible.buck.romain-ecarnot.com`.

## Variables d'env Caddy (.env du compose Caddy sur trinity-lifeos-agent)

```env
BUCK_HOST_BASE=romain-ecarnot.com
BIBLE_USER=romain
BIBLE_PASSWORD_HASH='$2a$14$DYnh9iQXhZIXrEoNn/2Ci.MCc365Ea3HzojSHjxi1l1cA7x8tWZV2'
```

⚠️ Le hash bcrypt contient des `$` qui doivent être quotés (`'...'`) pour ne pas être interprétés par le shell.

Mot de passe en clair (à stocker dans ton gestionnaire de mots de passe, jamais dans git) : généré au moment du brainstorming, demande à Trinity ou regénère via :

```bash
docker run --rm caddy:2 caddy hash-password --plaintext 'NOUVEAU_PASSWORD_FORT'
```

## Bloc Caddyfile à ajouter

À ajouter à la fin de `/Users/recarnot/dev/trinity-lifeos-agent/vps/docker/caddy/CaddyFile` :

```
buck.{$BUCK_HOST_BASE} {
    reverse_proxy buck-app:3000
}

bible.buck.{$BUCK_HOST_BASE} {
    basicauth {
        {$BIBLE_USER} {$BIBLE_PASSWORD_HASH}
    }
    reverse_proxy bible-ui:80
}
```

## Reload Caddy

```bash
ssh vps "cd /path/to/trinity && docker compose -f vps/docker-compose.yml exec caddy caddy reload --config /etc/caddy/Caddyfile"
```

## Sanity checks post-deploy

```bash
# Buck doit répondre 200 (avec login magic-link)
curl -i https://buck.romain-ecarnot.com

# Bible doit demander basicauth (HTTP 401)
curl -i https://bible.buck.romain-ecarnot.com

# Avec creds
curl -i -u romain:LE_PLAINTEXT https://bible.buck.romain-ecarnot.com

# /mcp aussi protégé (401 sans auth)
curl -i -X POST https://bible.buck.romain-ecarnot.com/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
