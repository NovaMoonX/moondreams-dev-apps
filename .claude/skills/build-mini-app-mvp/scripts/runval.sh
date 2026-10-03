#!/bin/bash
# usage: runval.sh "<command>" [workdir]
# Builds functions/lib, starts the emulators (proxy env unset so they can bind), resets the seed,
# runs <command> from [workdir] (default: current dir), then stops them.
set -o pipefail
WORKDIR="${2:-$PWD}"
REPO="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$REPO" || exit 1
npm --prefix functions run build >/dev/null || { echo "functions build failed"; exit 1; }
env -u HTTPS_PROXY -u https_proxy -u JAVA_TOOL_OPTIONS -u GLOBAL_AGENT_HTTPS_PROXY -u npm_config_https_proxy -u YARN_HTTPS_PROXY \
  npx firebase emulators:exec --only auth,firestore,database,functions,storage --project moondreams-dev-apps \
  "npm run seed:reset >/dev/null 2>&1 && cd '$WORKDIR' && $1" 2>&1 \
  | grep -v "ERR_TUNNEL\|ERR_CERT\|Failed to load app catalog\|false for 'list'\|^i  \|^⚠\|^✔\|MetadataLookup\|EAFNOSUPPORT\|^\s*at \|^$"
