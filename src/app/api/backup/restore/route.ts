import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const BACKUP_COLLECTIONS = [
  'systemSettings',
  'categories',
  'products',
  'blendTemplates',
  'blendTemplateItems',
  'blendHistories',
  'blendHistoryItems',
  'customers',
  'suppliers',
  'sales',
  'saleItems',
  'purchases',
  'purchaseItems',
  'debtTransactions',
  'stockMovements',
  'expenseCategories',
  'expenses',
  'employees',
  'employeeShifts',
  'salaryPayments',
] as const;

type BackupData = {
  systemSettings: Prisma.SystemSettingCreateManyInput[];
  categories: Prisma.ProductCategoryCreateManyInput[];
  products: Prisma.ProductCreateManyInput[];
  blendTemplates: Prisma.BlendTemplateCreateManyInput[];
  blendTemplateItems: Prisma.BlendTemplateItemCreateManyInput[];
  blendHistories: Prisma.BlendHistoryCreateManyInput[];
  blendHistoryItems: Prisma.BlendHistoryItemCreateManyInput[];
  customers: Prisma.CustomerCreateManyInput[];
  suppliers: Prisma.SupplierCreateManyInput[];
  sales: Prisma.SaleCreateManyInput[];
  saleItems: Prisma.SaleItemCreateManyInput[];
  purchases: Prisma.PurchaseCreateManyInput[];
  purchaseItems: Prisma.PurchaseItemCreateManyInput[];
  debtTransactions: Prisma.DebtTransactionCreateManyInput[];
  stockMovements: Prisma.StockMovementCreateManyInput[];
  expenseCategories: Prisma.ExpenseCategoryCreateManyInput[];
  expenses: Prisma.ExpenseCreateManyInput[];
  employees: Prisma.EmployeeCreateManyInput[];
  employeeShifts: Prisma.EmployeeShiftCreateManyInput[];
  salaryPayments: Prisma.SalaryPaymentCreateManyInput[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseBackupData(body: unknown): BackupData | null {
  if (!isObject(body) || !isObject(body.data)) return null;

  const data = body.data;
  if (!Array.isArray(data.systemSettings)) return null;

  for (const collection of BACKUP_COLLECTIONS) {
    if (data[collection] !== undefined && !Array.isArray(data[collection])) {
      return null;
    }
  }

  return {
    systemSettings: data.systemSettings as Prisma.SystemSettingCreateManyInput[],
    categories: (data.categories ?? []) as Prisma.ProductCategoryCreateManyInput[],
    products: (data.products ?? []) as Prisma.ProductCreateManyInput[],
    blendTemplates: (data.blendTemplates ?? []) as Prisma.BlendTemplateCreateManyInput[],
    blendTemplateItems: (data.blendTemplateItems ?? []) as Prisma.BlendTemplateItemCreateManyInput[],
    blendHistories: (data.blendHistories ?? []) as Prisma.BlendHistoryCreateManyInput[],
    blendHistoryItems: (data.blendHistoryItems ?? []) as Prisma.BlendHistoryItemCreateManyInput[],
    customers: (data.customers ?? []) as Prisma.CustomerCreateManyInput[],
    suppliers: (data.suppliers ?? []) as Prisma.SupplierCreateManyInput[],
    sales: (data.sales ?? []) as Prisma.SaleCreateManyInput[],
    saleItems: (data.saleItems ?? []) as Prisma.SaleItemCreateManyInput[],
    purchases: (data.purchases ?? []) as Prisma.PurchaseCreateManyInput[],
    purchaseItems: (data.purchaseItems ?? []) as Prisma.PurchaseItemCreateManyInput[],
    debtTransactions: (data.debtTransactions ?? []) as Prisma.DebtTransactionCreateManyInput[],
    stockMovements: (data.stockMovements ?? []) as Prisma.StockMovementCreateManyInput[],
    expenseCategories: (data.expenseCategories ?? []) as Prisma.ExpenseCategoryCreateManyInput[],
    expenses: (data.expenses ?? []) as Prisma.ExpenseCreateManyInput[],
    employees: (data.employees ?? []) as Prisma.EmployeeCreateManyInput[],
    employeeShifts: (data.employeeShifts ?? []) as Prisma.EmployeeShiftCreateManyInput[],
    salaryPayments: (data.salaryPayments ?? []) as Prisma.SalaryPaymentCreateManyInput[],
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = parseBackupData(body);

    if (!data) {
      return NextResponse.json({ error: 'File backup không đúng định dạng' }, { status: 400 });
    }

    // Execute in a transaction to ensure all or nothing
    await prisma.$transaction(async (tx) => {
      // 1. DELETE ALL EXISTING DATA in correct order (child -> parent)
      await tx.salaryPayment.deleteMany();
      await tx.employeeShift.deleteMany();
      await tx.expense.deleteMany();
      await tx.stockMovement.deleteMany();
      await tx.debtTransaction.deleteMany();

      await tx.purchaseItem.deleteMany();
      await tx.saleItem.deleteMany();
      await tx.blendHistoryItem.deleteMany();
      await tx.blendTemplateItem.deleteMany();

      await tx.purchase.deleteMany();
      await tx.sale.deleteMany();
      await tx.blendHistory.deleteMany();

      await tx.product.deleteMany();
      await tx.blendTemplate.deleteMany();

      await tx.productCategory.deleteMany();
      await tx.customer.deleteMany();
      await tx.supplier.deleteMany();
      await tx.expenseCategory.deleteMany();
      await tx.employee.deleteMany();
      await tx.systemSetting.deleteMany();
      await tx.backupLog.deleteMany();

      // 2. INSERT RESTORED DATA in correct order (parent -> child)
      if (data.systemSettings?.length) await tx.systemSetting.createMany({ data: data.systemSettings });
      if (data.categories?.length) await tx.productCategory.createMany({ data: data.categories });
      if (data.customers?.length) await tx.customer.createMany({ data: data.customers });
      if (data.suppliers?.length) await tx.supplier.createMany({ data: data.suppliers });
      if (data.expenseCategories?.length) await tx.expenseCategory.createMany({ data: data.expenseCategories });
      if (data.employees?.length) await tx.employee.createMany({ data: data.employees });

      if (data.blendTemplates.length) {
        const templatesWithoutOutput = data.blendTemplates.map((template) => ({
          ...template,
          outputProductId: null,
        }));
        await tx.blendTemplate.createMany({ data: templatesWithoutOutput });
      }
      if (data.products?.length) await tx.product.createMany({ data: data.products });

      for (const template of data.blendTemplates) {
        if (template.id && template.outputProductId) {
          await tx.blendTemplate.update({
            where: { id: template.id },
            data: { outputProductId: template.outputProductId },
          });
        }
      }

      if (data.blendHistories?.length) await tx.blendHistory.createMany({ data: data.blendHistories });
      if (data.sales?.length) await tx.sale.createMany({ data: data.sales });
      if (data.purchases?.length) await tx.purchase.createMany({ data: data.purchases });

      if (data.blendTemplateItems?.length) await tx.blendTemplateItem.createMany({ data: data.blendTemplateItems });
      if (data.blendHistoryItems?.length) await tx.blendHistoryItem.createMany({ data: data.blendHistoryItems });
      if (data.saleItems?.length) await tx.saleItem.createMany({ data: data.saleItems });
      if (data.purchaseItems?.length) await tx.purchaseItem.createMany({ data: data.purchaseItems });

      if (data.debtTransactions?.length) await tx.debtTransaction.createMany({ data: data.debtTransactions });
      if (data.stockMovements?.length) await tx.stockMovement.createMany({ data: data.stockMovements });
      if (data.expenses?.length) await tx.expense.createMany({ data: data.expenses });
      if (data.employeeShifts?.length) await tx.employeeShift.createMany({ data: data.employeeShifts });
      if (data.salaryPayments?.length) await tx.salaryPayment.createMany({ data: data.salaryPayments });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Restore error:', error);
    const message = error instanceof Error ? error.message : 'Lỗi khi khôi phục dữ liệu';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
