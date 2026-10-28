#!/usr/bin/env bash
# Checks each open PR branch against its base: is the base fully merged in, and
# would merging it conflict? Answers from git alone (merge-tree, no checkout),
# so it costs no model tokens and runs anywhere git does.
#
#   npm run prs:check                          # every open PR (needs gh), else this branch
#   npm run prs:check -- head:base [head:base] # explicit pairs, e.g. a stack
#   npm run prs:sync -- head:base [head:base]  # also merge the base into each named branch
#                                              # that is behind and merges cleanly, and push
#   --json                                     # one JSON object per line, for workflows
#
# Pairs are handled lowest first: a stack is listed bottom to top, so a merge
# into a lower branch is fetched before the branch above it is checked.
# Merging needs explicit pairs, so it only ever pushes to branches you named.
# Exit code: 0 all fresh or merged, 1 something is behind or missing (check
# mode), 2 something conflicts or failed (needs a person or the session model).

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
if [[ "$merge" == true && ${#pairs[@]} -eq 0 ]]; then
  echo "Merging needs explicit head:base pairs, so it never pushes to someone else's branch." >&2
  exit 64
fi

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

json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

report() {
  local head=$1 base=$2 state=$3 behind=$4 files=$5
  if [[ "$json" == true ]]; then
    printf '{"head":"%s","base":"%s","state":"%s","behind":%s,"conflicts":"%s"}\n' \
      "$(json_escape "$head")" "$(json_escape "$base")" "$state" "$behind" "$(json_escape "$files")"
    return
  fi
  case "$state" in
    fresh) echo "✅ $head ← $base: up to date" ;;
    behind) echo "⏳ $head ← $base: $behind commits behind, merges cleanly" ;;
    merged) echo "🔀 $head ← $base: was $behind behind, merged and pushed" ;;
    conflict) echo "⚠️  $head ← $base: $behind behind, CONFLICTS in: $files" ;;
    missing) echo "❓ $head ← $base: branch not found on origin" ;;
    failed) echo "❌ $head ← $base: $files; nothing was pushed" ;;
  esac
}

workdir=""
cleanup() {
  [[ -n "$workdir" ]] && git worktree remove --force "$workdir" >/dev/null 2>&1
  [[ -n "$workdir" ]] && rm -rf "$workdir"
  workdir=""
}
trap cleanup EXIT INT TERM

# A merge commit needs an author; a fresh environment may have none set.
identity=()
git config user.email >/dev/null 2>&1 || identity+=(-c "user.email=pr-sync@users.noreply.github.com")
git config user.name >/dev/null 2>&1 || identity+=(-c "user.name=PR sync")

worst=0
raise() { [[ "$worst" -lt "$1" ]] && worst=$1; }
for pair in "${pairs[@]}"; do
  head=${pair%%:*}
  base=${pair#*:}
  # Each ref is fetched alone: a missing one must not leave a stale tracking ref
  # to be judged.
  if ! git fetch -q origin "+refs/heads/$head:refs/remotes/origin/$head" 2>/dev/null ||
    ! git fetch -q origin "+refs/heads/$base:refs/remotes/origin/$base" 2>/dev/null; then
    report "$head" "$base" missing 0 ""
    raise 1
    continue
  fi

  behind=$(git rev-list --count "origin/$head..origin/$base")
  if [[ "$behind" -eq 0 ]]; then
    report "$head" "$base" fresh 0 ""
    continue
  fi

  # merge-tree exits 1 on conflicts and lists the conflicted paths after the tree id.
  tree_output=$(git merge-tree --write-tree --name-only "origin/$head" "origin/$base" 2>&1)
  tree_status=$?
  if [[ "$tree_status" -eq 1 ]]; then
    files=$(echo "$tree_output" | sed -n '2,/^$/p' | grep -v '^$' | head -10 | paste -sd ',' -)
    report "$head" "$base" conflict "$behind" "$files"
    raise 2
    continue
  fi
  if [[ "$tree_status" -ne 0 ]]; then
    report "$head" "$base" failed "$behind" "git merge-tree failed (needs git 2.38+): $(echo "$tree_output" | head -1)"
    raise 2
    continue
  fi

  if [[ "$merge" != true ]]; then
    report "$head" "$base" behind "$behind" ""
    raise 1
    continue
  fi

  workdir=$(mktemp -d)
  errors=$(mktemp)
  if git worktree add -q --detach "$workdir" "origin/$head" 2>"$errors" &&
    git "${identity[@]}" -C "$workdir" merge -q --no-edit -m "Merge $base into $head" "origin/$base" >/dev/null 2>"$errors" &&
    git -C "$workdir" push -q origin "HEAD:refs/heads/$head" 2>"$errors"; then
    report "$head" "$base" merged "$behind" ""
  else
    report "$head" "$base" failed "$behind" "$(grep -v '^$' "$errors" | tail -1)"
    raise 2
  fi
  rm -f "$errors"
  cleanup
done

exit "$worst"
