import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applyBlendVirtualStock } from '@/lib/blend-stock';

// GET - Stock movements + current stock
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId') || '';
    const type = searchParams.get('type') || ''; // purchase, sale, adjustment, etc.

    if (productId) {
      // Get movements for a specific product
      const where: Record<string, unknown> = { productId };
      if (type) where.type = type;

      const [movements, product] = await Promise.all([
        prisma.stockMovement.findMany({
          where,
          include: { product: { select: { name: true, code: true, unit: true } } },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        prisma.product.findUnique({
          where: { id: productId },
          select: { stock: true },
        }),
      ]);

      // Tính lại stockAfter động từ tồn kho hiện tại
      // Đi từ mới→cũ: stockAfter[0] = currentStock, stockAfter[i] = stockAfter[i-1] - qty[i-1]
      if (product) {
        let runningStock = product.stock;
        for (const m of movements) {
          m.stockAfter = runningStock;
          runningStock -= m.quantity;
        }
      }

      return NextResponse.json(movements);
    }

    // Get all products with stock info
    const products = await prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true, code: true, name: true, unit: true,
        stock: true, minStock: true, costPrice: true, salePrice: true,
        linkedStockId: true, blendTemplateId: true,
        category: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Replace stock with linked product's stock
    const linkedIds = products
      .filter((p) => p.linkedStockId)
      .map((p) => p.linkedStockId as string);

    if (linkedIds.length > 0) {
      const linkedProducts = await prisma.product.findMany({
        where: { id: { in: linkedIds } },
        select: { id: true, stock: true },
      });
      const linkedStockMap = new Map(linkedProducts.map((p) => [p.id, p.stock]));

      for (const product of products) {
        if (product.linkedStockId && linkedStockMap.has(product.linkedStockId)) {
          product.stock = linkedStockMap.get(product.linkedStockId)!;
        }
      }
    }

    // Calculate virtual stock for blend products
    await applyBlendVirtualStock(products);

    return NextResponse.json(products);
  } catch (error) {
    console.error('Stock GET error:', error);
    return NextResponse.json({ error: 'Lỗi tải tồn kho' }, { status: 500 });
  }
}

// POST - Stock adjustment (kiểm kê)
export async function POST(request: NextRequest) {
  try {
    const { productId, actualStock, notes } = await request.json();
    if (!productId || actualStock === undefined) {
      return NextResponse.json({ error: 'Thiếu thông tin' }, { status: 400 });
    }

    const actual = parseFloat(actualStock);
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return NextResponse.json({ error: 'Sản phẩm không tồn tại' }, { status: 404 });

    // Blend template products have virtual stock — cannot adjust directly
    if (product.blendTemplateId) {
      return NextResponse.json({ error: `Sản phẩm "${product.name}" dùng mẫu trộn, tồn kho tính ảo từ nguyên liệu. Hãy chỉnh kho từng nguyên liệu.` }, { status: 400 });
    }

    // If product has linkedStockId, adjust the linked product's stock instead
    const targetProductId = product.linkedStockId || productId;
    const targetProduct = product.linkedStockId
      ? await prisma.product.findUnique({ where: { id: product.linkedStockId } })
      : product;
    if (!targetProduct) return NextResponse.json({ error: 'Sản phẩm liên kết kho không tồn tại' }, { status: 404 });

    const diff = actual - targetProduct.stock;
    if (diff === 0) return NextResponse.json({ message: 'Không có thay đổi' });

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: targetProductId },
        data: { stock: actual },
      });

      await tx.stockMovement.create({
        data: {
          productId: targetProductId,
          type: 'adjustment',
          quantity: diff,
          stockAfter: actual,
          notes: notes || `Điều chỉnh kiểm kê: ${targetProduct.stock} → ${actual}${product.linkedStockId ? ` (từ ${product.name})` : ''}`,
        },
      });
    });

    return NextResponse.json({ success: true, diff });
  } catch (error) {
    console.error('Stock adjustment error:', error);
    return NextResponse.json({ error: 'Lỗi điều chỉnh tồn kho' }, { status: 500 });
  }
}
