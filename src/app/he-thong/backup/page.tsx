'use client';

import { useState } from 'react';
import { Database, Download, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/Toast';

export default function BackupPage() {
  const { showToast } = useToast();
  const [downloading, setDownloading] = useState(false);

  const handleBackup = async () => {
    setDownloading(true);
    try {
      const res = await fetch('/api/backup');
      if (!res.ok) throw new Error('Lỗi tạo backup');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const filename = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'backup.sql';
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showToast('success', `Đã tải backup: ${filename}`);
    } catch {
      showToast('error', 'Không thể tạo backup, thử lại sau');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-heading)' }}>Sao lưu & Khôi phục</h2>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* Backup */}
        <div className="card" style={{ flex: 1, minWidth: 300, maxWidth: 500 }}>
          <div className="card-header">
            <h3 className="card-title">
              <Database size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: -3 }} />
              Sao lưu dữ liệu
            </h3>
          </div>
          <div style={{ padding: '16px 0' }}>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: 13, marginBottom: 16 }}>
              Tải toàn bộ dữ liệu (khách hàng, sản phẩm, hóa đơn, công nợ...) thành file <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4 }}>.sql</code>. Lưu file này ở nơi an toàn (USB, Google Drive, v.v.)
            </p>

            <button
              className="btn btn-primary btn-lg w-full"
              onClick={handleBackup}
              disabled={downloading}
              style={{ justifyContent: 'center', height: 48 }}
            >
              <Download size={18} style={{ marginRight: 8 }} />
              {downloading ? 'Đang tạo backup...' : '📦 Tải backup ngay'}
            </button>

            <div style={{ background: 'var(--warning-bg)', borderRadius: 'var(--radius-md)', padding: 12, marginTop: 16, fontSize: 13, color: 'var(--warning)' }}>
              ⚠️ <strong>Lưu ý:</strong> Database đang chạy local trên máy này. Nếu máy hỏng mà chưa backup → <strong>mất hết dữ liệu</strong>. Nên backup ít nhất 1 lần/ngày.
            </div>
          </div>
        </div>

        {/* Hướng dẫn khôi phục */}
        <div className="card" style={{ flex: 1, minWidth: 300, maxWidth: 500 }}>
          <div className="card-header">
            <h3 className="card-title">
              <CheckCircle size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: -3 }} />
              Khôi phục dữ liệu
            </h3>
          </div>
          <div style={{ padding: '16px 0' }}>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: 13, marginBottom: 12 }}>
              Khi cần khôi phục (máy mới, cài lại...), chạy lệnh sau từ Terminal:
            </p>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 16 }}>
              <code style={{ fontSize: 12, color: 'var(--accent)', whiteSpace: 'pre-wrap', display: 'block', lineHeight: 2 }}>
                {`# Khôi phục từ file backup\npsql -U ankhang -d ankhangpos < backup-file.sql`}
              </code>
            </div>

            <div style={{ background: 'var(--info-bg)', borderRadius: 'var(--radius-md)', padding: 12, marginTop: 16, fontSize: 13, color: 'var(--info)' }}>
              💡 <strong>Mẹo:</strong> Lưu file backup lên Google Drive hoặc USB sau mỗi ngày làm việc để an toàn nhất.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
