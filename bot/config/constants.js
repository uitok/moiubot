/**
 * 常量定义 - 纯文本版本（不使用 Markdown）
 */

// Bot 命令列表
export const COMMANDS = {
  START: 'start',
  ADD: 'add',
  SERVERS: 'servers',
  STATUS: 'status',
  LIST: 'list',
  PAUSE: 'pause',
  RESUME: 'resume',
  DELETE: 'delete',
  MOVE: 'move',
  ADD_SERVER: 'add_server',
  REMOVE_SERVER: 'remove_server',
  TEST_SERVER: 'test_server',
  CATEGORIES: 'categories',
  REMOTES: 'remotes',
  LOGS: 'logs',
  SETTINGS: 'settings',
  CANCEL: 'cancel',
  HELP: 'help'
};

// Bot 消息文本（纯文本，不包含任何 Markdown 格式）
export const MESSAGES = {
  WELCOME: `欢迎使用 MoiuBot！

这是一个 qBittorrent 分布式管理机器人，支持：
- 多服务器管理
- 添加种子（magnet/.torrent/URL）
- 下载完成自动移动到云存储
- 实时下载进度通知

使用 /help 查看所有命令`,

  HELP: `命令列表：

【基础命令】
/start - 开始使用
/servers - 查看所有服务器状态
/status [服务器名] - 查看服务器详细状态
/help - 显示帮助信息

【下载管理】
/add - 添加种子
/list - 查看下载任务
/pause [hash] - 暂停任务
/resume [hash] - 恢复任务
/delete [hash] - 删除任务
/move [hash] - 手动移动文件

【服务器管理】
/add_server - 添加服务器
/remove_server [名称] - 删除服务器
/test_server [名称] - 测试连接

【其他】
/categories - 管理分类
/logs - 查看操作日志
/cancel - 取消当前操作`,

  NO_SERVERS: '还没有配置任何服务器。请使用 /add_server 添加服务器。',
  SERVER_NOT_FOUND: '找不到该服务器。',
  INVALID_URL: '无效的 URL 格式。',
  CONNECTION_FAILED: '连接服务器失败。',
  SUCCESS: '操作成功！',
  FAILED: '操作失败！',
  CANCELLED: '操作已取消。'
};

// 下载状态文本
export const TORRENT_STATUS_TEXT = {
  downloading: '下载中',
  paused: '暂停',
  completed: '完成',
  seeding: '做种中',
  stalledDL: '暂停',
  stalledUP: '做种中',
  queued: '排队',
  allocating: '分配空间',
  moving: '移动中',
  error: '错误',
  unknown: '未知'
};

// 任务状态文本
export const TASK_STATUS_TEXT = {
  downloading: '下载中',
  completed: '已完成',
  moving: '移动中',
  moved: '已移动',
  error: '错误',
  cancelled: '已取消'
};

// 会话状态
export const SESSION_STATES = {
  IDLE: 'idle',
  ADD_SERVER_NAME: 'add_server_name',
  ADD_SERVER_URL: 'add_server_url',
  ADD_SERVER_KEY: 'add_server_key',
  ADD_SELECT_SERVER: 'add_select_server',
  ADD_WAIT_TORRENT: 'add_wait_torrent',
  ADD_ASK_MOVE: 'add_ask_move',
  ADD_SELECT_REMOTE: 'add_select_remote',
  ADD_SELECT_CATEGORY: 'add_select_category'
};
