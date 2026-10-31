#!/usr/bin/env bash
# Sets up the secrets the admin dashboard's Pipeline needs, from the owner's own machine.
#   npm run pipeline:secrets -- key     # PIPELINE_KEY: Firebase, GitHub Actions, and the value to paste into Claude Code
#   npm run pipeline:secrets -- token   # PIPELINE_GITHUB_TOKEN: answering from the dashboard
#   npm run pipeline:secrets -- check   # tests the saved token, after editing its permissions on GitHub
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
  printf %s "$2" | firebase functions:secrets:set "$1" --project "$PROJECT" --data-file=-
  echo "✓ $1 saved in Firebase"
}

signed_in() {
  firebase login:list 2>/dev/null | grep -q '@' || { echo "✗ The firebase CLI isn't signed in. Run: firebase login" >&2; exit 1; }
  if [[ "${1:-}" == "gh" ]]; then
    gh auth status >/dev/null 2>&1 || { echo "✗ The gh CLI isn't signed in. Run: gh auth login" >&2; exit 1; }
  fi
}

done_steps=()
# On any failure, say which places already hold the new value, since the others still hold the old one.
report_failure() {
  local code=$?
  [[ $code -eq 0 ]] && return
  echo >&2
  echo "✗ Stopped partway. Done so far: ${done_steps[*]:-nothing}." >&2
  echo "  Fix the error above and run the same command again; it starts over with a fresh value and sets every place." >&2
}
trap report_failure EXIT

TOKEN_PAGE="https://github.com/settings/personal-access-tokens"

# An empty comment is refused as invalid (422) once the token may comment, so nothing is ever posted.
can_comment() {
  local token="$1" pr status
  pr=$(GH_TOKEN="$token" gh api "repos/$REPO/pulls?state=open&per_page=1" --jq '.[0].number // empty' 2>/dev/null) || return 2
  [[ -n "$pr" ]] || return 3
  status=$(GH_TOKEN="$token" gh api -X POST "repos/$REPO/issues/$pr/comments" --input - -i <<<'{}' 2>/dev/null | head -1 | awk '{print $2}') || true
  [[ "$status" == "422" ]] && return 0
  echo "  GitHub answered $status for a test comment on #$pr." >&2
  return 1
}

check_token() {
  local token="$1"
  GH_TOKEN="$token" gh api "repos/$REPO" >/dev/null 2>&1 \
    || { echo "✗ That token can't see this repo: it has expired, was revoked, or doesn't have moondreams-dev-apps selected." >&2; return 1; }
  local result=0
  can_comment "$token" || result=$?
  case $result in
    0) echo "✓ The token can comment on pull requests" ;;
    2) echo "✗ The token can't list this repo's pull requests. Edit it: $TOKEN_PAGE → Pipeline answers → Permissions → Pull requests: Read and write → Update." >&2
       return 1 ;;
    3) echo "• No pull request is open, so commenting couldn't be tested. The token can read the repo; run npm run pipeline:secrets -- check once a pull request is open." ;;
    *) echo "✗ The token can read the repo but can't comment on pull requests." >&2
       echo "  Edit it (no new token needed): $TOKEN_PAGE → Pipeline answers → Permissions" >&2
       echo "  Set Pull requests: Read and write and Issues: Read and write, press Update, then run: npm run pipeline:secrets -- check" >&2
       return 1 ;;
  esac
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
    signed_in gh
    key=$(openssl rand -hex 32)
    printf %s "$key" | gh secret set PIPELINE_KEY --repo "$REPO"
    echo "✓ PIPELINE_KEY saved as a GitHub Actions secret"
    done_steps+=("GitHub")
    set_firebase_secret PIPELINE_KEY "$key"
    done_steps+=("Firebase")
    grant_read PIPELINE_KEY
    done_steps+=("read access")
    echo
    echo "Last step, in Claude Code (sessions can't set this themselves):"
    echo "  1. Open any cloud session on claude.ai/code, click the environment name in its title bar, then Edit"
    echo "  2. Under environment variables add:  PIPELINE_KEY=<the key>"
    if copy_to_clipboard "PIPELINE_KEY=$key"; then
      echo "  The whole line is on your clipboard: just paste it (then copy something else, so it doesn't linger there)."
    else
      echo "  The line to paste:  PIPELINE_KEY=$key"
    fi
    echo "  3. Save. Sessions you start after this report to the dashboard."
    ;;
  token)
    need firebase "Install it with: npm install -g firebase-tools"
    need gh "Install it from https://cli.github.com"
    signed_in
    [[ -t 0 ]] || { echo "✗ Run this in a terminal, so you can paste the token." >&2; exit 1; }
    url="https://github.com/settings/personal-access-tokens/new?name=Pipeline%20answers&description=Posts%20answers%20from%20the%20admin%20dashboard&target_name=NovaMoonX&expires_in=366&pull_requests=write&issues=write"
    echo "1. A GitHub page opens to make the token. Check these, then press Generate token:"
    echo "   • Repository access: Only select repositories → moondreams-dev-apps"
    echo "   • Permissions: Pull requests: Read and write, Issues: Read and write"
    echo "   ($url)"
    if [[ -z "${SSH_CONNECTION:-}" ]]; then
      if [[ "$(uname)" == "Darwin" ]]; then open "$url"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$url" >/dev/null 2>&1 || true; fi
    fi
    printf '2. Paste the token here (it stays hidden) and press Enter: '
    read -rs token || true
    echo
    [[ "$token" == github_pat_* ]] || { echo "✗ That isn't a fine-grained token (they start with github_pat_); nothing was saved." >&2; exit 1; }
    check_token "$token" || { echo "  Nothing was saved." >&2; exit 1; }
    set_firebase_secret PIPELINE_GITHUB_TOKEN "$token"
    done_steps+=("Firebase")
    grant_read PIPELINE_GITHUB_TOKEN
    done_steps+=("read access")
    echo "✓ Done. Answering from the dashboard works from the next send (give it a couple of minutes)."
    echo "  The token expires in a year: run this again then, and the dashboard says so if a send is refused."
    ;;
  check)
    trap - EXIT
    need firebase "Install it with: npm install -g firebase-tools"
    need gh "Install it from https://cli.github.com"
    signed_in
    token=$(firebase functions:secrets:access PIPELINE_GITHUB_TOKEN --project "$PROJECT" 2>/dev/null) \
      || { echo "✗ No token is saved yet. Run: npm run pipeline:secrets -- token" >&2; exit 1; }
    check_token "$token" || exit 1
    echo "  Sending from the dashboard uses this token; edits to its permissions apply straight away."
    ;;
  *)
    trap - EXIT
    echo "Use: npm run pipeline:secrets -- key, -- token, or -- check" >&2
    exit 1
    ;;
esac
