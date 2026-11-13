#!/bin/bash
# usage: check-screenshots.sh <file-with-pr-body-or-status-comment> [...]
# Loads every image the Markdown links to (![..](url) and <img src="url">) and fails
# naming each one that does not come back as an image, after three tries.
set -uo pipefail
[ $# -gt 0 ] || { echo "usage: check-screenshots.sh <body.md> [...]" >&2; exit 2; }
urls="$(cat "$@" | grep -oE '!\[[^]]*\]\([^)[:space:]]+\)|<img[^>]+src="[^"]+"' \
  | sed -E 's/^!\[[^]]*\]\(([^)]+)\)$/\1/; s/^<img[^>]+src="([^"]+)".*/\1/' | sort -u)"
[ -n "$urls" ] || { echo "no images found"; exit 0; }
total=0; bad=0
while read -r url; do
  total=$((total + 1))
  ok=""
  for attempt in 1 2 3; do
    type="$(curl -sSL -o /dev/null -w '%{http_code} %{content_type}' --max-time 30 "$url" 2>/dev/null)"
    case "$type" in 200\ image/*) ok=1; break ;; esac
    sleep "$attempt"
  done
  [ -n "$ok" ] || { bad=$((bad + 1)); echo "NOT LOADING ($type): $url"; }
  case "$url" in https://github.com/*) echo "REDIRECTED LINK (use raw.githubusercontent.com): $url"; bad=$((bad + 1)) ;; esac
done <<< "$urls"
echo "$((total - bad < 0 ? 0 : total - bad))/$total images load directly"
[ "$bad" -eq 0 ]
