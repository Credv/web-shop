import { useEffect, useMemo, useState } from 'react';
import { Row, Col, Card, Statistic, Empty, Tag } from 'antd';
import ReactECharts from 'echarts-for-react';
import { api } from '../api';

// 计入营业额的订单状态（已付款）
const PAID = ['paid', 'making', 'ready', 'done'];

const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
};
const dayLabel = (ts) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export default function DashboardPage() {
  const [orders, setOrders] = useState([]);

  const load = async () => {
    try {
      setOrders(await api('/api/admin/orders'));
    } catch (e) {
      // 轮询静默失败
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const todayKey = dayKey(now.getTime());

    // 近 7 天（含今天）
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      days.push({ key: dayKey(d.getTime()), label: dayLabel(d.getTime()), amount: 0, count: 0 });
    }
    const dayMap = Object.fromEntries(days.map((d) => [d.key, d]));

    let todayCount = 0;
    let todayAmount = 0;
    let totalAmount = 0;
    let totalCount = 0;
    let wechatAmount = 0;
    let alipayAmount = 0;
    const productMap = {};

    for (const o of orders) {
      if (!PAID.includes(o.status)) continue;
      totalAmount += o.total;
      totalCount += 1;
      const key = dayKey(o.createdAt);
      if (dayMap[key]) {
        dayMap[key].amount += o.total;
        dayMap[key].count += 1;
      }
      if (key === todayKey) {
        todayAmount += o.total;
        todayCount += 1;
        if (o.payMethod === 'wechat') wechatAmount += o.total;
        else alipayAmount += o.total;
      }
      for (const it of o.items) {
        const m = (productMap[it.name] = productMap[it.name] || { name: it.name, qty: 0, amount: 0 });
        m.qty += it.qty;
        m.amount += it.price * it.qty;
      }
    }

    const topProducts = Object.values(productMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8);

    const statusCount = { unpaid: 0, active: 0, done: 0, cancelled: 0 };
    for (const o of orders) {
      if (o.status === 'unpaid') statusCount.unpaid += 1;
      else if (o.status === 'done') statusCount.done += 1;
      else if (o.status === 'cancelled') statusCount.cancelled += 1;
      else statusCount.active += 1;
    }

    return { days, todayCount, todayAmount, totalAmount, totalCount, wechatAmount, alipayAmount, topProducts, statusCount };
  }, [orders]);

  // ---------- 近 7 日趋势：营业额柱 + 订单数折线 ----------
  const trendOption = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          const day = stats.days[params[0].dataIndex];
          return `${day.label}<br/>营业额：¥${(day.amount / 100).toFixed(2)}<br/>订单数：${day.count} 单`;
        },
      },
      grid: { left: 44, right: 36, top: 36, bottom: 26 },
      xAxis: { type: 'category', data: stats.days.map((d) => d.label), axisTick: { alignWithLabel: true } },
      yAxis: [
        { type: 'value', name: '营业额(元)', axisLabel: { formatter: '¥{value}' } },
        { type: 'value', name: '订单数', minInterval: 1 },
      ],
      series: [
        {
          name: '营业额',
          type: 'bar',
          barMaxWidth: 34,
          data: stats.days.map((d) => +(d.amount / 100).toFixed(2)),
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: '#33a3ff' },
                { offset: 1, color: '#0089ff' },
              ],
            },
          },
        },
        {
          name: '订单数',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          symbolSize: 6,
          data: stats.days.map((d) => d.count),
          itemStyle: { color: '#fa8c16' },
          lineStyle: { width: 2 },
        },
      ],
    }),
    [stats.days]
  );

  // ---------- 今日支付方式饼图 ----------
  const paySum = stats.wechatAmount + stats.alipayAmount;
  const payOption = useMemo(
    () => ({
      tooltip: {
        trigger: 'item',
        formatter: (p) => `${p.name}<br/>¥${p.value.toFixed(2)}（${p.percent}%）`,
      },
      legend: { bottom: 0 },
      series: [
        {
          type: 'pie',
          radius: ['45%', '70%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          label: { show: false },
          data: [
            { name: '微信', value: +(stats.wechatAmount / 100).toFixed(2), itemStyle: { color: '#09bb07' } },
            { name: '支付宝', value: +(stats.alipayAmount / 100).toFixed(2), itemStyle: { color: '#1677ff' } },
          ],
        },
      ],
    }),
    [stats.wechatAmount, stats.alipayAmount]
  );

  // ---------- 热销商品横向条形图 ----------
  const rankOption = useMemo(() => {
    const list = [...stats.topProducts].reverse();
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          const p = list[params[0].dataIndex];
          return `${p.name}<br/>销量：${p.qty} 份<br/>销售额：¥${(p.amount / 100).toFixed(2)}`;
        },
      },
      grid: { left: 10, right: 50, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: 'value', minInterval: 1, axisLabel: { formatter: '{value} 份' } },
      yAxis: { type: 'category', data: list.map((p) => p.name), inverse: false },
      series: [
        {
          type: 'bar',
          barMaxWidth: 18,
          data: list.map((p) => p.qty),
          label: { show: true, position: 'right', formatter: '{c}' },
          itemStyle: {
            borderRadius: [0, 4, 4, 0],
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: '#ffc53d' },
                { offset: 1, color: '#fa8c16' },
              ],
            },
          },
        },
      ],
    };
  }, [stats.topProducts]);

  return (
    <div>
      {/* 核心指标 */}
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="今日订单" value={stats.todayCount} suffix="单" />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="今日营业额" value={stats.todayAmount / 100} precision={2} prefix="¥" />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="今日客单价"
              value={stats.todayCount ? stats.todayAmount / stats.todayCount / 100 : 0}
              precision={2}
              prefix="¥"
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="累计营业额"
              value={stats.totalAmount / 100}
              precision={2}
              prefix="¥"
              suffix={<span style={{ fontSize: 12, color: '#999' }}>/ {stats.totalCount} 单</span>}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={16}>
          <Card title="近 7 日营业额趋势" size="small">
            <ReactECharts option={trendOption} style={{ height: 280 }} notMerge />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="今日支付方式占比" size="small" style={{ marginBottom: 16 }}>
            {paySum === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="今日暂无已付款订单" />
            ) : (
              <ReactECharts option={payOption} style={{ height: 200 }} notMerge />
            )}
          </Card>
          <Card title="订单状态" size="small">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Tag color="orange">待支付 {stats.statusCount.unpaid}</Tag>
              <Tag color="blue">进行中 {stats.statusCount.active}</Tag>
              <Tag color="default">已完成 {stats.statusCount.done}</Tag>
              <Tag color="red">已取消 {stats.statusCount.cancelled}</Tag>
            </div>
          </Card>
        </Col>
      </Row>

      <Row style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card title="热销商品 TOP 8（累计销量）" size="small">
            {stats.topProducts.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无已售商品" />
            ) : (
              <ReactECharts option={rankOption} style={{ height: Math.max(stats.topProducts.length * 36, 200) }} notMerge />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
