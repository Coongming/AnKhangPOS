'use client';

import { History } from 'lucide-react';

export default function LogsPage() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}><h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-heading)' }}>Nhật ký hệ thống</h2></div>
      <div className="card">
        <div className="empty-state">
          <History />
          <h3>Tính năng sẽ được bổ sung</h3>
          <p>Nhật ký chi tiết sẽ có trong phiên bản tiếp theo</p>
        </div>
      </div>
    </div>
  );
}
