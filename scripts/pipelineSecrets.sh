#!/usr/bin/env bash
# Sets up the secrets the admin dashboard's Pipeline needs, from the owner's own machine.
#   npm run pipeline:secrets -- key     # PIPELINE_KEY: Firebase, GitHub Actions, and the value to paste into Claude Code
#   npm run pipeline:secrets -- token   # PIPELINE_GITHUB_TOKEN: answering from the dashboard
# Needs the firebase and gh CLIs signed in; gcloud is used for the read grant when it is installed.
set -euo pipefail

PROJECT=moondreams-dev-apps
REPO=NovaMoonX/moondreams-dev-apps
mode="${1:-}"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "✗ $1 isn't installed. $2" >&2; exit 1; }
}

# Functions read these secrets at run time without binding them, so the runtime account needs read access to each.
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

set_firebase_secret() {
  printf %s "$2" | firebase functions:secrets:set "$1" --project "$PROJECT" --data-file=- >/dev/null
  echo "✓ $1 saved in Firebase"
}

copy_to_clipboard() {
  if command -v pbcopy >/dev/null 2>&1; then printf %s "$1" | pbcopy && return 0; fi
  if command -v wl-copy >/dev/null 2>&1; then printf %s "$1" | wl-copy && return 0; fi
  if command -v xclip >/dev/null 2>&1; then printf %s "$1" | xclip -selection clipboard && return 0; fi
  return 1
}

case "$mode" in
  key)
    need firebase "Install it with: npm install -g firebase-tools"
    need gh "Install it from https://cli.github.com"
    need openssl "It ships with macOS and most Linux systems."
    key=$(openssl rand -hex 32)
    set_firebase_secret PIPELINE_KEY "$key"
    grant_read PIPELINE_KEY
    printf %s "$key" | gh secret set PIPELINE_KEY --repo "$REPO"
    echo "✓ PIPELINE_KEY saved as a GitHub Actions secret"
    echo
    echo "Last step, in Claude Code (sessions can't set this themselves):"
    echo "  1. Open any cloud session on claude.ai/code, click the environment name in its title bar, then Edit"
    echo "  2. Under environment variables add:  PIPELINE_KEY=<the key>"
    if copy_to_clipboard "PIPELINE_KEY=$key"; then
      echo "  The whole line is on your clipboard: just paste it."
    else
      echo "  The line to paste:  PIPELINE_KEY=$key"
    fi
    echo "  3. Save. Sessions you start after this report to the dashboard."
    ;;
  token)
    need firebase "Install it with: npm install -g firebase-tools"
    url="https://github.com/settings/personal-access-tokens/new?name=Pipeline%20answers&description=Posts%20answers%20from%20the%20admin%20dashboard&target_name=NovaMoonX&expires_in=366&pull_requests=read&issues=write"
    echo "1. A GitHub page opens to make the token. Check these, then press Generate token:"
    echo "   • Repository access: Only select repositories → moondreams-dev-apps"
    echo "   • Permissions: Pull requests: Read-only, Issues: Read and write"
    echo "   ($url)"
    (command -v open >/dev/null 2>&1 && open "$url") || (command -v xdg-open >/dev/null 2>&1 && xdg-open "$url") || true
    printf '2. Paste the token here (it stays hidden) and press Enter: '
    read -rs token
    echo
    [[ "$token" == github_pat_* || "$token" == ghp_* ]] || { echo "✗ That doesn't look like a GitHub token; nothing was saved." >&2; exit 1; }
    set_firebase_secret PIPELINE_GITHUB_TOKEN "$token"
    grant_read PIPELINE_GITHUB_TOKEN
    echo "✓ Done. Answering from the dashboard works from the next send (give it a couple of minutes)."
    ;;
  *)
    echo "Use: npm run pipeline:secrets -- key    or    npm run pipeline:secrets -- token" >&2
    exit 1
    ;;
esac
