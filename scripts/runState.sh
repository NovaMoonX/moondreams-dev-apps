#!/usr/bin/env bash
# Records whether a session is in the middle of a run of several issues, so the
# run-keepalive Stop hook can stop a turn that would leave the run idle.
#   start "<the run>"   next "<the next step>"   wait "<what will wake you>"
#   block "<what the owner must do>"   done   status
set -u

git_common=$(git rev-parse --git-common-dir 2>/dev/null) || { echo "Not in a git checkout." >&2; exit 1; }
file="$(cd "$git_common" && pwd)/claude-run"
command=${1:-status}
note=${2:-}

read_field() { sed -n "s/^$1=//p" "$file" 2>/dev/null | head -1; }

write_state() {
  local goal next
  goal=$(read_field goal)
  next=$(read_field next)
  [[ "$1" == "start" ]] && goal=$note && next=""
  [[ "$1" == "next" ]] && next=$note
  local state=$1
  [[ "$1" == "start" || "$1" == "next" ]] && state=working
  printf 'goal=%s\nstate=%s\nnext=%s\nnote=%s\nat=%s\n' \
    "$goal" "$state" "$next" "$note" "$(date +%s)" >"$file"
}

case "$command" in
  start | next | wait | block)
    [[ -n "$note" ]] || { echo "Say what: npm run -s run:state -- $command \"...\"" >&2; exit 1; }
    [[ "$command" == "start" || -f "$file" ]] || { echo "No run started: npm run -s run:state -- start \"...\"" >&2; exit 1; }
    write_state "$command"
    ;;
  done) rm -f "$file" ;;
  status) [[ -f "$file" ]] && cat "$file" || echo "No run in progress." ;;
  *) echo "Unknown command '$command' (start, next, wait, block, done, status)." >&2; exit 1 ;;
esac
