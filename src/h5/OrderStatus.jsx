import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { NavBar, Button, Toast, Steps, Image } from 'antd-mobile';
import { api, fmtPrice, fmtTime, addLocalOrderId } from '../api';

const { Step } = Steps;

const STATUS_TEXT = {
  unpaid: '等待付款',
  paid: '已支付，等待商家制作',
  making: '商家制作中，请稍候…',
  ready: '餐品已备好，请凭取餐码取餐！',
  done: '订单已完成，感谢惠顾～',
  cancelled: '订单已取消',
};
const PAY_TEXT = { wechat: '微信支付', alipay: '支付宝' };
const TERMINAL = ['done', 'cancelled'];

export default function OrderStatus() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const merchantId = searchParams.get('mid') || '';
  const [order, setOrder] = useState(null);
  const [info, setInfo] = useState(null);
  const [paying, setPaying] = useState(false);

  const load = useCallback(
    () =>
      api(`/api/orders/${id}`)
        .then(setOrder)
        .catch((e) => Toast.show(e.message)),
    [id]
  );

  useEffect(() => {
    load();
    addLocalOrderId(id);
    api('/api/shop/info').then(setInfo).catch(() => {});
  }, [load, id]);

  // 非终态订单 3 秒轮询一次状态
  useEffect(() => {
    if (!order || TERMINAL.includes(order.status)) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [order, load]);

  const confirmPaid = async () => {
    setPaying(true);
    try {
      await api(`/api/orders/${id}/paid`, { method: 'POST' });
      await load();
      Toast.show('已通知商家');
    } catch (e) {
      Toast.show(e.message);
      load();
    } finally {
      setPaying(false);
    }
  };

  if (!order) return <div className="h5-center">加载中…</div>;

  const settings = info?.settings || {};
  const qrImg = order.payMethod === 'wechat' ? settings.wechatPay : settings.alipayPay;

  // ---------- 付款页 ----------
  if (order.status === 'unpaid') {
    return (
      <div className="page">
        <NavBar onBack={() => navigate(`/?mid=${merchantId}`)}>订单支付</NavBar>
        <div className="section pay-card">
          <div style={{ color: '#999', fontSize: 13 }}>应付金额</div>
          <div className="pay-amount">¥{fmtPrice(order.total)}</div>
          {qrImg ? (
            <>
              <Image src={qrImg} className="pay-qr-img" fit="contain" />
              <div className="pay-tips">
                {order.payMethod === 'wechat' ? (
                  <>① 长按识别二维码，向摊主付款<br />② 付款完成后点击下方「我已支付」</>
                ) : (
                  <>① 截图保存收款码，打开支付宝「扫一扫」选择相册图片<br />② 付款完成后点击下方「我已支付」</>
                )}
              </div>
              <Button block color="primary" size="large" loading={paying} onClick={confirmPaid}>
                我已完成支付
              </Button>
            </>
          ) : (
            <>
              <div className="pay-tips" style={{ textAlign: 'center', marginBottom: 16 }}>
                💡 本地演示模式：商家尚未上传收款码<br />
                点击下方「我已完成支付」进行测试
              </div>
              <Button block color="primary" size="large" loading={paying} onClick={confirmPaid}>
                我已完成支付
              </Button>
            </>
          )}}
        </div>
      </div>
    );
  }

  // ---------- 订单状态页 ----------
  const stepIndex = { paid: 0, making: 1, ready: 2, done: 3 }[order.status];

  return (
    <div className="page">
      <NavBar onBack={() => navigate(`/?mid=${merchantId}`)}>订单详情</NavBar>

      <div className="section" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{STATUS_TEXT[order.status]}</div>
        {stepIndex !== undefined && (
          <Steps current={stepIndex} style={{ marginTop: 12 }}>
            <Step title="已下单" />
            <Step title="制作中" />
            <Step title="待取餐" />
            <Step title="已完成" />
          </Steps>
        )}
      </div>

      {order.status !== 'cancelled' && (
        <div className="pickup-code-card">
          <div style={{ fontSize: 13, opacity: 0.9 }}>取餐码</div>
          <div className="pickup-code">{order.pickupCode}</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>取餐时向商家报取餐码即可</div>
        </div>
      )}

      <div className="section">
        <div className="section-title">商品清单</div>
        {order.items.map((i) => (
          <div className="checkout-line" key={i.productId}>
            {i.image ? (
              <Image src={i.image} width={40} height={40} fit="cover" className="thumb" />
            ) : (
              <div className="thumb-fallback">🍜</div>
            )}
            <span className="cl-name">
              {i.name} <span className="num">× {i.qty}</span>
            </span>
            <span>¥{fmtPrice(i.price * i.qty)}</span>
          </div>
        ))}
        <div className="checkout-line" style={{ borderTop: '1px dashed #eee', marginTop: 6, paddingTop: 8 }}>
          <span>合计（{PAY_TEXT[order.payMethod]}）</span>
          <b style={{ color: '#ff5000' }}>¥{fmtPrice(order.total)}</b>
        </div>
      </div>

      <div className="section">
        <div className="order-info-row">
          <span>订单号</span>
          <span>{order.orderNo}</span>
        </div>
        <div className="order-info-row">
          <span>下单时间</span>
          <span>{fmtTime(order.createdAt)}</span>
        </div>
        {order.note && (
          <div className="order-info-row">
            <span>备注</span>
            <span>{order.note}</span>
          </div>
        )}
      </div>

      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button block size="large" onClick={() => navigate(`/?mid=${merchantId}`)}>
          再逛逛
        </Button>
         <Button block size="large" fill="outline" onClick={() => navigate(`/orders?mid=${merchantId}`)}>
          查看全部订单
        </Button>
      </div>
    </div>
  );
}
