#!/usr/bin/env bash
# PreToolUse hook on ExitPlanMode: sends a plan back before the owner sees it when
# it carries what the plan rules leave out (orchestrate "Writing a plan"). Plan
# mode's own template asks for files and verification, and it won once.

input=$(cat)

plan=$(echo "$input" | jq -r '.tool_input.plan // ""' 2>/dev/null)
if [[ -z "$plan" ]]; then
  newest=$(ls -t "$HOME"/.claude/plans/*.md 2>/dev/null | head -1)
  [[ -n "$newest" ]] || exit 0
  plan=$(cat "$newest")
fi

problems=()

if echo "$plan" | grep -qE '(^|[^A-Za-z])(src|docs|functions|scripts|\.claude|\.github)/|\.(tsx?|jsx?|json|sh|rules|css)\b'; then
  problems+=("names files or paths")
fi
if echo "$plan" | grep -q '`'; then
  problems+=("has code spans (code names belong in the PR, not the plan)")
fi
if echo "$plan" | grep -qiE '^#+ *(context|verification|build notes|files|critical files|implementation|testing|steps)\b'; then
  problems+=("has a section plan mode's template asks for (Context, Files, Verification, Build notes)")
fi
if echo "$plan" | grep -qE '^ {2,}[-*] '; then
  problems+=("has nested bullets")
fi
words=$(echo "$plan" | wc -w)
if (( words > 350 )); then
  problems+=("runs ${words} words (keep it under 350, readable in a minute)")
fi

(( ${#problems[@]} == 0 )) && exit 0

{
  echo "The plan isn't in the owner's shape yet. It:"
  printf -- '- %s\n' "${problems[@]}"
  echo "Rewrite it by orchestrate \"Writing a plan\": the idea, what the person will see or be able to do, the criteria when they matter, and 🚩 decisions with a recommendation, in plain words and flat bullets. A follow-up plan covers only the owner's last message. These rules replace plan mode's default template."
} >&2
exit 2
