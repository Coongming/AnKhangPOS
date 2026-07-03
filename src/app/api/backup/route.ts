import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `ankhangpos-backup-${timestamp}.json`;

    // Fetch toàn bộ dữ liệu từ DB thông qua Prisma
    const [
      systemSettings,
      categories,
      products,
      blendTemplates,
      blendTemplateItems,
      blendHistories,
      blendHistoryItems,
      customers,
      suppliers,
      sales,
      saleItems,
      purchases,
      purchaseItems,
      debtTransactions,
      stockMovements,
      expenseCategories,
      expenses,
      employees,
      employeeShifts,
      salaryPayments,
    ] = await Promise.all([
      prisma.systemSetting.findMany(),
      prisma.productCategory.findMany(),
      prisma.product.findMany(),
      prisma.blendTemplate.findMany(),
      prisma.blendTemplateItem.findMany(),
      prisma.blendHistory.findMany(),
      prisma.blendHistoryItem.findMany(),
      prisma.customer.findMany(),
      prisma.supplier.findMany(),
      prisma.sale.findMany(),
      prisma.saleItem.findMany(),
      prisma.purchase.findMany(),
      prisma.purchaseItem.findMany(),
      prisma.debtTransaction.findMany(),
      prisma.stockMovement.findMany(),
      prisma.expenseCategory.findMany(),
      prisma.expense.findMany(),
      prisma.employee.findMany(),
      prisma.employeeShift.findMany(),
      prisma.salaryPayment.findMany(),
    ]);

    const backupData = {
      version: '1.1',
      timestamp: new Date().toISOString(),
      data: {
        systemSettings,
        categories,
        products,
        blendTemplates,
        blendTemplateItems,
        blendHistories,
        blendHistoryItems,
        customers,
        suppliers,
        sales,
        saleItems,
        purchases,
        purchaseItems,
        debtTransactions,
        stockMovements,
        expenseCategories,
        expenses,
        employees,
        employeeShifts,
        salaryPayments,
      }
    };

    return new NextResponse(JSON.stringify(backupData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Backup error:', error);
    return NextResponse.json({ error: 'Lỗi tạo backup' }, { status: 500 });
  }
}
