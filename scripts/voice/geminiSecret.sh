#!/usr/bin/env bash
# Saves the Gemini API key as the Functions secret GEMINI_API_KEY from the owner's own machine; the key is read hidden, checked against Google first, and never written to disk, argv or output.
#   npm run voice:gemini-secret
set -euo pipefail

PROJECT=moondreams-dev-apps
KEYS_PAGE="https://aistudio.google.com/apikey"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "✗ $1 isn't installed. $2" >&2; exit 1; }
}

need curl "It ships with macOS and most Linux systems."
need firebase "Install it with: npm install -g firebase-tools"
source "$(dirname "$0")/../lib/firebaseLogin.sh"; require_firebase_login
source "$(dirname "$0")/../lib/functionsSecret.sh"; exit_if_secret_saved GEMINI_API_KEY "$PROJECT"
[[ -t 0 ]] || { echo "✗ Run this in a terminal, so you can paste the key." >&2; exit 1; }

echo "1. Open $KEYS_PAGE and click \"Create API key\":"
echo "     - Key name: moondreams-voice-benchmark"
echo "     - Project: moondreams-dev-apps if it is listed (import it first if not)"
echo "   Please pick a project that has billing turned on: on Google's free tier, what is sent may be used to improve its products."
printf '2. Paste the key here (it stays hidden) and press Enter: '
read -rs key || true
echo
key=${key//[[:space:]]/}
[[ -n "$key" ]] || { echo "✗ No key was entered; nothing was saved." >&2; exit 1; }

# Listing models reads only and creates nothing. The key goes to curl's stdin as a header file, never argv.
status=$(printf 'x-goog-api-key: %s\n' "$key" \
  | curl -s -o /dev/null -w '%{http_code}' -H @- https://generativelanguage.googleapis.com/v1beta/models) || true
[[ "$status" == "200" ]] && echo "✓ Google accepted the key"
if [[ "$status" == "000" ]]; then
  echo "✗ Couldn't reach Google: check your connection and run this again. Nothing was saved." >&2
  exit 1
fi
if [[ "$status" != "200" ]]; then
  echo "✗ Google answered $status: the key is wrong, was pasted incompletely or has been deleted. Nothing was saved." >&2
  exit 1
fi

printf %s "$key" | firebase functions:secrets:set GEMINI_API_KEY --project "$PROJECT" --data-file=-
echo "✓ GEMINI_API_KEY saved in Firebase (running this again adds a new version)"
