'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Trash2, Save, ClipboardList, Eye, XCircle, Edit3 } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { formatCurrency, formatDate } from '@/lib/utils';

interface Product { id: string; code: string; name: string; unit: string; salePrice: number; stock: number; }
interface Supplier { id: string; code: string; name: string; }
interface CartItem { productId: string; name: string; unit: string; quantity: string; unitPrice: string; }
interface Purchase {
  id: string; code: string; purchaseDate: string; totalAmount: number;
  paidAmount: number; debtAmount: number; status: string; notes: string | null;
  supplierId: string;
  supplier: { name: string; code: string };
  items: Array<{ productId: string; quantity: number; unitPrice: number; totalPrice: number; product: { name: string; code: string; unit: string } }>;
}

export default function PurchasesPage() {
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paidAmount, setPaidAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchProduct, setSearchProduct] = useState('');
  const [viewPurchase, setViewPurchase] = useState<Purchase | null>(null);

  // Edit state
  const [editPurchase, setEditPurchase] = useState<Purchase | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editOriginalDate, setEditOriginalDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSupplierId, setEditSupplierId] = useState('');
  const [editItems, setEditItems] = useState<CartItem[]>([]);
  const [editPaidAmount, setEditPaidAmount] = useState('');
  const [editSearchProduct, setEditSearchProduct] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [prodRes, supRes, purRes] = await Promise.all([
        fetch('/api/products?status=active'),
        fetch('/api/suppliers'),
        fetch('/api/purchases'),
      ]);
      setProducts(await prodRes.json());
      setSuppliers(await supRes.json());
      setPurchases(await purRes.json());
    } catch { showToast('error', 'Lỗi tải dữ liệu'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- Create form ---
  const addToCart = (product: Product) => {
    if (cart.find(c => c.productId === product.id)) { showToast('warning', 'Đã có'); return; }
    setCart([...cart, { productId: product.id, name: product.name, unit: product.unit, quantity: '1', unitPrice: '' }]);
    setSearchProduct('');
  };
  const updateCart = (index: number, field: keyof CartItem, value: string) => {
    const newCart = [...cart]; newCart[index] = { ...newCart[index], [field]: value }; setCart(newCart);
  };
  const removeFromCart = (index: number) => setCart(cart.filter((_, i) => i !== index));

  const totalAmount = cart.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0), 0);
  const debtAmount = totalAmount - (parseFloat(paidAmount) || 0);

  const handleSubmit = async () => {
    if (!selectedSupplier) { showToast('error', 'Chọn NCC'); return; }
    if (cart.length === 0) { showToast('error', 'Thêm sản phẩm'); return; }
    for (const item of cart) {
      if (!item.quantity || !item.unitPrice || parseFloat(item.quantity) <= 0 || parseFloat(item.unitPrice) <= 0) {
        showToast('error', `Nhập SL và giá cho "${item.name}"`); return;
      }
    }
    try {
      const res = await fetch('/api/purchases', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: selectedSupplier,
          items: cart.map(c => ({ productId: c.productId, quantity: c.quantity, unitPrice: c.unitPrice })),
          paidAmount, notes, purchaseDate,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', 'Đã tạo phiếu nhập'); setShowForm(false);
      setCart([]); setSelectedSupplier(''); setPaidAmount(''); setNotes(''); fetchData();
    } catch (err) { showToast('error', err instanceof Error ? err.message : 'Lỗi'); }
  };

  const handleCancel = async (purchase: Purchase) => {
    if (!confirm(`Hủy phiếu nhập ${purchase.code}?`)) return;
    try {
      const res = await fetch('/api/purchases', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: purchase.id, action: 'cancel' }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', 'Đã hủy'); fetchData();
    } catch (err) { showToast('error', err instanceof Error ? err.message : 'Lỗi'); }
  };

  const handleDelete = async (purchase: Purchase) => {
    if (!confirm(`XÓA VĨNH VIỄN phiếu nhập ${purchase.code}?`)) return;
    try {
      const res = await fetch(`/api/purchases?id=${purchase.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', 'Đã xóa'); fetchData();
    } catch (err) { showToast('error', err instanceof Error ? err.message : 'Lỗi'); }
  };

  // --- Edit ---
  const openEdit = (p: Purchase) => {
    setEditPurchase(p);
    setEditOriginalDate(p.purchaseDate);
    setEditDate(p.purchaseDate.split('T')[0]);
    setEditNotes(p.notes || '');
    setEditSupplierId(p.supplierId);
    setEditPaidAmount(String(p.paidAmount));
    setEditItems(p.items.map(i => ({
      productId: i.productId, name: i.product.name, unit: i.product.unit,
      quantity: String(i.quantity), unitPrice: String(i.unitPrice),
    })));
  };

  const addEditItem = (product: Product) => {
    if (editItems.find(i => i.productId === product.id)) { showToast('warning', 'Đã có'); return; }
    setEditItems([...editItems, { productId: product.id, name: product.name, unit: product.unit, quantity: '1', unitPrice: '' }]);
    setEditSearchProduct('');
  };
  const updateEditItem = (index: number, field: keyof CartItem, value: string) => {
    const newItems = [...editItems]; newItems[index] = { ...newItems[index], [field]: value }; setEditItems(newItems);
  };
  const removeEditItem = (index: number) => setEditItems(editItems.filter((_, i) => i !== index));

  const editTotal = editItems.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0), 0);
  const editDebt = Math.max(0, editTotal - (parseFloat(editPaidAmount) || 0));

  const handleEdit = async () => {
    if (!editPurchase) return;
    if (editItems.length === 0) { showToast('error', 'Cần ít nhất 1 SP'); return; }
    for (const item of editItems) {
      if (!parseFloat(item.quantity) || !parseFloat(item.unitPrice)) {
        showToast('error', `Nhập SL và giá cho "${item.name}"`); return;
      }
    }
    try {
      const res = await fetch('/api/purchases', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editPurchase.id, action: 'edit',
          purchaseDate: editDate === editOriginalDate.split('T')[0]
            ? editOriginalDate
            : editDate + 'T' + (editOriginalDate.split('T')[1] || '00:00:00.000Z'),
          notes: editNotes, supplierId: editSupplierId,
          items: editItems.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
          paidAmount: editPaidAmount,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', 'Đã cập nhật phiếu nhập');
      setEditPurchase(null); fetchData();
    } catch (err) { showToast('error', err instanceof Error ? err.message : 'Lỗi'); }
  };

  const editFilteredProducts = products.filter(p =>
    editSearchProduct && (p.name.toLowerCase().includes(editSearchProduct.toLowerCase()) || p.code.toLowerCase().includes(editSearchProduct.toLowerCase()))
  );

  const filteredProducts = products.filter(p =>
    searchProduct && (p.name.toLowerCase().includes(searchProduct.toLowerCase()) || p.code.toLowerCase().includes(searchProduct.toLowerCase()))
  );

  if (loading) return <div className="loading-page"><div className="loading-spinner" /></div>;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-heading)' }}>Nhập hàng</h2>
      </div>

      {!showForm ? (
        <>
          <div className="toolbar">
            <div className="toolbar-left">
              <select
                className="form-select"
                style={{ width: 200 }}
                value={filterSupplier}
                onChange={e => setFilterSupplier(e.target.value)}
              >
                <option value="">Tất cả NCC</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="toolbar-right">
              <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> Tạo phiếu nhập</button>
            </div>
          </div>

          {purchases.filter(p => !filterSupplier || p.supplierId === filterSupplier).length === 0 ? (
            <div className="card"><div className="empty-state"><ClipboardList /><h3>Chưa có phiếu nhập</h3></div></div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Mã</th><th>Ngày</th><th>NCC</th><th className="text-right">Tổng tiền</th><th className="text-right">Đã trả</th><th className="text-right">Còn nợ</th><th>Trạng thái</th><th className="text-center">Thao tác</th></tr></thead>
                <tbody>
                  {purchases.filter(p => !filterSupplier || p.supplierId === filterSupplier).map(p => (
                    <tr key={p.id} style={{ opacity: p.status === 'cancelled' ? 0.5 : 1 }}>
                      <td style={{ fontWeight: 600, color: 'var(--accent)', cursor: 'pointer' }} onClick={() => setViewPurchase(p)}>{p.code}</td>
                      <td>{formatDate(p.purchaseDate)}</td>
                      <td>{p.supplier.name}</td>
                      <td className="text-right font-bold">{formatCurrency(p.totalAmount)}</td>
                      <td className="text-right text-success">{formatCurrency(p.paidAmount)}</td>
                      <td className="text-right" style={{ color: p.debtAmount > 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: p.debtAmount > 0 ? 700 : 400 }}>{formatCurrency(p.debtAmount)}</td>
                      <td><span className={`badge ${p.status === 'completed' ? 'badge-success' : 'badge-danger'}`}>{p.status === 'completed' ? 'Hoàn thành' : 'Đã hủy'}</span></td>
                      <td className="text-center">
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setViewPurchase(p)} title="Xem"><Eye size={14} /></button>
                          {p.status === 'completed' && <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)} title="Sửa"><Edit3 size={14} /></button>}
                          {p.status === 'completed' && <button className="btn btn-ghost btn-sm text-danger" onClick={() => handleCancel(p)} title="Hủy"><XCircle size={14} /></button>}
                          <button className="btn btn-ghost btn-sm text-danger" onClick={() => handleDelete(p)} title="Xóa"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        /* Purchase Form */
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Tạo phiếu nhập mới</h3>
            <button className="btn btn-ghost" onClick={() => { setShowForm(false); setCart([]); }}>Hủy</button>
          </div>
          <div className="form-row form-row-3" style={{ marginBottom: 16 }}>
            <div className="form-group">
              <label className="form-label">Nhà cung cấp *</label>
              <select className="form-select" value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)}>
                <option value="">Chọn NCC</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Ngày nhập</label>
              <input className="form-input" type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Ghi chú</label>
              <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ghi chú..." />
            </div>
          </div>

          <div style={{ position: 'relative', marginBottom: 16 }}>
            <div className="search-box"><Search /><input placeholder="Tìm sản phẩm..." value={searchProduct} onChange={e => setSearchProduct(e.target.value)} /></div>
            {filteredProducts.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', zIndex: 10, maxHeight: 200, overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
                {filteredProducts.map(p => (
                  <div key={p.id} onClick={() => addToCart(p)} style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)' }} className="nav-item">
                    <span>{p.code} - {p.name}</span><span className="text-muted">Tồn: {p.stock} {p.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {cart.length > 0 && (
            <div className="table-wrapper" style={{ marginBottom: 16 }}>
              <table className="table">
                <thead><tr><th>Sản phẩm</th><th>ĐVT</th><th style={{ width: 120 }}>Số lượng</th><th style={{ width: 150 }}>Giá nhập</th><th className="text-right">Thành tiền</th><th style={{ width: 50 }}></th></tr></thead>
                <tbody>
                  {cart.map((item, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{item.name}</td><td>{item.unit}</td>
                      <td><input className="form-input" type="number" min="0" step="any" value={item.quantity} onChange={e => updateCart(i, 'quantity', e.target.value)} /></td>
                      <td><input className="form-input" type="number" min="0" value={item.unitPrice} onChange={e => updateCart(i, 'unitPrice', e.target.value)} /></td>
                      <td className="text-right font-bold">{formatCurrency((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0))}</td>
                      <td><button className="btn btn-ghost btn-sm" onClick={() => removeFromCart(i)}><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: 350, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', padding: 20, border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span className="text-muted">Tổng tiền hàng:</span>
                <span style={{ fontSize: 18, fontWeight: 800 }}>{formatCurrency(totalAmount)}</span>
              </div>
              <div className="form-group">
                <label className="form-label">Số tiền trả</label>
                <input className="form-input" type="number" min="0" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} placeholder="0" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, padding: '8px 0', borderTop: '1px solid var(--border-color)' }}>
                <span>Còn nợ NCC:</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: debtAmount > 0 ? 'var(--danger)' : 'var(--success)' }}>{formatCurrency(Math.max(0, debtAmount))}</span>
              </div>
              <button className="btn btn-success btn-lg w-full" onClick={handleSubmit} disabled={cart.length === 0}>
                <Save size={18} /> Lưu phiếu nhập
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {viewPurchase && (
        <div className="modal-overlay" onClick={() => setViewPurchase(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Chi tiết {viewPurchase.code}</h3><button className="modal-close" onClick={() => setViewPurchase(null)}>✕</button></div>
            <div className="modal-body">
              <div className="form-row form-row-3" style={{ marginBottom: 16 }}>
                <div><span className="text-muted">NCC:</span> <strong>{viewPurchase.supplier.name}</strong></div>
                <div><span className="text-muted">Ngày:</span> <strong>{formatDate(viewPurchase.purchaseDate)}</strong></div>
                <div><span className="text-muted">Trạng thái:</span> <span className={`badge ${viewPurchase.status === 'completed' ? 'badge-success' : 'badge-danger'}`}>{viewPurchase.status === 'completed' ? 'Hoàn thành' : 'Đã hủy'}</span></div>
              </div>
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>Sản phẩm</th><th>ĐVT</th><th className="text-right">SL</th><th className="text-right">Đơn giá</th><th className="text-right">Thành tiền</th></tr></thead>
                  <tbody>
                    {viewPurchase.items.map((item, i) => (
                      <tr key={i}><td>{item.product.name}</td><td>{item.product.unit}</td><td className="text-right">{item.quantity}</td><td className="text-right">{formatCurrency(item.unitPrice)}</td><td className="text-right font-bold">{formatCurrency(item.totalPrice)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 16, textAlign: 'right' }}>
                <div>Tổng: <strong>{formatCurrency(viewPurchase.totalAmount)}</strong></div>
                <div className="text-success">Đã trả: <strong>{formatCurrency(viewPurchase.paidAmount)}</strong></div>
                <div className="text-danger">Còn nợ: <strong>{formatCurrency(viewPurchase.debtAmount)}</strong></div>
              </div>
              {viewPurchase.notes && <div style={{ marginTop: 12 }} className="text-muted">Ghi chú: {viewPurchase.notes}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Full Edit Modal */}
      {editPurchase && (
        <div className="modal-overlay" onClick={() => setEditPurchase(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header"><h3>Chỉnh sửa {editPurchase.code}</h3><button className="modal-close" onClick={() => setEditPurchase(null)}>✕</button></div>
            <div className="modal-body">
              <div className="form-row form-row-3" style={{ marginBottom: 16 }}>
                <div className="form-group">
                  <label className="form-label">Ngày nhập</label>
                  <input className="form-input" type="date" value={editDate} onChange={e => setEditDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Nhà cung cấp</label>
                  <select className="form-select" value={editSupplierId} onChange={e => setEditSupplierId(e.target.value)}>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Ghi chú</label>
                  <input className="form-input" value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Ghi chú..." />
                </div>
              </div>

              {/* Search add product */}
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <div className="search-box"><Search /><input placeholder="Tìm sản phẩm để thêm..." value={editSearchProduct} onChange={e => setEditSearchProduct(e.target.value)} /></div>
                {editFilteredProducts.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', zIndex: 10, maxHeight: 150, overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
                    {editFilteredProducts.map(p => (
                      <div key={p.id} onClick={() => addEditItem(p)} style={{ padding: '6px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }} className="nav-item">
                        {p.code} - {p.name} <span className="text-muted" style={{ float: 'right' }}>Tồn: {p.stock} {p.unit}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Items table */}
              <div className="table-wrapper" style={{ marginBottom: 12 }}>
                <table className="table">
                  <thead><tr><th>Sản phẩm</th><th>ĐVT</th><th style={{ width: 100 }}>SL</th><th style={{ width: 130 }}>Giá nhập</th><th className="text-right">Thành tiền</th><th style={{ width: 40 }}></th></tr></thead>
                  <tbody>
                    {editItems.map((item, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{item.name}</td><td>{item.unit}</td>
                        <td><input className="form-input" type="number" min="0" step="any" value={item.quantity} onChange={e => updateEditItem(i, 'quantity', e.target.value)} /></td>
                        <td><input className="form-input" type="number" min="0" value={item.unitPrice} onChange={e => updateEditItem(i, 'unitPrice', e.target.value)} /></td>
                        <td className="text-right font-bold">{formatCurrency((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0))}</td>
                        <td><button className="btn btn-ghost btn-sm" onClick={() => removeEditItem(i)}><Trash2 size={14} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ width: 320, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 16, border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontWeight: 700, fontSize: 16 }}>
                    <span>Tổng tiền:</span><span>{formatCurrency(editTotal)}</span>
                  </div>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label className="form-label" style={{ fontSize: 12 }}>Số tiền trả</label>
                    <input className="form-input" type="number" min="0" value={editPaidAmount} onChange={e => setEditPaidAmount(e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: editDebt > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                    <span>Còn nợ NCC:</span><strong>{formatCurrency(editDebt)}</strong>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="btn btn-ghost" onClick={() => setEditPurchase(null)}>Hủy</button>
                <button className="btn btn-primary" onClick={handleEdit}>Lưu thay đổi</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
