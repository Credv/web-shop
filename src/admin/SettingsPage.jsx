import { useEffect, useRef, useState } from 'react';
import { Card, Form, Input, Switch, Button, Row, Col, message, Divider, Space } from 'antd';
import { QRCodeCanvas } from 'qrcode.react';
import ImgUpload from './ImgUpload';
import { api } from '../api';

export default function SettingsPage() {
  const [form] = Form.useForm();
  const [pwdForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const qrRef = useRef(null);
  const shopUrl = window.location.origin + '/';

  useEffect(() => {
    api('/api/admin/settings')
      .then((s) => form.setFieldsValue(s))
      .catch((e) => message.error(e.message));
  }, [form]);

  const save = async () => {
    setLoading(true);
    try {
      const values = await form.validateFields();
      await api('/api/admin/settings', { method: 'PUT', body: values });
      message.success('保存成功');
    } catch (e) {
      if (e.message) message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const changePwd = async () => {
    try {
      const v = await pwdForm.validateFields();
      await api('/api/admin/password', { method: 'PATCH', body: v });
      message.success('密码修改成功');
      pwdForm.resetFields();
    } catch (e) {
      if (e.message) message.error(e.message);
    }
  };

  const downloadQr = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = '小店点餐二维码.png';
    a.click();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shopUrl);
      message.success('链接已复制');
    } catch (e) {
      message.info(shopUrl);
    }
  };

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={14}>
        <Card title="店铺信息">
          <Form form={form} layout="vertical">
            <Form.Item label="店铺名称" name="shopName" rules={[{ required: true, message: '请输入店铺名称' }]}>
              <Input />
            </Form.Item>
            <Form.Item label="店铺公告（滚动展示在店铺顶部）" name="announcement">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item label="店铺头像" name="avatar">
              <ImgUpload />
            </Form.Item>
            <Form.Item label="是否营业（关闭后用户无法下单）" name="open" valuePropName="checked">
              <Switch checkedChildren="营业中" unCheckedChildren="休息中" />
            </Form.Item>

            <Divider orientation="left">收款码</Divider>
            <div style={{ color: '#999', fontSize: 12, marginBottom: 12 }}>
              上传你的个人微信/支付宝收款码图片，顾客下单后会展示该收款码，付款后点击「我已支付」即可。
              收到付款提醒（或核对到账）后，在订单管理中点击「确认已收款」。
            </div>
            <Row gutter={24}>
              <Col xs={24} sm={12}>
                <Form.Item label="微信收款码" name="wechatPay">
                  <ImgUpload />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="支付宝收款码" name="alipayPay">
                  <ImgUpload />
                </Form.Item>
              </Col>
            </Row>
            <Button type="primary" onClick={save} loading={loading}>
              保存设置
            </Button>
          </Form>
        </Card>

        <Card title="修改密码" style={{ marginTop: 16 }}>
          <Form form={pwdForm} layout="vertical" style={{ maxWidth: 360 }}>
            <Form.Item label="原密码" name="oldPassword" rules={[{ required: true, message: '请输入原密码' }]}>
              <Input.Password />
            </Form.Item>
            <Form.Item
              label="新密码"
              name="newPassword"
              rules={[
                { required: true, message: '请输入新密码' },
                { min: 6, message: '新密码至少 6 位' },
              ]}
            >
              <Input.Password />
            </Form.Item>
            <Button onClick={changePwd}>修改密码</Button>
          </Form>
        </Card>
      </Col>

      <Col xs={24} lg={10}>
        <Card title="点餐二维码（打印张贴在摊位）">
          <div ref={qrRef} style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
            <QRCodeCanvas value={shopUrl} size={200} marginSize={2} />
          </div>
          <div
            style={{ textAlign: 'center', color: '#999', marginBottom: 12, wordBreak: 'break-all', fontSize: 12 }}
          >
            {shopUrl}
          </div>
          <Space style={{ display: 'flex', justifyContent: 'center' }}>
            <Button type="primary" onClick={downloadQr}>
              下载二维码
            </Button>
            <Button onClick={copyLink}>复制链接</Button>
          </Space>
          <div style={{ color: '#999', marginTop: 12, fontSize: 12, lineHeight: 1.8 }}>
            提示：二维码指向当前访问地址。正式摆摊前，请将本项目部署到公网（如自有服务器），
            确保顾客手机扫码后能打开页面。
          </div>
        </Card>
      </Col>
    </Row>
  );
}
