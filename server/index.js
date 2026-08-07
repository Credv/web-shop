const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3900;
const ROOT = path.join(__dirname, '..');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DIST_DIR = path.join(ROOT, 'dist');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

// ---------- 初始化数据库 ----------
db.initDb().catch(console.error);

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

// ---------- 图片上传 ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10) || '.png';
    cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('仅支持上传图片'));
  },
});

app.post('/api/upload', adminAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: '未收到文件' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// ============================================================
// 商家后台 API
// ============================================================

// 商家登录
app.post('/api/admin/login', async (req, res) => {
  try {
    const { phone, password } = req.body || {};
    if (!phone || !password) return res.status(400).json({ message: '手机号和密码不能为空' });

    const merchant = await db.getAsync('SELECT * FROM merchants WHERE phone = ?', [phone]);
    if (!merchant || !db.verifyPassword(password, merchant.password_hash)) {
      return res.status(400).json({ message: '手机号或密码错误' });
    }

    const token = db.signToken({ merchant_id: merchant.id, phone });
    res.json({ token, merchant_id: merchant.id });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// 商家注册（手机号+密码）
app.post('/api/admin/register', async (req, res) => {
  try {
    const { phone, password, name } = req.body || {};
    if (!phone || !password) return res.status(400).json({ message: '手机号和密码不能为空' });

    const exist = await db.getAsync('SELECT id FROM merchants WHERE phone = ?', [phone]);
    if (exist) return res.status(400).json({ message: '该手机号已注册' });

    const merchant_id = db.genId('merchant');
    const password_hash = db.hashPassword(password);
    await db.runAsync(
      'INSERT INTO merchants (id, phone, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)',
      [merchant_id, phone, password_hash, name || '小店', Date.now()]
    );

    const token = db.signToken({ merchant_id, phone });
    res.json({ token, merchant_id });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// 商家信息
app.get('/api/admin/info', adminAuth, async (req, res) => {
  try {
    const merchant = await db.getAsync('SELECT * FROM merchants WHERE id = ?', [req.merchant_id]);
    if (!merchant) return res.status(404).json({ message: '商家不存在' });
    // 将数据库字段映射到前端服ἅ的字段名
    res.json({
      ...merchant,
      wechatPay: merchant.wechat_code,
      alipayPay: merchant.alipay_code,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// 更新商家信息（店铺名、营业状态、收款码等）
app.patch('/api/admin/info', adminAuth, async (req, res) => {
  try {
    // 兼容两种字段名：wechat_code 或 wechatPay、alipay_code 或 alipayPay
    const { name, open, wechat_code, alipay_code, wechatPay, alipayPay, announcement, avatar } = req.body || {};
    console.log('🐛 PATCH /api/admin/info - Received:', { name, open, wechat_code, alipay_code, wechatPay, alipayPay, announcement, avatar });  // 🐛 调试：看看后端接收到了什么
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (open !== undefined) {
      updates.push('open = ?');
      params.push(open ? 1 : 0);
    }
    if (announcement !== undefined) {
      updates.push('announcement = ?');
      params.push(announcement);
    }
    if (avatar !== undefined) {
      updates.push('avatar = ?');
      params.push(avatar);
    }
    const wcCode = wechat_code !== undefined ? wechat_code : wechatPay;
    if (wcCode !== undefined) {
      updates.push('wechat_code = ?');
      params.push(wcCode);
    }
    const apCode = alipay_code !== undefined ? alipay_code : alipayPay;
    if (apCode !== undefined) {
      updates.push('alipay_code = ?');
      params.push(apCode);
    }

    if (updates.length === 0) return res.status(400).json({ message: '未提供任何更新字段' });

    params.push(req.merchant_id);
    const sql = `UPDATE merchants SET ${updates.join(', ')} WHERE id = ?`;
    console.log('🐛 SQL:', sql, 'Params:', params);  // 🐛 调试
    await db.runAsync(sql, params);

    const merchant = await db.getAsync('SELECT * FROM merchants WHERE id = ?', [req.merchant_id]);
    console.log('🐛 After update:', merchant);  // 🐛 调试：看看更新后的结果
    res.json(merchant);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// 分类列表
app.get('/api/admin/categories', adminAuth, async (req, res) => {
  try {
    const cats = await db.allAsync(
      'SELECT * FROM categories WHERE merchant_id = ? ORDER BY sort DESC, created_at',
      [req.merchant_id]
    );
    res.json(cats);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// 新增分类
app.post('/api/admin/categories', adminAuth, async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ message: '分类名不能为空' });

    const id = db.genId('cat');
    await db.runAsync(
      'INSERT INTO categories (id, merchant_id, name, sort, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, req.merchant_id, name, 0, Date.now()]
    );

    const cats = await db.allAsync(
      'SELECT * FROM categories WHERE merchant_id = ? ORDER BY sort DESC, created_at',
      [req.merchant_id]
    );
    res.json(cats);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// 删除分类
app.delete('/api/admin/categories/:id', adminAuth, async (req, res) => {
  try {
    await db.runAsync(
      'DELETE FROM categories WHERE id = ? AND merchant_id = ?',
      [req.params.id, req.merchant_id]
    );
    const cats = await db.allAsync(
      'SELECT * FROM categories WHERE merchant_id = ? ORDER BY sort DESC, created_at',
      [req.merchant_id]
    );
    res.json(cats);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// 商品列表
app.get('/api/admin/products', adminAuth, async (req, res) => {
  try {
    const products = await db.allAsync(
      'SELECT * FROM products WHERE merchant_id = ? ORDER BY sort DESC, created_at',
      [req.merchant_id]
    );
    res.json(products);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// 新增/编辑商品
app.post('/api/admin/products', adminAuth, async (req, res) => {
  try {
    const { id, name, categoryId, description, price, stock, onSale, image, sort } = req.body || {};

    if (!name || !categoryId) {
      return res.status(400).json({ message: '商品名和分类不能为空' });
    }

    const priceCents = Math.round(Number(price) * 100);

    if (id) {
      // 编辑
      await db.runAsync(
        `UPDATE products SET name = ?, category_id = ?, description = ?, price = ?, stock = ?, on_sale = ?, image = ?, sort = ? WHERE id = ? AND merchant_id = ?`,
        [name, categoryId, description, priceCents, stock, onSale ? 1 : 0, image, sort, id, req.merchant_id]
      );
    } else {
      // 新增
      const pid = db.genId('p');
      await db.runAsync(
        `INSERT INTO products (id, merchant_id, category_id, name, description, price, stock, image, on_sale, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [pid, req.merchant_id, categoryId, name, description, priceCents, stock, image || '', onSale ? 1 : 0, sort, Date.now()]
      );
    }

    const products = await db.allAsync(
      'SELECT * FROM products WHERE merchant_id = ? ORDER BY sort DESC, created_at',
      [req.merchant_id]
    );
    res.json(products);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// 删除商品
app.delete('/api/admin/products/:id', adminAuth, async (req, res) => {
  try {
    await db.runAsync(
      'DELETE FROM products WHERE id = ? AND merchant_id = ?',
      [req.params.id, req.merchant_id]
    );
    const products = await db.allAsync(
      'SELECT * FROM products WHERE merchant_id = ? ORDER BY sort DESC, created_at',
      [req.merchant_id]
    );
    res.json(products);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// 订单列表
app.get('/api/admin/orders', adminAuth, async (req, res) => {
  try {
    const orders = await db.allAsync(
      'SELECT * FROM orders WHERE merchant_id = ? ORDER BY created_at DESC',
      [req.merchant_id]
    );
    res.json(
      orders.map((o) => ({
        ...o,
        items: JSON.parse(o.items),
      }))
    );
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// 更新订单状态
app.patch('/api/admin/orders/:id', adminAuth, async (req, res) => {
  try {
    const { status } = req.body || {};
    const order = await db.getAsync(
      'SELECT * FROM orders WHERE id = ? AND merchant_id = ?',
      [req.params.id, req.merchant_id]
    );
    if (!order) return res.status(404).json({ message: '订单不存在' });

    // 如果从 paid 改为 cancelled，退库存
    if (order.status === 'paid' && status === 'cancelled') {
      const items = JSON.parse(order.items);
      for (const item of items) {
        await db.runAsync(
          'UPDATE products SET stock = stock + ? WHERE id = ? AND merchant_id = ?',
          [item.qty, item.productId, req.merchant_id]
        );
      }
    }

    await db.runAsync(
      'UPDATE orders SET status = ? WHERE id = ? AND merchant_id = ?',
      [status, req.params.id, req.merchant_id]
    );

    const orders = await db.allAsync(
      'SELECT * FROM orders WHERE merchant_id = ? ORDER BY created_at DESC',
      [req.merchant_id]
    );
    res.json(
      orders.map((o) => ({
        ...o,
        items: JSON.parse(o.items),
      }))
    );
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ============================================================
// H5 用户端 API
// ============================================================

// 获取某商家店铺信息
app.get('/api/shop/:merchantId/info', async (req, res) => {
  try {
    const merchant = await db.getAsync('SELECT * FROM merchants WHERE id = ?', [req.params.merchantId]);
    if (!merchant) return res.status(404).json({ message: '店铺不存在' });

    const categories = await db.allAsync(
      'SELECT id, name FROM categories WHERE merchant_id = ? ORDER BY sort DESC',
      [req.params.merchantId]
    );

    const products = await db.allAsync(
      'SELECT * FROM products WHERE merchant_id = ? AND on_sale = 1 ORDER BY sort DESC',
      [req.params.merchantId]
    );

    res.json({
      merchant: {
        id: merchant.id,
        name: merchant.name,
        open: !!merchant.open,
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
    res.status(500).json({ message: e.message });
  }
});

// H5 用户登录
app.post('/api/h5/login', async (req, res) => {
  try {
    const phone = String((req.body || {}).phone || '').trim();
    if (!/^1\d{10}$/.test(phone)) {
      return res.status(400).json({ message: '手机号格式不正确' });
    }

    const token = db.signToken({ phone });
    res.json({ token, phone });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// H5 获取用户订单历史
// 获取H5用户所有订单（来自所有商家）
app.get('/api/h5/orders', h5Auth, async (req, res) => {
  try {
    const orders = await db.allAsync(
      'SELECT * FROM orders WHERE customer_phone = ? ORDER BY created_at DESC',
      [req.customer_phone]
    );
    // 补充每个订单的商品详情
    const ordersWithDetails = await Promise.all(
      orders.map(async (o) => {
        const items = JSON.parse(o.items);
        const itemsWithDetails = await Promise.all(
          items.map(async (item) => {
            const product = await db.getAsync(
              'SELECT id, name, price, image FROM products WHERE id = ? AND merchant_id = ?',
              [item.productId, o.merchant_id]
            );
            return {
              ...item,
              name: product?.name || '商品已下架',
              price: product?.price || 0,
              image: product?.image || null,
            };
          })
        );
        return { ...o, items: itemsWithDetails };
      })
    );
    res.json(ordersWithDetails);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.get('/api/h5/orders/:merchantId', h5Auth, async (req, res) => {
  try {
    const orders = await db.allAsync(
      'SELECT * FROM orders WHERE merchant_id = ? AND customer_phone = ? ORDER BY created_at DESC',
      [req.params.merchantId, req.customer_phone]
    );
    // 补充每个订单的商品详情
    const ordersWithDetails = await Promise.all(
      orders.map(async (o) => {
        const items = JSON.parse(o.items);
        const itemsWithDetails = await Promise.all(
          items.map(async (item) => {
            const product = await db.getAsync(
              'SELECT id, name, price, image FROM products WHERE id = ? AND merchant_id = ?',
              [item.productId, req.params.merchantId]
            );
            return {
              ...item,
              name: product?.name || '商品已下架',
              price: product?.price || 0,
              image: product?.image || null,
            };
          })
        );
        return { ...o, items: itemsWithDetails };
      })
    );
    res.json(ordersWithDetails);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// 获取单个订单
app.get('/api/shop/:merchantId/orders/:orderId', async (req, res) => {
  try {
    const order = await db.getAsync(
      'SELECT * FROM orders WHERE id = ? AND merchant_id = ?',
      [req.params.orderId, req.params.merchantId]
    );
    if (!order) return res.status(404).json({ message: '订单不存在' });

    // 补充商品详情
    const items = JSON.parse(order.items);
    const itemsWithDetails = await Promise.all(
      items.map(async (item) => {
        const product = await db.getAsync(
          'SELECT id, name, price, image, category_id FROM products WHERE id = ? AND merchant_id = ?',
          [item.productId, req.params.merchantId]
        );
        return {
          ...item,
          name: product?.name || '商品已下架',
          price: product?.price || 0,
          image: product?.image || null,
        };
      })
    );

    res.json({
      ...order,
      items: itemsWithDetails,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// 下单
app.post('/api/shop/:merchantId/orders', async (req, res) => {
  try {
    const { items, total, phone, payMethod, note } = req.body || {};
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: '订单商品不能为空' });
    }

    const merchant = await db.getAsync('SELECT id FROM merchants WHERE id = ?', [req.params.merchantId]);
    if (!merchant) return res.status(404).json({ message: '店铺不存在' });

    const orderId = db.genId('order');
    const orderNo = db.genOrderNo(req.params.merchantId);
    const pickupCode = db.genPickupCode();

    // 扣库存
    for (const item of items) {
      await db.runAsync(
        'UPDATE products SET stock = stock - ? WHERE id = ? AND merchant_id = ?',
        [item.qty, item.productId, req.params.merchantId]
      );
    }

    // 创建订单
    await db.runAsync(
      `INSERT INTO orders (id, merchant_id, customer_phone, items, total, status, pay_method, pickup_code, order_no, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        req.params.merchantId,
        phone || '',
        JSON.stringify(items),
        total,
        'unpaid',
        payMethod || 'wechat',
        pickupCode,
        orderNo,
        note || '',
        Date.now(),
      ]
    );

    res.json({
      id: orderId,
      orderNo,
      pickupCode,
      total,
      status: 'unpaid',
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// H5 用户标记已支付
app.patch('/api/shop/:merchantId/orders/:orderId/pay', async (req, res) => {
  try {
    const order = await db.getAsync(
      'SELECT * FROM orders WHERE id = ? AND merchant_id = ?',
      [req.params.orderId, req.params.merchantId]
    );
    if (!order) return res.status(404).json({ message: '订单不存在' });

    await db.runAsync(
      'UPDATE orders SET status = ? WHERE id = ?',
      ['paid', req.params.orderId]
    );

    res.json({ status: 'paid' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ============================================================
// SPA Fallback + 静态文件
// ============================================================
app.use('/admin', express.static(DIST_DIR));
app.use('/', express.static(DIST_DIR));
app.get('*', (req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 服务器运行在 http://localhost:${PORT}`);
  console.log(`📱 H5 店铺页：http://localhost:${PORT}/`);
  console.log(`🏪 商家后台：http://localhost:${PORT}/admin\n`);
});
