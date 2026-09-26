import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getEndOfDayVN } from '@/lib/utils';
import { getCustomerRecency } from '@/lib/customer-recency';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const asOf = new Date();
    const latestPurchaseQuery = prisma.sale.groupBy({
      by: ['customerId'],
      where: {
        customerId: { not: null },
        status: 'completed',
        saleDate: { lt: getEndOfDayVN(asOf) },
      },
      _max: { saleDate: true },
    });
    const [customers, latestPurchases] = await prisma.$transaction([
      prisma.customer.findMany({ orderBy: { code: 'desc' } }),
      latestPurchaseQuery,
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

    const datesByCustomer = new Map(latestPurchases.map(sale => [sale.customerId, sale._max.saleDate]));
    return NextResponse.json({
      asOf: asOf.toISOString(),
      customers: customers.map(customer => {
        const lastPurchaseDate = datesByCustomer.get(customer.id) ?? null;
        return { ...customer, lastPurchaseDate, ...getCustomerRecency(lastPurchaseDate, asOf) };
      }),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Customer recency GET error:', error);
    return NextResponse.json({ error: 'Lỗi tải thống kê khách hàng' }, { status: 500 });
  }
}
