import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const backupFile = '/home/vanduccongminh/ankhangpos-backup-2026-07-09T06-40-57.json';

async function main() {
  const data = JSON.parse(fs.readFileSync(backupFile, 'utf8')).data;
  const targetDate = new Date('2026-07-04T00:00:00+07:00');

  // Get the 40 sales we just inserted
  const fileSales: any[] = data.sales || [];
  const fileSaleItems: any[] = data.saleItems || [];
  const targetSaleIds = fileSales
    .filter((s: any) => new Date(s.saleDate) >= targetDate)
    .map((s: any) => s.id);

  // Get all sale items for those sales
  const targetItems = fileSaleItems.filter((si: any) => targetSaleIds.includes(si.saleId));

  // Group by productId, sum quantities
  const stockChanges: Record<string, number> = {};
  for (const item of targetItems) {
    stockChanges[item.productId] = (stockChanges[item.productId] || 0) + Number(item.quantity);
  }

  console.log('Stock adjustments from 40 new sales:\n');

  let updated = 0;
  for (const [productId, soldQty] of Object.entries(stockChanges)) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, code: true, name: true, stock: true, unit: true },
    });
    if (!product) {
      console.log(`  ⚠ Product ${productId} not found, skipping`);
      continue;
    }

    const newStock = Number(product.stock) - soldQty;
    console.log(`  ${product.code} ${product.name}: ${product.stock} - ${soldQty} = ${newStock} ${product.unit}`);

    await prisma.product.update({
      where: { id: productId },
      data: { stock: newStock },
    });
    updated++;
  }

  console.log(`\n--- DONE ---`);
  console.log(`Products updated: ${updated}`);
  console.log(`Total items processed: ${targetItems.length}`);
}

main()
  .catch(e => console.error('ERROR:', e.message))
  .finally(() => prisma.$disconnect());
