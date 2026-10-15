const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { getStore } = require('@netlify/blobs');
const db = require('./db');

const app = express();

const BLOB_STORE = 'shop-uploads';
const IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const ORDER_STATUSES = ['paid', 'ready', 'done', 'cancelled'];

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function uploads() {
  return getStore(BLOB_STORE);
}

// Netlify 把 /api/* 与 /uploads/* 转发到本函数，进来时路径前缀可能已被剥掉，
// 这里把「剩余路径 / 完整函数路径 / 已带前缀」三种形态统一成 Express 路由认识的写法
app.use((req, res, next) => {
  const index = req.url.indexOf('?');
  const query = index === -1 ? '' : req.url.slice(index);
  let path = index === -1 ? req.url : req.url.slice(0, index);
  if (path.startsWith('/.netlify/functions/api')) path = path.slice('/.netlify/functions/api'.length);
  if (!/^\/(api|uploads)(\/|$)/.test(path)) path = `/api${path === '/' ? '' : path}`;
  req.url = path + query;
  next();
});

app.use(express.json({ limit: '2mb' }));

app.use(async (req, res, next) => {
  try {
    await db.ensureDb();
    next();
  } catch (e) {
    next(e);
  }
});

// ---------- 鉴权中间件 ----------
function adminAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  const payload = db.verifyToken(token);
  if (!payload || !payload.merchant_id) {
    return res.status(401).json({ message: '未登录或登录已过期' });
  }
  req.merchant_id = payload.merchant_id;
  next();
}

function h5Auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  const payload = db.verifyToken(token);
  if (!payload || !payload.phone) {
    return res.status(401).json({ message: '未登录' });
  }
  req.customer_phone = payload.phone;
  next();
}

// 订单存的是下单当时的商品快照，读出即可，无需再回查商品表
function shapeOrder(o) {
  return {
    ...o,
    items: JSON.parse(o.items),
    pickupCode: o.pickup_code,
    orderNo: o.order_no,
    createdAt: o.created_at,
    payMethod: o.pay_method,
    customerPhone: o.customer_phone,
    merchantId: o.merchant_id,
  };
}

// ============================================================
// 图片上传（Netlify Blobs）
// ============================================================

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.post('/api/upload', adminAuth, (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });
    if (!req.file) return res.status(400).json({ message: '未收到文件' });

    const ext = IMAGE_TYPES[req.file.mimetype];
    // 只认白名单里的真实类型，不接受客户端自报的 mimetype
    if (!ext) return res.status(400).json({ message: '仅支持 png/jpg/webp/gif' });

    const key = `${req.merchant_id}/${crypto.randomUUID()}.${ext}`;
    await uploads().set(
      key,
      new Blob([req.file.buffer], { type: req.file.mimetype }),
      { metadata: { contentType: req.file.mimetype } }
    );
    res.json({ url: `/uploads/${key}` });
  });
});

