#!/usr/bin/env node

/**
 * MoiuBot 测试脚本
 * 测试各个组件是否正常工作
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) { log(`✅ ${message}`, 'green'); }
function error(message) { log(`❌ ${message}`, 'red'); }
function warning(message) { log(`⚠️  ${message}`, 'yellow'); }
function info(message) { log(`ℹ️  ${message}`, 'blue'); }

async function testAll() {
  log('\n========================================');
  log('MoiuBot 组件测试');
  log('========================================\n');

  let passed = 0;
  let failed = 0;

  // 1. 检查项目结构
  info('1. 检查项目结构...');
  const botExists = fs.existsSync(path.join(__dirname, 'bot/index.js'));
  const agentExists = fs.existsSync(path.join(__dirname, 'agent/index.js'));

  if (botExists) {
    success('Bot 主程序存在');
    passed++;
  } else {
    error('Bot 主程序不存在');
    failed++;
  }

  if (agentExists) {
    success('Agent 主程序存在');
    passed++;
  } else {
    error('Agent 主程序不存在');
    failed++;
  }

  // 2. 检查配置文件
  info('\n2. 检查配置文件...');
  const botEnvExists = fs.existsSync(path.join(__dirname, '.env.bot'));
  const agentEnvExists = fs.existsSync(path.join(__dirname, '.env'));

  if (botEnvExists) {
    success('Bot 配置文件存在');
    passed++;
  } else {
    error('Bot 配置文件不存在');
    failed++;
  }

  if (agentEnvExists) {
    success('Agent 配置文件存在');
    passed++;
  } else {
    error('Agent 配置文件不存在');
    failed++;
  }

  // 3. 测试 qBittorrent 连接
  info('\n3. 测试 qBittorrent 连接...');
  try {
    const qbResponse = await axios.get('http://localhost:18080', { timeout: 5000 });
    if (qbResponse.status === 200) {
      success('qBittorrent Web UI 可访问');
      passed++;
    } else {
      error('qBittorrent Web UI 返回错误状态');
      failed++;
    }
  } catch (err) {
    error(`qBittorrent 连接失败: ${err.message}`);
    failed++;
  }

  // 4. 测试 qBittorrent API 登录
  info('\n4. 测试 qBittorrent API 登录...');
  try {
    const loginResponse = await axios.post(
      'http://localhost:18080/api/v2/auth/login',
      'username=admin&password=adminadmin',
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 5000
      }
    );

    if (loginResponse.data === 'Ok') {
      success('qBittorrent API 登录成功 (用户名: admin, 密码: adminadmin)');
      passed++;
    } else {
      warning('qBittorrent API 登录返回非预期结果');
      failed++;
    }
  } catch (err) {
    warning(`qBittorrent API 登录失败（密码可能不是默认值）: ${err.message}`);
    failed++;
  }

  // 5. 测试 rclone
  info('\n5. 测试 rclone...');
  try {
    const { execSync } = require('child_process');
    const rcloneVersion = execSync('rclone version 2>&1 | head -1', { encoding: 'utf-8' });
    if (rcloneVersion.includes('rclone')) {
      success(`rclone 已安装: ${rcloneVersion.trim()}`);
      passed++;
    } else {
      error('rclone 未正确安装');
      failed++;
    }
  } catch (err) {
    error(`rclone 测试失败: ${err.message}`);
    failed++;
  }

  // 6. 检查 Node.js 模块
  info('\n6. 检查 Node.js 模块...');
  const modules = ['telegraf', 'express', 'axios', 'winston'];
  for (const mod of modules) {
    try {
      require.resolve(mod);
      success(`模块 ${mod} 已安装`);
      passed++;
    } catch (err) {
      error(`模块 ${mod} 未安装`);
      failed++;
    }
  }

  // 7. 数据库状态
  info('\n7. 数据库状态...');
  try {
    require.resolve('better-sqlite3');
    success('better-sqlite3 模块已安装');
    passed++;

    // 尝试创建数据库
    try {
      const Database = require('better-sqlite3');
      const db = new Database('/tmp/test_moiubot.db');
      db.exec('CREATE TABLE IF NOT EXISTS test (id INTEGER)');
      db.close();
      fs.unlinkSync('/tmp/test_moiubot.db');
      success('数据库创建和操作成功');
      passed++;
    } catch (dbErr) {
      warning(`better-sqlite3 已安装但无法使用: ${dbErr.message}`);
      failed++;
    }
  } catch (err) {
    warning('better-sqlite3 模块未安装或编译失败');
    info('  建议：使用其他数据库方案（如 lowdb）或安装编译工具');
    failed++;
  }

  // 总结
  log('\n========================================');
  log('测试总结');
  log('========================================');
  log(`通过: ${passed}`);
  log(`失败: ${failed}`);
  log(`总计: ${passed + failed}`);
  log(`成功率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  log('========================================\n');

  if (failed > 0) {
    warning('存在一些问题需要解决');
    info('\n建议：');
    info('1. 确保 qBittorrent 正在运行且端口正确');
    info('2. 检查 qBittorrent 登录密码');
    info('3. 配置 rclone: rclone config');
    info('4. 如果 better-sqlite3 编译失败，请安装编译工具或使用替代方案');
  } else {
    success('所有测试通过！项目可以正常运行');
    info('\n下一步：');
    info('1. 配置 .env.bot 中的 TELEGRAM_BOT_TOKEN');
    info('2. 配置 .env 中的 qBittorrent 和 rclone 设置');
    info('3. 运行: npm start (启动 Bot)');
    info('4. 运行: npm run start:agent (启动 Agent)');
  }
}

// 运行测试
testAll().catch(err => {
  error(`测试过程中发生错误: ${err.message}`);
  process.exit(1);
});
