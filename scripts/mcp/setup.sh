#!/usr/bin/env bash
# Sets up assistant sign-in (WorkOS AuthKit) for the site's MCP servers: walks the dashboard steps, checks each one, and saves the two Functions secrets.
# Keys are read hidden, checked against WorkOS first, and never written to disk, argv or output. Safe to re-run.
#   npm run mcp:setup                 picks up where the last run stopped
#   npm run mcp:setup -- --from 5     starts at step 5 (and asks again for anything already saved from there on)
#   npm run mcp:setup -- --restart    starts over from step 1
set -euo pipefail
cd "$(dirname "$0")/../.."

PROJECT=moondreams-dev-apps
DASHBOARD="https://dashboard.workos.com"
LOGIN_URI="https://apps.moondreams.dev/connect-assistant"
RESOURCES=("https://apps.moondreams.dev/mcp/helm")
LAST_STEP=5
# Holds only the number of the last dashboard step the person confirmed, never a value.
PROGRESS_FILE="${XDG_STATE_HOME:-$HOME/.local/state}/moondreams/mcp-setup-step"
CURRENT="starting"
CURRENT_STEP=1

usage() { sed -n '4,6p' "$0" | sed 's/^# *//'; }
from=""
case "${1:-}" in
  "") ;;
  --restart) from=1 ;;
  --from)
    from="${2:-}"
    [[ "$from" =~ ^[1-9]$ ]] && (( from <= LAST_STEP )) || { echo "✗ --from takes a step number from 1 to $LAST_STEP." >&2; usage >&2; exit 1; }
    ;;
  -h|--help) usage; exit 0 ;;
  *) echo "✗ Unknown option $1." >&2; usage >&2; exit 1 ;;
esac

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "✗ $1 isn't installed. $2" >&2; exit 1; }
}
pause() { printf '%s' "$1"; read -r _ || true; }
secret_saved() { firebase functions:secrets:get "$1" --project "$PROJECT" >/dev/null 2>&1; }
# firebase's own output names the problem (a missing permission, an API to enable) and never echoes the value.
save_secret() {
  local output
  output=$(printf %s "$2" | firebase functions:secrets:set "$1" --project "$PROJECT" --data-file=- 2>&1) && return 0
  echo "✗ Firebase couldn't save $1. It said:" >&2
  sed 's/^/     /' <<<"$output" >&2
  return 1
}
confirmed_step() { cat "$PROGRESS_FILE" 2>/dev/null || echo 0; }
remember_step() { mkdir -p "$(dirname "$PROGRESS_FILE")"; echo "$1" >"$PROGRESS_FILE"; }
# A step before the starting point is skipped; a saved secret is asked about again only when the person chose to start at or before its step.
start_step() {
  CURRENT_STEP=$1
  CURRENT=$2
  echo
  (( $1 >= START )) && return 0
  echo "$1. ✓ $2: done on an earlier run, so it is skipped."
  return 1
}
keep_saved_secret() {
  local name="$1" step="$2" answer=""
  secret_saved "$name" || return 1
  if [[ -z "$from" ]] || (( from > step )); then
    echo "$step. ✓ $name is already saved in Firebase, so this step is skipped."
    return 0
  fi
  printf '%s. %s is already saved in Firebase. Replace it (this adds a version and keeps the old one)? [y/N] ' "$step" "$name"
  read -r answer || true
  [[ "$answer" =~ ^[Yy] ]] && return 1
  echo "   Kept the saved $name."
  return 0
}

trap 'status=$?; (( status == 0 )) || { echo "✗ Stopped at step $CURRENT_STEP: $CURRENT." >&2; echo "  Fix that and run npm run mcp:setup again to pick up from step $CURRENT_STEP (or add -- --restart to start over)." >&2; }' EXIT

need curl "It ships with macOS and most Linux systems."
need node "Install Node 20 or later."
need firebase "Install it with: npm install -g firebase-tools"
source scripts/lib/firebaseLogin.sh; require_firebase_login
[[ -t 0 ]] || { echo "✗ Run this in a terminal, so you can paste into it." >&2; exit 1; }

[[ "${1:-}" == "--restart" ]] && rm -f "$PROGRESS_FILE"
START=${from:-$(( $(confirmed_step) + 1 ))}
echo "Assistant sign-in runs on WorkOS AuthKit (free up to 1 million monthly users)."
if (( START > 1 )); then
  echo "Picking up at step $START. To start over: npm run mcp:setup -- --restart   To go to a step: npm run mcp:setup -- --from <step>"
