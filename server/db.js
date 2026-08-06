const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function defaultData() {
  return {
    secret: crypto.randomBytes(32).toString('hex'),
    // 默认密码 admin123，请登录后在「店铺设置」中修改
    adminPasswordHash: sha256('admin123'),
    orderSeq: 1,
    settings: {
      shopName: '我的摆摊小店',
      avatar: '',
      announcement: '欢迎光临，扫码即可下单～',
      open: true,
      wechatPay: '',
      alipayPay: '',
    },
    categories: [],
    products: [],
    orders: [],
  };
}

let data;

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DATA_FILE)) {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } else {
    data = defaultData();
    save();
  }
}

function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getData() {
  if (!data) load();
  return data;
}

// ---------- 密码 ----------
function checkPassword(pwd) {
  return sha256(pwd) === getData().adminPasswordHash;
}

function setPassword(pwd) {
  data.adminPasswordHash = sha256(pwd);
  save();
}

// ---------- token（HMAC 签名，有效期 7 天） ----------
function signToken(extra = {}) {
  const payload = { ...extra, exp: Date.now() + 7 * 24 * 3600 * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getData().secret).update(body).digest('base64url');
  return body + '.' + sig;
}

function verifyToken(token) {
  try {
    const [body, sig] = String(token).split('.');
    if (!body || !sig) return null;
    const expect = crypto.createHmac('sha256', getData().secret).update(body).digest('base64url');
    if (sig !== expect) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// ---------- 订单辅助 ----------
function nextOrderNo() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const no = `${mm}${dd}-${String(getData().orderSeq).padStart(3, '0')}`;
  data.orderSeq += 1;
  return no;
}

function genPickupCode() {
  const used = new Set(
    getData()
      .orders.filter((o) => !['done', 'cancelled'].includes(o.status))
      .map((o) => o.pickupCode)
  );
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (used.has(code));
  return code;
}

load();

module.exports = {
  getData,
  save,
  checkPassword,
  setPassword,
  signToken,
  verifyToken,
  nextOrderNo,
  genPickupCode,
};
