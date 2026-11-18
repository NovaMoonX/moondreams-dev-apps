#!/usr/bin/env bash
# Turns on Google's Text-to-Speech API for the project, lets the functions use its Gemini voices (a whispered line) and checks it answers; nothing secret is created or kept.
# Each part checks the project first and only changes what is missing, so a re-run just reports what is already done.
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
  echo "  3. For the whispered voice: open https://console.cloud.google.com/iam-admin/iam?project=$PROJECT, edit the \"Compute Engine default service account\" row, Add another role, pick \"Vertex AI User\", Save"
  echo "The benchmark skips the Google voices until \"gcloud auth application-default login\" has been run once on this machine."
  exit 0
fi

enabled="$(gcloud services list --enabled --project "$PROJECT" --format='value(config.name)')"
turn_on() {
  if grep -qxF "$1" <<<"$enabled"; then
    echo "✓ $2 was already on for $PROJECT"
  else
    gcloud services enable "$1" --project "$PROJECT"
    echo "✓ Turned on $2 for $PROJECT"
  fi
}
turn_on texttospeech.googleapis.com "Text-to-Speech"
# Gemini voices (the whispered line) are checked against Vertex AI's predict permission on the calling account.
turn_on aiplatform.googleapis.com "Vertex AI"

number="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
member="serviceAccount:${number}-compute@developer.gserviceaccount.com"
holders="$(gcloud projects get-iam-policy "$PROJECT" --flatten='bindings[].members' \
  --filter='bindings.role=roles/aiplatform.user' --format='value(bindings.members)')"
if grep -qxF "$member" <<<"$holders"; then
  echo "✓ The functions could already use the Gemini voices (whispered lines)"
else
  gcloud projects add-iam-policy-binding "$PROJECT" --member="$member" \
    --role="roles/aiplatform.user" --condition=None >/dev/null
  echo "✓ The functions can now use the Gemini voices (whispered lines)"
fi

if gcloud auth application-default print-access-token >/dev/null 2>&1; then
  echo "✓ This machine is already signed in for the Google voices"
elif [[ -t 0 ]]; then
  printf 'Sign in so the benchmark can use the Google voices from this machine? [Y/n] '
  read -r answer || true
  if [[ ! "$answer" =~ ^[Nn] ]]; then
    gcloud auth application-default login
  fi
fi

# Listing voices reads only. The token goes to curl's stdin as a header file, never argv.
status=$(printf 'Authorization: Bearer %s\nx-goog-user-project: %s\n' "$(gcloud auth application-default print-access-token)" "$PROJECT" \
  | curl -s -o /dev/null -w '%{http_code}' -H @- "https://texttospeech.googleapis.com/v1/voices?languageCode=en-US") || true
if [[ "$status" == "200" ]]; then
  echo "✓ Google answered: the voices are ready"
else
  echo "✗ Google answered $status: run \"gcloud auth application-default login\", give the API a minute after enabling it, and run this again." >&2
  exit 1
fi
