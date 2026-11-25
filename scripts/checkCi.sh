#!/usr/bin/env bash
# Runs every npm script the PR workflows run, in their order, and lists each that failed.
# Usage: npm run check:ci -- [--keep-going] [--browser]
#   stops at the first failure unless --keep-going; the browser checks (which CI runs only when the diff touches what they guard) need --browser.
set -uo pipefail
cd "$(dirname "$0")/.."
keep_going=false
workflows=()
for arg in "$@"; do
  [[ "$arg" == "--keep-going" ]] && keep_going=true
  [[ "$arg" == "--browser" ]] && workflows+=(.github/workflows/browser-checks.yml)
done
for file in .github/workflows/*.yml; do
  [[ "$file" == *browser-checks.yml ]] || workflows+=("$file")
done
mapfile -t scripts < <(grep -hoE 'npm run (-s )?[a-zA-Z0-9:_-]+' "${workflows[@]}" \
  | awk '{print $NF}' | awk '!seen[$0]++' | grep -vE '^(build|fb:.*|cf:.*|deploy.*|seed.*|emulators)$')
logs="$(mktemp -d)"
failed=()
for script in "${scripts[@]}"; do
  if npm run -s "$script" >"$logs/$script.log" 2>&1; then
    echo "ok    $script"
  else
    echo "FAIL  $script (log: $logs/$script.log)"
    tail -n 15 "$logs/$script.log"
    failed+=("$script")
    $keep_going || break
  fi
done
if ((${#failed[@]})); then
  echo "Failed: ${failed[*]}. Fix it, then run: npm run check:ci -- --keep-going"
  exit 1
fi
echo "All ${#scripts[@]} workflow checks passed."
