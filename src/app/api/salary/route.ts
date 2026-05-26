import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - Calculate salary preview OR list payments
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const employeeId = searchParams.get('employeeId');

    // List salary payments
    if (action === 'payments') {
      const where: Record<string, unknown> = {};
      if (employeeId) where.employeeId = employeeId;

      const payments = await prisma.salaryPayment.findMany({
        where,
        include: { employee: { select: { name: true, code: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return NextResponse.json(payments);
    }

    // Calculate salary preview
    if (action === 'calculate' && employeeId) {
      const dateFrom = searchParams.get('dateFrom');
      const dateTo = searchParams.get('dateTo');

      if (!dateFrom || !dateTo) {
        return NextResponse.json({ error: 'Thiếu khoảng thời gian' }, { status: 400 });
      }

      const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
      if (!employee) return NextResponse.json({ error: 'Không tìm thấy NV' }, { status: 404 });

      const startDate = new Date(dateFrom + 'T00:00:00+07:00');
      const endDate = new Date(dateTo + 'T23:59:59+07:00');

      // 1. Hourly pay
      let hourlyPay = 0;
      let totalHours = 0;
      if (employee.salaryType === 'hourly' || employee.salaryType === 'both') {
        const shifts = await prisma.employeeShift.findMany({
          where: {
            employeeId,
            date: { gte: startDate, lte: endDate },
          },
        });
        totalHours = shifts.reduce((sum, s) => sum + s.hours, 0);
        hourlyPay = totalHours * employee.hourlyRate;
      }

      // 2. Delivery pay - count bottles delivered × employee rate
      let deliveryPay = 0;
      let totalBottles = 0;

      if (employee.salaryType === 'delivery' || employee.salaryType === 'both') {
        const sales = await prisma.sale.findMany({
          where: {
            deliveryEmployeeId: employeeId,
            status: 'completed',
            saleDate: { gte: startDate, lte: endDate },
          },
          include: {
            items: {
              include: {
                product: { select: { unit: true } },
              },
            },
          },
        });

        // Only count items with unit "bình"
        for (const sale of sales) {
          for (const item of sale.items) {
            if (item.product.unit.toLowerCase() === 'bình') {
              totalBottles += item.quantity;
            }
          }
        }

        deliveryPay = totalBottles * employee.deliveryRate;
      }

      // 3. Already paid advances in this period
      const advances = await prisma.salaryPayment.findMany({
        where: {
          employeeId,
          type: 'advance',
          periodStart: { gte: startDate },
          periodEnd: { lte: endDate },
        },
      });
      const totalAdvanced = advances.reduce((sum, a) => sum + a.totalPay, 0);

      return NextResponse.json({
        employee,
        period: { from: dateFrom, to: dateTo },
        totalHours,
        hourlyPay,
        deliveryPay,
        totalBottles,
        totalAdvanced,
        totalPay: hourlyPay + deliveryPay,
        remaining: hourlyPay + deliveryPay - totalAdvanced,
      });
    }

    // Get delivery history for an employee
    if (action === 'delivery-history' && employeeId) {
      const dateFrom = searchParams.get('dateFrom');
      const dateTo = searchParams.get('dateTo');

      const where: Record<string, unknown> = {
        deliveryEmployeeId: employeeId,
        status: 'completed',
      };
      if (dateFrom || dateTo) {
        where.saleDate = {};
        if (dateFrom) (where.saleDate as Record<string, unknown>).gte = new Date(dateFrom + 'T00:00:00+07:00');
        if (dateTo) (where.saleDate as Record<string, unknown>).lte = new Date(dateTo + 'T23:59:59+07:00');
      }

      const sales = await prisma.sale.findMany({
        where,
        include: {
          customer: { select: { name: true } },
          items: { include: { product: { select: { name: true, unit: true } } } },
        },
        orderBy: { saleDate: 'desc' },
      });
      return NextResponse.json(sales);
    }

    return NextResponse.json({ error: 'Action không hợp lệ' }, { status: 400 });
  } catch (error) {
    console.error('Salary GET error:', error);
    return NextResponse.json({ error: 'Lỗi tính lương' }, { status: 500 });
  }
}

// POST - Create salary payment (xuất lương) → auto-create expense
export async function POST(request: NextRequest) {
  try {
    const { employeeId, periodType, periodStart, periodEnd, hourlyPay, deliveryPay, totalPay, type, notes } = await request.json();

    if (!employeeId || !periodStart || !periodEnd || !totalPay) {
      return NextResponse.json({ error: 'Thiếu thông tin' }, { status: 400 });
    }

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return NextResponse.json({ error: 'NV không tồn tại' }, { status: 404 });

    const paymentType = type || 'salary';
    const payAmount = parseFloat(totalPay);

    // Find or create "Lương nhân viên" expense category
    let expenseCategory = await prisma.expenseCategory.findFirst({
      where: { name: 'Lương nhân viên' },
    });
    if (!expenseCategory) {
      expenseCategory = await prisma.expenseCategory.create({
        data: { name: 'Lương nhân viên' },
      });
    }

    // Create expense + salary payment in transaction
    const result = await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          categoryId: expenseCategory!.id,
          amount: payAmount,
          date: new Date(),
          description: paymentType === 'advance'
            ? `Ứng lương - ${employee.name} (${employee.code})`
            : `Xuất lương - ${employee.name} (${employee.code}) | ${periodStart} → ${periodEnd}`,
          notes: notes || null,
        },
      });

      const payment = await tx.salaryPayment.create({
        data: {
          employeeId,
          periodType: periodType || 'monthly',
          periodStart: new Date(periodStart),
          periodEnd: new Date(periodEnd),
          hourlyPay: parseFloat(hourlyPay) || 0,
          deliveryPay: parseFloat(deliveryPay) || 0,
          totalPay: payAmount,
          type: paymentType,
          expenseId: expense.id,
          notes: notes || null,
        },
      });

      return payment;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Salary POST error:', error);
    return NextResponse.json({ error: 'Lỗi xuất lương' }, { status: 500 });
  }
}

// DELETE - Delete salary payment + linked expense
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Thiếu ID' }, { status: 400 });

    const payment = await prisma.salaryPayment.findUnique({ where: { id } });
    if (!payment) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      if (payment.expenseId) {
        await tx.expense.delete({ where: { id: payment.expenseId } }).catch(() => {});
      }
      await tx.salaryPayment.delete({ where: { id } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Salary DELETE error:', error);
    return NextResponse.json({ error: 'Lỗi xóa' }, { status: 500 });
  }
}
