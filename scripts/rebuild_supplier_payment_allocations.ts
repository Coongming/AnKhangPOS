import { PrismaClient } from '@prisma/client';
import { recalcSupplierDebt } from '../src/lib/debt-utils';
import { syncPurchasePayment } from '../src/lib/supplier-payments';

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');

async function main() {
  const [suppliers, purchases, sourcePayments] = await Promise.all([
    prisma.supplier.findMany({ select: { id: true, code: true, name: true } }),
    prisma.purchase.findMany({
      select: {
        id: true,
        code: true,
        supplierId: true,
        purchaseDate: true,
        paidAmount: true,
      },
    }),
    prisma.debtTransaction.findMany({
      where: { sourcePurchaseId: { not: null } },
      select: { sourcePurchaseId: true, supplierId: true, amount: true },
    }),
  ]);

  const sourceByPurchase = new Map(
    sourcePayments.map((payment) => [payment.sourcePurchaseId, payment])
  );
  const mismatchedPayments = purchases.filter((purchase) => {
    const payment = sourceByPurchase.get(purchase.id);
    const paidAmount = Number(purchase.paidAmount);
    if (paidAmount === 0) return Boolean(payment);
    return !payment
      || payment.supplierId !== purchase.supplierId
      || Math.abs(Number(payment.amount)) !== paidAmount;
  });

  console.log(
    `${shouldApply ? 'Áp dụng' : 'Dry-run'}: ${suppliers.length} NCC, `
      + `${purchases.length} phiếu nhập, ${mismatchedPayments.length} khoản chi cần đồng bộ.`
  );

  if (!shouldApply) {
    console.log('Chạy lại với --apply để đồng bộ giao dịch và dựng phân bổ FIFO.');
    return;
  }

  for (const supplier of suppliers) {
    await prisma.$transaction(async (tx) => {
      const supplierPurchases = await tx.purchase.findMany({
        where: { supplierId: supplier.id },
        select: {
          id: true,
          code: true,
          supplierId: true,
          purchaseDate: true,
          paidAmount: true,
        },
      });

      for (const purchase of supplierPurchases) {
        await syncPurchasePayment(tx, {
          ...purchase,
          paidAmount: Number(purchase.paidAmount),
        });
      }
      await recalcSupplierDebt(tx, supplier.id);
    });
  }

  const [paymentCount, allocationCount] = await Promise.all([
    prisma.debtTransaction.count({ where: { type: 'supplier_payment' } }),
    prisma.supplierPaymentAllocation.count(),
  ]);
  console.log(
    `Hoàn tất: ${paymentCount} giao dịch trả NCC, ${allocationCount} phân bổ FIFO.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
