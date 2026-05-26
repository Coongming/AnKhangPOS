'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Trash2, Save, BookOpen, Edit2 } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { formatNumber } from '@/lib/utils';

interface Product { id: string; code: string; name: string; unit: string; stock: number; costPrice: number; }
interface IngredientItem { productId: string; name: string; unit: string; quantity: string; stock: number; }
interface BlendTemplate {
  id: string; name: string; notes: string | null;
  outputProduct: { id: string; name: string; code: string; unit: string } | null;
  linkedProducts: Array<{ id: string; name: string }>;
  items: Array<{ productId: string; quantity: number; product: { id: string; name: string; code: string; unit: string; stock: number } }>;
}

export default function BlendPage() {
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<BlendTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<BlendTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateNotes, setTemplateNotes] = useState('');
  const [ingredients, setIngredients] = useState<IngredientItem[]>([]);
  const [searchProduct, setSearchProduct] = useState('');
  const [outputProductId, setOutputProductId] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [prodRes, tempRes] = await Promise.all([
        fetch('/api/products?status=active'),
        fetch('/api/blend-templates'),
      ]);
      setProducts(await prodRes.json());
      setTemplates(await tempRes.json());
    } catch { showToast('error', 'Lỗi tải dữ liệu'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- Ingredient management ---
  const addIngredient = (product: Product) => {
    if (ingredients.find(i => i.productId === product.id)) {
      showToast('warning', 'Nguyên liệu đã có trong danh sách');
      return;
    }
    setIngredients([...ingredients, {
      productId: product.id, name: product.name, unit: product.unit,
      quantity: '', stock: product.stock,
    }]);
    setSearchProduct('');
  };

  const updateIngredient = (index: number, quantity: string) => {
    const newItems = [...ingredients];
    newItems[index] = { ...newItems[index], quantity };
    setIngredients(newItems);
  };

  const removeIngredient = (index: number) => setIngredients(ingredients.filter((_, i) => i !== index));

  const totalQty = ingredients.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0);

  // --- Form ---
  const openCreate = () => {
    setEditingTemplate(null);
    setTemplateName('');
    setTemplateNotes('');
    setIngredients([]);
    setOutputProductId('');
    setShowForm(true);
  };

  const openEdit = (template: BlendTemplate) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateNotes(template.notes || '');
    setOutputProductId(template.linkedProducts?.[0]?.id || '');
    const newIngredients: IngredientItem[] = template.items.map(item => ({
      productId: item.productId,
      name: item.product.name,
      unit: item.product.unit,
      quantity: String(item.quantity),
      stock: item.product.stock,
    }));
    setIngredients(newIngredients);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!templateName.trim()) { showToast('error', 'Nhập tên mẫu trộn'); return; }
    if (ingredients.length < 2) { showToast('error', 'Cần ít nhất 2 nguyên liệu'); return; }
    for (const item of ingredients) {
      if (!parseFloat(item.quantity) || parseFloat(item.quantity) <= 0) {
        showToast('error', `Nhập số lượng cho "${item.name}"`); return;
      }
    }

    try {
      if (editingTemplate) {
        // Delete old + create new
        const delRes = await fetch(`/api/blend-templates?id=${editingTemplate.id}`, { method: 'DELETE' });
        if (!delRes.ok) throw new Error('Lỗi xóa mẫu cũ');
      }

      const res = await fetch('/api/blend-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateName.trim(),
          items: ingredients.map(i => ({ productId: i.productId, quantity: parseFloat(i.quantity) })),
          notes: templateNotes || null,
        }),
      });
      const newTemplate = await res.json();
      if (!res.ok) throw new Error(newTemplate.error);
      if (outputProductId) {
        // Clear old link if editing
        if (editingTemplate?.linkedProducts?.[0]?.id && editingTemplate.linkedProducts[0].id !== outputProductId) {
          await fetch('/api/products', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editingTemplate.linkedProducts[0].id, blendTemplateId: '' }),
          });
        }
        await fetch('/api/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: outputProductId, blendTemplateId: newTemplate.id }),
        });
      }

      showToast('success', editingTemplate ? 'Đã cập nhật mẫu trộn' : 'Đã tạo mẫu trộn');
      setShowForm(false);
      fetchData();
    } catch (err) { showToast('error', err instanceof Error ? err.message : 'Lỗi'); }
  };

  const handleDelete = async (template: BlendTemplate) => {
    if (template.linkedProducts && template.linkedProducts.length > 0) {
      showToast('error', `Không thể xóa: đang được sử dụng bởi ${template.linkedProducts.map(p => p.name).join(', ')}`);
      return;
    }
    if (!confirm(`Xóa mẫu "${template.name}"?`)) return;
    try {
      const res = await fetch(`/api/blend-templates?id=${template.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('success', 'Đã xóa mẫu trộn');
      fetchData();
    } catch (err) { showToast('error', err instanceof Error ? err.message : 'Lỗi'); }
  };

  // --- Search ---
  const filteredProducts = products.filter(p =>
    searchProduct && (p.name.toLowerCase().includes(searchProduct.toLowerCase()) || p.code.toLowerCase().includes(searchProduct.toLowerCase()))
  );

  if (loading) return <div className="loading-page"><div className="loading-spinner" /></div>;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-heading)' }}>🍚 Mẫu trộn gạo</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Quản lý công thức trộn — Khi bán sản phẩm liên kết, hệ thống tự trừ kho nguyên liệu theo tỷ lệ</p>
      </div>

      {!showForm ? (
        <>
          <div className="toolbar" style={{ marginBottom: 16 }}>
            <div className="toolbar-right">
              <button className="btn btn-primary" onClick={openCreate}>
                <Plus size={16} /> Tạo mẫu trộn mới
              </button>
            </div>
          </div>

          {templates.length === 0 ? (
            <div className="card"><div className="empty-state"><BookOpen /><h3>Chưa có mẫu trộn</h3><p>Tạo công thức trộn rồi liên kết với sản phẩm trong trang Quản lý sản phẩm</p></div></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 16 }}>
              {templates.map(t => {
                const totalQty = t.items.reduce((sum, i) => sum + i.quantity, 0);
                return (
                  <div key={t.id} className="card" style={{ padding: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <h4 style={{ color: 'var(--text-heading)', margin: 0, fontSize: 16 }}>📋 {t.name}</h4>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(t)} title="Sửa"><Edit2 size={14} /></button>
                        <button className="btn btn-ghost btn-sm text-danger" onClick={() => handleDelete(t)} title="Xóa"><Trash2 size={14} /></button>
                      </div>
                    </div>

                    {/* Tỷ lệ nguyên liệu */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>CÔNG THỨC ({formatNumber(totalQty)} {t.items[0]?.product.unit || 'kg'}):</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {t.items.map((item, i) => {
                          const pct = totalQty > 0 ? (item.quantity / totalQty * 100).toFixed(0) : '0';
                          return (
                            <div key={i} style={{
                              padding: '6px 10px', background: 'var(--bg-secondary)',
                              borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)',
                              fontSize: 13,
                            }}>
                              <span style={{ fontWeight: 600 }}>{item.product.name}</span>
                              <span className="text-muted"> • {formatNumber(item.quantity)} {item.product.unit}</span>
                              <span style={{ color: 'var(--accent)', fontWeight: 600 }}> ({pct}%)</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Sản phẩm đang sử dụng mẫu này */}
                    {t.linkedProducts && t.linkedProducts.length > 0 && (
                      <div style={{ fontSize: 12, marginTop: 8, padding: '6px 10px', background: 'var(--success-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--success)' }}>
                        <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Đang dùng bởi: </span>
                        <span style={{ color: 'var(--success)' }}>{t.linkedProducts.map(p => p.name).join(', ')}</span>
                      </div>
                    )}

                    {(!t.linkedProducts || t.linkedProducts.length === 0) && (
                      <div style={{ fontSize: 12, marginTop: 8, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Chưa liên kết sản phẩm — vào Quản lý SP → chọn &quot;Mẫu trộn&quot; để liên kết
                      </div>
                    )}

                    {t.notes && <p className="text-muted" style={{ marginTop: 8, fontSize: 12 }}>{t.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* Create/Edit Form */
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">{editingTemplate ? `Sửa mẫu: ${editingTemplate.name}` : 'Tạo mẫu trộn mới'}</h3>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Hủy</button>
          </div>

          <div className="form-row form-row-2" style={{ marginBottom: 16 }}>
            <div className="form-group">
              <label className="form-label">Tên mẫu trộn *</label>
              <input className="form-input" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="VD: Gạo thượng hạng lô A" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Sản phẩm đầu ra *</label>
              <select className="form-select" value={outputProductId} onChange={(e) => setOutputProductId(e.target.value)}>
                <option value="">-- Chọn sản phẩm đầu ra --</option>
                {products
                  .filter(p => !ingredients.find(i => i.productId === p.id))
                  .map(p => (
                    <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                  ))}
              </select>
              <span className="form-hint">SP sẽ tự trừ kho nguyên liệu khi bán</span>
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Ghi chú</label>
            <input className="form-input" value={templateNotes} onChange={(e) => setTemplateNotes(e.target.value)} placeholder="Ghi chú..." />
          </div>

          {/* Search & add ingredients */}
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <div className="search-box">
              <Search />
              <input placeholder="Tìm nguyên liệu để thêm..." value={searchProduct} onChange={(e) => setSearchProduct(e.target.value)} />
            </div>
            {filteredProducts.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', zIndex: 10, maxHeight: 200, overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
                {filteredProducts.map(p => (
                  <div key={p.id} onClick={() => addIngredient(p)} style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)' }} className="nav-item">
                    <span>{p.code} - {p.name}</span>
                    <span className="text-muted">Tồn: {formatNumber(p.stock)} {p.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ingredients table */}
          {ingredients.length > 0 && (
            <div className="table-wrapper" style={{ marginBottom: 20 }}>
              <table className="table">
                <thead><tr><th>Nguyên liệu</th><th>ĐVT</th><th className="text-right">Tồn kho</th><th style={{ width: 130 }}>Số lượng</th><th className="text-right">Tỷ lệ</th><th style={{ width: 50 }}></th></tr></thead>
                <tbody>
                  {ingredients.map((item, i) => {
                    const qty = parseFloat(item.quantity) || 0;
                    const pct = totalQty > 0 ? (qty / totalQty * 100).toFixed(1) : '0';
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{item.name}</td>
                        <td>{item.unit}</td>
                        <td className="text-right text-muted">{formatNumber(item.stock)}</td>
                        <td><input className="form-input" type="number" min="0" step="any" value={item.quantity} onChange={(e) => updateIngredient(i, e.target.value)} placeholder="0" /></td>
                        <td className="text-right" style={{ fontWeight: 600, color: 'var(--accent)' }}>{pct}%</td>
                        <td><button className="btn btn-ghost btn-sm" onClick={() => removeIngredient(i)}><Trash2 size={14} /></button></td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: '2px solid var(--border-color)', fontWeight: 700 }}>
                    <td colSpan={3}>Tổng cộng</td>
                    <td className="text-right">{formatNumber(totalQty)} kg</td>
                    <td className="text-right">100%</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 12, marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
            💡 <strong>Cách hoạt động:</strong> Chọn sản phẩm đầu ra + thêm nguyên liệu → khi bán SP đầu ra, hệ thống tự trừ kho nguyên liệu theo tỷ lệ.
          </div>

          <button className="btn btn-primary btn-lg w-full" onClick={handleSubmit} disabled={ingredients.length < 2}>
            <Save size={18} /> {editingTemplate ? 'Cập nhật mẫu trộn' : 'Lưu mẫu trộn'}
          </button>
        </div>
      )}
    </div>
  );
}
