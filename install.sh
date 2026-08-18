#!/usr/bin/env bash
# schoolbridge one-line installer — installs the CLI, optionally connects
# Canvas and installs the agent skill, all in one shot.
#
#   curl -fsSL https://raw.githubusercontent.com/Shoberman2/schoolbridge/main/install.sh | bash
#
# With options (quote your token):
#   curl -fsSL .../install.sh | bash -s -- \
#     --base-url https://yourschool.instructure.com --token "<canvas-token>" --skill hermes
#
#   --base-url URL   Canvas base URL (with --token, runs `schoolbridge init`)
#   --token TOKEN    Canvas access token (Account → Settings → + New Access Token)
#   --feed-url URL   Zero-token alternative: Canvas calendar feed (.ics URL)
#   --skill NAME     Install the agent skill: hermes | openclaw | agents
set -euo pipefail

BASE_URL="" TOKEN="" FEED_URL="" SKILL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --base-url) BASE_URL="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --feed-url) FEED_URL="$2"; shift 2 ;;
    --skill) SKILL="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# Find node >= 20, preferring PATH but falling back to Hermes's managed node.
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ] && [ -x "$HOME/.hermes/node/bin/node" ]; then
  export PATH="$HOME/.hermes/node/bin:$PATH"
  NODE_BIN="$(command -v node)"
fi
if [ -z "$NODE_BIN" ]; then
  echo "Error: node not found. Install Node.js 20+ first (https://nodejs.org)." >&2
  exit 1
fi
NODE_MAJOR="$("$NODE_BIN" -e 'console.log(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Error: Node.js >= 20 required (found $("$NODE_BIN" -v))." >&2
  exit 1
fi

echo "Installing schoolbridge…"
# Prefer the npm registry; fall back to GitHub if the package isn't published yet.
npm install -g schoolbridge 2>/dev/null || npm install -g git+https://github.com/Shoberman2/schoolbridge.git

if [ -n "$BASE_URL" ] && [ -n "$TOKEN" ]; then
  schoolbridge init --base-url "$BASE_URL" --token "$TOKEN"
elif [ -n "$FEED_URL" ]; then
  schoolbridge init --provider ics --feed-url "$FEED_URL"
elif [ -n "$BASE_URL$TOKEN" ]; then
  echo "Note: --base-url and --token must be given together; skipping Canvas setup." >&2
fi

if [ -n "$SKILL" ]; then
  schoolbridge install-skill "$SKILL"
fi

echo
echo "schoolbridge $(schoolbridge --version) installed."
if [ -z "$TOKEN" ]; then
  echo "Connect Canvas next:  schoolbridge init --base-url https://yourschool.instructure.com --token <token>"
fi
echo "Try it now:           schoolbridge upcoming --provider mock"
