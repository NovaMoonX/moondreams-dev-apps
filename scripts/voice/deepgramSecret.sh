#!/usr/bin/env bash
# Saves the Deepgram API key as the Functions secret DEEPGRAM_API_KEY from the owner's own machine; the key is read hidden, checked against Deepgram first, and never written to disk, argv or output.
#   npm run voice:deepgram-secret
set -euo pipefail

PROJECT=moondreams-dev-apps
KEYS_PAGE="https://console.deepgram.com"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "✗ $1 isn't installed. $2" >&2; exit 1; }
}

need curl "It ships with macOS and most Linux systems."
need firebase "Install it with: npm install -g firebase-tools"
firebase login:list 2>/dev/null | grep -q '@' || { echo "✗ The firebase CLI isn't signed in. Run: firebase login" >&2; exit 1; }
[[ -t 0 ]] || { echo "✗ Run this in a terminal, so you can paste the key." >&2; exit 1; }

echo "1. Open $KEYS_PAGE, go to API Keys, click \"Create a key\", and give it the \"Member\" role."
echo "   (A new Deepgram account comes with free credit, enough for the whole benchmark.)"
printf '2. Paste the key here (it stays hidden) and press Enter: '
read -rs key || true
echo
key=${key//[[:space:]]/}
[[ -n "$key" ]] || { echo "✗ No key was entered; nothing was saved." >&2; exit 1; }

# Listing projects reads only and creates nothing. The key goes to curl's stdin as a header file, never argv.
status=$(printf 'Authorization: Token %s\n' "$key" \
  | curl -s -o /dev/null -w '%{http_code}' -H @- https://api.deepgram.com/v1/projects) || true
[[ "$status" == "200" ]] && echo "✓ Deepgram accepted the key"
if [[ "$status" == "000" ]]; then
  echo "✗ Couldn't reach Deepgram: check your connection and run this again. Nothing was saved." >&2
  exit 1
fi
if [[ "$status" != "200" ]]; then
  echo "✗ Deepgram answered $status: the key is wrong, was pasted incompletely or has been deleted. Nothing was saved." >&2
  exit 1
fi

printf %s "$key" | firebase functions:secrets:set DEEPGRAM_API_KEY --project "$PROJECT" --data-file=-
echo "✓ DEEPGRAM_API_KEY saved in Firebase (running this again adds a new version)"

# Functions read this secret at run time without binding it, so the runtime account needs read access to it.
grant_read() {
  local name="$1"
  if command -v gcloud >/dev/null 2>&1; then
    local number
    number=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
    gcloud secrets add-iam-policy-binding "$name" --project="$PROJECT" \
      --member="serviceAccount:${number}-compute@developer.gserviceaccount.com" \
      --role="roles/secretmanager.secretAccessor" >/dev/null
    echo "✓ The functions can read $name"
  else
    echo "• gcloud isn't installed, so give the functions read access in the browser (one time):"
    echo "  1. Open https://console.cloud.google.com/security/secret-manager/secret/$name/permissions?project=$PROJECT"
    echo "  2. Grant access → New principal: the account ending in -compute@developer.gserviceaccount.com"
    echo "  3. Role: Secret Manager Secret Accessor → Save"
  fi
}
grant_read DEEPGRAM_API_KEY

echo
echo "Last, set a low usage alert so a surprise never costs much:"
echo "  1. Open $KEYS_PAGE and click Billing in the left menu"
echo "  2. Click \"Usage alerts\""
echo "  3. Click \"Add alert\", type a small amount (for example 5 dollars) and your email, then click \"Save\""
