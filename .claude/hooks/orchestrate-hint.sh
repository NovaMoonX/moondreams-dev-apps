#!/usr/bin/env bash
# UserPromptSubmit hook: points large or multi-issue work at the orchestrate
# skill, so it runs without being invoked by name.

input=$(cat)
mode=$(echo "$input" | jq -r '.permission_mode // ""' 2>/dev/null)
prompt=$(echo "$input" | jq -r '.prompt // ""' 2>/dev/null)

issue_refs=$(echo "$prompt" | grep -oE '#[0-9]+' | sort -u | wc -l)
if [[ "$mode" == "plan" || "$issue_refs" -ge 2 ]] || echo "$prompt" | grep -qiE '\bissues\b'; then
  echo "If this is large or multi-issue work (more than one issue, about 1,000+ lines, or planned in plan mode), load the orchestrate skill before starting and follow it."
fi
exit 0
