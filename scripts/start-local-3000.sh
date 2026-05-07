#!/bin/zsh
set -euo pipefail

PROJECT_DIR="/Users/arimacm5/Documents/Proyectos Antigravity/am-clinica-main"
PORT="3000"
LOG_DIR="$HOME/Library/Logs"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$LOG_DIR"
cd "$PROJECT_DIR"

existing_pid="$(lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null | head -1 || true)"

if [[ -n "$existing_pid" ]]; then
    existing_cwd="$(lsof -a -p "$existing_pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1 || true)"
    if [[ "$existing_cwd" == "$PROJECT_DIR" ]]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') am-clinica already running on port ${PORT} as pid ${existing_pid}"
        while kill -0 "$existing_pid" 2>/dev/null; do
            sleep 60
        done
        echo "$(date '+%Y-%m-%d %H:%M:%S') existing am-clinica process ended; launchd will restart it"
        exit 1
    fi

    echo "$(date '+%Y-%m-%d %H:%M:%S') port ${PORT} is occupied by pid ${existing_pid} (${existing_cwd}); not starting am-clinica"
    exit 1
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') starting am-clinica on port ${PORT}"
exec npm run dev
