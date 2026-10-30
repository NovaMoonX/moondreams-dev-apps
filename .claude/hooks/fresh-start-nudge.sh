#!/usr/bin/env bash
# UserPromptSubmit hook: when the conversation's context is large, tells the model once per 100k
# tokens to suggest a fresh start at the next natural break (stdout reaches it as context).
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
(( context > 250000 )) || { rm -f "$marker" 2>/dev/null; exit 0; }

step=$(( context / 100000 ))
last=$(cat "$marker" 2>/dev/null)
[[ "$last" =~ ^[0-9]+$ ]] || last=0
(( step > last )) || exit 0

echo "$step" >"$marker" 2>/dev/null
echo "Context is about $(( context / 1000 ))k tokens; every call re-reads it. At the next natural break (a pushed PR, a finished round), suggest the owner run /compact or start a fresh session, once."
exit 0
