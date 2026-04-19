#!/usr/bin/env bash
# Buck Writer — VPS deployment script
# Pattern: git on VPS + docker compose build/up. No registry, no tarballs.
#
# Prereqs (one-time, manual): see scripts/deploy-vps-PREREQS.md
#   - DNS A records buck + *.buck → 72.62.239.98 (Cloudflare, DNS-only/grey)
#   - Trinity stack updated to attach Caddy on caddy-public network
#   - docker network "caddy-public" created on VPS
#   - /opt/buck-writer-app cloned + .env in place
#
# Usage:  ./scripts/deploy-vps.sh
# Env (optional override):
#   REMOTE_USER=root REMOTE_IP=72.62.239.98 REMOTE_DIR=/opt/buck-writer-app

set -euo pipefail

REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_IP="${REMOTE_IP:-72.62.239.98}"
REMOTE_DIR="${REMOTE_DIR:-/opt/buck-writer-app}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_vps20260131}"
SSH="ssh -i $SSH_KEY $REMOTE_USER@$REMOTE_IP"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo "${BLUE}▶${NC} $*"; }
ok()   { echo "${GREEN}✓${NC} $*"; }
fail() { echo "${RED}✗${NC} $*"; exit 1; }

[ -f "$SSH_KEY" ] || fail "SSH key not found: $SSH_KEY"
[ -f .env.production ] || fail ".env.production missing — generate it locally first"

log "Pulling latest main on VPS"
$SSH "cd $REMOTE_DIR && git fetch --all && git reset --hard origin/main"

log "Syncing .env.production → $REMOTE_DIR/.env"
scp -i "$SSH_KEY" .env.production "$REMOTE_USER@$REMOTE_IP:$REMOTE_DIR/.env"

log "Ensuring data directories exist"
$SSH "cd $REMOTE_DIR && mkdir -p data/db data/workspace data/bible"

log "Building images (bible-mcp, bible-ui, buck-app)"
$SSH "cd $REMOTE_DIR && docker compose build"

log "Starting / updating containers"
$SSH "cd $REMOTE_DIR && docker compose up -d"

log "Waiting for healthchecks"
sleep 8
$SSH "cd $REMOTE_DIR && docker compose ps"

log "Sanity HTTPS checks"
echo
echo "  buck.romain-ecarnot.com →"
curl -sI https://buck.romain-ecarnot.com/api/health | head -1 || true
echo "  bible.buck.romain-ecarnot.com (expect 401 without creds) →"
curl -sI https://bible.buck.romain-ecarnot.com | head -1 || true

ok "Deploy done. Tail logs with:"
echo "  $SSH 'cd $REMOTE_DIR && docker compose logs -f --tail=50'"
