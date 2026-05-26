import { PrismaClient } from '@prisma/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/**
 * Deduct stock for a product based on its blend template.
 * If the product has a blendTemplateId, deduct ingredients proportionally.
 * If the product has a linkedStockId, deduct from the linked product.
 * Otherwise, deduct from the product itself.
 * 
 * Returns info about what was deducted for stock movement recording.
 */
export async function deductStockForProduct(
  tx: TxClient,
  productId: string,
  quantity: number,
  referenceId: string,
  notePrefix: string,
  allowNegative: boolean
): Promise<void> {
  const product = await tx.product.findUnique({
    where: { id: productId },
    include: {
      blendTemplate: {
        include: {
          items: {
            include: { product: true },
          },
        },
      },
    },
  });
  if (!product) return;

  // Case 1: Blend template — deduct ingredients proportionally
  if (product.blendTemplateId && product.blendTemplate && product.blendTemplate.items.length > 0) {
    const totalTemplateQty = product.blendTemplate.items.reduce((sum, i) => sum + i.quantity, 0);
    if (totalTemplateQty <= 0) return;

    for (const ingredient of product.blendTemplate.items) {
      const ratio = ingredient.quantity / totalTemplateQty;
      const deductQty = quantity * ratio;

      const ingredientProduct = await tx.product.findUnique({ where: { id: ingredient.productId } });
      if (!ingredientProduct) continue;

      if (!allowNegative && ingredientProduct.stock < deductQty) {
        throw new Error(`Nguyên liệu "${ingredientProduct.name}" không đủ tồn kho (còn ${ingredientProduct.stock} ${ingredientProduct.unit}, cần ${deductQty.toFixed(2)})`);
      }

      await tx.product.update({
        where: { id: ingredient.productId },
        data: { stock: { decrement: deductQty } },
      });

      await tx.stockMovement.create({
        data: {
          productId: ingredient.productId,
          type: 'sale',
          quantity: -deductQty,
          stockAfter: ingredientProduct.stock - deductQty,
          referenceId,
          notes: `${notePrefix} (${product.name} → ${ingredientProduct.name}, tỷ lệ ${(ratio * 100).toFixed(0)}%)`,
        },
      });
    }
    return;
  }

  // Case 2: Linked stock — deduct from linked product
  const stockProductId = product.linkedStockId || productId;
  const stockProduct = product.linkedStockId
    ? await tx.product.findUnique({ where: { id: product.linkedStockId } })
    : product;
  if (!stockProduct) return;

  if (!allowNegative && stockProduct.stock < quantity) {
    throw new Error(`Sản phẩm "${product.name}" không đủ tồn kho (còn ${stockProduct.stock} ${stockProduct.unit})`);
  }

  await tx.product.update({
    where: { id: stockProductId },
    data: { stock: { decrement: quantity } },
  });

  await tx.stockMovement.create({
    data: {
      productId: stockProductId,
      type: 'sale',
      quantity: -quantity,
      stockAfter: stockProduct.stock - quantity,
      referenceId,
      notes: `${notePrefix} (${product.linkedStockId ? product.name + ' → ' + stockProduct.name : product.name})`,
    },
  });
}

/**
 * Reverse stock deduction for a product (used in cancel/delete/edit).
 * Mirrors deductStockForProduct but adds stock back.
 */
export async function reverseStockForProduct(
  tx: TxClient,
  productId: string,
  quantity: number,
  referenceId: string,
  notePrefix: string
): Promise<void> {
  const product = await tx.product.findUnique({
    where: { id: productId },
    include: {
      blendTemplate: {
        include: {
          items: {
            include: { product: true },
          },
        },
      },
    },
  });
  if (!product) return;

  // Case 1: Blend template — reverse ingredients proportionally
  if (product.blendTemplateId && product.blendTemplate && product.blendTemplate.items.length > 0) {
    const totalTemplateQty = product.blendTemplate.items.reduce((sum, i) => sum + i.quantity, 0);
    if (totalTemplateQty <= 0) return;

    for (const ingredient of product.blendTemplate.items) {
      const ratio = ingredient.quantity / totalTemplateQty;
      const reverseQty = quantity * ratio;

      const ingredientProduct = await tx.product.findUnique({ where: { id: ingredient.productId } });
      if (!ingredientProduct) continue;

      await tx.product.update({
        where: { id: ingredient.productId },
        data: { stock: { increment: reverseQty } },
      });

      await tx.stockMovement.create({
        data: {
          productId: ingredient.productId,
          type: 'sale_cancel',
          quantity: reverseQty,
          stockAfter: ingredientProduct.stock + reverseQty,
          referenceId,
          notes: `${notePrefix} (${product.name} → ${ingredientProduct.name}, tỷ lệ ${(ratio * 100).toFixed(0)}%)`,
        },
      });
    }
    return;
  }

  // Case 2: Linked stock — reverse from linked product
  const stockProductId = product.linkedStockId || productId;
  const stockProduct = product.linkedStockId
    ? await tx.product.findUnique({ where: { id: product.linkedStockId } })
    : product;
  if (!stockProduct) return;

  await tx.product.update({
    where: { id: stockProductId },
    data: { stock: { increment: quantity } },
  });

  await tx.stockMovement.create({
    data: {
      productId: stockProductId,
      type: 'sale_cancel',
      quantity: quantity,
      stockAfter: stockProduct.stock + quantity,
      referenceId,
      notes: `${notePrefix} (${product.linkedStockId ? product.name + ' → ' + stockProduct.name : product.name})`,
    },
  });
}

/**
 * Pre-check if a product has enough stock to sell (considering blend/linked).
 */
export async function checkStockForProduct(
  tx: TxClient,
  productId: string,
  quantity: number,
  allowNegative: boolean
): Promise<void> {
  const product = await tx.product.findUnique({
    where: { id: productId },
    include: {
      blendTemplate: {
        include: {
          items: {
            include: { product: true },
          },
        },
      },
    },
  });
  if (!product) throw new Error('Sản phẩm không tồn tại');
  if (!product.isActive) throw new Error(`Sản phẩm "${product.name}" đã ngừng bán`);

  if (allowNegative) return;

  // Case 1: Blend template
  if (product.blendTemplateId && product.blendTemplate && product.blendTemplate.items.length > 0) {
    const totalTemplateQty = product.blendTemplate.items.reduce((sum, i) => sum + i.quantity, 0);
    if (totalTemplateQty <= 0) return;

    for (const ingredient of product.blendTemplate.items) {
      const ratio = ingredient.quantity / totalTemplateQty;
      const needed = quantity * ratio;
      if (ingredient.product.stock < needed) {
        throw new Error(`Nguyên liệu "${ingredient.product.name}" không đủ tồn kho (còn ${ingredient.product.stock} ${ingredient.product.unit}, cần ${needed.toFixed(2)})`);
      }
    }
    return;
  }

  // Case 2: Linked or self stock
  const stockProduct = product.linkedStockId
    ? await tx.product.findUnique({ where: { id: product.linkedStockId } })
    : product;
  if (!stockProduct) throw new Error('Sản phẩm liên kết kho không tồn tại');

  if (stockProduct.stock < quantity) {
    throw new Error(`Sản phẩm "${product.name}" không đủ tồn kho (còn ${stockProduct.stock} ${stockProduct.unit})`);
  }
}
