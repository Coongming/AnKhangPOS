import { Prisma, PrismaClient } from '@prisma/client';

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * Tính lại công nợ khách hàng từ dữ liệu gốc (hóa đơn + thanh toán)
 * 
 * Công thức: debt = Σ(debtAmount từ HĐ completed) - Σ(trả nợ thực tế)
 * 
 * Thay thế increment/decrement để tránh lệch tích lũy.
 */
export async function recalcCustomerDebt(tx: TxClient, customerId: string): Promise<number> {
  // 1. Tổng nợ từ hóa đơn completed
  const salesDebt = await tx.sale.aggregate({
    where: { customerId, status: 'completed' },
    _sum: { debtAmount: true },
  });
  const totalSaleDebt = Number(salesDebt._sum.debtAmount || 0);

  // 2. Tổng thanh toán nợ thực tế từ trang Công nợ
  const payments = await tx.debtTransaction.aggregate({
    where: {
      customerId,
      type: 'customer_payment',
    },
    _sum: { amount: true },
  });
  // amount là số âm (VD: -200000) nên cần abs
  const totalPayments = Math.abs(Number(payments._sum.amount || 0));

  // 3. Debt = nợ từ HĐ - đã trả
  const correctDebt = Math.max(0, totalSaleDebt - totalPayments);

  // 4. Update
  await tx.customer.update({
    where: { id: customerId },
    data: { debt: correctDebt },
  });

  return correctDebt;
}

/**
 * Phân bổ toàn bộ khoản khách đã trả vào hóa đơn cũ nhất trước.
 *
 * Giao dịch nhận tiền được giữ độc lập trong DebtTransaction. Bảng phân bổ chỉ
 * là dữ liệu dẫn xuất nên có thể xóa và dựng lại an toàn sau khi sửa hóa đơn.
 */
export async function reallocateCustomerPayments(tx: TxClient, customerId: string): Promise<void> {
  const [sales, payments] = await Promise.all([
    tx.sale.findMany({
      where: {
        customerId,
        status: 'completed',
        debtAmount: { gt: 0 },
      },
      select: {
        id: true,
        debtAmount: true,
      },
      orderBy: [
        { saleDate: 'asc' },
        { createdAt: 'asc' },
      ],
    }),
    tx.debtTransaction.findMany({
      where: {
        customerId,
        type: 'customer_payment',
      },
      select: {
        id: true,
        amount: true,
      },
      orderBy: [
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    }),
  ]);

  await tx.customerPaymentAllocation.deleteMany({
    where: {
      transaction: {
        customerId,
        type: 'customer_payment',
      },
    },
  });

  if (sales.length === 0 || payments.length === 0) return;

  const remainingBySale = sales.map((sale) => ({
    id: sale.id,
    remaining: Number(sale.debtAmount),
  }));
  const allocations: Array<{ transactionId: string; saleId: string; amount: number }> = [];
  let saleIndex = 0;

  for (const payment of payments) {
    let paymentRemaining = Math.abs(Number(payment.amount));

    while (paymentRemaining > 0 && saleIndex < remainingBySale.length) {
      const sale = remainingBySale[saleIndex];
      if (sale.remaining <= 0) {
        saleIndex += 1;
        continue;
      }

      const amount = Math.min(paymentRemaining, sale.remaining);
      allocations.push({
        transactionId: payment.id,
        saleId: sale.id,
        amount,
      });
      paymentRemaining -= amount;
      sale.remaining -= amount;
    }
  }

  if (allocations.length > 0) {
    await tx.customerPaymentAllocation.createMany({ data: allocations });
  }
}

/**
 * Dựng lại toàn bộ phân bổ tiền trả nhà cung cấp theo FIFO.
 *
 * Phiếu nhập là nghĩa vụ phải trả, còn DebtTransaction là tiền thực chi.
 * Hai dữ liệu này độc lập nên xóa/hủy phiếu không xóa lịch sử tiền; phần tiền
 * chưa phân bổ sẽ trở thành ứng trước và tự bù vào phiếu nhập tiếp theo.
 */
export async function reallocateSupplierPayments(
  tx: TxClient,
  supplierId: string
): Promise<number> {
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "suppliers" WHERE "id" = ${supplierId} FOR UPDATE
  `);

  const [purchases, payments] = await Promise.all([
    tx.purchase.findMany({
      where: { supplierId, status: 'completed' },
      select: { id: true, totalAmount: true },
      orderBy: [
        { purchaseDate: 'asc' },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    }),
    tx.debtTransaction.findMany({
      where: { supplierId, type: 'supplier_payment' },
      select: { id: true, amount: true },
      orderBy: [
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    }),
  ]);

  await tx.supplierPaymentAllocation.deleteMany({
    where: {
      transaction: { supplierId, type: 'supplier_payment' },
    },
  });

  const remainingByPurchase = purchases.map((purchase) => ({
    id: purchase.id,
    totalAmount: Number(purchase.totalAmount),
    remaining: Number(purchase.totalAmount),
  }));
  const allocations: Array<{
    transactionId: string;
    purchaseId: string;
    amount: number;
  }> = [];
  let purchaseIndex = 0;

  for (const payment of payments) {
    let paymentRemaining = Math.abs(Number(payment.amount));

    while (paymentRemaining > 0 && purchaseIndex < remainingByPurchase.length) {
      const purchase = remainingByPurchase[purchaseIndex];
      if (purchase.remaining <= 0) {
        purchaseIndex += 1;
        continue;
      }

      const amount = Math.min(paymentRemaining, purchase.remaining);
      allocations.push({
        transactionId: payment.id,
        purchaseId: purchase.id,
        amount,
      });
      paymentRemaining -= amount;
      purchase.remaining -= amount;
    }
  }

  if (allocations.length > 0) {
    await tx.supplierPaymentAllocation.createMany({ data: allocations });
  }

  for (const purchase of remainingByPurchase) {
    await tx.purchase.update({
      where: { id: purchase.id },
      data: { debtAmount: Math.max(0, purchase.remaining) },
    });
  }
  await tx.purchase.updateMany({
    where: { supplierId, status: { not: 'completed' }, debtAmount: { not: 0 } },
    data: { debtAmount: 0 },
  });

  const totalPurchases = remainingByPurchase.reduce(
    (sum, purchase) => sum + purchase.totalAmount,
    0
  );
  const totalPayments = payments.reduce(
    (sum, payment) => sum + Math.abs(Number(payment.amount)),
    0
  );
  const correctDebt = totalPurchases - totalPayments;

  await tx.supplier.update({
    where: { id: supplierId },
    data: { debt: correctDebt },
  });

  return correctDebt;
}

export async function recalcSupplierDebt(
  tx: TxClient,
  supplierId: string
): Promise<number> {
  return reallocateSupplierPayments(tx, supplierId);
}
