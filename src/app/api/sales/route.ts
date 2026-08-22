import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateCodeInTx } from '@/lib/code-sequence';
import {
  calculateSaleCostPrice,
  checkStockForProduct,
  deductStockForProduct,
  getRecordedStockImpact,
  reverseRecordedStockImpact,
} from '@/lib/stock-operations';
import {
  createStockOperationId,
  deleteReferenceStockHistory,
} from '@/lib/stock-ledger';
import {
  reallocateCustomerPayments,
  recalcCustomerDebt,
} from '@/lib/debt-utils';
import {
  validatePositiveNumber,
  isValidationError,
  ValidationError,
} from '@/lib/validation';

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

type SaleItemInput = {
  id?: string;
  productId: string;
  quantity: unknown;
  unitPrice: unknown;
  discount?: unknown;
};

type ExistingSaleItem = {
  id: string;
  productId: string;
  costPrice: unknown;
};

type ProcessedSaleItem = {
  productId: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  discount: number;
  totalPrice: number;
};

function parseDate(value: unknown, fallback: Date): Date {
  if (!value) return fallback;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError('Ngày hóa đơn không hợp lệ');
  }
  return date;
}

async function processSaleItems(
  tx: TxClient,
  items: SaleItemInput[],
  oldItems: ExistingSaleItem[] = []
): Promise<{ items: ProcessedSaleItem[]; subtotal: number; totalCost: number }> {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ValidationError('Vui lòng thêm sản phẩm vào đơn hàng');
  }

  const oldById = new Map(oldItems.map((item) => [item.id, item]));
  const oldByProductId = new Map(oldItems.map((item) => [item.productId, item]));
  const processedItems: ProcessedSaleItem[] = [];
  let subtotal = 0;
  let totalCost = 0;

  for (const item of items) {
    if (!item.productId) throw new ValidationError('Sản phẩm không hợp lệ');

    const quantity = validatePositiveNumber(item.quantity, 'Số lượng');
    const unitPrice = validatePositiveNumber(item.unitPrice, 'Đơn giá');
    const itemDiscount = validatePositiveNumber(item.discount || 0, 'Chiết khấu');
    if (quantity <= 0) throw new ValidationError('Số lượng phải lớn hơn 0');

    const totalPrice = quantity * unitPrice - itemDiscount;
    if (totalPrice < 0) {
      throw new ValidationError('Chiết khấu dòng không được lớn hơn thành tiền');
    }

    const oldItem =
      (item.id ? oldById.get(item.id) : undefined) ||
      oldByProductId.get(item.productId);
    const keepsHistoricalCost = oldItem?.productId === item.productId;
    const costPrice = keepsHistoricalCost
      ? Number(oldItem.costPrice)
      : Math.round(await calculateSaleCostPrice(tx, item.productId));

    subtotal += totalPrice;
    totalCost += quantity * costPrice;
    processedItems.push({
      productId: item.productId,
      quantity,
      unitPrice,
      costPrice,
      discount: itemDiscount,
      totalPrice,
    });
  }

  return { items: processedItems, subtotal, totalCost };
}

async function refreshCustomerDebt(
  tx: TxClient,
  customerIds: Array<string | null | undefined>
): Promise<void> {
  const uniqueIds = Array.from(new Set(customerIds.filter((id): id is string => Boolean(id))));
  for (const customerId of uniqueIds) {
    await recalcCustomerDebt(tx, customerId);
    await reallocateCustomerPayments(tx, customerId);
  }
}

async function getAllowNegativeStock(): Promise<boolean> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: 'allow_negative_stock' },
  });
  return setting?.value === 'true';
}

