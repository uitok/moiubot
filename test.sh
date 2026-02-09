#!/bin/bash

# MoiuBot 测试脚本

echo "🧪 MoiuBot 测试脚本"
echo "===================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试函数
FAILURES=0
test_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ $2${NC}"
        return 0
    else
        echo -e "${RED}✗ $2${NC}"
        FAILURES=$((FAILURES+1))
        return 1
    fi
}

# 检查 Node.js 是否安装
echo "1. 检查环境..."
node --version > /dev/null 2>&1
test_result $? "Node.js 已安装"

# 检查依赖是否安装
echo ""
echo "2. 检查依赖..."
if [ -f "package.json" ]; then
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}⚠ 依赖未安装，正在安装...${NC}"
        npm install
        test_result $? "依赖安装成功"
    else
        test_result 0 "依赖已安装"
    fi
else
    test_result 1 "package.json 不存在"
fi

# 检查数据库
echo ""
echo "3. 检查数据库..."
if [ -f "database/qbt-bot.db" ]; then
    test_result 0 "数据库文件存在"
else
    echo -e "${YELLOW}⚠ 数据库不存在，正在初始化...${NC}"
    npm run init-db
    test_result $? "数据库初始化成功"
fi

# 检查环境变量文件
echo ""
echo "4. 检查配置..."
if [ -f ".env.bot" ]; then
    test_result 0 "Bot 配置文件存在"
else
    test_result 1 ".env.bot 不存在，请从 .env.bot.example 复制并配置"
fi

if [ -f ".env.agent" ]; then
    test_result 0 "Agent 配置文件存在"
else
    test_result 1 ".env.agent 不存在，请从 .env.agent.example 复制并配置"
fi

# 语法检查
echo ""
echo "5. 语法检查..."

# 检查 Bot 文件
if [ -f "bot/index.js" ]; then
    node -c bot/index.js
    test_result $? "bot/index.js 语法正确"
fi

# 检查 Agent 文件
if [ -f "agent/index.js" ]; then
    node -c agent/index.js
    test_result $? "agent/index.js 语法正确"
fi

# 检查 config-server 文件
if [ -f "config-server/index.js" ]; then
    node -c config-server/index.js
    test_result $? "config-server/index.js 语法正确"
fi

# 模块加载检查（避免仅做语法检查遗漏 require/exports 问题）
echo ""
echo "6. 模块加载检查..."
node -e "require('./bot/config/constants'); require('./bot/handlers/add'); require('./bot/services/agent-client'); require('./shared/utils'); require('./agent/services/qb-client'); require('./config-server/middleware/auth');" >/dev/null 2>&1
test_result $? "核心模块可正常加载"

# 功能测试
echo ""
echo "7. 功能测试..."
echo "提示：以下测试需要实际的 qBittorrent 和 rclone 配置"
echo ""

# 测试数据库连接
if [ -f "database/qbt-bot.db" ]; then
    node -e "
    const Database = require('better-sqlite3');
    const db = new Database('database/qbt-bot.db');
    const result = db.prepare('SELECT COUNT(*) as count FROM users').get();
    console.log('数据库连接正常，用户数:', result.count);
    db.close();
    " 2>/dev/null
test_result $? "数据库连接测试通过"
fi

# 单元测试
echo ""
echo "8. 单元测试..."
node --test test/*.test.js
test_result $? "node:test 测试通过"

echo ""
echo "===================="
if [ $FAILURES -ne 0 ]; then
    echo -e "${RED}测试失败：$FAILURES 项检查未通过${NC}"
    exit 1
fi

echo -e "${GREEN}测试完成：全部通过${NC}"
echo ""
echo "下一步："
echo "1. 配置 .env.bot 和 .env.agent"
echo "2. 运行 Bot: npm start"
echo "3. 在 Telegram 中测试 Bot 命令"
