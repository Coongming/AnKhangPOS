import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateCodeInTx } from '@/lib/utils';
import { recalcSupplierDebt } from '@/lib/debt-utils';
import {
  assertStockAfterReferenceReplacement,
  getRecordedStockImpact,
  reverseRecordedStockImpact,
} from '@/lib/stock-operations';
import {
  isValidationError,
  validatePositiveNumber,
  ValidationError,
} from '@/lib/validation';

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

type PurchaseItemInput = {
  productId: string;
  quantity: unknown;
  unitPrice: unknown;
};

type ProcessedPurchaseItem = {
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

function parseDate(value: unknown, fallback: Date): Date {
  if (!value) return fallback;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError('Ngày phiếu nhập không hợp lệ');
  }
  return date;
}

function processPurchaseItems(items: PurchaseItemInput[]): {
  items: ProcessedPurchaseItem[];
  totalAmount: number;
} {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ValidationError('Vui lòng thêm sản phẩm vào phiếu nhập');
  }

  const productIds = new Set<string>();
  const processedItems = items.map((item) => {
    if (!item.productId) throw new ValidationError('Sản phẩm không hợp lệ');
    if (productIds.has(item.productId)) {
      throw new ValidationError('Một sản phẩm chỉ được xuất hiện một lần trong phiếu nhập');
    }
    productIds.add(item.productId);

    const quantity = validatePositiveNumber(item.quantity, 'Số lượng');
    const unitPrice = validatePositiveNumber(item.unitPrice, 'Đơn giá');
    if (quantity <= 0) throw new ValidationError('Số lượng phải lớn hơn 0');

    return {
      productId: item.productId,
      quantity,
      unitPrice,
      totalPrice: quantity * unitPrice,
    };
  });

  return {
    items: processedItems,
    totalAmount: processedItems.reduce((sum, item) => sum + item.totalPrice, 0),
  };
}

function groupPurchaseImpact(
  items: Array<{ productId: string; quantity: unknown }>
): Map<string, number> {
  const impact = new Map<string, number>();
  for (const item of items) {
    impact.set(
      item.productId,
      (impact.get(item.productId) || 0) + Number(item.quantity)
    );
  }
  return impact;
}

async function refreshProductPurchaseCost(
  tx: TxClient,
  productId: string
): Promise<void> {
  const [allItems, latestItem] = await Promise.all([
    tx.purchaseItem.findMany({
      where: {
        productId,
        purchase: { status: 'completed' },
      },
      select: { quantity: true, totalPrice: true },
    }),
    tx.purchaseItem.findFirst({
      where: {
        productId,
        purchase: { status: 'completed' },
      },
      select: { unitPrice: true },
      orderBy: [
        { purchase: { purchaseDate: 'desc' } },
        { purchase: { createdAt: 'desc' } },
        { createdAt: 'desc' },
      ],
    }),
  ]);

  const totalQuantity = allItems.reduce(
    (sum, item) => sum + Number(item.quantity),
    0
  );
  const totalValue = allItems.reduce(
    (sum, item) => sum + Number(item.totalPrice),
    0
  );

  await tx.product.update({
    where: { id: productId },
    data: {
      costPrice: totalQuantity > 0 ? totalValue / totalQuantity : 0,
      lastPurchasePrice: latestItem?.unitPrice ?? null,
    },
  });
}

async function refreshSupplierDebts(
  tx: TxClient,
  supplierIds: string[]
): Promise<void> {
  for (const supplierId of Array.from(new Set(supplierIds))) {
    await recalcSupplierDebt(tx, supplierId);
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
        items: {
          include: {
            product: { select: { name: true, code: true, unit: true } },
          },
        },
      },
      orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }],
    });
    return NextResponse.json(purchases);
  } catch (error) {
    console.error('Purchases GET error:', error);
    return NextResponse.json({ error: 'Lỗi tải phiếu nhập' }, { status: 500 });
  }
}

