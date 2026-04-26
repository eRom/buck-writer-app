#!/usr/bin/env bash
# Buck Writer — VPS deployment (Trinity-aware).
# Deploys Buck + syncs Trinity's Caddyfile/.env for MCP remote connectors.
# Lives in vps/ — chdir to vps/ so all relative paths are predictable.
#
# What this script does, in order :
#   1. git fetch + hard reset on VPS Buck repo to latest main
#   2. Sync local .env.production → VPS Buck .env
#   3. Sync local Caddyfile → Trinity Caddy config (adds MCP blocks)
#   4. Sync local .env.trinity → Trinity .env (MCP_SHARED_SECRET + existing)
#   5. Build + up Buck containers (bible-mcp, writing-tools-mcp, bible-ui, buck-app)
#   6. Reload Caddy inside Trinity docker-compose
#   7. Sanity checks against public endpoints (with + without Bearer)
#
# Prereqs (one-time, manual):
#   - DNS : *.buck + buck → IP VPS (wildcard OK)
#   - Trinity repo cloned at /opt/trinity-lifeos with Caddy stack running
#   - docker network "caddy-public" created on VPS
#   - /opt/buck-writer-app cloned + (first run) .env bootstrapped
#   - Local files present : vps/.env.production, vps/.env.trinity, vps/Caddyfile
#
# Usage   :  ./vps/deploy.sh   (or from vps/: ./deploy.sh)
# Env vars (override defaults) :
#   REMOTE_USER=root
#   REMOTE_IP=72.62.239.98
#   REMOTE_DIR=/opt/buck-writer-app
#   TRINITY_DIR=/opt/trinity-lifeos
#   TRINITY_COMPOSE_DIR=/opt/trinity-lifeos/vps/docker
#   TRINITY_CADDY_PATH=/opt/trinity-lifeos/vps/docker/caddy/Caddyfile
#   TRINITY_ENV_PATH=/opt/trinity-lifeos/vps/docker/.env
#   SSH_KEY=~/.ssh/id_vps20260131
#   SKIP_BUCK_BUILD=1     # sync envs/Caddy only, no docker build
#   SKIP_TRINITY=1        # deploy only Buck, don't touch Trinity

set -euo pipefail

# Always run from the vps/ directory, regardless of where the user invoked us.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_IP="${REMOTE_IP:-72.62.239.98}"
REMOTE_DIR="${REMOTE_DIR:-/opt/buck-writer-app}"
TRINITY_DIR="${TRINITY_DIR:-/opt/trinity-lifeos}"
TRINITY_COMPOSE_DIR="${TRINITY_COMPOSE_DIR:-$TRINITY_DIR}"
TRINITY_CADDY_PATH="${TRINITY_CADDY_PATH:-$TRINITY_DIR/caddy/Caddyfile}"
TRINITY_ENV_PATH="${TRINITY_ENV_PATH:-$TRINITY_DIR/.env}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_vps20260131}"
SKIP_BUCK_BUILD="${SKIP_BUCK_BUILD:-0}"
SKIP_TRINITY="${SKIP_TRINITY:-0}"

SSH="ssh -i $SSH_KEY $REMOTE_USER@$REMOTE_IP"
SCP="scp -i $SSH_KEY"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { printf "${BLUE}▶${NC} %s\n" "$*"; }
ok()   { printf "${GREEN}✓${NC} %s\n" "$*"; }
warn() { printf "${YELLOW}⚠${NC} %s\n" "$*"; }
fail() { printf "${RED}✗${NC} %s\n" "$*"; exit 1; }

# ---------- Preflight ----------

log "Preflight"
[ -f "$SSH_KEY" ] || fail "SSH key not found: $SSH_KEY"
[ -f .env.production ] || fail ".env.production missing — generate it locally first"
[ -f Caddyfile ] || fail "Caddyfile missing at repo root"
[ -f .env.trinity ] || fail ".env.trinity missing at repo root"

