#!/bin/bash

echo "========================================="
echo "MoiuBot 快速配置向导"
echo "========================================="
echo ""

# 1. 检查 qBittorrent 密码
echo "步骤 1/5: 配置 qBittorrent 密码"
echo "----------------------------------------"
echo "请输入 qBittorrent WebUI 的密码"
echo "提示：如果不知道密码，可以尝试重置或查看配置文件"
read -p "qBittorrent 密码: " QBT_PASSWORD

if [ -z "$QBT_PASSWORD" ]; then
    echo "使用默认密码: adminadmin"
    QBT_PASSWORD="adminadmin"
fi

# 2. 生成 API Key
echo ""
echo "步骤 2/5: 生成 Agent API Key"
echo "----------------------------------------"
API_KEY="sk_$(openssl rand -hex 16)"
echo "生成的 API Key: $API_KEY"
read -p "按 Enter 接受，或输入自定义 Key: " CUSTOM_KEY
if [ -n "$CUSTOM_KEY" ]; then
    API_KEY="$CUSTOM_KEY"
fi

# 3. Telegram Bot Token
echo ""
echo "步骤 3/5: 配置 Telegram Bot"
echo "----------------------------------------"
echo "请从 @BotFather 获取你的 Bot Token"
echo "格式类似: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
read -p "Telegram Bot Token: " BOT_TOKEN

if [ -z "$BOT_TOKEN" ]; then
    echo "⚠️  警告: 未设置 Bot Token，需要手动配置 .env.bot"
fi

# 4. 更新配置文件
echo ""
echo "步骤 4/5: 更新配置文件"
echo "----------------------------------------"

# 更新 Agent 配置
cat > /home/admin/github/moiubot/.env << EOF
# Agent Configuration
PORT=3000
API_KEY=$API_KEY

# qBittorrent Configuration
QBT_URL=http://localhost:18080
QBT_USERNAME=admin
QBT_PASSWORD=$QBT_PASSWORD

# Rclone Configuration
RCLONE_PATH=/usr/bin/rclone
RCLONE_CONFIG=/home/admin/.config/rclone/rclone.conf

# Download Monitor
MONITOR_INTERVAL=30000
MOVE_TIMEOUT=3600000

# Logging
LOG_LEVEL=info
EOF

echo "✅ Agent 配置已更新: .env"

# 更新 Bot 配置
if [ -n "$BOT_TOKEN" ]; then
    cat > /home/admin/github/moiubot/.env.bot << EOF
# Bot Configuration
TELEGRAM_BOT_TOKEN=$BOT_TOKEN
DATABASE_PATH=/home/admin/github/moiubot/database/qbt-bot.db
LOG_LEVEL=info

# Allowed Users (comma-separated Telegram IDs)
ALLOWED_USERS=6830441855

# API Endpoint for Agent (example)
# This will be managed via database, not env
EOF
    echo "✅ Bot 配置已更新: .env.bot"
else
    echo "⚠️  跳过 Bot 配置更新（未提供 Token）"
fi

# 5. 初始化数据库
echo ""
echo "步骤 5/5: 初始化数据库"
echo "----------------------------------------"
cd /home/admin/github/moiubot
npm run init-db 2>&1 | grep -E "(Error|✅|数据库|Database)" || echo "数据库初始化完成"

# 6. 保存配置信息
echo ""
echo "========================================="
echo "配置完成！"
echo "========================================="
echo ""
echo "配置信息（请妥善保存）:"
echo "----------------------------------------"
echo "API Key: $API_KEY"
echo "qBittorrent 密码: $QBT_PASSWORD"
echo ""
echo "下一步操作:"
echo "----------------------------------------"
echo "1. 启动 Agent:"
echo "   cd /home/admin/github/moiubot"
echo "   npm run start:agent"
echo ""
echo "2. 启动 Bot (新终端):"
echo "   cd /home/admin/github/moiubot"
echo "   npm start"
echo ""
echo "3. 或使用 PM2 (生产环境):"
echo "   pm2 start agent/index.js --name moiubot-agent"
echo "   pm2 start bot/index.js --name moiubot"
echo "   pm2 save"
echo ""
echo "4. 测试 Agent API:"
echo "   curl http://localhost:3000/api/health \\"
echo "     -H \"X-API-Key: $API_KEY\""
echo ""
echo "========================================="
