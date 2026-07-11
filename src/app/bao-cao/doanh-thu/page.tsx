'use client';

import { useEffect, useState, useCallback } from 'react';
import { BarChart3, TrendingUp, Calendar, Banknote, CreditCard } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils';

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

interface RevenueData {
  totalRevenue: number; totalCost: number; totalOrders: number; grossProfit: number;
  cashRevenue: number; transferRevenue: number;
  dailyData: Array<{ date: string; revenue: number; orders: number; cashRevenue: number; transferRevenue: number }>;
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

export default function RevenueReportPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: 'revenue', period });
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const res = await fetch(`/api/reports?${params}`);
      setData(await res.json());
    } catch { showToast('error', 'Lỗi tải báo cáo'); }
    finally { setLoading(false); }
  }, [period, dateFrom, dateTo, showToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const maxRevenue = data?.dailyData ? Math.max(...data.dailyData.map(d => d.revenue), 1) : 1;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-heading)' }}>Báo cáo doanh thu</h2>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          {['all', 'day', 'week', 'month', 'year'].map((p) => (
            <button key={p} className={`btn ${period === p ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setPeriod(p); setDateFrom(''); setDateTo(''); }}>
              {{ all: 'Tất cả', day: 'Hôm nay', week: 'Tuần', month: 'Tháng', year: 'Năm' }[p]}
            </button>
          ))}
          <span className="text-muted" style={{ margin: '0 8px' }}>|</span>
          <input className="form-input" type="date" style={{ width: 145 }} value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPeriod('custom'); }} />
          <span className="text-muted">đến</span>
          <input className="form-input" type="date" style={{ width: 145 }} value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPeriod('custom'); }} />
        </div>
      </div>

      {loading ? <div className="loading-page"><div className="loading-spinner" /></div> : data && (
        <>
          <div className="card-grid card-grid-3" style={{ marginBottom: 24 }}>
            <div className="stat-card">
              <div className="stat-icon accent"><BarChart3 size={22} /></div>
              <div className="stat-content"><h3>Tổng doanh thu</h3><div className="stat-value">{formatCurrency(data.totalRevenue)}</div></div>
            </div>
            <div className="stat-card">
              <div className="stat-icon info"><Banknote size={22} /></div>
              <div className="stat-content"><h3>Tiền mặt</h3><div className="stat-value">{formatCurrency(data.cashRevenue)}</div></div>
            </div>
            <div className="stat-card">
              <div className="stat-icon accent"><CreditCard size={22} /></div>
              <div className="stat-content"><h3>Chuyển khoản</h3><div className="stat-value">{formatCurrency(data.transferRevenue)}</div></div>
            </div>
          </div>

          <div className="card-grid card-grid-4" style={{ marginBottom: 24 }}>
            <div className="stat-card">
              <div className="stat-icon success"><TrendingUp size={22} /></div>
              <div className="stat-content"><h3>Lợi nhuận gộp</h3><div className="stat-value text-success">{formatCurrency(data.grossProfit)}</div></div>
            </div>
            <div className="stat-card">
              <div className="stat-icon warning"><Calendar size={22} /></div>
              <div className="stat-content"><h3>Số đơn hàng</h3><div className="stat-value">{formatNumber(data.totalOrders)}</div></div>
            </div>
            <div className="stat-card">
              <div className="stat-icon info"><BarChart3 size={22} /></div>
              <div className="stat-content"><h3>Giá vốn</h3><div className="stat-value text-muted">{formatCurrency(data.totalCost)}</div></div>
            </div>
          </div>

          {/* Recharts Line Chart */}
          <div className="card">
            <div className="card-header"><h3 className="card-title">Doanh thu theo ngày</h3></div>
            <div style={{ padding: '0 8px 16px', height: 320 }}>
              {data.dailyData.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)' }}>
                  Chưa có dữ liệu trong khoảng thời gian này
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart 
                    data={data.dailyData.map(d => ({ ...d, label: `${new Date(d.date).getDate()}/${new Date(d.date).getMonth() + 1}` }))} 
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
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
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      name="Doanh thu"
                      stroke="#6366f1"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#6366f1' }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Daily table */}
          {data.dailyData.length > 0 && (
            <div className="card mt-2">
              <div className="card-header"><h3 className="card-title">Chi tiết</h3></div>
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>Ngày</th><th className="text-right">Doanh thu</th><th className="text-right">Tiền mặt</th><th className="text-right">Chuyển khoản</th><th className="text-center">Số đơn</th></tr></thead>
                  <tbody>
                    {data.dailyData.map((d) => (
                      <tr key={d.date}><td>{formatDate(d.date)}</td><td className="text-right font-bold">{formatCurrency(d.revenue)}</td><td className="text-right">{formatCurrency(d.cashRevenue)}</td><td className="text-right">{formatCurrency(d.transferRevenue)}</td><td className="text-center">{d.orders}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
