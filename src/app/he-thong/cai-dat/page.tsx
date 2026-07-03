'use client';

import { useEffect, useState, useCallback } from 'react';
import { Settings, Save, FileText } from 'lucide-react';
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

  const updateSetting = (key: string, value: string) => setSettings({ ...settings, [key]: value });

  if (loading) return <div className="loading-page"><div className="loading-spinner" /></div>;

  return (
    <div>
      <div style={{ marginBottom: 24 }}><h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-heading)' }}>Cài đặt hệ thống</h2></div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* LEFT: Settings forms */}
        <div style={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Thông tin cửa hàng */}
          <div className="card">
            <div className="card-header"><h3 className="card-title"><Settings size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: -3 }} />Thông tin cửa hàng</h3></div>
            <div className="form-group"><label className="form-label">Tên cửa hàng</label><input className="form-input" value={settings.store_name || ''} onChange={(e) => updateSetting('store_name', e.target.value)} /></div>
            <div className="form-row form-row-2">
              <div className="form-group"><label className="form-label">Số điện thoại</label><input className="form-input" value={settings.store_phone || ''} onChange={(e) => updateSetting('store_phone', e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Địa chỉ</label><input className="form-input" value={settings.store_address || ''} onChange={(e) => updateSetting('store_address', e.target.value)} /></div>
            </div>
          </div>

          {/* Thiết kế hóa đơn */}
          <div className="card">
            <div className="card-header"><h3 className="card-title"><FileText size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: -3 }} />Thiết kế hóa đơn</h3></div>
            <div className="form-group">
              <label className="form-label">Mô tả ngành hàng</label>
              <input className="form-input" value={settings.store_tagline || ''} onChange={(e) => updateSetting('store_tagline', e.target.value)} placeholder="VD: Gạo Sạch & Nước Uống Chính Hãng" />
              <span className="form-hint">Hiện dưới tên cửa hàng trên hóa đơn</span>
            </div>
            <div className="form-group">
              <label className="form-label">Slogan cuối hóa đơn</label>
              <input className="form-input" value={settings.store_slogan || ''} onChange={(e) => updateSetting('store_slogan', e.target.value)} placeholder="VD: Có An Khang, cơm nhà thêm trọn vị!" />
              <span className="form-hint">Hiện ở cuối hóa đơn, phía dưới &quot;Cảm ơn Quý khách!&quot;</span>
            </div>
          </div>

          {/* Cài đặt bán hàng */}
          <div className="card">
            <div className="card-header"><h3 className="card-title"><Settings size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: -3 }} />Cài đặt bán hàng</h3></div>
            <div className="form-group">
              <label className="form-label">Cho phép bán âm kho</label>
              <select className="form-select" value={settings.allow_negative_stock || 'false'} onChange={(e) => updateSetting('allow_negative_stock', e.target.value)}>
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
          </div>

          <button className="btn btn-primary" onClick={handleSave} style={{ alignSelf: 'flex-start' }}><Save size={16} /> Lưu cài đặt</button>
        </div>

        {/* RIGHT: Invoice preview */}
        <div style={{ width: 380, flexShrink: 0 }}>
          <div className="card" style={{ position: 'sticky', top: 80 }}>
            <div className="card-header"><h3 className="card-title">👁 Xem trước hóa đơn</h3></div>
            <div style={{ padding: 16 }}>
              <div style={{
                background: '#ffffff', color: '#1a1a1a', padding: 20, borderRadius: 8, fontSize: 13,
                fontFamily: "'Inter', -apple-system, sans-serif",
                border: '1px solid #e0e0e0',
              }}>
                {/* Header preview */}
                <div style={{ textAlign: 'center', marginBottom: 12, borderBottom: '2px solid #e53e3e', paddingBottom: 12 }}>
                  <img src="/logo.png" alt="Logo" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'contain', margin: '0 auto 6px', display: 'block' }} />
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#e53e3e', lineHeight: 1.2 }}>
                    {settings.store_name || 'Tên cửa hàng'}
                  </div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 2, fontWeight: 700 }}>
                    {settings.store_tagline || 'Mô tả ngành hàng'}
                  </div>
                  <div style={{ fontSize: 11, color: '#999', marginTop: 2, fontWeight: 700 }}>
                    📍 {settings.store_address || 'Địa chỉ'}
                  </div>
                  <div style={{ fontSize: 13, color: '#e53e3e', fontWeight: 800, marginTop: 3 }}>
                    📞 {settings.store_phone || 'Số điện thoại'}
                  </div>
                </div>

                {/* Sample content */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 11 }}>
                  <div><div style={{ fontWeight: 700, fontSize: 13 }}>#HD0001</div><div style={{ color: '#666' }}>💵 Tiền mặt</div></div>
                  <div style={{ textAlign: 'right' }}><div style={{ fontWeight: 600 }}>03/07/2026</div><div style={{ color: '#666' }}>07:00</div></div>
                </div>

                <div style={{ background: '#f5f5f5', borderRadius: 6, padding: '6px 10px', marginBottom: 10, fontSize: 11 }}>
                  <div style={{ fontWeight: 600 }}>👤 Nguyễn Văn A</div>
                  <div style={{ color: '#666' }}>📞 0901234567</div>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10, fontSize: 11 }}>
                  <thead><tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                    <th style={{ textAlign: 'left', padding: '4px 0', color: '#666', fontWeight: 600 }}>Sản phẩm</th>
                    <th style={{ textAlign: 'center', padding: '4px 2px', color: '#666', fontWeight: 600 }}>SL</th>
                    <th style={{ textAlign: 'right', padding: '4px 0', color: '#666', fontWeight: 600 }}>T.Tiền</th>
                  </tr></thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #f0f0f0' }}><td style={{ padding: '5px 0', fontWeight: 600 }}>Gạo ST25</td><td style={{ textAlign: 'center' }}>2 bao</td><td style={{ textAlign: 'right', fontWeight: 600 }}>400,000</td></tr>
                    <tr style={{ borderBottom: '1px solid #f0f0f0' }}><td style={{ padding: '5px 0', fontWeight: 600 }}>Nước suối</td><td style={{ textAlign: 'center' }}>1 thùng</td><td style={{ textAlign: 'right', fontWeight: 600 }}>80,000</td></tr>
                  </tbody>
                </table>

                <div style={{ borderTop: '2px solid #4f46e5', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 14 }}>
                  <span>TỔNG CỘNG:</span><span style={{ color: '#4f46e5' }}>480,000đ</span>
                </div>

                {/* Footer preview */}
                <div style={{ marginTop: 12, textAlign: 'center', borderTop: '1px dashed #ddd', paddingTop: 8 }}>
                  <div style={{ color: '#999', fontSize: 11, fontWeight: 700 }}>Cảm ơn Quý khách!</div>
                  {(settings.store_slogan) && (
                    <div style={{ color: '#e53e3e', fontSize: 10, fontWeight: 700, marginTop: 3, fontStyle: 'italic' }}>
                      {settings.store_slogan}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
