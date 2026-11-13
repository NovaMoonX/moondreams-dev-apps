#!/usr/bin/env bash
# Every production setup step, in order; finished steps are skipped and no secret is printed, so it is safe to re-run.
# --after-deploy: only the alerts, once the merge has deployed. --dry: print the plan and write nothing.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."

PROJECT=moondreams-dev-apps
DRY=0
AFTER_DEPLOY=0
for arg in "$@"; do
  case "$arg" in
    --dry) DRY=1 ;;
    --after-deploy) AFTER_DEPLOY=1 ;;
    *) echo "✗ Unknown option $arg. Use --dry or --after-deploy." >&2; exit 1 ;;
  esac
done

CURRENT="starting"
trap 'echo "✗ Stopped at: $CURRENT. Fix that and run npm run helm:setup again; finished steps are skipped." >&2' ERR

DONE_LIST=""
SKIPPED_LIST=""
BROWSER_LIST=""
DEFERRED_LIST=""
EMAIL=""
CREATED_HELM_KEYRING=0
CREATED_CONNECTIONS_KEYRING=0
HAVE_GCLOUD=0

add() { printf -v "$1" '%s%s\n' "${!1}" "$2"; }

# Reads from the terminal; a dry run never asks, and answers the default.
ask() {
  local question="$1" default="$2" answer=""
  (( DRY )) && { [[ "$default" == "y" ]]; return; }
  if [[ "$default" == "y" ]]; then printf '%s [Y/n] ' "$question"; else printf '%s [y/N] ' "$question"; fi
  read -r answer || true
  [[ -z "$answer" ]] && answer="$default"
  [[ "$answer" =~ ^[Yy] ]]
}

pause() {
  (( DRY )) && return 0
  printf '%s' "$1"
  read -r _ || true
}

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "✗ $1 isn't installed. $2" >&2; exit 1; }
}

secret_has() {
  [[ -n "$(gcloud secrets versions list "$1" --project="$PROJECT" --limit=1 --filter='state=enabled' --format='value(name)' 2>/dev/null)" ]]
}

secret_exists() {
  gcloud secrets describe "$1" --project="$PROJECT" >/dev/null 2>&1
}

api_enabled() {
  [[ -n "$(gcloud services list --enabled --project="$PROJECT" --filter="config.name=$1" --format='value(config.name)' 2>/dev/null)" ]]
}

policies_present() {
  local have name
  have="$(gcloud alpha monitoring policies list --project="$PROJECT" --format='value(displayName)' 2>/dev/null)"
  for name in "$@"; do
    grep -qxF "$name" <<<"$have" || return 1
  done
}

job_deployed() {
  gcloud scheduler jobs list --location=us-central1 --project="$PROJECT" --format='value(name)' 2>/dev/null | grep -q "$1"
}

HELM_POLICIES=("Helm: key check failed" "Helm: key check heartbeat missing" "Helm: master keyring changed" "Voice: daily cap reached" "Voice: cloud listening unavailable")
CONNECTIONS_POLICIES=("Connections: key check failed" "Connections: key check heartbeat missing" "Connections: master keyring changed")

# step "title" detect_fn run_fn [mode]  (mode "after-deploy" marks a step that needs the functions deployed)
# detect_fn returns 0 when the step is done; run_fn does it. A dry run only reports.
step() {
  local title="$1" detect="$2" run="$3" mode="${4:-}"
  CURRENT="$title"
  if (( AFTER_DEPLOY )) && [[ "$mode" != "after-deploy" ]]; then return 0; fi
  if (( ! AFTER_DEPLOY )) && [[ "$mode" == "after-deploy" ]] && (( HAVE_GCLOUD )) && ! both_deployed; then
    echo "• $title: needs the merge deployed first, so it waits for: npm run helm:setup -- --after-deploy"
    (( DRY )) || add DEFERRED_LIST "$title"
    return 0
  fi
  if (( HAVE_GCLOUD )) && "$detect"; then
    echo "✓ $title already done"
    add DONE_LIST "$title (already done)"
    return 0
  fi
  if (( DRY )); then
    if (( HAVE_GCLOUD )); then echo "→ would run: $title"; else echo "? would run (can't check without a signed-in gcloud): $title"; fi
    return 0
  fi
  echo "→ $title…"
  "$run"
  add DONE_LIST "$title"
}

# ---- tools and sign-in

