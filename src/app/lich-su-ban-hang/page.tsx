'use client';

import { useEffect, useState, useCallback } from 'react';
import { Receipt, Eye, XCircle, Trash2, Edit3, Search, Plus, Copy } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { formatCurrency, formatDate, formatDateTime, formatOrderForCopy } from '@/lib/utils';

interface Product { id: string; code: string; name: string; unit: string; salePrice: number; stock: number; }
interface Customer { id: string; code: string; name: string; }
interface Sale {
  id: string; code: string; saleDate: string; subtotal: number; discount: number;
  totalAmount: number; paidAmount: number; debtAmount: number; status: string; notes: string | null;
  paymentMethod: string;
  customer: { name: string; code: string; phone: string | null } | null;
  customerId: string | null;
  deliveryEmployee: { name: string; code: string } | null;
  deliveryEmployeeId: string | null;
  items: Array<{ productId: string; quantity: number; unitPrice: number; discount: number; totalPrice: number; product: { name: string; unit: string } }>;
}
interface EditItem { productId: string; name: string; unit: string; quantity: string; unitPrice: string; discount: string; }

export default function SalesHistoryPage() {
  const { showToast } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('');
  const [viewSale, setViewSale] = useState<Sale | null>(null);

  // Edit state
  const [editSale, setEditSale] = useState<Sale | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editOriginalDate, setEditOriginalDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editCustomerId, setEditCustomerId] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState('cash');
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [editDiscount, setEditDiscount] = useState('');
  const [editPaidAmount, setEditPaidAmount] = useState('');
  const [editSearchProduct, setEditSearchProduct] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [salesRes, prodRes, custRes] = await Promise.all([
        fetch(`/api/sales?${new URLSearchParams({
          ...(dateFrom && { dateFrom }),
          ...(dateTo && { dateTo }),
          ...(statusFilter && { status: statusFilter }),
          ...(paymentMethodFilter && { paymentMethod: paymentMethodFilter }),
        })}`),
        fetch('/api/products?status=active'),
        fetch('/api/customers'),
      ]);
      setSales(await salesRes.json());
      setProducts(await prodRes.json());
      const custData = await custRes.json();
      setCustomers(Array.isArray(custData) ? custData : []);
    } catch { showToast('error', 'Lỗi tải dữ liệu'); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo, statusFilter, paymentMethodFilter, showToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCopyOrder = async (sale: Sale) => {
    const text = formatOrderForCopy({
      customer: sale.customer,
      phone: sale.customer?.phone || null,
      items: sale.items.map(it => ({
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        totalPrice: it.totalPrice,
        product: it.product,
      })),
      totalAmount: sale.totalAmount,
      notes: sale.notes,
    });
    try {
      await navigator.clipboard.writeText(text);
      showToast('success', '📋 Đã copy đơn hàng!');
    } catch { showToast('error', 'Lỗi copy'); }
  };

  const handleCancel = async (sale: Sale) => {
    if (!confirm(`Hủy hóa đơn ${sale.code}? Tồn kho và công nợ sẽ được hoàn nguyên.`)) return;
    try {
      const res = await fetch('/api/sales', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sale.id, action: 'cancel' }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', 'Đã hủy hóa đơn'); fetchData();
    } catch (err) { showToast('error', err instanceof Error ? err.message : 'Lỗi'); }
  };

  const handleDelete = async (sale: Sale) => {
    if (!confirm(`XÓA VĨNH VIỄN hóa đơn ${sale.code}?`)) return;
    try {
      const res = await fetch(`/api/sales?id=${sale.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', 'Đã xóa hóa đơn'); fetchData();
    } catch (err) { showToast('error', err instanceof Error ? err.message : 'Lỗi'); }
  };

  // --- Edit ---
  const openEdit = (sale: Sale) => {
    setEditSale(sale);
    setEditOriginalDate(sale.saleDate);
    setEditDate(sale.saleDate.split('T')[0]);
    setEditNotes(sale.notes || '');
    setEditCustomerId(sale.customerId || '');
    setEditPaymentMethod(sale.paymentMethod);
    setEditDiscount(String(sale.discount || 0));
    setEditPaidAmount(String(sale.paidAmount));
    setEditItems(sale.items.map(i => ({
      productId: i.productId, name: i.product.name, unit: i.product.unit,
      quantity: String(i.quantity), unitPrice: String(i.unitPrice), discount: String(i.discount || 0),
    })));
  };

  const addEditItem = (product: Product) => {
    if (editItems.find(i => i.productId === product.id)) {
      showToast('warning', 'Sản phẩm đã có'); return;
    }
    setEditItems([...editItems, {
      productId: product.id, name: product.name, unit: product.unit,
      quantity: '1', unitPrice: String(product.salePrice), discount: '0',
    }]);
    setEditSearchProduct('');
  };

  const updateEditItem = (index: number, field: keyof EditItem, value: string) => {
    const newItems = [...editItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setEditItems(newItems);
  };

  const removeEditItem = (index: number) => setEditItems(editItems.filter((_, i) => i !== index));

  const editSubtotal = editItems.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0) * (parseFloat(i.unitPrice) || 0) - (parseFloat(i.discount) || 0), 0);
  const editTotal = editSubtotal - (parseFloat(editDiscount) || 0);
  const editDebt = Math.max(0, editTotal - (parseFloat(editPaidAmount) || 0));

  const handleEdit = async () => {
    if (!editSale) return;
    if (editItems.length === 0) { showToast('error', 'Cần ít nhất 1 sản phẩm'); return; }
    for (const item of editItems) {
      if (!parseFloat(item.quantity) || !parseFloat(item.unitPrice)) {
        showToast('error', `Nhập SL và giá cho "${item.name}"`); return;
      }
    }

    try {
      const res = await fetch('/api/sales', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editSale.id, action: 'edit',
          saleDate: editDate === editOriginalDate.split('T')[0]
            ? editOriginalDate
            : editDate + 'T' + (editOriginalDate.split('T')[1] || '00:00:00.000Z'),
          notes: editNotes,
          customerId: editCustomerId, paymentMethod: editPaymentMethod,
          items: editItems.map(i => ({
            productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, discount: i.discount,
          })),
          discount: editDiscount, paidAmount: editPaidAmount,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', 'Đã cập nhật hóa đơn');
      setEditSale(null); fetchData();
    } catch (err) { showToast('error', err instanceof Error ? err.message : 'Lỗi'); }
  };

  const editFilteredProducts = products.filter(p =>
    editSearchProduct && (p.name.toLowerCase().includes(editSearchProduct.toLowerCase()) || p.code.toLowerCase().includes(editSearchProduct.toLowerCase()))
  );

  const totalRevenue = sales.filter(s => s.status === 'completed').reduce((sum, s) => sum + s.totalAmount, 0);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-heading)' }}>Lịch sử bán hàng</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{sales.length} hóa đơn • Tổng: {formatCurrency(totalRevenue)}</p>
      </div>

      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <div className="toolbar-left" style={{ flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className={`btn btn-sm ${!dateFrom && !dateTo ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setDateFrom(''); setDateTo(''); }}
            >Tất cả</button>
            <button
              className={`btn btn-sm ${dateFrom === new Date().toISOString().split('T')[0] && dateTo === new Date().toISOString().split('T')[0] ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { const today = new Date().toISOString().split('T')[0]; setDateFrom(today); setDateTo(today); }}
            >Hôm nay</button>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                const now = new Date();
                const day = now.getDay() || 7;
                const monday = new Date(now);
                monday.setDate(now.getDate() - day + 1);
                setDateFrom(monday.toISOString().split('T')[0]);
                setDateTo(now.toISOString().split('T')[0]);
              }}
            >Tuần này</button>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                const now = new Date();
                const first = new Date(now.getFullYear(), now.getMonth(), 1);
                setDateFrom(first.toISOString().split('T')[0]);
                setDateTo(now.toISOString().split('T')[0]);
              }}
            >Tháng này</button>
          </div>
          <input className="form-input" type="date" style={{ width: 150 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className="text-muted">đến</span>
          <input className="form-input" type="date" style={{ width: 150 }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
          <select className="form-select" style={{ width: 140 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Tất cả</option><option value="completed">Hoàn thành</option><option value="cancelled">Đã hủy</option>
          </select>
          <select className="form-select" style={{ width: 160 }} value={paymentMethodFilter} onChange={e => setPaymentMethodFilter(e.target.value)}>
            <option value="">Tất cả PT thanh toán</option><option value="cash">Tiền mặt</option><option value="transfer">Chuyển khoản</option>
          </select>
        </div>
      </div>

      {loading ? <div className="loading-page"><div className="loading-spinner" /></div> : sales.length === 0 ? (
        <div className="card"><div className="empty-state"><Receipt /><h3>Chưa có hóa đơn</h3></div></div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Mã</th><th>Ngày</th><th>Khách hàng</th><th>Thanh toán</th><th className="text-right">Tổng tiền</th><th className="text-right">Đã trả</th><th className="text-right">Còn nợ</th><th>Trạng thái</th><th className="text-center">Thao tác</th></tr></thead>
            <tbody>
              {sales.map(s => (
                <tr key={s.id} style={{ opacity: s.status === 'cancelled' ? 0.5 : 1 }}>
                  <td style={{ fontWeight: 600, color: 'var(--accent)', cursor: 'pointer' }} onClick={() => setViewSale(s)}>{s.code}</td>
                  <td>{formatDate(s.saleDate)}</td>
                  <td>{s.customer?.name || 'Khách lẻ'}</td>
                  <td><span className={`badge ${s.paymentMethod === 'cash' ? 'badge-info' : 'badge-accent'}`}>{s.paymentMethod === 'cash' ? '💵 Tiền mặt' : '🏦 Chuyển khoản'}</span></td>
                  <td className="text-right font-bold">{formatCurrency(s.totalAmount)}</td>
                  <td className="text-right text-success">{formatCurrency(s.paidAmount)}</td>
                  <td className="text-right" style={{ color: s.debtAmount > 0 ? 'var(--warning)' : 'var(--text-muted)', fontWeight: s.debtAmount > 0 ? 700 : 400 }}>{formatCurrency(s.debtAmount)}</td>
                  <td><span className={`badge ${s.status === 'completed' ? 'badge-success' : 'badge-danger'}`}>{s.status === 'completed' ? 'Hoàn thành' : 'Đã hủy'}</span></td>
                  <td className="text-center">
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setViewSale(s)} title="Xem"><Eye size={14} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleCopyOrder(s)} title="Copy đơn"><Copy size={14} /></button>
                      {s.status === 'completed' && <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)} title="Sửa"><Edit3 size={14} /></button>}
                      {s.status === 'completed' && <button className="btn btn-ghost btn-sm text-danger" onClick={() => handleCancel(s)} title="Hủy"><XCircle size={14} /></button>}
                      <button className="btn btn-ghost btn-sm text-danger" onClick={() => handleDelete(s)} title="Xóa"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* View Modal */}
      {viewSale && (
        <div className="modal-overlay" onClick={() => setViewSale(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Hóa đơn {viewSale.code}</h3><button className="modal-close" onClick={() => setViewSale(null)}>✕</button></div>
            <div className="modal-body">
              <div className="form-row form-row-3" style={{ marginBottom: 16 }}>
                <div><span className="text-muted">Khách:</span> <strong>{viewSale.customer?.name || 'Khách lẻ'}</strong></div>
                <div><span className="text-muted">Ngày:</span> <strong>{formatDateTime(viewSale.saleDate)}</strong></div>
                <div><span className="text-muted">Thanh toán:</span> <span className={`badge ${viewSale.paymentMethod === 'cash' ? 'badge-info' : 'badge-accent'}`}>{viewSale.paymentMethod === 'cash' ? '💵 Tiền mặt' : '🏦 Chuyển khoản'}</span></div>
              </div>
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>Sản phẩm</th><th className="text-right">SL</th><th className="text-right">Đơn giá</th><th className="text-right">Giảm giá</th><th className="text-right">Thành tiền</th></tr></thead>
                  <tbody>
                    {viewSale.items.map((item, i) => (
                      <tr key={i}><td>{item.product.name}</td><td className="text-right">{item.quantity} {item.product.unit}</td><td className="text-right">{formatCurrency(item.unitPrice)}</td><td className="text-right">{formatCurrency(item.discount)}</td><td className="text-right font-bold">{formatCurrency(item.totalPrice)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 16, textAlign: 'right' }}>
                {viewSale.discount > 0 && <div>Giảm giá đơn: <strong className="text-danger">-{formatCurrency(viewSale.discount)}</strong></div>}
                <div style={{ fontSize: 16 }}>Tổng cộng: <strong>{formatCurrency(viewSale.totalAmount)}</strong></div>
                <div className="text-success">Đã trả: <strong>{formatCurrency(viewSale.paidAmount)}</strong></div>
                {viewSale.debtAmount > 0 && <div className="text-warning">Còn nợ: <strong>{formatCurrency(viewSale.debtAmount)}</strong></div>}
              </div>
              {viewSale.notes && <div style={{ marginTop: 12 }} className="text-muted">Ghi chú: {viewSale.notes}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Full Edit Modal */}
      {editSale && (
        <div className="modal-overlay" onClick={() => setEditSale(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header"><h3>Chỉnh sửa {editSale.code}</h3><button className="modal-close" onClick={() => setEditSale(null)}>✕</button></div>
            <div className="modal-body">
              {/* Basic fields */}
              <div className="form-row form-row-3" style={{ marginBottom: 16 }}>
                <div className="form-group">
                  <label className="form-label">Ngày bán</label>
                  <input className="form-input" type="date" value={editDate} onChange={e => setEditDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Khách hàng</label>
                  <select className="form-select" value={editCustomerId} onChange={e => setEditCustomerId(e.target.value)}>
                    <option value="">Khách lẻ</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Thanh toán</label>
                  <select className="form-select" value={editPaymentMethod} onChange={e => setEditPaymentMethod(e.target.value)}>
                    <option value="cash">💵 Tiền mặt</option>
                    <option value="transfer">🏦 Chuyển khoản</option>
                  </select>
                </div>
              </div>

              {/* Search add product */}
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <div className="search-box"><Search /><input placeholder="Tìm sản phẩm để thêm..." value={editSearchProduct} onChange={e => setEditSearchProduct(e.target.value)} /></div>
                {editFilteredProducts.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', zIndex: 10, maxHeight: 150, overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
                    {editFilteredProducts.map(p => (
                      <div key={p.id} onClick={() => addEditItem(p)} style={{ padding: '6px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }} className="nav-item">
                        <span>{p.code} - {p.name}</span> <span className="text-muted" style={{ float: 'right' }}>{formatCurrency(p.salePrice)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Items table */}
              <div className="table-wrapper" style={{ marginBottom: 12 }}>
                <table className="table">
                  <thead><tr><th>Sản phẩm</th><th style={{ width: 80 }}>SL</th><th style={{ width: 120 }}>Đơn giá</th><th style={{ width: 100 }}>Giảm giá</th><th className="text-right">Thành tiền</th><th style={{ width: 40 }}></th></tr></thead>
                  <tbody>
                    {editItems.map((item, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{item.name} <span className="text-muted">({item.unit})</span></td>
                        <td><input className="form-input" type="number" min="0" step="any" value={item.quantity} onChange={e => updateEditItem(i, 'quantity', e.target.value)} /></td>
                        <td><input className="form-input" type="number" min="0" value={item.unitPrice} onChange={e => updateEditItem(i, 'unitPrice', e.target.value)} /></td>
                        <td><input className="form-input" type="number" min="0" value={item.discount} onChange={e => updateEditItem(i, 'discount', e.target.value)} /></td>
                        <td className="text-right font-bold">{formatCurrency((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0) - (parseFloat(item.discount) || 0))}</td>
                        <td><button className="btn btn-ghost btn-sm" onClick={() => removeEditItem(i)}><Trash2 size={14} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ width: 320, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 16, border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span className="text-muted">Tạm tính:</span><strong>{formatCurrency(editSubtotal)}</strong>
                  </div>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label className="form-label" style={{ fontSize: 12 }}>Giảm giá đơn</label>
                    <input className="form-input" type="number" min="0" value={editDiscount} onChange={e => setEditDiscount(e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontWeight: 700, fontSize: 16 }}>
                    <span>Tổng:</span><span>{formatCurrency(editTotal)}</span>
                  </div>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label className="form-label" style={{ fontSize: 12 }}>Khách trả</label>
                    <input className="form-input" type="number" min="0" value={editPaidAmount} onChange={e => setEditPaidAmount(e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: editDebt > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                    <span>Còn nợ:</span><strong>{formatCurrency(editDebt)}</strong>
                  </div>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: 12 }}>
                <label className="form-label">Ghi chú</label>
                <input className="form-input" value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Ghi chú..." />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="btn btn-ghost" onClick={() => setEditSale(null)}>Hủy</button>
                <button className="btn btn-primary" onClick={handleEdit}>Lưu thay đổi</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
