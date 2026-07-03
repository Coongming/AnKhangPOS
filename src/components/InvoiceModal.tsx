'use client';

import { useRef, useState, useEffect } from 'react';
import { X, Download, Image } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface InvoiceItem {
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  totalPrice: number;
}

interface InvoiceData {
  code: string;
  saleDate: string;
  customerName: string | null;
  customerPhone: string | null;
  paymentMethod: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  totalAmount: number;
  paidAmount: number;
  debtAmount: number;
  customerDebt: number; // Công nợ cũ trước đơn này
  notes: string | null;
}

interface StoreSettings {
  store_name: string;
  store_phone: string;
  store_address: string;
  store_tagline: string;
  store_slogan: string;
}

const DEFAULT_SETTINGS: StoreSettings = {
  store_name: 'Gạo Nước An Khang',
  store_phone: '0943.956.171 - 0342.262.003',
  store_address: '424 Lê Duẩn, Phường Ea Kao, Đăk Lăk',
  store_tagline: 'Gạo Sạch & Nước Uống Chính Hãng',
  store_slogan: 'Có An Khang, cơm nhà thêm trọn vị!',
};

interface Props {
  invoice: InvoiceData;
  onClose: () => void;
}

export default function InvoiceModal({ invoice, onClose }: Props) {
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [store, setStore] = useState<StoreSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then((data: { key: string; value: string }[]) => {
        const map: Record<string, string> = {};
        data.forEach(s => { map[s.key] = s.value; });
        setStore({
          store_name: map.store_name || DEFAULT_SETTINGS.store_name,
          store_phone: map.store_phone || DEFAULT_SETTINGS.store_phone,
          store_address: map.store_address || DEFAULT_SETTINGS.store_address,
          store_tagline: map.store_tagline || DEFAULT_SETTINGS.store_tagline,
          store_slogan: map.store_slogan || DEFAULT_SETTINGS.store_slogan,
        });
      })
      .catch(() => { /* use defaults */ });
  }, []);

  const handleDownload = async () => {
    if (!invoiceRef.current) return;
    setDownloading(true);
    try {
      // Đợi font tải xong trước khi chụp
      await document.fonts.ready;
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(invoiceRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `hoa-don-${invoice.code}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      alert('Không thể tải ảnh, thử lại');
    } finally {
      setDownloading(false);
    }
  };

  const now = new Date(invoice.saleDate);
  const dateStr = now.toLocaleDateString('vi-VN');
  const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: 16,
        width: '100%', maxWidth: 480,
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Header modal */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-heading)' }}>
            <Image size={16} style={{ display: 'inline', marginRight: 8, verticalAlign: -2 }} />
            Hóa đơn {invoice.code}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Hóa đơn (sẽ được chụp ảnh) */}
        <div style={{ padding: 20 }}>
          <div ref={invoiceRef} style={{
            background: '#ffffff',
            color: '#1a1a1a',
            padding: 24,
            borderRadius: 8,
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
            fontSize: 14,
          }}>
            {/* Logo & Tên cửa hàng */}
            <div style={{ textAlign: 'center', marginBottom: 16, borderBottom: '2px solid #e53e3e', paddingBottom: 16 }}>
              <img src="/logo.png" alt="Logo" style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'contain', margin: '0 auto 8px', display: 'block' }} />
              <div style={{ fontSize: 24, fontWeight: 800, color: '#e53e3e', lineHeight: 1.2 }}>
                {store.store_name}
              </div>
              <div style={{ fontSize: 14, color: '#666', marginTop: 2, fontWeight: 700 }}>{store.store_tagline}</div>
              <div style={{ fontSize: 13, color: '#999', marginTop: 2, fontWeight: 700 }}>📍 {store.store_address}</div>
              <div style={{ fontSize: 16, color: '#e53e3e', fontWeight: 800, marginTop: 4 }}>📞 {store.store_phone}</div>
            </div>

            {/* Thông tin đơn */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontSize: 13 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>#{invoice.code}</div>
                <div style={{ color: '#666', marginTop: 2 }}>
                  {invoice.paymentMethod === 'cash' ? '💵 Tiền mặt' : '🏦 Chuyển khoản'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 600 }}>{dateStr}</div>
                <div style={{ color: '#666' }}>{timeStr}</div>
              </div>
            </div>

            {/* Khách hàng */}
            {invoice.customerName && (
              <div style={{
                background: '#f5f5f5', borderRadius: 8,
                padding: '10px 14px', marginBottom: 16, fontSize: 13,
              }}>
                <div style={{ fontWeight: 600 }}>👤 {invoice.customerName}</div>
                {invoice.customerPhone && <div style={{ color: '#666', marginTop: 2 }}>📞 {invoice.customerPhone}</div>}
              </div>
            )}

            {/* Danh sách sản phẩm */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                  <th style={{ textAlign: 'left', padding: '6px 0', color: '#666', fontWeight: 600 }}>Sản phẩm</th>
                  <th style={{ textAlign: 'center', padding: '6px 4px', color: '#666', fontWeight: 600 }}>SL</th>
                  <th style={{ textAlign: 'right', padding: '6px 0', color: '#666', fontWeight: 600 }}>Đơn giá</th>
                  <th style={{ textAlign: 'right', padding: '6px 0', color: '#666', fontWeight: 600 }}>T.Tiền</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 0' }}>
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      {item.discount > 0 && <div style={{ fontSize: 11, color: '#e53e3e' }}>Giảm: {formatCurrency(item.discount)}</div>}
                    </td>
                    <td style={{ textAlign: 'center', padding: '8px 4px' }}>{item.quantity} {item.unit}</td>
                    <td style={{ textAlign: 'right', padding: '8px 0' }}>{formatCurrency(item.unitPrice)}</td>
                    <td style={{ textAlign: 'right', padding: '8px 0', fontWeight: 600 }}>{formatCurrency(item.totalPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Tổng tiền */}
            <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: 12, fontSize: 13 }}>
              {invoice.discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: '#666' }}>
                  <span>Tạm tính:</span>
                  <span>{formatCurrency(invoice.subtotal)}</span>
                </div>
              )}
              {invoice.discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: '#e53e3e' }}>
                  <span>Giảm giá:</span>
                  <span>-{formatCurrency(invoice.discount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 17, borderTop: '2px solid #4f46e5', paddingTop: 10, marginTop: 6 }}>
                <span>TỔNG CỘNG:</span>
                <span style={{ color: '#4f46e5' }}>{formatCurrency(invoice.totalAmount)}</span>
              </div>
              {invoice.paidAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, color: '#666' }}>
                  <span>Đã thanh toán:</span>
                  <span style={{ color: '#22c55e', fontWeight: 600 }}>{formatCurrency(invoice.paidAmount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, color: '#e53e3e', fontWeight: 600 }}>
                <span>Nợ đơn này:</span>
                <span>{formatCurrency(invoice.debtAmount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, color: '#999', fontSize: 13 }}>
                <span>Công nợ cũ:</span>
                <span>{formatCurrency(Math.max(0, (invoice.customerDebt || 0) - invoice.debtAmount))}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, color: '#e53e3e', fontWeight: 700, fontSize: 15, borderTop: '1px dashed #fca5a5', paddingTop: 6 }}>
                <span>Dư nợ còn lại:</span>
                <span>{formatCurrency(invoice.customerDebt || 0)}</span>
              </div>
            </div>

            {/* Ghi chú */}
            {invoice.notes && (
              <div style={{ marginTop: 12, padding: '8px 12px', background: '#fff9e6', borderRadius: 6, fontSize: 12, color: '#666' }}>
                📝 {invoice.notes}
              </div>
            )}

            {/* Footer */}
            <div style={{ marginTop: 16, textAlign: 'center', borderTop: '1px dashed #ddd', paddingTop: 12 }}>
              <div style={{ color: '#999', fontSize: 13, fontWeight: 700 }}>Cảm ơn Quý khách!</div>
              {store.store_slogan && (
                <div style={{ color: '#e53e3e', fontSize: 12, fontWeight: 700, marginTop: 4, fontStyle: 'italic' }}>
                  {store.store_slogan}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Nút tải */}
        <div style={{ padding: '0 20px 20px', display: 'flex', gap: 10 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>
            Đóng
          </button>
          <button onClick={handleDownload} disabled={downloading} className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }}>
            <Download size={16} style={{ marginRight: 6 }} />
            {downloading ? 'Đang tải...' : 'Tải ảnh hóa đơn'}
          </button>
        </div>
      </div>
    </div>
  );
}  