import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { NavBar, Toast, Badge, Image, Button } from 'antd-mobile';
import { api, fmtPrice, loadCart, saveCart } from '../api';

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [cart, setCart] = useState(loadCart);

  useEffect(() => {
    api('/api/shop/info')
      .then(setInfo)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    saveCart(cart);
  }, [cart]);

  if (error) return <div className="h5-center">加载失败：{error}</div>;
  if (!info) return <div className="h5-center">加载中…</div>;

  const product = info.products.find((p) => p.id === id);

  // 商品下架或不存在
  if (!product) {
    return (
      <div className="page">
        <NavBar onBack={() => navigate('/')}>商品详情</NavBar>
        <div style={{ padding: '60px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>🥲</div>
          <div style={{ color: '#999', marginTop: 12 }}>商品已下架或不存在</div>
          <Button color="primary" size="large" style={{ marginTop: 20 }} onClick={() => navigate('/')}>
            回店铺看看
          </Button>
        </div>
      </div>
    );
  }

  const qty = cart[product.id] || 0;
  const add = () => {
    if (qty >= product.stock) {
      Toast.show('该商品库存不足啦');
      return;
    }
    setCart((c) => ({ ...c, [product.id]: qty + 1 }));
  };
  const sub = () =>
    setCart((c) => {
      const n = { ...c };
      const q = qty - 1;
      if (q <= 0) delete n[product.id];
      else n[product.id] = q;
      return n;
    });

  // 购物车全局合计（底部栏与店铺页一致）
  const cartItems = info.products.filter((p) => cart[p.id] > 0);
  const totalCents = cartItems.reduce((s, p) => s + p.price * cart[p.id], 0);
  const totalCount = cartItems.reduce((s, p) => s + cart[p.id], 0);
  const catName = info.categories.find((c) => c.id === product.categoryId)?.name;

  const goCheckout = () => {
    if (!info.settings.open) {
      Toast.show('本店休息中，暂不支持下单');
      return;
    }
    if (totalCount === 0) return;
    navigate('/checkout');
  };

  return (
    <div className="page pd-page">
      <NavBar onBack={() => navigate(-1)}>商品详情</NavBar>

      {product.image ? (
        <Image src={product.image} fit="cover" className="pd-img" />
      ) : (
        <div className="pd-img pd-img-fallback">🍜</div>
      )}

      <div className="pd-body">
        <div className="pd-name">{product.name}</div>
        {product.description && <div className="pd-desc">{product.description}</div>}
        <div className="pd-price-row">
          <span className="product-price">
            <em>¥</em>
            {fmtPrice(product.price)}
          </span>
          {product.stock > 0 ? (
            <span className="pd-stock">
              库存 {product.stock} 份{product.stock <= 5 ? ' · 仅剩不多' : ''}
            </span>
          ) : (
            <span className="sold-out">已售罄</span>
          )}
        </div>
        {catName && <div className="pd-cat">分类：{catName}</div>}
        {product.stock > 0 && (
          <div className="pd-stepper-row">
            <span>数量</span>
            {qty === 0 ? (
              <button className="add-btn" onClick={add}>
                ＋
              </button>
            ) : (
              <div className="stepper">
                <button className="step-btn" onClick={sub}>
                  －
                </button>
                <span>{qty}</span>
                <button className="step-btn" onClick={add}>
                  ＋
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="cart-bar-wrap">
        <div className="cart-bar">
          <div className="cart-icon" onClick={() => navigate('/')}>
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
    </div>
  );
}
