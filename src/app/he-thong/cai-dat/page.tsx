'use client';

import { useEffect, useState, useCallback } from 'react';
import { Settings, Save } from 'lucide-react';
import { useToast } from '@/components/Toast';

export default function SettingsPage() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      const map: Record<string, string> = {};
      data.forEach((s: { key: string; value: string }) => { map[s.key] = s.value; });
      setSettings(map);
    } catch { showToast('error', 'Lỗi tải cài đặt'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error();
      showToast('success', 'Đã lưu cài đặt');
    } catch { showToast('error', 'Lỗi lưu cài đặt'); }
  };

  if (loading) return <div className="loading-page"><div className="loading-spinner" /></div>;

  return (
    <div>
      <div style={{ marginBottom: 24 }}><h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-heading)' }}>Cài đặt hệ thống</h2></div>
      <div className="card" style={{ maxWidth: 600 }}>
        <div className="card-header"><h3 className="card-title"><Settings size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: -3 }} />Thông tin cửa hàng</h3></div>
        <div className="form-group"><label className="form-label">Tên cửa hàng</label><input className="form-input" value={settings.store_name || ''} onChange={(e) => setSettings({ ...settings, store_name: e.target.value })} /></div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Số điện thoại</label><input className="form-input" value={settings.store_phone || ''} onChange={(e) => setSettings({ ...settings, store_phone: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Địa chỉ</label><input className="form-input" value={settings.store_address || ''} onChange={(e) => setSettings({ ...settings, store_address: e.target.value })} /></div>
        </div>
        <div className="form-group">
          <label className="form-label">Cho phép bán âm kho</label>
          <select className="form-select" value={settings.allow_negative_stock || 'false'} onChange={(e) => setSettings({ ...settings, allow_negative_stock: e.target.value })}>
            <option value="false">Không (mặc định)</option>
            <option value="true">Có</option>
          </select>
          <span className="form-hint">Nếu bật, có thể bán khi tồn kho = 0</span>
        </div>
        <div className="form-group">
          <label className="form-label">Phương pháp giá vốn</label>
          <select className="form-select" value={settings.cost_method || 'weighted_average'} disabled>
            <option value="weighted_average">Bình quân gia quyền</option>
          </select>
          <span className="form-hint">Đã chốt ở v1, không thể thay đổi</span>
        </div>
        <button className="btn btn-primary mt-2" onClick={handleSave}><Save size={16} /> Lưu cài đặt</button>
      </div>
    </div>
  );
}
