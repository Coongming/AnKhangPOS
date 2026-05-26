import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/dashboard/chart?from=2026-04-01&to=2026-04-30
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!from || !to) {
      return NextResponse.json({ error: 'Thiếu from/to' }, { status: 400 });
    }

    // Parse dates (UTC+7)
    const fromDate = new Date(from + 'T00:00:00+07:00');
    const toDate = new Date(to + 'T23:59:59.999+07:00');

    // Lấy tất cả sales trong khoảng
    const sales = await prisma.sale.findMany({
      where: {
        saleDate: { gte: fromDate, lte: toDate },
        status: 'completed',
      },
      select: { saleDate: true, totalAmount: true, totalCost: true },
      orderBy: { saleDate: 'asc' },
    });

    // Group by ngày (format YYYY-MM-DD theo UTC+7)
    const dailyMap = new Map<string, { revenue: number; profit: number; orders: number }>();

    // Pre-fill tất cả ngày trong khoảng (bao gồm ngày không có đơn)
    const current = new Date(fromDate);
    while (current <= toDate) {
      const dateKey = current.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
      dailyMap.set(dateKey, { revenue: 0, profit: 0, orders: 0 });
      current.setDate(current.getDate() + 1);
    }

    // Aggregate
    for (const sale of sales) {
      const dateKey = sale.saleDate.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
      const existing = dailyMap.get(dateKey) || { revenue: 0, profit: 0, orders: 0 };
      existing.revenue += sale.totalAmount;
      existing.profit += (sale.totalAmount - sale.totalCost);
      existing.orders += 1;
      dailyMap.set(dateKey, existing);
    }

    // Convert to array
    const chartData = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        label: new Date(date + 'T00:00:00+07:00').toLocaleDateString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          timeZone: 'Asia/Ho_Chi_Minh',
        }),
        ...data,
      }));

    // Tổng kết
    const totalRevenue = chartData.reduce((s, d) => s + d.revenue, 0);
    const totalProfit = chartData.reduce((s, d) => s + d.profit, 0);
    const totalOrders = chartData.reduce((s, d) => s + d.orders, 0);

    return NextResponse.json({
      chartData,
      summary: { totalRevenue, totalProfit, totalOrders },
    });
  } catch (error) {
    console.error('Chart API error:', error);
    return NextResponse.json({ error: 'Lỗi tải dữ liệu biểu đồ' }, { status: 500 });
  }
}
