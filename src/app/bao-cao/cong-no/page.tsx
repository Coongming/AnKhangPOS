'use client';

import { useEffect, useState, useCallback } from 'react';
import { Wallet, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { formatCurrency } from '@/lib/utils';

interface DebtData {
  totalCustomerDebt: number; totalSupplierDebt: number;
  customers: Array<{ id: string; code: string; name: string; phone: string | null; debt: number }>;
  suppliers: Array<{ id: string; code: string; name: string; phone: string | null; debt: number }>;
}

export default function DebtReportPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<DebtData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/reports?type=debt');
      setData(await res.json());
    } catch { showToast('error', 'Lỗi tải báo cáo'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="loading-page"><div className="loading-spinner" /></div>;
  if (!data) return null;

  return (
    <div>
      <div style={{ marginBottom: 24 }}><h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-heading)' }}>Báo cáo công nợ</h2></div>

      <div className="card-grid card-grid-2" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-icon warning"><ArrowDownCircle size={22} /></div>
          <div className="stat-content"><h3>Tổng phải thu (khách nợ)</h3>
            <div className="stat-value text-warning">{formatCurrency(data.totalCustomerDebt)}</div>
            <div className="stat-sub">{data.customers.length} khách nợ</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon danger"><ArrowUpCircle size={22} /></div>
          <div className="stat-content"><h3>Tổng phải trả (nợ NCC)</h3>
            <div className="stat-value text-danger">{formatCurrency(data.totalSupplierDebt)}</div>
            <div className="stat-sub">{data.suppliers.length} NCC nợ</div>
          </div>
        </div>
      </div>

      <div className="card-grid card-grid-2">
        <div className="card"><div className="card-header"><h3 className="card-title">Chi tiết khách nợ</h3></div>
          {data.customers.length === 0 ? <div className="empty-state"><Wallet /><h3>Không có khách nợ</h3></div> : (
            <div className="table-wrapper"><table className="table"><thead><tr><th>Mã</th><th>Tên</th><th>SĐT</th><th className="text-right">Số nợ</th></tr></thead>
              <tbody>{data.customers.map(c => <tr key={c.id}><td style={{color:'var(--accent)',fontWeight:600}}>{c.code}</td><td style={{fontWeight:600}}>{c.name}</td><td>{c.phone||'—'}</td><td className="text-right font-bold text-warning">{formatCurrency(c.debt)}</td></tr>)}</tbody>
            </table></div>
          )}
        </div>
        <div className="card"><div className="card-header"><h3 className="card-title">Chi tiết nợ NCC</h3></div>
          {data.suppliers.length === 0 ? <div className="empty-state"><Wallet /><h3>Không nợ NCC</h3></div> : (
            <div className="table-wrapper"><table className="table"><thead><tr><th>Mã</th><th>Tên</th><th>SĐT</th><th className="text-right">Số nợ</th></tr></thead>
              <tbody>{data.suppliers.map(s => <tr key={s.id}><td style={{color:'var(--accent)',fontWeight:600}}>{s.code}</td><td style={{fontWeight:600}}>{s.name}</td><td>{s.phone||'—'}</td><td className="text-right font-bold text-danger">{formatCurrency(s.debt)}</td></tr>)}</tbody>
            </table></div>
          )}
        </div>
      </div>
    </div>
  );
}
