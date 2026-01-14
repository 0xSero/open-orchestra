#!/bin/bash
# Start Orchestra dev servers with hot reloading

cd "$(dirname "$0")/.."

# Create logs directory if it doesn't exist
mkdir -p logs

# Kill any existing dev servers
pkill -f 'vite.*packages/app' 2>/dev/null || true
pkill -f 'vite.*packages/apps/tauri' 2>/dev/null || true

echo "Starting Orchestra dev servers..."

# Core app (port 3005)
nohup bun run --cwd packages/app dev > logs/app.log 2>&1 &
APP_PID=$!
echo "Core app starting on http://localhost:3005 (PID: $APP_PID)"

# Wait a moment for first server to initialize
sleep 2

# Desktop/Tauri frontend (port 1420)
# Set RUST_TARGET for Tauri predev script
export RUST_TARGET="aarch64-apple-darwin"
nohup bun run --cwd packages/apps/tauri dev > logs/desktop.log 2>&1 &
DESKTOP_PID=$!
echo "Desktop dev starting on http://localhost:1420 (PID: $DESKTOP_PID)"

echo ""
echo "Logs:"
echo "  - logs/app.log"
echo "  - logs/desktop.log"
echo ""
echo "To stop: pkill -f 'vite.*packages'"
echo "To view logs: tail -f logs/app.log logs/desktop.log"
