# Sourced by the owner-run scripts that save a Functions secret. Stops a repeat run from asking for a key that is already saved; `secrets:get` prints only a version table, never the value.
exit_if_secret_saved() {
  local name="$1" project="$2" answer=""
  firebase functions:secrets:get "$name" --project "$project" >/dev/null 2>&1 || return 0
  echo "✓ $name is already saved in Firebase, so there is nothing to do."
  [[ -t 0 ]] || exit 0
  printf 'Save a new key anyway (this adds a version and keeps the old one)? [y/N] '
  read -r answer || true
  [[ "$answer" =~ ^[Yy] ]] || exit 0
}
