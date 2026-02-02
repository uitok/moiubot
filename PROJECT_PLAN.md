# 📋 qBittorrent 分布式管理 Bot - 详细开发计划

## 🎯 项目目标
开发一个 Telegram 机器人，能够管理多个远程服务器上的 qBittorrent，支持自动化下载→移动→清理工作流。

## 📐 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                   Telegram Bot                          │
│              (运行在 kvm15072 主服务器)                  │
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

1. **Telegram Bot (中央控制)**
   - 用户交互界面
   - 任务调度和管理
   - 配置存储

2. **Agent (远程服务器)**
   - HTTP API 服务
   - qBittorrent 操作封装
   - rclone 操作封装
   - 下载监控和事件触发

3. **数据库 (SQLite)**
   - 服务器配置
   - 用户设置
   - 任务记录

---

## 🎯 核心工作流

### 完整下载流程

```
用户: /add
Bot: 显示服务器列表菜单
    1. Server 1 (家里 NAS)
    2. Server 2 (VPS)
    3. Server 3 (朋友家)

用户: 选择 1
Bot: 请发送 magnet 链接或 .torrent 文件

用户: 发送 magnet:?xt=...
Bot: 是否需要移动文件到云存储？
    ✅ 是（下载完成后自动移动并删除）
    ❌ 否（保留在本地）

用户: 选择 ✅ 是
Bot: 选择目标云存储：
    1. Google Drive
    2. OneDrive
    3. 取消

用户: 选择 1 (Google Drive)
Bot: 选择目录：
    1. 电影/
    2. 电视剧/
    3. 音乐/
    4. 自定义路径

用户: 选择 1
Bot: ✅ 已添加到 Server 1
    下载开始后会自动移动到 gdrive:电影/ 并删除种子

    [可选：下载进度监控]
    ⬇️ 下载中: 45.2% (2.3 MB/s)
    ...

Bot: ✅ 下载完成，开始移动到云存储...
Bot: ✅ 移动完成: gdrive:电影/文件.mkv
Bot: ✅ 已删除本地种子任务
```

---

## 🛠️ 技术栈

### Bot 端（中央服务器）
- **框架**: Node.js + Telegraf
- **数据库**: SQLite (better-sqlite3)
- **HTTP 客户端**: axios
- **任务队列**: 简化版用内存队列

### Agent 端（远程服务器）
- **框架**: Node.js + Express
- **qBittorrent**: qBittorrent Web API
- **rclone**: rclone CLI
- **进程管理**: PM2

### 通信协议
- **Bot → Agent**: REST API over HTTPS
- **认证**: API Key

---

## 📁 项目结构

```
moiubot/
├── bot/                          # Telegram Bot (中央控制)
│   ├── index.js                  # Bot 主程序
│   ├── handlers/
│   │   ├── start.js              # /start 命令
│   │   ├── add.js                # /add 添加种子
│   │   ├── servers.js            # 服务器管理
│   │   └── status.js             # 状态查询
│   ├── keyboard/
│   │   ├── server-select.js      # 服务器选择菜单
│   │   ├── storage-select.js     # 云存储选择菜单
│   │   └── category-select.js    # 目录选择菜单
│   ├── services/
│   │   ├── agent-client.js       # Agent API 客户端
│   │   ├── task-manager.js       # 任务管理器
│   │   └── db.js                 # 数据库操作
│   └── config/
│       ├── database.js           # SQLite 初始化
│       └── constants.js          # 常量定义
│
├── agent/                        # Agent (远程服务器部署)
│   ├── index.js                  # Express 服务器
│   ├── routes/
│   │   ├── qb.js                 # qBittorrent 路由
│   │   ├── rclone.js             # rclone 路由
│   │   └── system.js             # 系统信息路由
│   ├── services/
│   │   ├── qb-client.js          # qBittorrent API 封装
│   │   ├── rclone-client.js      # rclone 封装
│   │   └── download-monitor.js   # 下载监控和事件触发
│   └── config/
│       └── agent-config.js       # Agent 配置
│
├── shared/                       # 共享代码
│   ├── api-schema.js             # API 接口定义
│   └── utils.js                  # 工具函数
│
├── database/
│   └── qbt-bot.db                # SQLite 数据库
│
├── package.json
├── .env.example
├── .env.bot.example
├── .env.agent.example
├── Dockerfile.bot
├── Dockerfile.agent
├── README.md
└── PROJECT_PLAN.md
```

---

## 💬 Bot 命令设计

