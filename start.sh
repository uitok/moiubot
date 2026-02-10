#!/bin/bash
# MoiuBot 启动脚本
#
# IMPORTANT (systemd):
# The old implementation backgrounded processes and exited immediately, causing systemd (Type=simple)
# to treat the service as finished and SIGTERM the child processes on every restart cycle.
# This script now stays in the foreground, forwards SIGTERM/SIGINT to child processes, and exits only
# when one of the components exits (then it stops the others).

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR" || exit 1

NODE_BIN="${NODE_BIN:-/usr/bin/node}"

echo "🚀 启动 MoiuBot..."

# Keep child PIDs so we can terminate them on shutdown.
PIDS=()

start_proc() {
  local name="$1"
  shift
  echo "▶ 启动 ${name}..."
  "$@" &
  local pid="$!"
  PIDS+=("${pid}")
  echo "✅ ${name} 已启动 (PID: ${pid})"
}

stop_all() {
  # Stop in reverse order (bot -> agent -> config) to reduce noisy webhook errors.
  for (( i=${#PIDS[@]}-1; i>=0; i-- )); do
    local pid="${PIDS[$i]}"
    if kill -0 "${pid}" 2>/dev/null; then
      kill -TERM "${pid}" 2>/dev/null || true
    fi
  done

  # Reap children.
  wait || true
}

on_signal() {
  echo "🛑 收到退出信号，正在停止所有组件..."
  stop_all
}

trap on_signal SIGTERM SIGINT

# 检查是否是主服务器（通过检查配置文件是否存在）
IS_MASTER_SERVER="false"
if [ -f ".env.config-server" ]; then
  IS_MASTER_SERVER="true"
fi

# 启动配置服务器（仅主服务器）
if [ "$IS_MASTER_SERVER" = "true" ]; then
  start_proc "配置服务器" "${NODE_BIN}" config-server/index.js >> /tmp/moiubot-config-server.log 2>&1
fi

start_proc "Agent" "${NODE_BIN}" agent/index.js >> /tmp/moiubot-agent.log 2>&1
start_proc "Bot" "${NODE_BIN}" bot/index.js >> /tmp/moiubot-bot.log 2>&1

sleep 1

echo ""
echo "📊 服务状态:"
for pid in "${PIDS[@]}"; do
  ps -p "${pid}" -o pid=,rss=,args= | awk '{print "  PID:", $1, "- MEM:", $2/1024"MB", "-", $3, $4, $5}'
done

echo ""
echo "📝 日志位置:"
echo "  配置服务器: tail -f /tmp/moiubot-config-server.log"
echo "  Agent:      tail -f /tmp/moiubot-agent.log"
echo "  Bot:        tail -f /tmp/moiubot-bot.log"

# Wait for any component to exit. If one exits, stop the rest.
wait -n "${PIDS[@]}" || true
echo "⚠️  检测到组件退出，正在停止其他组件..."
stop_all
