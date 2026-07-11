import { Prisma, PrismaClient } from '@prisma/client';

// Khi Prisma trả về Decimal, JSON.stringify sẽ tự convert thành Number
// (tránh frontend nhận string thay vì number)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Prisma.Decimal.prototype as any).toJSON = function () {
  return Number(this);
};

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  transactionOptions: {
    maxWait: 10000,  // 10s chờ kết nối
    timeout: 15000,  // 15s timeout cho transaction
  },
});

// Cache connection cả production lẫn dev → tránh tạo connection mới mỗi request
globalForPrisma.prisma = prisma;
