'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ShoppingCart,
  TrendingUp,
  Wallet,
  AlertTriangle,
  Package,
  Users,
  Truck,
  ArrowUp,
  ArrowDown,
  Banknote,
  CreditCard,
  BarChart3,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { formatCurrency, formatNumber } from '@/lib/utils';

interface DashboardData {
  todayRevenue: number;
  todayOrders: number;
  todayCashRevenue: number;
  todayTransferRevenue: number;
  todayDebtRevenue: number;
  totalCustomerDebt: number;
  totalSupplierDebt: number;
  lowStockCount: number;
  totalProducts: number;
  totalCustomers: number;
  totalSuppliers: number;
  recentSales: Array<{
    id: string;
    code: string;
    totalAmount: number;
    saleDate: string;
    customerName: string | null;
  }>;
  lowStockProducts: Array<{
    id: string;
    name: string;
    stock: number;
    minStock: number;
    unit: string;
  }>;
}

interface ChartDataPoint {
  date: string;
  label: string;
  revenue: number;
  profit: number;
  orders: number;
}

interface ChartResponse {
  chartData: ChartDataPoint[];
  summary: { totalRevenue: number; totalProfit: number; totalOrders: number };
}

type ChartPeriod = 'week' | 'month' | 'year' | 'custom';

function getDateRange(period: ChartPeriod, customFrom?: string, customTo?: string) {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (period === 'custom' && customFrom && customTo) {
    return { from: customFrom, to: customTo };
  }

  const to = fmt(now);

  if (period === 'week') {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    return { from: fmt(from), to };
  }

  if (period === 'year') {
    return { from: `${now.getFullYear()}-01-01`, to };
  }

  // month (default)
  return { from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, to };
}

