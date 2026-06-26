#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export PATH="/opt/homebrew/bin:$PATH"
export GOOGLE_APPLICATION_CREDENTIALS="$SCRIPT_DIR/google_credentials.json"

exec /opt/homebrew/bin/npx -y @botrun/mcp-google-drive
