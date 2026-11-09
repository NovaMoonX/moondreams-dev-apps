#!/usr/bin/env bash
# Creates the three alert policies that watch Helm's master keyring (a failed check, a missing heartbeat, a changed secret).
#   npm run helm:alerts -- you@example.com
# Run it after the merge that deploys verifyHelmKeys. It is safe to run again: what already exists is left alone.
set -euo pipefail

PROJECT=moondreams-dev-apps
EMAIL="${1:-}"
[[ "$EMAIL" == *@* ]] || { echo "✗ Give the email that should get the alerts: npm run helm:alerts -- you@example.com" >&2; exit 1; }
command -v gcloud >/dev/null 2>&1 || { echo "✗ gcloud isn't installed. Install it from https://cloud.google.com/sdk/docs/install and run: gcloud auth login" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

CHANNEL="$(gcloud beta monitoring channels list --project="$PROJECT" --filter="displayName=\"Helm owner email\"" --format='value(name)' | head -n1)"
if [[ -z "$CHANNEL" ]]; then
  CHANNEL="$(gcloud beta monitoring channels create --project="$PROJECT" --display-name="Helm owner email" --type=email \
    --channel-labels=email_address="$EMAIL" --format='value(name)')"
  echo "✓ Created the email channel. Google may send a message asking you to verify it."
fi

policy_exists() {
  [[ -n "$(gcloud alpha monitoring policies list --project="$PROJECT" --filter="displayName=\"$1\"" --format='value(name)')" ]]
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
  "displayName": "Helm: key check failed",
  "combiner": "OR",
  "conditions": [{
    "displayName": "helm.keys.failed logged",
    "conditionMatchedLog": { "filter": "jsonPayload.event=\"helm.keys.failed\"" }
  }],
  "alertStrategy": { "notificationRateLimit": { "period": "300s" }, "autoClose": "604800s" },
  "notificationChannels": ["$CHANNEL"]
}
JSON
create_policy "Helm: key check failed" "$WORK/failed.json"

if ! gcloud logging metrics describe helm_keys_ok --project="$PROJECT" >/dev/null 2>&1; then
  gcloud logging metrics create helm_keys_ok --project="$PROJECT" \
    --description="Daily Helm key check passed" --log-filter='jsonPayload.event="helm.keys.ok"' >/dev/null
  echo "✓ Created the helm_keys_ok metric."
fi
# An absence condition only watches a series that exists, so the check runs once now to start it.
JOB="$(gcloud scheduler jobs list --location=us-central1 --project="$PROJECT" --format='value(name)' | grep verifyHelmKeys | head -n1 || true)"
if [[ -n "$JOB" ]]; then
  gcloud scheduler jobs run "$JOB" --location=us-central1 --project="$PROJECT" >/dev/null && echo "✓ Ran the key check once."
else
  echo "✗ The verifyHelmKeys job isn't deployed yet. Run this again after the merge has deployed." >&2
  exit 1
fi

cat > "$WORK/heartbeat.json" <<JSON
{
  "displayName": "Helm: key check heartbeat missing",
  "combiner": "OR",
  "conditions": [{
    "displayName": "No helm.keys.ok for 26 hours",
    "conditionAbsent": {
      "filter": "metric.type=\"logging.googleapis.com/user/helm_keys_ok\"",
      "duration": "93600s",
      "aggregations": [{ "alignmentPeriod": "3600s", "perSeriesAligner": "ALIGN_SUM", "crossSeriesReducer": "REDUCE_SUM" }]
    }
  }],
  "notificationChannels": ["$CHANNEL"]
}
JSON
create_policy "Helm: key check heartbeat missing" "$WORK/heartbeat.json" || {
  echo "✗ Google refused the 26-hour heartbeat. Choose one of the options under Runway's \"Alert B\" in functions/README.md." >&2
  exit 1
}

cat > "$WORK/audit.json" <<JSON
{
  "displayName": "Helm: master keyring changed",
  "combiner": "OR",
  "conditions": [{
    "displayName": "Destroy, disable or delete on HELM_MASTER_KEYS",
    "conditionMatchedLog": {
      "filter": "protoPayload.serviceName=\"secretmanager.googleapis.com\" AND protoPayload.methodName=(\"google.cloud.secretmanager.v1.SecretManagerService.DestroySecretVersion\" OR \"google.cloud.secretmanager.v1.SecretManagerService.DisableSecretVersion\" OR \"google.cloud.secretmanager.v1.SecretManagerService.DeleteSecret\") AND protoPayload.resourceName:\"/secrets/HELM_MASTER_KEYS\""
    }
  }],
  "alertStrategy": { "notificationRateLimit": { "period": "300s" }, "autoClose": "604800s" },
  "notificationChannels": ["$CHANNEL"]
}
JSON
create_policy "Helm: master keyring changed" "$WORK/audit.json"

echo
echo "To see the failure alert reach you, write a test entry (not key material):"
echo "  gcloud logging write helm-alert-test '{\"event\":\"helm.keys.failed\",\"checked\":0,\"failures\":[],\"drill\":true}' --payload-type=json --severity=ERROR --project=$PROJECT"
