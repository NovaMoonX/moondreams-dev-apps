#!/usr/bin/env bash
# Sets up Runway's Plaid keys from the owner's own machine; nothing is echoed or written to disk.
#   npm run runway:plaid-secrets -- sandbox      # checks the sandbox keys, then gives the lines to paste into Claude Code
#   npm run runway:plaid-secrets -- production   # checks the production (Trial) keys, then saves both as Firebase secrets
set -euo pipefail

PROJECT=moondreams-dev-apps
KEYS_PAGE="https://dashboard.plaid.com/developers/keys"
mode="${1:-}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "✗ $1 isn't installed. $2" >&2; exit 1; }
}

ask_keys() {
  [[ -t 0 ]] || { echo "✗ Run this in a terminal, so you can paste the keys." >&2; exit 1; }
  echo "1. Open $KEYS_PAGE (Plaid Dashboard → Developers → Keys)."
  printf '2. Paste the client_id here and press Enter: '
  read -r client_id || true
  printf '3. Paste the %s secret here (it stays hidden) and press Enter: ' "$1"
  read -rs secret || true
  echo
  [[ -n "$client_id" && -n "$secret" ]] || { echo "✗ Both are needed; nothing was saved." >&2; exit 1; }
}

# Any read Plaid answers with 200 proves the pair is right for that environment and creates nothing.
check_keys() {
  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "https://$1.plaid.com/institutions/get" \
    -H 'Content-Type: application/json' \
    --data-binary @- <<<"{\"client_id\":\"$client_id\",\"secret\":\"$secret\",\"count\":1,\"offset\":0,\"country_codes\":[\"US\"]}") || true
  [[ "$status" == "200" ]] && { echo "✓ Plaid accepted the $1 keys"; return 0; }
  echo "✗ Plaid answered $status: these aren't $1 keys, or one was pasted incompletely. Nothing was saved." >&2
  exit 1
}

copy_to_clipboard() {
  if command -v pbcopy >/dev/null 2>&1; then printf %s "$1" | pbcopy && return 0; fi
  if command -v wl-copy >/dev/null 2>&1; then printf %s "$1" | wl-copy && return 0; fi
  if command -v xclip >/dev/null 2>&1; then printf %s "$1" | xclip -selection clipboard && return 0; fi
  return 1
}

case "$mode" in
  sandbox)
    need curl "It ships with macOS and most Linux systems."
    ask_keys sandbox
    check_keys sandbox
    lines=$(printf 'RUNWAY_PLAID_CLIENT_ID=%s\nRUNWAY_PLAID_SECRET=%s\nRUNWAY_PLAID_ENV=sandbox' "$client_id" "$secret")
    echo
    echo "Last step, in Claude Code (sessions can't set this themselves):"
    echo "  1. On claude.ai/code, open the Runway session, click the environment name in its title bar, then Edit"
    echo "  2. Network access: add these two under Allowed domains, keeping \"Allow package managers\" ticked:"
    echo "       sandbox.plaid.com"
    echo "       production.plaid.com"
    echo "  3. Environment variables: paste the three lines below"
    if copy_to_clipboard "$lines"; then
      echo "     They're on your clipboard: just paste (then copy something else, so they don't linger)."
    else
      echo "$lines" | sed 's/^/       /'
    fi
    echo "  4. Save, then tell the session \"Plaid is set up\". A new session may be needed to pick the keys up."
    ;;
  production)
    need curl "It ships with macOS and most Linux systems."
    need firebase "Install it with: npm install -g firebase-tools"
    firebase login:list 2>/dev/null | grep -q '@' || { echo "✗ The firebase CLI isn't signed in. Run: firebase login" >&2; exit 1; }
    ask_keys production
    check_keys production
    printf %s "$client_id" | firebase functions:secrets:set RUNWAY_PLAID_CLIENT_ID --project "$PROJECT" --data-file=-
    echo "✓ RUNWAY_PLAID_CLIENT_ID saved in Firebase"
    printf %s "$secret" | firebase functions:secrets:set RUNWAY_PLAID_SECRET --project "$PROJECT" --data-file=-
    echo "✓ RUNWAY_PLAID_SECRET saved in Firebase"
    echo "Done. The link functions bind both when they ship; nothing else to do."
    ;;
  *)
    echo "Use: npm run runway:plaid-secrets -- sandbox, or -- production" >&2
    exit 1
    ;;
esac
