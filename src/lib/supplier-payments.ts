import { PrismaClient } from '@prisma/client';

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export type PurchasePaymentSource = {
  id: string;
  code: string;
  supplierId: string;
  purchaseDate: Date;
  paidAmount: number;
};

/** Đồng bộ khoản tiền thực chi được nhập trực tiếp trên một phiếu nhập. */
export async function syncPurchasePayment(
  tx: TxClient,
  purchase: PurchasePaymentSource
): Promise<string | null> {
  const existing = await tx.debtTransaction.findUnique({
    where: { sourcePurchaseId: purchase.id },
    select: { id: true },
  });

  if (purchase.paidAmount <= 0) {
    if (existing) await tx.debtTransaction.delete({ where: { id: existing.id } });
    return null;
  }

  const data = {
    type: 'supplier_payment',
    supplierId: purchase.supplierId,
    amount: -purchase.paidAmount,
    notes: `Thanh toán khi nhập - ${purchase.code}`,
    paymentMethod: null,
    createdAt: purchase.purchaseDate,
  };

  if (existing) {
    await tx.debtTransaction.update({ where: { id: existing.id }, data });
    return existing.id;
  }

  const payment = await tx.debtTransaction.create({
    data: {
      ...data,
      balanceAfter: 0,
      sourcePurchaseId: purchase.id,
    },
    select: { id: true },
  });
  return payment.id;
}
