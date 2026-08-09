import { PrismaClient } from '@prisma/client';

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
 * Tính lại công nợ nhà cung cấp từ dữ liệu gốc
 */
export async function recalcSupplierDebt(tx: TxClient, supplierId: string): Promise<number> {
  // 1. Tổng nợ từ phiếu nhập completed
  const purchaseDebt = await tx.purchase.aggregate({
    where: { supplierId, status: 'completed' },
    _sum: { debtAmount: true },
  });
  const totalPurchaseDebt = Number(purchaseDebt._sum.debtAmount || 0);

  // 2. Tổng thanh toán nợ thực tế
  const payments = await tx.debtTransaction.aggregate({
    where: {
      supplierId,
      type: 'supplier_payment',
    },
    _sum: { amount: true },
  });
  const totalPayments = Math.abs(Number(payments._sum.amount || 0));

  // 3. Debt = nợ từ phiếu nhập - đã trả.
  // Cho phép âm để thể hiện tiền ứng trước/trả dư cho nhà cung cấp.
  const correctDebt = totalPurchaseDebt - totalPayments;

  // 4. Update
  await tx.supplier.update({
    where: { id: supplierId },
    data: { debt: correctDebt },
  });

  return correctDebt;
}
