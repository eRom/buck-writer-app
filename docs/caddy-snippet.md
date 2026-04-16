# Caddy snippet for Buck Writer

Ajouter ce bloc à la Caddyfile Trinity (`/Users/recarnot/dev/trinity-lifeos-agent/vps/docker/caddy/Caddyfile` en local, ou le chemin de prod sur le VPS) :

```caddy
buck.romain-ecarnot.com {
    basicauth {
        {$BUCK_USER} {$BUCK_PASSWORD_HASH}
    }

    # Bible UI reverse-proxy (activé en M4)
    # handle_path /bible* {
    #     reverse_proxy bible-mcp:7801
    # }

    reverse_proxy buck-app:3000
}
```

Ajouter ces variables au `.env` Trinity :

```bash
BUCK_USER=romain
# Générer avec : docker run --rm caddy caddy hash-password --plaintext 'YOUR_PASSWORD'
BUCK_PASSWORD_HASH=$2a$14$...
```

Une seule fois par host, avant le premier `docker compose up` :

```bash
docker network create caddy-public
```

Et attacher le container Caddy Trinity à `caddy-public` dans son compose :

```yaml
caddy:
  # ... existing config
  networks:
    - trinity-network
    - caddy-public

networks:
  trinity-network:
    driver: bridge
  caddy-public:
    external: true
```
