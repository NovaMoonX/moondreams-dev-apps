#!/usr/bin/env bash
# One merge into main at a time, across every session. The lock is the
# `merge-lock` branch: a push that creates it succeeds for exactly one caller,
# so two sessions can never both hold it. Its commit message says who holds it.
#
#   npm run merge:lock -- status
#   npm run merge:lock -- take <pr> <holder>   # holder: the session link, or "owner"
#   npm run merge:lock -- release <pr>
#   npm run merge:lock -- break <pr> <reason>  # only a lock older than STALE_MINUTES
#
# Exit code: 0 done (or free, for status), 2 held by someone else (status,
# take), 1 refused or failed. Pushing the branch runs no workflow.

set -uo pipefail

LOCK=merge-lock
STALE_MINUTES=${STALE_MINUTES:-90}

die() { echo "$1" >&2; exit "${2:-1}"; }

read_lock() {
  git fetch -q origin "+refs/heads/$LOCK:refs/remotes/origin/$LOCK" 2>/dev/null || return 1
  lock_sha=$(git rev-parse "refs/remotes/origin/$LOCK")
  lock_pr=$(git log -1 --format=%B "$lock_sha" | sed -n 's/^pr: #//p')
  lock_holder=$(git log -1 --format=%B "$lock_sha" | sed -n 's/^holder: //p')
  lock_time=$(git log -1 --format=%ct "$lock_sha")
  lock_minutes=$(( ($(date +%s) - lock_time) / 60 ))
}

describe() {
  echo "Held for #$lock_pr by $lock_holder, taken ${lock_minutes} min ago."
}

# Deletes the lock only if it is still the commit we read, so a lock someone
# else took in between is never removed.
delete_lock() {
  git push -q --force-with-lease="refs/heads/$LOCK:$lock_sha" origin ":refs/heads/$LOCK" \
    || die "The lock changed while releasing it; run status again."
  git update-ref -d "refs/remotes/origin/$LOCK" 2>/dev/null || true
}

command=${1:-status}
case "$command" in
  status)
    read_lock || { echo "Free."; exit 0; }
    describe
    exit 2
    ;;
  take)
    pr=${2:-}; holder=${3:-}
    [[ "$pr" =~ ^[0-9]+$ && -n "$holder" ]] || die "Usage: take <pr> <holder>" 64
    git fetch -q origin main || die "Could not fetch main."
    message=$(printf 'merge-lock\n\npr: #%s\nholder: %s\ntaken: %s\n' \
      "$pr" "$holder" "$(date -u +%Y-%m-%dT%H:%M:%SZ)")
    sha=$(git commit-tree "origin/main^{tree}" -p origin/main -m "$message") \
      || die "Could not build the lock commit."
    if git push -q origin "$sha:refs/heads/$LOCK" 2>/dev/null; then
      echo "Taken for #$pr."
      exit 0
    fi
    read_lock || die "The push failed but no lock is there; retry."
    [[ "$lock_pr" == "$pr" ]] && { echo "Already held for #$pr."; exit 0; }
    describe
    exit 2
    ;;
  release)
    pr=${2:-}
    [[ "$pr" =~ ^[0-9]+$ ]] || die "Usage: release <pr>" 64
    read_lock || { echo "Free already."; exit 0; }
    [[ "$lock_pr" == "$pr" ]] || die "Not yours: $(describe)"
    delete_lock
    echo "Released #$pr."
    ;;
  break)
    pr=${2:-}; reason=${3:-}
    [[ "$pr" =~ ^[0-9]+$ && -n "$reason" ]] || die "Usage: break <pr> <reason>" 64
    read_lock || { echo "Free already."; exit 0; }
    [[ "$lock_pr" == "$pr" ]] || die "The lock is not held for #$pr: $(describe)"
    (( lock_minutes >= STALE_MINUTES )) \
      || die "Only ${lock_minutes} min old; a lock is stale after ${STALE_MINUTES}. $(describe)"
    delete_lock
    echo "Broke the lock for #$pr ($reason)."
    ;;
  *)
    die "Unknown command: $command (status, take, release, break)" 64
    ;;
esac
