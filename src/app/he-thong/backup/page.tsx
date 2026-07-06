'use client';

import { useState } from 'react';
import { Database, Download, CheckCircle, Cloud, Loader2 } from 'lucide-react';
import { useToast } from '@/components/Toast';

export default function BackupPage() {
  const { showToast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ message: string; totalRows: number } | null>(null);

  const handleBackup = async () => {
    setDownloading(true);
    try {
      const res = await fetch('/api/backup');
      if (!res.ok) throw new Error('Lỗi tạo backup');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const filename = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'backup.json';
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

  const handleSync = async () => {
    if (!confirm('Xác nhận đồng bộ dữ liệu local lên Database Online?\n\nDữ liệu trên cloud sẽ bị GHI ĐÈ bằng dữ liệu local hiện tại.')) return;

    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Lỗi đồng bộ');

      setSyncResult({ message: data.message, totalRows: data.totalRows });
      showToast('success', data.message);
    } catch (err: any) {
      showToast('error', err.message || 'Đồng bộ thất bại');
    } finally {
      setSyncing(false);
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
              Tải toàn bộ dữ liệu (khách hàng, sản phẩm, hóa đơn, công nợ...) thành file <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4 }}>.json</code>.
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
              ⚠️ <strong>Lưu ý:</strong> Database đang chạy local. Nếu ổ cứng hỏng mà chưa backup → <strong>mất hết dữ liệu</strong>. Nên tải file này và ném lên Google Drive ít nhất 1 lần/ngày.
            </div>
          </div>
        </div>

        {/* Khôi phục */}
        <div className="card" style={{ flex: 1, minWidth: 300, maxWidth: 500 }}>
          <div className="card-header">
            <h3 className="card-title">
              <CheckCircle size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: -3 }} />
              Khôi phục dữ liệu
            </h3>
          </div>
          <div style={{ padding: '16px 0' }}>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: 13, marginBottom: 16 }}>
              Chọn file <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4 }}>.json</code> đã tải về trước đó để khôi phục toàn bộ dữ liệu.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                type="file"
                id="restore-file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;

                  if (!confirm('CẢNH BÁO: Quá trình này sẽ XÓA SẠCH dữ liệu hiện tại và thay thế bằng dữ liệu từ file backup. Bạn có chắc chắn muốn tiếp tục?')) {
                    e.target.value = '';
                    return;
                  }

                  try {
                    showToast('success', 'Đang đọc file và khôi phục dữ liệu...');
                    const text = await file.text();
                    const data = JSON.parse(text);

                    const res = await fetch('/api/backup/restore', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(data)
                    });

                    if (!res.ok) {
                      const errorData = await res.json();
                      throw new Error(errorData.error || 'Lỗi khôi phục');
                    }

                    showToast('success', 'Khôi phục thành công! Trang sẽ tự động tải lại...');
                    setTimeout(() => window.location.reload(), 2000);
                  } catch (err: any) {
                    showToast('error', err.message || 'File backup không hợp lệ hoặc lỗi server');
                    e.target.value = '';
                  }
                }}
              />

              <button
                className="btn btn-outline btn-lg w-full"
                onClick={() => document.getElementById('restore-file')?.click()}
                style={{ justifyContent: 'center', height: 48, borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                <Database size={18} style={{ marginRight: 8 }} />
                Nạp file Backup (.json)
              </button>
            </div>

            <div style={{ background: 'var(--danger-bg)', borderRadius: 'var(--radius-md)', padding: 12, marginTop: 16, fontSize: 13, color: 'var(--danger)' }}>
              🚨 <strong>Rất quan trọng:</strong> Hành động này không thể hoàn tác. Dữ liệu hiện tại sẽ bị ghi đè hoàn toàn.
            </div>
          </div>
        </div>

        {/* Đồng bộ Online */}
        <div className="card" style={{ flex: 1, minWidth: 300, maxWidth: 500 }}>
          <div className="card-header">
            <h3 className="card-title">
              <Cloud size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: -3 }} />
              Đồng bộ DATA Online
            </h3>
          </div>
          <div style={{ padding: '16px 0' }}>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: 13, marginBottom: 16 }}>
              Đẩy toàn bộ dữ liệu local lên Database Online (Supabase). Sau khi đồng bộ, bạn có thể xem dữ liệu từ xa qua trang web online.
            </p>

            <button
              className="btn btn-primary btn-lg w-full"
              onClick={handleSync}
              disabled={syncing}
              style={{ justifyContent: 'center', height: 48, background: syncing ? undefined : '#22c55e' }}
            >
              {syncing ? (
                <><Loader2 size={18} style={{ marginRight: 8, animation: 'spin 1s linear infinite' }} /> Đang đồng bộ...</>
              ) : (
                <><Cloud size={18} style={{ marginRight: 8 }} /> ☁️ Đồng bộ lên Online</>
              )}
            </button>

            {syncResult && (
              <div style={{ background: 'var(--success-bg)', borderRadius: 'var(--radius-md)', padding: 12, marginTop: 16, fontSize: 13, color: 'var(--success)' }}>
                ✅ {syncResult.message}
              </div>
            )}

            <div style={{ background: 'var(--info-bg)', borderRadius: 'var(--radius-md)', padding: 12, marginTop: 16, fontSize: 13, color: 'var(--info)' }}>
              ℹ️ <strong>Lưu ý:</strong> Dữ liệu trên cloud sẽ bị <strong>ghi đè hoàn toàn</strong> bằng dữ liệu local. Chỉ dùng khi muốn cập nhật dữ liệu online mới nhất.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
