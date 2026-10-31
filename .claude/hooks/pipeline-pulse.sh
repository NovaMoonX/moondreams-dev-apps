#!/usr/bin/env bash
# Session state, phase, running helpers and the last reply's 🚩 lines; "tool" reports at most once a minute.
# Silent without PIPELINE_KEY, sent in the background, never blocks or fails a turn.
# "stop" also rewrites the session's whole token use, so a restart never double-counts.

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

if [[ "$mode" == "tool" ]]; then
  # A helper's own tool calls say nothing about what the session itself is doing.
  [[ -z "$(echo "$input" | jq -r '.agent_id // empty' 2>/dev/null)" ]] || exit 0
  stamp="${TMPDIR:-/tmp}/pipeline-pulse-${session_id}"
  tool=$(echo "$input" | jq -r '.tool_name // empty' 2>/dev/null)
  # A helper starting is worth a report at once; anything else waits out the minute.
  if [[ "$tool" != "Agent" && -n "$(find "$stamp" -mmin -1 2>/dev/null)" ]]; then
    exit 0
  fi
  touch "$stamp" 2>/dev/null
fi

branch=$(git branch --show-current 2>/dev/null)
transcript=$(echo "$input" | jq -r '.transcript_path // empty' 2>/dev/null)

# Helpers still out: background agents not marked finished whose transcript moved in the last 10 minutes,
# so a helper that died without finishing doesn't keep the session working.
helpers="[]"
subagents="${transcript%.jsonl}/subagents"
if [[ -n "$transcript" && -d "$subagents" ]]; then
  helpers=$(find "$subagents" -maxdepth 1 -name 'agent-*.jsonl' -mmin -10 2>/dev/null \
    | sed 's/\.jsonl$/.meta.json/' | xargs -r cat 2>/dev/null \
    | jq -s -c '[.[] | select(.requestShape == "background" and (.finished // false) == false) | .agentType // "helper"] | .[0:10]' 2>/dev/null)
  [[ -n "$helpers" ]] || helpers="[]"
fi

