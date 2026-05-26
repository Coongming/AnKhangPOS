import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const categories = await prisma.expenseCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { expenses: true } } },
    });
    return NextResponse.json(categories);
  } catch (error) {
    console.error('Expense categories error:', error);
    return NextResponse.json({ error: 'Lỗi' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Vui lòng nhập tên danh mục' }, { status: 400 });
    const category = await prisma.expenseCategory.create({ data: { name: name.trim() } });
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error('Expense categories POST error:', error);
    return NextResponse.json({ error: 'Lỗi tạo danh mục' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id, name } = await request.json();
    if (!id || !name?.trim()) return NextResponse.json({ error: 'Thiếu thông tin' }, { status: 400 });
    const category = await prisma.expenseCategory.update({
      where: { id },
      data: { name: name.trim() },
    });
    return NextResponse.json(category);
  } catch (error) {
    console.error('Expense categories PUT error:', error);
    return NextResponse.json({ error: 'Lỗi cập nhật danh mục' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Thiếu ID' }, { status: 400 });

    // Check if any expenses use this category
    const expenseCount = await prisma.expense.count({ where: { categoryId: id } });
    if (expenseCount > 0) {
      return NextResponse.json({ error: `Không thể xóa, có ${expenseCount} chi phí đang dùng danh mục này` }, { status: 400 });
    }

    await prisma.expenseCategory.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Expense categories DELETE error:', error);
    return NextResponse.json({ error: 'Lỗi xóa danh mục' }, { status: 500 });
  }
}
