#!/usr/bin/env bash
# Stop hook: during a run of several issues (scripts/runState.sh), a turn may end
# only while something will wake the session: a background helper still working,
# or a recorded wait. Otherwise it names the next step and keeps the turn going.

input=$(cat)
git_common=$(git rev-parse --git-common-dir 2>/dev/null) || exit 0
run_file="$(cd "$git_common" && pwd)/claude-run"
[[ -f "$run_file" ]] || exit 0

field() { sed -n "s/^$1=//p" "$run_file" | head -1; }
state=$(field state)
[[ "$state" == "block" ]] && exit 0

# At most one push in a row, so a turn that truly cannot go on is never trapped.
marker="${run_file}.last-push"
if [[ -f "$marker" && -n "$(find "$marker" -mmin -3 2>/dev/null)" ]]; then
  rm -f "$marker"
  exit 0
fi

# Background helpers not marked finished whose transcript moved in the last 10 minutes wake the session when they finish.
transcript=$(echo "$input" | jq -r '.transcript_path // empty' 2>/dev/null)
subagents="${transcript%.jsonl}/subagents"
if [[ -n "$transcript" && -d "$subagents" ]]; then
  running=$(find "$subagents" -maxdepth 1 -name 'agent-*.jsonl' -mmin -10 2>/dev/null \
    | sed 's/\.jsonl$/.meta.json/' | xargs -r cat 2>/dev/null \
    | jq -s '[.[] | select(.requestShape == "background" and (.finished // false) == false)] | length' 2>/dev/null)
  [[ "${running:-0}" -gt 0 ]] && exit 0
fi

# A recorded wait holds for 110 minutes: background tasks are stopped at two hours.
at=$(field at)
if [[ "$state" == "wait" && -n "$at" && $(($(date +%s) - at)) -lt 6600 ]]; then
  exit 0
fi

touch "$marker"
next=$(field next)
{
  echo "A run is in progress ($(field goal)) and nothing is running that would wake this session, so ending the turn now leaves it idle."
  [[ "$state" == "wait" ]] && echo "The wait recorded over 110 minutes ago ($(field note)) has likely lapsed: check on it."
  [[ -n "$next" ]] && echo "Next step: $next."
  echo "Without asking, do one of these before ending the turn:"
  echo "1. Start the next step now (the end of one issue is not the end of the run)."
  echo "2. Waiting on something outside the session (CI, a deploy, the merge line): schedule a send_later check-in, then 'npm run -s run:state -- wait \"<what wakes you>\"'."
  echo "3. Blocked on the owner: 'npm run -s run:state -- block \"<what they must do>\"' and end with the card."
  echo "4. The run is finished: 'npm run -s run:state -- done' and end with the card."
} >&2
exit 2
