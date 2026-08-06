// 初始化测试数据（3 个商家）
const db = require('./db');

async function seed() {
  try {
    await db.initDb();

    // 创建 3 个测试商家
    const merchants = [
      { phone: '13800000001', password: 'admin123', name: '老王烤肠店' },
      { phone: '13800000002', password: 'admin123', name: '小红饮品店' },
      { phone: '13800000003', password: 'admin123', name: '李哥炒面馆' },
    ];

    for (const m of merchants) {
      const exist = await db.getAsync('SELECT id FROM merchants WHERE phone = ?', [m.phone]);
      if (exist) continue;

      const merchant_id = db.genId('merchant');
      const password_hash = db.hashPassword(m.password);

      await db.runAsync(
        'INSERT INTO merchants (id, phone, password_hash, name, open, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [merchant_id, m.phone, password_hash, m.name, 1, Date.now()]
      );

      // 为每个商家创建分类
      const categories = ['主食', '饮品', '小吃'];
      const cat_ids = {};

      for (const cat_name of categories) {
        const cat_id = db.genId('cat');
        cat_ids[cat_name] = cat_id;
        await db.runAsync(
          'INSERT INTO categories (id, merchant_id, name, sort, created_at) VALUES (?, ?, ?, ?, ?)',
          [cat_id, merchant_id, cat_name, 0, Date.now()]
        );
      }

      // 添加商品
      const products = [
        { cat: '主食', name: '炒面', price: 1200, stock: 50 },
        { cat: '主食', name: '炒饭', price: 1200, stock: 40 },
        { cat: '饮品', name: '可乐', price: 500, stock: 100 },
        { cat: '饮品', name: '柠檬茶', price: 800, stock: 60 },
        { cat: '小吃', name: '烤肠', price: 500, stock: 80 },
        { cat: '小吃', name: '鸡翅', price: 600, stock: 40 },
      ];

      for (let i = 0; i < products.length; i++) {
        const p = products[i];
        const pid = db.genId('p');
        await db.runAsync(
          'INSERT INTO products (id, merchant_id, category_id, name, price, stock, on_sale, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [pid, merchant_id, cat_ids[p.cat], p.name, p.price, p.stock, 1, i, Date.now()]
        );
      }

      console.log(`✅ 商家 ${m.name} (${m.phone}) 已创建`);
    }

    console.log('✅ 测试数据初始化完成！');
    console.log('\n测试商家账号：');
    merchants.forEach((m) => {
      console.log(`  手机号：${m.phone}  密码：${m.password}`);
    });
    process.exit(0);
  } catch (e) {
    console.error('❌ 初始化失败:', e.message);
    process.exit(1);
  }
}

seed();
