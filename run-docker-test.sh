#!/bin/bash
cd /home/admin/github/moiubot

echo "🚀 开始构建 MoiuBot 测试镜像..."
docker compose -f docker-compose.test.yml build

echo "🧪 正在启动隔离测试环境..."
docker compose -f docker-compose.test.yml up -d

echo "⏳ 等待容器启动 (10s)..."
sleep 10

echo "📊 检查容器状态："
docker compose -f docker-compose.test.yml ps

echo "📝 正在获取 Bot 日志 (最后 20 行)："
docker compose -f docker-compose.test.yml logs bot-test --tail 20

echo "📝 正在获取 Agent 日志 (最后 20 行)："
docker compose -f docker-compose.test.yml logs agent-test --tail 20

echo "🧹 测试完成，正在清理环境..."
docker compose -f docker-compose.test.yml down

echo "✅ 所有测试步骤已完成。"
