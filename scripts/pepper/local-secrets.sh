#!/usr/bin/env bash
# Copies the production Claude and Deepgram keys into functions/.secret.local so the emulator runs Pepper for real. Never prints a key.
set -euo pipefail
FILE="$(cd "$(dirname "$0")/../.." && pwd)/functions/.secret.local"
touch "$FILE"
for NAME in ANTHROPIC_API_KEY DEEPGRAM_API_KEY; do
  if grep -q "^${NAME}=" "$FILE"; then
    echo "✓ ${NAME} already in functions/.secret.local, skipped"
    continue
  fi
  if ! VALUE="$(firebase functions:secrets:access "$NAME" 2>/tmp/pepper-secret-err)"; then
    echo "✗ Couldn't read ${NAME} from Firebase:"; cat /tmp/pepper-secret-err; rm -f /tmp/pepper-secret-err
    echo "Run 'firebase login' if you're signed out, then run this again."; exit 1
  fi
  rm -f /tmp/pepper-secret-err
  if [ -z "$VALUE" ]; then echo "✗ ${NAME} came back empty"; exit 1; fi
  printf '%s=%s\n' "$NAME" "$VALUE" >> "$FILE"
  echo "✓ ${NAME} added to functions/.secret.local"
done
echo "Done. The emulator now uses the real keys for Pepper's answers and Flux listening."
