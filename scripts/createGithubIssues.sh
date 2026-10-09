#!/usr/bin/env bash
#
# Wrapper around ../_gists/create-github-issues/init.sh so creating a mini-app's
# roadmap issues only requires the app id (its folder name under src/apps/) —
# the ISSUES.md path, the app name set on the board's "Apps" field, and the
# project number are all derived/fixed here.
#
# Usage:
#   npm run issues:create -- <app-id> [app-name]
#   npm run issues:create:dry-run -- <app-id> [app-name]
#
# Whether this runs as a dry run is decided by which npm script invoked it
# (via $npm_lifecycle_event), not by a flag you pass — the app id is the only
# input (plus an optional app name, for a board option that differs from the
# registry name).

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

# The app name is the registry entry's name (e.g. "A-List Tracker") unless one
# is passed; it becomes the board's "Apps" option, created if missing.
REGISTRY="src/lib/app/app.registry.ts"
APP_NAME="${2:-$(node -e "const m = require('fs').readFileSync('$REGISTRY', 'utf8').match(/id: '$APP_ID',\\s*name: '([^']+)'/); if (m) console.log(m[1]);")}"
if [[ -z "$APP_NAME" ]]; then
  echo "No registry entry for '$APP_ID' in $REGISTRY; pass the app name as a second argument" >&2
  exit 1
fi

args=("$ISSUES_FILE" --app-name "$APP_NAME" --project-number 3 --project-status-value Ready)
if [[ "${npm_lifecycle_event:-}" == *dry-run* ]]; then
  args+=(--dry-run)
fi

exec ../_gists/create-github-issues/init.sh "${args[@]}"