app.get('/uploads/*', async (req, res, next) => {
  try {
    const key = decodeURIComponent(req.params[0] || '');
    const entry = await uploads().getWithMetadata(key, { type: 'arrayBuffer' });
    if (!entry || entry.data === null) return res.status(404).send('Not found');
    res.set('Content-Type', (entry.metadata && entry.metadata.contentType) || 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(Buffer.from(entry.data));
  } catch (e) {
    next(e);
  }
});

// ============================================================
// 商家后台 API
// ============================================================

app.post('/api/admin/login', async (req, res, next) => {
  try {
    const { phone, password } = req.body || {};
    if (!phone || !password) return res.status(400).json({ message: '手机号和密码不能为空' });

    const merchant = await db.getAsync('SELECT * FROM merchants WHERE phone = ?', [phone]);
    if (!merchant || !db.verifyPassword(password, merchant.password_hash)) {
      return res.status(400).json({ message: '手机号或密码错误' });
    }

    res.json({ token: db.signToken({ merchant_id: merchant.id, phone }), merchant_id: merchant.id });
  } catch (e) {
    next(e);
  }
});

app.post('/api/admin/register', async (req, res, next) => {
  try {
    const { phone, password, name } = req.body || {};
    if (!/^1\d{10}$/.test(String(phone || ''))) return res.status(400).json({ message: '手机号格式不正确' });
    if (String(password || '').length < 6) return res.status(400).json({ message: '密码至少 6 位' });

    const exist = await db.getAsync('SELECT id FROM merchants WHERE phone = ?', [phone]);
    if (exist) return res.status(400).json({ message: '该手机号已注册' });

    const merchant_id = db.genId('merchant');
    await db.runAsync(
      'INSERT INTO merchants (id, phone, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)',
      [merchant_id, phone, db.hashPassword(password), String(name || '小店').slice(0, 40), Date.now()]
    );

    res.json({ token: db.signToken({ merchant_id, phone }), merchant_id });
  } catch (e) {
    next(e);
  }
});

app.get('/api/admin/info', adminAuth, async (req, res, next) => {
  try {
    const merchant = await db.getAsync('SELECT * FROM merchants WHERE id = ?', [req.merchant_id]);
    if (!merchant) return res.status(404).json({ message: '商家不存在' });
    const { password_hash, ...safe } = merchant;
    res.json({ ...safe, wechatPay: merchant.wechat_code, alipayPay: merchant.alipay_code });
  } catch (e) {
    next(e);
  }
});

app.patch('/api/admin/info', adminAuth, async (req, res, next) => {
  try {
    const { name, open, wechat_code, alipay_code, wechatPay, alipayPay, announcement, avatar } = req.body || {};
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(String(name).slice(0, 40));
    }
    if (open !== undefined) {
      updates.push('open = ?');
      params.push(open ? 1 : 0);
    }
    if (announcement !== undefined) {
      updates.push('announcement = ?');
      params.push(String(announcement).slice(0, 200));
    }
    if (avatar !== undefined) {
      updates.push('avatar = ?');
      params.push(String(avatar).slice(0, 500));
    }
    const wcCode = wechat_code !== undefined ? wechat_code : wechatPay;
    if (wcCode !== undefined) {
      updates.push('wechat_code = ?');
      params.push(String(wcCode).slice(0, 500));
    }
    const apCode = alipay_code !== undefined ? alipay_code : alipayPay;
    if (apCode !== undefined) {
      updates.push('alipay_code = ?');
      params.push(String(apCode).slice(0, 500));
    }

    if (!updates.length) return res.status(400).json({ message: '未提供任何更新字段' });

    params.push(req.merchant_id);
    await db.runAsync(`UPDATE merchants SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json(await db.getAsync('SELECT * FROM merchants WHERE id = ?', [req.merchant_id]));
  } catch (e) {
    next(e);
  }
});

// ---------- 分类 ----------
const listCategories = (merchantId) =>
  db.allAsync('SELECT * FROM categories WHERE merchant_id = ? ORDER BY sort DESC, created_at', [merchantId]);

app.get('/api/admin/categories', adminAuth, async (req, res, next) => {
  try {
    res.json(await listCategories(req.merchant_id));
  } catch (e) {
    next(e);
  }
});

app.post('/api/admin/categories', adminAuth, async (req, res, next) => {
  try {
    const name = String((req.body || {}).name || '').trim();
    if (!name) return res.status(400).json({ message: '分类名不能为空' });

    await db.runAsync(
      'INSERT INTO categories (id, merchant_id, name, sort, created_at) VALUES (?, ?, ?, ?, ?)',
      [db.genId('cat'), req.merchant_id, name.slice(0, 20), Number((req.body || {}).sort) || 0, Date.now()]
    );
    res.json(await listCategories(req.merchant_id));
  } catch (e) {
    next(e);
  }
});

app.delete('/api/admin/categories/:id', adminAuth, async (req, res, next) => {
  try {
    await db.runAsync('DELETE FROM categories WHERE id = ? AND merchant_id = ?', [req.params.id, req.merchant_id]);
    res.json(await listCategories(req.merchant_id));
  } catch (e) {
    next(e);
  }
});

// ---------- 商品 ----------
const listProducts = (merchantId) =>
  db.allAsync('SELECT * FROM products WHERE merchant_id = ? ORDER BY sort DESC, created_at', [merchantId]);

app.get('/api/admin/products', adminAuth, async (req, res, next) => {
  try {
    res.json(await listProducts(req.merchant_id));
  } catch (e) {
    next(e);
  }
});

app.post('/api/admin/products', adminAuth, async (req, res, next) => {
  try {
    const { id, name, categoryId, description, price, stock, onSale, image, sort } = req.body || {};
    if (!name || !categoryId) return res.status(400).json({ message: '商品名和分类不能为空' });

    const priceCents = Math.round(Number(price) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 0) return res.status(400).json({ message: '价格不合法' });
    const stockNum = Math.max(0, Math.floor(Number(stock) || 0));

    if (id) {
      await db.runAsync(
        `UPDATE products SET name = ?, category_id = ?, description = ?, price = ?, stock = ?, on_sale = ?, image = ?, sort = ?
         WHERE id = ? AND merchant_id = ?`,
        [
          String(name).slice(0, 40),
          categoryId,
          String(description || '').slice(0, 200),
          priceCents,
          stockNum,
          onSale ? 1 : 0,
          String(image || '').slice(0, 500),
          Number(sort) || 0,
          id,
          req.merchant_id,
        ]
      );
    } else {
      await db.runAsync(
        `INSERT INTO products (id, merchant_id, category_id, name, description, price, stock, image, on_sale, sort, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          db.genId('p'),
          req.merchant_id,
          categoryId,
          String(name).slice(0, 40),
          String(description || '').slice(0, 200),
          priceCents,
          stockNum,
          String(image || '').slice(0, 500),
          onSale ? 1 : 0,
          Number(sort) || 0,
          Date.now(),
        ]
      );
    }
    res.json(await listProducts(req.merchant_id));
  } catch (e) {
    next(e);
  }
});

