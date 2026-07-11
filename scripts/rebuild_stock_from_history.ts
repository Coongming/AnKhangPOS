import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type StockEvent = {
  productId: string;
  productCode: string;
  productName: string;
  eventAt: Date;
  sourceCreatedAt: Date;
  sourceId: string;
  sourceCode: string;
  itemId: string;
  type: 'purchase' | 'sale';
  quantity: number;
  notes: string;
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function compareEvents(a: StockEvent, b: StockEvent): number {
  const eventDiff = a.eventAt.getTime() - b.eventAt.getTime();
  if (eventDiff !== 0) return eventDiff;

  // When old imported records only have a date, keep same-day purchases before sales.
  const typeDiff = (a.type === 'purchase' ? 0 : 1) - (b.type === 'purchase' ? 0 : 1);
  if (typeDiff !== 0) return typeDiff;

  const createdDiff = a.sourceCreatedAt.getTime() - b.sourceCreatedAt.getTime();
  if (createdDiff !== 0) return createdDiff;

  const sourceDiff = a.sourceId.localeCompare(b.sourceId);
  if (sourceDiff !== 0) return sourceDiff;

  return a.itemId.localeCompare(b.itemId);
}

function withDeterministicTimestamp(event: StockEvent, indexInTimestamp: number): Date {
  return new Date(event.eventAt.getTime() + indexInTimestamp);
}

async function main() {
  const apply = process.argv.includes('--apply');

  const [products, purchases, sales, existingMovementCount] = await Promise.all([
    prisma.product.findMany({
      select: { id: true, code: true, name: true, stock: true },
      orderBy: { code: 'asc' },
    }),
    prisma.purchase.findMany({
      where: { status: 'completed', type: 'purchase' },
      include: {
        items: {
          include: {
            product: { select: { code: true, name: true } },
          },
        },
      },
      orderBy: [{ purchaseDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.sale.findMany({
      where: { status: 'completed' },
      include: {
        items: {
          include: {
            product: { select: { code: true, name: true } },
          },
        },
      },
      orderBy: [{ saleDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.stockMovement.count(),
  ]);

  const currentStockByProduct = new Map(products.map((product) => [product.id, Number(product.stock)]));
  const finalStockByProduct = new Map(products.map((product) => [product.id, 0]));
  const events: StockEvent[] = [];

  for (const purchase of purchases) {
    for (const item of purchase.items) {
      const quantity = round2(Number(item.quantity));
      events.push({
        productId: item.productId,
        productCode: item.product.code,
        productName: item.product.name,
        eventAt: purchase.purchaseDate,
        sourceCreatedAt: purchase.createdAt,
        sourceId: purchase.id,
        sourceCode: purchase.code,
        itemId: item.id,
        type: 'purchase',
        quantity,
        notes: `Nhập hàng - ${purchase.code}`,
      });
    }
  }

  for (const sale of sales) {
    for (const item of sale.items) {
      const quantity = round2(-Number(item.quantity));
      events.push({
        productId: item.productId,
        productCode: item.product.code,
        productName: item.product.name,
        eventAt: sale.saleDate,
        sourceCreatedAt: sale.createdAt,
        sourceId: sale.id,
        sourceCode: sale.code,
        itemId: item.id,
        type: 'sale',
        quantity,
        notes: `Bán hàng - ${sale.code}`,
      });
    }
  }

  events.sort(compareEvents);

  const eventsByProduct = new Map<string, StockEvent[]>();
  for (const event of events) {
    const existing = eventsByProduct.get(event.productId) || [];
    existing.push(event);
    eventsByProduct.set(event.productId, existing);
  }

  const movementData: Array<{
    productId: string;
    type: string;
    quantity: number;
    stockAfter: number;
    referenceId: string;
    notes: string;
    createdAt: Date;
  }> = [];

  const negativeSnapshots: Array<{
    productCode: string;
    productName: string;
    referenceId: string;
    stockAfter: number;
  }> = [];

  for (const product of products) {
    let runningStock = 0;
    const productEvents = eventsByProduct.get(product.id) || [];
    const timestampCount = new Map<number, number>();

    for (const event of productEvents) {
      runningStock = round2(runningStock + event.quantity);
      const timestampKey = event.eventAt.getTime();
      const indexInTimestamp = timestampCount.get(timestampKey) || 0;
      timestampCount.set(timestampKey, indexInTimestamp + 1);

      if (runningStock < 0) {
        negativeSnapshots.push({
          productCode: event.productCode,
          productName: event.productName,
          referenceId: event.sourceId,
          stockAfter: runningStock,
        });
      }

      movementData.push({
        productId: event.productId,
        type: event.type,
        quantity: event.quantity,
        stockAfter: runningStock,
        referenceId: event.sourceId,
        notes: event.notes,
        createdAt: withDeterministicTimestamp(event, indexInTimestamp),
      });
    }

    finalStockByProduct.set(product.id, runningStock);
  }

  const changedProducts = products
    .map((product) => {
      const currentStock = currentStockByProduct.get(product.id) || 0;
      const rebuiltStock = finalStockByProduct.get(product.id) || 0;
      return {
        code: product.code,
        name: product.name,
        currentStock,
        rebuiltStock,
        diff: round2(rebuiltStock - currentStock),
      };
    })
    .filter((row) => Math.abs(row.diff) > 0.0001);

  console.log('=== Rebuild stock ledger from sales + purchases ===');
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Products: ${products.length}`);
  console.log(`Completed purchases: ${purchases.length}`);
  console.log(`Completed sales: ${sales.length}`);
  console.log(`Existing stock_movements: ${existingMovementCount}`);
  console.log(`New stock_movements from history: ${movementData.length}`);
  console.log(`Products with changed stock: ${changedProducts.length}`);

  if (changedProducts.length > 0) {
    console.log('\nChanged stock preview:');
    for (const row of changedProducts.slice(0, 30)) {
      console.log(
        `${row.code} ${row.name}: current=${row.currentStock} rebuilt=${row.rebuiltStock} diff=${row.diff}`
      );
    }
    if (changedProducts.length > 30) {
      console.log(`... and ${changedProducts.length - 30} more`);
    }
  }

  if (negativeSnapshots.length > 0) {
    console.log('\nWarning: some products go negative during the rebuilt timeline:');
    for (const row of negativeSnapshots.slice(0, 20)) {
      console.log(`${row.productCode} ${row.productName}: reference=${row.referenceId} stockAfter=${row.stockAfter}`);
    }
    if (negativeSnapshots.length > 20) {
      console.log(`... and ${negativeSnapshots.length - 20} more`);
    }
  }

  if (!apply) {
    console.log('\nDry-run only. Run with --apply to rewrite stock_movements and products.stock.');
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.stockMovement.deleteMany();

      if (movementData.length > 0) {
        await tx.stockMovement.createMany({
          data: movementData,
        });
      }

      for (const product of products) {
        await tx.product.update({
          where: { id: product.id },
          data: { stock: finalStockByProduct.get(product.id) || 0 },
        });
      }
    },
    { maxWait: 20_000, timeout: 60_000 }
  );

  console.log('\nApplied successfully.');
}

main()
  .catch((error) => {
    console.error('Rebuild failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
