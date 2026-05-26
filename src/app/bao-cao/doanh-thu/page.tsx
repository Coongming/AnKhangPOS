'use client';

import { useEffect, useState, useCallback } from 'react';
import { BarChart3, TrendingUp, Calendar, Banknote, CreditCard } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils';

interface RevenueData {
  totalRevenue: number; totalCost: number; totalOrders: number; grossProfit: number;
  cashRevenue: number; transferRevenue: number;
  dailyData: Array<{ date: string; revenue: number; orders: number; cashRevenue: number; transferRevenue: number }>;
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
          {['day', 'week', 'month', 'year'].map((p) => (
            <button key={p} className={`btn ${period === p ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setPeriod(p); setDateFrom(''); setDateTo(''); }}>
              {{ day: 'Hôm nay', week: 'Tuần', month: 'Tháng', year: 'Năm' }[p]}
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

          {/* Simple bar chart */}
          <div className="card">
            <div className="card-header"><h3 className="card-title">Doanh thu theo ngày</h3></div>
            {data.dailyData.length === 0 ? (
              <div className="empty-state"><BarChart3 /><h3>Chưa có dữ liệu</h3></div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 200, padding: '0 8px' }}>
                {data.dailyData.map((d) => (
                  <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatCurrency(d.revenue)}</div>
                    <div style={{
                      width: '100%', maxWidth: 50,
                      height: `${Math.max((d.revenue / maxRevenue) * 160, 4)}px`,
                      background: 'linear-gradient(180deg, var(--accent), #a78bfa)',
                      borderRadius: '4px 4px 0 0',
                      transition: 'height 0.3s ease',
                    }} />
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(d.date).getDate()}/{new Date(d.date).getMonth() + 1}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Daily table */}
          {data.dailyData.length > 0 && (
            <div className="card mt-2">
              <div className="card-header"><h3 className="card-title">Chi tiết</h3></div>
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>Ngày</th><th className="text-right">Doanh thu</th><th className="text-right">Tiền mặt</th><th className="text-right">Chuyển khoản</th><th className="text-right">Số đơn</th></tr></thead>
                  <tbody>
                    {data.dailyData.map((d) => (
                      <tr key={d.date}><td>{formatDate(d.date)}</td><td className="text-right font-bold">{formatCurrency(d.revenue)}</td><td className="text-right">{formatCurrency(d.cashRevenue)}</td><td className="text-right">{formatCurrency(d.transferRevenue)}</td><td className="text-right">{d.orders}</td></tr>
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