app.delete('/api/admin/products/:id', adminAuth, async (req, res, next) => {
  try {
    await db.runAsync('DELETE FROM products WHERE id = ? AND merchant_id = ?', [req.params.id, req.merchant_id]);
    res.json(await listProducts(req.merchant_id));
  } catch (e) {
    next(e);
  }
});

// ---------- 订单 ----------
const listOrders = (merchantId) =>
  db.allAsync('SELECT * FROM orders WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 200', [merchantId]);

app.get('/api/admin/orders', adminAuth, async (req, res, next) => {
  try {
    res.json((await listOrders(req.merchant_id)).map(shapeOrder));
  } catch (e) {
    next(e);
  }
});

app.patch('/api/admin/orders/:id', adminAuth, async (req, res, next) => {
  try {
    const status = String((req.body || {}).status || '');
    if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ message: '订单状态不合法' });

    await db.tx(async (t) => {
      const order = await t.get('SELECT * FROM orders WHERE id = ? AND merchant_id = ?', [
        req.params.id,
        req.merchant_id,
      ]);
      if (!order) throw httpError(404, '订单不存在');
      if (order.status === status) return;

      // 下单时已扣库存，所以首次转为取消就要退回去
      if (status === 'cancelled' && order.status !== 'cancelled') {
        for (const item of JSON.parse(order.items)) {
          await t.run('UPDATE products SET stock = stock + ? WHERE id = ? AND merchant_id = ?', [
            item.qty,
            item.productId,
            req.merchant_id,
          ]);
        }
      }

      await t.run('UPDATE orders SET status = ? WHERE id = ? AND merchant_id = ?', [
        status,
        req.params.id,
        req.merchant_id,
      ]);
    });

    res.json((await listOrders(req.merchant_id)).map(shapeOrder));
  } catch (e) {
    next(e);
  }
});

// ============================================================
// H5 顾客端 API
// ============================================================

app.get('/api/shop/:merchantId/info', async (req, res, next) => {
  try {
    const merchant = await db.getAsync('SELECT * FROM merchants WHERE id = ?', [req.params.merchantId]);
    if (!merchant) return res.status(404).json({ message: '店铺不存在' });

    const [categories, products] = await Promise.all([
      db.allAsync('SELECT id, name FROM categories WHERE merchant_id = ? ORDER BY sort DESC', [req.params.merchantId]),
      db.allAsync('SELECT * FROM products WHERE merchant_id = ? AND on_sale = 1 ORDER BY sort DESC', [
        req.params.merchantId,
      ]),
    ]);

    res.json({
      merchant: {
        id: merchant.id,
        name: merchant.name,
        open: !!merchant.open,
        announcement: merchant.announcement,
        avatar: merchant.avatar,
        wechat_code: merchant.wechat_code,
        alipay_code: merchant.alipay_code,
      },
      categories,
      products,
      settings: {
        open: !!merchant.open,
        wechatPay: merchant.wechat_code,
        alipayPay: merchant.alipay_code,
      },
    });
  } catch (e) {
    next(e);
  }
});

app.post('/api/h5/login', async (req, res, next) => {
  try {
    const phone = String((req.body || {}).phone || '').trim();
    if (!/^1\d{10}$/.test(phone)) return res.status(400).json({ message: '手机号格式不正确' });
    res.json({ token: db.signToken({ phone }), phone });
  } catch (e) {
    next(e);
  }
});

app.get('/api/h5/orders', h5Auth, async (req, res, next) => {
  try {
    const orders = await db.allAsync(
      'SELECT * FROM orders WHERE customer_phone = ? ORDER BY created_at DESC LIMIT 100',
      [req.customer_phone]
    );
    res.json(orders.map(shapeOrder));
  } catch (e) {
    next(e);
  }
});

