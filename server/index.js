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

// ---------- 登录鉴权 ----------
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  if (!db.verifyToken(token)) {
    return res.status(401).json({ message: '未登录或登录已过期' });
  }
  next();
}

// ---------- 图片上传（商品图 / 头像 / 收款码） ----------
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

app.post('/api/upload', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: '未收到文件' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// ============================================================
// 用户端（H5）接口
// ============================================================

// 店铺信息 + 分类 + 在售商品
app.get('/api/shop/info', (req, res) => {
  const d = db.getData();
  res.json({
    settings: {
      shopName: d.settings.shopName,
      avatar: d.settings.avatar,
      announcement: d.settings.announcement,
      open: d.settings.open,
      wechatPay: d.settings.wechatPay,
      alipayPay: d.settings.alipayPay,
    },
    categories: d.categories,
    products: d.products
      .filter((p) => p.onSale)
      .sort((a, b) => (a.sort || 0) - (b.sort || 0)),
  });
});

// 创建订单（下单即扣库存）
app.post('/api/orders', (req, res) => {
  const d = db.getData();
  if (!d.settings.open) {
    return res.status(400).json({ message: '本店暂时休息中，暂不支持下单' });
  }
  const { items, note, phone, payMethod } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: '购物车为空' });
  }
  if (phone && !/^1\d{10}$/.test(phone)) {
    return res.status(400).json({ message: '手机号格式不正确' });
  }
  if (!['wechat', 'alipay'].includes(payMethod)) {
    return res.status(400).json({ message: '请选择支付方式' });
  }
  if (payMethod === 'wechat' && !d.settings.wechatPay) {
    return res.status(400).json({ message: '商家暂未配置微信收款码' });
  }
  if (payMethod === 'alipay' && !d.settings.alipayPay) {
    return res.status(400).json({ message: '商家暂未配置支付宝收款码' });
  }

  const orderItems = [];
  let total = 0;
  for (const it of items) {
    const product = d.products.find((p) => p.id === it.productId);
    if (!product || !product.onSale) {
      return res.status(400).json({ message: '部分商品已下架，请刷新后重试' });
    }
    const qty = Math.max(1, Math.min(parseInt(it.qty, 10) || 0, 99));
    if (qty > product.stock) {
      return res
        .status(400)
        .json({ message: `「${product.name}」库存不足，仅剩 ${product.stock} 份` });
    }
    orderItems.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      qty,
    });
    total += product.price * qty;
  }

  for (const it of orderItems) {
    const product = d.products.find((p) => p.id === it.productId);
    product.stock -= it.qty;
  }

  const order = {
    id: crypto.randomUUID(),
    orderNo: db.nextOrderNo(),
    pickupCode: db.genPickupCode(),
    status: 'unpaid',
    items: orderItems,
    total,
    note: (note || '').slice(0, 100),
    phone: phone || '',
    payMethod,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  d.orders.unshift(order);
  db.save();
  res.json(order);
});

// 用户确认「我已支付」
app.post('/api/orders/:id/paid', (req, res) => {
  const order = db.getData().orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ message: '订单不存在' });
  if (order.status !== 'unpaid') {
    return res.status(400).json({ message: '订单状态已变化，请刷新' });
  }
  order.status = 'paid';
  order.updatedAt = Date.now();
  db.save();
  res.json(order);
});

// 查询订单详情（用户凭订单 id 轮询状态）
app.get('/api/orders/:id', (req, res) => {
  const order = db.getData().orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ message: '订单不存在' });
  res.json(order);
});

// ---------- H5 顾客手机号登录（可选，登录后订单历史存服务器） ----------
function h5Auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  const payload = db.verifyToken(token);
  if (!payload || !payload.phone) {
    return res.status(401).json({ message: '未登录' });
  }
  req.h5Phone = payload.phone;
  next();
}

app.post('/api/h5/login', (req, res) => {
  const body = req.body || {};
  const phone = String(body.phone || '').trim();
  if (!/^1\d{10}$/.test(phone)) {
    return res.status(400).json({ message: '手机号格式不正确' });
  }
  // 认领本机历史订单（仅限未留手机号的订单，避免覆盖他人订单）
  const claimIds = Array.isArray(body.claimIds) ? body.claimIds : [];
  const d = db.getData();
  let claimed = 0;
  for (const id of claimIds) {
    const order = d.orders.find((o) => o.id === id);
    if (order && !order.phone) {
      order.phone = phone;
      claimed += 1;
    }
  }
  if (claimed > 0) db.save();
  res.json({ token: db.signToken({ phone }), phone });
});

app.get('/api/h5/orders', h5Auth, (req, res) => {
  res.json(db.getData().orders.filter((o) => o.phone === req.h5Phone));
});

// ============================================================
// 商家后台接口（需登录）
// ============================================================

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (!db.checkPassword(password || '')) {
    return res.status(400).json({ message: '密码不正确' });
  }
  res.json({ token: db.signToken() });
});

// ---------- 订单 ----------
app.get('/api/admin/orders', auth, (req, res) => {
  res.json(db.getData().orders);
});

app.patch('/api/admin/orders/:id', auth, (req, res) => {
  const ALLOWED = ['unpaid', 'paid', 'making', 'ready', 'done', 'cancelled'];
  const { status } = req.body || {};
  if (!ALLOWED.includes(status)) {
    return res.status(400).json({ message: '非法状态' });
  }
  const d = db.getData();
  const order = d.orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ message: '订单不存在' });
  if (order.status === status) return res.json(order);
  // 取消订单退回库存
  if (status === 'cancelled') {
    for (const it of order.items) {
      const p = d.products.find((p) => p.id === it.productId);
      if (p) p.stock += it.qty;
    }
  }
  order.status = status;
  order.updatedAt = Date.now();
  db.save();
  res.json(order);
});

