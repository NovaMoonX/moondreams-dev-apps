#!/usr/bin/env bash
# Sets up Google sign-in for connections: turns on the APIs, walks the console clicks no command can do, and saves the OAuth client.
# It skips what is already done: the APIs and the saved client are checked, and the console steps you confirmed are remembered
# (with the scopes and addresses they covered, so a later run asks only for what was added since). Safe to re-run.
#   npm run connections:google-setup                 picks up where the last run stopped
#   npm run connections:google-setup -- --from 3     redoes step 3 onwards
#   npm run connections:google-setup -- --restart    starts over from step 1
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/lib/copyFields.sh
source scripts/lib/setupState.sh

PROJECT=moondreams-dev-apps
SECRET=GOOGLE_OAUTH_CLIENT
CONSENT_PAGE="https://console.cloud.google.com/apis/credentials/consent?project=$PROJECT"
CREDENTIALS_PAGE="https://console.cloud.google.com/apis/credentials?project=$PROJECT"
APIS=(calendar-json.googleapis.com gmail.googleapis.com drive.googleapis.com people.googleapis.com)
SCOPES=(
  openid
  email
  https://www.googleapis.com/auth/calendar.readonly
  https://www.googleapis.com/auth/gmail.readonly
  https://www.googleapis.com/auth/drive.readonly
  https://www.googleapis.com/auth/contacts.readonly
)
ORIGINS=(https://apps.moondreams.dev)
REDIRECTS=(https://apps.moondreams.dev/helm)
LAST_STEP=5
# Holds only the last confirmed step and the scopes and addresses already added in the console, never a secret.
SETUP_STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/moondreams/google-setup"
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

pause() { printf '%s' "$1"; read -r _ || true; }
confirmed_step() {
  local step
  step=$(cat "$SETUP_STATE_DIR/step" 2>/dev/null || true)
  [[ "$step" =~ ^[0-9]+$ ]] && echo "$step" || echo 0
}
remember_step() {
  (( $1 > $(confirmed_step) )) || return 0
  mkdir -p "$SETUP_STATE_DIR"
  echo "$1" >"$SETUP_STATE_DIR/step"
}
has_gcloud() { command -v gcloud >/dev/null 2>&1; }
client_saved() { has_gcloud && gcloud secrets describe "$SECRET" --project="$PROJECT" >/dev/null 2>&1; }
start_step() {
  CURRENT_STEP=$1
  CURRENT=$2
  echo
  (( $1 >= START )) && return 0
  echo "$1. ✓ $2: done on an earlier run."
  return 1
}

trap 'status=$?; (( status == 0 )) || { echo "✗ Stopped at step $CURRENT_STEP: $CURRENT." >&2; echo "  Fix that and run npm run connections:google-setup again to pick up from step $CURRENT_STEP (or add -- --restart to start over)." >&2; }' EXIT

[[ -t 0 ]] || { echo "✗ Run this in a terminal, so you can confirm each step." >&2; exit 1; }
[[ "${1:-}" == "--restart" ]] && rm -rf "$SETUP_STATE_DIR"
START=${from:-$(( $(confirmed_step) + 1 ))}
# --from N redoes N, so the lists a redone step covered are forgotten and walked again.
if [[ -n "$from" ]]; then
  (( from <= 3 )) && rm -f "$SETUP_STATE_DIR/scopes"
  (( from <= 4 )) && rm -f "$SETUP_STATE_DIR/origins" "$SETUP_STATE_DIR/redirects"
fi
if (( START > LAST_STEP )); then
  echo "Every console step was confirmed on an earlier run; checking for anything added since. To redo a step: npm run connections:google-setup -- --from <step>"
elif (( START > 1 )); then
  echo "Picking up at step $START. To start over: npm run connections:google-setup -- --restart   To go to a step: npm run connections:google-setup -- --from <step>"
fi

# 1 is checked on every run, so an API added to the list is turned on even after everything else is done.
CURRENT_STEP=1
CURRENT="the Google APIs"
echo
if has_gcloud; then
  enabled=$(gcloud services list --enabled --project "$PROJECT" --format='value(config.name)')
  off=()
  for api in "${APIS[@]}"; do grep -qxF "$api" <<<"$enabled" || off+=("$api"); done
  if (( ${#off[@]} )); then
    gcloud services enable "${off[@]}" --project "$PROJECT"
    echo "1. ✓ Turned on ${off[*]}"
  else
    echo "1. ✓ The Calendar, Gmail, Drive and People APIs are already on."
  fi
else
  echo "1. gcloud isn't installed, so turn on each API by hand (Enable; it says \"Manage\" once it is on):"
  for api in "${APIS[@]}"; do echo "     https://console.cloud.google.com/apis/library/$api?project=$PROJECT"; done
  pause "   Press Enter when all four are on. "
fi
remember_step 1

if start_step 2 "the consent screen"; then
  echo "2. The consent screen, at $CONSENT_PAGE"
  echo "     - User type: External (created once for the whole project)."
  echo "     - Audience: \"In production\" (click \"Publish app\", then \"Confirm\" if it says Testing). Testing would block every app's"
  echo "       Google sign-in for anyone not on the test-user list, and expire Gmail and Calendar connections after 7 days."
  if [[ -z "$from" ]] && ask_yes "   Is the consent screen already External and In production?"; then
    echo "   ✓ Noted; this step won't be asked again."
  else
    pause "   Open the page, set those two, then press Enter. "
  fi
  remember_step 2
fi

# 3 and 4 also run past their step when the list grew since they were confirmed.
CURRENT_STEP=3
CURRENT="the consent screen's scopes"
echo
new_scopes=(); while IFS= read -r line; do new_scopes+=("$line"); done < <(missing_from scopes "${SCOPES[@]}")
if (( ${#new_scopes[@]} == 0 )); then
  echo "3. ✓ Every scope is already on the consent screen."
else
  if has_record scopes; then
    echo "3. ${#new_scopes[@]} scope(s) added since your last run need adding on the consent screen."
  else
    echo "3. The consent screen needs these scopes (Google identifies each permission by its URL; all are read-only):"
    printf '     %s\n' "${new_scopes[@]}"
  fi
  if ! has_record scopes && [[ -z "$from" ]] && ask_yes "   Are all of these already in the consent screen's Data access table?"; then
    echo "   ✓ Noted; only scopes added later will be asked for."
  else
    echo "   Open $CONSENT_PAGE, then Data access, \"Add or remove scopes\", paste into \"Manually add scopes\","
    echo "   then Add to table, Update and Save (one already in the table is simply kept)."
    copy_each "Scopes to add (one per line)" "$(printf '%s\n' "${new_scopes[@]}")"
  fi
  record scopes "${new_scopes[@]}"
  echo "   Google marks Gmail's and Drive's as restricted: until it reviews the app, anyone connecting them sees a \"hasn't verified"
  echo "   this app\" screen (Advanced, then Continue) and the app is capped at 100 people."
fi
remember_step 3

CURRENT_STEP=4
CURRENT="the OAuth client"
echo
# A client saved by step 5 was made with the addresses this script listed then, so it counts for them on a first run here.
if [[ -z "$from" ]] && client_saved && ! has_record origins; then record origins "${ORIGINS[@]}"; record redirects "${REDIRECTS[@]}"; fi
new_origins=(); while IFS= read -r line; do new_origins+=("$line"); done < <(missing_from origins "${ORIGINS[@]}")
new_redirects=(); while IFS= read -r line; do new_redirects+=("$line"); done < <(missing_from redirects "${REDIRECTS[@]}")
if client_saved && [[ -z "$from" ]] && (( ${#new_origins[@]} + ${#new_redirects[@]} == 0 )); then
  echo "4. ✓ The Web OAuth client exists ($SECRET is saved) and has every address."
elif client_saved; then
  echo "4. Check the Web OAuth client has these address(es). Open $CREDENTIALS_PAGE, open the Web client, add these and Save:"
  (( ${#new_origins[@]} )) && copy_each "Authorized JavaScript origins (Add URI)" "$(printf '%s\n' "${new_origins[@]}")"
  (( ${#new_redirects[@]} )) && copy_each "Authorized redirect URIs (Add URI)" "$(printf '%s\n' "${new_redirects[@]}")"
  record origins "${ORIGINS[@]}"; record redirects "${REDIRECTS[@]}"
elif (( START > 4 )); then
  echo "4. ✓ The Web OAuth client was made on an earlier run; step 5 saves its ID and secret."
else
  if [[ -z "$from" ]] && ask_yes "4. Is there already a Web OAuth client with these addresses: ${ORIGINS[*]} and ${REDIRECTS[*]}?"; then
    echo "   ✓ Noted; step 5 saves its ID and secret."
  else
    echo "4. Open $CREDENTIALS_PAGE, then Create credentials, OAuth client ID, and choose Application type: Web application."
    copy_each "Name" "Moondreams apps web" \
      "Authorized JavaScript origins (Add URI)" "$(printf '%s\n' "${ORIGINS[@]}")" \
      "Authorized redirect URIs (Add URI)" "$(printf '%s\n' "${REDIRECTS[@]}")"
    pause "   Click Create, then press Enter. "
  fi
  record origins "${ORIGINS[@]}"; record redirects "${REDIRECTS[@]}"
fi
remember_step 4

CURRENT_STEP=5
CURRENT="saving the client ID and secret"
echo
if client_saved && { [[ -z "$from" ]] || (( from > 5 )) || ! ask_yes "5. $SECRET is already saved. Replace it (this adds a version and keeps the old one)?"; }; then
  echo "5. ✓ $SECRET is saved in Google Cloud."
else
  echo "5. Saving the client's ID and secret:"
  bash scripts/connections/googleSecrets.sh
fi
remember_step 5

CURRENT="finishing"
echo
echo "✓ Google connections are set up. Nothing else to do: the connection functions read $SECRET when they deploy."
