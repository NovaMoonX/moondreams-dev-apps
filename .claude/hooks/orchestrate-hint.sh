#!/usr/bin/env bash
# UserPromptSubmit hook: points large or multi-issue work at the orchestrate
# skill, so it runs without being invoked by name. In plan mode it also states
# the plan rules outright: a conditional "load the skill" was skipped once, and
# plan mode's own template (files, verification) won.

input=$(cat)
mode=$(echo "$input" | jq -r '.permission_mode // ""' 2>/dev/null)
prompt=$(echo "$input" | jq -r '.prompt // ""' 2>/dev/null)

if [[ "$mode" == "plan" ]]; then
  echo "Plan rules (orchestrate \"Writing a plan\"), which replace plan mode's default template: the plan is for the owner and readable in under a minute. Write the idea, what the person will see or be able to do, the criteria when they matter, and only uncertain or risky decisions as 🚩 questions with your recommendation, in plain words and flat bullets. No files, paths, code names, data shapes, verification steps or docs to update; no Context, Files or Verification sections. A follow-up plan covers only the owner's last message. The plan-check hook sends back a plan that breaks these. Load the orchestrate skill before building."
  exit 0
fi

issue_refs=$(echo "$prompt" | grep -oE '#[0-9]+' | sort -u | wc -l)
if [[ "$issue_refs" -ge 2 ]] || echo "$prompt" | grep -qiE '\b(github issues|these issues|issues in order|issues [0-9]+)'; then
  echo "If this is large or multi-issue work (more than one issue, about 1,000+ lines, or planned in plan mode), load the orchestrate skill before starting and follow it."
fi
exit 0
