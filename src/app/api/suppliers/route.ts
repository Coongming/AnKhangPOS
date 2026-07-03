import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateCode } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }
    const suppliers = await prisma.supplier.findMany({ where, orderBy: { code: 'desc' } });
    return NextResponse.json(suppliers);
  } catch (error) {
    console.error('Suppliers GET error:', error);
    return NextResponse.json({ error: 'Lỗi tải nhà cung cấp' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.name) return NextResponse.json({ error: 'Vui lòng nhập tên nhà cung cấp' }, { status: 400 });

    // Check duplicate name or phone
    const conditions = [{ name: { equals: body.name.trim(), mode: 'insensitive' as const } }];
    if (body.phone?.trim()) conditions.push({ phone: { equals: body.phone.trim(), mode: 'insensitive' as const } } as never);
    const existing = await prisma.supplier.findFirst({ where: { OR: conditions } });
    if (existing) {
      const match = existing.name.toLowerCase() === body.name.trim().toLowerCase() ? 'tên' : 'SĐT';
      return NextResponse.json({ error: `NCC trùng ${match}: "${existing.name}" (mã: ${existing.code})` }, { status: 400 });
    }

    const last = await prisma.supplier.findFirst({ orderBy: { code: 'desc' }, select: { code: true } });
    const code = generateCode('NCC', last?.code || null);
    const supplier = await prisma.supplier.create({
      data: { code, name: body.name, phone: body.phone || null, address: body.address || null, notes: body.notes || null },
    });
    return NextResponse.json(supplier, { status: 201 });
  } catch (error) {
    console.error('Suppliers POST error:', error);
    return NextResponse.json({ error: 'Lỗi tạo nhà cung cấp' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'Thiếu ID' }, { status: 400 });
    const supplier = await prisma.supplier.update({
      where: { id: body.id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });
    return NextResponse.json(supplier);
  } catch (error) {
    console.error('Suppliers PUT error:', error);
    return NextResponse.json({ error: 'Lỗi cập nhật nhà cung cấp' }, { status: 500 });
  }
}
