#!/usr/bin/env bash
#
# Wrapper around ../_gists/create-github-issues/init.sh so creating a mini-app's
# roadmap issues only requires the app id (its folder name under src/apps/) —
# the ISSUES.md path, the "<Title Case> (App)" label, and the project number
# are all derived/fixed here.
#
# Usage:
#   npm run issues:create -- <app-id>
#   npm run issues:create:dry-run -- <app-id>
#
# Whether this runs as a dry run is decided by which npm script invoked it
# (via $npm_lifecycle_event), not by a flag you pass — the app id is the only
# input.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: npm run issues:create -- <app-id>" >&2
  echo "       npm run issues:create:dry-run -- <app-id>" >&2
  echo "<app-id> is the folder name under src/apps/, e.g. nine-lives" >&2
  exit 1
fi

APP_ID="$1"
ISSUES_FILE="src/apps/$APP_ID/ISSUES.md"

if [[ ! -f "$ISSUES_FILE" ]]; then
  echo "No ISSUES.md found at $ISSUES_FILE" >&2
  exit 1
fi

# kebab-case app id -> "Title Case (App)", e.g. "nine-lives" -> "Nine Lives (App)".
IFS='-' read -r -a words <<<"$APP_ID"
label=""
for word in "${words[@]}"; do
  first="$(printf '%s' "${word:0:1}" | tr '[:lower:]' '[:upper:]')"
  label="$label${label:+ }$first${word:1}"
done
LABEL="$label (App)"

args=("$ISSUES_FILE" --label "$LABEL" --project-number 3 --project-status-value Ready)
if [[ "${npm_lifecycle_event:-}" == *dry-run* ]]; then
  args+=(--dry-run)
fi

exec ../_gists/create-github-issues/init.sh "${args[@]}"
