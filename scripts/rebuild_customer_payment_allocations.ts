import { PrismaClient } from '@prisma/client';
import {
  reallocateCustomerPayments,
  recalcCustomerDebt,
} from '../src/lib/debt-utils';

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');

async function main() {
  const payments = await prisma.debtTransaction.findMany({
    where: {
      type: 'customer_payment',
      customerId: { not: null },
    },
    select: { customerId: true },
    distinct: ['customerId'],
  });
  const customerIds = payments
    .map((payment) => payment.customerId)
    .filter((customerId): customerId is string => Boolean(customerId));

  console.log(
    shouldApply
      ? `Đang dựng lại phân bổ cho ${customerIds.length} khách hàng...`
      : `Dry-run: có ${customerIds.length} khách hàng cần dựng phân bổ.`
  );

  if (!shouldApply) {
    console.log('Chạy lại với --apply để ghi dữ liệu.');
    return;
  }

  for (const customerId of customerIds) {
    await prisma.$transaction(async (tx) => {
      await recalcCustomerDebt(tx, customerId);
      await reallocateCustomerPayments(tx, customerId);
    });
  }

  const allocationCount = await prisma.customerPaymentAllocation.count();
  console.log(`Hoàn tất: ${allocationCount} phân bổ thanh toán.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
