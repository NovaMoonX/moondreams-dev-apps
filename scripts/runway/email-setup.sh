#!/usr/bin/env bash
# Sets up Runway's purchases-from-email intake: one shared secret saved in Firebase and on the Cloudflare email worker, then the Cloudflare Email Routing clicks.
# Each person's address is runway+<token>@apps.moondreams.dev: Cloudflare has no catch-all on a subdomain, so one rule plus plus addressing reaches every token.
# The secret is generated here, never printed or written to disk. Safe to re-run.
#   npm run runway:email-setup                 picks up where the last run stopped
#   npm run runway:email-setup -- --from 3     starts at step 3 (a start at step 2 restarts at step 1: the secret is kept only within one run)
#   npm run runway:email-setup -- --restart    starts over from step 1
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/lib/setupState.sh

PROJECT=moondreams-dev-apps
SECRET_NAME=RUNWAY_EMAIL_WEBHOOK_SECRET
WORKER_CONFIG=workers/email-router/wrangler.toml
LAST_STEP=4
PROGRESS_FILE="${XDG_STATE_HOME:-$HOME/.local/state}/moondreams/runway-email-setup-step"
CURRENT="starting"
CURRENT_STEP=1

usage() { sed -n '5,7p' "$0" | sed 's/^# *//'; }
from=""
case "${1:-}" in
  "") ;;
  --restart) from=1 ;;
  --from)
    from="${2:-}"
    [[ "$from" =~ ^[1-9]$ ]] && (( from <= LAST_STEP )) || { echo "✗ --from takes a step number from 1 to $LAST_STEP." >&2; usage >&2; exit 1; }
    ;;
  -h|--help) usage; exit 0 ;;
  *) echo "✗ Unknown option $1." >&2; usage >&2; exit 1 ;;
esac

need() { command -v "$1" >/dev/null 2>&1 || { echo "✗ $1 isn't installed. $2" >&2; exit 1; }; }
confirmed_step() {
  local step
  step=$(cat "$PROGRESS_FILE" 2>/dev/null || true)
  [[ "$step" =~ ^[0-9]+$ ]] && echo "$step" || echo 0
}
remember_step() {
  (( $1 > $(confirmed_step) )) || return 0
  mkdir -p "$(dirname "$PROGRESS_FILE")"
  echo "$1" >"$PROGRESS_FILE"
}
start_step() {
  CURRENT_STEP=$1
  CURRENT=$2
  echo
  (( $1 >= START )) && return 0
  echo "$1. ✓ $2: done on an earlier run, so it is skipped."
  return 1
}

trap 'status=$?; (( status == 0 )) || { echo "✗ Stopped at step $CURRENT_STEP: $CURRENT." >&2; echo "  Fix that and run npm run runway:email-setup again to pick up from step $CURRENT_STEP (or add -- --restart to start over)." >&2; }' EXIT

need node "Install Node 20 or later."
need openssl "It ships with macOS and most Linux systems."
need firebase "Install it with: npm install -g firebase-tools"
source scripts/lib/firebaseLogin.sh; require_firebase_login

[[ "${1:-}" == "--restart" ]] && rm -f "$PROGRESS_FILE"
START=${from:-$(( $(confirmed_step) + 1 ))}
if (( START > LAST_STEP )); then
  echo "Every step was done on an earlier run. To redo one: npm run runway:email-setup -- --from <step>"
fi

# One value is shared by both sides, so it is made once, kept only in this process, and saved in steps 1 and 2 of the same run.
# A run that starts at step 2 cannot know the secret, so it restarts at step 1.
if (( START == 2 )); then
  echo "Step 2 needs the secret made in step 1, and that secret exists only while one run lasts, so this run starts again at step 1."
  START=1
fi
SHARED=$(openssl rand -hex 32)

if start_step 1 "the secret in Firebase"; then
  if output=$(printf %s "$SHARED" | firebase functions:secrets:set "$SECRET_NAME" --project "$PROJECT" --data-file=- 2>&1); then
    echo "1. ✓ Saved $SECRET_NAME in Firebase."
  else
    echo "✗ Firebase couldn't save $SECRET_NAME. It said:" >&2
    sed 's/^/     /' <<<"$output" >&2
    exit 1
  fi
  remember_step 1
fi

if start_step 2 "the secret on the email worker"; then
  # The worker must exist before a secret can be set on it, so the first deploy happens here; the merge workflow redeploys it on later changes.
  echo "2. Deploying the email worker and giving it the same secret (a Cloudflare login opens if you aren't signed in)."
  if [[ ! -d node_modules/postal-mime ]]; then
    echo "   Installing the packages the worker is built from (this checkout's were installed before it needed them)."
    npm ci --no-audit --no-fund
  fi
  npx wrangler deploy -c "$WORKER_CONFIG"
  printf %s "$SHARED" | npx wrangler secret put INGEST_SECRET -c "$WORKER_CONFIG"
  echo "2. ✓ The worker has INGEST_SECRET."
  remember_step 2
fi

if start_step 3 "Cloudflare Email Routing"; then
  if ask_yes "3. Is Email Routing on for apps.moondreams.dev, with plus addressing on and a rule sending runway@apps.moondreams.dev to the worker mdd-apps-email-router?"; then
    echo "3. ✓ Noted."
  else
    echo "3. In the Cloudflare dashboard. moondreams.dev's own mail is on Google: if Cloudflare ever offers to change moondreams.dev's MX records, stop and cancel."
    echo "     a. Open moondreams.dev, then Email, then Email Routing, then Settings."
    echo "     b. Under Subdomains, add apps.moondreams.dev and accept the records it adds to that subdomain."
    echo "     c. On the same Settings page, turn on Subaddressing (plus addressing)."
    echo "     d. Open Routing rules, Create address: custom address runway@apps.moondreams.dev, action Send to a Worker, worker mdd-apps-email-router. Save it active."
    printf '   Press Enter when the rule is active. '
    read -r _ || true
  fi
  remember_step 3
fi

if start_step 4 "the feature switch"; then
  echo "4. Open https://apps.moondreams.dev/admin, then Features, and turn on \"Purchases from email\" for yourself (testing) or for everyone."
  printf '   Press Enter when it is on. '
  read -r _ || true
  remember_step 4
fi

echo
echo "✓ Purchases from email are set up. Open Runway's Settings, copy your address and forward a bank alert to it."
