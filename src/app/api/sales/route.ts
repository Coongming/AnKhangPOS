import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateCode } from '@/lib/utils';
import { checkStockForProduct, deductStockForProduct, reverseStockForProduct } from '@/lib/stock-operations';
import { recalcCustomerDebt } from '@/lib/debt-utils';

// GET - List sales
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId') || '';
    const status = searchParams.get('status') || '';
    const paymentMethod = searchParams.get('paymentMethod') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';

    const where: Record<string, unknown> = {};
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;
    if (paymentMethod) where.paymentMethod = paymentMethod;
    if (dateFrom || dateTo) {
      where.saleDate = {};
      if (dateFrom) (where.saleDate as Record<string, unknown>).gte = new Date(dateFrom + 'T00:00:00+07:00');
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
        items: { include: { product: { select: { name: true, code: true, unit: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(sales);
  } catch (error) {
    console.error('Sales GET error:', error);
    return NextResponse.json({ error: 'Lỗi tải hóa đơn' }, { status: 500 });
  }
}

// POST - Create sale (TRANSACTION: create sale + deduct stock + record debt)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerId, items, paidAmount, discount, notes, paymentMethod, deliveryEmployeeId, status } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Vui lòng thêm sản phẩm vào đơn hàng' }, { status: 400 });
    }

    const isPending = status === 'pending';

    // Generate sale code
    const lastSale = await prisma.sale.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const code = generateCode('HD', lastSale?.code || null);

    // Check system setting for negative stock
    const allowNegStock = await prisma.systemSetting.findUnique({
      where: { key: 'allow_negative_stock' },
    });
    const allowNegative = allowNegStock?.value === 'true';

    const sale = await prisma.$transaction(async (tx) => {
      // Pre-check stock (skip for pending)
      if (!isPending) {
        for (const item of items) {
          await checkStockForProduct(tx, item.productId, parseFloat(item.quantity), allowNegative);
        }
      }

      // Calculate totals
      let subtotal = 0;
      let totalCost = 0;
      const processedItems = [];

      for (const item of items) {
        const qty = parseFloat(item.quantity);
        const price = parseFloat(item.unitPrice);
        const itemDiscount = parseFloat(item.discount) || 0;
        const lineTotal = qty * price - itemDiscount;
        const product = await tx.product.findUnique({ where: { id: item.productId } });

        subtotal += lineTotal;
        totalCost += qty * (product?.costPrice || 0);
        processedItems.push({
          productId: item.productId,
          quantity: qty,
          unitPrice: price,
          costPrice: product?.costPrice || 0,
          discount: itemDiscount,
          totalPrice: lineTotal,
        });
      }

      const orderDiscount = parseFloat(discount) || 0;
      const totalAmount = subtotal - orderDiscount;
      const paid = isPending ? 0 : (parseFloat(paidAmount) || 0);
      const debtAmount = isPending ? 0 : Math.max(0, totalAmount - paid);

      // Debt requires customer
      if (!isPending && debtAmount > 0 && !customerId) {
        throw new Error('Bán nợ phải chọn khách hàng có hồ sơ');
      }

      // 1. Create sale
      const newSale = await tx.sale.create({
        data: {
          code,
          customerId: customerId || null,
          subtotal,
          discount: orderDiscount,
          totalAmount,
          totalCost,
          paidAmount: paid,
          debtAmount,
          notes: notes || null,
          paymentMethod: isPending ? 'cash' : (paymentMethod || 'cash'),
          deliveryEmployeeId: deliveryEmployeeId || null,
          status: isPending ? 'pending' : 'completed',
        },
      });

      // 2. Create sale items + deduct stock
      for (const item of processedItems) {
        await tx.saleItem.create({
          data: { saleId: newSale.id, ...item },
        });

        if (!isPending) {
          await deductStockForProduct(tx, item.productId, item.quantity, newSale.id, `Bán hàng - ${code}`, allowNegative);
        }
      }

      // 3. Customer debt (skip cho pending) — tính lại từ nguồn
      if (!isPending && customerId) {
        await recalcCustomerDebt(tx, customerId);
      }

      return newSale;
    });

    return NextResponse.json(sale, { status: 201 });
  } catch (error) {
    console.error('Sales POST error:', error);
    const message = error instanceof Error ? error.message : 'Lỗi tạo hóa đơn';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT - Full edit sale OR Complete/delete pending sale
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, action } = body;

    // --- Full edit ---
    if (action === 'edit') {
      const { saleDate, notes, customerId, paymentMethod, items, discount, paidAmount } = body;

      const sale = await prisma.sale.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!sale) return NextResponse.json({ error: 'Không tìm thấy hóa đơn' }, { status: 404 });
      if (sale.status === 'cancelled') return NextResponse.json({ error: 'Không thể sửa hóa đơn đã hủy' }, { status: 400 });

      // If only simple fields (no items), do simple update
      if (!items) {
        const updateData: Record<string, unknown> = {};
        if (saleDate) updateData.saleDate = new Date(saleDate);
        if (notes !== undefined) updateData.notes = notes || null;
        if (customerId !== undefined) updateData.customerId = customerId || null;
        if (paymentMethod) updateData.paymentMethod = paymentMethod;
        await prisma.sale.update({ where: { id }, data: updateData });
        return NextResponse.json({ success: true });
      }

      // Check system setting for negative stock
      const allowNegStock = await prisma.systemSetting.findUnique({
        where: { key: 'allow_negative_stock' },
      });
      const allowNegative = allowNegStock?.value === 'true';

      // Full edit with items → reverse old + apply new in transaction
      await prisma.$transaction(async (tx) => {
        // 1. REVERSE old stock
        for (const oldItem of sale.items) {
          await reverseStockForProduct(tx, oldItem.productId, oldItem.quantity, id, `Sửa HĐ (hoàn kho) - ${sale.code}`);
        }

        // 2. Delete old items & related records (debt sẽ tính lại ở cuối)
        await tx.debtTransaction.deleteMany({ where: { saleId: id } });
        await tx.stockMovement.deleteMany({ where: { referenceId: id } });
        await tx.saleItem.deleteMany({ where: { saleId: id } });

        // 4. Re-calculate new totals
        let subtotal = 0;
        let totalCost = 0;
        const processedItems = [];

        for (const item of items) {
          const qty = parseFloat(item.quantity);
          const price = parseFloat(item.unitPrice);
          const itemDiscount = parseFloat(item.discount) || 0;
          const lineTotal = qty * price - itemDiscount;
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product) throw new Error('Sản phẩm không tồn tại');

          // Check stock
          await checkStockForProduct(tx, item.productId, qty, allowNegative);

          subtotal += lineTotal;
          totalCost += qty * product.costPrice;
          processedItems.push({
            productId: item.productId,
            quantity: qty,
            unitPrice: price,
            costPrice: product.costPrice,
            discount: itemDiscount,
            totalPrice: lineTotal,
          });
        }

        const orderDiscount = parseFloat(discount) || 0;
        const totalAmount = subtotal - orderDiscount;
        const paid = parseFloat(paidAmount) || 0;
        const newDebtAmount = Math.max(0, totalAmount - paid);
        const newCustomerId = customerId || null;

        if (newDebtAmount > 0 && !newCustomerId) {
          throw new Error('Bán nợ phải chọn khách hàng');
        }

        // 5. Update sale
        await tx.sale.update({
          where: { id },
          data: {
            customerId: newCustomerId,
            saleDate: saleDate ? new Date(saleDate) : sale.saleDate,
            subtotal,
            discount: orderDiscount,
            totalAmount,
            totalCost,
            paidAmount: paid,
            debtAmount: newDebtAmount,
            notes: notes !== undefined ? (notes || null) : sale.notes,
            paymentMethod: paymentMethod || sale.paymentMethod,
          },
        });

        // 6. Create new items + deduct stock
        for (const item of processedItems) {
          await tx.saleItem.create({
            data: { saleId: id, ...item },
          });

          await deductStockForProduct(tx, item.productId, item.quantity, id, `Sửa hóa đơn - ${sale.code}`, allowNegative);
        }

        // 7. Recalc debt — tính lại từ nguồn
        // Nếu đổi khách hàng, cần tính lại cả khách cũ
        if (sale.customerId && sale.customerId !== newCustomerId) {
          await recalcCustomerDebt(tx, sale.customerId);
        }
        if (newCustomerId) {
          await recalcCustomerDebt(tx, newCustomerId);
        }
      });

      return NextResponse.json({ success: true });
    }

    // --- Complete pending sale (trừ kho + ghi nợ + đổi status) ---
    if (action === 'complete') {
      const { paymentMethod, paidAmount, deliveryEmployeeId } = body;

      const sale = await prisma.sale.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!sale) return NextResponse.json({ error: 'Không tìm thấy hóa đơn' }, { status: 404 });
      if (sale.status !== 'pending') return NextResponse.json({ error: 'Đơn này không phải đơn chờ' }, { status: 400 });

      const allowNegStock = await prisma.systemSetting.findUnique({
        where: { key: 'allow_negative_stock' },
      });
      const allowNegative = allowNegStock?.value === 'true';

      await prisma.$transaction(async (tx) => {
        // Check stock
        for (const item of sale.items) {
          await checkStockForProduct(tx, item.productId, item.quantity, allowNegative);
        }

        const paid = parseFloat(paidAmount) || 0;
        const debtAmount = Math.max(0, sale.totalAmount - paid);

        if (debtAmount > 0 && !sale.customerId) {
          throw new Error('Bán nợ phải chọn khách hàng');
        }

        // 1. Update sale status
        await tx.sale.update({
          where: { id },
          data: {
            status: 'completed',
            paymentMethod: paymentMethod || 'cash',
            paidAmount: paid,
            debtAmount,
            deliveryEmployeeId: deliveryEmployeeId || null,
          },
        });

        // 2. Deduct stock
        for (const item of sale.items) {
          await deductStockForProduct(tx, item.productId, item.quantity, id, `Bán hàng (hoàn thành đơn chờ) - ${sale.code}`, allowNegative);
        }

        // 3. Customer debt — tính lại từ nguồn
        if (sale.customerId) {
          await recalcCustomerDebt(tx, sale.customerId);
        }
      });

      return NextResponse.json({ success: true });
    }

    // --- Delete pending sale ---
    if (action === 'deletePending') {
      const sale = await prisma.sale.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!sale) return NextResponse.json({ error: 'Không tìm thấy hóa đơn' }, { status: 404 });
      if (sale.status !== 'pending') {
        return NextResponse.json(
          { error: 'Chức năng hủy hóa đơn đã được bỏ. Hãy dùng nút Xóa hóa đơn nếu cần tạo lại đơn.' },
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE - Delete sale (reverse stock when needed + hard delete)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Thiếu ID' }, { status: 400 });

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!sale) return NextResponse.json({ error: 'Không tìm thấy hóa đơn' }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      // Reverse stock if still active
      if (sale.status === 'completed') {
        for (const item of sale.items) {
          await reverseStockForProduct(tx, item.productId, item.quantity, id, `Xóa hóa đơn - ${sale.code}`);
        }
      }

      // Delete related records then the sale
      await tx.debtTransaction.deleteMany({ where: { saleId: id } });
      await tx.stockMovement.deleteMany({ where: { referenceId: id } });
      await tx.saleItem.deleteMany({ where: { saleId: id } });
      await tx.sale.delete({ where: { id } });

      // Recalc debt từ nguồn
      if (sale.customerId) {
        await recalcCustomerDebt(tx, sale.customerId);
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Sales DELETE error:', error);
    return NextResponse.json({ error: 'Lỗi xóa hóa đơn' }, { status: 500 });
  }
}