// Custom tooltip cho biểu đồ
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 8,
      padding: '10px 14px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      fontSize: 13,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-heading)' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
          <span style={{ color: 'var(--text-muted)' }}>{p.name}:</span>
          <span style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Chart state
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [chartData, setChartData] = useState<ChartResponse | null>(null);
  const [chartLoading, setChartLoading] = useState(false);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((res) => {
        if (!res.ok) throw new Error('API error');
        return res.json();
      })
      .then(setData)
      .catch((e) => {
        console.error(e);
        setError('Không thể tải dữ liệu bảng điều khiển');
      })
      .finally(() => setLoading(false));
  }, []);

  const fetchChart = useCallback(() => {
    const { from, to } = getDateRange(chartPeriod, customFrom, customTo);
    if (!from || !to) return;

    setChartLoading(true);
    fetch(`/api/dashboard/chart?from=${from}&to=${to}`)
      .then((res) => {
        if (!res.ok) throw new Error('Chart API error');
        return res.json();
      })
      .then(setChartData)
      .catch(console.error)
      .finally(() => setChartLoading(false));
  }, [chartPeriod, customFrom, customTo]);

  useEffect(() => {
    fetchChart();
  }, [fetchChart]);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        <AlertTriangle size={40} style={{ marginBottom: 12, color: 'var(--warning)' }} />
        <h3 style={{ color: 'var(--text-heading)', marginBottom: 8 }}>{error || 'Không thể tải dữ liệu'}</h3>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Thử lại</button>
      </div>
    );
  }

  const periodLabels: Record<ChartPeriod, string> = {
    week: '7 ngày',
    month: 'Tháng này',
    year: 'Năm nay',
    custom: 'Tùy chọn',
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-heading)', marginBottom: 4 }}>
          Bảng điều khiển
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Tổng quan hoạt động kinh doanh hôm nay
        </p>
      </div>

      {/* Stat Cards */}
      <div className="card-grid card-grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-icon accent">
            <TrendingUp size={22} />
          </div>
          <div className="stat-content">
            <h3>Doanh thu hôm nay</h3>
            <div className="stat-value">{formatCurrency(data.todayRevenue)}</div>
            <div className="stat-sub">{data.todayOrders} đơn hàng</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon info">
            <Banknote size={22} />
          </div>
          <div className="stat-content">
            <h3>Tiền mặt hôm nay</h3>
            <div className="stat-value">{formatCurrency(data.todayCashRevenue)}</div>
            <div className="stat-sub">💵 Cash</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon accent">
            <CreditCard size={22} />
          </div>
          <div className="stat-content">
            <h3>Chuyển khoản hôm nay</h3>
            <div className="stat-value">{formatCurrency(data.todayTransferRevenue)}</div>
            <div className="stat-sub">🏦 Transfer</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
            <Wallet size={22} />
          </div>
          <div className="stat-content">
            <h3>Nợ hôm nay</h3>
            <div className="stat-value" style={{ color: data.todayDebtRevenue > 0 ? 'var(--danger)' : undefined }}>{formatCurrency(data.todayDebtRevenue)}</div>
            <div className="stat-sub">📋 Bán nợ</div>
          </div>
        </div>
      </div>

      <div className="card-grid card-grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-icon warning">
            <Wallet size={22} />
          </div>
          <div className="stat-content">
            <h3>Khách nợ</h3>
            <div className="stat-value text-warning">{formatCurrency(data.totalCustomerDebt)}</div>
            <div className="stat-sub">
              <ArrowDown size={12} style={{ display: 'inline' }} /> Phải thu
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon danger">
            <Wallet size={22} />
          </div>
          <div className="stat-content">
            <h3>Nợ nhà cung cấp</h3>
            <div className="stat-value text-danger">{formatCurrency(data.totalSupplierDebt)}</div>
            <div className="stat-sub">
              <ArrowUp size={12} style={{ display: 'inline' }} /> Phải trả
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: data.lowStockCount > 0 ? 'var(--danger-bg)' : 'var(--success-bg)', color: data.lowStockCount > 0 ? 'var(--danger)' : 'var(--success)' }}>
            <AlertTriangle size={22} />
          </div>
          <div className="stat-content">
            <h3>Sắp hết hàng</h3>
            <div className="stat-value" style={{ color: data.lowStockCount > 0 ? 'var(--danger)' : 'var(--success)' }}>
              {data.lowStockCount} sản phẩm
            </div>
            <div className="stat-sub">Cần nhập thêm</div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="card-grid card-grid-3" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-icon info">
            <Package size={22} />
          </div>
          <div className="stat-content">
            <h3>Tổng sản phẩm</h3>
            <div className="stat-value">{formatNumber(data.totalProducts)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon success">
            <Users size={22} />
          </div>
          <div className="stat-content">
            <h3>Khách hàng</h3>
            <div className="stat-value">{formatNumber(data.totalCustomers)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon accent">
            <Truck size={22} />
          </div>
          <div className="stat-content">
            <h3>Nhà cung cấp</h3>
            <div className="stat-value">{formatNumber(data.totalSuppliers)}</div>
          </div>
        </div>
      </div>

      {/* ===== BIỂU ĐỒ DOANH THU ===== */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <h3 className="card-title" style={{ margin: 0 }}>
            <BarChart3 size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: -2 }} />
            Biểu đồ doanh thu
          </h3>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {(['week', 'month', 'year', 'custom'] as ChartPeriod[]).map((p) => (
              <button
                key={p}
                className={`btn btn-sm ${chartPeriod === p ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setChartPeriod(p)}
                style={{ fontSize: 12, padding: '4px 12px' }}
              >
                {periodLabels[p]}
              </button>
            ))}
          </div>
        </div>

        {chartPeriod === 'custom' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 16px 12px', flexWrap: 'wrap' }}>
            <input
              type="date"
              className="form-input"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={{ width: 'auto', fontSize: 13 }}
            />
            <span style={{ color: 'var(--text-muted)' }}>→</span>
            <input
              type="date"
              className="form-input"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              style={{ width: 'auto', fontSize: 13 }}
            />
            <button className="btn btn-primary btn-sm" onClick={fetchChart} style={{ fontSize: 12 }}>
              Xem
            </button>
          </div>
        )}

        {/* Summary */}
        {chartData?.summary && (
          <div style={{ display: 'flex', gap: 24, padding: '0 16px 12px', flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Tổng doanh thu</span>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{formatCurrency(chartData.summary.totalRevenue)}</div>
            </div>
            <div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Lợi nhuận</span>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--success)' }}>{formatCurrency(chartData.summary.totalProfit)}</div>
            </div>
            <div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Tổng đơn</span>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-heading)' }}>{formatNumber(chartData.summary.totalOrders)}</div>
            </div>
          </div>
        )}

        {/* Chart */}
        <div style={{ padding: '0 8px 16px', height: 320 }}>
          {chartLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <div className="loading-spinner" />
            </div>
          ) : chartData?.chartData?.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData.chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                />
                <YAxis
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name="Doanh thu"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#6366f1' }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  name="Lợi nhuận"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: '#22c55e' }}
                  activeDot={{ r: 4 }}
                  strokeDasharray="5 3"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)' }}>
              Không có dữ liệu trong khoảng thời gian này
            </div>
          )}
        </div>
      </div>

      {/* Two columns: Recent Sales + Low Stock */}
      <div className="card-grid card-grid-2">
        {/* Recent Sales */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <ShoppingCart size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: -2 }} />
              Đơn hàng gần đây
            </h3>
          </div>
          {data.recentSales.length === 0 ? (
            <div className="empty-state">
              <ShoppingCart />
              <h3>Chưa có đơn hàng</h3>
              <p>Bắt đầu bán hàng ngay!</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Mã đơn</th>
                    <th>Khách</th>
                    <th className="text-right">Tổng tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentSales.map((sale) => (
                    <tr key={sale.id}>
                      <td style={{ fontWeight: 600 }}>{sale.code}</td>
                      <td>{sale.customerName || 'Khách lẻ'}</td>
                      <td className="text-right" style={{ fontWeight: 600 }}>
                        {formatCurrency(sale.totalAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Low Stock Warning */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <AlertTriangle size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: -2, color: 'var(--warning)' }} />
              Cảnh báo tồn kho
            </h3>
          </div>
          {data.lowStockProducts.length === 0 ? (
            <div className="empty-state">
              <Package />
              <h3>Tồn kho ổn</h3>
              <p>Không có sản phẩm nào sắp hết</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Sản phẩm</th>
                    <th className="text-right">Tồn kho</th>
                    <th className="text-right">Tối thiểu</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lowStockProducts.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td className="text-right text-danger" style={{ fontWeight: 600 }}>
                        {formatNumber(p.stock)} {p.unit}
                      </td>
                      <td className="text-right text-muted">
                        {formatNumber(p.minStock)} {p.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}