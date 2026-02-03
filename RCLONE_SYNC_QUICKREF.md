# rclone 配置同步 - 快速参考

## 常用命令

### 启动服务
```bash
cd /home/admin/github/moiubot
./start.sh
```

### 停止服务
```bash
cd /home/admin/github/moiubot
./stop.sh
```

### 运行测试
```bash
cd /home/admin/github/moiubot
./test-rclone-sync.sh
```

## API 快速参考

### 查看同步状态
```bash
curl http://localhost:3333/api/rclone/sync/status \
  -H "X-API-Key: sk_97b1bb38650ffb71d877fc8433aa1949"
```

### 强制同步
```bash
curl -X POST http://localhost:3333/api/rclone/sync/force \
  -H "X-API-Key: sk_97b1bb38650ffb71d877fc8433aa1949"
```

### 获取配置版本
```bash
curl http://localhost:4000/api/config/rclone/version \
  -H "X-API-Key: sk_config_master_key"
```

### 更新配置
```bash
curl -X POST http://localhost:4000/api/config/rclone/update \
  -H "X-API-Key: sk_config_master_key" \
  -H "Content-Type: application/json" \
  -d '{"config": "[remotes]\n..."}'
```

## 日志位置

```
/tmp/moiubot-config-server.log    # 配置服务器日志
/tmp/moiubot-agent.log             # Agent 日志
/tmp/moiubot-bot.log               # Bot 日志
```

## 配置文件位置

```
/home/admin/.config/rclone/rclone.conf                  # 当前配置
/home/admin/.config/rclone/rclone.conf.backup-*         # 备份文件
```

## 端口

```
4000    # 配置服务器
3333    # Agent
```

## 故障排除

### 权限问题
```bash
sudo chown -R admin:admin /home/admin/.config/rclone
sudo chmod -R 755 /home/admin/.config/rclone
```

### 检查服务状态
```bash
ps aux | grep "node (config-server|agent)/index"
```

### 查看同步日志
```bash
tail -f /tmp/moiubot-agent.log | grep rclone-sync
```

### 测试 rclone 配置
```bash
export RCLONE_CONFIG=/home/admin/.config/rclone/rclone.conf
rclone listremotes
```

## 环境配置

### Agent (.env.agent)
```env
RCLONE_SYNC_ENABLED=true
RCLONE_SYNC_ON_START=true
CONFIG_SERVER_URL=http://localhost:4000
CONFIG_SERVER_API_KEY=sk_config_master_key
```

### 配置服务器 (.env.config-server)
```env
CONFIG_SERVER_PORT=4000
CONFIG_SERVER_API_KEY=sk_config_master_key
RCLONE_CONFIG=/home/admin/.config/rclone/rclone.conf
```

## 文档

- **使用指南**: RCLONE_SYNC_GUIDE.md
- **交付文档**: RCLONE_SYNC_DELIVERY.md
- **实施总结**: RCLONE_SYNC_SUMMARY.md
- **文件清单**: RCLONE_SYNC_FILES.md

## 快速测试

### 一键测试所有功能
```bash
cd /home/admin/github/moiubot && ./test-rclone-sync.sh
```

### 手动测试流程
1. 启动配置服务器
2. 启动 Agent
3. 检查启动日志中的同步信息
4. 调用 API 测试各项功能
5. 验证配置文件和备份

## 重要提示

1. **生产环境必须修改默认 API Key**
2. **确保文件权限正确 (admin:admin, 755)**
3. **定期检查备份文件**
4. **监控同步日志**
5. **建议使用 HTTPS（生产环境）**