# Extract shared secret from the local production env for sanity checks.
MCP_SHARED_SECRET="$(grep -E '^MCP_SHARED_SECRET=' .env.production | head -1 | cut -d= -f2- || true)"
[ -n "${MCP_SHARED_SECRET:-}" ] || warn "MCP_SHARED_SECRET not found in .env.production — MCP curl checks will be skipped"

# Sanity: the .env.trinity secret must match the .env.production one.
TRINITY_SECRET="$(grep -E '^MCP_SHARED_SECRET=' .env.trinity | head -1 | cut -d= -f2- || true)"
if [ -n "${MCP_SHARED_SECRET:-}" ] && [ "$TRINITY_SECRET" != "$MCP_SHARED_SECRET" ]; then
  fail "MCP_SHARED_SECRET mismatch between .env.production and .env.trinity — align them first"
fi

# SSH reachability.
$SSH "echo ok" >/dev/null 2>&1 || fail "SSH to $REMOTE_USER@$REMOTE_IP failed"
ok "SSH OK — secrets aligned"

# Verify Trinity layout on VPS (unless skipped).
if [ "$SKIP_TRINITY" != "1" ]; then
  $SSH "[ -f $TRINITY_CADDY_PATH ]" || fail "Trinity Caddyfile not found at $TRINITY_CADDY_PATH"
  $SSH "[ -f $TRINITY_ENV_PATH ]" || fail "Trinity .env not found at $TRINITY_ENV_PATH"
  $SSH "[ -d $TRINITY_COMPOSE_DIR ]" || fail "Trinity compose dir not found: $TRINITY_COMPOSE_DIR"
  ok "Trinity layout OK"
fi

# ---------- 1. Buck repo refresh ----------

# DEPLOY_REF = tag (v1.2.3) ou branch ref (origin/main) a deployer.
# Defaut : origin/main (comportement legacy pour les appels locaux sans tag).
DEPLOY_REF="${DEPLOY_REF:-origin/main}"
log "Pulling latest on VPS Buck repo ($REMOTE_DIR) at ref: $DEPLOY_REF"
$SSH "cd $REMOTE_DIR && git fetch --all --tags && git reset --hard $DEPLOY_REF"

# ---------- 2. Buck .env ----------

log "Syncing .env.production → $REMOTE_DIR/.env"
$SCP .env.production "$REMOTE_USER@$REMOTE_IP:$REMOTE_DIR/.env"

log "Ensuring data directories exist"
$SSH "cd $REMOTE_DIR && mkdir -p data/db data/workspace data/bible"

# ---------- 3 + 4. Trinity Caddy + env ----------

if [ "$SKIP_TRINITY" = "1" ]; then
  warn "SKIP_TRINITY=1 — skipping Trinity Caddy/env sync"
else
  log "Backing up Trinity Caddyfile + .env on VPS"
  $SSH "cp $TRINITY_CADDY_PATH ${TRINITY_CADDY_PATH}.bak-$(date +%Y%m%d-%H%M%S)"
  $SSH "cp $TRINITY_ENV_PATH ${TRINITY_ENV_PATH}.bak-$(date +%Y%m%d-%H%M%S)"

  log "Syncing Caddyfile → $TRINITY_CADDY_PATH"
  $SCP Caddyfile "$REMOTE_USER@$REMOTE_IP:$TRINITY_CADDY_PATH"

  log "Syncing .env.trinity → $TRINITY_ENV_PATH"
  $SCP .env.trinity "$REMOTE_USER@$REMOTE_IP:$TRINITY_ENV_PATH"
fi

# ---------- 5. Buck build + up ----------

if [ "$SKIP_BUCK_BUILD" = "1" ]; then
  warn "SKIP_BUCK_BUILD=1 — skipping Buck docker build/up"
