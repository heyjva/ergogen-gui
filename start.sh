#!/usr/bin/env bash
#
# start.sh — launches the Ergogen preview app for the ergogen-keyboard project.
#
# It starts two local processes:
#   1. The save-helper server (scripts/save-server.mjs) on port 3001, which
#      lets the in-browser "Save to File" button write the real config.yaml.
#      This is required because Firefox / Zen cannot write local files directly.
#   2. The Vite dev server (pnpm run dev) on port 3000, which serves the GUI.
#
# Then open http://localhost:3000 in Firefox / Zen. Use the "Save to File"
# button (or Ctrl/Cmd+S) in the config editor to write changes back to
# ../ergogen-keyboard/config.yaml.
#
# Environment overrides:
#   CONFIG_PATH        path to the config.yaml to manage
#                      (default: ../ergogen-keyboard/config.yaml)
#   SAVE_HELPER_PORT   save-helper port (default 3001)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

CONFIG_PATH="${CONFIG_PATH:-$(cd "$SCRIPT_DIR/../ergogen-keyboard" && pwd)/config.yaml}"
export CONFIG_PATH
export SAVE_HELPER_PORT="${SAVE_HELPER_PORT:-3001}"

echo "==> ergogen-keyboard preview app"
echo "    config file : $CONFIG_PATH"
echo "    save helper : http://localhost:${SAVE_HELPER_PORT}"
echo "    GUI         : http://localhost:3000"
echo ""

# Start the save-helper in the background and ensure it's cleaned up on exit.
node scripts/save-server.mjs &
HELPER_PID=$!

cleanup() {
  echo ""
  echo "==> shutting down save-helper (pid $HELPER_PID)"
  kill "$HELPER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Start the Vite dev server in the foreground.
pnpm run dev
