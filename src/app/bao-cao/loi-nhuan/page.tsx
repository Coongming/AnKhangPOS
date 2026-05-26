'use client';

import { useEffect, useState, useCallback } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Minus } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { formatCurrency } from '@/lib/utils';

interface ProfitData {
  totalRevenue: number; totalCost: number; totalExpenses: number;
  grossProfit: number; netProfit: number;
  expenseByCategory: Array<{ name: string; amount: number }>;
}

export default function ProfitReportPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<ProfitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: 'profit', period });
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const res = await fetch(`/api/reports?${params}`);
      setData(await res.json());
    } catch { showToast('error', 'Lỗi tải báo cáo'); }
    finally { setLoading(false); }
  }, [period, dateFrom, dateTo, showToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-heading)' }}>Báo cáo lợi nhuận</h2>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          {['day', 'week', 'month', 'year'].map((p) => (
            <button key={p} className={`btn ${period === p ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setPeriod(p); setDateFrom(''); setDateTo(''); }}>
              {{ day: 'Hôm nay', week: '7 ngày', month: 'Tháng', year: 'Năm' }[p]}
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
          {/* Profit Waterfall */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header"><h3 className="card-title">Cơ cấu lợi nhuận</h3></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--accent-bg)', borderRadius: 'var(--radius-md)' }}>
                <span><TrendingUp size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: -3 }} /> Doanh thu</span>
                <span style={{ fontWeight: 800, fontSize: 18 }}>{formatCurrency(data.totalRevenue)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--danger-bg)', borderRadius: 'var(--radius-md)' }}>
                <span><Minus size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: -3 }} /> Giá vốn hàng bán</span>
                <span style={{ fontWeight: 700, color: 'var(--danger)' }}>- {formatCurrency(data.totalCost)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: data.grossProfit >= 0 ? 'var(--success-bg)' : 'var(--danger-bg)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--success)' }}>
                <span style={{ fontWeight: 700 }}>= Lợi nhuận gộp</span>
                <span style={{ fontWeight: 800, fontSize: 18, color: data.grossProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(data.grossProfit)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--warning-bg)', borderRadius: 'var(--radius-md)' }}>
                <span><Minus size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: -3 }} /> Chi phí vận hành</span>
                <span style={{ fontWeight: 700, color: 'var(--warning)' }}>- {formatCurrency(data.totalExpenses)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', background: data.netProfit >= 0 ? 'var(--success-bg)' : 'var(--danger-bg)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid', borderLeftColor: data.netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                <span style={{ fontWeight: 800, fontSize: 16 }}>= LỢI NHUẬN RÒNG</span>
                <span style={{ fontWeight: 800, fontSize: 22, color: data.netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(data.netProfit)}</span>
              </div>
            </div>
          </div>

          {/* Expense Breakdown */}
          {data.expenseByCategory.length > 0 && (
            <div className="card">
              <div className="card-header"><h3 className="card-title">Chi phí theo danh mục</h3></div>
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>Danh mục</th><th className="text-right">Số tiền</th><th className="text-right">Tỷ lệ</th></tr></thead>
                  <tbody>
                    {data.expenseByCategory.sort((a, b) => b.amount - a.amount).map((e) => (
                      <tr key={e.name}>
                        <td style={{ fontWeight: 600 }}>{e.name}</td>
                        <td className="text-right font-bold">{formatCurrency(e.amount)}</td>
                        <td className="text-right text-muted">{data.totalExpenses > 0 ? ((e.amount / data.totalExpenses) * 100).toFixed(1) : 0}%</td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: 700, background: 'var(--bg-secondary)' }}>
                      <td>Tổng chi phí</td>
                      <td className="text-right">{formatCurrency(data.totalExpenses)}</td>
                      <td className="text-right">100%</td>
                    </tr>
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