app.get('/api/h5/orders/:merchantId', h5Auth, async (req, res, next) => {
  try {
    const orders = await db.allAsync(
      'SELECT * FROM orders WHERE merchant_id = ? AND customer_phone = ? ORDER BY created_at DESC LIMIT 100',
      [req.params.merchantId, req.customer_phone]
    );
    res.json(orders.map(shapeOrder));
  } catch (e) {
    next(e);
  }
});

app.get('/api/shop/:merchantId/orders/:orderId', async (req, res, next) => {
  try {
    const order = await db.getAsync('SELECT * FROM orders WHERE id = ? AND merchant_id = ?', [
      req.params.orderId,
      req.params.merchantId,
    ]);
    if (!order) return res.status(404).json({ message: '订单不存在' });
    res.json(shapeOrder(order));
  } catch (e) {
    next(e);
  }
});

app.post('/api/shop/:merchantId/orders', async (req, res, next) => {
  try {
    const { items, phone, payMethod, note } = req.body || {};
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ message: '订单商品不能为空' });

    const wanted = new Map();
    for (const item of items) {
      const qty = Math.floor(Number(item && item.qty));
      const productId = item && item.productId;
      if (!productId || !Number.isFinite(qty) || qty <= 0 || qty > 99) {
        return res.status(400).json({ message: '商品数量不合法' });
      }
      wanted.set(productId, (wanted.get(productId) || 0) + qty);
    }

    const customerPhone = /^1\d{10}$/.test(String(phone || '')) ? String(phone) : '';
    if (!['wechat', 'alipay'].includes(payMethod)) return res.status(400).json({ message: '支付方式不合法' });

    // 价格、库存、归属全部以数据库为准，客户端传的 total 不参与结算
    const order = await db.tx(async (t) => {
      const merchant = await t.get('SELECT id, open FROM merchants WHERE id = ?', [req.params.merchantId]);
      if (!merchant) throw httpError(404, '店铺不存在');
      if (!merchant.open) throw httpError(409, '店铺已打烊');

      const products = await t.all(
        'SELECT id, name, price, image, on_sale FROM products WHERE merchant_id = ? AND id = ANY(?)',
        [req.params.merchantId, [...wanted.keys()]]
      );
      const byId = new Map(products.map((p) => [p.id, p]));

      const snapshot = [];
      let total = 0;
      for (const [productId, qty] of wanted) {
        const product = byId.get(productId);
        if (!product) throw httpError(400, '商品不存在');
        if (!product.on_sale) throw httpError(409, `${product.name} 已下架`);

        const dec = await t.run(
          'UPDATE products SET stock = stock - ? WHERE id = ? AND merchant_id = ? AND stock >= ?',
          [qty, productId, req.params.merchantId, qty]
        );
        if (dec.changes === 0) throw httpError(409, `${product.name} 库存不足`);

        total += product.price * qty;
        snapshot.push({
          productId,
          name: product.name,
          price: product.price,
          image: product.image || null,
          qty,
        });
      }

      const seq = await t.get('UPDATE merchants SET pickup_seq = pickup_seq + 1 WHERE id = ? RETURNING pickup_seq', [
        req.params.merchantId,
      ]);
      const id = db.genId('order');
      const pickupCode = String(seq.pickup_seq).padStart(2, '0');
      const orderNo = db.genOrderNo();

      await t.run(
        `INSERT INTO orders (id, merchant_id, customer_phone, items, total, status, pay_method, pickup_code, order_no, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          req.params.merchantId,
          customerPhone,
          JSON.stringify(snapshot),
          total,
          'unpaid',
          payMethod,
          pickupCode,
          orderNo,
          String(note || '').slice(0, 200),
          Date.now(),
        ]
      );

      return { id, orderNo, pickupCode, total, status: 'unpaid' };
    });

    res.status(201).json(order);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    next(e);
  }
});

app.patch('/api/shop/:merchantId/orders/:orderId/pay', async (req, res, next) => {
  try {
    const updated = await db.runAsync(
      "UPDATE orders SET status = 'paid' WHERE id = ? AND merchant_id = ? AND status = 'unpaid'",
      [req.params.orderId, req.params.merchantId]
    );
    if (updated.changes === 0) return res.status(409).json({ message: '订单状态已变更，请刷新' });
    res.json({ status: 'paid' });
  } catch (e) {
    next(e);
  }
});

// ---------- 统一兜底 ----------
app.use((req, res) => res.status(404).json({ message: '接口不存在' }));

app.use((err, req, res, _next) => {
  console.error(err);
  const status = err.type === 'entity.too.large' ? 413 : err.status || 500;
  res.status(status).json({ message: status === 500 ? '服务器内部错误' : err.message });
});

module.exports = app;
