# 🔄 rclone 配置自动同步功能 - 开发计划

## 📋 项目目标

在 MoiuBot Agent 中集成 rclone 配置自动同步功能，确保所有 Agent 服务器的 rclone 配置保持一致。

---

## 🎯 核心功能

### 1. 配置检查
- Agent 启动时自动检查 rclone 配置是否存在
- 验证配置文件完整性
- 检查配置版本

### 2. 自动下载
- 如果配置缺失或版本过旧，从主服务器下载
- 支持多个备份源（主服务器、GitHub、S3等）
- 自动解密（如果加密）

### 3. 配置���证
- 下载后验证 remotes 是否可用
- 测试连接到各个云存储
- 报告配置状态

### 4. 定期同步
- 定期检查配置更新
- 支持强制重新同步
- 记录同步日志

---

## 🏗️ 技术方案

### 方案架构

```
┌─────────────────────────────────────────────┐
│           主服务器 (kvm15072)                │
│  rclone 配置主存储 + 配置服务器 API          │
└──────────────┬──────────────────────────────┘
               │
               │ HTTPS API
               │
    ┌──────────┴──────────┬──────────┬──────────┐
    │                     │          │          │
┌───▼────┐          ┌───▼────┐ ┌──▼─────┐ ┌▼────────┐
│Agent 1 │          │Agent 2 │ │Agent 3 │ │ Agent N │
│检查配置│          │检查配置│ │检查配置│ │检查配置 │
│下载缺失│          │下载缺失│ │下载缺失│ │下载缺失 │
└────────┘          └────────┘ └────────┘ └────────┘
```

### API 设计

#### 配置服务器 API（主服务器）

**端点**：
```javascript
GET /api/rclone/config
  - 返回最新的 rclone 配置文件
  - 支持 ETag/Last-Modified for 缓存

GET /api/rclone/version
  - 返回配置版本号

GET /api/rclone/verify
  - 验证配置是否可用
```

#### Agent 客户端

**启动时检查**：
```javascript
async function ensureRcloneConfig() {
  // 1. 检查本地配置
  const localConfig = getLocalConfig();

  // 2. 获取远程版本
  const remoteVersion = await fetchRemoteVersion();

  // 3. 比较版本
  if (needsUpdate(localConfig, remoteVersion)) {
    // 4. 下载新配置
    await downloadConfig();

    // 5. 验证配置
    await verifyConfig();
  }
}
```

---

## 📁 文件结构

```
moiubot/
├── agent/
│   ├── index.js                          # 添加启动时配置检查
│   ├── services/
│   │   ├── rclone-client.js              # 现有文件，增强
│   │   └── rclone-sync.js               # 新增：配置同步服务
│   └── routes/
│       └── rclone.js                     # 添加配置服务器端点（主服务器）
├── config-server/                        # 新增：配置服务器（主服务器）
│   ├── index.js                          # Express 服务器
│   ├── routes/
│   │   └── config.js                     # 配置分发端点
│   └── middleware/
│       └── auth.js                       # API Key 认证
└── shared/
    └── config-sync-protocol.js           # 同步协议定义
```

---

## 🔄 同步流程

### 流程 1: Agent 启动

```
1. Agent 启动
   ↓
2. 检查 ~/.config/rclone/rclone.conf 是否存在
   ↓
3. 如果不存在，从主服务器下载
   ↓
4. 如果存在，读取版本号
   ↓
5. 与主服务器版本比较
   ↓
6. 如果主服务器版本更新，下载新配置
   ↓
7. 备份旧配置
   ↓
8. 安装新配置
   ↓
9. 验证配置（rclone listremotes）
   ↓
10. 记录同步日志
   ↓
11. 启动完成
```

### 流程 2: 主服务器更新配置

```
1. 管理员更新 rclone 配置
   ↓
2. 触发 /api/rclone/reload
   ↓
3. 生成新版本号
   ↓
4. 广播更新事件到所有 Agent
   ↓
5. 各 Agent 收到通知
   ↓
6. Agent 下载新配置
   ↓
7. Agent 验证并应用
```

---

## 🛠️ 实现细节

### 1. 版本管理

**版本号格式**：`v1.0.0-YYYYMMDD-HHMMSS`

```javascript
// 生成版本号
function generateVersion() {
  const now = new Date();
  const date = now.toISOString().slice(0,10).replace(/-/g,'');
  const time = now.toTimeString().slice(0,8).replace(/:/g,'');
  return `v1.0.0-${date}-${time}`;
}
```

**存储位置**：
```javascript
// 在配置文件中添加版本注释
# rclone-config-version: v1.0.0-20260202-140500
```

### 2. 配置加密（可选）

```javascript
// 使用 AES 加密配置
const crypto = require('crypto');

function encryptConfig(configContent, password) {
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(password, 'salt', 32);
  const iv = crypto.randomBytes(16);
  // ... 加密逻辑
}

function decryptConfig(encryptedContent, password) {
  // ... 解密逻辑
}
```

### 3. 错误处理

```javascript
try {
  await ensureRcloneConfig();
} catch (error) {
  logger.error('rclone 配置同步失败:', error);

  // 降级方案：使用本地配置（如果存在）
  if (fs.existsSync(RCLONE_CONFIG_PATH)) {
    logger.warn('使用本地配置继续启动');
  } else {
    logger.error('无可用配置，部分功能将不可用');
  }
}
```

---

## 📊 API 端点设计

### Agent 端（新增）

