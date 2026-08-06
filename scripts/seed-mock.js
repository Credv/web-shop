// 批量写入 mock 商品（通过后台 API），用于测试滚动等效果
// 用法：node scripts/seed-mock.js
const BASE = process.env.BASE || 'http://localhost:3900';

const MOCK = [
  // [分类, 名称, 描述, 价格(分), 库存]
  ['烧烤', '羊肉串', '炭火现烤，孜然辣椒面', 400, 100],
  ['烧烤', '牛肉串', '大片牛肉，炭火现烤', 500, 90],
  ['烧烤', '鸡翅', '蜜汁腌制，外焦里嫩', 600, 60],
  ['烧烤', '烤韭菜', '蒜蓉酱烤制', 500, 40],
  ['烧烤', '烤金针菇', '锡纸蒜蓉', 600, 40],
  ['烧烤', '烤茄子', '蒜蓉铺满整条', 800, 30],
  ['烧烤', '烤面筋', '秘制酱料', 300, 80],
  ['烧烤', '烤鱿鱼须', '铁板炙烤，弹牙', 800, 35],
  ['烧烤', '烤玉米', '甜玉米刷蜂蜜', 500, 50],
  ['烧烤', '烤年糕', '外脆里糯，刷甜辣酱', 500, 45],
  ['甜品', '冰粉', '手搓冰粉，红糖山楂葡萄干', 600, 50],
  ['甜品', '双皮奶', '顺德做法，奶香浓郁', 800, 30],
  ['甜品', '杨枝甘露', '芒果西柚西米露', 1200, 25],
  ['甜品', '红豆刨冰', '绵密冰沙配蜜红豆', 900, 30],
  ['甜品', '鸡蛋仔', '现烤出炉，外脆内软', 800, 40],
  ['甜品', '章鱼小丸子', '6 粒装，木鱼花沙拉酱', 900, 40],
  ['甜品', '提拉米苏杯', '咖啡酒香，冷藏即食', 1500, 20],
  ['甜品', '焦糖布丁', '手工焦糖，入口即化', 700, 25],
  ['饮品', '珍珠奶茶', '现煮珍珠，红茶奶盖可选', 900, 60],
  ['饮品', '椰椰奶冻', '生椰乳配奶冻', 1000, 40],
  ['饮品', '鲜榨西瓜汁', '当季西瓜现榨', 800, 35],
  ['小吃', '炸鸡排', '金黄酥脆，撒梅子粉', 1000, 50],
  ['小吃', '臭豆腐', '长沙风味，配酸萝卜', 800, 45],
  ['小吃', '关东煮（3 串）', '萝卜福袋鱼丸任选', 600, 60],
  ['小吃', '凉皮', '麻酱或辣油拌制', 700, 40],
  ['主食', '烤冷面', '加蛋加肠，东北风味', 1000, 40],
  ['主食', '手抓饼', '加蛋加里脊', 900, 45],
  ['主食', '酸辣粉', '红薯粉现煮，酸辣过瘾', 1000, 35],
];

async function main() {
  const login = await fetch(BASE + '/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin123' }),
  }).then((r) => r.json());
  if (!login.token) throw new Error('登录失败，请确认服务已启动且密码为 admin123');

  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token };

  let cats = await fetch(BASE + '/api/admin/categories', { headers: H }).then((r) => r.json());
  const ensureCat = async (name) => {
    let c = cats.find((c) => c.name === name);
    if (!c) {
      cats = await fetch(BASE + '/api/admin/categories', {
        method: 'POST',
        headers: H,
        body: JSON.stringify({ name }),
      }).then((r) => r.json());
      c = cats.find((c) => c.name === name);
      console.log('新建分类：', name);
    }
    return c.id;
  };

  // 去重：已存在的同名商品跳过
  const existNames = new Set(
    (await fetch(BASE + '/api/admin/products', { headers: H }).then((r) => r.json())).map((p) => p.name)
  );

  let added = 0;
  for (const [cat, name, desc, price, stock] of MOCK) {
    if (existNames.has(name)) continue;
    const categoryId = await ensureCat(cat);
    await fetch(BASE + '/api/admin/products', {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ name, categoryId, description: desc, price, stock, onSale: true, sort: 9, image: '' }),
    }).then((r) => {
      if (!r.ok) throw new Error('创建失败: ' + name);
    });
    added += 1;
  }
  console.log(`✅ 完成，新增 ${added} 个商品（已存在的跳过）`);
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
