'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, ClipboardList, Edit3, Trash2, Check, X } from 'lucide-react';
import { useToast } from '@/components/Toast';

interface ExpenseCategory { id: string; name: string; type: string; isActive: boolean; _count?: { expenses: number }; }

export default function ExpenseCategoriesPage() {
  const { showToast } = useToast();
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('operating');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('operating');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/expense-categories');
      setCategories(await res.json());
    } catch { showToast('error', 'Lỗi tải dữ liệu'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAdd = async () => {
    if (!newName.trim()) { showToast('error', 'Vui lòng nhập tên'); return; }
    try {
      const res = await fetch('/api/expense-categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim(), type: newType }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', 'Đã thêm danh mục');
      setNewName(''); setNewType('operating'); fetchData();
    } catch (err) { showToast('error', err instanceof Error ? err.message : 'Lỗi'); }
  };

  const handleEdit = async () => {
    if (!editId || !editName.trim()) return;
    try {
      const res = await fetch('/api/expense-categories', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editId, name: editName.trim(), type: editType }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', 'Đã cập nhật');
      setEditId(null); fetchData();
    } catch (err) { showToast('error', err instanceof Error ? err.message : 'Lỗi'); }
  };

  const handleDelete = async (cat: ExpenseCategory) => {
    if (!confirm(`Xóa danh mục "${cat.name}"?`)) return;
    try {
      const res = await fetch(`/api/expense-categories?id=${cat.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', 'Đã xóa danh mục');
      fetchData();
    } catch (err) { showToast('error', err instanceof Error ? err.message : 'Lỗi'); }
  };

  const typeBadge = (type: string) => (
    <span style={{
      padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700,
      background: type === 'cashflow' ? 'var(--accent-bg)' : 'var(--warning-bg)',
      color: type === 'cashflow' ? 'var(--accent)' : 'var(--warning)',
    }}>
      {type === 'cashflow' ? '💰 Lưu chuyển tiền' : '🏭 Vận hành'}
    </span>
  );

  const typeSelect = (value: string, onChange: (v: string) => void) => (
    <select className="form-select" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 160, fontSize: 13 }}>
      <option value="operating">🏭 Vận hành</option>
      <option value="cashflow">💰 Lưu chuyển tiền</option>
    </select>
  );

  return (
    <div>
      <div style={{ marginBottom: 24 }}><h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-heading)' }}>Danh mục chi phí</h2></div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, maxWidth: 700, flexWrap: 'wrap' }}>
        <input className="form-input" placeholder="Tên danh mục mới..." value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdd()} style={{ flex: 1, minWidth: 200 }} />
        {typeSelect(newType, setNewType)}
        <button className="btn btn-primary" onClick={handleAdd}><Plus size={16} /> Thêm</button>
      </div>

      <div style={{ background: 'var(--info-bg)', borderRadius: 'var(--radius-md)', padding: 12, marginBottom: 16, fontSize: 13, color: 'var(--info)', maxWidth: 700 }}>
        💡 <strong>Vận hành</strong> = trừ vào lợi nhuận ròng (điện, nước, lương NV...) &nbsp;|&nbsp; <strong>Lưu chuyển tiền</strong> = chỉ ảnh hưởng sổ quỹ, KHÔNG trừ vào lợi nhuận (rút tiền, nộp vốn...)
      </div>

      {loading ? <div className="loading-page"><div className="loading-spinner" /></div> : categories.length === 0 ? (
        <div className="card"><div className="empty-state"><ClipboardList /><h3>Chưa có danh mục</h3></div></div>
      ) : (
        <div className="table-wrapper" style={{ maxWidth: 700 }}>
          <table className="table"><thead><tr><th>#</th><th>Tên danh mục</th><th>Loại</th><th className="text-center">Số chi phí</th><th className="text-center">Thao tác</th></tr></thead>
            <tbody>{categories.map((c, i) => (
              <tr key={c.id}>
                <td className="text-muted">{i + 1}</td>
                <td>
                  {editId === c.id ? (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input className="form-input" value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleEdit()} autoFocus style={{ flex: 1 }} />
                      {typeSelect(editType, setEditType)}
                      <button className="btn btn-ghost btn-sm text-success" onClick={handleEdit}><Check size={14} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}><X size={14} /></button>
                    </div>
                  ) : (
                    <span style={{ fontWeight: 600 }}>{c.name}</span>
                  )}
                </td>
                <td>{editId !== c.id && typeBadge(c.type)}</td>
                <td className="text-center text-muted">{c._count?.expenses ?? 0}</td>
                <td className="text-center">
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditId(c.id); setEditName(c.name); setEditType(c.type); }} title="Sửa"><Edit3 size={14} /></button>
                    <button className="btn btn-ghost btn-sm text-danger" onClick={() => handleDelete(c)} title="Xóa"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
