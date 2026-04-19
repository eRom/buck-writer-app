# Caddy snippet pour bible-ui — SSO via forward_auth

Depuis 2026-04-19, `bible.buck.romain-ecarnot.com` n'est plus protégée par basicauth mais par le cookie de session Buck (SSO Caddy `forward_auth` → endpoint `/api/auth/verify-session` sur `buck-app`).

## DNS prérequis (Hostinger)

Record wildcard :
- Type: `A`
- Nom: `*.buck`
- Valeur: IP du VPS
- TTL: défaut

Couvre `buck.romain-ecarnot.com` ET `bible.buck.romain-ecarnot.com`.

## Variables d'env

### Sur le `.env` Buck (`.env.production`)

Indispensable pour que le cookie soit envoyé à `bible.buck.*` :

```env
COOKIE_DOMAIN=.romain-ecarnot.com
```

### Sur le `.env` Caddy (compose Trinity)

Plus besoin de `BIBLE_USER` / `BIBLE_PASSWORD_HASH` — les retirer si présents.

```env
BUCK_HOST_BASE=romain-ecarnot.com
```

## Bloc Caddyfile

`trinity-lifeos-agent/vps/docker/caddy/Caddyfile` :

```
bible.buck.{$BUCK_HOST_BASE} {
    forward_auth buck-app:3000 {
        uri /api/auth/verify-session
        copy_headers X-User-Id
    }
    reverse_proxy buck-bible-ui:80
}
```

## Déploiement (ordre important)

1. Déployer Buck avec `COOKIE_DOMAIN=.romain-ecarnot.com` (rebuild + redémarrage `buck-app`).
2. **Se relogger sur `https://buck.romain-ecarnot.com`** (magic-link) pour obtenir un cookie avec le nouveau Domain parent. L'ancien cookie host-only reste valide mais ne sera pas envoyé à `bible.buck.*`.
3. Patch Caddyfile + reload :

```bash
ssh vps "cd /path/to/trinity && docker compose -f vps/docker/docker-compose.yml exec caddy caddy reload --config /etc/caddy/Caddyfile"
```

## Sanity checks post-deploy

```bash
# Buck répond 200 (authentifié) ou redirect login
curl -i https://buck.romain-ecarnot.com

# Bible sans cookie → 401 (forward_auth rejette)
curl -i https://bible.buck.romain-ecarnot.com

# Bible avec cookie de session Buck → 200 + UI
curl -i -H "cookie: buck_session=<JWT>" https://bible.buck.romain-ecarnot.com

# Endpoint forward_auth directement (sans cookie → 401, avec cookie → 204 + X-User-Id)
curl -i https://buck.romain-ecarnot.com/api/auth/verify-session
```

## Rollback basicauth (au cas où)

Si le SSO pose souci, restaurer le bloc basicauth précédent (cf. historique git `vps/docker/caddy/Caddyfile`) et remettre `BIBLE_USER` / `BIBLE_PASSWORD_HASH` dans l'env Caddy.
