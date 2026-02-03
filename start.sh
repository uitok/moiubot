#!/bin/bash
# MoiuBot 启动脚本

PROJECT_DIR="/home/admin/github/moiubot"
cd "$PROJECT_DIR" || exit 1

echo "🚀 启动 MoiuBot..."

# 检查是否是主服务器（通过检查配置文件是否存在）
IS_MASTER_SERVER="false"
if [ -f ".env.config-server" ]; then
  IS_MASTER_SERVER="true"
fi

# 启动配置服务器（仅主服务器）
if [ "$IS_MASTER_SERVER" = "true" ]; then
  if pgrep -f "node config-server/index.js" > /dev/null; then
    echo "⚠️ 配置服务器已在运行"
  else
    echo "📡 启动配置服务器..."
    nohup node config-server/index.js > /tmp/moiubot-config-server.log 2>&1 &
    echo "✅ 配置服务器已启动 (PID: $!)"
  fi
fi

# 检查是否已运行
if pgrep -f "node agent/index.js" > /dev/null; then
  echo "⚠️ Agent 已在运行"
else
  echo "📡 启动 Agent..."
  nohup node agent/index.js > /tmp/moiubot-agent.log 2>&1 &
  echo "✅ Agent 已启动 (PID: $!)"
fi

if pgrep -f "node bot/index.js" > /dev/null; then
  echo "⚠️ Bot 已在运行"
else
  echo "🤖 启动 Bot..."
  nohup node bot/index.js > /tmp/moiubot-bot.log 2>&1 &
  echo "✅ Bot 已启动 (PID: $!)"
fi

sleep 2

echo ""
echo "📊 服务状态:"
ps aux | grep -E "node (bot|agent|config-server)/index" | grep -v grep | awk '{print "  PID:", $2, "- MEM:", $6/1024"MB", "-", $11, $12, $13, $14}'

echo ""
echo "📝 日志位置:"
echo "  配置服务器: tail -f /tmp/moiubot-config-server.log"
echo "  Agent:      tail -f /tmp/moiubot-agent.log"
echo "  Bot:        tail -f /tmp/moiubot-bot.log"