phase_of_tool() {
  echo "$input" | jq -r '
    (.tool_name // "") as $t | (.tool_input // {}) as $i
    | if $t == "Edit" or $t == "Write" or $t == "NotebookEdit" then "building"
      elif $t == "Agent" then
        (($i.subagent_type // "") as $a
         | if ($a | test("reviewer")) then "review"
           elif $a == "validator" then "checks"
           elif ($a | test("planner|^Plan$")) then "planning"
           elif ($a | test("implementer|syncer")) then "building"
           else "investigating" end)
      elif $t == "Bash" then
        (($i.command // "") as $c
         | if ($c | test("(^|&&|\\|\\||;|\\||\\()\\s*git( -C \\S+)? (commit|push|merge)")) then "building"
           elif ($c | test("pw\\.mjs|playwright|publish-screenshots")) then "screenshots"
           elif ($c | test("\\b(tsc|eslint|prettier)\\b|npm run -?s? ?check:")) then "checks"
           else "investigating" end)
      elif $t == "Skill" or $t == "EnterPlanMode" or $t == "ExitPlanMode" then "planning"
      elif ($t | test("^mcp__github")) then "conversation"
      else "investigating" end' 2>/dev/null
}

phase=""
[[ "$mode" == "tool" ]] && phase=$(phase_of_tool)
# While reviewers or checkers are out, that is what the session is waiting on.
if echo "$helpers" | jq -e 'any(.[]; test("reviewer"))' >/dev/null 2>&1; then phase="review"
elif echo "$helpers" | jq -e 'any(.[]; . == "validator")' >/dev/null 2>&1 && [[ -z "$phase" ]]; then phase="checks"
fi

state="working"
hands="[]"
if [[ "$mode" == "stop" ]]; then
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
  if [[ "$helpers" != "[]" ]]; then state="working"
  elif [[ "$hands" == "[]" ]]; then state="idle"
  else state="waiting"; fi
elif [[ "$mode" != "working" && "$mode" != "tool" ]]; then
  exit 0
fi

body=$(jq -n -c \
  --arg key "$PIPELINE_KEY" \
  --arg sessionId "$session_id" \
  --arg state "$state" \
  --arg url "$session_url" \
  --arg branch "$branch" \
  --argjson hands "$hands" \
  --arg phase "$phase" \
  --argjson helpers "$helpers" \
  --argjson turnStart "$([[ "$mode" == "working" ]] && echo true || echo false)" \
  '{data: {key: $key, kind: "session", sessionId: $sessionId, state: $state,
    url: (if $url == "" then null else $url end),
    branch: (if $branch == "" then null else $branch end),
    raisedHands: $hands,
    phase: (if $phase == "" then null else $phase end),
    helpers: $helpers, turnStart: $turnStart}}' 2>/dev/null) || exit 0

endpoint="${PIPELINE_URL:-https://us-central1-moondreams-dev-apps.cloudfunctions.net/recordPipelineEvent}"
nohup curl -sS --max-time 8 -X POST -H 'Content-Type: application/json' \
  --data "$body" "$endpoint" >/dev/null 2>&1 &

[[ "$mode" == "stop" && -n "${transcript:-}" && -f "$transcript" ]] || exit 0

# One reply is several transcript lines sharing a message id and usage: count usage once, gather tools from all.
shared_defs='
  def replies:
    [.[] | select(.type == "assistant" and .message.model != "<synthetic>" and .message.usage != null and .message.id != null)]
    | group_by(.message.id)
    | map({ts: .[0].timestamp, model: .[0].message.model,
           usage: (map(.message.usage) | reduce .[] as $u ({}; . as $acc | $u | with_entries(.value = (if (.value | type) == "number" then ([.value, ($acc[.key] // 0)] | max) else .value end)) | $acc + .)),
           tools: [.[].message.content[]? | select(.type == "tool_use")]})
    | sort_by(.ts);
  def written: (.usage.cache_creation_input_tokens // ((.usage.cache_creation.ephemeral_5m_input_tokens // 0) + (.usage.cache_creation.ephemeral_1h_input_tokens // 0)));
  def edited_apps:
    [.[].tools[] | select(.name == "Edit" or .name == "Write") | (.input.file_path // "")
     | capture("src/apps/(?<id>[a-z0-9-]{1,40})/").id?];
  def row($phase; $isHelper):
    {day: .ts[0:10], model: .model, phase: $phase, isHelper: $isHelper, calls: 1,
     input: (.usage.input_tokens // 0),
     cacheWrite5m: (.usage.cache_creation.ephemeral_5m_input_tokens // (if .usage.cache_creation then 0 else written end)),
     cacheWrite1h: (.usage.cache_creation.ephemeral_1h_input_tokens // 0),
     cacheRead: (.usage.cache_read_input_tokens // 0),
     output: (.usage.output_tokens // 0)};
'
main_program="$shared_defs"'
  def uses($names): any(.tools[]; .name as $n | $names | index($n));
  def phase:
    if any(.tools[]; .name == "Bash" and ((.input.command // "") | test("pw\\.mjs|playwright|publish-screenshots"))) then "screenshots"
    elif uses(["Edit", "Write", "NotebookEdit"]) then "building"
    elif uses(["Agent", "EnterPlanMode", "ExitPlanMode"]) or any(.tools[]; .name == "Skill" and ((.input.skill // "") | IN("plan-app", "orchestrate"))) then "planning"
    elif uses(["Read", "Grep", "Glob", "WebFetch", "WebSearch", "Bash", "ToolSearch"]) then "investigating"
    else "conversation" end;
  replies as $r
  | {
      apps: ($r | edited_apps),
      contextTokens: ($r | last | (if . == null then 0 else ((.usage.input_tokens // 0) + (.usage.cache_read_input_tokens // 0) + written) end)),
      calls: ($r | length),
      rows: [$r[] | row(phase; false)]
    }'
helper_program="$shared_defs"'replies | {apps: edited_apps, rows: map(row($phase; true))}'

(
  base="${transcript%.jsonl}"
  # Everything that grows with the session goes through files: one argument over 128 KB fails quietly.
  trap '' HUP
  work=$(mktemp -d) || exit 0
  trap 'rm -rf "$work"' EXIT
  for file in "$base"/subagents/agent-*.jsonl; do
    [[ -f "$file" ]] || continue
    agent_type=$(jq -r '.agentType // empty' "${file%.jsonl}.meta.json" 2>/dev/null)
    case "$agent_type" in
      implementer | pr-syncer | stack-pr-reviewer) phase="building" ;;
      validator) phase="checks" ;;
      technical-reviewer | product-reviewer | design-reviewer | lead-reviewer) phase="review" ;;
      product-planner | design-planner | tech-planner | Plan) phase="planning" ;;
      *) phase="investigating" ;;
    esac
    jq -s -c --arg phase "$phase" "$helper_program" "$file" 2>/dev/null
  done >"$work/helpers.jsonl"
  jq -s -c "$main_program" "$transcript" 2>/dev/null | jq -c \
    --arg key "$PIPELINE_KEY" \
    --arg sessionId "$session_id" \
    --arg url "$session_url" \
    --arg branch "$branch" \
    --slurpfile helpers "$work/helpers.jsonl" \
    '{data: {key: $key, kind: "cost", sessionId: $sessionId,
      url: (if $url == "" then null else $url end),
      branch: (if $branch == "" then null else $branch end),
      app: (.apps + [$helpers[].apps[]] | group_by(.) | sort_by(length) | last | (if . == null then null else .[0] end)),
      contextTokens: .contextTokens, calls: .calls,
      rows: (.rows + [$helpers[].rows[]]
        | group_by([.day, .model, .phase, .isHelper])
        | map(.[0] + {calls: (map(.calls) | add), input: (map(.input) | add), cacheWrite5m: (map(.cacheWrite5m) | add),
                      cacheWrite1h: (map(.cacheWrite1h) | add), cacheRead: (map(.cacheRead) | add), output: (map(.output) | add)}))}}' \
    >"$work/body.json" 2>/dev/null
  [[ -s "$work/body.json" ]] || exit 0
  curl -sS --max-time 8 -X POST -H 'Content-Type: application/json' \
    --data @"$work/body.json" "$endpoint" >/dev/null 2>&1
) >/dev/null 2>&1 &
exit 0
