import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const backupFile = '/home/vanduccongminh/ankhangpos-backup-2026-07-09T06-40-57.json';

async function main() {
  console.log('Reading backup file...');
  const data = JSON.parse(fs.readFileSync(backupFile, 'utf8')).data;
  
  console.log('--- ANALYSIS START ---');

  // Compare Categories
  const dbCategories = await prisma.productCategory.findMany();
  const fileCategories = data.categories || [];
  const missingCategories = fileCategories.filter((fc: any) => !dbCategories.find(dc => dc.id === fc.id));
  console.log(`Missing Categories: ${missingCategories.length}`);
  if (missingCategories.length) console.log(missingCategories.map((c: any) => c.name));

  // Compare Products
  const dbProducts = await prisma.product.findMany();
  const fileProducts = data.products || [];
  const missingProducts = fileProducts.filter((fp: any) => !dbProducts.find(dp => dp.id === fp.id));
  console.log(`Missing Products: ${missingProducts.length}`);
  if (missingProducts.length) console.log(missingProducts.map((p: any) => `${p.code} - ${p.name}`));

  // Compare Customers
  const dbCustomers = await prisma.customer.findMany();
  const fileCustomers = data.customers || [];
  const missingCustomers = fileCustomers.filter((fc: any) => !dbCustomers.find(dc => dc.id === fc.id));
  console.log(`Missing Customers: ${missingCustomers.length}`);
  if (missingCustomers.length) console.log(missingCustomers.map((c: any) => `${c.code} - ${c.name}`));

  // Compare Suppliers
  const dbSuppliers = await prisma.supplier.findMany();
  const fileSuppliers = data.suppliers || [];
  const missingSuppliers = fileSuppliers.filter((fsup: any) => !dbSuppliers.find(dsup => dsup.id === fsup.id));
  console.log(`Missing Suppliers: ${missingSuppliers.length}`);
  if (missingSuppliers.length) console.log(missingSuppliers.map((s: any) => `${s.code} - ${s.name}`));

  // Check Sales from 04/07/2026
  const targetDate = new Date('2026-07-04T00:00:00+07:00');
  const fileSales = data.sales || [];
  const targetSales = fileSales.filter((s: any) => new Date(s.saleDate) >= targetDate);
  
  // Check if any of these sales already exist in DB
  const existingSaleIds = (await prisma.sale.findMany({ select: { id: true } })).map(s => s.id);
  const newSalesToInsert = targetSales.filter((s: any) => !existingSaleIds.includes(s.id));
  
  console.log(`Sales in file from 04/07/2026: ${targetSales.length}`);
  console.log(`Sales to insert (not in DB): ${newSalesToInsert.length}`);
  
  // Let's summarize items needed for these sales
  const missingProductsInSales = new Set();
  const missingCustomersInSales = new Set();
  
  for (const sale of newSalesToInsert) {
    if (sale.customerId && !dbCustomers.find(c => c.id === sale.customerId)) {
      missingCustomersInSales.add(sale.customerId);
    }
    for (const item of sale.items || []) {
      if (!dbProducts.find(p => p.id === item.productId)) {
        missingProductsInSales.add(item.productId);
      }
    }
  }
  
  console.log(`Dependencies missing for sales:`);
  console.log(`- Customers: ${missingCustomersInSales.size}`);
  console.log(`- Products: ${missingProductsInSales.size}`);

  console.log('--- ANALYSIS END ---');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
