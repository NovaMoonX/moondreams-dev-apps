#!/usr/bin/env bash
# Sets up assistant sign-in (WorkOS AuthKit) for the site's MCP servers: walks the dashboard steps, checks each one, and saves the two Functions secrets.
# Keys are read hidden, checked against WorkOS first, and never written to disk, argv or output. Safe to re-run.
#   npm run mcp:setup
set -euo pipefail
cd "$(dirname "$0")/../.."

PROJECT=moondreams-dev-apps
DASHBOARD="https://dashboard.workos.com"
LOGIN_URI="https://apps.moondreams.dev/connect-assistant"
RESOURCES=("https://apps.moondreams.dev/mcp/helm")
CURRENT="starting"
trap 'status=$?; (( status == 0 )) || echo "✗ Stopped at: $CURRENT. Fix that and run npm run mcp:setup again; finished steps are skipped." >&2' EXIT

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "✗ $1 isn't installed. $2" >&2; exit 1; }
}
pause() { printf '%s' "$1"; read -r _ || true; }
secret_saved() { firebase functions:secrets:get "$1" --project "$PROJECT" >/dev/null 2>&1; }

need curl "It ships with macOS and most Linux systems."
need node "Install Node 20 or later."
need firebase "Install it with: npm install -g firebase-tools"
source scripts/lib/firebaseLogin.sh; require_firebase_login
[[ -t 0 ]] || { echo "✗ Run this in a terminal, so you can paste into it." >&2; exit 1; }

echo "Assistant sign-in runs on WorkOS AuthKit (free up to 1 million monthly users)."
echo

CURRENT="the WorkOS account"
echo "1. Open $DASHBOARD and sign up or sign in. At the top left, switch to the Production environment."
pause "   Press Enter when you're in Production. "

CURRENT="the Connect configuration"
echo
echo "2. In the left menu open Connect, then Configuration, and set:"
echo "     - Client ID Metadata Document: on   (Claude uses this)"
echo "     - Dynamic Client Registration: on   (Gemini uses this)"
echo "     - Login URI: $LOGIN_URI"
pause "   Press Enter when those three are saved. "

CURRENT="the resource indicators"
echo
echo "3. On the same Connect page, find Resource Indicators and add each address below."
for resource in "${RESOURCES[@]}"; do echo "     - $resource"; done
echo "   Then open the ⋯ menu beside ${RESOURCES[0]} and choose Set as default"
echo "   (for assistants that don't say which server they want)."
pause "   Press Enter when they're added. "

CURRENT="the AuthKit domain"
echo
if secret_saved WORKOS_AUTHKIT_DOMAIN; then
  echo "4. ✓ WORKOS_AUTHKIT_DOMAIN is already saved in Firebase, so this step is skipped."
else
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
printf %s "$domain" | firebase functions:secrets:set WORKOS_AUTHKIT_DOMAIN --project "$PROJECT" --data-file=- >/dev/null
echo "✓ WORKOS_AUTHKIT_DOMAIN saved in Firebase"
fi

CURRENT="the API key"
echo
if secret_saved WORKOS_API_KEY; then
  echo "5. ✓ WORKOS_API_KEY is already saved in Firebase, so this step is skipped."
else
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
  printf %s "$key" | firebase functions:secrets:set WORKOS_API_KEY --project "$PROJECT" --data-file=- >/dev/null
  echo "✓ WORKOS_API_KEY saved in Firebase"
fi

CURRENT="finishing"
echo
echo "✓ Assistant sign-in is set up. Once the PR merges and deploys, turn on \"Connect assistants\" for yourself"
echo "  in the admin dashboard's Features tab, then follow Helm > Settings > Connected assistants."
