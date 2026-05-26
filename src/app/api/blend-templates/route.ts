import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - List templates
export async function GET() {
  try {
    const templates = await prisma.blendTemplate.findMany({
      include: {
        outputProduct: { select: { id: true, name: true, code: true, unit: true } },
        linkedProducts: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, code: true, unit: true, stock: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(templates);
  } catch (error) {
    console.error('Blend templates GET error:', error);
    return NextResponse.json({ error: 'Lỗi tải mẫu trộn' }, { status: 500 });
  }
}

// POST - Create template
export async function POST(request: NextRequest) {
  try {
    const { name, outputProductId, items, notes } = await request.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Vui lòng nhập tên mẫu' }, { status: 400 });
    if (!items || items.length < 2) return NextResponse.json({ error: 'Cần ít nhất 2 nguyên liệu' }, { status: 400 });

    const template = await prisma.blendTemplate.create({
      data: {
        name: name.trim(),
        outputProductId: outputProductId || null,
        notes: notes || null,
        items: {
          create: items.map((item: { productId: string; quantity: number }) => ({
            productId: item.productId,
            quantity: parseFloat(String(item.quantity)),
          })),
        },
      },
    });
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error('Blend templates POST error:', error);
    return NextResponse.json({ error: 'Lỗi tạo mẫu trộn' }, { status: 500 });
  }
}

// DELETE - Delete template
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Thiếu ID' }, { status: 400 });

    await prisma.blendTemplateItem.deleteMany({ where: { templateId: id } });
    await prisma.blendTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Blend templates DELETE error:', error);
    return NextResponse.json({ error: 'Lỗi xóa mẫu trộn' }, { status: 500 });
  }
}
