#!/usr/bin/env bash
# Installs the site's and the functions' packages when either lockfile changed since the last install (a pull, a branch switch), so a local run never starts on stale packages.
set -euo pipefail
cd "$(dirname "$0")/../.."

for dir in . functions; do
  lock="$dir/package-lock.json" stamp="$dir/node_modules/.package-lock.json"
  [[ -f "$lock" ]] || continue
  if [[ ! -f "$stamp" || "$lock" -nt "$stamp" ]]; then
    label=$([[ "$dir" == . ]] && echo "the site's" || echo "the functions'")
    echo "▶ Installing $label packages (its lockfile changed since the last install)…"
    npm ci --prefix "$dir" --no-audit --no-fund || { echo "✗ Installing $label packages failed (the error is above). Fix it, then run the same command again." >&2; exit 1; }
  fi
done