// POST - Create purchase
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { supplierId, paidAmount, notes, purchaseDate } = body;
    if (!supplierId) {
      return NextResponse.json(
        { error: 'Vui lòng chọn nhà cung cấp' },
        { status: 400 }
      );
    }

    const processed = processPurchaseItems(body.items);
    const paid = validatePositiveNumber(paidAmount || 0, 'Số tiền trả');
    const debtAmount = processed.totalAmount - paid;

    const purchase = await prisma.$transaction(async (tx) => {
      const code = await generateCodeInTx(tx, 'PN', 'purchase');
      const supplier = await tx.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true },
      });
      if (!supplier) throw new ValidationError('Nhà cung cấp không tồn tại');

      const newPurchase = await tx.purchase.create({
        data: {
          code,
          supplierId,
          purchaseDate: parseDate(purchaseDate, new Date()),
          totalAmount: processed.totalAmount,
          paidAmount: paid,
          debtAmount,
          notes: notes || null,
        },
      });

      const affectedProductIds = new Set<string>();
      for (const item of processed.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: { id: true },
        });
        if (!product) throw new ValidationError('Sản phẩm không tồn tại');

        await tx.purchaseItem.create({
          data: {
            purchaseId: newPurchase.id,
            ...item,
          },
        });

        const updatedProduct = await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
          select: { stock: true },
        });
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            type: 'purchase',
            quantity: item.quantity,
            stockAfter: updatedProduct.stock,
            referenceId: newPurchase.id,
            notes: `Nhập hàng - ${code}`,
          },
        });
        affectedProductIds.add(item.productId);
      }

      for (const productId of Array.from(affectedProductIds)) {
        await refreshProductPurchaseCost(tx, productId);
      }
      await recalcSupplierDebt(tx, supplierId);

      return newPurchase;
    });

    return NextResponse.json(purchase, { status: 201 });
  } catch (error) {
    console.error('Purchases POST error:', error);
    const message = error instanceof Error ? error.message : 'Lỗi tạo phiếu nhập';
    return NextResponse.json(
      { error: message },
      { status: isValidationError(error) ? 400 : 500 }
    );
  }
}

