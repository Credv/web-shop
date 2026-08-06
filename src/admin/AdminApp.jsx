import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Layout, Menu, Button, Form, Input, Card, message, Tabs } from 'antd';
import { ShopOutlined, AppstoreOutlined, SettingOutlined, LogoutOutlined, BarChartOutlined } from '@ant-design/icons';
import DashboardPage from './DashboardPage';
import OrdersPage from './OrdersPage';
import ProductsPage from './ProductsPage';
import SettingsPage from './SettingsPage';
import { api, TOKEN_KEY } from '../api';

function Login({ onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('login');

  const handleLogin = async (values) => {
    setLoading(true);
    try {
      const { token } = await api('/api/admin/login', {
        method: 'POST',
        body: { phone: values.phone, password: values.password },
      });
      localStorage.setItem(TOKEN_KEY, token);
      message.success('登录成功');
      onSuccess();
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (values) => {
    setLoading(true);
    try {
      const { token } = await api('/api/admin/register', {
        method: 'POST',
        body: {
          phone: values.phone,
          password: values.password,
          name: values.name || '小店',
        },
      });
      localStorage.setItem(TOKEN_KEY, token);
      message.success('注册成功');
      onSuccess();
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login">
      <Card title="🏪 摆摊小店 · 商家后台" style={{ width: 380 }}>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'login',
              label: '登 录',
              children: (
                <Form onFinish={handleLogin}>
                  <Form.Item
                    name="phone"
                    rules={[
                      { required: true, message: '请输入手机号' },
                      { pattern: /^1\d{10}$/, message: '手机号格式不正确' },
                    ]}
                  >
                    <Input size="large" placeholder="手机号" />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    rules={[{ required: true, message: '请输入密码' }]}
                  >
                    <Input.Password size="large" placeholder="密码" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                    登 录
                  </Button>
                </Form>
              ),
            },
            {
              key: 'register',
              label: '注 册',
              children: (
                <Form onFinish={handleRegister}>
                  <Form.Item
                    name="phone"
                    rules={[
                      { required: true, message: '请输入手机号' },
                      { pattern: /^1\d{10}$/, message: '手机号格式不正确' },
                    ]}
                  >
                    <Input size="large" placeholder="手机号" />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    rules={[{ required: true, message: '请输入密码' }]}
                  >
                    <Input.Password size="large" placeholder="密码（至少 6 位）" />
                  </Form.Item>
                  <Form.Item
                    name="name"
                    rules={[{ required: true, message: '请输入店铺名' }]}
                  >
                    <Input size="large" placeholder="店铺名（如：老王烤肠店）" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                    立即注册
                  </Button>
                </Form>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}

export default function AdminApp() {
  const [logged, setLogged] = useState(!!localStorage.getItem(TOKEN_KEY));
  const [merchantInfo, setMerchantInfo] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!logged) return;
    api('/api/admin/info')
      .then(setMerchantInfo)
      .catch(() => {});
  }, [logged]);

  if (!logged) return <Login onSuccess={() => setLogged(true)} />;

  const selected = location.pathname === '/admin' ? '/admin' : '/admin/' + location.pathname.split('/')[2];

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setLogged(false);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider theme="dark" breakpoint="md" collapsedWidth={64}>
        <div className="admin-logo">🏪 小店后台</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selected]}
          onClick={({ key }) => navigate(key)}
          items={[
            { key: '/admin', icon: <BarChartOutlined />, label: '数据大盘' },
            { key: '/admin/orders', icon: <AppstoreOutlined />, label: '订单管理' },
            { key: '/admin/products', icon: <ShopOutlined />, label: '商品管理' },
            { key: '/admin/settings', icon: <SettingOutlined />, label: '店铺设置' },
          ]}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 14, color: '#666' }}>
            {merchantInfo && (
              <>
                <span>📍 {merchantInfo.name}</span>
                <span style={{ margin: '0 12px', color: '#ccc' }}>|</span>
                <span>☎️ {merchantInfo.phone}</span>
              </>
            )}
          </div>
          <Button
            icon={<LogoutOutlined />}
            onClick={handleLogout}
          >
            退出登录
          </Button>
        </Layout.Header>
        <Layout.Content style={{ padding: 16, background: '#f5f5f5' }}>
          <Routes>
            <Route index element={<DashboardPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
