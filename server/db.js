const crypto = require('crypto');
const pg = require('pg');
const SCHEMA = require('./schema');

const { Pool, types } = pg;

// Postgres 的 BIGINT 默认以字符串返回，而 created_at 存的是毫秒时间戳，
// 前端要直接 new Date() / 比较大小，所以统一解析成 number（值远小于 2^53）
types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// 空闲连接被数据库单方面断开时，不把它抛成进程级未捕获异常
pool.on('error', (err) => console.error('Idle Postgres client error:', err.message));

// 业务 SQL 沿用 `?` 占位，这里统一转成 Postgres 的 $n
function toPg(sql) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

async function runAsync(sql, params = []) {
  const res = await pool.query(toPg(sql), params);
  return { changes: res.rowCount };
}

async function getAsync(sql, params = []) {
  const res = await pool.query(toPg(sql), params);
  return res.rows[0];
}

async function allAsync(sql, params = []) {
  const res = await pool.query(toPg(sql), params);
  return res.rows;
}

// 下单扣库存、取消退库存这类多语句操作必须原子完成
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bound = {
      run: async (sql, params = []) => ({ changes: (await client.query(toPg(sql), params)).rowCount }),
      get: async (sql, params = []) => (await client.query(toPg(sql), params)).rows[0],
      all: async (sql, params = []) => (await client.query(toPg(sql), params)).rows,
    };
    const result = await fn(bound);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

let schemaReady = null;
function ensureDb() {
  if (!schemaReady) {
    schemaReady = pool.query(SCHEMA).catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

// ==================== 密码与 Token ====================

function tokenSecret() {
  const secret = process.env.TOKEN_SECRET;
  if (!secret) throw new Error('缺少环境变量 TOKEN_SECRET');
  return secret;
}

function hashPassword(pwd) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pwd), salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(pwd, stored) {
  const [scheme, saltHex, hashHex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(pwd), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function signToken(extra = {}) {
  const body = Buffer.from(JSON.stringify({ ...extra, exp: Date.now() + 7 * 24 * 3600 * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', tokenSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  try {
    const [body, sig] = String(token).split('.');
    if (!body || !sig) return null;
    const expected = Buffer.from(crypto.createHmac('sha256', tokenSecret()).update(body).digest('base64url'));
    const actual = Buffer.from(sig);
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    return data.exp > Date.now() ? data : null;
  } catch (e) {
    return null;
  }
}

// ==================== 工具函数 ====================

function genId(prefix = 'id') {
  return `${prefix}_${crypto.randomUUID()}`;
}

function genOrderNo() {
  const d = new Date();
  const serial = crypto.randomBytes(3).readUIntBE(0, 3).toString(36).toUpperCase().padStart(5, '0');
  return `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${serial}`;
}

module.exports = {
  ensureDb,
  runAsync,
  getAsync,
  allAsync,
  tx,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  genId,
  genOrderNo,
};
