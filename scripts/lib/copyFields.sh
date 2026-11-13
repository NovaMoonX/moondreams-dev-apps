# Sourced by the owner-run scripts that send the owner to a console form. Shows each field's exact text, puts it on the clipboard when the machine has a tool for that, and waits so the next one can replace it.
copy_to_clipboard() {
  if command -v pbcopy >/dev/null 2>&1; then printf %s "$1" | pbcopy
  elif command -v wl-copy >/dev/null 2>&1; then printf %s "$1" | wl-copy
  elif command -v xclip >/dev/null 2>&1; then printf %s "$1" | xclip -selection clipboard
  elif command -v clip.exe >/dev/null 2>&1; then printf %s "$1" | clip.exe
  else return 1; fi
}

# copy_each "Label" "text" ["Label" "text" ...]
copy_each() {
  local label text copied
  while (( $# >= 2 )); do
    label="$1"; text="$2"; shift 2
    printf '     %s:\n' "$label"
    printf '%s\n' "$text" | sed 's/^/         /'
    if [[ -t 0 ]] && copy_to_clipboard "$text"; then copied=1; else copied=0; fi
    if [[ -t 0 ]]; then
      if (( copied )); then printf '     (copied) Paste it, then press Enter%s: ' "$( (( $# >= 2 )) && echo ' for the next one')"
      else printf '     Press Enter when it is in%s: ' "$( (( $# >= 2 )) && echo ', for the next one')"; fi
      read -r _ || true
    fi
  done
}