else
  log "Building Buck images (bible-mcp, writing-tools-mcp, bible-ui, buck-app)"
  warn "First build of writing-tools-mcp takes ~5 min (torch + transformers + spacy)"
  $SSH "cd $REMOTE_DIR/vps && docker compose build"

  log "Starting / updating Buck containers"
  $SSH "cd $REMOTE_DIR/vps && docker compose up -d"
fi

# ---------- 6. Caddy reload ----------

if [ "$SKIP_TRINITY" != "1" ]; then
  log "Restarting Caddy container (Trinity stack) — required to reload env vars"
  # NB: `caddy reload` seul ne re-lit PAS les env vars du container. Il faut
  # recreate le container pour que les placeholders {$MCP_SHARED_SECRET}
  # soient remplacés avec la nouvelle valeur de .env.trinity.
  $SSH "cd $TRINITY_COMPOSE_DIR && docker compose up -d --force-recreate caddy" \
    || fail "Caddy restart failed — check $TRINITY_CADDY_PATH syntax and compose layout"
fi

# ---------- 7. Sanity checks ----------

log "Waiting 10s for containers to settle"
sleep 10

log "Container status (Buck)"
$SSH "cd $REMOTE_DIR/vps && docker compose ps"

log "Sanity HTTPS checks"
printf "\n  buck.romain-ecarnot.com/api/health → "
curl -sI -o /dev/null -w "%{http_code}\n" https://buck.romain-ecarnot.com/api/health || true

printf "  bible.buck.romain-ecarnot.com (SSO — expect 302/200 if logged) → "
curl -sI -o /dev/null -w "%{http_code}\n" https://bible.buck.romain-ecarnot.com || true

if [ -n "${MCP_SHARED_SECRET:-}" ]; then
  INIT_BODY='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"deploy-vps","version":"0"}}}'

  printf "  bible-mcp.buck (no bearer → expect 401) → "
  curl -sI -o /dev/null -w "%{http_code}\n" https://bible-mcp.buck.romain-ecarnot.com/mcp || true

  printf "  bible-mcp.buck (with bearer → expect 200) → "
  curl -s -o /dev/null -w "%{http_code}\n" -X POST \
    -H "Authorization: Bearer $MCP_SHARED_SECRET" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "$INIT_BODY" \
    https://bible-mcp.buck.romain-ecarnot.com/mcp || true

  printf "  writing-mcp.buck (no bearer → expect 401) → "
  curl -sI -o /dev/null -w "%{http_code}\n" https://writing-mcp.buck.romain-ecarnot.com/mcp || true

  printf "  writing-mcp.buck (with bearer → expect 200) → "
  curl -s -o /dev/null -w "%{http_code}\n" -X POST \
    -H "Authorization: Bearer $MCP_SHARED_SECRET" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "$INIT_BODY" \
    https://writing-mcp.buck.romain-ecarnot.com/mcp || true
else
  warn "Skipping MCP endpoint curls (no MCP_SHARED_SECRET)"
fi

# ---------- 8. Cleanup ----------

log "Cleaning old images + build cache"
# Dangling images (untagged leftovers from previous builds)
$SSH "docker image prune -f" || true
# Build cache (keeps layers < 24h to speed up next build, drops older)
$SSH "docker builder prune -f --filter 'until=24h'" || true
# Stopped containers (healthcheck zombies, dead writing-tools attempts, etc.)
$SSH "docker container prune -f" || true
# Unused networks (none should remain but just in case)
$SSH "docker network prune -f" || true

log "Disk usage after cleanup"
$SSH "docker system df" || true

echo
ok "Deploy done."
echo "  Tail Buck logs   :  $SSH 'cd $REMOTE_DIR/vps && docker compose logs -f --tail=50'"
echo "  Tail bible-mcp   :  $SSH 'docker logs -f buck-bible-mcp --tail=50'"
echo "  Tail writing-mcp :  $SSH 'docker logs -f buck-writing-tools-mcp --tail=50'"
