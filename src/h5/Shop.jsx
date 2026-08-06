import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Image, Toast, Popup, Badge } from 'antd-mobile';
import { api, fmtPrice, loadCart, saveCart } from '../api';

export default function Shop() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const merchantId = searchParams.get('mid') || '';
  
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [cart, setCart] = useState(() => loadCart());
  const [activeCat, setActiveCat] = useState('');
  const [cartVisible, setCartVisible] = useState(false);
  const listRef = useRef(null);
  const sectionRefs = useRef({});
  const clickLock = useRef(false);

  useEffect(() => {
    if (!merchantId) {
      setError('缺少商家 ID（?mid=xxx）');
      return;
    }
    api(`/api/shop/${merchantId}/info`)
      .then((d) => {
        setInfo(d);
        if (d.categories[0]) setActiveCat(d.categories[0].id);
      })
      .catch((e) => setError(e.message));
  }, [merchantId]);

  useEffect(() => {
    saveCart(cart);
  }, [cart]);

  // 先调用所有 hooks，然后再做条件判断
  const catProducts = useMemo(() => {
    if (!info) return {};
    const m = {};
    info.products.forEach((p) => {
      if (!m[p.category_id]) m[p.category_id] = [];
      m[p.category_id].push(p);
    });
    return m;
  }, [info?.products]);

  const cartItems = info?.products?.filter((p) => cart[p.id] > 0) || [];
  const totalCents = cartItems.reduce((s, p) => s + p.price * cart[p.id], 0);
  const totalCount = cartItems.reduce((s, p) => s + cart[p.id], 0);

  const scrollToSection = (catId) => {
    clickLock.current = true;
    setActiveCat(catId);
    const el = sectionRefs.current[catId];
    if (el && listRef.current) {
      const pos = el.offsetTop - listRef.current.scrollTop;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setTimeout(() => (clickLock.current = false), 600);
  };

  const handleScroll = () => {
    if (clickLock.current || !listRef.current) return;
    const scroll = listRef.current.scrollTop + 100;
    for (const catId of Object.keys(sectionRefs.current)) {
      if (sectionRefs.current[catId].offsetTop <= scroll) {
        setActiveCat(catId);
      } else {
        break;
      }
    }
  };

  const add = (p) => {
    if (p.stock <= 0) {
      Toast.show('库存不足');
      return;
    }
    if ((cart[p.id] || 0) >= p.stock) {
      Toast.show('库存不足');
      return;
    }
    setCart((c) => ({ ...c, [p.id]: (c[p.id] || 0) + 1 }));
  };

  const sub = (p) =>
    setCart((c) => {
      const n = { ...c };
      const q = (c[p.id] || 0) - 1;
      if (q <= 0) delete n[p.id];
      else n[p.id] = q;
      return n;
    });

  const goCheckout = () => {
    if (!info.settings.open) {
      Toast.show('本店休息中，暂不支持下单');
      return;
    }
    if (totalCount === 0) return;
    navigate(`/checkout?mid=${merchantId}`);
  };

  // 现在再做条件判断，在 hooks 之后
  if (error) return <div className="h5-center">⚠️ {error}</div>;
  if (!info) return <div className="h5-center">加载中…</div>;

  return (
    <div className="h5-page">
      {/* 店招 */}
      <div className="shop-header">
        <div className="shop-name">{info.merchant.name}</div>
        <div className="shop-actions">
          <button className="shop-action-btn" onClick={() => navigate(`/orders?mid=${merchantId}`)}>
            📋 我的订单
          </button>
        </div>
      </div>

      {/* 分类 + 商品 */}
      <div className="shop-body">
        {/* 左侧分类导航 */}
        <div className="cat-nav">
          {info.categories.map((c) => (
            <div
              key={c.id}
              className={'cat-nav-item' + (activeCat === c.id ? ' active' : '')}
              onClick={() => scrollToSection(c.id)}
            >
              {c.name}
            </div>
          ))}
        </div>

        {/* 右侧商品列表 */}
        <div className="product-list" ref={listRef} onScroll={handleScroll}>
          {info.products.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>暂无商品</div>
          ) : (
            info.categories.map((c) => (
              <div
                key={c.id}
                ref={(el) => (sectionRefs.current[c.id] = el)}
                className="cat-section"
              >
                <div className="cat-section-title">{c.name}</div>
                {(catProducts[c.id] || []).map((p) => (
                  <div className="product-card" key={p.id} onClick={() => navigate(`/product/${p.id}?mid=${merchantId}`)}>
                    {p.image ? (
                      <Image src={p.image} width={76} height={76} fit="cover" className="product-img" />
                    ) : (
                      <div className="product-img product-img-fallback">🍜</div>
                    )}
                    <div className="product-info">
                      <div className="product-name">{p.name}</div>
                      <div className="product-bottom">
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
                        <span className="product-price">
                          <em>¥</em>
                          {fmtPrice(p.price)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 购物车栏 */}
      <div className="cart-bar-wrap">
        <div className="cart-bar">
          <div className="cart-icon" onClick={() => setCartVisible(true)}>
            <Badge content={totalCount > 0 ? totalCount : null}>🛒</Badge>
          </div>
          <div className="cart-total">
            {totalCount > 0 ? <>¥{fmtPrice(totalCents)}</> : <span className="cart-empty">未选购商品</span>}
          </div>
          <button
            className={'checkout-btn' + (totalCount > 0 && info.settings.open ? '' : ' disabled')}
            onClick={goCheckout}
          >
            去结算
          </button>
        </div>
      </div>

      {/* 购物车弹层 */}
      <Popup
        visible={cartVisible}
        onMaskClick={() => setCartVisible(false)}
        position="bottom"
        bodyStyle={{ maxHeight: '60vh', overflowY: 'auto', paddingBottom: 80 }}
      >
        <div className="cart-popup">
          <div className="cart-title">购物车</div>
          {totalCount === 0 ? (
            <div className="empty-cart">购物车为空</div>
          ) : (
            <>
              {cartItems.map((p) => (
                <div className="cart-item" key={p.id}>
                  {p.image ? (
                    <Image src={p.image} width={40} height={40} fit="cover" className="thumb" />
                  ) : (
                    <div className="thumb thumb-fallback">🍜</div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div className="cl-name">
                      {p.name} <span className="num">× {cart[p.id]}</span>
                    </div>
                    <div className="cl-price">¥{fmtPrice(p.price * cart[p.id])}</div>
                  </div>
                  <div className="cart-item-ctl">
                    <button className="step-btn-mini" onClick={() => sub(p)}>
                      −
                    </button>
                    <button className="step-btn-mini" onClick={() => add(p)}>
                      +
                    </button>
                  </div>
                </div>
              ))}
              <div className="cart-total-row">
                <div>合计</div>
                <div className="total-price">¥{fmtPrice(totalCents)}</div>
              </div>
            </>
          )}
        </div>
      </Popup>
    </div>
  );
}
