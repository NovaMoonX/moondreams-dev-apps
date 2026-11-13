#!/usr/bin/env bash
# Saves the Google OAuth client from the owner's own machine as the GOOGLE_OAUTH_CLIENT secret, after Google confirms the pair is right; nothing is written to disk and nothing secret is printed.
#   npm run connections:google-secrets
# Run `npm run connections:google-setup` first for the console steps that create the client.
set -euo pipefail

PROJECT=moondreams-dev-apps
SECRET=GOOGLE_OAUTH_CLIENT
CREDENTIALS_PAGE="https://console.cloud.google.com/apis/credentials?project=$PROJECT"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "✗ $1 isn't installed. $2" >&2; exit 1; }
}

need curl "It ships with macOS and most Linux systems."
need gcloud "Install it from https://cloud.google.com/sdk/docs/install and run: gcloud auth login"
[[ -t 0 ]] || { echo "✗ Run this in a terminal, so you can paste the values." >&2; exit 1; }

echo "1. Open $CREDENTIALS_PAGE and open the Web OAuth client."
printf '2. Paste the client ID here and press Enter: '
read -r client_id || true
printf '3. Paste the client secret here (it stays hidden) and press Enter: '
read -rs client_secret || true
echo
client_id=${client_id//[[:space:]]/}
client_secret=${client_secret//[[:space:]]/}
[[ -n "$client_id" && -n "$client_secret" ]] || { echo "✗ Both are needed; nothing was saved." >&2; exit 1; }

# A made-up code can't succeed: Google answers invalid_grant when the pair is right and invalid_client or unauthorized_client when it isn't.
# The values go to curl on stdin, never argv or a file.
answer=$(printf 'client_id=%s&client_secret=%s&code=not-a-real-code&grant_type=authorization_code&redirect_uri=https://apps.moondreams.dev/helm' \
  "$client_id" "$client_secret" \
  | curl -s -X POST https://oauth2.googleapis.com/token \
    -H 'Content-Type: application/x-www-form-urlencoded' --data-binary @-) || true
case "$answer" in
  *'"invalid_grant"'*) echo "✓ Google accepted the client ID and secret" ;;
  *'"invalid_client"'*|*'"unauthorized_client"'*)
    echo "✗ Google doesn't recognise this pair: check the ID and secret were copied whole. Nothing was saved." >&2
    exit 1 ;;
  '') echo "✗ Couldn't reach Google: check your connection and run this again. Nothing was saved." >&2; exit 1 ;;
  *) echo "✗ Google gave an answer this script doesn't know, so nothing was saved. Run it again, and if it repeats, check the client is a Web application." >&2; exit 1 ;;
esac

json=$(printf '{"clientId":"%s","clientSecret":"%s"}' "$client_id" "$client_secret")
if gcloud secrets describe "$SECRET" --project="$PROJECT" >/dev/null 2>&1; then
  printf %s "$json" | gcloud secrets versions add "$SECRET" --data-file=- --project="$PROJECT" >/dev/null
  echo "✓ Added a new version of $SECRET"
else
  printf %s "$json" | gcloud secrets create "$SECRET" --replication-policy=automatic --data-file=- --project="$PROJECT" >/dev/null
  echo "✓ Created $SECRET"
fi
echo "Done. The connection functions read it when they deploy; nothing else to do."
