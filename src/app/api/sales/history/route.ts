import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || '';
  if (!q.trim()) return NextResponse.json([]);

  try {
    const sales = await prisma.sale.findMany({
      where: {
        status: 'completed',
        OR: [
          {
            customer: {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q } },
                { code: { contains: q, mode: 'insensitive' } },
              ],
            },
          },
        ],
      },
      include: {
        customer: { select: { name: true, phone: true } },
        items: {
          include: {
            product: { select: { name: true, unit: true, stock: true } },
          },
        },
      },
      orderBy: { saleDate: 'desc' },
      take: 20,
    });
    return NextResponse.json(sales);
  } catch (e) {
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}