// ---------- 分类 ----------
app.get('/api/admin/categories', auth, (req, res) => {
  res.json(db.getData().categories);
});

app.post('/api/admin/categories', auth, (req, res) => {
  const d = db.getData();
  const name = String((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ message: '分类名称不能为空' });
  if (d.categories.some((c) => c.name === name)) {
    return res.status(400).json({ message: '分类已存在' });
  }
  d.categories.push({ id: crypto.randomUUID(), name });
  db.save();
  res.json(d.categories);
});

app.put('/api/admin/categories/:id', auth, (req, res) => {
  const d = db.getData();
  const cat = d.categories.find((c) => c.id === req.params.id);
  if (!cat) return res.status(404).json({ message: '分类不存在' });
  const name = String((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ message: '分类名称不能为空' });
  if (d.categories.some((c) => c.name === name && c.id !== cat.id)) {
    return res.status(400).json({ message: '分类已存在' });
  }
  cat.name = name;
  db.save();
  res.json(d.categories);
});

// 整体调整分类顺序
app.put('/api/admin/categories', auth, (req, res) => {
  const d = db.getData();
  const order = ((req.body || {}).categories || []).map((c) => c.id);
  d.categories.sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  db.save();
  res.json(d.categories);
});

app.delete('/api/admin/categories/:id', auth, (req, res) => {
  const d = db.getData();
  if (d.products.some((p) => p.categoryId === req.params.id)) {
    return res.status(400).json({ message: '该分类下还有商品，请先删除或移动商品' });
  }
  d.categories = d.categories.filter((c) => c.id !== req.params.id);
  db.save();
  res.json(d.categories);
});

// ---------- 商品 ----------
app.get('/api/admin/products', auth, (req, res) => {
  res.json(db.getData().products);
});

function parseProductBody(body) {
  const name = String(body.name || '').trim();
  if (!name) throw new Error('商品名称不能为空');
  const categoryId = body.categoryId;
  if (!db.getData().categories.some((c) => c.id === categoryId)) {
    throw new Error('请选择有效分类');
  }
  const price = parseInt(body.price, 10);
  if (!(price >= 0)) throw new Error('价格不能为负数');
  const stock = parseInt(body.stock, 10);
  if (!(stock >= 0)) throw new Error('库存不能为负数');
  return {
    name,
    categoryId,
    price,
    stock,
    description: String(body.description || '').slice(0, 100),
    image: String(body.image || ''),
    onSale: body.onSale !== false,
    sort: parseInt(body.sort, 10) || 0,
  };
}

app.post('/api/admin/products', auth, (req, res) => {
  const d = db.getData();
  let fields;
  try {
    fields = parseProductBody(req.body || {});
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
  const product = { id: crypto.randomUUID(), ...fields };
  d.products.push(product);
  db.save();
  res.json(product);
});

app.put('/api/admin/products/:id', auth, (req, res) => {
  const d = db.getData();
  const product = d.products.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ message: '商品不存在' });
  try {
    const fields = parseProductBody({ ...product, ...(req.body || {}) });
    Object.assign(product, fields);
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
  db.save();
  res.json(product);
});

app.delete('/api/admin/products/:id', auth, (req, res) => {
  const d = db.getData();
  d.products = d.products.filter((p) => p.id !== req.params.id);
  db.save();
  res.json({ ok: true });
});

// ---------- 店铺设置 ----------
app.get('/api/admin/settings', auth, (req, res) => {
  res.json(db.getData().settings);
});

app.put('/api/admin/settings', auth, (req, res) => {
  const s = db.getData().settings;
  const b = req.body || {};
  ['shopName', 'announcement', 'avatar', 'wechatPay', 'alipayPay'].forEach((k) => {
    if (typeof b[k] === 'string') s[k] = b[k];
  });
  if (typeof b.open === 'boolean') s.open = b.open;
  db.save();
  res.json(s);
});

// ---------- 修改密码 ----------
app.patch('/api/admin/password', auth, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!db.checkPassword(oldPassword || '')) {
    return res.status(400).json({ message: '原密码不正确' });
  }
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ message: '新密码至少 6 位' });
  }
  db.setPassword(newPassword);
  res.json({ ok: true });
});

// ============================================================
// 静态资源（构建产物）与 SPA 回退
// ============================================================
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.use((req, res, next) => {
    if (
      req.method === 'GET' &&
      !req.path.startsWith('/api') &&
      !req.path.startsWith('/uploads')
    ) {
      return res.sendFile(path.join(DIST_DIR, 'index.html'));
    }
    next();
  });
} else {
  app.get('/', (req, res) =>
    res.send('前端尚未构建：开发请使用 npm run dev，部署请先执行 npm run build')
  );
}

// 统一错误处理
app.use((err, req, res, next) => {
  res.status(400).json({ message: err.message || '服务器错误' });
});

app.listen(PORT, () => {
  console.log(`✅ 小店服务已启动: http://localhost:${PORT}`);
  console.log(`   用户端 H5:   http://localhost:${PORT}/`);
  console.log(`   商家后台:    http://localhost:${PORT}/admin`);
});
