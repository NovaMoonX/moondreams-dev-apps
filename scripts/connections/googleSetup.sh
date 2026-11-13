#!/usr/bin/env bash
# Walks through the Google Cloud steps that let people connect a Google account, and turns on the Calendar, Gmail and Drive APIs where a command can.
#   npm run connections:google-setup
set -euo pipefail
source "$(dirname "$0")/../lib/copyFields.sh"

PROJECT=moondreams-dev-apps
CONSENT_PAGE="https://console.cloud.google.com/apis/credentials/consent?project=$PROJECT"
CREDENTIALS_PAGE="https://console.cloud.google.com/apis/credentials?project=$PROJECT"

if command -v gcloud >/dev/null 2>&1; then
  gcloud services enable calendar-json.googleapis.com gmail.googleapis.com drive.googleapis.com people.googleapis.com --project "$PROJECT"
  echo "✓ The Google Calendar, Gmail, Drive and People APIs are enabled for $PROJECT"
else
  echo "gcloud isn't installed, so enable the APIs by hand:"
  echo "  Open https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=$PROJECT and click \"Enable\"."
  echo "  Open https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=$PROJECT and click \"Enable\"."
  echo "  Open https://console.cloud.google.com/apis/library/drive.googleapis.com?project=$PROJECT and click \"Enable\"."
  echo "  Open https://console.cloud.google.com/apis/library/people.googleapis.com?project=$PROJECT and click \"Enable\"."
fi

echo
echo "The clicks no command can do (each value is copied for you; press Enter after pasting it):"
echo "  1. Open $CONSENT_PAGE"
echo "     - User type: External, then Create (skip if it already exists)."
echo "     - Audience: leave it \"In production\" (click \"Publish app\", then \"Confirm\" if it says Testing). This consent screen belongs to the whole Google Cloud project, so Testing would also block every app's Google sign-in for anyone not on the test-user list, and expire Gmail and Calendar connections after 7 days."
echo "     - Data access: click \"Add or remove scopes\", paste into \"Manually add scopes\", then Add to table, Update and Save."
echo "       The links are the scopes' real names: Google identifies each permission by its URL. All five are read-only."
copy_each "Scopes (one per line)" "openid
email
https://www.googleapis.com/auth/calendar.readonly
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/drive.readonly
https://www.googleapis.com/auth/contacts.readonly"
echo "     Google marks Gmail's and Drive's as restricted. Until Google reviews the app, anyone connecting them sees a \"hasn't verified this app\" screen (Advanced, then Continue) and the app is capped at 100 people. Contacts is read-only; Google's classification of it is unconfirmed."
echo "  2. Open $CREDENTIALS_PAGE, then Create credentials, OAuth client ID, and choose Application type: Web application."
copy_each "Name" "Moondreams apps web" "Authorized JavaScript origins (Add URI)" "https://apps.moondreams.dev" "Authorized redirect URIs (Add URI)" "https://apps.moondreams.dev/helm"
echo "  3. Save the client, then run: npm run connections:google-secrets"
echo "     It asks for the client ID and secret (the secret stays hidden), checks them with Google and saves them."
