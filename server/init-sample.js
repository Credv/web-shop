// 写入示例分类与商品（仅当数据为空时），方便快速体验
const db = require('./db');

const d = db.getData();
if (d.categories.length === 0 && d.products.length === 0) {
  d.categories.push(
    { id: 'c-drinks', name: '饮品' },
    { id: 'c-snacks', name: '小吃' },
    { id: 'c-staple', name: '主食' }
  );
  d.products.push(
    { id: 'p1', categoryId: 'c-drinks', name: '手打柠檬茶', description: '冰爽解腻，现打现卖', price: 800, image: '', stock: 50, onSale: true, sort: 1 },
    { id: 'p2', categoryId: 'c-drinks', name: '冰镇酸梅汤', description: '古法熬制，酸甜开胃', price: 600, image: '', stock: 40, onSale: true, sort: 2 },
    { id: 'p3', categoryId: 'c-snacks', name: '烤肠', description: '纯肉烤肠，外焦里嫩', price: 500, image: '', stock: 60, onSale: true, sort: 1 },
    { id: 'p4', categoryId: 'c-snacks', name: '狼牙土豆', description: '麻辣/糖醋可选，下单请备注口味', price: 700, image: '', stock: 30, onSale: true, sort: 2 },
    { id: 'p5', categoryId: 'c-staple', name: '炒粉', description: '猛火现炒，加蛋+2元', price: 1200, image: '', stock: 25, onSale: true, sort: 1 },
    { id: 'p6', categoryId: 'c-staple', name: '炒面', description: '猛火现炒', price: 1200, image: '', stock: 0, onSale: true, sort: 2 }
  );
  db.save();
  console.log('✅ 示例分类与商品已写入');
} else {
  console.log('已有商品数据，跳过示例写入');
}