fi

if start_step 1 "the WorkOS account"; then
  echo "1. Open $DASHBOARD and sign up or sign in. At the top left, switch to the Production environment."
  pause "   Press Enter when you're in Production. "
  remember_step 1
fi

if start_step 2 "the Connect configuration"; then
  echo "2. In the left menu open Connect, then Configuration, and set:"
  echo "     - Client ID Metadata Document: on   (Claude uses this)"
  echo "     - Dynamic Client Registration: on   (Gemini uses this)"
  echo "     - Login URI: $LOGIN_URI"
  pause "   Press Enter when those three are saved. "
  remember_step 2
fi

if start_step 3 "the resource indicators"; then
  echo "3. On the same Connect page, find Resource Indicators and add each address below."
  for resource in "${RESOURCES[@]}"; do echo "     - $resource"; done
  echo "   Then open the ⋯ menu beside ${RESOURCES[0]} and choose Set as default"
  echo "   (for assistants that don't say which server they want)."
  pause "   Press Enter when they're added. "
  remember_step 3
fi

CURRENT_STEP=4
CURRENT="the AuthKit domain"
echo
if ! keep_saved_secret WORKOS_AUTHKIT_DOMAIN 4; then
  echo "4. Open Domains in the left menu and copy the AuthKit domain (it ends in authkit.app, or is your own custom domain)."
  domain=""
  until [[ -n "$domain" ]]; do
    printf '   Paste it here and press Enter: '
    read -r domain || true
    domain=${domain//[[:space:]]/}
    domain=${domain#https://}
    domain=${domain%%/*}
  done
  metadata=$(curl -s --max-time 15 "https://$domain/.well-known/oauth-authorization-server") || true
  [[ -n "$metadata" ]] || { echo "✗ Nothing answered at $domain. Check the domain you pasted." >&2; exit 1; }
  DOMAIN="$domain" node -e '
    const m = JSON.parse(require("fs").readFileSync(0, "utf8"));
    if (m.issuer !== `https://${process.env.DOMAIN}`) {
      console.error("✗ That is not the AuthKit domain: its issuer differs. Copy the domain from Domains again.");
      process.exit(1);
    }
    if (!m.registration_endpoint) {
      console.error("⚠ AuthKit offers no client registration yet, so Gemini cannot connect. Check Dynamic Client Registration is on in step 2.");
    }
  ' <<<"$metadata"
  echo "✓ AuthKit answers at $domain"
  CURRENT="saving WORKOS_AUTHKIT_DOMAIN"
  save_secret WORKOS_AUTHKIT_DOMAIN "$domain"
  echo "✓ WORKOS_AUTHKIT_DOMAIN saved in Firebase"
fi
remember_step 4

CURRENT_STEP=5
CURRENT="the API key"
echo
if ! keep_saved_secret WORKOS_API_KEY 5; then
  echo "5. Open API Keys in the left menu (under Developer) and copy the Production secret key (it starts with sk_)."
  printf '   Paste it here (it stays hidden) and press Enter: '
  read -rs key || true
  echo
  key=${key//[[:space:]]/}
  [[ "$key" == sk_* ]] || { echo "✗ That isn't a WorkOS secret key (those start with sk_). Copy it again from API Keys. Nothing was saved." >&2; exit 1; }
  # Listing one user reads only. The key goes to curl's stdin as a header file, never argv.
  status=$(printf 'Authorization: Bearer %s\n' "$key" \
    | curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H @- "https://api.workos.com/user_management/users?limit=1") || true
  case "$status" in
    200) echo "✓ WorkOS accepted the key" ;;
    000) echo "✗ Couldn't reach WorkOS: check your connection and run this again. Nothing was saved." >&2; exit 1 ;;
    *) echo "✗ WorkOS answered $status: the key is wrong, incomplete, from another environment or deleted. Nothing was saved." >&2; exit 1 ;;
  esac
  CURRENT="saving WORKOS_API_KEY"
  save_secret WORKOS_API_KEY "$key"
  echo "✓ WORKOS_API_KEY saved in Firebase"
fi
remember_step 5

CURRENT="finishing"
echo
echo "✓ Assistant sign-in is set up. Once the PR merges and deploys, turn on \"Connect assistants\" for yourself"
echo "  in the admin dashboard's Features tab, then follow Helm > Settings > Connected assistants."