// PUT - Edit or cancel purchase
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, action } = body;
    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID phiếu nhập' }, { status: 400 });
    }

    if (action === 'edit') {
      const purchase = await prisma.purchase.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!purchase) {
        return NextResponse.json({ error: 'Không tìm thấy phiếu' }, { status: 404 });
      }
      if (purchase.status === 'cancelled') {
        return NextResponse.json(
          { error: 'Không thể sửa phiếu đã hủy' },
          { status: 400 }
        );
      }

      const { purchaseDate, notes, supplierId, items, paidAmount } = body;
      const newSupplierId = supplierId || purchase.supplierId;

      if (!items) {
        await prisma.$transaction(async (tx) => {
          await tx.purchase.update({
            where: { id },
            data: {
              purchaseDate: parseDate(purchaseDate, purchase.purchaseDate),
              notes: notes === undefined ? purchase.notes : (notes || null),
              supplierId: newSupplierId,
            },
          });
          await refreshSupplierDebts(
            tx,
            [purchase.supplierId, newSupplierId]
          );
        });
        return NextResponse.json({ success: true });
      }

      const processed = processPurchaseItems(items);
      const paid = validatePositiveNumber(paidAmount || 0, 'Số tiền trả');
      const debtAmount = processed.totalAmount - paid;

      await prisma.$transaction(async (tx) => {
        const supplier = await tx.supplier.findUnique({
          where: { id: newSupplierId },
          select: { id: true },
        });
        if (!supplier) throw new ValidationError('Nhà cung cấp không tồn tại');

        let oldImpact = await getRecordedStockImpact(tx, id);
        if (oldImpact.size === 0) {
          oldImpact = groupPurchaseImpact(purchase.items);
        }
        const newImpact = groupPurchaseImpact(processed.items);
        await assertStockAfterReferenceReplacement(
          tx,
          oldImpact,
          newImpact,
          `sửa phiếu ${purchase.code}`
        );
        await reverseRecordedStockImpact(
          tx,
          oldImpact,
          id,
          'purchase_edit_reverse',
          `Sửa phiếu nhập (hoàn tác) - ${purchase.code}`
        );

        await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });

        await tx.purchase.update({
          where: { id },
          data: {
            supplierId: newSupplierId,
            purchaseDate: parseDate(purchaseDate, purchase.purchaseDate),
            totalAmount: processed.totalAmount,
            paidAmount: paid,
            debtAmount,
            notes: notes === undefined ? purchase.notes : (notes || null),
          },
        });

        const affectedProductIds = new Set([
          ...Array.from(oldImpact.keys()),
          ...Array.from(newImpact.keys()),
        ]);

        for (const item of processed.items) {
          await tx.purchaseItem.create({
            data: {
              purchaseId: id,
              ...item,
            },
          });
          const updatedProduct = await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
            select: { stock: true },
          });
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              type: 'purchase',
              quantity: item.quantity,
              stockAfter: updatedProduct.stock,
              referenceId: id,
              notes: `Sửa phiếu nhập - ${purchase.code}`,
            },
          });
        }

        for (const productId of Array.from(affectedProductIds)) {
          await refreshProductPurchaseCost(tx, productId);
        }
        await refreshSupplierDebts(
          tx,
          [purchase.supplierId, newSupplierId]
        );
      });

      return NextResponse.json({ success: true });
    }

    if (action === 'cancel') {
      const purchase = await prisma.purchase.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!purchase) {
        return NextResponse.json({ error: 'Không tìm thấy phiếu' }, { status: 404 });
      }
      if (purchase.status === 'cancelled') {
        return NextResponse.json({ error: 'Phiếu đã bị hủy' }, { status: 400 });
      }

      await prisma.$transaction(async (tx) => {
        let oldImpact = await getRecordedStockImpact(tx, id);
        if (oldImpact.size === 0) {
          oldImpact = groupPurchaseImpact(purchase.items);
        }
        await assertStockAfterReferenceReplacement(
          tx,
          oldImpact,
          new Map(),
          `hủy phiếu ${purchase.code}`
        );
        await reverseRecordedStockImpact(
          tx,
          oldImpact,
          id,
          'purchase_cancel',
          `Hủy phiếu nhập - ${purchase.code}`
        );
        await tx.purchase.update({
          where: { id },
          data: { status: 'cancelled' },
        });

        for (const productId of Array.from(oldImpact.keys())) {
          await refreshProductPurchaseCost(tx, productId);
        }
        await recalcSupplierDebt(tx, purchase.supplierId);
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 });
  } catch (error) {
    console.error('Purchases PUT error:', error);
    const message = error instanceof Error ? error.message : 'Lỗi cập nhật phiếu nhập';
    return NextResponse.json(
      { error: message },
      { status: isValidationError(error) ? 400 : 500 }
    );
  }
}

// DELETE - Delete purchase and retain stock audit movements
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID' }, { status: 400 });
    }

    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!purchase) {
      return NextResponse.json({ error: 'Không tìm thấy phiếu' }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      let oldImpact = new Map<string, number>();
      if (purchase.status === 'completed') {
        oldImpact = await getRecordedStockImpact(tx, id);
        if (oldImpact.size === 0) {
          oldImpact = groupPurchaseImpact(purchase.items);
        }
        await assertStockAfterReferenceReplacement(
          tx,
          oldImpact,
          new Map(),
          `xóa phiếu ${purchase.code}`
        );
        await reverseRecordedStockImpact(
          tx,
          oldImpact,
          id,
          'purchase_delete_reverse',
          `Xóa phiếu nhập - ${purchase.code}`
        );
      }

      await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });
      await tx.purchase.delete({ where: { id } });

      const affectedProductIds = oldImpact.size > 0
        ? Array.from(oldImpact.keys())
        : Array.from(new Set(purchase.items.map((item) => item.productId)));
      for (const productId of affectedProductIds) {
        await refreshProductPurchaseCost(tx, productId);
      }
      await recalcSupplierDebt(tx, purchase.supplierId);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Purchases DELETE error:', error);
    const message = error instanceof Error ? error.message : 'Lỗi xóa phiếu nhập';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
