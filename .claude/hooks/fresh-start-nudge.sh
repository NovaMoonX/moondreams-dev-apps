#!/usr/bin/env bash
# UserPromptSubmit hook: when the context nears the auto-compact window, tells the model once per 50k
# tokens to make its state durable so the next compaction loses nothing (stdout reaches it as context).
# Reads the transcript only: no network, silent on any error.

command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)
transcript=$(echo "$input" | jq -r '.transcript_path // empty' 2>/dev/null)
session=$(echo "$input" | jq -r '.session_id // empty' 2>/dev/null)
[[ -n "$session" && -n "$transcript" && -f "$transcript" ]] || exit 0

# Only the newest reply matters, so read the tail rather than the whole transcript.
context=$(tail -n 400 "$transcript" | jq -R -s -r '
  [split("\n")[] | fromjson? | select(.type == "assistant" and .message.model != "<synthetic>" and .message.usage != null)] | last
  | if . == null then 0 else
      (.message.usage.input_tokens // 0) + (.message.usage.cache_read_input_tokens // 0)
      + (.message.usage.cache_creation_input_tokens
         // ((.message.usage.cache_creation.ephemeral_5m_input_tokens // 0) + (.message.usage.cache_creation.ephemeral_1h_input_tokens // 0)))
    end' 2>/dev/null)
[[ "$context" =~ ^[0-9]+$ ]] || exit 0

marker="${TMPDIR:-/tmp}/fresh-start-nudge-${session//[^A-Za-z0-9_-]/}"
# After /compact the context starts small again, so the steps start over.
(( context > 200000 )) || { rm -f "$marker" 2>/dev/null; exit 0; }

step=$(( context / 50000 ))
last=$(cat "$marker" 2>/dev/null)
[[ "$last" =~ ^[0-9]+$ ]] || last=0
(( step > last )) || exit 0

echo "$step" >"$marker" 2>/dev/null
echo "Context is about $(( context / 1000 ))k tokens; it compacts on its own once the session goes idle or reaches 300k, so never ask the owner to run /compact. Before this turn ends, put anything a later turn needs where a summary keeps it (commit and push, the PR's status comment, the plan), and hand file-heavy reading to an agent. Suggest a fresh session only when the next ask is unrelated work."
exit 0
