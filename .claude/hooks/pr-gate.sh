#!/usr/bin/env bash
# Stop hook: once a feature branch is pushed and clean at a new HEAD, works out
# what this push needs (from the files it changed and the PR's size) and asks
# for exactly that, so a docs push doesn't trigger a full review pass.
# The steps it names are in .claude/skills/pr-wrap-up/SKILL.md and
# .claude/skills/orchestrate/SKILL.md ("Sizing the review", "The PR status comment").

input=$(cat)

stop_hook_active=$(echo "$input" | jq -r '.stop_hook_active // "false"' 2>/dev/null)
if [[ "$stop_hook_active" == "true" ]]; then
  exit 0
fi

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0
[[ -n "$(git remote 2>/dev/null)" ]] || exit 0

default_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
default_branch=${default_branch:-main}
current_branch=$(git branch --show-current 2>/dev/null)
if [[ -z "$current_branch" || "$current_branch" == "$default_branch" ]]; then
  exit 0
fi

# A half-finished branch (unpushed, dirty) isn't ready for a pass yet.
git rev-parse -q --verify "origin/$current_branch" >/dev/null 2>&1 || exit 0
if ! git diff --quiet || ! git diff --cached --quiet; then
  exit 0
fi
unpushed=$(git rev-list "origin/$current_branch..HEAD" --count 2>/dev/null) || unpushed=0
[[ "$unpushed" -gt 0 ]] && exit 0

head_sha=$(git rev-parse HEAD 2>/dev/null)
git_dir=$(git rev-parse --git-dir 2>/dev/null)
marker_file="$git_dir/.pr-gate-last-sha"
last_sha=$(cat "$marker_file" 2>/dev/null || true)
[[ "$head_sha" == "$last_sha" ]] && exit 0
echo "$head_sha" > "$marker_file"

base=$(git merge-base "origin/$default_branch" HEAD 2>/dev/null || echo "")
[[ -n "$base" ]] || exit 0

# The delta since the last pass, or the whole PR on the first one.
since="$base"
if [[ -n "$last_sha" ]] && git merge-base --is-ancestor "$last_sha" HEAD 2>/dev/null; then
  since="$last_sha"
fi
delta_files=$(git diff --name-only "$since" HEAD)
pr_files=$(git diff --name-only "$base" HEAD)
pr_lines=$(git diff --shortstat "$base" HEAD | awk '{print $4 + $6}')
pr_lines=${pr_lines:-0}

has() { echo "$1" | grep -qE "$2"; }
code_re='\.(ts|tsx|js|mjs|css)$'
ui_re='^src/.*\.(tsx|css)$'
risky_re='^(firestore\.rules|storage\.rules|database\.rules\.json|firestore\.indexes\.json|functions/|cloudflare-worker\.js|src/(components|ui|hooks)/|src/index\.css)'
rules_re='^(firestore\.rules|storage\.rules|database\.rules\.json|firestore\.indexes\.json)'

size="S"
if [[ "$pr_lines" -gt 1500 ]] || has "$pr_files" "$risky_re"; then
  size="L"
elif [[ "$pr_lines" -gt 300 ]] || has "$pr_files" "$ui_re"; then
  size="M"
fi

steps=("Make sure an open pull request exists for '$current_branch'; if none, open it as a DRAFT with its patch/minor label and a 'Resolves #N' line per issue it delivers.")
if has "$delta_files" "$code_re" || has "$delta_files" "$rules_re" || has "$delta_files" '^functions/'; then
  steps+=("Run the validator agent over the PR.")
  if has "$delta_files" "$ui_re"; then
    steps+=("Re-take and re-publish the screenshots of every screen this push changed (pr-wrap-up §1).")
  fi
  if has "$delta_files" "$rules_re"; then
    steps+=("Re-run the rules rows of the Regression check against the emulator, against the base rules too (pr-wrap-up §2).")
  else
    steps+=("Re-run any Regression check row whose area this push touched (pr-wrap-up §2).")
  fi
  steps+=("Review at size $size ($pr_lines changed lines in the PR) per orchestrate 'Sizing the review', covering only what changed since the last review if one ran.")
else
  steps+=("This push changed no code (docs or config only): no screenshots or review agents; check the PR body still matches.")
fi
steps+=("Rewrite the PR's status comment (orchestrate 'The PR status comment') with what must and should be done, next moves and where the PR sits among the planned issues.")

{
  echo "Branch '$current_branch' is pushed and clean at ${head_sha:0:7}. Before ending this turn, without asking:"
  for i in "${!steps[@]}"; do
    echo "$((i + 1)). ${steps[$i]}"
  done
} >&2
exit 2
