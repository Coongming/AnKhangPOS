'use client';

import { useEffect, useState, useCallback } from 'react';
import { Warehouse, Search, AlertTriangle, Edit2 } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { formatNumber, formatDateTime } from '@/lib/utils';

interface StockProduct { id: string; code: string; name: string; unit: string; stock: number; minStock: number; category: { name: string }; }
interface StockMovement { id: string; type: string; quantity: number; stockAfter: number; notes: string | null; createdAt: string; product: { name: string; unit: string }; }

const typeLabels: Record<string, string> = {
  purchase: 'Nhập hàng', sale: 'Bán hàng', sale_cancel: 'Hủy bán', purchase_cancel: 'Hủy nhập', adjustment: 'Điều chỉnh',
};

export default function StockPage() {
  const { showToast } = useToast();
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<StockProduct | null>(null);
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState<StockProduct | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/stock');
      setProducts(await res.json());
    } catch { showToast('error', 'Lỗi tải dữ liệu'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const fetchMovements = useCallback(async (productId: string) => {
    try {
      const res = await fetch(`/api/stock?productId=${productId}`);
      setMovements(await res.json());
    } catch { showToast('error', 'Lỗi tải lịch sử'); }
  }, [showToast]);

  const viewHistory = (p: StockProduct) => {
    setSelectedProduct(p);
    fetchMovements(p.id);
  };

  const openAdjust = (p: StockProduct) => {
    setAdjustProduct(p);
    setAdjustQty(String(p.stock));
    setAdjustNotes('');
    setShowAdjust(true);
  };

  const handleAdjust = async () => {
    if (!adjustProduct || adjustQty === '') return;
    try {
      const res = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: adjustProduct.id, actualStock: adjustQty, notes: adjustNotes }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', 'Đã điều chỉnh tồn kho');
      setShowAdjust(false);
      fetchProducts();
      if (selectedProduct?.id === adjustProduct.id) fetchMovements(adjustProduct.id);
    } catch (err) { showToast('error', err instanceof Error ? err.message : 'Lỗi'); }
  };

  const filtered = products.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase()));
  const lowStock = filtered.filter((p) => p.stock <= p.minStock && p.minStock > 0);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-heading)' }}>Quản lý tồn kho</h2>
      </div>

      {lowStock.length > 0 && (
        <div style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning)', borderRadius: 'var(--radius-md)', padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} style={{ color: 'var(--warning)' }} />
          <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{lowStock.length} sản phẩm sắp hết hàng!</span>
        </div>
      )}

      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-box" style={{ maxWidth: 320 }}><Search /><input placeholder="Tìm sản phẩm..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        </div>
      </div>

      <div className="card-grid card-grid-2">
        {/* Stock List */}
        <div className="card">
          <div className="card-header"><h3 className="card-title">Tồn kho hiện tại</h3></div>
          {loading ? <div className="loading-page"><div className="loading-spinner" /></div> : (
            <div className="table-wrapper" style={{ maxHeight: 500, overflowY: 'auto' }}>
              <table className="table">
                <thead><tr><th>Sản phẩm</th><th>Nhóm</th><th className="text-right">Tồn kho</th><th className="text-center">Thao tác</th></tr></thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id} onClick={() => viewHistory(p)} style={{ cursor: 'pointer' }}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.code}</div>
                      </td>
                      <td><span className="badge badge-neutral">{p.category.name}</span></td>
                      <td className="text-right">
                        <span style={{ fontWeight: 700, color: p.stock <= p.minStock && p.minStock > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
                          {formatNumber(p.stock)}
                        </span>
                        <span className="text-muted"> {p.unit}</span>
                        {p.stock <= p.minStock && p.minStock > 0 && <span style={{ color: 'var(--danger)', fontSize: 11, marginLeft: 4 }}>⚠</span>}
                      </td>
                      <td className="text-center">
                        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); openAdjust(p); }}><Edit2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Movement History */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              {selectedProduct ? `Lịch sử: ${selectedProduct.name}` : 'Chọn sản phẩm để xem lịch sử'}
            </h3>
          </div>
          {!selectedProduct ? (
            <div className="empty-state"><Warehouse /><h3>Chọn sản phẩm</h3><p>Bấm vào sản phẩm bên trái</p></div>
          ) : movements.length === 0 ? (
            <div className="empty-state"><Warehouse /><h3>Chưa có biến động</h3></div>
          ) : (
            <div className="table-wrapper" style={{ maxHeight: 500, overflowY: 'auto' }}>
              <table className="table">
                <thead><tr><th>Thời gian</th><th>Loại</th><th className="text-right">SL</th><th className="text-right">Sau</th><th>Ghi chú</th></tr></thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{formatDateTime(m.createdAt)}</td>
                      <td><span className={`badge ${m.quantity > 0 ? 'badge-success' : 'badge-danger'}`}>{typeLabels[m.type] || m.type}</span></td>
                      <td className="text-right" style={{ fontWeight: 600, color: m.quantity > 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {m.quantity > 0 ? '+' : ''}{formatNumber(m.quantity)}
                      </td>
                      <td className="text-right">{formatNumber(m.stockAfter)}</td>
                      <td className="text-muted" style={{ fontSize: 12 }}>{m.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Adjust Modal */}
      {showAdjust && adjustProduct && (
        <div className="modal-overlay" onClick={() => setShowAdjust(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Điều chỉnh tồn kho</h3><button className="modal-close" onClick={() => setShowAdjust(false)}>✕</button></div>
            <div className="modal-body">
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 12, marginBottom: 16 }}>
                <div style={{ fontWeight: 600 }}>{adjustProduct.name}</div>
                <div className="text-muted">Tồn kho hiện tại: {formatNumber(adjustProduct.stock)} {adjustProduct.unit}</div>
              </div>
              <div className="form-group">
                <label className="form-label">Số lượng thực tế sau kiểm kê</label>
                <input className="form-input" type="number" min="0" step="any" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Lý do điều chỉnh</label>
                <input className="form-input" value={adjustNotes} onChange={(e) => setAdjustNotes(e.target.value)} placeholder="VD: Kiểm kê cuối tuần" />
              </div>
            </div>
            <div className="modal-footer"><button className="btn btn-ghost" onClick={() => setShowAdjust(false)}>Hủy</button><button className="btn btn-primary" onClick={handleAdjust}>Xác nhận</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
