import { prisma } from '@/lib/prisma';

/**
 * For products with blendTemplateId, calculate virtual stock from ingredients.
 * Virtual stock = min(ingredient_stock / ingredient_ratio) for all ingredients.
 * Mutates the products array in-place, setting the `stock` field.
 */
export async function applyBlendVirtualStock(
  products: Array<{ id: string; stock: number; blendTemplateId?: string | null; linkedStockId?: string | null }>
) {
  const blendProducts = products.filter((p) => p.blendTemplateId);
  if (blendProducts.length === 0) return;

  const templateIds = Array.from(new Set(blendProducts.map((p) => p.blendTemplateId as string)));

  const templates = await prisma.blendTemplate.findMany({
    where: { id: { in: templateIds } },
    include: {
      items: {
        include: {
          product: { select: { id: true, stock: true } },
        },
      },
    },
  });

  const templateMap = new Map(templates.map((t) => [t.id, t]));

  for (const product of blendProducts) {
    const template = templateMap.get(product.blendTemplateId!);
    if (!template || template.items.length === 0) {
      product.stock = 0;
      continue;
    }

    const totalTemplateQty = template.items.reduce((sum, i) => sum + i.quantity, 0);
    if (totalTemplateQty <= 0) {
      product.stock = 0;
      continue;
    }

    // For each ingredient, max possible output = ingredient_stock / (ingredient_qty / total_qty)
    // = ingredient_stock * total_qty / ingredient_qty
    // Virtual stock = min of all these
    let minOutput = Infinity;
    for (const item of template.items) {
      if (item.quantity <= 0) continue;
      const ratio = item.quantity / totalTemplateQty;
      const possibleOutput = item.product.stock / ratio;
      minOutput = Math.min(minOutput, possibleOutput);
    }

    product.stock = minOutput === Infinity ? 0 : Math.floor(minOutput * 100) / 100;
  }
}
