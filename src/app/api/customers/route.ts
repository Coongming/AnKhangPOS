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
    const customers = await prisma.customer.findMany({ where, orderBy: { code: 'desc' } });
    return NextResponse.json(customers);
  } catch (error) {
    console.error('Customers GET error:', error);
    return NextResponse.json({ error: 'Lỗi tải khách hàng' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.name) return NextResponse.json({ error: 'Vui lòng nhập tên khách hàng' }, { status: 400 });

    // Check duplicate name or phone
    const conditions = [{ name: { equals: body.name.trim(), mode: 'insensitive' as const } }];
    if (body.phone?.trim()) conditions.push({ phone: { equals: body.phone.trim(), mode: 'insensitive' as const } } as never);
    const existing = await prisma.customer.findFirst({ where: { OR: conditions } });
    if (existing) {
      const match = existing.name.toLowerCase() === body.name.trim().toLowerCase() ? 'tên' : 'SĐT';
      return NextResponse.json({ error: `Khách hàng trùng ${match}: "${existing.name}" (mã: ${existing.code})` }, { status: 400 });
    }

    const last = await prisma.customer.findFirst({ orderBy: { code: 'desc' }, select: { code: true } });
    const code = generateCode('KH', last?.code || null, 3);
    const customer = await prisma.customer.create({
      data: { code, name: body.name, phone: body.phone || null, address: body.address || null, notes: body.notes || null },
    });
    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    console.error('Customers POST error:', error);
    return NextResponse.json({ error: 'Lỗi tạo khách hàng' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'Thiếu ID' }, { status: 400 });
    const customer = await prisma.customer.update({
      where: { id: body.id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });
    return NextResponse.json(customer);
  } catch (error) {
    console.error('Customers PUT error:', error);
    return NextResponse.json({ error: 'Lỗi cập nhật khách hàng' }, { status: 500 });
  }
}
