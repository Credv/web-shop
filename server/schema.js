// 表结构内联为 JS 字符串：Netlify 用 esbuild 打包函数，运行时读不到额外的 .sql 文件
// 布尔语义的列统一用 INTEGER 存 0/1，与前端既有的 `!!value` 判断保持一致
module.exports = `
CREATE TABLE IF NOT EXISTS merchants (
  id             TEXT PRIMARY KEY,
  phone          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  name           TEXT NOT NULL DEFAULT '小店',
  announcement   TEXT NOT NULL DEFAULT '',
  avatar         TEXT NOT NULL DEFAULT '',
  wechat_code    TEXT NOT NULL DEFAULT '',
  alipay_code    TEXT NOT NULL DEFAULT '',
  open           INTEGER NOT NULL DEFAULT 1,
  pickup_seq     INTEGER NOT NULL DEFAULT 0,
  created_at     BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id           TEXT PRIMARY KEY,
  merchant_id  TEXT NOT NULL,
  name         TEXT NOT NULL,
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id           TEXT PRIMARY KEY,
  merchant_id  TEXT NOT NULL,
  category_id  TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  price        INTEGER NOT NULL,
  stock        INTEGER NOT NULL DEFAULT 0,
  image        TEXT NOT NULL DEFAULT '',
  on_sale      INTEGER NOT NULL DEFAULT 1,
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id              TEXT PRIMARY KEY,
  merchant_id     TEXT NOT NULL,
  customer_phone  TEXT NOT NULL DEFAULT '',
  items           TEXT NOT NULL,
  total           INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'unpaid',
  pay_method      TEXT,
  pickup_code     TEXT,
  order_no        TEXT,
  note            TEXT NOT NULL DEFAULT '',
  created_at      BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_merchant ON products (merchant_id, on_sale);
CREATE INDEX IF NOT EXISTS idx_categories_merchant ON categories (merchant_id, sort);
CREATE INDEX IF NOT EXISTS idx_orders_merchant ON orders (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_phone, created_at DESC);
`;
