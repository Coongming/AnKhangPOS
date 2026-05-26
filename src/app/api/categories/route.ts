import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const categories = await prisma.productCategory.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
    return NextResponse.json(categories);
  } catch (error) {
    console.error('Categories error:', error);
    return NextResponse.json({ error: 'Lỗi tải nhóm sản phẩm' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, deliveryRate } = await request.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Vui lòng nhập tên nhóm' }, { status: 400 });

    // Check duplicate name
    const existing = await prisma.productCategory.findFirst({
      where: { name: { equals: name.trim(), mode: 'insensitive' } },
    });
    if (existing) {
      return NextResponse.json({ error: `Nhóm "${existing.name}" đã tồn tại` }, { status: 400 });
    }

    const category = await prisma.productCategory.create({ data: { name: name.trim(), deliveryRate: parseFloat(deliveryRate) || 0 } });
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error('Categories POST error:', error);
    return NextResponse.json({ error: 'Lỗi tạo nhóm sản phẩm' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id, name, deliveryRate } = await request.json();
    if (!id) return NextResponse.json({ error: 'Thiếu thông tin' }, { status: 400 });
    const data: Record<string, unknown> = {};
    if (name?.trim()) data.name = name.trim();
    if (deliveryRate !== undefined) data.deliveryRate = parseFloat(deliveryRate) || 0;
    const category = await prisma.productCategory.update({
      where: { id },
      data,
    });
    return NextResponse.json(category);
  } catch (error) {
    console.error('Categories PUT error:', error);
    return NextResponse.json({ error: 'Lỗi cập nhật nhóm sản phẩm' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Thiếu ID' }, { status: 400 });

    // Check if any products use this category
    const productCount = await prisma.product.count({ where: { categoryId: id } });
    if (productCount > 0) {
      return NextResponse.json({ error: `Không thể xóa, có ${productCount} sản phẩm đang dùng nhóm này` }, { status: 400 });
    }

    await prisma.productCategory.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Categories DELETE error:', error);
    return NextResponse.json({ error: 'Lỗi xóa nhóm sản phẩm' }, { status: 500 });
  }
}