```
【基础命令】
/start - 欢迎消息和帮助
/servers - 显示所有服务器状态
/status [服务器名] - 查看指定服务器详细状态

【下载管理】
/add - 添加种子（交互式菜单）
    → 选择服务器
    → 发送 magnet/url/.torrent 文件
    → 是否移动到云存储（是/否）
    → 选择云存储（Google Drive/OneDrive）
    → 选择目录

/list - 显示所有下载任务
    → 显示每个服务器的任务列表
/pause <hash> - 暂停任务
/resume <hash> - 恢复任务
/delete <hash> - 删除任务

【手动操作】
/move <hash> - 手动触发移动（如果之前选择"不移动"）
    → 选择云存储
    → 选择目录

【服务器管理】
/add_server - 添加服务器（向导式）
    1. 输入服务器名称
    2. 输入 Agent URL (https://...)
    3. 输入 API Key
    4. 测试连接
/remove_server <name> - 删除服务器
/test_server <name> - 测试服务器连接

【配置管理】
/categories - 管理分类和目录映射
    1. 电影 → gdrive:电影/
    2. 电视剧 → gdrive:电视剧/
    3. 添加/编辑/删除
/remotes - 查看可用的 rclone remotes
/logs - 查看操作日志
/settings - 个人设置

【其他】
/cancel - 取消当前操作
/help - 帮助信息
```

---

## 🔌 API 接口设计

### Agent API 端点

```javascript
// qBittorrent 操作
GET  /api/qb/status              // 获取状态
GET  /api/qb/torrents            // 获取所有 torrent
POST /api/qb/add                 // 添加 torrent
POST /api/qb/pause/:hash         // 暂停
POST /api/qb/resume/:hash        // 恢复
DELETE /api/qb/delete/:hash      // 删除

// rclone 操作
GET  /api/rclone/remotes         // 获取 rclone remotes
POST /api/rclone/move            // 移动文件
    Body: {
      hash: "torrent_hash",
      remote: "gdrive:",
      dest: "电影/2024"
    }

// 系统信息
GET  /api/system/info            // 系统信息（磁盘空间等）
GET  /api/health                 // 健康检查
```

### 请求示例

```javascript
// Bot 调用 Agent 添加种子
POST https://agent.example.com/api/qb/add
Headers: {
  "X-API-Key": "your-api-key",
  "Content-Type": "application/json"
}
Body: {
  "url": "magnet:?xt=...",
  "autoMove": true,
  "moveConfig": {
    "remote": "gdrive:",
    "dest": "电影/"
  }
}

// 响应
{
  "success": true,
  "hash": "abc123...",
  "message": "Torrent 已添加"
}
```

---

## 🗄️ 数据库设计

### servers 表
```sql
CREATE TABLE servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,           -- 服务器名称
  url TEXT NOT NULL,                    -- Agent URL
  api_key TEXT NOT NULL,                -- API 密钥
  enabled BOOLEAN DEFAULT 1,            -- 是否启用
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### tasks 表
```sql
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER,                    -- 关联服务器
  hash TEXT NOT NULL,                   -- Torrent hash
  name TEXT,                            -- 任务名称
  status TEXT,                          -- 状态：downloading/completed/moving/error
  auto_move BOOLEAN DEFAULT 0,          -- 是否自动移动
  move_remote TEXT,                     -- 移动目标 remote
  move_dest TEXT,                       -- 移动目标路径
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  moved_at DATETIME,
  FOREIGN KEY (server_id) REFERENCES servers(id)
);
```

### categories 表
```sql
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,            -- 分类名称
  remote TEXT NOT NULL,                 -- rclone remote
  path TEXT NOT NULL,                   -- 目标路径
  emoji TEXT,                           -- 显示图标
  sort_order INTEGER DEFAULT 0
);

-- 示例数据
INSERT INTO categories (name, remote, path, emoji) VALUES
('电影', 'gdrive:', '电影/', '🎬'),
('电视剧', 'gdrive:', '电视剧/', '📺'),
('音乐', 'gdrive:', '音乐/', '🎵'),
('软件', 'onedrive:', '软件/', '💾');
```

### users 表
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  telegram_id INTEGER UNIQUE NOT NULL,  -- Telegram 用户 ID
  username TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### activity_log 表
```sql
CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,                 -- 操作类型
  server_name TEXT,                     -- 服务器名称
  details TEXT,                         -- 详细信息（JSON）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## 🔄 下载监控和自动化流程

### Agent 端监控逻辑