check_tools() {
  CURRENT="Checking the tools"
  if ! command -v gcloud >/dev/null 2>&1; then
    (( DRY )) && { echo "• gcloud isn't installed here; the plan below can't check what is already done."; return 0; }
    need gcloud "Install it from https://cloud.google.com/sdk/docs/install"
  fi
  if (( ! DRY )); then
    need firebase "Install it with: npm install -g firebase-tools"
    need npx "Install Node.js from https://nodejs.org"
    need openssl "It ships with macOS and most Linux systems."
    need curl "It ships with macOS and most Linux systems."
    [[ -t 0 ]] || { echo "✗ Run this in a terminal, so you can paste keys and answer questions." >&2; exit 1; }
  fi
  local account
  account="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -n1 || true)"
  if [[ -z "$account" ]]; then
    if (( DRY )); then echo "• gcloud isn't signed in; the plan below can't check what is already done."; return 0; fi
    ask "gcloud isn't signed in. Run 'gcloud auth login' now?" y || { echo "✗ Sign in first: gcloud auth login" >&2; exit 1; }
    gcloud auth login
    account="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n1)"
  fi
  if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then
    if (( DRY )); then echo "• Application default credentials are missing; the keyring canary step needs them."
    else
      ask "The canary step needs application default credentials. Run 'gcloud auth application-default login' now?" y || { echo "✗ Run: gcloud auth application-default login" >&2; exit 1; }
      gcloud auth application-default login
    fi
  fi
  if (( ! DRY )) && ! firebase login:list 2>/dev/null | grep -q '@'; then
    ask "The firebase CLI isn't signed in. Run 'firebase login' now?" y || { echo "✗ Run: firebase login" >&2; exit 1; }
    firebase login
  fi
  HAVE_GCLOUD=1
  echo "✓ Tools ready: gcloud signed in as $account, project $PROJECT"
}

# ---- keyrings

helm_keyring_done() { secret_has HELM_MASTER_KEYS; }
helm_keyring_run() { bash scripts/helm/keyring.sh; CREATED_HELM_KEYRING=1; }
connections_keyring_done() { secret_has CONNECTIONS_MASTER_KEYS; }
connections_keyring_run() { bash scripts/connections/keyring.sh; CREATED_CONNECTIONS_KEYRING=1; }

# The canary is created, never overwritten, so an existing one is the finished state.
canary_run() {
  local out
  if out="$(bash "scripts/$1/keyring.sh" --canary-only 2>&1)"; then
    echo "  ✓ Wrote the canary"
  elif grep -qi 'already.exists' <<<"$out"; then
    echo "  ✓ The canary was already there"
  else
    echo "$out" >&2
    return 1
  fi
}
never_done() { return 1; }
helm_canary_run() { canary_run helm; }
connections_canary_run() { canary_run connections; }

# ---- secrets and APIs

anthropic_done() { secret_has ANTHROPIC_API_KEY; }
anthropic_run() {
  bash scripts/ai/anthropicSecret.sh
  add BROWSER_LIST "Anthropic spend cap (console.anthropic.com/settings/limits)"
  pause "Set the spend cap with the steps above, then press Enter: "
}

google_done() { secret_has GOOGLE_OAUTH_CLIENT && api_enabled calendar-json.googleapis.com && api_enabled gmail.googleapis.com && api_enabled drive.googleapis.com && api_enabled people.googleapis.com; }
google_run() {
  bash scripts/connections/googleSetup.sh
  if ! secret_has GOOGLE_OAUTH_CLIENT; then
    echo
    echo "  Then, on that same consent screen page, open Audience and click \"Publish app\", then \"Confirm\", so it is \"In production\" (sign-ins stop expiring after 7 days). Google shows a \"hasn't verified this app\" screen; click Advanced, then Continue."
    add BROWSER_LIST "Google consent screen: test users, scopes, publishing status; and the Web OAuth client"
    pause "Finish the clicks above, then press Enter to paste the client ID and secret: "
    bash scripts/connections/googleSecrets.sh
  fi
}

