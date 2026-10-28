#!/usr/bin/env bash
# Checks each open PR branch against its base: is the base fully merged in, and
# would merging it conflict? Answers from git alone (merge-tree, no checkout),
# so it costs no model tokens and runs anywhere git does.
#
#   npm run prs:check                          # every open PR (needs gh), else this branch
#   npm run prs:check -- head:base [head:base] # explicit pairs, e.g. a stack
#   npm run prs:sync -- [pairs]                # also merge the base into each branch
#                                              # that is behind and merges cleanly, and push
#   --json                                     # one JSON object per line, for workflows
#
# Pairs are handled lowest first: a stack is listed bottom to top, so a merge
# into a lower branch is fetched before the branch above it is checked.
# Exit code: 0 all fresh or merged, 1 something is behind (check mode),
# 2 something conflicts (needs a person or the session model to resolve).

set -uo pipefail

merge=false
json=false
pairs=()
for arg in "$@"; do
  case "$arg" in
    --merge) merge=true ;;
    --json) json=true ;;
    *:*) pairs+=("$arg") ;;
    *) echo "Unexpected argument: $arg (pairs are head:base)" >&2; exit 64 ;;
  esac
done
[[ "${npm_lifecycle_event:-}" == "prs:sync" ]] && merge=true

default_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
default_branch=${default_branch:-main}

if [[ ${#pairs[@]} -eq 0 ]]; then
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    mapfile -t pairs < <(gh pr list --state open --limit 100 \
      --json headRefName,baseRefName,isCrossRepository \
      --jq '.[] | select(.isCrossRepository | not) | "\(.headRefName):\(.baseRefName)"')
  else
    current=$(git branch --show-current)
    [[ -n "$current" && "$current" != "$default_branch" ]] && pairs=("$current:$default_branch")
  fi
fi

if [[ ${#pairs[@]} -eq 0 ]]; then
  [[ "$json" == true ]] || echo "No open PR branches to check."
  exit 0
fi

report() {
  local head=$1 base=$2 state=$3 behind=$4 files=$5
  if [[ "$json" == true ]]; then
    printf '{"head":"%s","base":"%s","state":"%s","behind":%s,"conflicts":"%s"}\n' "$head" "$base" "$state" "$behind" "$files"
    return
  fi
  case "$state" in
    fresh) echo "✅ $head ← $base: up to date" ;;
    behind) echo "⏳ $head ← $base: $behind commits behind, merges cleanly" ;;
    merged) echo "🔀 $head ← $base: was $behind behind, merged and pushed" ;;
    conflict) echo "⚠️  $head ← $base: $behind behind, CONFLICTS in: $files" ;;
    missing) echo "❓ $head ← $base: branch not found on origin" ;;
    failed) echo "❌ $head ← $base: merge or push failed ($files)" ;;
  esac
}

worst=0
for pair in "${pairs[@]}"; do
  head=${pair%%:*}
  base=${pair#*:}
  git fetch -q origin "$head" "$base" 2>/dev/null
  if ! git rev-parse -q --verify "origin/$head" >/dev/null || ! git rev-parse -q --verify "origin/$base" >/dev/null; then
    report "$head" "$base" missing 0 ""
    continue
  fi

  behind=$(git rev-list --count "origin/$head..origin/$base")
  if [[ "$behind" -eq 0 ]]; then
    report "$head" "$base" fresh 0 ""
    continue
  fi

  # merge-tree exits 1 on conflicts and lists the conflicted paths after the tree id.
  tree_output=$(git merge-tree --write-tree --name-only "origin/$head" "origin/$base" 2>&1)
  if [[ $? -ne 0 ]]; then
    files=$(echo "$tree_output" | sed -n '2,/^$/p' | grep -v '^$' | head -10 | paste -sd ',' -)
    report "$head" "$base" conflict "$behind" "$files"
    worst=2
    continue
  fi

  if [[ "$merge" != true ]]; then
    report "$head" "$base" behind "$behind" ""
    [[ "$worst" -lt 1 ]] && worst=1
    continue
  fi

  workdir=$(mktemp -d)
  if git worktree add -q --detach "$workdir" "origin/$head" 2>/dev/null &&
    git -C "$workdir" merge -q --no-edit "origin/$base" >/dev/null 2>&1 &&
    git -C "$workdir" push -q origin "HEAD:refs/heads/$head" 2>/dev/null; then
    report "$head" "$base" merged "$behind" ""
  else
    report "$head" "$base" failed "$behind" "see git output; nothing was pushed"
    worst=2
  fi
  git worktree remove --force "$workdir" 2>/dev/null
  rm -rf "$workdir"
done

exit "$worst"