```javascript
// services/download-monitor.js
class DownloadMonitor {
  async start() {
    // 每 30 秒检查一次
    setInterval(async () => {
      await this.checkCompletedTorrents();
    }, 30000);
  }

  async checkCompletedTorrents() {
    // 1. 获取所有 torrent
    const torrents = await qbClient.getTorrents();

    // 2. 筛选刚完成的
    const completed = torrents.filter(t =>
      t.state === 'uploading' || t.state === 'stalledUP'
    );

    // 3. 检查是否需要自动移动
    for (const torrent of completed) {
      const task = await database.getTaskByHash(torrent.hash);

      if (task && task.auto_move) {
        await this.autoMove(torrent, task);
      }
    }
  }

  async autoMove(torrent, task) {
    try {
      // 1. 通知 Bot 开始移动
      await notifyBot(task.server_id, {
        type: 'move_start',
        name: torrent.name
      });

      // 2. 调用 rclone move
      await rcloneClient.move(torrent.hash, task.move_remote, task.move_dest);

      // 3. 删除 qBittorrent 任务
      await qbClient.deleteTorrent(torrent.hash);

      // 4. 更新数据库
      await database.updateTaskStatus(torrent.hash, 'moved');

      // 5. 通知 Bot 完成
      await notifyBot(task.server_id, {
        type: 'move_complete',
        name: torrent.name,
        dest: `${task.move_remote}${task.move_dest}`
      });

    } catch (error) {
      logger.error('自动移动失败:', error);
      await notifyBot(task.server_id, {
        type: 'move_error',
        name: torrent.name,
        error: error.message
      });
    }
  }
}
```

---

## 🔐 安全设计

### 1. API 认证
```javascript
// 每个服务器有唯一的 API Key
servers: {
  "home-server": {
    url: "https://home.example.com",
    api_key: "sk_abc123..." // 随机生成
  }
}

// Agent 验证请求
app.use((req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== config.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
```

### 2. 用户白名单
```javascript
// 只允许特定用户使用
const ALLOWED_USERS = [
  6830441855, // Telegram ID
];

bot.use((ctx, next) => {
  if (!ALLOWED_USERS.includes(ctx.from.id)) {
    return ctx.reply('❌ 你没有权限使用此 Bot');
  }
  return next();
});
```

---

## 📦 部署方案

### Bot 端部署（kvm15072）

```bash
# 1. 克隆项目
cd /home/admin/github/moiubot
cd bot

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.bot.example .env
# 编辑 .env
TELEGRAM_BOT_TOKEN=your_bot_token
DATABASE_PATH=../database/qbt-bot.db

# 4. 初始化数据库
node config/database.js

# 5. 启动（使用 PM2）
pm2 start index.js --name moiubot
pm2 save
pm2 startup
```

### Agent 端部署（远程服务器）

```bash
# 1. 上传 agent 目录到远程服务器
scp -r agent/ user@remote-server:/opt/moiubot-agent

# 2. SSH 登录远程服务器
ssh user@remote-server

# 3. 安装依赖
cd /opt/moiubot-agent
npm install

# 4. 配置环境变量
cp .env.agent.example .env
# 编辑 .env
AGENT_PORT=3000
API_KEY=sk_xxx_generated_key
QBT_URL=http://localhost:18080
QBT_USERNAME=admin
QBT_PASSWORD=your_password

# 5. 安装 rclone（如果没有）
curl https://rclone.org/install.sh | sudo bash

# 6. 配置 rclone
rclone config
# 添加 Google Drive 和 OneDrive

# 7. 测试
curl http://localhost:3000/api/health

# 8. 使用 PM2 启动
pm2 start index.js --name moiubot-agent
pm2 save
pm2 startup
```

### 使用 Nginx 反向代理（推荐）

```nginx
# /etc/nginx/sites-available/moiubot-agent
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

# 配置 SSL (Let's Encrypt)
sudo certbot --nginx -d agent.example.com
```

---

## 🚀 开发步骤

### Phase 1: 基础框架（1-2 天）
- [ ] 创建项目结构
- [ ] 实现 Bot 基础命令
- [ ] 实现数据库初始化
- [ ] 实现服务器管理功能

### Phase 2: Agent 开发（1-2 天）
- [ ] 实现 Agent API 服务器
- [ ] 实现 qBittorrent API 封装
- [ ] 实现 rclone 封装
- [ ] 测试 API 接口

### Phase 3: 核心功能（2-3 天）
- [ ] 实现添加种子交互流程
- [ ] 实现下载监控
- [ ] 实现自动移动流程
- [ ] 实现状态查询

### Phase 4: 高级功能（1-2 天）
- [ ] 实现分类管理
- [ ] 实现日志记录
- [ ] 实现错误处理和重试

### Phase 5: 测试和部署（1 天）
- [ ] 本地测试
- [ ] 远程服务器部署测试
- [ ] 完善文档

---

## 📝 需求总结

✅ **确认需求**：
1. Agent 部署在每个远程服务器上，通过 REST API 通信
2. 用户发送 magnet 链接到 Bot
3. 交互式菜单选择服务器、是否移动、云存储、目录
4. 下载完成自动触发移动，然后删除种子
5. 多个服务器，每个 rclone 配置相同
6. 主要用 Google Drive 和 OneDrive
7. 只有部署者可以使用（单用户）
8. 可以选择不移动（只下载）

---

## 📚 参考资料

- Telegraf 文档: https://telegraf.js.org/
- qBittorrent Web API: https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-4.1%2B)
- Rclone 文档: https://rclone.org/
- Express 文档: https://expressjs.com/
