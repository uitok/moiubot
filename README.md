# MoiuBot - qBittorrent 分布式管理机器人

<div align="center">

![MoiuBot Logo](https://img.shields.io/badge/MoiuBot-v1.0.0-blue)
![Node](https://img.shields.io/badge/Node.js-22.x-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

**一个强大的 Telegram 机器人，用于管理多个远程服务器上的 qBittorrent**

[功能特性](#功能特性) • [快速开始](#快速开始) • [部署指南](#部署指南) • [使用文档](#使用文档)

</div>

---

## 📖 项目简介

MoiuBot 是一个基于 Node.js 开发的 Telegram 机器人，用于集中管理多个远程服务器上的 qBittorrent 实例。它支持自动化下载→移动→清理工作流，可以轻松地将下载的文件自动迁移到云存储（如 Google Drive、OneDrive）。

### 🎯 核心功能

- ✅ **多服务器管理** - 统一管理多个远程 qBittorrent 服务器
- ✅ **交互式菜单** - 友好的 Telegram 交互界面
- ✅ **自动化工作流** - 下载完成自动移动到云存储并清理
- ✅ **灵活配置** - 支持不移动模式（仅下载）
- ✅ **实时监控** - 每 30 秒检查下载状态
- ✅ **云存储集成** - 支持 Google Drive、OneDrive 等（通过 rclone）

---

## 🏗️ 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                   Telegram Bot                          │
│              (运行在中央服务器)                          │
└────────────────┬────────────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │  API Gateway    │
        │  (REST API)     │
        └────────┬────────┘
                 │
    ┌────────────┼────────────┬────────────┐
    │            │            │            │
┌───▼───┐    ┌──▼───┐    ┌──▼───┐    ┌──▼───┐
│Agent 1│    │Agent 2│    │Agent 3│    │Agent N│
│ Server│    │ VPS  │    │ Home │    │ ...   │
└───────┘    └──────┘    └───────┘    └───────┘
  qBittor      qBittor     qBittor     qBittor
  rclone       rclone      rclone      rclone
```

### 核心组件

- **Bot (中央控制)** - Telegram Bot，处理用户交互
- **Agent (远程服务器)** - REST API 服务，控制 qBittorrent 和 rclone
- **数据库 (SQLite)** - 存储服务器配置、任务记录等

---

## 🚀 快速开始

### 前置要求

- Node.js 18.x 或更高版本
- qBittorrent（带 Web UI）
- rclone（用于云存储）
- Telegram Bot Token（从 [@BotFather](https://t.me/BotFather) 获取）

### 安装步骤

#### 1. 克隆仓库

```bash
git clone https://github.com/你的用户名/moiubot.git
cd moiubot
```

#### 2. 安装依赖

```bash
npm install
```

#### 3. 配置环境变量

```bash
# 复制配置模板
cp .env.bot.example .env.bot
cp .env.agent.example .env

# 编辑配置文件
nano .env.bot
nano .env
```

**Bot 配置 (.env.bot)**:
```env
TELEGRAM_BOT_TOKEN=你的_Bot_Token
DATABASE_PATH=./database/qbt-bot.db
ALLOWED_USERS=你的_Telegram_ID
```

**Agent 配置 (.env)**:
```env
PORT=3000
API_KEY=随机生成的密钥
QBT_URL=http://localhost:18080
QBT_USERNAME=admin
QBT_PASSWORD=你的_qBittorrent_密码
RCLONE_PATH=/usr/bin/rclone
```

#### 4. 初始化数据库

```bash
npm run init-db
```

#### 5. 启动服务

**开发环境**:
```bash
# 终端 1: 启动 Agent
npm run start:agent

# 终端 2: 启动 Bot
npm start
```

**生产环境 (使用 PM2)**:
```bash
pm2 start agent/index.js --name moiubot-agent
pm2 start bot/index.js --name moiubot
pm2 save
```

---

## 💬 Bot 命令

### 基础命令

| 命令 | 功能 | 示例 |
|------|------|------|
| `/start` | 启动 Bot 并注册用户 | `/start` |
| `/help` | 显示帮助信息 | `/help` |
| `/servers` | 显示所有服务器状态 | `/servers` |
| `/status <name>` | 查看指定服务器详细状态 | `/status home-server` |
| `/cancel` | 取消当前操作 | `/cancel` |

### 下载管理

| 命令 | 功能 | 说明 |
|------|------|------|
| `/add` | 添加种子（交互式） | 完整的工作流程 |
| `/list` | 显示所有下载任务 | 显示所有服务器的任务 |
| `/pause <hash>` | 暂停任务 | `/pause abc123...` |
| `/resume <hash>` | 恢复任务 | `/resume abc123...` |
| `/delete <hash>` | 删除任务 | `/delete abc123...` |
| `/move <hash>` | 手动触发移动 | `/move abc123...` |

### 服务器管理

| 命令 | 功能 | 说明 |
|------|------|------|
| `/add_server` | 添加服务器（向导式） | 交互式配置向导 |
| `/remove_server <name>` | 删除服务器 | `/remove_server home-server` |
| `/test_server <name>` | 测试服务器连接 | `/test_server home-server` |

### 配置管理

| 命令 | 功能 | 说明 |
|------|------|------|
| `/categories` | 管理分类和目录映射 | 添加/编辑/删除分类 |
| `/remotes` | 查看可用的 rclone remotes | 列出所有云存储 |
| `/logs` | 查看操作日志 | 显示最近的操作记录 |

---

## 🎯 使用流程示例

### 完整的下载→移动流程

```
用户: /add
Bot: 请选择服务器
     🖥 家里 NAS
     🖥 VPS 服务器

用户: [选择 "家里 NAS"]

Bot: 请发送 magnet 链接或 .torrent 文件

用户: magnet:?xt=urn:btih:...

Bot: 是否需要移动文件到云存储？
     ✅ 是（下载完成后自动移动并删除）
     ❌ 否（保留在本地）

用户: [选择 "✅ 是"]

Bot: 选择目标云存储
     ☁️ Google Drive
     ☁️ OneDrive

用户: [选择 "Google Drive"]

Bot: 选择目录
     📁 电影/
     📁 电视剧/
     📁 音乐/
     📁 自定义路径

用户: [选择 "电影/"]

Bot: ✅ 已添加到 "家里 NAS"
    下载开始后会自动移动到 gdrive:电影/ 并删除种子

    [监控下载进度...]
    ⬇️ 下载中: 45.2% (2.3 MB/s)

Bot: ✅ 下载完成，开始移动到云存储...
Bot: ✅ 移动完成: gdrive:电影/文件.mkv
Bot: ✅ 已删除本地种子任务
```

---

## 📦 部署指南

### Bot 端部署（中央服务器）

详见 [部署指南](docs/DEPLOYMENT.md)

### Agent 端部署（远程服务器）

详见 [Agent 部署](docs/AGENT_DEPLOYMENT.md)

### Docker 部署（可选）

```bash
# Bot
docker-compose up -d bot

# Agent
docker-compose up -d agent
```

---

## 🔧 配置 rclone

### 安装 rclone

```bash
curl https://rclone.org/install.sh | sudo bash
```

### 配置云存储

```bash
rclone config
```

按照提示配置 Google Drive、OneDrive 等云存储服务。

### 验证配置

```bash
# 列出 remotes
rclone listremotes

# 测试连接
rclone ls gdrive:
```

---

## 🛠️ 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| [Node.js](https://nodejs.org/) | 22.x | 运行环境 |
| [Telegraf](https://telegraf.js.org/) | 4.16.3 | Telegram Bot 框架 |
| [Express](https://expressjs.com/) | 4.18.2 | Agent API 服务器 |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | 9.4.3 | SQLite 数据库 |
| [Axios](https://axios-http.com/) | 1.6.5 | HTTP 客户端 |
| [Winston](https://github.com/winstonjs/winston) | 3.11.0 | 日志系统 |

---

## 📊 API 文档

### Agent API 端点

详见 [API 文档](docs/API.md)

#### qBittorrent 操作

```http
GET  /api/qb/status              # 获取状态
GET  /api/qb/torrents            # 获取所有种子
POST /api/qb/add                 # 添加种子
POST /api/qb/pause/:hash         # 暂停
POST /api/qb/resume/:hash        # 恢复
DELETE /api/qb/delete/:hash      # 删除
```

#### rclone 操作

```http
GET  /api/rclone/remotes         # 获取 remotes
POST /api/rclone/move            # 移动文件
GET  /api/rclone/list            # 列出文件
```

---

## 🤝 贡献指南

欢迎贡献代码、报告问题或提出建议！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 📝 开发路线图

### ✅ 已完成 (Phase 1-2)
- [x] Bot 基础框架
- [x] Agent API 服务器
- [x] qBittorrent 集成
- [x] rclone 集成
- [x] 下载监控
- [x] 数据库设计

### 🚧 进行中 (Phase 3)
- [ ] Bot ↔ Agent Webhook 通信
- [ ] 基础命令完善 (/list, /pause, /resume, /delete)
- [ ] 完整测试

### 📅 计划中 (Phase 4)
- [ ] 服务器管理命令
- [ ] 分类管理
- [ ] 日志查看
- [ ] 错误处理优化

---

## 📄 许可证

本项目基于 [MIT 许可证](LICENSE) 开源。

---

## 🙏 致谢

- [Telegraf](https://telegraf.js.org/) - 优秀的 Telegram Bot 框架
- [qBittorrent](https://www.qbittorrent.org/) - 强大的 BitTorrent 客户端
- [rclone](https://rclone.org/) - 优秀的云存储同步工具

---

## 📞 支持

- 📧 Email: [你的邮箱]
- 💬 Telegram: [你的 Telegram]
- 🐛 问题反馈: [GitHub Issues](https://github.com/你的用户名/moiubot/issues)

---

## ⭐ Star History

如果这个项目对你有帮助，请给个 Star ⭐

<div align="center">

**Made with ❤️ by [你的名字]**

</div>