deepgram_read_granted() {
  gcloud secrets get-iam-policy DEEPGRAM_API_KEY --project="$PROJECT" 2>/dev/null | grep -q -- '-compute@developer.gserviceaccount.com'
}
deepgram_done() { secret_has DEEPGRAM_API_KEY && deepgram_read_granted; }
deepgram_run() {
  if secret_has DEEPGRAM_API_KEY; then
    local number
    number="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
    gcloud secrets add-iam-policy-binding DEEPGRAM_API_KEY --project="$PROJECT" \
      --member="serviceAccount:${number}-compute@developer.gserviceaccount.com" \
      --role="roles/secretmanager.secretAccessor" >/dev/null
    echo "  ✓ The functions can read DEEPGRAM_API_KEY"
    return 0
  fi
  bash scripts/voice/deepgramSecret.sh
  add BROWSER_LIST "Deepgram spending guard (console.deepgram.com, Billing, Usage alerts)"
  pause "Set the usage alert with the steps above, then press Enter: "
}

tts_done() { api_enabled texttospeech.googleapis.com; }
# stdin is closed so the script doesn't offer a second sign-in; the check above already did it.
tts_run() { bash scripts/voice/googleSetup.sh </dev/null; }

gemini_done() { secret_has GEMINI_API_KEY; }
gemini_run() { bash scripts/voice/geminiSecret.sh; }

# ---- alerts (need the functions deployed: the alert scripts start the deployed key-check jobs)

helm_deployed() { job_deployed verifyHelmKeys; }
connections_deployed() { job_deployed verifyConnectionKeys; }
both_deployed() { helm_deployed && connections_deployed; }

confirm_email() {
  [[ -n "$EMAIL" ]] && return 0
  local account answer
  account="$(gcloud config get-value account 2>/dev/null || true)"
  if [[ "$account" == *@* ]]; then
    printf 'Send the alerts to %s? [Y/n, or type another address] ' "$account"
    read -r answer || true
    case "$answer" in
      ''|[Yy]*) EMAIL="$account" ;;
      *@*) EMAIL="$answer" ;;
      *) printf 'Email for the alerts: '; read -r EMAIL || true ;;
    esac
  else
    printf 'Email for the alerts: '
    read -r EMAIL || true
  fi
  [[ "$EMAIL" == *@* ]] || { echo "✗ That isn't an email address." >&2; return 1; }
}

helm_alerts_done() { policies_present "${HELM_POLICIES[@]}"; }
helm_alerts_run() { confirm_email; bash scripts/helm/alerts.sh "$EMAIL" | grep -v '^To see the failure alert\|^  gcloud logging write'; }
connections_alerts_done() { policies_present "${CONNECTIONS_POLICIES[@]}"; }
connections_alerts_run() { confirm_email; bash scripts/connections/alerts.sh "$EMAIL" | grep -v '^To see the failure alert\|^  gcloud logging write'; }

ALERTS_CREATED=0
test_alert_done() { (( ! DRY && ! ALERTS_CREATED )); }
test_alert_run() {
  ask "Send a test alert entry for each keyring? The email should arrive within minutes." y || { add SKIPPED_LIST "Test alert entries"; return 0; }
  gcloud logging write helm-alert-test '{"event":"helm.keys.failed","checked":0,"failures":[],"drill":true}' --payload-type=json --severity=ERROR --project="$PROJECT"
  gcloud logging write connections-alert-test '{"event":"connections.keys.failed","checked":0,"failures":[],"drill":true}' --payload-type=json --severity=ERROR --project="$PROJECT"
}

# ---- escrow

copy_keyring() {
  local secret="$1" label="$2" clip=""
  if command -v pbcopy >/dev/null 2>&1; then clip="pbcopy"
  elif command -v wl-copy >/dev/null 2>&1; then clip="wl-copy"
  elif command -v xclip >/dev/null 2>&1; then clip="xclip -selection clipboard"
  elif command -v xsel >/dev/null 2>&1; then clip="xsel --clipboard --input"
  fi
  if [[ -z "$clip" ]]; then
    echo "  No clipboard tool found. Run this, and paste what it copies:"
    echo "    gcloud secrets versions access latest --secret=$secret --project=$PROJECT | <your clipboard command>"
    pause "  Paste it into your password manager as \"$label\", keep a second copy in a second secure account, then press Enter: "
    return 0
  fi
  gcloud secrets versions access latest --secret="$secret" --project="$PROJECT" | $clip
  pause "  Copied. Paste it into your password manager as \"$label\", keep a second copy in a second secure account, then press Enter (the clipboard is cleared next): "
  printf '' | $clip
}

