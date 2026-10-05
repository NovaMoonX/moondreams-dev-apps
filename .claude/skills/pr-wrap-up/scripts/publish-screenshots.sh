#!/bin/bash
# usage: publish-screenshots.sh <pr-number> <folder-with-pngs>
# Commits the PNGs to the `pr-screenshots` branch under pr-<n>/ (creating the branch the first time),
# pushes it, and prints Markdown image links pinned to that commit so they never go stale.
# The PR's own branch is never touched, so its diff stays free of images.
set -euo pipefail
PR="$1"; SRC="$2"
SLUG=NovaMoonX/moondreams-dev-apps
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
shopt -s nullglob
files=("$SRC"/*.png)
[ ${#files[@]} -gt 0 ] || { echo "no PNGs in $SRC" >&2; exit 1; }

WT="$(mktemp -d)"
trap 'git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true' EXIT

if git ls-remote --exit-code --heads origin pr-screenshots >/dev/null 2>&1; then
  git fetch -q origin pr-screenshots
  git worktree add -q --detach "$WT" origin/pr-screenshots
else
  git worktree add -q --detach "$WT" HEAD
  git -C "$WT" checkout -q --orphan pr-screenshots
  git -C "$WT" rm -rfq . >/dev/null 2>&1 || true
fi

mkdir -p "$WT/pr-$PR"
cp "${files[@]}" "$WT/pr-$PR/"
git -C "$WT" add "pr-$PR"
git -C "$WT" commit -q -m "Screenshots for PR #$PR" --allow-empty
for attempt in 1 2 3; do
  git -C "$WT" push -q origin HEAD:refs/heads/pr-screenshots && break
  git -C "$WT" fetch -q origin pr-screenshots && git -C "$WT" rebase -q origin/pr-screenshots
done

SHA="$(git -C "$WT" rev-parse HEAD)"
for file in "${files[@]}"; do
  name="$(basename "$file")"
  echo "![${name%.png}](https://github.com/$SLUG/blob/$SHA/pr-$PR/$name?raw=true)"
done
