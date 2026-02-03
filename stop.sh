#!/bin/bash
# MoiuBot 停止脚本

echo "🛑 停止 MoiuBot..."

# 停止配置服务器
if pgrep -f "node config-server/index.js" > /dev/null; then
  echo "⏹️  停止配置服务器..."
  pkill -f "node config-server/index.js"
  echo "✅ 配置服务器已停止"
fi

# 停止 Agent
if pgrep -f "node agent/index.js" > /dev/null; then
  echo "⏹️  停止 Agent..."
  pkill -f "node agent/index.js"
  echo "✅ Agent 已停止"
fi

# 停止 Bot
if pgrep -f "node bot/index.js" > /dev/null; then
  echo "⏹️  停止 Bot..."
  pkill -f "node bot/index.js"
  echo "✅ Bot 已停止"
fi

sleep 1

echo ""
echo "✅ 所有服务已停止"
