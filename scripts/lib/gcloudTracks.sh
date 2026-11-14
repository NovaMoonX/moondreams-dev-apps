# Sourced by scripts that call `gcloud alpha` or `gcloud beta`. A gcloud without those components stops to ask "install it now?" on stderr, which a script that hides stderr turns into a silent hang, so this stops first and says what to run.
require_gcloud_tracks() {
  local track state
  for track in "$@"; do
    state="$(gcloud components list --filter="id=$track" --format='value(state.name)' </dev/null 2>/dev/null || true)"
    [[ "$state" == "Not Installed" ]] || continue
    echo "✗ gcloud's $track component isn't installed. Run: gcloud components install $track --quiet" >&2
    exit 1
  done
}
