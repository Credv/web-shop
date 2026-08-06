// 统一请求封装 + 购物车本地缓存
export const CART_KEY = 'shop_cart';
export const TOKEN_KEY = 'admin_token';
export const H5_USER_KEY = 'h5_user';

// H5 顾客手机号登录态（可选）
export function getH5User() {
  try {
    return JSON.parse(localStorage.getItem(H5_USER_KEY)) || null;
  } catch (e) {
    return null;
  }
}
export function setH5User(user) {
  localStorage.setItem(H5_USER_KEY, JSON.stringify(user));
}
export function clearH5User() {
  localStorage.removeItem(H5_USER_KEY);
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  let body = options.body;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  // 后台接口用管理 token，H5 顾客接口用手机号登录 token
  const token = path.startsWith('/api/h5')
    ? (getH5User() || {}).token
    : localStorage.getItem(TOKEN_KEY);
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, { ...options, body, headers });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    // 非 JSON 响应
  }
  if (!res.ok) {
    if (res.status === 401 && path.startsWith('/api/admin') && !path.includes('login')) {
      localStorage.removeItem(TOKEN_KEY);
    }
    if (res.status === 401 && path.startsWith('/api/h5') && !path.includes('login')) {
      clearH5User();
    }
    throw new Error((data && data.message) || `请求失败(${res.status})`);
  }
  return data;
}

// 价格统一以「分」存储，展示时格式化
export const fmtPrice = (cents) => (Number(cents) / 100).toFixed(2);

export const fmtTime = (ts) =>
  new Date(ts).toLocaleString('zh-CN', { hour12: false });

export function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || {};
  } catch (e) {
    return {};
  }
}

export function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

// 本机订单历史（无需登录，凭设备记录，最多保留 20 单）
export const ORDERS_KEY = 'shop_order_ids';

export function getLocalOrderIds() {
  try {
    return JSON.parse(localStorage.getItem(ORDERS_KEY)) || [];
  } catch (e) {
    return [];
  }
}

export function addLocalOrderId(id) {
  const ids = getLocalOrderIds().filter((i) => i !== id);
  ids.unshift(id);
  localStorage.setItem(ORDERS_KEY, JSON.stringify(ids.slice(0, 20)));
}
