import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateCode } from '@/lib/utils';
import { recalcSupplierDebt } from '@/lib/debt-utils';

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Tính giá vốn bình quân đơn giản: Tổng giá trị nhập / Tổng SL nhập
async function calculateSimpleAvgCost(tx: TxClient, productId: string): Promise<number> {
  const allItems = await tx.purchaseItem.findMany({
    where: {
      productId,
      purchase: { status: 'completed' },
    },
  });
  const totalQty = allItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalValue = allItems.reduce((sum, item) => sum + item.totalPrice, 0);
  return totalQty > 0 ? totalValue / totalQty : 0;
}

async function ensureEnoughStockToReversePurchase(
  tx: TxClient,
  items: Array<{ productId: string; quantity: number }>,
  actionLabel: string
): Promise<void> {
  const quantityByProduct = new Map<string, number>();
  for (const item of items) {
    quantityByProduct.set(
      item.productId,
      (quantityByProduct.get(item.productId) || 0) + item.quantity
    );
  }

  const products = await tx.product.findMany({
    where: { id: { in: Array.from(quantityByProduct.keys()) } },
    select: { id: true, name: true, stock: true, unit: true },
  });
  const productById = new Map(products.map((product) => [product.id, product]));

  for (const [productId, quantity] of Array.from(quantityByProduct.entries())) {
    const product = productById.get(productId);
    if (!product) throw new Error('Sản phẩm trong phiếu nhập không tồn tại');

    if (product.stock < quantity) {
      throw new Error(
        `Không thể ${actionLabel}: "${product.name}" chỉ còn ${product.stock} ${product.unit}, cần trừ ${quantity} ${product.unit}`
      );
    }
  }
}

