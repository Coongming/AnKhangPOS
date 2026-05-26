import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - List debt transactions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || ''; // customer | supplier
    const entityId = searchParams.get('entityId') || '';

    const where: Record<string, unknown> = {};
    if (type === 'customer') {
      where.type = { in: ['customer_debt', 'customer_payment'] };
      if (entityId) where.customerId = entityId;
    } else if (type === 'supplier') {
      where.type = { in: ['supplier_debt', 'supplier_payment'] };
      if (entityId) where.supplierId = entityId;
    }

    const transactions = await prisma.debtTransaction.findMany({
      where,
      include: {
        customer: { select: { name: true, code: true } },
        supplier: { select: { name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(transactions);
  } catch (error) {
    console.error('Debt GET error:', error);
    return NextResponse.json({ error: 'Lỗi tải công nợ' }, { status: 500 });
  }
}

// POST - Record debt payment (customer pays or we pay supplier)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, entityId, amount, notes } = body;

    if (!entityId || !amount || parseFloat(amount) <= 0) {
      return NextResponse.json({ error: 'Vui lòng nhập đầy đủ thông tin' }, { status: 400 });
    }

    const payAmount = parseFloat(amount);

    if (type === 'customer_payment') {
      // Customer pays debt
      const customer = await prisma.customer.findUnique({ where: { id: entityId } });
      if (!customer) return NextResponse.json({ error: 'Không tìm thấy khách hàng' }, { status: 404 });
      if (payAmount > customer.debt) return NextResponse.json({ error: 'Số tiền trả vượt quá công nợ' }, { status: 400 });

      await prisma.$transaction(async (tx) => {
        await tx.customer.update({
          where: { id: entityId },
          data: { debt: { decrement: payAmount } },
        });

        await tx.debtTransaction.create({
          data: {
            type: 'customer_payment',
            customerId: entityId,
            amount: -payAmount,
            balanceAfter: customer.debt - payAmount,
            notes: notes || 'Khách trả nợ',
          },
        });
      });
    } else if (type === 'supplier_payment') {
      // Pay supplier
      const supplier = await prisma.supplier.findUnique({ where: { id: entityId } });
      if (!supplier) return NextResponse.json({ error: 'Không tìm thấy nhà cung cấp' }, { status: 404 });
      if (payAmount > supplier.debt) return NextResponse.json({ error: 'Số tiền trả vượt quá công nợ' }, { status: 400 });

      await prisma.$transaction(async (tx) => {
        await tx.supplier.update({
          where: { id: entityId },
          data: { debt: { decrement: payAmount } },
        });

        await tx.debtTransaction.create({
          data: {
            type: 'supplier_payment',
            supplierId: entityId,
            amount: -payAmount,
            balanceAfter: supplier.debt - payAmount,
            notes: notes || 'Trả nợ nhà cung cấp',
          },
        });
      });
    } else {
      return NextResponse.json({ error: 'Loại thanh toán không hợp lệ' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Debt POST error:', error);
    return NextResponse.json({ error: 'Lỗi ghi nhận thanh toán' }, { status: 500 });
  }
}
