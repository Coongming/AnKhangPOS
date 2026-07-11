'use client';

import { useState } from 'react';
import { Database, Download, CheckCircle, Cloud, Loader2 } from 'lucide-react';
import { useToast } from '@/components/Toast';

export default function BackupPage() {
  const { showToast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [syncResult, setSyncResult] = useState<{ message: string; totalRows: number } | null>(null);
  const [pullResult, setPullResult] = useState<{ message: string; totalRows: number; backupFile?: string } | null>(null);

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

  const handlePullOnline = async () => {
    if (!confirm('Xác nhận kéo dữ liệu từ Database Online về máy này?\n\nDữ liệu local hiện tại sẽ được backup rồi GHI ĐÈ bằng dữ liệu trên Supabase.')) return;

    setPulling(true);
    setPullResult(null);
    try {
      const res = await fetch('/api/sync/pull', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Lỗi kéo dữ liệu');

      setPullResult({ message: data.message, totalRows: data.totalRows, backupFile: data.backupFile });
      showToast('success', data.message);
    } catch (err: any) {
      showToast('error', err.message || 'Kéo dữ liệu thất bại');
    } finally {
      setPulling(false);
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

        {/* Kéo dữ liệu Online về Local */}
        <div className="card" style={{ flex: 1, minWidth: 300, maxWidth: 500 }}>
          <div className="card-header">
            <h3 className="card-title">
              <Cloud size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: -3 }} />
              Kéo DATA Online về Local
            </h3>
          </div>
          <div style={{ padding: '16px 0' }}>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: 13, marginBottom: 16 }}>
              Lấy dữ liệu mới nhất từ Database Online (Supabase) về máy này. Hệ thống sẽ backup dữ liệu local trước khi ghi đè.
            </p>

            <button
              className="btn btn-outline btn-lg w-full"
              onClick={handlePullOnline}
              disabled={pulling}
              style={{ justifyContent: 'center', height: 48, borderColor: '#0ea5e9', color: '#0ea5e9' }}
            >
              {pulling ? (
                <><Loader2 size={18} style={{ marginRight: 8, animation: 'spin 1s linear infinite' }} /> Đang kéo dữ liệu...</>
              ) : (
                <><Download size={18} style={{ marginRight: 8 }} /> Kéo Online về Local</>
              )}
            </button>

            {pullResult && (
              <div style={{ background: 'var(--success-bg)', borderRadius: 'var(--radius-md)', padding: 12, marginTop: 16, fontSize: 13, color: 'var(--success)' }}>
                {pullResult.message}
                {pullResult.backupFile && (
                  <div style={{ marginTop: 6, color: 'var(--text-secondary)' }}>
                    Backup local: {pullResult.backupFile}
                  </div>
                )}
              </div>
            )}

            <div style={{ background: 'var(--danger-bg)', borderRadius: 'var(--radius-md)', padding: 12, marginTop: 16, fontSize: 13, color: 'var(--danger)' }}>
              <strong>Lưu ý:</strong> Dữ liệu local sẽ bị <strong>ghi đè hoàn toàn</strong> bằng dữ liệu trên cloud. Chỉ dùng sau khi máy khác đã Sync lên Online.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
