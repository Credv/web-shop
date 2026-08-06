import { useEffect, useRef, useState } from 'react';
import { Tabs, Card, Tag, Button, Empty, Row, Col, message, Popconfirm } from 'antd';
import { api, fmtPrice, fmtTime } from '../api';

const STATUS_META = {
  unpaid: { text: '待支付', color: 'orange' },
  paid: { text: '待制作', color: 'blue' },
  making: { text: '制作中', color: 'purple' },
  ready: { text: '待取餐', color: 'green' },
  done: { text: '已完成', color: 'default' },
  cancelled: { text: '已取消', color: 'red' },
};
const ACTIVE = ['unpaid', 'paid', 'making', 'ready'];
const PAY_TEXT = { wechat: '微信支付', alipay: '支付宝' };

// 新订单提示音
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.value = 0.15;
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 500);
  } catch (e) {
    // 浏览器可能拦截自动播放，忽略
  }
}

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState('active');
  const prevActive = useRef(null);

  const load = async () => {
    try {
      const list = await api('/api/admin/orders');
      setOrders(list);
      const activeCount = list.filter((o) => ACTIVE.includes(o.status)).length;
      if (prevActive.current !== null && activeCount > prevActive.current) beep();
      prevActive.current = activeCount;
    } catch (e) {
      // 轮询静默失败
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  const update = async (id, status) => {
    try {
      await api(`/api/admin/orders/${id}`, { method: 'PATCH', body: { status } });
      load();
    } catch (e) {
      message.error(e.message);
    }
  };

  const filtered = orders.filter((o) =>
    tab === 'all' ? true : tab === 'active' ? ACTIVE.includes(o.status) : o.status === tab
  );

  const actionsFor = (o) => {
    switch (o.status) {
      case 'unpaid':
        return [
          <Button key="paid" type="primary" size="small" onClick={() => update(o.id, 'paid')}>
            确认已收款
          </Button>,
          <Popconfirm key="cancel" title="确认取消订单？库存将退回" onConfirm={() => update(o.id, 'cancelled')}>
            <Button size="small" danger>
              取消订单
            </Button>
          </Popconfirm>,
        ];
      case 'paid':
        return [
          <Button key="making" type="primary" size="small" onClick={() => update(o.id, 'making')}>
            开始制作
          </Button>,
          <Popconfirm key="cancel" title="确认取消订单？库存将退回" onConfirm={() => update(o.id, 'cancelled')}>
            <Button size="small" danger>
              取消
            </Button>
          </Popconfirm>,
        ];
      case 'making':
        return [
          <Button key="ready" type="primary" size="small" onClick={() => update(o.id, 'ready')}>
            制作完成 · 待取餐
          </Button>,
        ];
      case 'ready':
        return [
          <Button key="done" type="primary" size="small" onClick={() => update(o.id, 'done')}>
            已取餐 · 完成
          </Button>,
        ];
      default:
        return null;
    }
  };

  const activeCount = orders.filter((o) => ACTIVE.includes(o.status)).length;

  return (
    <div>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'active', label: `进行中（${activeCount}）` },
          { key: 'done', label: '已完成' },
          { key: 'cancelled', label: '已取消' },
          { key: 'all', label: '全部' },
        ]}
      />
      {filtered.length === 0 ? (
        <Empty description="暂无订单" />
      ) : (
        <Row gutter={[16, 16]}>
          {filtered.map((o) => (
            <Col xs={24} sm={12} xl={8} key={o.id}>
              <Card
                size="small"
                title={
                  <span>
                    取餐码 <b style={{ fontSize: 18, color: '#fa541c' }}>{o.pickupCode}</b>
                  </span>
                }
                extra={<Tag color={STATUS_META[o.status].color}>{STATUS_META[o.status].text}</Tag>}
              >
                <div className="order-no">
                  订单号 {o.orderNo} · {PAY_TEXT[o.payMethod]}
                </div>
                {o.items.map((it) => (
                  <div className="order-item-line" key={it.productId}>
                    <span>
                      {it.name} × {it.qty}
                    </span>
                    <span>¥{fmtPrice(it.price * it.qty)}</span>
                  </div>
                ))}
                <div className="order-total-line">
                  合计 <b>¥{fmtPrice(o.total)}</b>
                </div>
                {o.note && <div className="order-note">备注：{o.note}</div>}
                {o.phone && <div className="order-note">手机：{o.phone}</div>}
                <div className="order-time">{fmtTime(o.createdAt)}</div>
                <div className="order-actions">{actionsFor(o)}</div>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}
