import { useState } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Layout, Menu, Button, Form, Input, Card, message } from 'antd';
import { ShopOutlined, AppstoreOutlined, SettingOutlined, LogoutOutlined, BarChartOutlined } from '@ant-design/icons';
import DashboardPage from './DashboardPage';
import OrdersPage from './OrdersPage';
import ProductsPage from './ProductsPage';
import SettingsPage from './SettingsPage';
import { api, TOKEN_KEY } from '../api';

function Login({ onSuccess }) {
  const [loading, setLoading] = useState(false);

  const submit = async (values) => {
    setLoading(true);
    try {
      const { token } = await api('/api/admin/login', {
        method: 'POST',
        body: { password: values.password },
      });
      localStorage.setItem(TOKEN_KEY, token);
      onSuccess();
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login">
      <Card title="🏪 摆摊小店 · 商家后台" style={{ width: 360 }}>
        <Form onFinish={submit}>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password size="large" placeholder="登录密码（默认 admin123）" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            登 录
          </Button>
        </Form>
      </Card>
    </div>
  );
}

export default function AdminApp() {
  const [logged, setLogged] = useState(!!localStorage.getItem(TOKEN_KEY));
  const navigate = useNavigate();
  const location = useLocation();

  if (!logged) return <Login onSuccess={() => setLogged(true)} />;

  const selected = '/admin/' + (location.pathname.split('/')[2] || '');

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
            justifyContent: 'flex-end',
            alignItems: 'center',
          }}
        >
          <Button
            icon={<LogoutOutlined />}
            onClick={() => {
              localStorage.removeItem(TOKEN_KEY);
              setLogged(false);
            }}
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
