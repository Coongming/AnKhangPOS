'use client';

import { useEffect, useState, useCallback } from 'react';
import { Wallet, ArrowDownCircle, ArrowUpCircle, TrendingUp } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { formatCurrency } from '@/lib/utils';

interface CashflowData {
  moneyIn: {
    cashSales: number;
    transferSales: number;
    customerPayments: number;
    capitalDeposits: number;
    total: number;
  };
  moneyOut: {
    supplierPayments: number;
    operatingExpenses: number;
    cashflowOut: number;
    salary: number;
    total: number;
  };
  balance: number;
  operatingExpensesByCategory: Array<{ name: string; amount: number }>;
  cashflowExpensesByCategory: Array<{ name: string; amount: number }>;
}

export default function CashflowReportPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<CashflowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: 'cashflow', period });
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const res = await fetch(`/api/reports?${params}`);
      setData(await res.json());
    } catch { showToast('error', 'Lỗi tải báo cáo'); }
    finally { setLoading(false); }
  }, [period, dateFrom, dateTo, showToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const Row = ({ label, value, color, bold, indent }: { label: string; value: number; color?: string; bold?: boolean; indent?: boolean }) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '10px 16px',
      fontWeight: bold ? 800 : 400, fontSize: bold ? 16 : 14,
      paddingLeft: indent ? 40 : 16,
      color: color || 'var(--text-primary)',
    }}>
      <span>{label}</span>
      <span style={{ color: color, fontWeight: bold ? 800 : 600 }}>
        {value < 0 ? '- ' : ''}{formatCurrency(Math.abs(value))}
      </span>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-heading)' }}>
          <Wallet size={22} style={{ display: 'inline', marginRight: 8, verticalAlign: -4 }} />
          Sổ quỹ (Dòng tiền)
        </h2>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          {['all', 'day', 'week', 'month', 'year'].map((p) => (
            <button key={p} className={`btn ${period === p ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setPeriod(p); setDateFrom(''); setDateTo(''); }}>
              {{ all: 'Tất cả', day: 'Hôm nay', week: '7 ngày', month: 'Tháng', year: 'Năm' }[p]}
            </button>
          ))}
          <span className="text-muted" style={{ margin: '0 8px' }}>|</span>
          <input className="form-input" type="date" style={{ width: 145 }} value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPeriod('custom'); }} />
          <span className="text-muted">đến</span>
          <input className="form-input" type="date" style={{ width: 145 }} value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPeriod('custom'); }} />
        </div>
      </div>

      {loading ? <div className="loading-page"><div className="loading-spinner" /></div> : data && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {/* Left: Cashflow summary */}
          <div style={{ flex: 1, minWidth: 350 }}>
            {/* TIỀN VÀO */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <h3 className="card-title" style={{ color: 'var(--success)' }}>
                  <ArrowDownCircle size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: -3 }} />
                  📥 TIỀN VÀO
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <Row label="💵 Bán hàng (tiền mặt)" value={data.moneyIn.cashSales} indent />
                <Row label="🏦 Bán hàng (chuyển khoản)" value={data.moneyIn.transferSales} indent />
                <Row label="💳 Khách trả nợ" value={data.moneyIn.customerPayments} indent />
                {data.moneyIn.capitalDeposits > 0 && (
                  <Row label="💰 Nộp thêm vốn" value={data.moneyIn.capitalDeposits} indent />
                )}
                <div style={{ borderTop: '2px solid var(--success)', margin: '4px 16px 0' }} />
                <Row label="Tổng tiền vào" value={data.moneyIn.total} color="var(--success)" bold />
              </div>
            </div>

            {/* TIỀN RA */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <h3 className="card-title" style={{ color: 'var(--danger)' }}>
                  <ArrowUpCircle size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: -3 }} />
                  📤 TIỀN RA
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <Row label="📦 Trả nhà cung cấp" value={data.moneyOut.supplierPayments} indent />
                <Row label="🏭 Chi phí vận hành" value={data.moneyOut.operatingExpenses} indent />
                {data.moneyOut.salary > 0 && (
                  <Row label="👷 Lương nhân viên" value={data.moneyOut.salary} indent />
                )}
                {data.moneyOut.cashflowOut > 0 && (
                  <Row label="💸 Rút lợi nhuận / cá nhân" value={data.moneyOut.cashflowOut} indent />
                )}
                <div style={{ borderTop: '2px solid var(--danger)', margin: '4px 16px 0' }} />
                <Row label="Tổng tiền ra" value={data.moneyOut.total} color="var(--danger)" bold />
              </div>
            </div>

            {/* SỐ DƯ */}
            <div className="card">
              <div style={{
                display: 'flex', justifyContent: 'space-between', padding: '20px 24px',
                background: data.balance >= 0 ? 'var(--success-bg)' : 'var(--danger-bg)',
                borderRadius: 'var(--radius-md)',
                borderLeft: '5px solid',
                borderLeftColor: data.balance >= 0 ? 'var(--success)' : 'var(--danger)',
              }}>
                <span style={{ fontWeight: 800, fontSize: 18 }}>
                  <TrendingUp size={20} style={{ display: 'inline', marginRight: 8, verticalAlign: -4 }} />
                  SỐ DƯ CUỐI KỲ
                </span>
                <span style={{
                  fontWeight: 800, fontSize: 24,
                  color: data.balance >= 0 ? 'var(--success)' : 'var(--danger)',
                }}>
                  {data.balance < 0 ? '- ' : ''}{formatCurrency(Math.abs(data.balance))}
                </span>
              </div>
              <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                = Tổng tiền vào ({formatCurrency(data.moneyIn.total)}) - Tổng tiền ra ({formatCurrency(data.moneyOut.total)})
              </div>
            </div>
          </div>

          {/* Right: Expense breakdown */}
          <div style={{ width: 340, flexShrink: 0 }}>
            {/* Chi phí vận hành breakdown */}
            {data.operatingExpensesByCategory.length > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header"><h3 className="card-title">🏭 Chi phí vận hành chi tiết</h3></div>
                <div className="table-wrapper">
                  <table className="table">
                    <thead><tr><th>Danh mục</th><th className="text-right">Số tiền</th></tr></thead>
                    <tbody>
                      {data.operatingExpensesByCategory.sort((a, b) => b.amount - a.amount).map((e) => (
                        <tr key={e.name}>
                          <td style={{ fontWeight: 600 }}>{e.name}</td>
                          <td className="text-right font-bold">{formatCurrency(e.amount)}</td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: 700, background: 'var(--bg-secondary)' }}>
                        <td>Tổng</td>
                        <td className="text-right">{formatCurrency(data.moneyOut.operatingExpenses)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Lưu chuyển tiền breakdown */}
            {data.cashflowExpensesByCategory.length > 0 && (
              <div className="card">
                <div className="card-header"><h3 className="card-title">💰 Lưu chuyển tiền chi tiết</h3></div>
                <div className="table-wrapper">
                  <table className="table">
                    <thead><tr><th>Danh mục</th><th className="text-right">Số tiền</th></tr></thead>
                    <tbody>
                      {data.cashflowExpensesByCategory.sort((a, b) => b.amount - a.amount).map((e) => (
                        <tr key={e.name}>
                          <td style={{ fontWeight: 600 }}>{e.name}</td>
                          <td className="text-right font-bold">{formatCurrency(e.amount)}</td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: 700, background: 'var(--bg-secondary)' }}>
                        <td>Tổng</td>
                        <td className="text-right">{formatCurrency(data.moneyOut.cashflowOut)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ background: 'var(--info-bg)', borderRadius: 'var(--radius-md)', padding: 12, marginTop: 16, fontSize: 13, color: 'var(--info)' }}>
              💡 Số dư cuối kỳ cho biết <strong>tiền thực tế</strong> còn lại trong quỹ (két sắt + tài khoản). Nếu số dư không khớp → kiểm tra các khoản chưa ghi nhận.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