```javascript
// 获取配置状态
GET /api/rclone/sync/status
Response: {
  "synced": true,
  "localVersion": "v1.0.0-20260202-140000",
  "remoteVersion": "v1.0.0-20260202-140500",
  "lastSync": "2026-02-02T14:00:00Z"
}

// 强制同步
POST /api/rclone/sync/force
Response: {
  "success": true,
  "message": "配置已同步"
}

// 同步历史
GET /api/rclone/sync/history
Response: [{
  "timestamp": "2026-02-02T14:00:00Z",
  "action": "sync",
  "fromVersion": "v1.0.0-20260202-130000",
  "toVersion": "v1.0.0-20260202-140000",
  "success": true
}]
```

### 配置服务器端（主服务器新增）

```javascript
// 获取最新配置
GET /api/config/rclone
Query: ?version=current
Response: 配置文件内容

// 获取配置版本
GET /api/config/rclone/version
Response: {
  "version": "v1.0.0-20260202-140500",
  "checksum": "sha256:..."
}

// 更新配置（管理员）
POST /api/config/rclone/update
Body: { config: "..." }
Response: { success: true, version: "..." }

// 广播更新（管理员）
POST /api/config/rclone/broadcast
Body: { message: "配置已更新，请同步" }
```

---

## 🗄️ 数据库设计

### 新增表：rclone_sync_history

```sql
CREATE TABLE rclone_sync_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER,              -- 关联服务器
  action TEXT,                    -- sync/download/verify
  from_version TEXT,
  to_version TEXT,
  success BOOLEAN,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (server_id) REFERENCES servers(id)
);
```

---

## 🔐 安全设计

### 1. API 认证

```javascript
// Agent 下载配置时使用 API Key
const response = await axios.get(CONFIG_SERVER_URL + '/api/config/rclone', {
  headers: {
    'X-API-Key': CONFIG_SYNC_KEY,
    'X-Server-ID': SERVER_ID
  }
});
```

### 2. 配置加密（可选）

```javascript
// 环境变量
RCLONE_CONFIG_ENCRYPTION_KEY=your-secret-key
RCLONE_CONFIG_ENCRYPTED=true
```

### 3. HTTPS

```javascript
// 配置服务器必须使用 HTTPS
CONFIG_SERVER_URL=https://config-server.example.com
```

---

## 📝 配置文件

### Agent 配置 (.env)

```env
# rclone 同步配置
RCLONE_SYNC_ENABLED=true
RCLONE_CONFIG_SERVER=https://config.example.com
RCLONE_SYNC_API_KEY=sk_config_sync_key
RCLONE_SYNC_INTERVAL=86400000  # 24小时检查一次
RCLONE_SYNC_ON_START=true        # 启动时检查
RCLONE_CONFIG_BACKUP=true        # 同步前备份旧配置
```

### 配置服务器配置

```env
CONFIG_SERVER_PORT=4000
CONFIG_SERVER_API_KEY=sk_master_key
CONFIG_SERVER_CONFIG_PATH=/home/admin/.config/rclone/rclone.conf
```

---

## 🧪 测试计划

### 单元测试

1. **版本比较**
   - 测试版本号解析
   - 测试版本比较逻辑

2. **配置下载**
   - 测试成功下载
   - 测试下载失败处理
   - 测试网络超时

3. **配置验证**
   - 测试有效配置
   - 测试无效配置
   - 测试损坏配置

### 集成测试

1. **完整同步流程**
   - Agent 启动 → 下载配置 → 验证 → 完成

2. **配置更新**
   - 主服务器更新 → Agent 同步 → 验证

3. **错误恢复**
   - 下载失败 → 使用本地配置
   - 配置损坏 → 恢复备份

---

## 📚 使用文档

### 管理员操作

**更新配置并同步**：
```bash
# 1. 更新主服务器配置
rclone config

# 2. 调用 API 触发同步
curl -X POST https://config.example.com/api/config/rclone/broadcast \
  -H "X-API-Key: sk_master_key" \
  -H "Content-Type: application/json" \
  -d '{"message": "配置已更新"}'

# 3. 查看 Agent 同步状态
curl https://agent1.example.com/api/rclone/sync/status \
  -H "X-API-Key: sk_agent_key"
```

**查看同步历史**：
```bash
# 在主服务器查看所有 Agent 的同步历史
SELECT * FROM rclone_sync_history ORDER BY created_at DESC LIMIT 10;
```

---

## 🎯 开发阶段

### Phase 1: 基础功能（1-2天）
- [ ] Agent 端配置检查逻辑
- [ ] 配置下载功能
- [ ] 配置验证功能
- [ ] 启动时自动同步

### Phase 2: 配置服务器（1天）
- [ ] 配置服务器 API
- [ ] 版本管理
- [ ] 配置分发

### Phase 3: 高级功能（1-2天）
- [ ] 定期同步检查
- [ ] 配置加密
- [ ] 同步日志和统计

### Phase 4: 测试和文档（1天）
- [ ] 单元测试
- [ ] 集成测试
- [ ] 使用文档

---

## 💡 额外建议

### 1. 配置模板

为不同的云存储提供配置模板：
- Google Drive 模板
- OneDrive 模板
- Dropbox 模板
- S3 模板

### 2. Web UI

添加简单的 Web UI 用于：
- 查看所有 Agent 的配置状态
- 手动触发同步
- 查看同步日志
- 更新配置

### 3. 告警通知

同步失败时发送通知：
- Telegram 通知
- 邮件通知
- Webhook

---

**项目预计完成时间**: 5-7天
**优先级**: 🟡 中（功能增强）
**复杂度**: ⭐⭐⭐ (中等)
