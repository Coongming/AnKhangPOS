'use client';

import { useEffect, useState, useCallback } from 'react';
import { Wallet, ArrowDownCircle, ArrowUpCircle, DollarSign } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { formatCurrency, formatDateTime } from '@/lib/utils';

interface Customer { id: string; code: string; name: string; debt: number; phone: string | null; }
interface Supplier { id: string; code: string; name: string; debt: number; phone: string | null; }
interface DebtTransaction { id: string; type: string; amount: number; balanceAfter: number; notes: string | null; createdAt: string; customer?: { name: string } | null; supplier?: { name: string } | null; }

export default function DebtPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'customer' | 'supplier'>('customer');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [transactions, setTransactions] = useState<DebtTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payTarget, setPayTarget] = useState<{ id: string; name: string; debt: number; type: 'customer_payment' | 'supplier_payment' } | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payNotes, setPayNotes] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [custRes, supRes, txRes] = await Promise.all([
        fetch('/api/customers'),
        fetch('/api/suppliers'),
        fetch(`/api/debts?type=${tab}`),
      ]);
      setCustomers((await custRes.json()).filter((c: Customer) => c.debt > 0));
      setSuppliers((await supRes.json()).filter((s: Supplier) => s.debt > 0));
      setTransactions(await txRes.json());
    } catch { showToast('error', 'Lỗi tải dữ liệu'); }
    finally { setLoading(false); }
  }, [tab, showToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openPay = (id: string, name: string, debt: number, type: 'customer_payment' | 'supplier_payment') => {
    setPayTarget({ id, name, debt, type });
    setPayAmount('');
    setPayNotes('');
    setShowPayModal(true);
  };

  const handlePay = async () => {
    if (!payTarget || !payAmount) { showToast('error', 'Vui lòng nhập số tiền'); return; }
    try {
      const res = await fetch('/api/debts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: payTarget.type, entityId: payTarget.id, amount: payAmount, notes: payNotes }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', 'Đã ghi nhận thanh toán');
      setShowPayModal(false);
      fetchData();
    } catch (err) { showToast('error', err instanceof Error ? err.message : 'Lỗi'); }
  };

  const debtEntities = tab === 'customer' ? customers : suppliers;
  const totalDebt = debtEntities.reduce((sum, e) => sum + e.debt, 0);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-heading)' }}>Quản lý công nợ</h2>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className={`btn ${tab === 'customer' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('customer')}>
          <ArrowDownCircle size={16} /> Khách hàng nợ
        </button>
        <button className={`btn ${tab === 'supplier' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('supplier')}>
          <ArrowUpCircle size={16} /> Nợ nhà cung cấp
        </button>
      </div>

      {/* Summary */}
      <div className="stat-card" style={{ marginBottom: 20 }}>
        <div className="stat-icon" style={{ background: tab === 'customer' ? 'var(--warning-bg)' : 'var(--danger-bg)', color: tab === 'customer' ? 'var(--warning)' : 'var(--danger)' }}>
          <Wallet size={22} />
        </div>
        <div className="stat-content">
          <h3>{tab === 'customer' ? 'Tổng phải thu' : 'Tổng phải trả'}</h3>
          <div className="stat-value" style={{ color: tab === 'customer' ? 'var(--warning)' : 'var(--danger)' }}>{formatCurrency(totalDebt)}</div>
          <div className="stat-sub">{debtEntities.length} {tab === 'customer' ? 'khách nợ' : 'NCC nợ'}</div>
        </div>
      </div>

      {loading ? <div className="loading-page"><div className="loading-spinner" /></div> : (
        <div className="card-grid card-grid-2">
          {/* Debt List */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">{tab === 'customer' ? 'Danh sách khách nợ' : 'Danh sách NCC nợ'}</h3>
            </div>
            {debtEntities.length === 0 ? (
              <div className="empty-state"><Wallet /><h3>Không có công nợ</h3></div>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>Tên</th><th className="text-right">Số nợ</th><th className="text-center">Thao tác</th></tr></thead>
                  <tbody>
                    {debtEntities.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{e.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.code} {e.phone ? `• ${e.phone}` : ''}</div>
                        </td>
                        <td className="text-right" style={{ fontWeight: 700, color: 'var(--danger)' }}>{formatCurrency(e.debt)}</td>
                        <td className="text-center">
                          <button className="btn btn-success btn-sm" onClick={() => openPay(e.id, e.name, e.debt, tab === 'customer' ? 'customer_payment' : 'supplier_payment')}>
                            <DollarSign size={14} /> {tab === 'customer' ? 'Thu nợ' : 'Trả nợ'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Transaction History */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Lịch sử giao dịch</h3>
            </div>
            {transactions.length === 0 ? (
              <div className="empty-state"><Wallet /><h3>Chưa có giao dịch</h3></div>
            ) : (
              <div className="table-wrapper" style={{ maxHeight: 400, overflowY: 'auto' }}>
                <table className="table">
                  <thead><tr><th>Thời gian</th><th>Đối tượng</th><th className="text-right">Số tiền</th><th>Ghi chú</th></tr></thead>
                  <tbody>
                    {transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{formatDateTime(tx.createdAt)}</td>
                        <td>{tx.customer?.name || tx.supplier?.name || '—'}</td>
                        <td className="text-right" style={{ fontWeight: 600, color: tx.amount > 0 ? 'var(--danger)' : 'var(--success)' }}>
                          {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                        </td>
                        <td className="text-muted" style={{ fontSize: 12 }}>{tx.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pay Modal */}
      {showPayModal && payTarget && (
        <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{payTarget.type === 'customer_payment' ? 'Thu nợ khách hàng' : 'Trả nợ nhà cung cấp'}</h3>
              <button className="modal-close" onClick={() => setShowPayModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 12, marginBottom: 16 }}>
                <div style={{ fontWeight: 600 }}>{payTarget.name}</div>
                <div style={{ fontSize: 13, color: 'var(--danger)' }}>Số nợ hiện tại: {formatCurrency(payTarget.debt)}</div>
              </div>
              <div className="form-group">
                <label className="form-label">Số tiền thanh toán *</label>
                <input className="form-input" type="number" min="0" max={payTarget.debt} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} autoFocus />
                <button className="btn btn-ghost btn-sm mt-1" onClick={() => setPayAmount(String(payTarget.debt))}>Trả hết</button>
              </div>
              <div className="form-group">
                <label className="form-label">Ghi chú</label>
                <input className="form-input" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowPayModal(false)}>Hủy</button>
              <button className="btn btn-success" onClick={handlePay}>Xác nhận thanh toán</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
