#!/usr/bin/env bash
# One merge into main at a time, across every session. The lock is the
# `merge-lock` branch, whose last commit says "held" (with the PR, the holder
# and the time) or "free". Taking pushes a held commit on top of a free one and
# releasing pushes a free commit on top of the held one; neither forces, so a
# push succeeds only if nobody moved the branch since it was read, and two
# sessions can never both take it. Nothing is ever deleted.
#
#   npm run merge:lock -- status
#   npm run merge:lock -- take <pr> <holder>   # holder: the session link, or "owner"
#   npm run merge:lock -- release <pr>
#   npm run merge:lock -- break <pr> <reason>  # only a lock older than STALE_MINUTES
#
# The PR number is the lock's identity: whoever drives that PR may release it.
# Exit code: 0 done (or free, for status), 2 held by someone else (status,
# take), 1 refused or failed, including an origin that could not be read.
# Pushing the branch runs no workflow.

set -uo pipefail

LOCK=merge-lock
STALE_MINUTES=${STALE_MINUTES:-90}
EMPTY_TREE=$(git hash-object -t tree /dev/null)

die() { echo "$1" >&2; exit "${2:-1}"; }

# Sets lock_state to none, free or held. An unreachable origin stops the
# script, so a network failure never reads as a free lock.
read_lock() {
  lock_sha=''
  git ls-remote --exit-code origin "refs/heads/$LOCK" >/dev/null 2>&1
  case $? in
    0) ;;
    2) lock_state=none; return ;;
    *) die "Could not reach origin to read the lock." ;;
  esac
  git fetch -q origin "+refs/heads/$LOCK:refs/remotes/origin/$LOCK" \
    || die "Could not fetch the lock."
  lock_sha=$(git rev-parse "refs/remotes/origin/$LOCK")
  local body
  body=$(git log -1 --format=%B "$lock_sha")
  lock_state=$(head -1 <<<"$body" | sed -n 's/^merge-lock: //p')
  lock_pr=$(sed -n 's/^pr: #//p' <<<"$body" | head -1)
  lock_holder=$(sed -n 's/^holder: //p' <<<"$body" | head -1)
  lock_minutes=$(( ($(date +%s) - $(git log -1 --format=%ct "$lock_sha")) / 60 ))
  [[ "$lock_state" == free ]] || lock_state=held
}

describe() {
  echo "Held for #$lock_pr by $lock_holder, taken ${lock_minutes} min ago."
}

# Pushes a commit with this message on top of what was read; false when the
# branch moved in between (or the push failed), with the reason in push_error.
push_state() {
  local message=$1 sha
  if [[ -n "$lock_sha" ]]; then
    sha=$(git commit-tree "$EMPTY_TREE" -p "$lock_sha" -m "$message")
  else
    sha=$(git commit-tree "$EMPTY_TREE" -m "$message")
  fi
  [[ -n "$sha" ]] || die "Could not build the lock commit."
  push_error=$(git push -q origin "$sha:refs/heads/$LOCK" 2>&1)
}

command=${1:-status}
case "$command" in
  status)
    read_lock
    [[ "$lock_state" == held ]] || { echo "Free."; exit 0; }
    describe
    exit 2
    ;;
  take)
    pr=${2:-}; holder=${3:-}
    [[ "$pr" =~ ^[0-9]+$ && -n "$holder" && "$holder" != *$'\n'* ]] \
      || die "Usage: take <pr> <holder> (holder on one line)" 64
    read_lock
    if [[ "$lock_state" == held ]]; then
      [[ "$lock_pr" == "$pr" ]] && { echo "Already held for #$pr."; exit 0; }
      describe
      exit 2
    fi
    message=$(printf 'merge-lock: held\n\npr: #%s\nholder: %s\ntaken: %s\n' \
      "$pr" "$holder" "$(date -u +%Y-%m-%dT%H:%M:%SZ)")
    if push_state "$message"; then
      echo "Taken for #$pr."
      exit 0
    fi
    read_lock
    [[ "$lock_state" == held ]] || die "Could not take the lock: $push_error"
    [[ "$lock_pr" == "$pr" ]] && { echo "Already held for #$pr."; exit 0; }
    describe
    exit 2
    ;;
  release | break)
    pr=${2:-}; reason=${3:-}
    if [[ "$command" == break ]]; then
      [[ "$pr" =~ ^[0-9]+$ && -n "$reason" ]] || die "Usage: break <pr> <reason>" 64
    else
      [[ "$pr" =~ ^[0-9]+$ ]] || die "Usage: release <pr>" 64
    fi
    read_lock
    [[ "$lock_state" == held ]] || { echo "Free already."; exit 0; }
    [[ "$lock_pr" == "$pr" ]] || die "Not held for #$pr: $(describe)"
    if [[ "$command" == break ]] && (( lock_minutes < STALE_MINUTES )); then
      die "Only ${lock_minutes} min old; a lock is stale after ${STALE_MINUTES}. $(describe)"
    fi
    message=$(printf 'merge-lock: free\n\nafter: #%s\n%s\n' "$pr" "${reason:+broken: $reason}")
    push_state "$message" \
      || die "Could not release the lock (it moved, or the push failed): $push_error"
    [[ "$command" == break ]] && echo "Broke the lock for #$pr ($reason)." || echo "Released #$pr."
    ;;
  *)
    die "Unknown command: $command (status, take, release, break)" 64
    ;;
esac
