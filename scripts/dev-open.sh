#!/bin/sh

set -eu

PORT="${PORT:-3000}"
URL="http://localhost:${PORT}"
LOG_FILE="${LOG_FILE:-/tmp/am-clinica-dev.log}"

echo "Checking port ${PORT}..."

EXISTING_PID="$(lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "${EXISTING_PID}" ]; then
  echo "Stopping existing process on port ${PORT}: ${EXISTING_PID}"
  kill ${EXISTING_PID} 2>/dev/null || true
  sleep 2
fi

echo "Starting dev server on ${URL}"
npm run dev >"${LOG_FILE}" 2>&1 &

ATTEMPTS=0
MAX_ATTEMPTS=45
until curl -fsS "${URL}" >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "${ATTEMPTS}" -ge "${MAX_ATTEMPTS}" ]; then
    echo "Server did not become ready. Check log: ${LOG_FILE}"
    exit 1
  fi
  sleep 2
done

echo "Server ready at ${URL}"

if command -v open >/dev/null 2>&1; then
  open "${URL}"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "${URL}"
else
  echo "Browser opener not found. Open manually: ${URL}"
fi
