#!/usr/bin/env bash
# Saves the Anthropic API key as the Functions secret ANTHROPIC_API_KEY from the owner's own machine; the key is read hidden, checked against Anthropic first, and never written to disk, argv or output.
#   npm run ai:anthropic-secret
set -euo pipefail

PROJECT=moondreams-dev-apps
KEYS_PAGE="https://console.anthropic.com/settings/keys"
LIMITS_PAGE="https://console.anthropic.com/settings/limits"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "✗ $1 isn't installed. $2" >&2; exit 1; }
}

need curl "It ships with macOS and most Linux systems."
need firebase "Install it with: npm install -g firebase-tools"
source "$(dirname "$0")/../lib/firebaseLogin.sh"; require_firebase_login
source "$(dirname "$0")/../lib/functionsSecret.sh"; exit_if_secret_saved ANTHROPIC_API_KEY "$PROJECT"
[[ -t 0 ]] || { echo "✗ Run this in a terminal, so you can paste the key." >&2; exit 1; }

echo "1. Open $KEYS_PAGE (Anthropic Console → Settings → API keys), click \"Create Key\", and fill it in:"
echo "     - Name: moondreams-apps"
echo "     - Workspace: Default (leave it)"
echo "     - Expiry, if the dialog asks for one: none, or the furthest date it allows (Helm stops answering the day the key expires)"
echo "   Click \"Add\", then copy the key now: Anthropic shows it only once."
printf '2. Paste the key here (it stays hidden) and press Enter: '
read -rs key || true
echo
key=${key//[[:space:]]/}
[[ -n "$key" ]] || { echo "✗ No key was entered; nothing was saved." >&2; exit 1; }

# Listing models reads only and creates nothing. The key goes to curl's stdin as a header file, never argv.
status=$(printf 'x-api-key: %s\nanthropic-version: 2023-06-01\n' "$key" \
  | curl -s -o /dev/null -w '%{http_code}' -H @- https://api.anthropic.com/v1/models) || true
[[ "$status" == "200" ]] && echo "✓ Anthropic accepted the key"
if [[ "$status" == "000" ]]; then
  echo "✗ Couldn't reach Anthropic: check your connection and run this again. Nothing was saved." >&2
  exit 1
fi
if [[ "$status" != "200" ]]; then
  echo "✗ Anthropic answered $status: the key is wrong, was pasted incompletely or has been revoked. Nothing was saved." >&2
  exit 1
fi

printf %s "$key" | firebase functions:secrets:set ANTHROPIC_API_KEY --project "$PROJECT" --data-file=-
echo "✓ ANTHROPIC_API_KEY saved in Firebase (running this again adds a new version)"

echo
echo "Last, cap what Helm can spend in the Anthropic Console:"
echo "  1. Open $LIMITS_PAGE"
echo "  2. Under \"Spend limits\", click \"Change limit\" next to Monthly spend limit"
echo "  3. Type the most you are happy to pay in a month, then click \"Save\""
echo "  4. Click \"Set notification\" (or \"Add alert\"), enter a lower amount and your email, then click \"Save\""
echo "Helm also stops its own calls at \$10 a day; this limit is the one Anthropic enforces."