escrow() {
  CURRENT="Keyring escrow"
  if (( DRY )); then
    echo "→ would offer: copy each keyring to the clipboard for your password manager (Helm master keyring, Connections master keyring)"
    return 0
  fi
  echo
  echo "Escrow: losing a keyring loses every sealed Helm note and every connected account."
  local default
  default=n; (( CREATED_HELM_KEYRING )) && default=y
  if ask "Copy the Helm keyring to the clipboard now?" "$default"; then
    copy_keyring HELM_MASTER_KEYS "Helm master keyring"; add DONE_LIST "Helm keyring escrowed"
  else add SKIPPED_LIST "Helm keyring escrow (do it before you lose this session: gcloud secrets versions access latest --secret=HELM_MASTER_KEYS --project=$PROJECT)"; fi
  default=n; (( CREATED_CONNECTIONS_KEYRING )) && default=y
  if ask "Copy the Connections keyring to the clipboard now?" "$default"; then
    copy_keyring CONNECTIONS_MASTER_KEYS "Connections master keyring"; add DONE_LIST "Connections keyring escrowed"
  else add SKIPPED_LIST "Connections keyring escrow (gcloud secrets versions access latest --secret=CONNECTIONS_MASTER_KEYS --project=$PROJECT)"; fi
}

# ---- run

(( DRY )) && echo "Dry run: nothing below writes anything."
check_tools
echo

optional_step() { # title, detect, run, default, question
  local title="$1" detect="$2" run="$3" default="$4" question="$5"
  CURRENT="$title"
  if (( AFTER_DEPLOY )); then return 0; fi
  if (( HAVE_GCLOUD )) && "$detect"; then
    echo "✓ $title already done"; add DONE_LIST "$title (already done)"; return 0
  fi
  if (( DRY )); then
    echo "→ would ask ($default): $question, then run: $title"; return 0
  fi
  if ask "$question" "$default"; then
    echo "→ $title…"; "$run"; add DONE_LIST "$title"
  else
    echo "• Skipped: $title"; add SKIPPED_LIST "$title"
  fi
}

step "Helm keyring" helm_keyring_done helm_keyring_run
step "Helm keyring canary" never_done helm_canary_run
step "Anthropic key" anthropic_done anthropic_run
step "Google APIs, OAuth client and consent screen" google_done google_run
step "Connections keyring" connections_keyring_done connections_keyring_run
step "Connections keyring canary" never_done connections_canary_run
optional_step "Deepgram key (saved, readable by the functions)" deepgram_done deepgram_run y "Save the Deepgram key? Without it, voice listens with the device instead"
optional_step "Google Text-to-Speech" tts_done tts_run y "Turn on Google Text-to-Speech? Without it, answers are read by the phone's voice"
optional_step "Gemini key" gemini_done gemini_run n "Save a Gemini key? Only needed to compare Gemini's voices in the benchmark"

if (( AFTER_DEPLOY )) && (( ! DRY )) && ! both_deployed; then
  CURRENT="Alerts"
  echo "✗ The key-check functions aren't deployed yet. Run this again after the merge has deployed." >&2
  exit 1
fi
step "Helm and voice alert policies" helm_alerts_done helm_alerts_run after-deploy
step "Connections alert policies" connections_alerts_done connections_alerts_run after-deploy
if [[ -n "$EMAIL" ]]; then ALERTS_CREATED=1; fi
step "Test alert entries" test_alert_done test_alert_run after-deploy

if (( ! AFTER_DEPLOY )); then escrow; fi

echo
echo "Summary"
if (( DRY )); then
  echo "Dry run only: nothing was changed. Steps that need the merge deployed first (the alerts and the test entries) run in the same pass when the functions are already deployed, and otherwise with: npm run helm:setup -- --after-deploy"
  exit 0
fi
[[ -n "$DONE_LIST" ]] && { echo "Done:"; printf '%s' "$DONE_LIST" | sed 's/^/  ✓ /'; }
[[ -n "$SKIPPED_LIST" ]] && { echo "Skipped by choice:"; printf '%s' "$SKIPPED_LIST" | sed 's/^/  • /'; }
[[ -n "$DEFERRED_LIST" ]] && { echo "Waiting for the deploy (run: npm run helm:setup -- --after-deploy):"; printf '%s' "$DEFERRED_LIST" | sed 's/^/  • /'; }
[[ -n "$BROWSER_LIST" ]] && { echo "Browser steps this run showed you (a script can't check them):"; printf '%s' "$BROWSER_LIST" | sed 's/^/  • /'; }
echo "Still yours, in the browser: for Gmail and Drive, add each tester's address on the consent screen's test users and on the \"Gmail and Drive\" switch at https://apps.moondreams.dev/admin?view=apps&app=helm&section=features."
