#!/bin/bash
# usage: waitreview.sh <pr-number> [max-minutes=20] [since-iso]
# Exits with REVIEW_READY when a Copilot review newer than <since> appears,
# NOT_REQUESTED if Copilot never shows up as a requested reviewer or reviewer,
# or TIMEOUT after max-minutes. Run it with run_in_background.
PR=$1; MAX=${2:-20}; SINCE=${3:-1970-01-01T00:00:00Z}
REPO=NovaMoonX/moondreams-dev-apps
reviews() { gh api repos/$REPO/pulls/$PR/reviews --jq "[.[]|select((.user.login|test(\"opilot\")) and .submitted_at > \"$SINCE\")]|length" 2>/dev/null; }
requested() { gh api repos/$REPO/pulls/$PR/requested_reviewers --jq '[.users[].login|select(test("opilot"))]|length' 2>/dev/null; }
sleep 20
if [ "$(reviews)" = "0" ] && [ "$(requested)" = "0" ]; then echo "NOT_REQUESTED $PR"; exit 0; fi
for i in $(seq 1 $((MAX * 2))); do
  [ "$(reviews)" -gt 0 ] 2>/dev/null && { echo "REVIEW_READY $PR"; exit 0; }
  sleep 30
done
echo "TIMEOUT $PR"
