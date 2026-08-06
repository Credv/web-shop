import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { NavBar, Button, Input, Toast } from 'antd-mobile';
import {
  api,
  fmtPrice,
  fmtTime,
  getLocalOrderIds,
  getH5User,
  setH5User,
  clearH5User,
} from '../api';

const STATUS_META = {
  unpaid: { text: '待付款', color: '#ff9800' },
  paid: { text: '待制作', color: '#0089ff' },
  making: { text: '制作中', color: '#7b61ff' },
  ready: { text: '待取餐', color: '#00b578' },
  done: { text: '已完成', color: '#999' },
  cancelled: { text: '已取消', color: '#ff3141' },
};

export default function OrderHistory() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const merchantId = searchParams.get('mid') || '';
  const [orders, setOrders] = useState(null);
  const [user, setUser] = useState(() => getH5User());
  const [phone, setPhone] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // 已登录：从服务器拉取；未登录：读本机缓存的订单 id
  const load = useCallback(async () => {
    if (user) {
      try {
        setOrders(await api('/api/h5/orders'));
      } catch (e) {
        // token 失效时 api() 已清理登录态，回到未登录视图
        setUser(getH5User());
      }
    } else {
      const ids = getLocalOrderIds();
      if (ids.length === 0) {
        setOrders([]);
        return;
      }
      const list = await Promise.all(
        ids.map((id) => api(`/api/orders/${id}`).catch(() => null))
      );
      setOrders(list.filter(Boolean));
    }
  }, [user]);

  useEffect(() => {
    setOrders(null);
    load();
    // 持续刷新订单状态
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const login = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      Toast.show('请输入正确的手机号');
      return;
    }
    setLoggingIn(true);
    try {
      const r = await api('/api/h5/login', {
        method: 'POST',
        body: { phone, claimIds: getLocalOrderIds() },
      });
      setH5User(r);
      setUser(r);
      setPhone('');
      Toast.show('登录成功，订单记录已同步');
    } catch (e) {
      Toast.show(e.message);
    } finally {
      setLoggingIn(false);
    }
  };

  const logout = () => {
    clearH5User();
    setUser(null);
    Toast.show('已退出登录');
  };

  const maskPhone = (p) => p.slice(0, 3) + '****' + p.slice(7);

  return (
    <div className="page">
      <NavBar onBack={() => navigate(`/?mid=${merchantId}`)}>我的订单</NavBar>

      {user ? (
        <div className="oh-login-card">
          <span>📱 已登录：{maskPhone(user.phone)}（订单记录保存在服务器）</span>
          <span className="oh-logout" onClick={logout}>
            退出
          </span>
        </div>
      ) : (
        <div className="oh-login-card oh-login-form">
          <div className="oh-login-row">
            <Input
              placeholder="输入手机号登录"
              type="tel"
              maxLength={11}
              value={phone}
              onChange={setPhone}
            />
            <Button color="primary" size="small" loading={loggingIn} onClick={login}>
              登录
            </Button>
          </div>
          <div className="oh-login-tip">
            未登录时订单记录仅保存在本机浏览器，清理缓存可能导致订单历史丢失；登录手机号后订单记录将保存在服务器，换设备也能查看。
          </div>
        </div>
      )}

      {!orders ? (
        <div className="h5-center">加载中…</div>
      ) : orders.length === 0 ? (
        <div style={{ padding: '60px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>🛍️</div>
          <div style={{ color: '#999', marginTop: 12 }}>暂无订单记录，去挑点好吃的吧～</div>
          <Button color="primary" size="large" style={{ marginTop: 20 }} onClick={() => navigate(`/?mid=${merchantId}`)}>
            去逛逛
          </Button>
        </div>
      ) : (
        orders.map((o) => (
          <div className="oh-card" key={o.id} onClick={() => navigate(`/order/${o.id}?mid=${merchantId}`)}>
            <div className="oh-head">
              <span>
                {o.orderNo} · {fmtTime(o.createdAt)}
              </span>
              <span className="oh-status" style={{ color: STATUS_META[o.status].color }}>
                {STATUS_META[o.status].text}
              </span>
            </div>
            <div className="oh-items">{o.items.map((i) => `${i.name}×${i.qty}`).join('、')}</div>
            <div className="oh-foot">
              {!['done', 'cancelled'].includes(o.status) ? (
                <span className="oh-pickup">
                  取餐码 <b>{o.pickupCode}</b>
                </span>
              ) : (
                <span style={{ fontSize: 13, color: '#999' }}>
                  共 {o.items.reduce((s, i) => s + i.qty, 0)} 件
                </span>
              )}
              <span className="oh-total">¥{fmtPrice(o.total)}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
