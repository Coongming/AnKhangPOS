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
    const totalTemplateQty = product.blendTemplate.items.reduce((sum, i) => sum + Number(i.quantity), 0);
    if (totalTemplateQty <= 0) return;

    for (const ingredient of product.blendTemplate.items) {
      const ratio = Number(ingredient.quantity) / totalTemplateQty;
      const deductQty = quantity * ratio;

      const ingredientProduct = await tx.product.findUnique({ where: { id: ingredient.productId } });
      if (!ingredientProduct) continue;

      if (!allowNegative && Number(ingredientProduct.stock) < deductQty) {
        throw new Error(`Nguyên liệu "${ingredientProduct.name}" không đủ tồn kho (còn ${ingredientProduct.stock} ${ingredientProduct.unit}, cần ${deductQty.toFixed(2)})`);
      }

      const updatedIngredient = await tx.product.update({
        where: { id: ingredient.productId },
        data: { stock: { decrement: deductQty } },
        select: { stock: true },
      });

      await tx.stockMovement.create({
        data: {
          productId: ingredient.productId,
          type: 'sale',
          quantity: -deductQty,
          stockAfter: updatedIngredient.stock,
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

  if (!allowNegative && Number(stockProduct.stock) < quantity) {
    throw new Error(`Sản phẩm "${product.name}" không đủ tồn kho (còn ${stockProduct.stock} ${stockProduct.unit})`);
  }

  const updatedStockProduct = await tx.product.update({
    where: { id: stockProductId },
    data: { stock: { decrement: quantity } },
    select: { stock: true },
  });

  await tx.stockMovement.create({
    data: {
      productId: stockProductId,
      type: 'sale',
      quantity: -quantity,
      stockAfter: updatedStockProduct.stock,
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
    const totalTemplateQty = product.blendTemplate.items.reduce((sum, i) => sum + Number(i.quantity), 0);
    if (totalTemplateQty <= 0) return;

    for (const ingredient of product.blendTemplate.items) {
      const ratio = Number(ingredient.quantity) / totalTemplateQty;
      const reverseQty = quantity * ratio;

      const ingredientProduct = await tx.product.findUnique({ where: { id: ingredient.productId } });
      if (!ingredientProduct) continue;

      const updatedIngredient = await tx.product.update({
        where: { id: ingredient.productId },
        data: { stock: { increment: reverseQty } },
        select: { stock: true },
      });

      await tx.stockMovement.create({
        data: {
          productId: ingredient.productId,
          type: 'sale_cancel',
          quantity: reverseQty,
          stockAfter: updatedIngredient.stock,
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

  const updatedStockProduct = await tx.product.update({
    where: { id: stockProductId },
    data: { stock: { increment: quantity } },
    select: { stock: true },
  });

  await tx.stockMovement.create({
    data: {
      productId: stockProductId,
      type: 'sale_cancel',
      quantity: quantity,
      stockAfter: updatedStockProduct.stock,
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
    const totalTemplateQty = product.blendTemplate.items.reduce((sum, i) => sum + Number(i.quantity), 0);
    if (totalTemplateQty <= 0) return;

    for (const ingredient of product.blendTemplate.items) {
      const ratio = Number(ingredient.quantity) / totalTemplateQty;
      const needed = quantity * ratio;
      if (Number(ingredient.product.stock) < needed) {
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

  if (Number(stockProduct.stock) < quantity) {
    throw new Error(`Sản phẩm "${product.name}" không đủ tồn kho (còn ${stockProduct.stock} ${stockProduct.unit})`);
  }
}

export async function calculateSaleCostPrice(tx: TxClient, productId: string): Promise<number> {
  const product = await tx.product.findUnique({
    where: { id: productId },
    include: {
      blendTemplate: {
        include: {
          items: {
            include: {
              product: {
                select: { costPrice: true },
              },
            },
          },
        },
      },
    },
  });

  if (!product) throw new Error('Sản phẩm không tồn tại');

  if (product.blendTemplate && product.blendTemplate.items.length > 0) {
    const totalQuantity = product.blendTemplate.items.reduce(
      (sum, item) => sum + Number(item.quantity),
      0
    );
    if (totalQuantity > 0) {
      return product.blendTemplate.items.reduce(
        (sum, item) =>
          sum + (Number(item.quantity) / totalQuantity) * Number(item.product.costPrice),
        0
      );
    }
  }

  if (product.linkedStockId) {
    const linkedProduct = await tx.product.findUnique({
      where: { id: product.linkedStockId },
      select: { costPrice: true },
    });
    if (!linkedProduct) throw new Error('Sản phẩm liên kết kho không tồn tại');
    return Number(linkedProduct.costPrice);
  }

  return Number(product.costPrice);
}

export async function getRecordedStockImpact(
  tx: TxClient,
  referenceId: string
): Promise<Map<string, number>> {
  const movements = await tx.stockMovement.findMany({
    where: { referenceId },
    select: { productId: true, quantity: true },
  });
  const impact = new Map<string, number>();

  for (const movement of movements) {
    impact.set(
      movement.productId,
      (impact.get(movement.productId) || 0) + Number(movement.quantity)
    );
  }

  for (const [productId, quantity] of Array.from(impact.entries())) {
    if (Math.abs(quantity) < 0.005) impact.delete(productId);
  }

  return impact;
}

export async function assertStockAfterReferenceReplacement(
  tx: TxClient,
  currentImpact: Map<string, number>,
  replacementImpact: Map<string, number>,
  actionLabel: string
): Promise<void> {
  const productIds = Array.from(new Set([
    ...Array.from(currentImpact.keys()),
    ...Array.from(replacementImpact.keys()),
  ]));
  if (productIds.length === 0) return;

  const products = await tx.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, unit: true, stock: true },
  });

  for (const product of products) {
    const finalStock =
      Number(product.stock) -
      (currentImpact.get(product.id) || 0) +
      (replacementImpact.get(product.id) || 0);

    if (finalStock < -0.005) {
      throw new Error(
        `Không thể ${actionLabel}: "${product.name}" sẽ còn ${finalStock.toFixed(2)} ${product.unit}`
      );
    }
  }
}

export async function reverseRecordedStockImpact(
  tx: TxClient,
  impact: Map<string, number>,
  referenceId: string,
  movementType: string,
  notes: string
): Promise<boolean> {
  if (impact.size === 0) return false;

  for (const [productId, quantity] of Array.from(impact.entries())) {
    const reverseQuantity = -quantity;
    const updatedProduct = await tx.product.update({
      where: { id: productId },
      data: reverseQuantity >= 0
        ? { stock: { increment: reverseQuantity } }
        : { stock: { decrement: Math.abs(reverseQuantity) } },
      select: { stock: true },
    });

    await tx.stockMovement.create({
      data: {
        productId,
        type: movementType,
        quantity: reverseQuantity,
        stockAfter: updatedProduct.stock,
        referenceId,
        notes,
      },
    });
  }

  return true;
}
