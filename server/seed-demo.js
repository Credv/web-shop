// 写入演示数据：3 个商家 + 各自的分类与商品（幂等，可重复执行）
// 用法：先配好 DATABASE_URL / TOKEN_SECRET，再 npm run seed
const db = require('./db');

const DEMO = [
  {
    phone: '13800000001',
    password: 'admin123',
    name: '老王烤肠店',
    announcement: '炭火现烤，孜然辣椒面随便加',
    categories: [
      {
        name: '烤串',
        products: [
          { name: '纯肉烤肠', description: '外焦里嫩，咬下去爆汁', price: 500, stock: 60 },
          { name: '羊肉串', description: '炭火现烤，孜然辣椒面', price: 400, stock: 100 },
          { name: '烤鱿鱼须', description: '铁板炙烤，弹牙', price: 800, stock: 35 },
        ],
      },
      {
        name: '饮品',
        products: [
          { name: '冰镇酸梅汤', description: '古法熬制，酸甜开胃', price: 600, stock: 40 },
          { name: '手打柠檬茶', description: '冰爽解腻，现打现卖', price: 800, stock: 50 },
        ],
      },
    ],
  },
  {
    phone: '13800000002',
    password: 'admin123',
    name: '小红饮品店',
    announcement: '下午两点出摊，卖完即止',
    categories: [
      {
        name: '甜品',
        products: [
          { name: '手搓冰粉', description: '红糖山楂葡萄干', price: 600, stock: 50 },
          { name: '杨枝甘露', description: '芒果西柚西米露', price: 1200, stock: 25 },
          { name: '双皮奶', description: '顺德做法，奶香浓郁', price: 800, stock: 30 },
        ],
      },
      {
        name: '茶饮',
        products: [
          { name: '鸭屎香柠檬茶', description: '单丛打底，香气冲', price: 1000, stock: 30 },
          { name: '茉莉奶绿', description: '茉莉绿茶 + 鲜奶', price: 900, stock: 0 },
        ],
      },
    ],
  },
  {
    phone: '13800000003',
    password: 'admin123',
    name: '李哥炒面馆',
    announcement: '猛火现炒，加蛋 +2 元请备注',
    categories: [
      {
        name: '主食',
        products: [
          { name: '炒粉', description: '猛火现炒，加蛋 +2 元', price: 1200, stock: 25 },
          { name: '糖醋炒面', description: '酸甜口，小孩爱吃', price: 1200, stock: 20 },
          { name: '狼牙土豆', description: '麻辣 / 糖醋可选，下单请备注口味', price: 700, stock: 30 },
        ],
      },
    ],
  },
];

async function seed() {
  await db.ensureDb();

  for (const demo of DEMO) {
    const exists = await db.getAsync('SELECT id FROM merchants WHERE phone = ?', [demo.phone]);
    if (exists) {
      console.log(`↷ ${demo.name} 已存在（${exists.id}）`);
      continue;
    }

    const merchant_id = db.genId('merchant');
    await db.runAsync(
      'INSERT INTO merchants (id, phone, password_hash, name, announcement, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [merchant_id, demo.phone, db.hashPassword(demo.password), demo.name, demo.announcement, Date.now()]
    );

    for (const [ci, category] of demo.categories.entries()) {
      const category_id = db.genId('cat');
      await db.runAsync(
        'INSERT INTO categories (id, merchant_id, name, sort, created_at) VALUES (?, ?, ?, ?, ?)',
        [category_id, merchant_id, category.name, ci + 1, Date.now()]
      );
      for (const [pi, product] of category.products.entries()) {
        await db.runAsync(
          `INSERT INTO products (id, merchant_id, category_id, name, description, price, stock, image, on_sale, sort, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, '', 1, ?, ?)`,
          [
            db.genId('p'),
            merchant_id,
            category_id,
            product.name,
            product.description,
            product.price,
            product.stock,
            pi + 1,
            Date.now(),
          ]
        );
      }
    }

    const shop = await db.getAsync('SELECT id, name FROM merchants WHERE id = ?', [merchant_id]);
    console.log(`✅ ${shop.name}  商家ID=${shop.id}  后台=/admin  登录=${demo.phone} / ${demo.password}`);
    console.log(`   点餐链接 /?mid=${shop.id}\n`);
  }

  console.log('\n演示数据就绪。用上面的商家 ID 拼出二维码即可扫码点餐。');
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ 初始化失败:', e.message);
    process.exit(1);
  });
