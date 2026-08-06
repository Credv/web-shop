const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'shop.db');

let db = null;

function getDb() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) console.error('Database open error:', err);
      else console.log('✅ SQLite 数据库已连接');
    });
    db.configure('busyTimeout', 5000);
  }
  return db;
}

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// ==================== 初始化数据库 ====================
async function initDb() {
  try {
    // 商家表
    await runAsync(`
      CREATE TABLE IF NOT EXISTS merchants (
        id TEXT PRIMARY KEY,
        phone TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT DEFAULT '小店',
        wechat_code TEXT,
        alipay_code TEXT,
        open INTEGER DEFAULT 1,
        created_at INTEGER
      )
    `);

    // 分类表
    await runAsync(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        merchant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        sort INTEGER DEFAULT 0,
        created_at INTEGER,
        FOREIGN KEY (merchant_id) REFERENCES merchants(id)
      )
    `);

    // 商品表
    await runAsync(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        merchant_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        price INTEGER NOT NULL,
        stock INTEGER NOT NULL,
        image TEXT,
        on_sale INTEGER DEFAULT 1,
        sort INTEGER DEFAULT 0,
        created_at INTEGER,
        FOREIGN KEY (merchant_id) REFERENCES merchants(id),
        FOREIGN KEY (category_id) REFERENCES categories(id)
      )
    `);

    // 订单表
    await runAsync(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        merchant_id TEXT NOT NULL,
        customer_phone TEXT,
        items TEXT NOT NULL,
        total INTEGER NOT NULL,
        status TEXT DEFAULT 'unpaid',
        pay_method TEXT,
        pickup_code TEXT,
        order_no TEXT,
        note TEXT,
        created_at INTEGER,
        FOREIGN KEY (merchant_id) REFERENCES merchants(id)
      )
    `);

    console.log('✅ 数据库表初始化完成');
  } catch (e) {
    if (!e.message.includes('already exists')) {
      console.error('❌ 初始化数据库失败:', e.message);
    }
  }
}

// ==================== 密码和 Token ====================
function hashPassword(pwd) {
  return crypto.createHash('sha256').update(pwd + 'salt_web_shop').digest('hex');
}

function verifyPassword(pwd, hash) {
  return hashPassword(pwd) === hash;
}

function signToken(extra = {}) {
  const payload = { ...extra, exp: Date.now() + 7 * 24 * 3600 * 1000 };
  const json = JSON.stringify(payload);
  const sig = crypto
    .createHmac('sha256', 'secret_key_web_shop')
    .update(json)
    .digest('base64url');
  return Buffer.from(json).toString('base64url') + '.' + sig;
}

function verifyToken(token) {
  try {
    const [payload, sig] = String(token).split('.');
    if (!payload || !sig) return null;
    const json = Buffer.from(payload, 'base64url').toString();
    const expected = crypto
      .createHmac('sha256', 'secret_key_web_shop')
      .update(json)
      .digest('base64url');
    if (sig !== expected) return null;
    const data = JSON.parse(json);
    return data.exp > Date.now() ? data : null;
  } catch (e) {
    return null;
  }
}

// ==================== 工具函数 ====================
function genId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function genOrderNo(merchantId) {
  const m = new Date().getMonth() + 1;
  const d = new Date().getDate();
  return `${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
}

function genPickupCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

// ==================== 导出 ====================
module.exports = {
  getDb,
  initDb,
  runAsync,
  getAsync,
  allAsync,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  genId,
  genOrderNo,
  genPickupCode,
};
