#!/usr/bin/env bash
# Creates Helm's first master keyring from the owner's own machine: nothing is written to disk and no key bytes are printed.
#   npm run helm:keyring                    # creates HELM_MASTER_KEYS (one key, m1) with a 90-day destruction delay, then writes its canary
#   npm run helm:keyring -- --canary-only   # only the canary, when the secret exists and the canary step failed
set -euo pipefail

PROJECT=moondreams-dev-apps
SECRET=HELM_MASTER_KEYS
KEY_ID=m1

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "✗ $1 isn't installed. $2" >&2; exit 1; }
}

need gcloud "Install it from https://cloud.google.com/sdk/docs/install and run: gcloud auth login"
need openssl "It ships with macOS and most Linux systems."
need npx "Install Node.js from https://nodejs.org"

write_canary() {
  npx tsx scripts/appKeys/publishKeyring.ts --app helm --project "$PROJECT" --canary-only --new-id "$KEY_ID"
}

if [[ "${1:-}" == "--canary-only" ]]; then
  write_canary
  echo "✓ Wrote the canary for $KEY_ID."
  exit 0
fi

if gcloud secrets describe "$SECRET" --project="$PROJECT" >/dev/null 2>&1; then
  echo "✗ $SECRET already exists, so nothing was changed. To add a key: npx tsx scripts/appKeys/publishKeyring.ts --app helm --project $PROJECT --new-id m2" >&2
  exit 1
fi

# The key goes from openssl into gcloud on a pipe, never into argv or a file.
openssl rand -hex 32 \
  | { read -r key; printf '{"current":"%s","keys":{"%s":"%s"}}' "$KEY_ID" "$KEY_ID" "$key"; } \
  | gcloud secrets create "$SECRET" --replication-policy=automatic --version-destroy-ttl=90d --data-file=- --project="$PROJECT" >/dev/null
echo "✓ Created $SECRET with one key ($KEY_ID) and a 90-day destruction delay."

write_canary || { echo "✗ The secret exists but its canary was not written. Run: npm run helm:keyring -- --canary-only" >&2; exit 1; }
echo "✓ Wrote the canary for $KEY_ID."

echo
echo "Last step, escrow (do it now: losing the keyring loses every Helm):"
echo "  1. Read the keyring into your password manager without printing it here:"
echo "       gcloud secrets versions access latest --secret=$SECRET --project=$PROJECT | pbcopy   # or wl-copy / xclip -selection clipboard"
echo "  2. Save it as a note named \"Helm master keyring\", and keep a second copy in a second secure account."
echo "  3. Then add the three alert policies from the keyring runbook in functions/README.md (read RUNWAY as HELM)."
