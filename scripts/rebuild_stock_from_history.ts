import { Prisma, PrismaClient } from '@prisma/client';

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
  type: 'purchase' | 'adjustment' | 'sale';
  quantity: number;
  referenceId: string | null;
  operationId: string;
  documentVersion: number | null;
  documentDate: Date | null;
  notes: string;
};

type NegativeInterval = {
  productCode: string;
  productName: string;
  unit: string;
  startCode: string;
  startAt: Date;
  lowestStock: number;
  lowestCode: string;
  endCode: string | null;
  endAt: Date | null;
  endingStock: number | null;
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function eventPriority(type: StockEvent['type']): number {
  if (type === 'purchase') return 0;
  if (type === 'adjustment') return 1;
  return 2;
}

function compareEvents(a: StockEvent, b: StockEvent): number {
  const eventDiff = a.eventAt.getTime() - b.eventAt.getTime();
  if (eventDiff !== 0) return eventDiff;

  const typeDiff = eventPriority(a.type) - eventPriority(b.type);
  if (typeDiff !== 0) return typeDiff;

  const createdDiff = a.sourceCreatedAt.getTime() - b.sourceCreatedAt.getTime();
  if (createdDiff !== 0) return createdDiff;

  const sourceDiff = a.sourceId.localeCompare(b.sourceId);
  if (sourceDiff !== 0) return sourceDiff;

  return a.itemId.localeCompare(b.itemId);
}

async function main() {
  const apply = process.argv.includes('--apply');

  const [products, purchases, sales, adjustments, existingMovementCount] = await Promise.all([
    prisma.product.findMany({
      include: {
        blendTemplate: { include: { items: true } },
      },
      orderBy: { code: 'asc' },
    }),
    prisma.purchase.findMany({
      where: { status: 'completed' },
      include: { items: true },
      orderBy: [{ purchaseDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.sale.findMany({
      where: { status: 'completed' },
      include: { items: true },
      orderBy: [{ saleDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.stockMovement.findMany({
      where: { type: 'adjustment' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.stockMovement.count(),
  ]);

  const productById = new Map(products.map((product) => [product.id, product]));
  const currentStockByProduct = new Map(
    products.map((product) => [product.id, Number(product.stock)])
  );
  const finalStockByProduct = new Map(products.map((product) => [product.id, 0]));
  const events: StockEvent[] = [];

  for (const purchase of purchases) {
    for (const item of purchase.items) {
      const product = productById.get(item.productId);
      if (!product) throw new Error(`Phiếu ${purchase.code} chứa sản phẩm không tồn tại`);

      events.push({
        productId: item.productId,
        productCode: product.code,
        productName: product.name,
        eventAt: purchase.purchaseDate,
        sourceCreatedAt: purchase.createdAt,
        sourceId: purchase.id,
        sourceCode: purchase.code,
        itemId: item.id,
        type: 'purchase',
        quantity: round2(Number(item.quantity)),
        referenceId: purchase.id,
        operationId: `rebuild:purchase:${purchase.id}`,
        documentVersion: Math.max(1, purchase.stockVersion),
        documentDate: purchase.purchaseDate,
        notes: `Nhập hàng - ${purchase.code}`,
      });
    }
  }

  for (const sale of sales) {
    for (const item of sale.items) {
      const soldProduct = productById.get(item.productId);
      if (!soldProduct) throw new Error(`Hóa đơn ${sale.code} chứa sản phẩm không tồn tại`);

      const quantity = Number(item.quantity);
      const templateItems = soldProduct.blendTemplate?.items || [];

      if (soldProduct.blendTemplateId && templateItems.length > 0) {
        const templateTotal = templateItems.reduce(
          (sum, templateItem) => sum + Number(templateItem.quantity),
          0
        );
        if (templateTotal <= 0) {
          throw new Error(`Mẫu trộn của ${soldProduct.code} có tổng số lượng bằng 0`);
        }

        for (const ingredient of templateItems) {
          const ingredientProduct = productById.get(ingredient.productId);
          if (!ingredientProduct) {
            throw new Error(`Mẫu trộn của ${soldProduct.code} chứa sản phẩm không tồn tại`);
          }
          const ratio = Number(ingredient.quantity) / templateTotal;
          events.push({
            productId: ingredient.productId,
            productCode: ingredientProduct.code,
            productName: ingredientProduct.name,
            eventAt: sale.saleDate,
            sourceCreatedAt: sale.createdAt,
            sourceId: sale.id,
            sourceCode: sale.code,
            itemId: `${item.id}:${ingredient.id}`,
            type: 'sale',
            quantity: round2(-quantity * ratio),
            referenceId: sale.id,
            operationId: `rebuild:sale:${sale.id}`,
            documentVersion: Math.max(1, sale.stockVersion),
            documentDate: sale.saleDate,
            notes: `Bán hàng - ${sale.code} (${soldProduct.name} → ${ingredientProduct.name})`,
          });
        }
        continue;
      }

      const stockProductId = soldProduct.linkedStockId || soldProduct.id;
      const stockProduct = productById.get(stockProductId);
      if (!stockProduct) {
        throw new Error(`Sản phẩm kho liên kết của ${soldProduct.code} không tồn tại`);
      }
      events.push({
        productId: stockProductId,
        productCode: stockProduct.code,
        productName: stockProduct.name,
        eventAt: sale.saleDate,
        sourceCreatedAt: sale.createdAt,
        sourceId: sale.id,
        sourceCode: sale.code,
        itemId: item.id,
        type: 'sale',
        quantity: round2(-quantity),
        referenceId: sale.id,
        operationId: `rebuild:sale:${sale.id}`,
        documentVersion: Math.max(1, sale.stockVersion),
        documentDate: sale.saleDate,
        notes: `Bán hàng - ${sale.code}${soldProduct.linkedStockId ? ` (${soldProduct.name} → ${stockProduct.name})` : ''}`,
      });
    }
  }

  for (const adjustment of adjustments) {
    const product = productById.get(adjustment.productId);
    if (!product) continue;
    events.push({
      productId: adjustment.productId,
      productCode: product.code,
      productName: product.name,
      eventAt: adjustment.createdAt,
      sourceCreatedAt: adjustment.createdAt,
      sourceId: adjustment.id,
      sourceCode: 'KIỂM KÊ',
      itemId: adjustment.id,
      type: 'adjustment',
      quantity: round2(Number(adjustment.quantity)),
      referenceId: adjustment.referenceId,
      operationId: adjustment.operationId || `rebuild:adjustment:${adjustment.id}`,
      documentVersion: adjustment.documentVersion,
      documentDate: adjustment.documentDate,
      notes: adjustment.notes || 'Điều chỉnh kiểm kê',
    });
  }

  events.sort(compareEvents);

  const movementData: Prisma.StockMovementCreateManyInput[] = [];
  const activeNegativeIntervals = new Map<string, NegativeInterval>();
  const negativeIntervals: NegativeInterval[] = [];

  for (const event of events) {
    const stockBefore = finalStockByProduct.get(event.productId) || 0;
    const stockAfter = round2(stockBefore + event.quantity);
    finalStockByProduct.set(event.productId, stockAfter);

    movementData.push({
      productId: event.productId,
      type: event.type,
      quantity: event.quantity,
      stockBefore,
      stockAfter,
      referenceId: event.referenceId,
      operationId: event.operationId,
      documentVersion: event.documentVersion,
      documentDate: event.documentDate,
      notes: event.notes,
      createdAt: event.eventAt,
    });

    let interval = activeNegativeIntervals.get(event.productId);
    if (stockAfter < 0 && !interval) {
      const product = productById.get(event.productId)!;
      interval = {
        productCode: event.productCode,
        productName: event.productName,
        unit: product.unit,
        startCode: event.sourceCode,
        startAt: event.eventAt,
        lowestStock: stockAfter,
        lowestCode: event.sourceCode,
        endCode: null,
        endAt: null,
        endingStock: null,
      };
      activeNegativeIntervals.set(event.productId, interval);
    } else if (stockAfter < 0 && interval && stockAfter < interval.lowestStock) {
      interval.lowestStock = stockAfter;
      interval.lowestCode = event.sourceCode;
    }

    if (stockAfter >= 0 && interval) {
      interval.endCode = event.sourceCode;
      interval.endAt = event.eventAt;
      interval.endingStock = stockAfter;
      negativeIntervals.push(interval);
      activeNegativeIntervals.delete(event.productId);
    }
  }

  negativeIntervals.push(...Array.from(activeNegativeIntervals.values()));

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
    .filter((row) => Math.abs(row.diff) > 0.005);

  console.log('=== Rebuild continuous stock ledger ===');
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Products: ${products.length}`);
  console.log(`Completed purchases: ${purchases.length}`);
  console.log(`Completed sales: ${sales.length}`);
  console.log(`Manual adjustments kept: ${adjustments.length}`);
  console.log(`Existing stock movements: ${existingMovementCount}`);
  console.log(`Rebuilt stock movements: ${movementData.length}`);
  console.log(`Products with changed final stock: ${changedProducts.length}`);

  for (const row of changedProducts) {
    console.log(
      `${row.code} ${row.name}: current=${row.currentStock} rebuilt=${row.rebuiltStock} diff=${row.diff}`
    );
  }

  console.log(`Negative stock intervals kept: ${negativeIntervals.length}`);
  for (const interval of negativeIntervals) {
    console.log(
      `${interval.productCode} ${interval.productName}: ` +
      `${interval.startCode} -> min=${interval.lowestStock} at ${interval.lowestCode} -> ` +
      `${interval.endCode || 'chưa hết âm'}${interval.endingStock === null ? '' : ` (${interval.endingStock})`}`
    );
  }

  if (!apply) {
    console.log('\nDry-run only. Run with --apply to replace the stock ledger and product stock.');
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.stockMovement.deleteMany();
      if (movementData.length > 0) {
        await tx.stockMovement.createMany({ data: movementData });
      }

      for (const product of products) {
        await tx.product.update({
          where: { id: product.id },
          data: { stock: finalStockByProduct.get(product.id) || 0 },
        });
      }

      await tx.sale.updateMany({
        where: { status: 'completed' },
        data: { stockVersion: 1 },
      });
      await tx.sale.updateMany({
        where: { status: { not: 'completed' } },
        data: { stockVersion: 0 },
      });
      await tx.purchase.updateMany({
        where: { status: 'completed' },
        data: { stockVersion: 1 },
      });
    },
    { maxWait: 20_000, timeout: 120_000 }
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
