#!/usr/bin/env bash
# Turns on Google's Text-to-Speech API for the project and checks it answers; nothing secret is created or kept.
#   npm run voice:google-setup
set -euo pipefail

PROJECT=moondreams-dev-apps
API_PAGE="https://console.cloud.google.com/apis/library/texttospeech.googleapis.com?project=$PROJECT"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "✗ $1 isn't installed. $2" >&2; exit 1; }
}

need curl "It ships with macOS and most Linux systems."

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud isn't installed, so here are the clicks instead:"
  echo "  1. Open $API_PAGE"
  echo "  2. Click \"Enable\""
  echo "The benchmark skips the Google voices until \"gcloud auth application-default login\" has been run once on this machine."
  exit 0
fi

gcloud services enable texttospeech.googleapis.com --project "$PROJECT"
echo "✓ Text-to-Speech is enabled for $PROJECT"

if [[ -t 0 ]]; then
  printf 'Sign in so the benchmark can use the Google voices from this machine? [Y/n] '
  read -r answer || true
  if [[ ! "$answer" =~ ^[Nn] ]]; then
    gcloud auth application-default login
  fi
fi

# Listing voices reads only. The token goes to curl's stdin as a header file, never argv.
status=$(printf 'Authorization: Bearer %s\nx-goog-user-project: %s\n' "$(gcloud auth print-access-token)" "$PROJECT" \
  | curl -s -o /dev/null -w '%{http_code}' -H @- "https://texttospeech.googleapis.com/v1/voices?languageCode=en-US") || true
if [[ "$status" == "200" ]]; then
  echo "✓ Google answered: the voices are ready"
else
  echo "✗ Google answered $status: sign in with \"gcloud auth login\", give the API a minute after enabling it, and run this again." >&2
  exit 1
fi
