#!/usr/bin/env bash
# SessionStart hook (matcher "compact"): after any compaction, stdout reaches the model as context,
# so it re-reads the durable state instead of trusting the summary. Git only: no network, silent on error.

branch=$(git -C "${CLAUDE_PROJECT_DIR:-.}" branch --show-current 2>/dev/null)
dirty=$(git -C "${CLAUDE_PROJECT_DIR:-.}" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
unpushed=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-list --count '@{u}..HEAD' 2>/dev/null)

echo "The conversation was just compacted; the summary may have dropped detail."
[[ -n "$branch" ]] && echo "Branch: $branch (${dirty:-0} uncommitted files, ${unpushed:-unknown} unpushed commits)."
echo "Before continuing, re-read what holds this session's state: the open PR for this branch and its 📋 Status comment, any plan or todo list, and the 🚩 lines still open. Restate open 🚩s from there in the next card, never from memory."
exit 0