// GET - List sales
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim() || '';
    const customerId = searchParams.get('customerId') || '';
    const status = searchParams.get('status') || '';
    const paymentMethod = searchParams.get('paymentMethod') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';

    const where: Record<string, unknown> = {};
    if (q) {
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;
    if (paymentMethod) where.paymentMethod = paymentMethod;
    if (dateFrom || dateTo) {
      where.saleDate = {};
      if (dateFrom) {
        (where.saleDate as Record<string, unknown>).gte =
          new Date(dateFrom + 'T00:00:00+07:00');
      }
      if (dateTo) {
        const to = new Date(dateTo + 'T00:00:00+07:00');
        to.setDate(to.getDate() + 1);
        (where.saleDate as Record<string, unknown>).lt = to;
      }
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        customer: { select: { name: true, code: true, phone: true } },
        deliveryEmployee: { select: { name: true, code: true } },
        items: {
          include: {
            product: { select: { name: true, code: true, unit: true } },
          },
        },
        paymentAllocations: { select: { amount: true } },
      },
      orderBy: [{ saleDate: 'desc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json(sales.map((sale) => {
      const allocated = sale.paymentAllocations.reduce(
        (sum, allocation) => sum + Number(allocation.amount),
        0
      );
      const { paymentAllocations, ...data } = sale;
      return {
        ...data,
        remainingDebt: Math.max(0, Number(sale.debtAmount) - allocated),
      };
    }));
  } catch (error) {
    console.error('Sales GET error:', error);
    return NextResponse.json({ error: 'Lỗi tải hóa đơn' }, { status: 500 });
  }
}

// POST - Create sale
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      customerId,
      items,
      paidAmount,
      discount,
      notes,
      paymentMethod,
      deliveryEmployeeId,
      status,
      saleDate,
    } = body;

    const isPending = status === 'pending';
    const allowNegative = await getAllowNegativeStock();

    const sale = await prisma.$transaction(async (tx) => {
      const code = await generateCodeInTx(tx, 'HD');
      const processed = await processSaleItems(tx, items);

      if (!isPending) {
        for (const item of processed.items) {
          await checkStockForProduct(
            tx,
            item.productId,
            item.quantity,
            allowNegative
          );
        }
      }

      const orderDiscount = validatePositiveNumber(discount || 0, 'Giảm giá hóa đơn');
      const totalAmount = processed.subtotal - orderDiscount;
      if (totalAmount < 0) {
        throw new ValidationError('Giảm giá hóa đơn không được lớn hơn tạm tính');
      }

      const paid = isPending
        ? 0
        : validatePositiveNumber(paidAmount || 0, 'Số tiền thanh toán');
      const debtAmount = isPending ? 0 : Math.max(0, totalAmount - paid);
      const selectedCustomerId = customerId || null;

      if (!isPending && debtAmount > 0 && !selectedCustomerId) {
        throw new ValidationError('Bán nợ phải chọn khách hàng có hồ sơ');
      }

      const newSale = await tx.sale.create({
        data: {
          code,
          customerId: selectedCustomerId,
          saleDate: parseDate(saleDate, new Date()),
          subtotal: processed.subtotal,
          discount: orderDiscount,
          totalAmount,
          totalCost: processed.totalCost,
          paidAmount: paid,
          debtAmount,
          notes: notes || null,
          paymentMethod: isPending ? 'cash' : (paymentMethod || 'cash'),
          deliveryEmployeeId: deliveryEmployeeId || null,
          status: isPending ? 'pending' : 'completed',
          stockVersion: isPending ? 0 : 1,
        },
      });

      const stockContext = {
        operationId: createStockOperationId(),
        documentVersion: 1,
        documentDate: newSale.saleDate,
      };

      for (const item of processed.items) {
        await tx.saleItem.create({
          data: { saleId: newSale.id, ...item },
        });

        if (!isPending) {
          await deductStockForProduct(
            tx,
            item.productId,
            item.quantity,
            newSale.id,
            `Bán hàng - ${code}`,
            allowNegative,
            stockContext
          );
        }
      }

      if (!isPending) {
        await refreshCustomerDebt(tx, [selectedCustomerId]);
      }

      return newSale;
    });

    return NextResponse.json(sale, { status: 201 });
  } catch (error) {
    console.error('Sales POST error:', error);
    const message = error instanceof Error ? error.message : 'Lỗi tạo hóa đơn';
    return NextResponse.json(
      { error: message },
      { status: isValidationError(error) ? 400 : 500 }
    );
  }
}

