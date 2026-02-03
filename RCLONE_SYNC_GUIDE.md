# rclone 配置同步功能 - 使用指南

## 功能概述

rclone 配置同步功能确保所有 Agent 服务器的 rclone 配置保持一致。主服务器托管配置文件，其他 Agent 在启动时自动同步。

## 架构

```
主服务器 (kvm15072)
├── 配置服务器 (Port 4000)
├── rclone 配置主文件
└── Bot + Agent

Agent 服务器
├── Agent (Port 3333)
├── 启动时自动同步配置
└── 定期检查更新
```

## 快速开始

### 主服务器配置

1. 配置环境变量：
```bash
cd /home/admin/github/moiubot
cp .env.config-server.example .env.config-server
# 编辑 .env.config-server，修改 API_KEY
```

2. 确保 rclone 配置存在：
```bash
# 配置文件应该在 /home/admin/.config/rclone/rclone.conf
rclone config
```

3. 启动服务：
```bash
./start.sh
```

### Agent 服务器配置

1. 配置环境变量 (`.env.agent`)：
```bash
# 启用同步
RCLONE_SYNC_ENABLED=true
RCLONE_SYNC_ON_START=true

# 配置服务器地址
CONFIG_SERVER_URL=http://kvm15072:4000
CONFIG_SERVER_API_KEY=sk_config_master_key
```

2. 启动服务：
```bash
./start.sh
```

## API 使用

### 获取同步状态

```bash
curl http://localhost:3333/api/rclone/sync/status \
  -H "X-API-Key: sk_97b1bb38650ffb71d877fc8433aa1949"
```

响应：
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "localExists": true,
    "localVersion": "v1.0.0-20260202-141000",
    "remoteVersion": "v1.0.0-20260202-141500",
    "needsUpdate": true,
    "configPath": "/home/admin/.config/rclone/rclone.conf",
    "configServer": "http://localhost:4000"
  }
}
```

### 强制同步

```bash
curl -X POST http://localhost:3333/api/rclone/sync/force \
  -H "X-API-Key: sk_97b1bb38650ffb71d877fc8433aa1949"
```

### 配置服务器 API（主服务器）

获取配置：
```bash
curl http://localhost:4000/api/config/rclone \
  -H "X-API-Key: sk_config_master_key"
```

获取版本：
```bash
curl http://localhost:4000/api/config/rclone/version \
  -H "X-API-Key: sk_config_master_key"
```

更新配置：
```bash
curl -X POST http://localhost:4000/api/config/rclone/update \
  -H "X-API-Key: sk_config_master_key" \
  -H "Content-Type: application/json" \
  -d '{"config": "[remotes]\n..."}'
```

## 日志查看

查看 Agent 同步日志：
```bash
tail -f /tmp/moiubot-agent.log | grep rclone-sync
```

查看配置服务器日志：
```bash
tail -f /tmp/moiubot-config-server.log
```

## 故障排除

### Agent 启动时无法同步

1. 检查配置服务器是否运行：
```bash
curl http://kvm15072:4000/health
```

2. 检查网络连接：
```bash
ping kvm15072
```

3. 检查 API Key 是否正确：
```bash
# 确保 .env.agent 中的 CONFIG_SERVER_API_KEY 与主服务器的 .env.config-server 中的 CONFIG_SERVER_API_KEY 一致
```

4. 查看详细日志：
```bash
tail -100 /tmp/moiubot-agent.log
```

### 配置验证失败

1. 检查 rclone 是否安装：
```bash
which rclone
rclone version
```

2. 手动验证配置：
```bash
export RCLONE_CONFIG=/home/admin/.config/rclone/rclone.conf
rclone listremotes
```

3. 查看配置文件内容：
```bash
cat /home/admin/.config/rclone/rclone.conf
```

## 版本管理

配置文件版本号格式：`v1.0.0-YYYYMMDD-HHMMSS`

每次更新配置时，版本号会自动更新。Agent 比较本地和远程版本号决定是否需要同步。

## 备份

同步前会自动备份旧配置：
- 备份位置：`/home/admin/.config/rclone/rclone.conf.backup-YYYY-MM-DDTHH:MM:SS`
- 保留最近的备份

## 安全建议

1. 修改默认 API Key
2. 使用 HTTPS（生产环境）
3. 限制配置服务器访问（防火墙）
4. 定期轮换 API Key
