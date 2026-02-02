/**
 * qBittorrent Web API 客户端封装
 */
const axios = require('axios');

// 配置
const QBT_URL = process.env.QBT_URL || 'http://localhost:18080';
const QBT_USERNAME = process.env.QBT_USERNAME || 'admin';
const QBT_PASSWORD = process.env.QBT_PASSWORD || 'adminadmin';

// 创建 axios 实例
const axiosInstance = axios.create({
  baseURL: QBT_URL,
  timeout: 30000
});

// Session ID
let sessionId = null;

/**
 * 登录并获取 Session ID
 */
async function login() {
  try {
    const response = await axiosInstance.post('/api/v2/auth/login', null, {
      params: {
        username: QBT_USERNAME,
        password: QBT_PASSWORD
      }
    });

    // 保存 Session ID
    const cookies = response.headers['set-cookie'];
    if (cookies) {
      sessionId = cookies.find(c => c.startsWith('SID='));
    }

    return true;
  } catch (error) {
    throw new Error(`qBittorrent 登录失败: ${error.message}`);
  }
}

/**
 * 确保已登录
 */
async function ensureLoggedIn() {
  if (!sessionId) {
    await login();
  }
}

/**
 * 发送 API 请求
 */
async function request(endpoint, method = 'GET', data = null) {
  await ensureLoggedIn();

  try {
    const config = {
      method,
      url: endpoint,
      headers: {}
    };

    if (sessionId) {
      config.headers['Cookie'] = sessionId;
    }

    if (data) {
      if (method === 'GET') {
        config.params = data;
      } else {
        config.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        config.data = new URLSearchParams(data).toString();
      }
    }

    const response = await axiosInstance(config);

    // 处理 403 (Session 过期)
    if (response.status === 403) {
      sessionId = null;
      await ensureLoggedIn();
      return request(endpoint, method, data);
    }

    return response.data;
  } catch (error) {
    if (error.response?.status === 403) {
      sessionId = null;
      await ensureLoggedIn();
      return request(endpoint, method, data);
    }
    throw error;
  }
}

// ========== qBittorrent API 方法 ==========

/**
 * 获取 qBittorrent 版本
 */
async function getVersion() {
  return await request('/api/v2/app/version');
}

/**
 * 获取所有种子信息
 */
async function getTorrents() {
  return await request('/api/v2/torrents/info');
}

/**
 * 获取单个种子信息
 */
async function getTorrentInfo(hash) {
  const torrents = await getTorrents();
  return torrents.find(t => t.hash === hash);
}

/**
 * 添加种子（URL 或 Magnet 链接）
 */
async function addTorrent(url, options = {}) {
  const params = {
    urls: url,
    savepath: options.savePath || '',
    category: options.category || ''
  };

  return await request('/api/v2/torrents/add', 'POST', params);
}

/**
 * 添加种子（.torrent 文件）
 */
async function addTorrentFile(fileBuffer, options = {}) {
  await ensureLoggedIn();

  const FormData = require('form-data');
  const form = new FormData();

  form.append('torrents', fileBuffer, {
    filename: 'torrent.torrent',
    contentType: 'application/x-bittorrent'
  });

  if (options.savePath) {
    form.append('savepath', options.savePath);
  }

  if (options.category) {
    form.append('category', options.category);
  }

  const response = await axiosInstance.post('/api/v2/torrents/add', form, {
    headers: {
      ...form.getHeaders(),
      'Cookie': sessionId
    }
  });

  return response.data;
}

/**
 * 暂停种子
 */
async function pauseTorrent(hash) {
  return await request('/api/v2/torrents/pause', 'POST', { hashes: hash });
}

/**
 * 恢复种子
 */
async function resumeTorrent(hash) {
  return await request('/api/v2/torrents/resume', 'POST', { hashes: hash });
}

/**
 * 删除种子
 */
async function deleteTorrent(hash, deleteFiles = false) {
  const endpoint = deleteFiles ? '/api/v2/torrents/delete' : '/api/v2/torrents/delete';
  return await request(endpoint, 'POST', {
    hashes: hash,
    deleteFiles: deleteFiles.toString()
  });
}

/**
 * 获取种子文件列表
 */
async function getTorrentFiles(hash) {
  return await request('/api/v2/torrents/files', 'GET', { hash });
}

/**
 * 获取下载内容的保存路径
 */
async function getSavePath(hash) {
  const torrent = await getTorrentInfo(hash);
  return torrent?.save_path || '';
}

/**
 * 检查连接状态
 */
async function isQBConnected() {
  try {
    await getVersion();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 获取全局下载信息
 */
async function getGlobalInfo() {
  const data = await request('/api/v2/sync/maindata');
  return {
    dlInfoSpeed: data?.server_state?.dl_info_speed || 0,
    upInfoSpeed: data?.server_state?.up_info_speed || 0,
    dlInfoData: data?.server_state?.dl_info_data || 0,
    upInfoData: data?.server_state?.up_info_data || 0
  };
}

// 初始化：预先登录
login().catch(err => {
  console.error('qBittorrent 初始登录失败:', err.message);
});

module.exports = {
  getVersion,
  getTorrents,
  getTorrentInfo,
  addTorrent,
  addTorrentFile,
  pauseTorrent,
  resumeTorrent,
  deleteTorrent,
  getTorrentFiles,
  getSavePath,
  isQBConnected,
  getGlobalInfo
};
