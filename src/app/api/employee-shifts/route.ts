import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - List shifts (filter by employeeId, date range)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const where: Record<string, unknown> = {};
    if (employeeId) where.employeeId = employeeId;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where.date as Record<string, unknown>).lte = new Date(dateTo + 'T23:59:59');
    }

    const shifts = await prisma.employeeShift.findMany({
      where,
      include: { employee: { select: { name: true, code: true } } },
      orderBy: { date: 'desc' },
    });
    return NextResponse.json(shifts);
  } catch (error) {
    console.error('Shifts GET error:', error);
    return NextResponse.json({ error: 'Lỗi tải ca làm' }, { status: 500 });
  }
}

// POST - Create shift
export async function POST(request: NextRequest) {
  try {
    const { employeeId, date, startTime, endTime, notes } = await request.json();
    if (!employeeId || !date || !startTime || !endTime) {
      return NextResponse.json({ error: 'Thiếu thông tin' }, { status: 400 });
    }

    // Calculate hours
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const hours = Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);

    if (hours <= 0) return NextResponse.json({ error: 'Giờ kết thúc phải sau giờ bắt đầu' }, { status: 400 });

    const shift = await prisma.employeeShift.create({
      data: {
        employeeId,
        date: new Date(date),
        startTime,
        endTime,
        hours: Math.round(hours * 100) / 100,
        notes: notes || null,
      },
    });
    return NextResponse.json(shift, { status: 201 });
  } catch (error) {
    console.error('Shifts POST error:', error);
    return NextResponse.json({ error: 'Lỗi tạo ca làm' }, { status: 500 });
  }
}

// PUT - Update shift
export async function PUT(request: NextRequest) {
  try {
    const { id, date, startTime, endTime, notes } = await request.json();
    if (!id) return NextResponse.json({ error: 'Thiếu ID' }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (date) data.date = new Date(date);
    if (notes !== undefined) data.notes = notes || null;

    if (startTime && endTime) {
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      const hours = Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
      data.startTime = startTime;
      data.endTime = endTime;
      data.hours = Math.round(hours * 100) / 100;
    }

    await prisma.employeeShift.update({ where: { id }, data });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Shifts PUT error:', error);
    return NextResponse.json({ error: 'Lỗi cập nhật' }, { status: 500 });
  }
}

// DELETE
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Thiếu ID' }, { status: 400 });
    await prisma.employeeShift.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Shifts DELETE error:', error);
    return NextResponse.json({ error: 'Lỗi xóa' }, { status: 500 });
  }
}
