import { PrismaClient, Prisma } from '@prisma/client';

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
  const totalSaleDebt = salesDebt._sum.debtAmount || 0;

  // 2. Tổng thanh toán nợ thực tế (từ trang Công nợ — không có saleId)
  const payments = await tx.debtTransaction.aggregate({
    where: {
      customerId,
      type: 'customer_payment',
      saleId: null, // Chỉ payment thực (ghi tay), không phải hoàn nợ do hủy/sửa HĐ
    },
    _sum: { amount: true },
  });
  // amount là số âm (VD: -200000) nên cần abs
  const totalPayments = Math.abs(payments._sum.amount || 0);

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
 * Tính lại công nợ nhà cung cấp từ dữ liệu gốc
 */
export async function recalcSupplierDebt(tx: TxClient, supplierId: string): Promise<number> {
  // 1. Tổng nợ từ phiếu nhập completed
  const purchaseDebt = await tx.purchase.aggregate({
    where: { supplierId, status: 'completed' },
    _sum: { debtAmount: true },
  });
  const totalPurchaseDebt = purchaseDebt._sum.debtAmount || 0;

  // 2. Tổng thanh toán nợ thực tế
  const payments = await tx.debtTransaction.aggregate({
    where: {
      supplierId,
      type: 'supplier_payment',
      purchaseId: null,
    },
    _sum: { amount: true },
  });
  const totalPayments = Math.abs(payments._sum.amount || 0);

  // 3. Debt = nợ từ phiếu nhập - đã trả
  const correctDebt = Math.max(0, totalPurchaseDebt - totalPayments);

  // 4. Update
  await tx.supplier.update({
    where: { id: supplierId },
    data: { debt: correctDebt },
  });

  return correctDebt;
}
