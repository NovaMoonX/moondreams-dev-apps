# Sourced by the owner-run setup scripts so a re-run never walks the owner through what is already set up.
# Set SETUP_STATE_DIR first: it lives outside the repo and holds only confirmations and the items a step covered, never a value.
ask_yes() { local answer=""; printf '%s [y/N] ' "$1"; read -r answer || true; [[ "$answer" =~ ^[Yy] ]]; }
# Whether a list's items were ever recorded, so a first run can ask "already done?" instead of walking every item.
has_record() { [[ -f "$SETUP_STATE_DIR/$1" ]]; }
# The items of a list not yet recorded under that name, one per line.
missing_from() {
  local file="$SETUP_STATE_DIR/$1" item
  shift
  for item in "$@"; do grep -qxF -- "$item" "$file" 2>/dev/null || echo "$item"; done
}
record() {
  local file="$SETUP_STATE_DIR/$1"
  shift
  mkdir -p "$SETUP_STATE_DIR"
  touch "$file"
  printf '%s\n' "$@" | sort -u - "$file" >"$file.tmp"
  mv "$file.tmp" "$file"
}
