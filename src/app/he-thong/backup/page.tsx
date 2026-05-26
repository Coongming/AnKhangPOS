'use client';

import { Database, History } from 'lucide-react';

export default function BackupPage() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}><h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-heading)' }}>Sao lưu & Khôi phục</h2></div>
      <div className="card" style={{ maxWidth: 600 }}>
        <div className="card-header"><h3 className="card-title"><Database size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: -3 }} />Backup PostgreSQL</h3></div>
        <div style={{ padding: '16px 0' }}>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: 13 }}>
            Vì dùng PostgreSQL trên Render, backup được thực hiện qua <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4 }}>pg_dump</code> từ dòng lệnh hoặc cấu hình auto backup trên Render dashboard.
          </p>
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 16, marginTop: 16 }}>
            <p style={{ fontWeight: 700, marginBottom: 8, color: 'var(--text-heading)' }}>Hướng dẫn backup thủ công:</p>
            <code style={{ fontSize: 12, color: 'var(--accent)', whiteSpace: 'pre-wrap', display: 'block', lineHeight: 1.8 }}>
              {`# Backup\npg_dump DATABASE_URL > backup_$(date +%Y%m%d).sql\n\n# Restore\npsql DATABASE_URL < backup_20260324.sql`}
            </code>
          </div>
          <div style={{ background: 'var(--info-bg)', borderRadius: 'var(--radius-md)', padding: 12, marginTop: 16, color: 'var(--info)', fontSize: 13 }}>
            💡 <strong>Khuyến nghị:</strong> Bật auto backup trên Render Dashboard → Database → Backups
          </div>
        </div>
      </div>
    </div>
  );
}
