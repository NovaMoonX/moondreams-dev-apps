#!/usr/bin/env bash
# Stop hook: once a feature branch is pushed and clean, tells Claude to
# ensure a (draft) PR exists for it and run the finish-feature-pr skill.
# See .claude/skills/finish-feature-pr/SKILL.md step 0a/0b.

input=$(cat)

# Recursion guard: don't re-fire while we're already handling a prior block.
stop_hook_active=$(echo "$input" | jq -r '.stop_hook_active // "false"' 2>/dev/null)
if [[ "$stop_hook_active" == "true" ]]; then
  exit 0
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

if [[ -z "$(git remote 2>/dev/null)" ]]; then
  exit 0
fi

default_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
default_branch=${default_branch:-main}
current_branch=$(git branch --show-current 2>/dev/null)

# Only meant for feature branches, not the trunk itself or a detached HEAD.
if [[ -z "$current_branch" || "$current_branch" == "$default_branch" ]]; then
  exit 0
fi

# Needs a pushed upstream and a clean, fully-pushed tree — a half-finished
# branch isn't ready for a PR/finish pass yet, and the existing
# stop-hook-git-check.sh already nags about pushing.
if ! git rev-parse -q --verify "origin/$current_branch" >/dev/null 2>&1; then
  exit 0
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  exit 0
fi
unpushed=$(git rev-list "origin/$current_branch..HEAD" --count 2>/dev/null) || unpushed=0
if [[ "$unpushed" -gt 0 ]]; then
  exit 0
fi

# Fire at most once per HEAD so this doesn't loop or re-nag on every stop.
head_sha=$(git rev-parse HEAD 2>/dev/null)
git_dir=$(git rev-parse --git-dir 2>/dev/null)
marker_file="$git_dir/.finish-feature-pr-last-sha"

last_sha=""
if [[ -f "$marker_file" ]]; then
  last_sha=$(cat "$marker_file")
fi

if [[ "$head_sha" == "$last_sha" ]]; then
  exit 0
fi

echo "$head_sha" > "$marker_file"

cat <<EOF >&2
Branch '$current_branch' is pushed and clean at ${head_sha:0:7}. Before ending this turn: 1) check whether an open pull request already exists for this branch, and if not, create one as a DRAFT pull request; 2) then invoke the finish-feature-pr skill to take it the rest of the way to mergeable (resolve conflicts with main, audit CRUD/UX, sync Firestore/Storage rules, validate, and update the PR). Do this automatically, without asking for confirmation.
EOF
exit 2