// GET - List purchases
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get('supplierId') || '';
    const where: Record<string, unknown> = {};
    if (supplierId) where.supplierId = supplierId;

    const purchases = await prisma.purchase.findMany({
      where,
      include: {
        supplier: { select: { name: true, code: true } },
        items: { include: { product: { select: { name: true, code: true, unit: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(purchases);
  } catch (error) {
    console.error('Purchases GET error:', error);
    return NextResponse.json({ error: 'Lỗi tải phiếu nhập' }, { status: 500 });
  }
}

// POST - Create purchase (TRANSACTION)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { supplierId, items, paidAmount, notes, purchaseDate } = body;

    if (!supplierId || !items || items.length === 0) {
      return NextResponse.json({ error: 'Vui lòng chọn nhà cung cấp và thêm sản phẩm' }, { status: 400 });
    }

    const lastPurchase = await prisma.purchase.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const code = generateCode('PN', lastPurchase?.code || null);

    const totalAmount = items.reduce(
      (sum: number, item: { quantity: number; unitPrice: number }) =>
        sum + item.quantity * item.unitPrice,
      0
    );
    const paid = parseFloat(paidAmount) || 0;
    const debtAmount = totalAmount - paid;

    const purchase = await prisma.$transaction(async (tx) => {
      const newPurchase = await tx.purchase.create({
        data: {
          code,
          supplierId,
          purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
          totalAmount,
          paidAmount: paid,
          debtAmount: Math.max(0, debtAmount),
          notes: notes || null,
        },
      });

      for (const item of items) {
        const { productId, quantity, unitPrice } = item;
        const qty = parseFloat(quantity);
        const price = parseFloat(unitPrice);

        await tx.purchaseItem.create({
          data: {
            purchaseId: newPurchase.id,
            productId,
            quantity: qty,
            unitPrice: price,
            totalPrice: qty * price,
          },
        });

        const product = await tx.product.findUnique({ where: { id: productId } });
        if (!product) throw new Error(`Sản phẩm không tồn tại: ${productId}`);

        // Tính giá vốn bình quân đơn giản (tổng giá trị / tổng SL tất cả phiếu nhập)
        const newCostPrice = await calculateSimpleAvgCost(tx, productId);

        await tx.product.update({
          where: { id: productId },
          data: {
            stock: { increment: qty },
            costPrice: newCostPrice,
            lastPurchasePrice: price,
          },
        });

        await tx.stockMovement.create({
          data: {
            productId,
            type: 'purchase',
            quantity: qty,
            stockAfter: product.stock + qty,
            referenceId: newPurchase.id,
            notes: `Nhập hàng - ${code}`,
          },
        });
      }

      // Supplier debt — tính lại từ nguồn
      await recalcSupplierDebt(tx, supplierId);

      return newPurchase;
    });

    return NextResponse.json(purchase, { status: 201 });
  } catch (error) {
    console.error('Purchases POST error:', error);
    const message = error instanceof Error ? error.message : 'Lỗi tạo phiếu nhập';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT - Full edit purchase OR Cancel purchase
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, action } = body;

    // --- Full edit ---
    if (action === 'edit') {
      const { purchaseDate, notes, supplierId, items, paidAmount } = body;

      const purchase = await prisma.purchase.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!purchase) return NextResponse.json({ error: 'Không tìm thấy phiếu nhập' }, { status: 404 });
      if (purchase.status === 'cancelled') return NextResponse.json({ error: 'Không thể sửa phiếu đã hủy' }, { status: 400 });

      // Simple edit (no items)
      if (!items) {
        const updateData: Record<string, unknown> = {};
        if (purchaseDate) updateData.purchaseDate = new Date(purchaseDate);
        if (notes !== undefined) updateData.notes = notes || null;
        if (supplierId) updateData.supplierId = supplierId;
        await prisma.purchase.update({ where: { id }, data: updateData });
        return NextResponse.json({ success: true });
      }

      // Full edit with items → reverse old + apply new
      await prisma.$transaction(async (tx) => {
        const affectedProductIds = new Set<string>(purchase.items.map((item) => item.productId));

        // 1. REVERSE old stock
        for (const oldItem of purchase.items) {
          await tx.product.update({
            where: { id: oldItem.productId },
            data: { stock: { decrement: oldItem.quantity } },
          });
        }

        // 2. Delete old items & related records (debt tính lại ở cuối)
        await tx.debtTransaction.deleteMany({ where: { purchaseId: id } });
        await tx.stockMovement.deleteMany({ where: { referenceId: id } });
        await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });

        // 4. Re-calculate
        const newSupplierId = supplierId || purchase.supplierId;
        const totalAmount = items.reduce(
          (sum: number, item: { quantity: string; unitPrice: string }) =>
            sum + parseFloat(item.quantity) * parseFloat(item.unitPrice), 0
        );
        const paid = parseFloat(paidAmount) || 0;
        const debtAmount = Math.max(0, totalAmount - paid);

        // 5. Update purchase
        await tx.purchase.update({
          where: { id },
          data: {
            supplierId: newSupplierId,
            purchaseDate: purchaseDate ? new Date(purchaseDate) : purchase.purchaseDate,
            totalAmount,
            paidAmount: paid,
            debtAmount,
            notes: notes !== undefined ? (notes || null) : purchase.notes,
          },
        });

        // 6. Create new items + add stock
        for (const item of items) {
          const qty = parseFloat(item.quantity);
          const price = parseFloat(item.unitPrice);
          affectedProductIds.add(item.productId);

          await tx.purchaseItem.create({
            data: {
              purchaseId: id,
              productId: item.productId,
              quantity: qty,
              unitPrice: price,
              totalPrice: qty * price,
            },
          });

          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product) throw new Error('Sản phẩm không tồn tại');

          // Tính giá vốn bình quân đơn giản
          const newCostPrice = await calculateSimpleAvgCost(tx, item.productId);

          await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: { increment: qty },
              costPrice: newCostPrice,
              lastPurchasePrice: price,
            },
          });

          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              type: 'purchase',
              quantity: qty,
              stockAfter: product.stock + qty,
              referenceId: id,
              notes: `Sửa phiếu nhập - ${purchase.code}`,
            },
          });
        }

        for (const productId of Array.from(affectedProductIds)) {
          const costPrice = await calculateSimpleAvgCost(tx, productId);
          await tx.product.update({
            where: { id: productId },
            data: { costPrice },
          });
        }

        // 7. Recalc supplier debt từ nguồn
        if (purchase.supplierId !== newSupplierId) {
          await recalcSupplierDebt(tx, purchase.supplierId);
        }
        await recalcSupplierDebt(tx, newSupplierId);
      });

      return NextResponse.json({ success: true });
    }

    // --- Cancel purchase ---
    if (action === 'cancel') {
      const purchase = await prisma.purchase.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!purchase) return NextResponse.json({ error: 'Không tìm thấy phiếu nhập' }, { status: 404 });
      if (purchase.status === 'cancelled') return NextResponse.json({ error: 'Phiếu đã bị hủy' }, { status: 400 });

      await prisma.$transaction(async (tx) => {
        await ensureEnoughStockToReversePurchase(tx, purchase.items, `hủy phiếu nhập ${purchase.code}`);

        await tx.purchase.update({ where: { id }, data: { status: 'cancelled' } });

        for (const item of purchase.items) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product) continue;

          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
          });

          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              type: 'purchase_cancel',
              quantity: -item.quantity,
              stockAfter: product.stock - item.quantity,
              referenceId: id,
              notes: `Hủy phiếu nhập - ${purchase.code}`,
            },
          });

          const costPrice = await calculateSimpleAvgCost(tx, item.productId);
          await tx.product.update({
            where: { id: item.productId },
            data: { costPrice },
          });
        }

        // Recalc supplier debt từ nguồn
        await recalcSupplierDebt(tx, purchase.supplierId);
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 });
  } catch (error) {
    console.error('Purchases PUT error:', error);
    const message = error instanceof Error ? error.message : 'Lỗi cập nhật phiếu nhập';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE - Delete purchase (reverse + hard delete)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Thiếu ID' }, { status: 400 });

    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!purchase) return NextResponse.json({ error: 'Không tìm thấy phiếu nhập' }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      if (purchase.status === 'completed') {
        await ensureEnoughStockToReversePurchase(tx, purchase.items, `xóa phiếu nhập ${purchase.code}`);

        for (const item of purchase.items) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product) continue;

          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
          });

          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              type: 'purchase_cancel',
              quantity: -item.quantity,
              stockAfter: product.stock - item.quantity,
              referenceId: id,
              notes: `Xóa phiếu nhập - ${purchase.code}`,
            },
          });
        }
      }

      // Delete related records then purchase
      await tx.debtTransaction.deleteMany({ where: { purchaseId: id } });
      await tx.stockMovement.deleteMany({ where: { referenceId: id } });
      await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });
      await tx.purchase.delete({ where: { id } });

      for (const item of purchase.items) {
        const costPrice = await calculateSimpleAvgCost(tx, item.productId);
        await tx.product.update({
          where: { id: item.productId },
          data: { costPrice },
        });
      }

      // Recalc supplier debt
      await recalcSupplierDebt(tx, purchase.supplierId);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Purchases DELETE error:', error);
    const message = error instanceof Error ? error.message : 'Lỗi xóa phiếu nhập';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
