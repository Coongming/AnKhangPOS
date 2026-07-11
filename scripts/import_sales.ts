import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const backupFile = '/home/vanduccongminh/ankhangpos-backup-2026-07-09T06-40-57.json';

async function main() {
  const data = JSON.parse(fs.readFileSync(backupFile, 'utf8')).data;
  const targetDate = new Date('2026-07-04T00:00:00+07:00');

  // ======= 1. ADD MISSING CUSTOMERS =======
  const dbCustomerIds = (await prisma.customer.findMany({ select: { id: true } })).map(c => c.id);
  const fileCustomers: any[] = data.customers || [];
  const missingCustomers = fileCustomers.filter((c: any) => !dbCustomerIds.includes(c.id));

  console.log(`Adding ${missingCustomers.length} new customers...`);
  for (const c of missingCustomers) {
    await prisma.customer.create({
      data: {
        id: c.id,
        code: c.code,
        name: c.name,
        phone: c.phone || null,
        address: c.address || null,
        notes: c.notes || null,
        debt: c.debt || 0,
        isActive: c.isActive ?? true,
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt),
      },
    });
    console.log(`  + ${c.code} - ${c.name}`);
  }

  // ======= 2. ADD SALES FROM 04/07/2026 =======
  const fileSales: any[] = data.sales || [];
  const fileSaleItems: any[] = data.saleItems || [];
  const existingSaleIds = (await prisma.sale.findMany({ select: { id: true } })).map(s => s.id);

  const targetSales = fileSales
    .filter((s: any) => new Date(s.saleDate) >= targetDate)
    .filter((s: any) => !existingSaleIds.includes(s.id));

  console.log(`\nInserting ${targetSales.length} sales...`);
  
  let insertedSales = 0;
  let insertedItems = 0;

  for (const sale of targetSales) {
    const items = fileSaleItems.filter((si: any) => si.saleId === sale.id);

    await prisma.sale.create({
      data: {
        id: sale.id,
        code: sale.code,
        customerId: sale.customerId || null,
        deliveryEmployeeId: sale.deliveryEmployeeId || null,
        saleDate: new Date(sale.saleDate),
        subtotal: sale.subtotal,
        discount: sale.discount,
        totalAmount: sale.totalAmount,
        totalCost: sale.totalCost,
        paidAmount: sale.paidAmount,
        debtAmount: sale.debtAmount,
        notes: sale.notes || null,
        paymentMethod: sale.paymentMethod || 'cash',
        status: sale.status || 'completed',
        createdAt: new Date(sale.createdAt),
        updatedAt: new Date(sale.updatedAt),
        items: {
          create: items.map((item: any) => ({
            id: item.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            costPrice: item.costPrice,
            discount: item.discount || 0,
            totalPrice: item.totalPrice,
            createdAt: new Date(item.createdAt),
          })),
        },
      },
    });

    insertedSales++;
    insertedItems += items.length;
    console.log(`  + ${sale.code} | ${new Date(sale.saleDate).toLocaleDateString('vi-VN')} | ${sale.totalAmount.toLocaleString('vi-VN')}đ | ${items.length} items`);
  }

  console.log(`\n--- SUMMARY ---`);
  console.log(`Customers added: ${missingCustomers.length}`);
  console.log(`Sales added: ${insertedSales}`);
  console.log(`Sale items added: ${insertedItems}`);
  console.log(`Done!`);
}

main()
  .catch(e => { console.error('ERROR:', e.message); })
  .finally(() => prisma.$disconnect());
