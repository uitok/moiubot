# MoiuBot - qBittorrent 分布式管理机器人

## 项目简介

MoiuBot 是一个 Telegram 机器人，用于管理多个远程服务器上的 qBittorrent，支持自动化下载→移动→清理工作流。

## 核心功能

- ✅ 多服务器 qBittorrent 管理
- ✅ 交互式菜单添加种子（支持 magnet/.torrent/URL）
- ✅ 下载完成自动移动到云存储（Google Drive/OneDrive）
- ✅ 自动删除本地种子任务
- ✅ 可选不移动模式（仅下载）
- ✅ 下载进度实时通知
- ✅ 跨服务器文件管理

## 技术栈

- **Bot**: Node.js + Telegraf
- **Agent**: Node.js + Express
- **数据库**: SQLite (better-sqlite3)
- **下载**: qBittorrent Web API
- **存储**: rclone (Google Drive/OneDrive)

## 项目结构

```
moiubot/
├── bot/                    # Telegram Bot (中央控制)
│   ├── index.js           # Bot 主程序
│   ├── handlers/          # 命令处理器
│   ├── services/          # 服务层
│   └── config/            # 配置
├── agent/                  # Agent (��程服务器部署)
│   ├── index.js           # Express 服务器
│   ├── routes/            # API 路由
│   └── services/          # 服务层
├── shared/                 # 共享代码
├── database/               # SQLite 数据库
└── package.json
```

## 部署指南

### Bot 端部署（中央服务器）

#### 1. 安装依赖

```bash
cd /home/admin/github/moiubot
npm install
```

#### 2. 配置环境变量

```bash
cp .env.bot.example .env.bot
nano .env.bot
```

配置内容：

```env
# Bot Token (从 @BotFather 获取)
TELEGRAM_BOT_TOKEN=your_bot_token_here

# 数据库路径
DATABASE_PATH=./database/qbt-bot.db

# 日志级别
LOG_LEVEL=info

# 允许的用户（逗号分隔的 Telegram ID）
ALLOWED_USERS=6830441855
```

#### 3. 初始化数据库

```bash
npm run init-db
```

#### 4. 启动 Bot

开发环境：

```bash
npm start
```

生产环境（使用 PM2）：

```bash
npm install -g pm2
pm2 start bot/index.js --name moiubot
pm2 save
pm2 startup
```

### Agent 端部署（远程服务器）

#### 1. 上传代码到远程服务器

```bash
scp -r agent/ user@remote-server:/opt/moiubot-agent
```

#### 2. SSH 登录远程服务器

```bash
ssh user@remote-server
cd /opt/moiubot-agent
```

#### 3. 安装依赖

```bash
npm install
```

#### 4. 配置环境变量

```bash
cp .env.agent.example .env
nano .env
```

配置内容：

```env
# Agent 服务端口
PORT=3000

# API Key (用于 Bot 认证)
API_KEY=sk_your_random_api_key_here

# qBittorrent 配置
QBT_URL=http://localhost:8080
QBT_USERNAME=admin
QBT_PASSWORD=your_qb_password

# Rclone 配置
RCLONE_PATH=/usr/bin/rclone
RCLONE_CONFIG=/home/user/.config/rclone/rclone.conf

# 下载监控配置
MONITOR_INTERVAL=30000
MOVE_TIMEOUT=3600000

# 日志级别
LOG_LEVEL=info
```

#### 5. 安装并配置 rclone

```bash
# 安装 rclone
curl https://rclone.org/install.sh | sudo bash

# 配置 rclone
rclone config
```

按照提示添加 Google Drive 和 OneDrive。

#### 6. 使用 PM2 启动 Agent

```bash
npm install -g pm2
pm2 start index.js --name moiubot-agent
pm2 save
pm2 startup
```

#### 7. 配置 Nginx 反向代理（可选但推荐）

```nginx
server {
    listen 80;
    server_name agent.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

配置 SSL：

```bash
sudo certbot --nginx -d agent.example.com
```

#### 8. 在 Bot 端添加服务器

在 Telegram 中使用 Bot 命令：

```
/add_server
```

按照提示输入服务器名称、Agent URL 和 API Key。

## 使用说明

### Bot 命令

#### 基础命令

- `/start` - 开始使用
- `/help` - 显示帮助信息
- `/servers` - 查看所有服务器状态
- `/status <服务器名>` - 查看服务器详细状态

#### 下载管理

- `/add` - 添加种子（交互式菜单）
- `/list` - 查看下载任务列表
- `/pause <hash>` - 暂停任务
- `/resume <hash>` - 恢复任务
- `/delete <hash>` - 删除任务
- `/move <hash>` - 手动触发移动

#### 服务器管理

- `/add_server` - 添加服务器
- `/remove_server <名称>` - 删除服务器
- `/test_server <名称>` - 测试连接

#### 其他

- `/categories` - 管理分类和目录映射
- `/logs` - 查看操作日志
- `/cancel` - 取消当前操作

### 添加种子流程

1. 使用 `/add` 命令
2. 选择服务器
3. 发送 magnet 链接、.torrent 文件或 URL
4. 选择是否自动移动到云存储
   - **是**: 选择云存储和目录，下载完成后自动移动并删除本地文件
   - **否**: 仅下载，保留在本地
5. Bot 开始监控下载进度

## API 接口

Agent 提供 REST API，供 Bot 调用：

### 认证

所有请求需要包含 API Key：

```
X-API-Key: sk_your_api_key_here
```

### 端点

#### qBittorrent 操作

- `GET /api/qb/status` - 获取状态
- `GET /api/qb/torrents` - 获取所有种子
- `GET /api/qb/torrents/:hash` - 获取单个种子信息
- `POST /api/qb/add` - 添加种子
- `POST /api/qb/pause/:hash` - 暂停种子
- `POST /api/qb/resume/:hash` - 恢复种子
- `DELETE /api/qb/delete/:hash` - 删除种子

#### rclone 操作

- `GET /api/rclone/remotes` - 获取所有 remotes
- `POST /api/rclone/move` - 移动文件
- `GET /api/rclone/list` - 列出文件
- `GET /api/rclone/about` - 获取存储空间信息

#### 系统信息

- `GET /api/system/info` - 获取系统信息
- `GET /api/health` - 健康检查

## 测试

### 测试 Bot

```bash
cd bot
node index.js
```

在 Telegram 中与 Bot 交互，测试各项命令。

### 测试 Agent API

```bash
# 健康检查
curl http://localhost:3000/api/health \
  -H "X-API-Key: sk_your_api_key"

# 获取种子列表
curl http://localhost:3000/api/qb/torrents \
  -H "X-API-Key: sk_your_api_key"

# 获取 remotes
curl http://localhost:3000/api/rclone/remotes \
  -H "X-API-Key: sk_your_api_key"
```

## 故障排查

### Bot 无法启动

1. 检查 `TELEGRAM_BOT_TOKEN` 是否正确
2. 检查数据库是否已初始化
3. 查看日志：`pm2 logs moiubot`

### Agent 无法连接 qBittorrent

1. 检查 qBittorrent Web UI 是否启用
2. 确认 `QBT_URL`、`QBT_USERNAME`、`QBT_PASSWORD` 正确
3. 检查防火墙设置

### rclone 操作失败

1. 检查 rclone 是否安装：`rclone version`
2. 测试 remote：`rclone ls gdrive:`
3. 检查 `RCLONE_CONFIG` 路径是否正确

## 开发

详细开发计划请查看 [PROJECT_PLAN.md](./PROJECT_PLAN.md)

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！
