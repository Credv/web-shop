import { useEffect, useState } from 'react';
import {
  Row,
  Col,
  Card,
  List,
  Button,
  Input,
  Table,
  Switch,
  Modal,
  Form,
  InputNumber,
  Select,
  Space,
  message,
  Popconfirm,
  Image,
  Empty,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import ImgUpload from './ImgUpload';
import { api, fmtPrice } from '../api';

export default function ProductsPage() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCat, setSelectedCat] = useState('all');
  const [newCat, setNewCat] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const loadAll = async () => {
    try {
      const [cats, prods] = await Promise.all([
        api('/api/admin/categories'),
        api('/api/admin/products'),
      ]);
      setCategories(cats);
      setProducts(prods);
    } catch (e) {
      message.error(e.message);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // ---------- 分类 ----------
  const addCategory = async () => {
    const name = newCat.trim();
    if (!name) return;
    try {
      await api('/api/admin/categories', { method: 'POST', body: { name } });
      setNewCat('');
      loadAll();
    } catch (e) {
      message.error(e.message);
    }
  };

  const renameCategory = (c) => {
    let name = c.name;
    Modal.confirm({
      title: '重命名分类',
      content: <Input defaultValue={c.name} onChange={(e) => (name = e.target.value)} />,
      onOk: async () => {
        try {
          await api(`/api/admin/categories/${c.id}`, { method: 'PUT', body: { name } });
          loadAll();
        } catch (e) {
          message.error(e.message);
        }
      },
    });
  };

  const moveCategory = async (index, dir) => {
    const next = [...categories];
    const [item] = next.splice(index, 1);
    next.splice(index + dir, 0, item);
    try {
      await api('/api/admin/categories', { method: 'PUT', body: { categories: next } });
      setCategories(next);
    } catch (e) {
      message.error(e.message);
    }
  };

  const removeCategory = async (c) => {
    try {
      await api(`/api/admin/categories/${c.id}`, { method: 'DELETE' });
      if (selectedCat === c.id) setSelectedCat('all');
      loadAll();
    } catch (e) {
      message.error(e.message);
    }
  };

  // ---------- 商品 ----------
  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ stock: 50, onSale: true });
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    form.setFieldsValue({ ...p, price: p.price / 100 });
    setModalOpen(true);
  };

  const saveProduct = async () => {
    try {
      const values = await form.validateFields();
      const body = { ...values, price: Math.round(values.price * 100) };
      if (editing) {
        await api(`/api/admin/products/${editing.id}`, { method: 'PUT', body });
      } else {
        await api('/api/admin/products', { method: 'POST', body });
      }
      setModalOpen(false);
      loadAll();
      message.success('已保存');
    } catch (e) {
      if (e.message) message.error(e.message);
    }
  };

  const toggleSale = async (p, onSale) => {
    try {
      await api(`/api/admin/products/${p.id}`, { method: 'PUT', body: { onSale } });
      loadAll();
    } catch (e) {
      message.error(e.message);
    }
  };

  const removeProduct = async (p) => {
    try {
      await api(`/api/admin/products/${p.id}`, { method: 'DELETE' });
      loadAll();
    } catch (e) {
      message.error(e.message);
    }
  };

  const shown = selectedCat === 'all' ? products : products.filter((p) => p.categoryId === selectedCat);
  const catName = (id) => categories.find((c) => c.id === id)?.name || '未分类';

  const columns = [
    {
      title: '图片',
      dataIndex: 'image',
      width: 70,
      render: (url) =>
        url ? <Image src={url} width={44} height={44} style={{ objectFit: 'cover', borderRadius: 6 }} /> : '-',
    },
    {
      title: '商品',
      dataIndex: 'name',
      render: (name, p) => (
        <div>
          <div>{name}</div>
          <div style={{ fontSize: 12, color: '#999' }}>{p.description}</div>
        </div>
      ),
    },
    { title: '分类', dataIndex: 'categoryId', width: 90, render: (id) => catName(id) },
    { title: '价格', dataIndex: 'price', width: 90, render: (v) => `¥${fmtPrice(v)}` },
    { title: '库存', dataIndex: 'stock', width: 70 },
    {
      title: '上架',
      dataIndex: 'onSale',
      width: 70,
      render: (v, p) => <Switch size="small" checked={v} onChange={(c) => toggleSale(p, c)} />,
    },
    {
      title: '操作',
      width: 120,
      render: (_, p) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(p)}>
            编辑
          </Button>
          <Popconfirm title="确认删除该商品？" onConfirm={() => removeProduct(p)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={7}>
        <Card title="商品分类" size="small">
          <List
            size="small"
            dataSource={categories}
            locale={{ emptyText: '暂无分类' }}
            renderItem={(c, index) => (
              <List.Item
                style={{
                  cursor: 'pointer',
                  background: selectedCat === c.id ? '#e6f4ff' : undefined,
                  padding: '8px',
                }}
                onClick={() => setSelectedCat(c.id)}
                actions={[
                  <Button
                    key="up"
                    size="small"
                    type="text"
                    disabled={index === 0}
                    icon={<ArrowUpOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      moveCategory(index, -1);
                    }}
                  />,
                  <Button
                    key="down"
                    size="small"
                    type="text"
                    disabled={index === categories.length - 1}
                    icon={<ArrowDownOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      moveCategory(index, 1);
                    }}
                  />,
                  <Button
                    key="edit"
                    size="small"
                    type="text"
                    icon={<EditOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      renameCategory(c);
                    }}
                  />,
                  <Popconfirm
                    key="del"
                    title="确认删除该分类？"
                    onConfirm={() => removeCategory(c)}
                  >
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Popconfirm>,
                ]}
              >
                {c.name}
              </List.Item>
            )}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Input
              placeholder="新分类名称"
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onPressEnter={addCategory}
            />
            <Button type="primary" onClick={addCategory}>
              添加
            </Button>
          </div>
        </Card>
      </Col>

      <Col xs={24} md={17}>
        <Card
          size="small"
          title={
            <Space>
              <Button size="small" type={selectedCat === 'all' ? 'primary' : 'default'} onClick={() => setSelectedCat('all')}>
                全部
              </Button>
              {categories.map((c) => (
                <Button
                  key={c.id}
                  size="small"
                  type={selectedCat === c.id ? 'primary' : 'default'}
                  onClick={() => setSelectedCat(c.id)}
                >
                  {c.name}
                </Button>
              ))}
            </Space>
          }
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新增商品
            </Button>
          }
        >
          {categories.length === 0 ? (
            <Empty description="请先在左侧创建分类" />
          ) : (
            <Table
              rowKey="id"
              size="small"
              columns={columns}
              dataSource={shown}
              pagination={false}
              locale={{ emptyText: '该分类暂无商品' }}
            />
          )}
        </Card>
      </Col>

      <Modal
        title={editing ? '编辑商品' : '新增商品'}
        open={modalOpen}
        onOk={saveProduct}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
        okText="保存"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="商品名称" name="name" rules={[{ required: true, message: '请输入商品名称' }]}>
            <Input placeholder="例如：手打柠檬茶" />
          </Form.Item>
          <Form.Item label="所属分类" name="categoryId" rules={[{ required: true, message: '请选择分类' }]}>
            <Select options={categories.map((c) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="价格（元）"
                name="price"
                rules={[{ required: true, message: '请输入价格' }]}
              >
                <InputNumber min={0} step={0.5} precision={2} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="库存" name="stock" rules={[{ required: true, message: '请输入库存' }]}>
                <InputNumber min={0} precision={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="商品描述" name="description">
            <Input.TextArea rows={2} placeholder="选填，例如：口味、做法说明" maxLength={100} />
          </Form.Item>
          <Form.Item label="商品图片" name="image">
            <ImgUpload />
          </Form.Item>
          <Form.Item label="立即上架" name="onSale" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Row>
  );
}
