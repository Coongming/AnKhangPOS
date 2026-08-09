import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { CODE_PADDING, CodePrefix, normalizeCode } from '@/lib/code-sequence';
import {
  reallocateCustomerPayments,
  recalcSupplierDebt,
} from '@/lib/debt-utils';
import { syncPurchasePayment } from '@/lib/supplier-payments';
import {
  applyStockMovement,
  createStockOperationId,
  recalculateStockLedgerForProducts,
  roundStock,
} from '@/lib/stock-ledger';

const BACKUP_COLLECTIONS = [
  'systemSettings',
  'codeSequences',
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
  codeSequences: Prisma.CodeSequenceCreateManyInput[];
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

function normalizeDebtTransactions(
  value: unknown
): Prisma.DebtTransactionCreateManyInput[] {
  if (!Array.isArray(value)) return [];

  return value.map((record) => {
    if (!isObject(record)) {
      throw new Error('Dữ liệu giao dịch công nợ trong backup không hợp lệ');
    }

    const transaction = { ...record };
    delete transaction.saleId;
    delete transaction.purchaseId;
    return transaction as Prisma.DebtTransactionCreateManyInput;
  });
}

function normalizePurchases(value: unknown): Prisma.PurchaseCreateManyInput[] {
  if (!Array.isArray(value)) return [];

  return value.map((record) => {
    if (!isObject(record)) {
      throw new Error('Dữ liệu phiếu nhập trong backup không hợp lệ');
    }
    if (record.type === 'return') {
      throw new Error('Backup còn chứa phiếu trả hàng nên không thể khôi phục');
    }

    const purchase = { ...record };
    delete purchase.type;
    return purchase as Prisma.PurchaseCreateManyInput;
  });
}

function normalizeSales(value: unknown): Prisma.SaleCreateManyInput[] {
  if (!Array.isArray(value)) return [];

  return value.map((record) => {
    if (!isObject(record)) {
      throw new Error('Dữ liệu hóa đơn trong backup không hợp lệ');
    }
    return {
      ...record,
      stockVersion: Number(record.stockVersion ?? (record.status === 'completed' ? 1 : 0)),
    } as Prisma.SaleCreateManyInput;
  });
}

function normalizeStockMovements(
  value: unknown
): Prisma.StockMovementCreateManyInput[] {
  if (!Array.isArray(value)) return [];

  const records = value.map((record) => {
    if (!isObject(record)) {
      throw new Error('Dữ liệu biến động kho trong backup không hợp lệ');
    }
    return { ...record };
  });

  records.sort((left, right) => {
    const leftSequence = Number(left.ledgerSequence ?? Number.MAX_SAFE_INTEGER);
    const rightSequence = Number(right.ledgerSequence ?? Number.MAX_SAFE_INTEGER);
    if (leftSequence !== rightSequence) return leftSequence - rightSequence;

    const leftCreatedAt = new Date(String(left.createdAt ?? 0)).getTime();
    const rightCreatedAt = new Date(String(right.createdAt ?? 0)).getTime();
    if (leftCreatedAt !== rightCreatedAt) return leftCreatedAt - rightCreatedAt;

    return String(left.id ?? '').localeCompare(String(right.id ?? ''));
  });

  return records.map((record) => {
    delete record.ledgerSequence;
    return {
      ...record,
      stockBefore: record.stockBefore ?? 0,
    } as Prisma.StockMovementCreateManyInput;
  });
}

function normalizeCodedRecords<T extends { code: string }>(
  records: T[],
  prefix: CodePrefix
): T[] {
  const seen = new Set<string>();
  return records.map((record) => {
    const code = normalizeCode(String(record.code), prefix);
    if (seen.has(code)) {
      throw new Error(`Backup có mã ${prefix} trùng nhau sau khi chuẩn hóa: ${code}`);
    }
    seen.add(code);
    return { ...record, code };
  });
}

function buildCodeSequences(
  rawSequences: unknown,
  codeCollections: Record<CodePrefix, Array<{ code: string }>>
): Prisma.CodeSequenceCreateManyInput[] {
  const savedValues = new Map<CodePrefix, number>();
  if (Array.isArray(rawSequences)) {
    for (const value of rawSequences) {
      if (!isObject(value) || typeof value.prefix !== 'string') continue;
      const prefix = value.prefix as CodePrefix;
      if (!(prefix in CODE_PADDING)) continue;
      const currentValue = Number(value.currentValue ?? value.current_value ?? 0);
      if (Number.isSafeInteger(currentValue) && currentValue >= 0) {
        savedValues.set(prefix, Math.max(savedValues.get(prefix) || 0, currentValue));
      }
    }
  }

  return (Object.keys(CODE_PADDING) as CodePrefix[]).map((prefix) => {
    const maxCodeValue = codeCollections[prefix].reduce((max, record) => {
      const value = Number(record.code.slice(prefix.length));
      return Math.max(max, value);
    }, 0);
    return {
      prefix,
      currentValue: Math.max(savedValues.get(prefix) || 0, maxCodeValue),
      updatedAt: new Date(),
    };
  });
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

  const products = normalizeCodedRecords(
    (data.products ?? []) as Prisma.ProductCreateManyInput[],
    'SP'
  );
  const blendHistories = normalizeCodedRecords(
    (data.blendHistories ?? []) as Prisma.BlendHistoryCreateManyInput[],
    'TR'
  );
  const customers = normalizeCodedRecords(
    (data.customers ?? []) as Prisma.CustomerCreateManyInput[],
    'KH'
  );
  const suppliers = normalizeCodedRecords(
    (data.suppliers ?? []) as Prisma.SupplierCreateManyInput[],
    'NCC'
  );
  const sales = normalizeCodedRecords(normalizeSales(data.sales), 'HD');
  const purchases = normalizeCodedRecords(normalizePurchases(data.purchases), 'PN');
  const employees = normalizeCodedRecords(
    (data.employees ?? []) as Prisma.EmployeeCreateManyInput[],
    'NV'
  );
  const debtTransactions = normalizeDebtTransactions(data.debtTransactions);
  const purchaseIds = new Set(purchases.map((purchase) => String(purchase.id)));
  const safeDebtTransactions = debtTransactions.map((transaction) => ({
    ...transaction,
    ...(
      transaction.sourcePurchaseId && !purchaseIds.has(transaction.sourcePurchaseId)
        ? { sourcePurchaseId: null }
        : {}
    ),
  }));
  const codeSequences = buildCodeSequences(data.codeSequences, {
    HD: sales,
    KH: customers,
    PN: purchases,
    NV: employees,
    SP: products,
    NCC: suppliers,
    TR: blendHistories,
  });

  return {
    systemSettings: data.systemSettings as Prisma.SystemSettingCreateManyInput[],
    codeSequences,
    categories: (data.categories ?? []) as Prisma.ProductCategoryCreateManyInput[],
    products,
    blendTemplates: (data.blendTemplates ?? []) as Prisma.BlendTemplateCreateManyInput[],
    blendTemplateItems: (data.blendTemplateItems ?? []) as Prisma.BlendTemplateItemCreateManyInput[],
    blendHistories,
    blendHistoryItems: (data.blendHistoryItems ?? []) as Prisma.BlendHistoryItemCreateManyInput[],
    customers,
    suppliers,
    sales,
    saleItems: (data.saleItems ?? []) as Prisma.SaleItemCreateManyInput[],
    purchases,
    purchaseItems: (data.purchaseItems ?? []) as Prisma.PurchaseItemCreateManyInput[],
    debtTransactions: safeDebtTransactions,
    stockMovements: normalizeStockMovements(data.stockMovements),
    expenseCategories: (data.expenseCategories ?? []) as Prisma.ExpenseCategoryCreateManyInput[],
    expenses: (data.expenses ?? []) as Prisma.ExpenseCreateManyInput[],
    employees,
    employeeShifts: (data.employeeShifts ?? []) as Prisma.EmployeeShiftCreateManyInput[],
    salaryPayments: (data.salaryPayments ?? []) as Prisma.SalaryPaymentCreateManyInput[],
  };
}

export async function POST(request: NextRequest) {
  try {
    // Giới hạn payload 50MB
    const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
    if (contentLength > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File backup quá lớn (tối đa 50MB)' }, { status: 413 });
    }

    const body = await request.json();

    // Kiểm tra version nếu có
    if (body && typeof body === 'object' && body.version && typeof body.version === 'string') {
      const supportedVersions = ['1.0', '1.1', '1.2', '1.3', '2.0'];
      if (!supportedVersions.includes(body.version)) {
        return NextResponse.json({ error: `Phiên bản backup không hỗ trợ: ${body.version}` }, { status: 400 });
      }
    }

    const data = parseBackupData(body);

    if (!data) {
      return NextResponse.json({ error: 'File backup không đúng định dạng' }, { status: 400 });
    }

    // Validate: giới hạn số lượng record mỗi bảng
    const MAX_RECORDS = 100_000;
    for (const collection of BACKUP_COLLECTIONS) {
      const arr = data[collection];
      if (arr && arr.length > MAX_RECORDS) {
        return NextResponse.json(
          { error: `Bảng ${collection} vượt quá ${MAX_RECORDS} records (có ${arr.length})` },
          { status: 400 }
        );
      }
    }

    // Execute in a transaction to ensure all or nothing
    await prisma.$transaction(async (tx) => {
      // 1. DELETE ALL EXISTING DATA in correct order (child -> parent)
      await tx.salaryPayment.deleteMany();
      await tx.employeeShift.deleteMany();
      await tx.expense.deleteMany();
      await tx.stockMovement.deleteMany();
      await tx.customerPaymentAllocation.deleteMany();
      await tx.supplierPaymentAllocation.deleteMany();
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
      await tx.codeSequence.deleteMany();
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

      const restoredProductIds = data.products
        .map((product) => product.id)
        .filter((id): id is string => typeof id === 'string');
      const restoredStocks = await recalculateStockLedgerForProducts(
        tx,
        restoredProductIds
      );
      const restoreOperationId = createStockOperationId();
      for (const product of data.products) {
        if (typeof product.id !== 'string') continue;
        const savedStock = roundStock(Number(product.stock || 0));
        const rebuiltStock = restoredStocks.get(product.id) || 0;
        const difference = roundStock(savedStock - rebuiltStock);
        if (Math.abs(difference) < 0.005) continue;

        await applyStockMovement(tx, {
          operationId: restoreOperationId,
          productId: product.id,
          type: 'adjustment',
          quantity: difference,
          notes: `Đối chiếu tồn khi khôi phục backup: ${rebuiltStock} → ${savedStock}`,
        });
      }

      const restoredPurchases = await tx.purchase.findMany({
        select: {
          id: true,
          code: true,
          supplierId: true,
          purchaseDate: true,
          paidAmount: true,
        },
      });
      for (const purchase of restoredPurchases) {
        await syncPurchasePayment(tx, {
          ...purchase,
          paidAmount: Number(purchase.paidAmount),
        });
      }

      const supplierIds = await tx.supplier.findMany({ select: { id: true } });
      for (const supplier of supplierIds) {
        await recalcSupplierDebt(tx, supplier.id);
      }

      const customerIdsWithPayments = Array.from(new Set(
        data.debtTransactions
          .filter((transaction) =>
            transaction.type === 'customer_payment' && Boolean(transaction.customerId)
          )
          .map((transaction) => transaction.customerId as string)
      ));
      for (const customerId of customerIdsWithPayments) {
        await reallocateCustomerPayments(tx, customerId);
      }

      if (data.codeSequences.length) {
        await tx.codeSequence.createMany({ data: data.codeSequences });
      }
    }, { maxWait: 20_000, timeout: 120_000 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Restore error:', error);
    const message = error instanceof Error ? error.message : 'Lỗi khi khôi phục dữ liệu';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
