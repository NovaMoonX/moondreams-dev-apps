#!/usr/bin/env bash
# Sets up the shared email intake (A-List's tickets from email today, Runway's purchases from email too): one secret saved in Firebase and on the Cloudflare email worker, then the Cloudflare Email Routing clicks.
# Each app's addresses are <prefix>-<token>@moondreamsmail.com (runway-, amc-), a receive-only domain whose catch-all sends every app's mail to the email worker.
# The secret is generated here, never printed or written to disk. Safe to re-run.
#   npm run email:setup                 picks up where the last run stopped
#   npm run email:setup -- --from 3     starts at step 3 (a start at step 2 restarts at step 1: the secret is kept only within one run)
#   npm run email:setup -- --restart    starts over from step 1
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/lib/setupState.sh

PROJECT=moondreams-dev-apps
SECRET_NAME=EMAIL_WEBHOOK_SECRET
# Runway used to read this name; its value is still reused so the worker's one secret keeps working.
LEGACY_SECRET_NAME=RUNWAY_EMAIL_WEBHOOK_SECRET
WORKER_CONFIG=workers/email-router/wrangler.toml
LAST_STEP=4
PROGRESS_FILE="${XDG_STATE_HOME:-$HOME/.local/state}/moondreams/email-setup-step"
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

trap 'status=$?; (( status == 0 )) || { echo "✗ Stopped at step $CURRENT_STEP: $CURRENT." >&2; echo "  Fix that and run npm run email:setup again to pick up from step $CURRENT_STEP (or add -- --restart to start over)." >&2; }' EXIT

need node "Install Node 20 or later."
need openssl "It ships with macOS and most Linux systems."
need firebase "Install it with: npm install -g firebase-tools"
source scripts/lib/firebaseLogin.sh; require_firebase_login

[[ "${1:-}" == "--restart" ]] && rm -f "$PROGRESS_FILE"
START=${from:-$(( $(confirmed_step) + 1 ))}
if (( START > LAST_STEP )); then
  echo "Every step was done on an earlier run. To redo one: npm run email:setup -- --from <step>"
fi

# Runway's live function already checks the worker's secret; reusing its value means nothing that works today has to be redeployed.
REUSED=0
if SHARED=$(firebase functions:secrets:access "$LEGACY_SECRET_NAME" --project "$PROJECT" 2>/dev/null) && [[ -n "$SHARED" ]]; then
  REUSED=1
else
  SHARED=$(openssl rand -hex 32)
fi

# One value is shared by both sides, so it is made once, kept only in this process, and saved in steps 1 and 2 of the same run.
# A run that starts at step 2 cannot know the secret, so it restarts at step 1.
if (( START == 2 && REUSED == 0 )); then
  echo "Step 2 needs the secret made in step 1, and that secret exists only while one run lasts, so this run starts again at step 1."
  START=1
fi

if start_step 1 "the secret in Firebase"; then
  names=("$SECRET_NAME")
  (( REUSED == 1 )) || names+=("$LEGACY_SECRET_NAME")
  (( REUSED == 1 )) && echo "1. Runway's email secret already exists, so the shared one takes the same value."
  for name in "${names[@]}"; do
    if output=$(printf %s "$SHARED" | firebase functions:secrets:set "$name" --project "$PROJECT" --data-file=- 2>&1); then
      echo "1. ✓ Saved $name in Firebase."
    else
      echo "✗ Firebase couldn't save $name. It said:" >&2
      sed 's/^/     /' <<<"$output" >&2
      exit 1
    fi
  done
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
  if ask_yes "3. Is Email Routing on for moondreamsmail.com, with its catch-all sending to the worker mdd-apps-email-router?"; then
    echo "3. ✓ Noted."
  else
    echo "3. In the Cloudflare dashboard (this is moondreamsmail.com, never moondreams.dev, whose mail is on Google):"
    echo "     a. Open moondreamsmail.com, then Email, then Email Routing, and Get started / Enable."
    echo "     b. Accept the MX, SPF and DKIM records it adds."
    echo "     c. Open Routing rules, then Catch-all address: action Send to a Worker, worker mdd-apps-email-router. Turn it on and save."
    printf '   Press Enter when the catch-all is active. '
    read -r _ || true
  fi
  remember_step 3
fi

if start_step 4 "the feature switch"; then
  echo "4. Open https://apps.moondreams.dev/admin, then Features, and turn on \"AMC emails\" for yourself (testing) or for everyone."
  printf '   Press Enter when it is on. '
  read -r _ || true
  remember_step 4
fi

echo
echo "✓ The email intake is set up. Open A-List, copy your address and forward an AMC reservation email to it."
