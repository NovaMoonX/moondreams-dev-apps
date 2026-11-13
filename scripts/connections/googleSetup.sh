#!/usr/bin/env bash
# Walks through the Google Cloud steps that let people connect a Google account, and turns on the Calendar, Gmail and Drive APIs where a command can.
#   npm run connections:google-setup
set -euo pipefail

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
echo "The clicks no command can do:"
echo "  1. Open $CONSENT_PAGE"
echo "     - User type: External, then Create (skip if it already exists)."
echo "     - Publishing status: Testing."
echo "     - Test users: add your own Google address (and any other account you want to try)."
echo "     - Scopes: add openid, email, https://www.googleapis.com/auth/calendar.readonly and https://www.googleapis.com/auth/gmail.readonly and https://www.googleapis.com/auth/drive.readonly and https://www.googleapis.com/auth/contacts.readonly."
echo "       Gmail's and Drive's scopes are restricted: only the test users can connect them until Google reviews the app. Contacts is read-only; Google's classification of it is unconfirmed."
echo "  2. Open $CREDENTIALS_PAGE, then Create credentials, OAuth client ID."
echo "     - Application type: Web application."
echo "     - Name: Moondreams apps web"
echo "     - Authorized JavaScript origins: https://apps.moondreams.dev"
echo "     - Authorized redirect URIs: https://apps.moondreams.dev/helm"
echo "  3. Save the client, then run: npm run connections:google-secrets"
echo "     It asks for the client ID and secret (the secret stays hidden), checks them with Google and saves them."
