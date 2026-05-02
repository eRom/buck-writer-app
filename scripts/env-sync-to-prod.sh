#!/usr/bin/env bash
# env-sync-to-prod.sh — wrapper safe autour de hostinger:env-sync.
#
# Filtre les keys dev-only AVANT de pipe vers sops, en se basant sur
# .env.prod.allowed (whitelist explicite). Les keys absentes de la
# whitelist sont silencieusement ignorees.
#
# Usage : scripts/env-sync-to-prod.sh
#
# Pre-requis :
# - VPS_ORCHESTRATOR_PATH defini (cf ~/.zshenv)
# - sops dans le PATH
# - secrets/buck.enc.yaml existe deja cote orchestrateur
# - .env present a la racine du repo

set -euo pipefail

abort() { printf '\033[31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

SCRIPT_PATH="${BASH_SOURCE[0]}"
REPO_ROOT="$(cd "$(dirname "$SCRIPT_PATH")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
WHITELIST="$REPO_ROOT/.env.prod.allowed"
APP="buck"

: "${VPS_ORCHESTRATOR_PATH:?Set VPS_ORCHESTRATOR_PATH in ~/.zshenv}"
ENC="$VPS_ORCHESTRATOR_PATH/secrets/$APP.enc.yaml"

[ -f "$ENV_FILE" ] || abort "$ENV_FILE introuvable"
[ -f "$WHITELIST" ] || abort "$WHITELIST introuvable"
[ -f "$ENC" ] || abort "$ENC inexistant — bootstrap l'app d'abord"
command -v sops >/dev/null || abort "sops absent du PATH"

# 1. Construire la liste des keys autorisees (depuis whitelist, sans commentaires).
ALLOWED_KEYS=$(grep -vE '^[[:space:]]*(#|$)' "$WHITELIST" | sort -u)
[ -n "$ALLOWED_KEYS" ] || abort "$WHITELIST est vide"

# 2. Filtrer .env -> stream YAML, ne garder que les keys whitelistees.
TMP_PLAIN="$(mktemp -t buck-env-prod.XXXXXX.yaml)"
trap 'shred -u "$TMP_PLAIN" 2>/dev/null || rm -f "$TMP_PLAIN"' EXIT

INCLUDED=()
SKIPPED=()
while IFS='=' read -r key rest; do
  # ignorer commentaires + lignes vides
  case "$key" in ''|'#'*) continue;; esac
  key="${key#"${key%%[![:space:]]*}"}"
  if echo "$ALLOWED_KEYS" | grep -qx "$key"; then
    val="$rest"
    val="${val%\'}"; val="${val#\'}"
    val="${val%\"}"; val="${val#\"}"
    esc="${val//\'/\'\'}"
    printf "%s: '%s'\n" "$key" "$esc" >> "$TMP_PLAIN"
    INCLUDED+=("$key")
  else
    SKIPPED+=("$key")
  fi
done < "$ENV_FILE"

# 3. Encrypt avec filename-override pour matcher la creation_rule sops.
#    sops cherche .sops.yaml depuis cwd, donc on cd dans l'orchestrateur.
TMP_ENC="$ENC.tmp.$$"
(cd "$VPS_ORCHESTRATOR_PATH" && sops --input-type yaml --output-type yaml --filename-override "secrets/$APP.enc.yaml" -e "$TMP_PLAIN") > "$TMP_ENC"

if ! grep -q "^sops:" "$TMP_ENC"; then
  rm -f "$TMP_ENC"
  abort "Resultat sops invalide. Aborted."
fi

mv "$TMP_ENC" "$ENC"

# 4. Resume.
printf '\033[32mOK\033[0m %s mis a jour.\n' "$ENC"
printf 'Keys synchronisees (%d) :\n' "${#INCLUDED[@]}"
printf '  - %s\n' "${INCLUDED[@]}"
if [ "${#SKIPPED[@]}" -gt 0 ]; then
  printf '\n\033[33mIgnorees (%d, hors whitelist) :\033[0m\n' "${#SKIPPED[@]}"
  printf '  - %s\n' "${SKIPPED[@]}"
fi

cat <<EOF

Next :
  cd \$VPS_ORCHESTRATOR_PATH
  git diff --stat secrets/$APP.enc.yaml
  git add secrets/$APP.enc.yaml && git commit -m "chore(secrets/$APP): sync from .env"
  git push
EOF
