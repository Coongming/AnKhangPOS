// Utility functions

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('vi-VN').format(num);
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

// Generate auto-increment code: SP001, NCC001, KH001, PN001, HD001
export function generateCode(prefix: string, lastCode: string | null, padding = 4): string {
  if (!lastCode) return `${prefix}${String(1).padStart(padding, '0')}`;
  const num = parseInt(lastCode.replace(prefix, ''), 10);
  return `${prefix}${String(num + 1).padStart(padding, '0')}`;
}



// Vietnam timezone helpers (UTC+7) - dùng cho server-side
const VN_OFFSET = 7 * 60 * 60 * 1000; // 7 hours in ms

export function getStartOfDayVN(date?: Date): Date {
  const d = date ? new Date(date) : new Date();
  // Get VN local time
  const vnTime = new Date(d.getTime() + VN_OFFSET);
  // Reset to midnight VN
  vnTime.setUTCHours(0, 0, 0, 0);
  // Convert back to UTC
  return new Date(vnTime.getTime() - VN_OFFSET);
}

export function getEndOfDayVN(date?: Date): Date {
  const start = getStartOfDayVN(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export function getStartOfWeekVN(): Date {
  const now = new Date();
  const start = getStartOfDayVN(now);
  return new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
}

export function getStartOfMonthVN(): Date {
  const now = new Date();
  const vnTime = new Date(now.getTime() + VN_OFFSET);
  vnTime.setUTCDate(1);
  vnTime.setUTCHours(0, 0, 0, 0);
  return new Date(vnTime.getTime() - VN_OFFSET);
}

export function getStartOfYearVN(): Date {
  const now = new Date();
  const vnTime = new Date(now.getTime() + VN_OFFSET);
  vnTime.setUTCMonth(0, 1);
  vnTime.setUTCHours(0, 0, 0, 0);
  return new Date(vnTime.getTime() - VN_OFFSET);
}

// Format order text for clipboard (gửi shipper)
export function formatOrderForCopy(sale: {
  customer?: { name: string } | null;
  customerName?: string;
  phone?: string | null;
  items: Array<{ quantity: number; unitPrice: number; totalPrice: number; product: { name: string; unit: string } }>;
  totalAmount: number;
  notes?: string | null;
}): string {
  const lines: string[] = [];
  const fmtPrice = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n)) + 'đ';

  // Customer name
  const name = sale.customer?.name || sale.customerName || 'Khách lẻ';
  lines.push(name);

  // Phone
  if (sale.phone) lines.push(sale.phone);

  // Items
  for (const item of sale.items) {
    const qty = item.quantity % 1 === 0 ? item.quantity.toString() : item.quantity.toFixed(1);
    lines.push(`${qty} ${item.product.unit} ${item.product.name} ${fmtPrice(item.totalPrice)}`);
  }

  // Total
  lines.push(`Tổng ${fmtPrice(sale.totalAmount)}`);

  // Notes
  if (sale.notes) lines.push(`(${sale.notes})`);

  return lines.join('\n');
}
