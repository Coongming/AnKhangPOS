'use client';

import { useState } from 'react';
import { FileDown, Calendar } from 'lucide-react';

export default function ExportPage() {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/export/sales?date=${date}`);
      if (!res.ok) throw new Error('Lỗi xuất file');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bao-cao-ban-hang-${date}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Không thể xuất file, thử lại sau');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-heading)', marginBottom: 4 }}>
          Xuất báo cáo
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Xuất file Excel chi tiết bán hàng theo ngày
        </p>
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <div className="card-header">
          <h3 className="card-title">
            <FileDown size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: -2 }} />
            Xuất báo cáo bán hàng
          </h3>
        </div>
        <div style={{ padding: '16px' }}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-heading)', display: 'block', marginBottom: 6 }}>
              <Calendar size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
              Chọn ngày
            </label>
            <input
              type="date"
              className="form-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={today}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ background: 'var(--bg-body)', borderRadius: 8, padding: '12px 14px', marginBottom: 20, fontSize: 13, color: 'var(--text-muted)' }}>
            File Excel sẽ gồm 2 sheet:
            <ul style={{ margin: '8px 0 0 16px', lineHeight: 2 }}>
              <li><strong style={{ color: 'var(--text-heading)' }}>Sheet 1:</strong> Chi tiết từng đơn hàng</li>
              <li><strong style={{ color: 'var(--text-heading)' }}>Sheet 2:</strong> Tổng hợp theo sản phẩm</li>
            </ul>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleExport}
            disabled={loading || !date}
            style={{ width: '100%', justifyContent: 'center', height: 44, fontSize: 15 }}
          >
            <FileDown size={18} style={{ marginRight: 8 }} />
            {loading ? 'Đang xuất...' : 'Xuất file Excel'}
          </button>
        </div>
      </div>
    </div>
  );
}