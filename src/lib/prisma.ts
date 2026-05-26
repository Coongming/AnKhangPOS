import { PrismaClient } from '@prisma/client';

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
