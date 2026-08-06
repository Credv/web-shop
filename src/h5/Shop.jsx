import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Image, Toast, Popup, Badge, NoticeBar } from 'antd-mobile';
import { api, fmtPrice, loadCart, saveCart } from '../api';

export default function Shop() {
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [cart, setCart] = useState(loadCart);
  const [activeCat, setActiveCat] = useState('');
  const [cartVisible, setCartVisible] = useState(false);
  const listRef = useRef(null);
  const sectionRefs = useRef({});
  const clickLock = useRef(false);

  useEffect(() => {
    api('/api/shop/info')
      .then((d) => {
        setInfo(d);
        if (d.categories[0]) setActiveCat(d.categories[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    saveCart(cart);
  }, [cart]);

  const products = info?.products || [];
  const categories = info?.categories || [];

  const catProducts = useMemo(() => {
    const map = {};
    for (const c of categories) map[c.id] = [];
    for (const p of products) {
      if (map[p.categoryId]) map[p.categoryId].push(p);
    }
    return map;
  }, [categories, products]);

  const cartItems = useMemo(
    () => products.filter((p) => cart[p.id] > 0).map((p) => ({ ...p, qty: cart[p.id] })),
    [products, cart]
  );
  const totalCount = cartItems.reduce((s, i) => s + i.qty, 0);
  const totalCents = cartItems.reduce((s, i) => s + i.price * i.qty, 0);

  const add = (p) => {
    if ((cart[p.id] || 0) >= p.stock) {
      Toast.show('该商品库存不足啦');
      return;
    }
    setCart((c) => ({ ...c, [p.id]: (c[p.id] || 0) + 1 }));
  };
  const sub = (p) =>
    setCart((c) => {
      const n = { ...c };
      const q = (n[p.id] || 0) - 1;
      if (q <= 0) delete n[p.id];
      else n[p.id] = q;
      return n;
    });

  // 滚动联动高亮左侧分类
  const onScroll = () => {
    if (clickLock.current) return;
    const el = listRef.current;
    if (!el) return;
    const top = el.scrollTop + 10;
    let current = categories[0]?.id;
    for (const c of categories) {
      const s = sectionRefs.current[c.id];
      if (s && s.offsetTop <= top) current = c.id;
    }
    if (current && current !== activeCat) setActiveCat(current);
  };

  const jumpTo = (id) => {
    setActiveCat(id);
    const el = sectionRefs.current[id];
    if (el && listRef.current) {
      clickLock.current = true;
      listRef.current.scrollTo({ top: el.offsetTop });
      setTimeout(() => {
        clickLock.current = false;
      }, 400);
    }
  };

  if (error) return <div className="h5-center">加载失败：{error}</div>;
  if (!info) return <div className="h5-center">加载中…</div>;

  const { settings } = info;

  const goCheckout = () => {
    if (!settings.open) {
      Toast.show('本店休息中，暂不支持下单');
      return;
    }
    if (totalCount === 0) return;
    navigate('/checkout');
  };

  return (
    <div className="h5-page">
      <div className="shop-header">
        <div className="shop-title">
          {settings.avatar ? (
            <Image src={settings.avatar} width={44} height={44} fit="cover" className="shop-avatar" />
          ) : (
            <div className="shop-avatar shop-avatar-fallback">店</div>
          )}
          <div>
            <div className="shop-name">{settings.shopName || '我的小店'}</div>
            <div className="shop-sub">{settings.open ? '营业中 · 扫码下单 · 现点现做' : '本店休息中'}</div>
          </div>
          <div className="shop-my-orders" onClick={() => navigate('/orders')}>
            📋 我的订单
          </div>
        </div>
        {settings.announcement && (
          <NoticeBar content={settings.announcement} color="alert" className="shop-notice" />
        )}
      </div>

      {products.length === 0 ? (
        <div className="h5-center" style={{ flex: 1 }}>
          商家还未上架商品，敬请期待～
        </div>
      ) : (
        <div className="shop-body">
          <div className="cat-nav">
            {categories.map((c) => (
              <div
                key={c.id}
                className={'cat-item' + (activeCat === c.id ? ' active' : '')}
                onClick={() => jumpTo(c.id)}
              >
                {c.name}
              </div>
            ))}
          </div>
          <div className="product-list" ref={listRef} onScroll={onScroll}>
            {categories.map((c) => (
              <div
                key={c.id}
                className="cat-section"
                ref={(el) => (sectionRefs.current[c.id] = el)}
              >
                <div className="cat-section-title">{c.name}</div>
                {(catProducts[c.id] || []).map((p) => (
                  <div className="product-card" key={p.id} onClick={() => navigate(`/product/${p.id}`)}>
                    {p.image ? (
                      <Image src={p.image} width={76} height={76} fit="cover" className="product-img" />
                    ) : (
                      <div className="product-img-fallback">🍜</div>
                    )}
                    <div className="product-info">
                      <div className="product-name">{p.name}</div>
                      {p.description && <div className="product-desc">{p.description}</div>}
                      {p.stock > 0 && p.stock <= 5 && <div className="stock-tip">仅剩 {p.stock} 份</div>}
                      <div className="product-bottom">
                        <span className="product-price">
                          <em>¥</em>
                          {fmtPrice(p.price)}
                        </span>
                        {p.stock <= 0 ? (
                          <span className="sold-out">已售罄</span>
                        ) : (cart[p.id] || 0) === 0 ? (
                          <button
                            className="add-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              add(p);
                            }}
                          >
                            ＋
                          </button>
                        ) : (
                          <div className="stepper" onClick={(e) => e.stopPropagation()}>
                            <button className="step-btn" onClick={() => sub(p)}>
                              －
                            </button>
                            <span>{cart[p.id]}</span>
                            <button className="step-btn" onClick={() => add(p)}>
                              ＋
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="cart-bar-wrap">
        <div className="cart-bar">
          <div className="cart-icon" onClick={() => totalCount > 0 && setCartVisible(true)}>
            <Badge content={totalCount > 0 ? totalCount : null}>🛒</Badge>
          </div>
          <div className="cart-total">
            {totalCount > 0 ? <>¥{fmtPrice(totalCents)}</> : <span className="cart-empty">未选购商品</span>}
          </div>
          <button
            className={'checkout-btn' + (totalCount > 0 && settings.open ? '' : ' disabled')}
            onClick={goCheckout}
          >
            去结算
          </button>
        </div>
      </div>

      <Popup
        visible={cartVisible}
        onMaskClick={() => setCartVisible(false)}
        bodyStyle={{ borderTopLeftRadius: 12, borderTopRightRadius: 12 }}
      >
        <div className="cart-popup">
          <div className="cart-popup-head">
            <span>已选商品</span>
            <span
              className="clear-cart"
              onClick={() => {
                setCart({});
                setCartVisible(false);
              }}
            >
              清空
            </span>
          </div>
          {cartItems.map((p) => (
            <div className="cart-popup-item" key={p.id}>
              {p.image ? (
                <Image src={p.image} width={40} height={40} fit="cover" className="thumb" />
              ) : (
                <div className="thumb-fallback">🍜</div>
              )}
              <div className="cpi-name">{p.name}</div>
              <div className="cpi-price">¥{fmtPrice(p.price)}</div>
              <div className="stepper">
                <button className="step-btn" onClick={() => sub(p)}>
                  －
                </button>
                <span>{p.qty}</span>
                <button className="step-btn" onClick={() => add(p)}>
                  ＋
                </button>
              </div>
            </div>
          ))}
        </div>
      </Popup>
    </div>
  );
}
