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

## Outils MCP consommés (inventaire)

Health check exécuté le 2026-04-18 contre `bible-mcp` (port 7801, méthode `tools/list`). 51 outils exposés.

Convention de nommage : **snake_case** (ex: `list_characters`), pas de namespace dotté.

```
ping
create_character
get_character
update_character
delete_character
list_characters
create_location
get_location
update_location
delete_location
list_locations
create_event
get_event
update_event
delete_event
list_events
get_timeline
get_timeline_filtered
create_interaction
get_interaction
update_interaction
delete_interaction
list_interactions
get_character_relations
create_world_rule
get_world_rule
update_world_rule
delete_world_rule
list_world_rules
create_research
get_research
update_research
delete_research
list_research
create_note
get_note
update_note
delete_note
list_notes
search_fulltext
search_semantic
export_bible
import_bulk
detect_duplicates
list_templates
get_template
reindex_embeddings
backup_bible
restore_bible
list_backups
get_bible_stats
```
