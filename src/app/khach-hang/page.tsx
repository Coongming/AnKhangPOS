'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Users, Edit2, Lock, Unlock, Receipt, Eye } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';

interface Customer {
  id: string; code: string; name: string; phone: string | null;
  address: string | null; notes: string | null; debt: number; isActive: boolean;
}

interface Sale {
  id: string; code: string; saleDate: string; totalAmount: number; paidAmount: number;
  debtAmount: number; status: string; paymentMethod: string;
  items: Array<{ quantity: number; unitPrice: number; totalPrice: number; product: { name: string; unit: string } }>;
}

interface DebtPayment {
  id: string; type: string; amount: number; balanceAfter: number;
  notes: string | null; createdAt: string;
}

export default function CustomersPage() {
  const { showToast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', address: '', notes: '' });
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);
  const [customerSales, setCustomerSales] = useState<Sale[]>([]);
  const [customerPayments, setCustomerPayments] = useState<DebtPayment[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const res = await fetch(`/api/customers?${params}`);
      setCustomers(await res.json());
    } catch { showToast('error', 'Lỗi tải dữ liệu'); }
    finally { setLoading(false); }
  }, [search, showToast]);

  useEffect(() => { const t = setTimeout(fetchData, 300); return () => clearTimeout(t); }, [fetchData]);

  const openCreate = () => { setEditing(null); setForm({ name: '', phone: '', address: '', notes: '' }); setShowModal(true); };
  const openEdit = (c: Customer) => { setEditing(c); setForm({ name: c.name, phone: c.phone || '', address: c.address || '', notes: c.notes || '' }); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { showToast('error', 'Vui lòng nhập tên'); return; }
    try {
      const res = await fetch('/api/customers', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { id: editing.id, ...form } : form),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', editing ? 'Đã cập nhật' : 'Đã thêm khách hàng');
      setShowModal(false); fetchData();
    } catch (err) { showToast('error', err instanceof Error ? err.message : 'Lỗi'); }
  };

  const toggleActive = async (c: Customer) => {
    try {
      await fetch('/api/customers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, isActive: !c.isActive }) });
      showToast('success', c.isActive ? 'Đã tạm ngừng' : 'Đã kích hoạt lại');
      fetchData();
    } catch { showToast('error', 'Lỗi cập nhật'); }
  };

  const openCustomerHistory = async (c: Customer) => {
    setViewCustomer(c);
    setLoadingSales(true);
    setExpandedSaleId(null);
    try {
      const [salesRes, debtsRes] = await Promise.all([
        fetch(`/api/sales?customerId=${c.id}`),
        fetch(`/api/debts?type=customer&entityId=${c.id}`),
      ]);
      setCustomerSales(await salesRes.json());
      const allDebts: DebtPayment[] = await debtsRes.json();
      setCustomerPayments(allDebts.filter(d => d.type === 'customer_payment'));
    } catch { showToast('error', 'Lỗi tải lịch sử mua hàng'); }
    finally { setLoadingSales(false); }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-heading)' }}>Quản lý khách hàng</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{customers.length} khách hàng</p>
      </div>
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-box" style={{ maxWidth: 320 }}>
            <Search />
            <input placeholder="Tìm theo tên, SĐT, mã..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Thêm khách hàng</button>
        </div>
      </div>

      {loading ? <div className="loading-page"><div className="loading-spinner" /></div> : customers.length === 0 ? (
        <div className="card"><div className="empty-state"><Users /><h3>Chưa có khách hàng</h3></div></div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Mã</th><th>Tên</th><th>SĐT</th><th>Địa chỉ</th><th className="text-right">Công nợ</th><th>Trạng thái</th><th className="text-center">Thao tác</th></tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} style={{ opacity: c.isActive ? 1 : 0.5 }}>
                  <td style={{ fontWeight: 600, color: 'var(--accent)', cursor: 'pointer' }} onClick={() => openCustomerHistory(c)}>{c.code}</td>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td>{c.phone || '—'}</td>
                  <td className="text-muted">{c.address || '—'}</td>
                  <td className="text-right" style={{ fontWeight: 600, color: c.debt > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>{formatCurrency(c.debt)}</td>
                  <td><span className={`badge ${c.isActive ? 'badge-success' : 'badge-danger'}`}>{c.isActive ? 'Hoạt động' : 'Tạm ngừng'}</span></td>
                  <td className="text-center">
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button className="btn btn-ghost btn-sm" title="Lịch sử mua hàng" onClick={() => openCustomerHistory(c)}><Eye size={14} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}><Edit2 size={14} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(c)}>{c.isActive ? <Lock size={14} /> : <Unlock size={14} />}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>{editing ? 'Sửa khách hàng' : 'Thêm khách hàng'}</h3><button className="modal-close" onClick={() => setShowModal(false)}>✕</button></div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Tên khách hàng *</label><input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="form-row form-row-2">
                  <div className="form-group"><label className="form-label">Số điện thoại</label><input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                  <div className="form-group"><label className="form-label">Địa chỉ</label><input className="form-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                </div>
                <div className="form-group"><label className="form-label">Ghi chú</label><textarea className="form-textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">{editing ? 'Cập nhật' : 'Thêm'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewCustomer && (
        <div className="modal-overlay" onClick={() => setViewCustomer(null)}>
          <div className="modal modal-xl" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Receipt size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: -3 }} />
                Lịch sử mua hàng — {viewCustomer.name}
              </h3>
              <button className="modal-close" onClick={() => setViewCustomer(null)}>✕</button>
            </div>
            <div className="modal-body">
              {/* Customer Info */}
              <div className="card" style={{ padding: 16, marginBottom: 16, background: 'var(--bg-secondary)' }}>
                <div className="form-row form-row-4">
                  <div><span className="text-muted" style={{ fontSize: 11 }}>Mã KH</span><div style={{ fontWeight: 700, color: 'var(--accent)' }}>{viewCustomer.code}</div></div>
                  <div><span className="text-muted" style={{ fontSize: 11 }}>SĐT</span><div style={{ fontWeight: 600 }}>{viewCustomer.phone || '—'}</div></div>
                  <div><span className="text-muted" style={{ fontSize: 11 }}>Địa chỉ</span><div style={{ fontWeight: 600 }}>{viewCustomer.address || '—'}</div></div>
                  <div><span className="text-muted" style={{ fontSize: 11 }}>Công nợ</span><div style={{ fontWeight: 700, color: viewCustomer.debt > 0 ? 'var(--warning)' : 'var(--success)' }}>{formatCurrency(viewCustomer.debt)}</div></div>
                </div>
              </div>

              {/* Sales Stats */}
              {!loadingSales && customerSales.length > 0 && (() => {
                const completed = customerSales.filter(s => s.status === 'completed');
                const totalSpent = completed.reduce((sum, s) => sum + s.totalAmount, 0);
                return (
                  <div className="card-grid card-grid-3" style={{ marginBottom: 16 }}>
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Tổng đơn hàng</div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>{completed.length}</div>
                    </div>
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Tổng chi tiêu</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)' }}>{formatCurrency(totalSpent)}</div>
                    </div>
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Còn nợ</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: viewCustomer.debt > 0 ? 'var(--warning)' : 'var(--success)' }}>{formatCurrency(viewCustomer.debt)}</div>
                    </div>
                  </div>
                );
              })()}

              {/* Sales Table */}
              {loadingSales ? (
                <div className="loading-page" style={{ minHeight: 150 }}><div className="loading-spinner" /></div>
              ) : customerSales.length === 0 ? (
                <div className="empty-state">
                  <Receipt />
                  <h3>Chưa có đơn hàng nào</h3>
                  <p>Khách hàng này chưa mua hàng</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Mã đơn</th>
                        <th>Ngày</th>
                        <th>Thanh toán</th>
                        <th className="text-right">Tổng tiền</th>
                        <th className="text-right">Đã trả</th>
                        <th className="text-right">Còn nợ</th>
                        <th>Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerSales.map((s) => (
                        <>
                        <tr key={s.id} style={{ opacity: s.status === 'cancelled' ? 0.5 : 1, cursor: 'pointer' }} onClick={() => setExpandedSaleId(expandedSaleId === s.id ? null : s.id)}>
                          <td style={{ fontWeight: 600, color: 'var(--accent)' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ display: 'inline-block', width: 16, textAlign: 'center', fontSize: 10, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: expandedSaleId === s.id ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                              {s.code}
                            </span>
                          </td>
                          <td>{formatDate(s.saleDate)}</td>
                          <td><span className={`badge ${s.paymentMethod === 'cash' ? 'badge-info' : 'badge-accent'}`}>{s.paymentMethod === 'cash' ? '💵 Tiền mặt' : '🏦 Chuyển khoản'}</span></td>
                          <td className="text-right" style={{ fontWeight: 700 }}>{formatCurrency(s.totalAmount)}</td>
                          <td className="text-right text-success">{formatCurrency(s.paidAmount)}</td>
                          <td className="text-right" style={{ color: s.debtAmount > 0 ? 'var(--warning)' : 'var(--text-muted)', fontWeight: s.debtAmount > 0 ? 700 : 400 }}>{formatCurrency(s.debtAmount)}</td>
                          <td><span className={`badge ${s.status === 'completed' ? 'badge-success' : 'badge-danger'}`}>{s.status === 'completed' ? 'Hoàn thành' : 'Đã hủy'}</span></td>
                        </tr>
                        {expandedSaleId === s.id && (
                          <tr key={`${s.id}-detail`}>
                            <td colSpan={7} style={{ padding: 0, background: 'var(--bg-secondary)' }}>
                              <div style={{ padding: '12px 24px', animation: 'slideUp 0.2s ease' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Chi tiết hóa đơn {s.code}</div>
                                <table className="table" style={{ marginBottom: 0 }}>
                                  <thead>
                                    <tr>
                                      <th style={{ fontSize: 10, padding: '6px 12px' }}>#</th>
                                      <th style={{ fontSize: 10, padding: '6px 12px' }}>Sản phẩm</th>
                                      <th style={{ fontSize: 10, padding: '6px 12px' }}>ĐVT</th>
                                      <th className="text-right" style={{ fontSize: 10, padding: '6px 12px' }}>Số lượng</th>
                                      <th className="text-right" style={{ fontSize: 10, padding: '6px 12px' }}>Đơn giá</th>
                                      <th className="text-right" style={{ fontSize: 10, padding: '6px 12px' }}>Thành tiền</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {s.items.map((item, idx) => (
                                      <tr key={idx}>
                                        <td style={{ padding: '6px 12px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                                        <td style={{ padding: '6px 12px', fontWeight: 600 }}>{item.product.name}</td>
                                        <td style={{ padding: '6px 12px' }}>{item.product.unit}</td>
                                        <td className="text-right" style={{ padding: '6px 12px' }}>{item.quantity}</td>
                                        <td className="text-right" style={{ padding: '6px 12px' }}>{formatCurrency(item.unitPrice)}</td>
                                        <td className="text-right" style={{ padding: '6px 12px', fontWeight: 700 }}>{formatCurrency(item.totalPrice)}</td>
                                      </tr>
                                    ))}
                                    <tr style={{ borderTop: '2px solid var(--border-color)' }}>
                                      <td colSpan={5} className="text-right" style={{ padding: '8px 12px', fontWeight: 700 }}>Tổng cộng:</td>
                                      <td className="text-right" style={{ padding: '8px 12px', fontWeight: 800, fontSize: 14, color: 'var(--accent)' }}>{formatCurrency(s.totalAmount)}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Debt Payment History */}
              {!loadingSales && customerPayments.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-heading)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                    💰 Lịch sử thanh toán nợ
                    <span className="badge badge-success" style={{ fontSize: 11 }}>{customerPayments.length} lần trả</span>
                  </div>
                  <div className="table-wrapper">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Thời gian</th>
                          <th className="text-right">Số tiền trả</th>
                          <th className="text-right">Nợ còn lại</th>
                          <th>Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerPayments.map((p) => (
                          <tr key={p.id}>
                            <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{formatDateTime(p.createdAt)}</td>
                            <td className="text-right" style={{ fontWeight: 700, color: 'var(--success)' }}>{formatCurrency(Math.abs(p.amount))}</td>
                            <td className="text-right" style={{ fontWeight: 600, color: p.balanceAfter > 0 ? 'var(--warning)' : 'var(--success)' }}>{formatCurrency(p.balanceAfter)}</td>
                            <td className="text-muted" style={{ fontSize: 12 }}>{p.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
