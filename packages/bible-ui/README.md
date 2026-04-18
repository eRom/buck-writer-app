# @buck/bible-ui

SPA frontend pour le serveur `bible-mcp`. Stack : React 19 + Vite + TanStack Router/Query + Tailwind 4 + shadcn (preset b1Gdz9c4A).

## Dev

```bash
# depuis la racine du monorepo
pnpm dev:bible    # lance bible-mcp (7801) + bible-ui (5174)
```

Ouvrir http://localhost:5174

## Build prod (Docker)

```bash
docker compose build bible-ui
docker compose up -d bible-ui
```

Servi par nginx alpine, proxy `/mcp` vers le service `bible-mcp` via le réseau Docker `internal`.
