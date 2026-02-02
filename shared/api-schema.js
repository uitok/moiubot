/**
 * API 接口定义和响应格式
 */

// 成功响应格式
function success(data = null, message = 'Success') {
  return {
    success: true,
    data,
    message
  };
}

// 错误响应格式
function error(message = 'Error', code = null) {
  return {
    success: false,
    error: message,
    code
  };
}

// Torrent 状态映射
const TORRENT_STATUS = {
  downloading: '⬇️ 下载中',
  stalledDL: '⏸️ 暂停',
  completed: '✅ 完成',
  seeding: '🌱 做种中',
  stalledUP: '🌱 做种中',
  paused: '⏸️ 暂停',
  queued: '⏳ 排队',
  allocating: '⏳ 分配空间',
  moving: '📦 移动中',
  error: '❌ 错误'
};

// 任务状态映射
const TASK_STATUS = {
  downloading: 'downloading',
  completed: 'completed',
  moving: 'moving',
  moved: 'moved',
  error: 'error',
  cancelled: 'cancelled'
};

module.exports = {
  success,
  error,
  TORRENT_STATUS,
  TASK_STATUS
};
