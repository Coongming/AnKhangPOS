import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';

    const where: Record<string, unknown> = {};
    if (categoryId) where.categoryId = categoryId;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom + 'T00:00:00+07:00');
      if (dateTo) {
        const to = new Date(dateTo + 'T00:00:00+07:00');
        to.setDate(to.getDate() + 1);
        (where.date as Record<string, unknown>).lt = to;
      }
    }

    const expenses = await prisma.expense.findMany({
      where,
      include: { category: true },
      orderBy: { date: 'desc' },
    });
    return NextResponse.json(expenses);
  } catch (error) {
    console.error('Expenses GET error:', error);
    return NextResponse.json({ error: 'Lỗi tải chi phí' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { categoryId, amount, date, description, notes } = body;
    if (!categoryId || !amount) return NextResponse.json({ error: 'Vui lòng nhập đầy đủ' }, { status: 400 });

    const expense = await prisma.expense.create({
      data: {
        categoryId,
        amount: parseFloat(amount),
        date: date ? new Date(date) : new Date(),
        description: description || null,
        notes: notes || null,
      },
      include: { category: true },
    });
    return NextResponse.json(expense, { status: 201 });
  } catch (error) {
    console.error('Expenses POST error:', error);
    return NextResponse.json({ error: 'Lỗi tạo chi phí' }, { status: 500 });
  }
}

// PUT - Update expense
export async function PUT(request: NextRequest) {
  try {
    const { id, categoryId, amount, date, description, notes } = await request.json();
    if (!id) return NextResponse.json({ error: 'Thiếu ID' }, { status: 400 });

    const expense = await prisma.expense.update({
      where: { id },
      data: {
        ...(categoryId && { categoryId }),
        ...(amount !== undefined && { amount: parseFloat(amount) }),
        ...(date && { date: new Date(date) }),
        ...(description !== undefined && { description: description || null }),
        ...(notes !== undefined && { notes: notes || null }),
      },
      include: { category: true },
    });
    return NextResponse.json(expense);
  } catch (error) {
    console.error('Expenses PUT error:', error);
    return NextResponse.json({ error: 'Lỗi cập nhật chi phí' }, { status: 500 });
  }
}

// DELETE - Delete expense
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Thiếu ID' }, { status: 400 });

    await prisma.expense.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Expenses DELETE error:', error);
    return NextResponse.json({ error: 'Lỗi xóa chi phí' }, { status: 500 });
  }
}
