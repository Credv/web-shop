# web-shop · 多商家扫码点餐平台

一个平台，多个商家自助开店：商家手机号注册 → 后台建分类和商品 → 上传个人收款码 → 下载店铺二维码贴到摊位；顾客扫码进店点单、付款后凭取餐码等餐。前后端同源部署在 Netlify（Functions + Postgres + Blobs），无独立服务器。

**顾客端 H5**

- 店铺首页：分类导航 + 商品列表滚动联动、营业状态、库存与售罄校验
- 结算：备注、手机号（选填）、微信/支付宝收款码
- 付款页展示商家收款码 → 顾客付款后点「我已支付」
- 订单页：取餐码 + 制作进度轮询

**商家后台 `/admin`**

- 订单流：确认收款 → 制作中 → 待取餐 → 已完成 / 取消（自动退库存）
- 商品管理：分类增删排序、商品增删改、图片上传、价格/库存/上下架
- 店铺设置：店铺名、公告、头像、营业开关、收款码上传、改密码
- 点餐二维码：按商家 ID 生成，下载打印

## 技术栈

React 18 + Vite + antd / antd-mobile · Express + serverless-http · Netlify Functions · Postgres（Neon）· Netlify Blobs

## 本地开发

需要 Node 20+。

```bash
npm install
cp .env.example .env      # 填入 DATABASE_URL 与 TOKEN_SECRET
npx netlify-cli dev       # http://localhost:8888，同时提供页面与 /api
```

`netlify dev` 会用本地的 Blobs 模拟存储跑函数，所以上传图片在本地也可用。只调样式时可以单独 `npm run dev`（5173，但此时没有 API）。

```bash
npm run seed              # 写入 3 个演示商家及其商品
```

演示账号：`13800000001 / admin123`（另两个见 `server/seed-demo.js`）。

## 部署

1. 建一个 Neon 免费 Postgres，拿到 pooled 连接串。
2. Netlify 连接本仓库，`netlify.toml` 已配好构建与转发规则，无需额外设置。
3. 在 Netlify site 环境变量里配置 `DATABASE_URL`、`TOKEN_SECRET`（`openssl rand -hex 32`）。
4. 首次访问任意接口会自动建表；本地执行 `npm run seed` 灌演示数据。

## 结构

```
├── index.html / src/        # 前端：h5/ 顾客端、admin/ 商家后台
├── netlify.toml             # 构建、函数、/api 与 /uploads 转发、SPA 兜底
├── netlify/functions/api.js # serverless-http 包装 Express 应用
└── server/
    ├── app.js               # 全部 API 路由
    ├── db.js                # Postgres 连接池、事务、scrypt 口令、token 签名
    ├── schema.js            # 建表语句
    └── seed-demo.js         # 演示数据
```

## 设计要点

- **多租户隔离**：`categories / products / orders` 全部按 `merchant_id` 过滤，接口路径形如 `/api/shop/:merchantId/orders`，二维码内容即 `/?mid=<merchantId>`。
- **金额与库存在服务端裁决**：下单时按数据库价格重算总价，`UPDATE ... WHERE stock >= qty` 判 `rowCount` 原子扣减，整单在一个事务里，杜绝并发超卖。
- **订单存快照**：订单的 `items` 记录下单当时的名称、单价、图片，商家改价下架都不影响历史订单，读取无需回查商品表。
- **取餐码自增**：每个商家一条 `UPDATE ... RETURNING pickup_seq` 序列，叫号唯一且不碰撞。
- **口令与令牌**：scrypt + 每商家独立随机盐存哈希；登录 token 用 `TOKEN_SECRET` 做 HMAC 签名并校验过期，密钥不进仓库。
- **上传走对象存储**：文件存 Netlify Blobs，读取时 Content-Type 取自服务端白名单推导的真实类型，不接受客户端自报类型，杜绝上传即可执行。

> 收款说明：个人收款码没有支付回调，采用「顾客点『我已支付』+ 商家核对到账后确认」的双人流程；资金直达商家个人账户，平台不经手。
