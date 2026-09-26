'use client';

import { Fragment, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Plus, Search, Users, Edit2, Lock, Unlock, Receipt, Eye, RefreshCw } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { formatCurrency, formatDate, formatDateTime, getEndOfDayVN } from '@/lib/utils';
import {
  CUSTOMER_RECENCY_GROUPS, selectCustomersByRecency,
  type CustomerRecency, type CustomerRecencyFilter, type CustomerStatusFilter,
} from '@/lib/customer-recency';
import styles from './customers.module.css';

interface Customer {
  id: string; code: string; name: string; phone: string | null;
  address: string | null; notes: string | null; debt: number; isActive: boolean;
  lastPurchaseDate: string | null; daysSinceLastPurchase: number | null; recency: CustomerRecency;
}

interface CustomerReport {
  asOf: string;
  customers: Customer[];
}

const extraFilters: Array<{ value: CustomerRecencyFilter; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'older', label: 'Trên 4 tháng' },
  { value: 'never', label: 'Chưa từng mua' },
];
const dateVN = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
});

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
  const [report, setReport] = useState<CustomerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [recency, setRecency] = useState<CustomerRecencyFilter>('all');
  const [status, setStatus] = useState<CustomerStatusFilter>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', address: '', notes: '' });
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);
  const [customerSales, setCustomerSales] = useState<Sale[]>([]);
  const [customerPayments, setCustomerPayments] = useState<DebtPayment[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const reportRequest = useRef<AbortController | null>(null);
  const historyRequest = useRef<AbortController | null>(null);

  const selection = useMemo(() => selectCustomersByRecency(
    report?.customers ?? [], search, status, recency,
  ), [report, search, status, recency]);
  const customers = selection.customers;

  const fetchData = useCallback(async () => {
    reportRequest.current?.abort();
    const controller = new AbortController();
    reportRequest.current = controller;
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch('/api/customers/recency', { cache: 'no-store', signal: controller.signal });
      if (!res.ok) throw new Error('Unable to load customer report');
      const data: CustomerReport = await res.json();
      if (!controller.signal.aborted) setReport(data);
    } catch {
      if (!controller.signal.aborted) {
        setReport(null);
        setLoadError(true);
        showToast('error', 'Lỗi tải thống kê khách hàng');
      }
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [showToast]);

  useEffect(() => {
    void fetchData();
    const refresh = () => { if (document.visibilityState === 'visible') void fetchData(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      reportRequest.current?.abort();
      historyRequest.current?.abort();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [fetchData]);

  useEffect(() => {
    if (!report) return;
    const asOf = new Date(report.asOf);
    const timer = setTimeout(fetchData, getEndOfDayVN(asOf).getTime() - asOf.getTime() + 1000);
    return () => clearTimeout(timer);
  }, [report, fetchData]);

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
      const res = await fetch('/api/customers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, isActive: !c.isActive }) });
      if (!res.ok) throw new Error('Unable to update customer');
      showToast('success', c.isActive ? 'Đã tạm ngừng' : 'Đã kích hoạt lại');
      fetchData();
    } catch { showToast('error', 'Lỗi cập nhật'); }
  };

  const openCustomerHistory = async (c: Customer) => {
    historyRequest.current?.abort();
    const controller = new AbortController();
    historyRequest.current = controller;
    setViewCustomer(c);
    setLoadingSales(true);
    setHistoryError(false);
    setCustomerSales([]);
    setCustomerPayments([]);
    setExpandedSaleId(null);
    try {
      const [salesRes, debtsRes] = await Promise.all([
        fetch(`/api/sales?customerId=${c.id}`, { signal: controller.signal, cache: 'no-store' }),
        fetch(`/api/debts?type=customer&entityId=${c.id}`, { signal: controller.signal, cache: 'no-store' }),
      ]);
      if (!salesRes.ok || !debtsRes.ok) throw new Error('Unable to load customer history');
      const sales: Sale[] = await salesRes.json();
      const allDebts: DebtPayment[] = await debtsRes.json();
      if (!controller.signal.aborted) {
        setCustomerSales(sales);
        setCustomerPayments(allDebts.filter(d => d.type === 'customer_payment'));
      }
    } catch {
      if (!controller.signal.aborted) {
        setHistoryError(true);
        showToast('error', 'Lỗi tải lịch sử mua hàng');
      }
    } finally { if (!controller.signal.aborted) setLoadingSales(false); }
  };

  const closeHistory = () => { historyRequest.current?.abort(); setViewCustomer(null); };
  const countLabel = (value: CustomerRecencyFilter) => loading || loadError ? '—' : selection.counts[value];
  const selectedLabel = [...CUSTOMER_RECENCY_GROUPS, ...extraFilters].find(group => group.value === recency)?.label;

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <div>
          <h2>Quản lý khách hàng</h2>
          <p>{report ? `${report.customers.length} khách hàng` : 'Khách hàng'}</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Thêm khách hàng</button>
      </div>
      <section className={styles.summary} aria-label="Thống kê lần mua gần nhất" aria-busy={loading}>
        <div className={styles.summaryHeading}>
          <h3>Lần mua gần nhất</h3>
          {report && <span className={styles.summaryDate}>Tính đến {dateVN.format(new Date(report.asOf))}</span>}
        </div>
        <div className={styles.groups}>
          {CUSTOMER_RECENCY_GROUPS.map(group => (
            <button key={group.value} type="button" className={styles.group}
              aria-pressed={recency === group.value} onClick={() => setRecency(group.value)}>
              <span className={styles.groupLabel}>{group.label}</span>
              <span className={styles.groupCount}>{countLabel(group.value)}</span>
            </button>
          ))}
        </div>
        <div className={styles.filters} role="group" aria-label="Nhóm khách hàng khác">
          {extraFilters.map(group => (
            <button key={group.value} type="button" className={styles.filter}
              aria-pressed={recency === group.value} onClick={() => setRecency(group.value)}>
              {group.label}<span className={styles.filterCount}>{countLabel(group.value)}</span>
            </button>
          ))}
        </div>
      </section>
      <div className={styles.toolbar}>
        <div className={`search-box ${styles.search}`}>
          <Search aria-hidden="true" />
          <input type="search" aria-label="Tìm khách hàng" placeholder="Tìm theo tên, SĐT, mã..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className={`form-select ${styles.status}`} aria-label="Trạng thái khách hàng"
          value={status} onChange={e => setStatus(e.target.value as CustomerStatusFilter)}>
          <option value="all">Tất cả trạng thái</option>
          <option value="active">Đang hoạt động</option>
          <option value="inactive">Tạm ngừng</option>
        </select>
        <button className="btn btn-ghost" type="button" title="Làm mới thống kê" aria-label="Làm mới thống kê"
          disabled={loading} onClick={() => void fetchData()}><RefreshCw size={16} /></button>
      </div>
      {!loading && !loadError && <p className={styles.resultCount} role="status">{selectedLabel}: {customers.length} khách hàng</p>}

      {loading ? <div className="loading-page" role="status" aria-label="Đang tải khách hàng"><div className="loading-spinner" /></div> : loadError ? (
        <div className={styles.empty} role="alert">Không tải được thống kê khách hàng. <button className="btn btn-ghost btn-sm" onClick={() => void fetchData()}><RefreshCw size={14} /> Thử lại</button></div>
      ) : customers.length === 0 ? (
        <div className="empty-state"><Users /><h3>{report?.customers.length === 0 ? 'Chưa có khách hàng' : 'Không có khách hàng phù hợp'}</h3></div>
      ) : (
        <div className="table-wrapper">
          <table className={`table ${styles.table}`}>
            <thead><tr><th>Mã</th><th>Tên</th><th>SĐT</th><th>Mua gần nhất</th><th className="text-right">Số ngày chưa mua lại</th><th>Địa chỉ</th><th className="text-right">Công nợ</th><th>Trạng thái</th><th className="text-center">Thao tác</th></tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} style={{ opacity: c.isActive ? 1 : 0.5 }}>
                  <td><button className={styles.code} title={`Lịch sử mua hàng của ${c.name}`} onClick={() => void openCustomerHistory(c)}>{c.code}</button></td>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td>{c.phone || '—'}</td>
                  <td className={styles.nowrap}>{c.lastPurchaseDate ? dateVN.format(new Date(c.lastPurchaseDate)) : 'Chưa từng mua'}</td>
                  <td className={`text-right ${styles.nowrap}`}>{c.daysSinceLastPurchase === null ? '—' : `${c.daysSinceLastPurchase} ngày`}</td>
                  <td className="text-muted">{c.address || '—'}</td>
                  <td className={`text-right ${styles.nowrap}`} style={{ fontWeight: 600, color: c.debt > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>{formatCurrency(c.debt)}</td>
                  <td className={styles.nowrap}><span className={`badge ${c.isActive ? 'badge-success' : 'badge-danger'}`}>{c.isActive ? 'Hoạt động' : 'Tạm ngừng'}</span></td>
                  <td className="text-center">
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button className="btn btn-ghost btn-sm" title="Lịch sử mua hàng" onClick={() => openCustomerHistory(c)}><Eye size={14} /></button>
                      <button className="btn btn-ghost btn-sm" title="Sửa khách hàng" onClick={() => openEdit(c)}><Edit2 size={14} /></button>
                      <button className="btn btn-ghost btn-sm" title={c.isActive ? 'Tạm ngừng khách hàng' : 'Kích hoạt khách hàng'} onClick={() => toggleActive(c)}>{c.isActive ? <Lock size={14} /> : <Unlock size={14} />}</button>
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
        <div className="modal-overlay" onClick={closeHistory}>
          <div className="modal modal-xl" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Receipt size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: -3 }} />
                Lịch sử mua hàng — {viewCustomer.name}
              </h3>
              <button className="modal-close" aria-label="Đóng lịch sử mua hàng" onClick={closeHistory}>✕</button>
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
              ) : historyError ? (
                <div className={styles.empty} role="alert">Không tải được lịch sử mua hàng. <button className="btn btn-ghost btn-sm" onClick={() => void openCustomerHistory(viewCustomer)}><RefreshCw size={14} /> Thử lại</button></div>
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
                        <Fragment key={s.id}>
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
                        </Fragment>
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
