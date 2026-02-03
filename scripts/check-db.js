const Database = require('better-sqlite3');
const db = new Database('database/qbt-bot.db');

try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log('✅ 数据库表列表:');
  tables.forEach(t => console.log(`  - ${t.name}`));

  console.log('\n✅ 用户表数据:');
  const users = db.prepare('SELECT * FROM users').all();
  console.log(`  用户数量: ${users.length}`);
  if (users.length > 0) {
    console.log('  用户列表:', JSON.stringify(users, null, 2));
  }

  console.log('\n✅ 分类表数据:');
  const categories = db.prepare('SELECT * FROM categories').all();
  console.log(`  分类数量: ${categories.length}`);
  categories.forEach(c => console.log(`  - ${c.emoji} ${c.name} (${c.remote}${c.path})`));

} catch (error) {
  console.error('❌ 错误:', error.message);
} finally {
  db.close();
}
