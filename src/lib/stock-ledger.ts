import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export type StockOperationContext = {
  operationId: string;
  documentVersion?: number | null;
  documentDate?: Date | null;
};

type ApplyStockMovementInput = StockOperationContext & {
  productId: string;
  type: string;
  quantity: number;
  referenceId?: string | null;
  notes?: string | null;
};

const STOCK_EPSILON = 0.005;

export function createStockOperationId(): string {
  return randomUUID();
}

export function roundStock(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function applyStockMovement(
  tx: TxClient,
  input: ApplyStockMovementInput
): Promise<{ stockBefore: number; stockAfter: number }> {
  const quantity = roundStock(input.quantity);
  if (Math.abs(quantity) < STOCK_EPSILON) {
    throw new Error('Biến động kho phải khác 0');
  }

  const updatedProduct = await tx.product.update({
    where: { id: input.productId },
    data: quantity > 0
      ? { stock: { increment: quantity } }
      : { stock: { decrement: Math.abs(quantity) } },
    select: { code: true, name: true, stock: true },
  });

  const stockAfter = roundStock(Number(updatedProduct.stock));
  const stockBefore = roundStock(stockAfter - quantity);
  const previousMovement = await tx.stockMovement.findFirst({
    where: { productId: input.productId },
    select: { stockAfter: true },
    orderBy: { ledgerSequence: 'desc' },
  });
  const previousStockAfter = previousMovement
    ? roundStock(Number(previousMovement.stockAfter))
    : 0;

  if (Math.abs(previousStockAfter - stockBefore) > STOCK_EPSILON) {
    throw new Error(
      `Sổ kho ${updatedProduct.code} - ${updatedProduct.name} không liên tục ` +
      `(dòng trước ${previousStockAfter}, tồn trước ${stockBefore}). Hãy rebuild sổ kho trước.`
    );
  }

  await tx.stockMovement.create({
    data: {
      productId: input.productId,
      type: input.type,
      quantity,
      stockBefore,
      stockAfter,
      referenceId: input.referenceId || null,
      operationId: input.operationId,
      documentVersion: input.documentVersion ?? null,
      documentDate: input.documentDate ?? null,
      notes: input.notes || null,
    },
  });

  return { stockBefore, stockAfter };
}

export async function recalculateStockLedgerForProducts(
  tx: TxClient,
  productIds: Iterable<string>
): Promise<Map<string, number>> {
  const finalStocks = new Map<string, number>();

  for (const productId of Array.from(new Set(productIds)).sort()) {
    const movements = await tx.stockMovement.findMany({
      where: { productId },
      select: {
        id: true,
        quantity: true,
        stockBefore: true,
        stockAfter: true,
      },
      orderBy: { ledgerSequence: 'asc' },
    });

    let runningStock = 0;
    for (const movement of movements) {
      const stockBefore = runningStock;
      const stockAfter = roundStock(stockBefore + Number(movement.quantity));
      runningStock = stockAfter;

      if (
        Math.abs(Number(movement.stockBefore) - stockBefore) > STOCK_EPSILON ||
        Math.abs(Number(movement.stockAfter) - stockAfter) > STOCK_EPSILON
      ) {
        await tx.stockMovement.update({
          where: { id: movement.id },
          data: { stockBefore, stockAfter },
        });
      }
    }

    await tx.product.update({
      where: { id: productId },
      data: { stock: runningStock },
    });
    finalStocks.set(productId, runningStock);
  }

  return finalStocks;
}

export async function deleteReferenceStockHistory(
  tx: TxClient,
  referenceId: string
): Promise<Set<string>> {
  const movements = await tx.stockMovement.findMany({
    where: { referenceId },
    select: { productId: true },
  });
  const affectedProductIds = new Set(movements.map((movement) => movement.productId));

  await tx.stockMovement.deleteMany({ where: { referenceId } });
  await recalculateStockLedgerForProducts(tx, affectedProductIds);

  return affectedProductIds;
}
