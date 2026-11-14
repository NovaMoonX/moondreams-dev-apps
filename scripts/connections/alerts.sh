#!/usr/bin/env bash
# Creates the three alert policies that watch the connections master keyring (a failed check, a missing heartbeat, a changed secret).
#   npm run connections:alerts -- you@example.com
# Run it after the merge that deploys verifyConnectionKeys. It is safe to run again: what already exists is left alone.
set -euo pipefail

PROJECT=moondreams-dev-apps
EMAIL="${1:-}"
[[ "$EMAIL" == *@* ]] || { echo "✗ Give the email that should get the alerts: npm run connections:alerts -- you@example.com" >&2; exit 1; }
command -v gcloud >/dev/null 2>&1 || { echo "✗ gcloud isn't installed. Install it from https://cloud.google.com/sdk/docs/install and run: gcloud auth login" >&2; exit 1; }

source "$(dirname "$0")/../lib/gcloudTracks.sh"
require_gcloud_tracks alpha beta

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

CHANNEL="$(gcloud beta monitoring channels list --project="$PROJECT" --filter="displayName=\"Connections owner email\"" --format='value(name)' </dev/null | head -n1)"
if [[ -z "$CHANNEL" ]]; then
  CHANNEL="$(gcloud beta monitoring channels create --project="$PROJECT" --display-name="Connections owner email" --type=email \
    --channel-labels=email_address="$EMAIL" --format='value(name)')"
  echo "✓ Created the email channel. Google may send a message asking you to verify it."
fi

policy_exists() {
  [[ -n "$(gcloud alpha monitoring policies list --project="$PROJECT" --filter="displayName=\"$1\"" --format='value(name)' </dev/null)" ]]
}

create_policy() {
  local name="$1" file="$2"
  if policy_exists "$name"; then
    echo "• \"$name\" already exists."
    return
  fi
  gcloud alpha monitoring policies create --project="$PROJECT" --policy-from-file="$file" >/dev/null || return 1
  echo "✓ Created \"$name\"."
}

cat > "$WORK/failed.json" <<JSON
{
  "displayName": "Connections: key check failed",
  "combiner": "OR",
  "conditions": [{
    "displayName": "connections.keys.failed logged",
    "conditionMatchedLog": { "filter": "jsonPayload.event=\"connections.keys.failed\"" }
  }],
  "alertStrategy": { "notificationRateLimit": { "period": "300s" }, "autoClose": "604800s" },
  "notificationChannels": ["$CHANNEL"]
}
JSON
create_policy "Connections: key check failed" "$WORK/failed.json"

if ! gcloud logging metrics describe connections_keys_ok --project="$PROJECT" >/dev/null 2>&1; then
  gcloud logging metrics create connections_keys_ok --project="$PROJECT" \
    --description="Daily connections key check passed" --log-filter='jsonPayload.event="connections.keys.ok"' >/dev/null
  echo "✓ Created the connections_keys_ok metric."
fi
# An absence condition only watches a series that exists, so the check runs once now to start it.
JOB="$(gcloud scheduler jobs list --location=us-central1 --project="$PROJECT" --format='value(name)' | grep verifyConnectionKeys | head -n1 || true)"
if [[ -n "$JOB" ]]; then
  gcloud scheduler jobs run "$JOB" --location=us-central1 --project="$PROJECT" >/dev/null && echo "✓ Ran the key check once."
else
  echo "✗ The verifyConnectionKeys job isn't deployed yet. Run this again after the merge has deployed." >&2
  exit 1
fi

cat > "$WORK/heartbeat.json" <<JSON
{
  "displayName": "Connections: key check heartbeat missing",
  "combiner": "OR",
  "conditions": [{
    "displayName": "Fewer than one connections.keys.ok in a day",
    "conditionThreshold": {
      "filter": "metric.type=\"logging.googleapis.com/user/connections_keys_ok\" AND resource.type=\"cloud_run_revision\"",
      "comparison": "COMPARISON_LT",
      "thresholdValue": 1,
      "duration": "3600s",
      "evaluationMissingData": "EVALUATION_MISSING_DATA_ACTIVE",
      "aggregations": [{ "alignmentPeriod": "86400s", "perSeriesAligner": "ALIGN_SUM", "crossSeriesReducer": "REDUCE_SUM" }]
    }
  }],
  "notificationChannels": ["$CHANNEL"]
}
JSON
create_policy "Connections: key check heartbeat missing" "$WORK/heartbeat.json" || {
  echo "✗ Google refused the daily heartbeat condition. Option (b) under Runway's \"Alert B\" in functions/README.md is the next to try." >&2
  exit 1
}

cat > "$WORK/audit.json" <<JSON
{
  "displayName": "Connections: master keyring changed",
  "combiner": "OR",
  "conditions": [{
    "displayName": "Destroy, disable or delete on CONNECTIONS_MASTER_KEYS",
    "conditionMatchedLog": {
      "filter": "protoPayload.serviceName=\"secretmanager.googleapis.com\" AND protoPayload.methodName=(\"google.cloud.secretmanager.v1.SecretManagerService.DestroySecretVersion\" OR \"google.cloud.secretmanager.v1.SecretManagerService.DisableSecretVersion\" OR \"google.cloud.secretmanager.v1.SecretManagerService.DeleteSecret\") AND protoPayload.resourceName:\"/secrets/CONNECTIONS_MASTER_KEYS\""
    }
  }],
  "alertStrategy": { "notificationRateLimit": { "period": "300s" }, "autoClose": "604800s" },
  "notificationChannels": ["$CHANNEL"]
}
JSON
create_policy "Connections: master keyring changed" "$WORK/audit.json"
echo
echo "To see the failure alert reach you, write a test entry (not key material):"
echo "  gcloud logging write connections-alert-test '{\"event\":\"connections.keys.failed\",\"checked\":0,\"failures\":[],\"drill\":true}' --payload-type=json --severity=ERROR --project=$PROJECT"
