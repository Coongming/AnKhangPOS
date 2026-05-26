'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Truck, Edit2, Lock, Unlock } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { formatCurrency } from '@/lib/utils';

interface Supplier {
  id: string; code: string; name: string; phone: string | null;
  address: string | null; notes: string | null; debt: number; isActive: boolean;
}

export default function SuppliersPage() {
  const { showToast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', address: '', notes: '' });

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const res = await fetch(`/api/suppliers?${params}`);
      setSuppliers(await res.json());
    } catch { showToast('error', 'Lỗi tải dữ liệu'); }
    finally { setLoading(false); }
  }, [search, showToast]);

  useEffect(() => { const t = setTimeout(fetchData, 300); return () => clearTimeout(t); }, [fetchData]);

  const openCreate = () => { setEditing(null); setForm({ name: '', phone: '', address: '', notes: '' }); setShowModal(true); };
  const openEdit = (s: Supplier) => { setEditing(s); setForm({ name: s.name, phone: s.phone || '', address: s.address || '', notes: s.notes || '' }); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { showToast('error', 'Vui lòng nhập tên'); return; }
    try {
      const res = await fetch('/api/suppliers', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { id: editing.id, ...form } : form),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', editing ? 'Đã cập nhật' : 'Đã thêm nhà cung cấp');
      setShowModal(false); fetchData();
    } catch (err) { showToast('error', err instanceof Error ? err.message : 'Lỗi'); }
  };

  const toggleActive = async (s: Supplier) => {
    try {
      await fetch('/api/suppliers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, isActive: !s.isActive }) });
      showToast('success', s.isActive ? 'Đã tạm ngừng' : 'Đã kích hoạt lại');
      fetchData();
    } catch { showToast('error', 'Lỗi cập nhật'); }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-heading)' }}>Quản lý nhà cung cấp</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{suppliers.length} nhà cung cấp</p>
      </div>
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-box" style={{ maxWidth: 320 }}>
            <Search />
            <input placeholder="Tìm theo tên, SĐT, mã..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Thêm NCC</button>
        </div>
      </div>

      {loading ? <div className="loading-page"><div className="loading-spinner" /></div> : suppliers.length === 0 ? (
        <div className="card"><div className="empty-state"><Truck /><h3>Chưa có nhà cung cấp</h3></div></div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Mã</th><th>Tên</th><th>SĐT</th><th>Địa chỉ</th><th className="text-right">Công nợ</th><th>Trạng thái</th><th className="text-center">Thao tác</th></tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} style={{ opacity: s.isActive ? 1 : 0.5 }}>
                  <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{s.code}</td>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td>{s.phone || '—'}</td>
                  <td className="text-muted">{s.address || '—'}</td>
                  <td className="text-right" style={{ fontWeight: 600, color: s.debt > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>{formatCurrency(s.debt)}</td>
                  <td><span className={`badge ${s.isActive ? 'badge-success' : 'badge-danger'}`}>{s.isActive ? 'Hoạt động' : 'Tạm ngừng'}</span></td>
                  <td className="text-center">
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}><Edit2 size={14} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(s)}>{s.isActive ? <Lock size={14} /> : <Unlock size={14} />}</button>
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
            <div className="modal-header"><h3>{editing ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp'}</h3><button className="modal-close" onClick={() => setShowModal(false)}>✕</button></div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Tên nhà cung cấp *</label><input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
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
    </div>
  );
}
