# Sourced by the owner-run scripts that call the firebase CLI. `firebase login:list` still shows an account after its token has expired, so this makes one real call and offers a fresh sign-in when that fails.
require_firebase_login() {
  [[ "${FIREBASE_LOGIN_CHECKED:-}" == "1" ]] && return 0
  if ! firebase projects:list --json >/dev/null 2>&1; then
    [[ -t 0 ]] || { echo "✗ The firebase CLI's sign-in has expired. Run: firebase login --reauth" >&2; exit 1; }
    echo "The firebase CLI's sign-in is missing or has expired, so it needs a fresh one."
    firebase login --reauth
    firebase projects:list --json >/dev/null 2>&1 || { echo "✗ The firebase CLI still can't reach your projects. Run: firebase login --reauth" >&2; exit 1; }
  fi
  export FIREBASE_LOGIN_CHECKED=1
}
