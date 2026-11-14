# Sourced by scripts that call `gcloud alpha` or `gcloud beta`. A gcloud without those components stops to ask "install it now?" on stderr, which a script that hides stderr turns into a silent hang, so this stops first and says what to run.
require_gcloud_tracks() {
  local track state missing=()
  for track in "$@"; do
    state="$(gcloud components list --filter="id=$track" --format='value(state.name)' </dev/null 2>/dev/null || true)"
    [[ "$state" == "Not Installed" ]] && missing+=("$track")
  done
  (( ${#missing[@]} == 0 )) && return 0
  echo "✗ gcloud is missing: ${missing[*]}. Run: gcloud components install ${missing[*]} --quiet, then run this again." >&2
  exit 1
}
