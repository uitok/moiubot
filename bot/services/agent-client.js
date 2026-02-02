/**
 * Agent API 客户端
 * 用于与远程 Agent 服务器通信
 */
const axios = require('axios');

class AgentClient {
  constructor(serverUrl, apiKey) {
    this.serverUrl = serverUrl.replace(/\/$/, ''); // 移除末尾的斜杠
    this.apiKey = apiKey;
    this.timeout = 30000; // 30秒超时
  }

  /**
   * 发送请求到 Agent
   */
  async request(method, endpoint, data = null) {
    try {
      const url = `${this.serverUrl}${endpoint}`;
      const config = {
        method,
        url,
        timeout: this.timeout,
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json'
        }
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`Agent 返回错误: ${error.response.data?.error || error.response.statusText}`);
      } else if (error.request) {
        throw new Error('无法连接到 Agent 服务器');
      } else {
        throw new Error(`请求失败: ${error.message}`);
      }
    }
  }

  // ========== 健康检查 ==========
  async healthCheck() {
    return this.request('GET', '/api/health');
  }

  // ========== qBittorrent 操作 ==========
  async getQBStatus() {
    return this.request('GET', '/api/qb/status');
  }

  async getTorrents() {
    return this.request('GET', '/api/qb/torrents');
  }

  async getTorrentInfo(hash) {
    return this.request('GET', `/api/qb/torrents/${hash}`);
  }

  async addTorrent(options) {
    return this.request('POST', '/api/qb/add', options);
  }

  async pauseTorrent(hash) {
    return this.request('POST', `/api/qb/pause/${hash}`);
  }

  async resumeTorrent(hash) {
    return this.request('POST', `/api/qb/resume/${hash}`);
  }

  async deleteTorrent(hash, deleteFiles = false) {
    return this.request('DELETE', `/api/qb/delete/${hash}`, { deleteFiles });
  }

  // ========== rclone 操作 ==========
  async getRemotes() {
    return this.request('GET', '/api/rclone/remotes');
  }

  async moveFile(hash, remote, dest) {
    return this.request('POST', '/api/rclone/move', {
      hash,
      remote,
      dest
    });
  }

  async listFiles(remote, path = '') {
    return this.request('GET', `/api/rclone/list`, { remote, path });
  }

  // ========== 系统信息 ==========
  async getSystemInfo() {
    return this.request('GET', '/api/system/info');
  }
}

module.exports = AgentClient;
