#!/bin/bash
# rclone 配置同步功能测试脚本

echo "🧪 rclone 配置同步功能测试"
echo "================================"
echo ""

AGENT_API_KEY="sk_97b1bb38650ffb71d877fc8433aa1949"
CONFIG_SERVER_API_KEY="sk_config_master_key"
AGENT_URL="http://localhost:3333"
CONFIG_SERVER_URL="http://localhost:4000"

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试函数
test_api() {
  local test_name=$1
  local url=$2
  local api_key=$3
  
  echo -n "测试: $test_name ... "
  
  response=$(curl -s -w "\n%{http_code}" "$url" -H "X-API-Key: $api_key")
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n-1)
  
  if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✅ PASS${NC}"
    echo "  HTTP $http_code"
    return 0
  else
    echo -e "${RED}❌ FAIL${NC}"
    echo "  HTTP $http_code"
    echo "  Response: $body"
    return 1
  fi
}

# 测试 1: 配置服务器健康检查
echo "📡 测试配置服务器..."
test_api "配置服务器健康检查" "$CONFIG_SERVER_URL/health" "$CONFIG_SERVER_API_KEY"
echo ""

# 测试 2: 获取配置版本
echo "📋 测试配置版本 API..."
test_api "获取配置版本" "$CONFIG_SERVER_URL/api/config/rclone/version" "$CONFIG_SERVER_API_KEY"
echo ""

# 测试 3: Agent 健康检查
echo "🤖 测试 Agent..."
test_api "Agent 健康检查" "$AGENT_URL/api/health" "$AGENT_API_KEY"
echo ""

# 测试 4: 获取同步状态
echo "🔄 测试同步状态 API..."
test_api "获取同步状态" "$AGENT_URL/api/rclone/sync/status" "$AGENT_API_KEY"
echo ""

# 测试 5: 获取 rclone remotes
echo "📂 测试 rclone 集成..."
test_api "获取 remotes" "$AGENT_URL/api/rclone/remotes" "$AGENT_API_KEY"
echo ""

# 测试 6: 检查配置文件
echo "📄 检查配置文件..."
if [ -f "/home/admin/.config/rclone/rclone.conf" ]; then
  echo -e "${GREEN}✅ 配置文件存在${NC}"
  
  # 检查版本号
  version=$(grep "^# rclone-config-version:" /home/admin/.config/rclone/rclone.conf)
  if [ -n "$version" ]; then
    echo -e "${GREEN}✅ 配置版本: $version${NC}"
  else
    echo -e "${YELLOW}⚠️  配置文件中无版本号${NC}"
  fi
else
  echo -e "${RED}❌ 配置文件不存在${NC}"
fi
echo ""

# 测试 7: 检查备份
echo "💾 检查备份..."
backup_count=$(ls -1 /home/admin/.config/rclone/rclone.conf.backup-* 2>/dev/null | wc -l)
if [ $backup_count -gt 0 ]; then
  echo -e "${GREEN}✅ 找到 $backup_count 个备份${NC}"
  latest_backup=$(ls -t /home/admin/.config/rclone/rclone.conf.backup-* 2>/dev/null | head -1)
  echo "  最新备份: $latest_backup"
else
  echo -e "${YELLOW}⚠️  未找到备份${NC}"
fi
echo ""

# 测试 8: rclone 命令
echo "🔧 测试 rclone 命令..."
if command -v rclone &> /dev/null; then
  echo -e "${GREEN}✅ rclone 已安装${NC}"
  
  # 测试 listremotes
  remotes=$(rclone listremotes --config /home/admin/.config/rclone/rclone.conf 2>&1)
  if [ $? -eq 0 ]; then
    remote_count=$(echo "$remotes" | grep -c ":")
    echo -e "${GREEN}✅ rclone 配置有效 ($remote_count 个 remotes)${NC}"
  else
    echo -e "${RED}❌ rclone 配置无效${NC}"
    echo "  Error: $remotes"
  fi
else
  echo -e "${RED}❌ rclone 未安装${NC}"
fi
echo ""

echo "================================"
echo "✅ 测试完成"
