#!/usr/bin/env bash
# UserPromptSubmit ("working") and Stop ("stop") hook: tells the admin screen's Pipeline view
# what this session is doing and which 🚩 questions its last reply raised. Silent and instant
# without PIPELINE_KEY; the report is sent in the background and never blocks or fails the turn.

[[ -n "${PIPELINE_KEY:-}" ]] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

mode="${1:-}"
input=$(cat)

remote_id="${CLAUDE_CODE_REMOTE_SESSION_ID:-}"
if [[ "$remote_id" == cse_* ]]; then
  session_id="session_${remote_id#cse_}"
  session_url="https://claude.ai/code/$session_id"
else
  session_id=$(echo "$input" | jq -r '.session_id // empty' 2>/dev/null)
  session_url=""
fi
[[ -n "$session_id" ]] || exit 0

branch=$(git branch --show-current 2>/dev/null)

state="working"
hands="[]"
if [[ "$mode" == "stop" ]]; then
  transcript=$(echo "$input" | jq -r '.transcript_path // empty' 2>/dev/null)
  if [[ -n "$transcript" && -f "$transcript" ]]; then
    # A reply's blocks are separate lines sharing one message id, so gather every text block of the last one.
    hands=$(
      tac "$transcript" 2>/dev/null \
        | grep -m 200 '"type":"assistant"' \
        | jq -R 'fromjson? | select(.type == "assistant" and any(.message.content[]?; .type == "text"))' 2>/dev/null \
        | jq -s -c '
            (.[0].message.id) as $id
            | map(select(.message.id == $id)) | reverse
            | map(.message.content[]? | select(.type == "text") | .text)
            | join("\n")
            | split("\n")
            | map(select(test("^[ \\t*-]*🚩")) | sub("^[ \\t*-]*🚩"; "") | gsub("^\\s+|\\s+$"; ""))
            | map(select(length > 0))' 2>/dev/null
    )
    [[ -n "$hands" ]] || hands="[]"
  fi
  if [[ "$hands" == "[]" ]]; then state="idle"; else state="waiting"; fi
elif [[ "$mode" != "working" ]]; then
  exit 0
fi

body=$(jq -n -c \
  --arg key "$PIPELINE_KEY" \
  --arg sessionId "$session_id" \
  --arg state "$state" \
  --arg url "$session_url" \
  --arg branch "$branch" \
  --argjson hands "$hands" \
  '{data: {key: $key, kind: "session", sessionId: $sessionId, state: $state,
    url: (if $url == "" then null else $url end),
    branch: (if $branch == "" then null else $branch end),
    raisedHands: $hands}}' 2>/dev/null) || exit 0

endpoint="${PIPELINE_URL:-https://us-central1-moondreams-dev-apps.cloudfunctions.net/recordPipelineEvent}"
nohup curl -sS --max-time 8 -X POST -H 'Content-Type: application/json' \
  --data "$body" "$endpoint" >/dev/null 2>&1 &
exit 0
