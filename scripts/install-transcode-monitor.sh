#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_SRC="$ROOT/infra/launchd/com.shareus.transcode-monitor.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.shareus.transcode-monitor.plist"
SHAREUS_DIR="$HOME/.shareus"
PYTHON="${PYTHON:-python3}"
ENV_SRC="$ROOT/.env.local"
ENV_DST="$SHAREUS_DIR/monitor.env"

mkdir -p "$SHAREUS_DIR"
cp "$ROOT/scripts/monitor-transcode.py" "$SHAREUS_DIR/monitor-transcode.py"
chmod +x "$SHAREUS_DIR/monitor-transcode.py"

if [[ -f "$ENV_SRC" ]]; then
  grep -E '^(ADMIN_PASSWORD|API_BASE_URL|WEB_BASE_URL)=' "$ENV_SRC" > "$ENV_DST" || true
fi
if [[ ! -s "$ENV_DST" ]]; then
  echo "Warning: $ENV_DST is empty. Add ADMIN_PASSWORD before the monitor can run." >&2
fi

sed "s|__HOME__|$HOME|g" "$PLIST_SRC" > "$PLIST_DST"

"$PYTHON" "$SHAREUS_DIR/monitor-transcode.py" --seed

launchctl bootout "gui/$(id -u)/com.shareus.transcode-monitor" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl enable "gui/$(id -u)/com.shareus.transcode-monitor"
launchctl kickstart -k "gui/$(id -u)/com.shareus.transcode-monitor"

echo "Installed transcode monitor."
echo "Plist: $PLIST_DST"
echo "Script: $SHAREUS_DIR/monitor-transcode.py"
echo "Env:    $ENV_DST"
echo "Logs:   $SHAREUS_DIR/transcode-monitor.log"
echo "State:  $SHAREUS_DIR/transcode-monitor-state.json"
