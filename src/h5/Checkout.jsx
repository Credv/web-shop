import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { NavBar, TextArea, Input, Toast, Button, Image } from 'antd-mobile';
import { api, fmtPrice, loadCart, CART_KEY, addLocalOrderId, getH5User } from '../api';

export default function Checkout() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const merchantId = searchParams.get('mid') || '';
  const [info, setInfo] = useState(null);
  const [cart] = useState(() => loadCart());
  const [note, setNote] = useState('');
  // 已登录手机号自动带出，下单后订单计入该手机号的历史
  const [phone, setPhone] = useState(() => (getH5User() || {}).phone || '');
  const [payMethod, setPayMethod] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!merchantId) {
      Toast.show('缺少商家 ID');
      return;
    }
    api(`/api/shop/${merchantId}/info`)
      .then(setInfo)
      .catch((e) => Toast.show(e.message));
  }, []);

  const products = info?.products || [];
  const items = useMemo(
    () => products.filter((p) => cart[p.id] > 0).map((p) => ({ ...p, qty: cart[p.id] })),
    [products, cart]
  );
  const totalCents = items.reduce((s, i) => s + i.price * i.qty, 0);

  useEffect(() => {
    if (!info) return;
    if (items.length === 0) {
      navigate(`/?mid=${merchantId}`, { replace: true });
      return;
    }
    // 默认选中第一个可用的支付方式
    if (!payMethod) {
      if (info.settings.wechatPay) setPayMethod('wechat');
      else if (info.settings.alipayPay) setPayMethod('alipay');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info]);

  const settings = info?.settings || {};

  const submit = async () => {
    if (submitting) return;
    if (!payMethod) {
      Toast.show('请选择支付方式');
      return;
    }
    if (phone && !/^1\d{10}$/.test(phone)) {
      Toast.show('手机号格式不正确');
      return;
    }
    setSubmitting(true);
    try {
      const order = await api(`/api/shop/${merchantId}/orders`, {
        method: 'POST',
        body: {
          items: items.map((i) => ({ productId: i.id, qty: i.qty })),
          note,
          phone,
          payMethod,
        },
      });
      localStorage.removeItem(CART_KEY);
      addLocalOrderId(order.id);
      navigate(`/order/${order.id}?pay=1&mid=${merchantId}`, { replace: true });
    } catch (e) {
      Toast.show(e.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <NavBar onBack={() => navigate(`/?mid=${merchantId}`)}>确认订单</NavBar>

      <div className="section">
        <div className="section-title">商品清单</div>
        {items.map((i) => (
          <div className="checkout-line" key={i.id}>
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
      </div>

      <div className="section">
        <div className="section-title">备注</div>
        <TextArea
          placeholder="口味偏好、忌口等（选填）"
          value={note}
          onChange={setNote}
          rows={2}
          maxLength={100}
          showCount
        />
      </div>

      <div className="section">
        <div className="section-title">手机号（选填）</div>
        <Input placeholder="填写后方便商家联系你" value={phone} onChange={setPhone} type="tel" maxLength={11} />
      </div>

      <div className="section">
        <div className="section-title">支付方式</div>
        <div
          className={
            'pay-option' +
            (payMethod === 'wechat' ? ' active' : '') +
            (settings.wechatPay ? '' : ' disabled')
          }
          onClick={() => settings.wechatPay && setPayMethod('wechat')}
        >
          <span className="pay-dot wechat" />
          微信支付
          <span className="pay-hint">{settings.wechatPay ? '长按识别收款码付款' : '商家未开通'}</span>
        </div>
        <div
          className={
            'pay-option' +
            (payMethod === 'alipay' ? ' active' : '') +
            (settings.alipayPay ? '' : ' disabled')
          }
          onClick={() => settings.alipayPay && setPayMethod('alipay')}
        >
          <span className="pay-dot alipay" />
          支付宝
          <span className="pay-hint">{settings.alipayPay ? '扫码/识别收款码付款' : '商家未开通'}</span>
        </div>
      </div>

      <div className="submit-bar">
        <div className="submit-total">
          合计：<b>¥{fmtPrice(totalCents)}</b>
        </div>
        <Button color="primary" size="large" loading={submitting} onClick={submit}>
          提交订单
        </Button>
      </div>
    </div>
  );
}
