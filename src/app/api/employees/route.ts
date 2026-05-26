import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateCode } from '@/lib/utils';

// GET - List employees
export async function GET() {
  try {
    const employees = await prisma.employee.findMany({
      include: {
        _count: { select: { deliverySales: true, shifts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(employees);
  } catch (error) {
    console.error('Employees GET error:', error);
    return NextResponse.json({ error: 'Lỗi tải nhân viên' }, { status: 500 });
  }
}

// POST - Create employee
export async function POST(request: NextRequest) {
  try {
    const { name, phone, salaryType, hourlyRate, deliveryRate, notes } = await request.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Vui lòng nhập tên' }, { status: 400 });

    const last = await prisma.employee.findFirst({ orderBy: { code: 'desc' }, select: { code: true } });
    const code = generateCode('NV', last?.code || null);

    const employee = await prisma.employee.create({
      data: {
        code,
        name: name.trim(),
        phone: phone || null,
        salaryType: salaryType || 'delivery',
        hourlyRate: parseFloat(hourlyRate) || 0,
        deliveryRate: parseFloat(deliveryRate) || 0,
        notes: notes || null,
      },
    });
    return NextResponse.json(employee, { status: 201 });
  } catch (error) {
    console.error('Employees POST error:', error);
    return NextResponse.json({ error: 'Lỗi tạo nhân viên' }, { status: 500 });
  }
}

// PUT - Update employee
export async function PUT(request: NextRequest) {
  try {
    const { id, name, phone, salaryType, hourlyRate, deliveryRate, notes, isActive } = await request.json();
    if (!id) return NextResponse.json({ error: 'Thiếu ID' }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name.trim();
    if (phone !== undefined) data.phone = phone || null;
    if (salaryType !== undefined) data.salaryType = salaryType;
    if (hourlyRate !== undefined) data.hourlyRate = parseFloat(hourlyRate) || 0;
    if (deliveryRate !== undefined) data.deliveryRate = parseFloat(deliveryRate) || 0;
    if (notes !== undefined) data.notes = notes || null;
    if (isActive !== undefined) data.isActive = isActive;

    await prisma.employee.update({ where: { id }, data });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Employees PUT error:', error);
    return NextResponse.json({ error: 'Lỗi cập nhật' }, { status: 500 });
  }
}

// DELETE
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Thiếu ID' }, { status: 400 });

    // Check if employee has deliveries
    const count = await prisma.sale.count({ where: { deliveryEmployeeId: id } });
    if (count > 0) {
      return NextResponse.json({ error: `Nhân viên đã giao ${count} đơn, không thể xóa. Hãy vô hiệu hóa thay vào.` }, { status: 400 });
    }

    await prisma.employeeShift.deleteMany({ where: { employeeId: id } });
    await prisma.salaryPayment.deleteMany({ where: { employeeId: id } });
    await prisma.employee.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Employees DELETE error:', error);
    return NextResponse.json({ error: 'Lỗi xóa nhân viên' }, { status: 500 });
  }
}