// PUT - Edit, complete or delete a pending sale
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, action } = body;
    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID hóa đơn' }, { status: 400 });
    }

    if (action === 'edit') {
      const {
        saleDate,
        notes,
        customerId,
        paymentMethod,
        items,
        discount,
        paidAmount,
      } = body;

      const sale = await prisma.sale.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!sale) {
        return NextResponse.json({ error: 'Không tìm thấy hóa đơn' }, { status: 404 });
      }
      if (sale.status === 'cancelled') {
        return NextResponse.json(
          { error: 'Không thể sửa hóa đơn đã hủy' },
          { status: 400 }
        );
      }

      if (!items) {
        const newCustomerId =
          customerId === undefined ? sale.customerId : (customerId || null);
        if (sale.status === 'completed' && Number(sale.debtAmount) > 0 && !newCustomerId) {
          return NextResponse.json(
            { error: 'Bán nợ phải chọn khách hàng' },
            { status: 400 }
          );
        }

        await prisma.$transaction(async (tx) => {
          await tx.sale.update({
            where: { id },
            data: {
              saleDate: parseDate(saleDate, sale.saleDate),
              notes: notes === undefined ? sale.notes : (notes || null),
              customerId: newCustomerId,
              paymentMethod: paymentMethod || sale.paymentMethod,
            },
          });
          if (sale.status === 'completed') {
            await refreshCustomerDebt(tx, [sale.customerId, newCustomerId]);
          }
        });

        return NextResponse.json({ success: true });
      }

      const allowNegative = await getAllowNegativeStock();

      await prisma.$transaction(async (tx) => {
        const parsedSaleDate = parseDate(saleDate, sale.saleDate);
        const currentStockVersion = Math.max(1, sale.stockVersion);
        const nextStockVersion = sale.status === 'completed'
          ? currentStockVersion + 1
          : sale.stockVersion;
        const operationId = createStockOperationId();

        if (sale.status === 'completed') {
          const stockImpact = await getRecordedStockImpact(tx, id);
          const reverseContext = {
            operationId,
            documentVersion: currentStockVersion,
            documentDate: sale.saleDate,
          };
          if (stockImpact.size === 0 && sale.items.length > 0) {
            throw new ValidationError(`Hóa đơn ${sale.code} thiếu lịch sử kho. Hãy rebuild sổ kho trước khi sửa.`);
          }
          await reverseRecordedStockImpact(
            tx,
            stockImpact,
            id,
            'sale_edit_reverse',
            `Sửa HĐ (hoàn kho) - ${sale.code}`,
            reverseContext
          );
        }

        const processed = await processSaleItems(tx, items, sale.items);
        if (sale.status === 'completed') {
          for (const item of processed.items) {
            await checkStockForProduct(
              tx,
              item.productId,
              item.quantity,
              allowNegative
            );
          }
        }

        const orderDiscount = validatePositiveNumber(
          discount || 0,
          'Giảm giá hóa đơn'
        );
        const totalAmount = processed.subtotal - orderDiscount;
        if (totalAmount < 0) {
          throw new ValidationError('Giảm giá hóa đơn không được lớn hơn tạm tính');
        }

        const isPending = sale.status === 'pending';
        const paid = isPending
          ? 0
          : validatePositiveNumber(paidAmount || 0, 'Số tiền thanh toán');
        const debtAmount = isPending ? 0 : Math.max(0, totalAmount - paid);
        const newCustomerId =
          customerId === undefined ? sale.customerId : (customerId || null);

        if (!isPending && debtAmount > 0 && !newCustomerId) {
          throw new ValidationError('Bán nợ phải chọn khách hàng');
        }

        await tx.saleItem.deleteMany({ where: { saleId: id } });
        await tx.sale.update({
          where: { id },
          data: {
            customerId: newCustomerId,
            saleDate: parsedSaleDate,
            subtotal: processed.subtotal,
            discount: orderDiscount,
            totalAmount,
            totalCost: processed.totalCost,
            paidAmount: paid,
            debtAmount,
            notes: notes === undefined ? sale.notes : (notes || null),
            paymentMethod: isPending ? 'cash' : (paymentMethod || sale.paymentMethod),
            stockVersion: nextStockVersion,
          },
        });

        const applyContext = {
          operationId,
          documentVersion: nextStockVersion,
          documentDate: parsedSaleDate,
        };

        for (const item of processed.items) {
          await tx.saleItem.create({
            data: { saleId: id, ...item },
          });

          if (!isPending) {
            await deductStockForProduct(
              tx,
              item.productId,
              item.quantity,
              id,
              `Sửa hóa đơn - ${sale.code}`,
              allowNegative,
              applyContext
            );
          }
        }

        if (!isPending) {
          await refreshCustomerDebt(tx, [sale.customerId, newCustomerId]);
        }
      });

      return NextResponse.json({ success: true });
    }

    if (action === 'complete') {
      const { paymentMethod, paidAmount, deliveryEmployeeId } = body;
      const sale = await prisma.sale.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!sale) {
        return NextResponse.json({ error: 'Không tìm thấy hóa đơn' }, { status: 404 });
      }
      if (sale.status !== 'pending') {
        return NextResponse.json(
          { error: 'Đơn này không phải đơn chờ' },
          { status: 400 }
        );
      }

      const allowNegative = await getAllowNegativeStock();

      await prisma.$transaction(async (tx) => {
        const stockContext = {
          operationId: createStockOperationId(),
          documentVersion: 1,
          documentDate: sale.saleDate,
        };
        let totalCost = 0;
        const currentCosts = new Map<string, number>();

        for (const item of sale.items) {
          await checkStockForProduct(
            tx,
            item.productId,
            Number(item.quantity),
            allowNegative
          );
          const costPrice = Math.round(
            await calculateSaleCostPrice(tx, item.productId)
          );
          currentCosts.set(item.id, costPrice);
          totalCost += Number(item.quantity) * costPrice;
        }

        const paid = validatePositiveNumber(
          paidAmount || 0,
          'Số tiền thanh toán'
        );
        const debtAmount = Math.max(0, Number(sale.totalAmount) - paid);
        if (debtAmount > 0 && !sale.customerId) {
          throw new ValidationError('Bán nợ phải chọn khách hàng');
        }

        await tx.sale.update({
          where: { id },
          data: {
            status: 'completed',
            paymentMethod: paymentMethod || 'cash',
            paidAmount: paid,
            debtAmount,
            totalCost,
            deliveryEmployeeId: deliveryEmployeeId || null,
            stockVersion: 1,
          },
        });

        for (const item of sale.items) {
          await tx.saleItem.update({
            where: { id: item.id },
            data: { costPrice: currentCosts.get(item.id) || 0 },
          });
          await deductStockForProduct(
            tx,
            item.productId,
            Number(item.quantity),
            id,
            `Bán hàng (hoàn thành đơn chờ) - ${sale.code}`,
            allowNegative,
            stockContext
          );
        }

        await refreshCustomerDebt(tx, [sale.customerId]);
      });

      return NextResponse.json({ success: true });
    }

    if (action === 'deletePending') {
      const sale = await prisma.sale.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!sale) {
        return NextResponse.json({ error: 'Không tìm thấy hóa đơn' }, { status: 404 });
      }
      if (sale.status !== 'pending') {
        return NextResponse.json(
          { error: 'Chỉ có thể xóa đơn chờ bằng thao tác này' },
          { status: 400 }
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.saleItem.deleteMany({ where: { saleId: id } });
        await tx.sale.delete({ where: { id } });
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 });
  } catch (error) {
    console.error('Sales PUT error:', error);
    const message = error instanceof Error ? error.message : 'Lỗi cập nhật hóa đơn';
    return NextResponse.json(
      { error: message },
      { status: isValidationError(error) ? 400 : 500 }
    );
  }
}

// DELETE - Delete the sale and all of its stock history
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID' }, { status: 400 });
    }

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!sale) {
      return NextResponse.json({ error: 'Không tìm thấy hóa đơn' }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      if (sale.status === 'completed') {
        const stockImpact = await getRecordedStockImpact(tx, id);
        if (stockImpact.size === 0 && sale.items.length > 0) {
          throw new ValidationError(`Hóa đơn ${sale.code} thiếu lịch sử kho. Hãy rebuild sổ kho trước khi xóa.`);
        }
        await deleteReferenceStockHistory(tx, id);
      }

      await tx.saleItem.deleteMany({ where: { saleId: id } });
      await tx.sale.delete({ where: { id } });

      if (sale.status === 'completed') {
        await refreshCustomerDebt(tx, [sale.customerId]);
      }
    }, { maxWait: 10_000, timeout: 30_000 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Sales DELETE error:', error);
    const message = error instanceof Error ? error.message : 'Lỗi xóa hóa đơn';
    return NextResponse.json(
      { error: message },
      { status: isValidationError(error) ? 400 : 500 }
    );
  }
}
