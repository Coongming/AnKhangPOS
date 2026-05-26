import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

  const from = new Date(date + 'T00:00:00+07:00');
  const to = new Date(date + 'T23:59:59+07:00');

  try {
    const sales = await prisma.sale.findMany({
      where: { saleDate: { gte: from, lte: to }, status: 'completed' },
      include: {
        customer: true,
        items: { include: { product: true } },
      },
      orderBy: { saleDate: 'asc' },
    });

    // ===== SHEET 1: Chi tiết từng đơn hàng =====
    const sheet1Data: object[] = [];
    sales.forEach((sale) => {
      sale.items.forEach((item) => {
        sheet1Data.push({
          'Mã đơn': sale.code,
          'Thời gian': new Date(sale.saleDate).toLocaleTimeString('vi-VN'),
          'Khách hàng': sale.customer?.name || 'Khách lẻ',
          'Sản phẩm': item.product.name,
          'Đơn vị': item.product.unit,
          'Số lượng': item.quantity,
          'Đơn giá': item.unitPrice,
          'Giảm giá': item.discount,
          'Thành tiền': item.totalPrice,
          'Giá vốn': item.costPrice * item.quantity,
          'Lợi nhuận': item.totalPrice - item.costPrice * item.quantity,
          'Thanh toán': sale.debtAmount > 0 ? `Nợ ${sale.debtAmount.toLocaleString('vi-VN')}đ` : sale.paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản',
        });
      });
    });

    // ===== SHEET 2: Tổng hợp theo sản phẩm =====
    const productMap = new Map<string, {
      name: string; unit: string; quantity: number;
      revenue: number; cost: number; profit: number;
    }>();

    sales.forEach((sale) => {
      sale.items.forEach((item) => {
        const key = item.product.id;
        const existing = productMap.get(key);
        if (existing) {
          existing.quantity += item.quantity;
          existing.revenue += item.totalPrice;
          existing.cost += item.costPrice * item.quantity;
          existing.profit += item.totalPrice - item.costPrice * item.quantity;
        } else {
          productMap.set(key, {
            name: item.product.name,
            unit: item.product.unit,
            quantity: item.quantity,
            revenue: item.totalPrice,
            cost: item.costPrice * item.quantity,
            profit: item.totalPrice - item.costPrice * item.quantity,
          });
        }
      });
    });

    const sheet2Data = Array.from(productMap.values()).map((p) => ({
      'Sản phẩm': p.name,
      'Đơn vị': p.unit,
      'Tổng SL bán': p.quantity,
      'Doanh thu': p.revenue,
      'Giá vốn': p.cost,
      'Lợi nhuận': p.profit,
    }));

    // Tạo file Excel
    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.json_to_sheet(sheet1Data);
    XLSX.utils.book_append_sheet(wb, ws1, 'Chi tiết đơn hàng');

    const ws2 = XLSX.utils.json_to_sheet(sheet2Data);
    XLSX.utils.book_append_sheet(wb, ws2, 'Tổng hợp sản phẩm');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fileName = `bao-cao-ban-hang-${date}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}