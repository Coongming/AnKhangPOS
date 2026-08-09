import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateCodeInTx } from '@/lib/code-sequence';
import { recalcSupplierDebt } from '@/lib/debt-utils';
import { syncPurchasePayment } from '@/lib/supplier-payments';
import {
  assertStockAfterReferenceReplacement,
  getRecordedStockImpact,
  reverseRecordedStockImpact,
} from '@/lib/stock-operations';
import {
  applyStockMovement,
  createStockOperationId,
  deleteReferenceStockHistory,
} from '@/lib/stock-ledger';
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
): Promise<Map<string, number>> {
  const balances = new Map<string, number>();
  for (const supplierId of Array.from(new Set(supplierIds)).sort()) {
    balances.set(supplierId, await recalcSupplierDebt(tx, supplierId));
  }
  return balances;
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

    const purchase = await prisma.$transaction(async (tx) => {
      const code = await generateCodeInTx(tx, 'PN');
      const supplier = await tx.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true },
      });
      if (!supplier) throw new ValidationError('Nhà cung cấp không tồn tại');

      const parsedPurchaseDate = parseDate(purchaseDate, new Date());
      const newPurchase = await tx.purchase.create({
        data: {
          code,
          supplierId,
          purchaseDate: parsedPurchaseDate,
          totalAmount: processed.totalAmount,
          paidAmount: paid,
          debtAmount: processed.totalAmount,
          notes: notes || null,
          stockVersion: 1,
        },
      });

      const stockContext = {
        operationId: createStockOperationId(),
        documentVersion: 1,
        documentDate: parsedPurchaseDate,
      };

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

        await applyStockMovement(tx, {
          ...stockContext,
          productId: item.productId,
          type: 'purchase',
          quantity: item.quantity,
          referenceId: newPurchase.id,
          notes: `Nhập hàng - ${code}`,
        });
        affectedProductIds.add(item.productId);
      }

      for (const productId of Array.from(affectedProductIds)) {
        await refreshProductPurchaseCost(tx, productId);
      }
      const paymentId = await syncPurchasePayment(tx, {
        id: newPurchase.id,
        code,
        supplierId,
        purchaseDate: parsedPurchaseDate,
        paidAmount: paid,
      });
      const supplierDebt = await recalcSupplierDebt(tx, supplierId);
      if (paymentId) {
        await tx.debtTransaction.update({
          where: { id: paymentId },
          data: { balanceAfter: supplierDebt },
        });
      }

      return tx.purchase.findUniqueOrThrow({ where: { id: newPurchase.id } });
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
      const parsedPurchaseDate = parseDate(purchaseDate, purchase.purchaseDate);

      if (!items) {
        await prisma.$transaction(async (tx) => {
          const supplier = await tx.supplier.findUnique({
            where: { id: newSupplierId },
            select: { id: true },
          });
          if (!supplier) throw new ValidationError('Nhà cung cấp không tồn tại');

          await tx.purchase.update({
            where: { id },
            data: {
              purchaseDate: parsedPurchaseDate,
              notes: notes === undefined ? purchase.notes : (notes || null),
              supplierId: newSupplierId,
            },
          });
          const paymentId = await syncPurchasePayment(tx, {
            id: purchase.id,
            code: purchase.code,
            supplierId: newSupplierId,
            purchaseDate: parsedPurchaseDate,
            paidAmount: Number(purchase.paidAmount),
          });
          const balances = await refreshSupplierDebts(
            tx,
            [purchase.supplierId, newSupplierId]
          );
          if (paymentId) {
            await tx.debtTransaction.update({
              where: { id: paymentId },
              data: { balanceAfter: balances.get(newSupplierId) || 0 },
            });
          }
        });
        return NextResponse.json({ success: true });
      }

      const processed = processPurchaseItems(items);
      const paid = validatePositiveNumber(paidAmount || 0, 'Số tiền trả');

      await prisma.$transaction(async (tx) => {
        const supplier = await tx.supplier.findUnique({
          where: { id: newSupplierId },
          select: { id: true },
        });
        if (!supplier) throw new ValidationError('Nhà cung cấp không tồn tại');

        const oldImpact = await getRecordedStockImpact(tx, id);
        if (oldImpact.size === 0 && purchase.items.length > 0) {
          throw new ValidationError(`Phiếu ${purchase.code} thiếu lịch sử kho. Hãy rebuild sổ kho trước khi sửa.`);
        }
        const newImpact = groupPurchaseImpact(processed.items);
        const currentStockVersion = Math.max(1, purchase.stockVersion);
        const nextStockVersion = currentStockVersion + 1;
        const operationId = createStockOperationId();
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
          `Sửa phiếu nhập (hoàn tác) - ${purchase.code}`,
          {
            operationId,
            documentVersion: currentStockVersion,
            documentDate: purchase.purchaseDate,
          }
        );

        await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });

        await tx.purchase.update({
          where: { id },
          data: {
            supplierId: newSupplierId,
            purchaseDate: parsedPurchaseDate,
            totalAmount: processed.totalAmount,
            paidAmount: paid,
            debtAmount: processed.totalAmount,
            notes: notes === undefined ? purchase.notes : (notes || null),
            stockVersion: nextStockVersion,
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
          await applyStockMovement(tx, {
            operationId,
            documentVersion: nextStockVersion,
            documentDate: parsedPurchaseDate,
            productId: item.productId,
            type: 'purchase',
            quantity: item.quantity,
            referenceId: id,
            notes: `Sửa phiếu nhập - ${purchase.code}`,
          });
        }

        for (const productId of Array.from(affectedProductIds)) {
          await refreshProductPurchaseCost(tx, productId);
        }
        const paymentId = await syncPurchasePayment(tx, {
          id: purchase.id,
          code: purchase.code,
          supplierId: newSupplierId,
          purchaseDate: parsedPurchaseDate,
          paidAmount: paid,
        });
        const balances = await refreshSupplierDebts(
          tx,
          [purchase.supplierId, newSupplierId]
        );
        if (paymentId) {
          await tx.debtTransaction.update({
            where: { id: paymentId },
            data: { balanceAfter: balances.get(newSupplierId) || 0 },
          });
        }
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
        const oldImpact = await getRecordedStockImpact(tx, id);
        if (oldImpact.size === 0 && purchase.items.length > 0) {
          throw new ValidationError(`Phiếu ${purchase.code} thiếu lịch sử kho. Hãy rebuild sổ kho trước khi hủy.`);
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
          `Hủy phiếu nhập - ${purchase.code}`,
          {
            operationId: createStockOperationId(),
            documentVersion: Math.max(1, purchase.stockVersion),
            documentDate: purchase.purchaseDate,
          }
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

// DELETE - Delete the purchase and all of its stock history
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
      let affectedProductIds = new Set<string>();
      if (purchase.status === 'completed') {
        const oldImpact = await getRecordedStockImpact(tx, id);
        if (oldImpact.size === 0 && purchase.items.length > 0) {
          throw new ValidationError(`Phiếu ${purchase.code} thiếu lịch sử kho. Hãy rebuild sổ kho trước khi xóa.`);
        }
        await assertStockAfterReferenceReplacement(
          tx,
          oldImpact,
          new Map(),
          `xóa phiếu ${purchase.code}`
        );
        affectedProductIds = await deleteReferenceStockHistory(tx, id);
      } else {
        affectedProductIds = await deleteReferenceStockHistory(tx, id);
      }

      await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });
      await tx.purchase.delete({ where: { id } });

      for (const productId of Array.from(new Set([
        ...Array.from(affectedProductIds),
        ...purchase.items.map((item) => item.productId),
      ]))) {
        await refreshProductPurchaseCost(tx, productId);
      }
      await recalcSupplierDebt(tx, purchase.supplierId);
    }, { maxWait: 10_000, timeout: 30_000 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Purchases DELETE error:', error);
    const message = error instanceof Error ? error.message : 'Lỗi xóa phiếu nhập';
    return NextResponse.json(
      { error: message },
      { status: isValidationError(error) ? 400 : 500 }
    );
  }
}
