import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStartOfDayVN, getEndOfDayVN } from '@/lib/utils';
import { applyBlendVirtualStock } from '@/lib/blend-stock';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const today = getStartOfDayVN();
    const tomorrow = getEndOfDayVN();

    // Today's sales
    const todaySales = await prisma.sale.findMany({
      where: {
        saleDate: { gte: today, lt: tomorrow },
        status: 'completed',
      },
    });

    const todayRevenue = todaySales.reduce((sum, s) => sum + Number(s.totalAmount), 0);
    const todayOrders = todaySales.length;
    const todayCashRevenue = todaySales.filter(s => s.paymentMethod === 'cash').reduce((sum, s) => sum + Number(s.totalAmount), 0);
    const todayTransferRevenue = todaySales.filter(s => s.paymentMethod === 'transfer').reduce((sum, s) => sum + Number(s.totalAmount), 0);

    // Debt totals
    const customerDebtAgg = await prisma.customer.aggregate({
      _sum: { debt: true },
      where: { debt: { gt: 0 } },
    });

    const supplierDebtAgg = await prisma.supplier.aggregate({
      _sum: { debt: true },
      where: { debt: { gt: 0 } },
    });

    // Counts
    const totalProducts = await prisma.product.count({ where: { isActive: true } });
    const totalCustomers = await prisma.customer.count({ where: { isActive: true } });
    const totalSuppliers = await prisma.supplier.count({ where: { isActive: true } });

    // Low stock products — dùng Prisma findMany thay vì $queryRaw (tương thích PgBouncer)
    const allProducts = await prisma.product.findMany({
      where: { isActive: true, minStock: { gt: 0 } },
      select: { id: true, name: true, stock: true, minStock: true, unit: true, linkedStockId: true, blendTemplateId: true },
      orderBy: { stock: 'asc' },
    });

    // Replace stock with linked product's stock
    const linkedIds = allProducts
      .filter((p) => p.linkedStockId)
      .map((p) => p.linkedStockId as string);

    if (linkedIds.length > 0) {
      const linkedProducts = await prisma.product.findMany({
        where: { id: { in: linkedIds } },
        select: { id: true, stock: true },
      });
      const linkedStockMap = new Map(linkedProducts.map((p) => [p.id, p.stock]));

      for (const product of allProducts) {
        if (product.linkedStockId && linkedStockMap.has(product.linkedStockId)) {
          product.stock = linkedStockMap.get(product.linkedStockId)!;
        }
      }
    }

    // Calculate virtual stock for blend products
    await applyBlendVirtualStock(allProducts);

    const lowStockProducts = allProducts.filter(p => Number(p.stock) <= Number(p.minStock)).slice(0, 10);

    // Recent sales
    const recentSales = await prisma.sale.findMany({
      where: { status: 'completed' },
      orderBy: { saleDate: 'desc' },
      take: 5,
      include: { customer: { select: { name: true } } },
    });

    return NextResponse.json({
      todayRevenue,
      todayOrders,
      todayCashRevenue,
      todayTransferRevenue,
      totalCustomerDebt: customerDebtAgg._sum.debt || 0,
      totalSupplierDebt: supplierDebtAgg._sum.debt || 0,
      lowStockCount: lowStockProducts.length,
      totalProducts,
      totalCustomers,
      totalSuppliers,
      recentSales: recentSales.map((s) => ({
        id: s.id,
        code: s.code,
        totalAmount: s.totalAmount,
        saleDate: s.saleDate.toISOString(),
        customerName: s.customer?.name || null,
      })),
      lowStockProducts,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: 'Lỗi tải dữ liệu' }, { status: 500 });
  }
}
