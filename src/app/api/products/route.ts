import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateCode } from '@/lib/utils';
import { applyBlendVirtualStock } from '@/lib/blend-stock';

// GET - List products
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const categoryId = searchParams.get('categoryId') || '';
    const status = searchParams.get('status') || '';

    const where: Record<string, unknown> = {};
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (categoryId) where.categoryId = categoryId;
    if (status === 'active') where.isActive = true;
    if (status === 'inactive') where.isActive = false;

    const products = await prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: { code: 'desc' },
    });

    // Replace stock with linked product's stock for products with linkedStockId
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
    console.error('Products GET error:', error);
    return NextResponse.json({ error: 'Lỗi tải danh sách sản phẩm' }, { status: 500 });
  }
}

// POST - Create product
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, categoryId, unit, salePrice, minStock, barcode, linkedStockId, blendTemplateId } = body;

    if (!name || !categoryId || !unit) {
      return NextResponse.json({ error: 'Vui lòng nhập đầy đủ thông tin' }, { status: 400 });
    }

    // Check duplicate name
    const existing = await prisma.product.findFirst({
      where: { name: { equals: name.trim(), mode: 'insensitive' } },
    });
    if (existing) {
      return NextResponse.json({ error: `Sản phẩm "${existing.name}" đã tồn tại (mã: ${existing.code})` }, { status: 400 });
    }

    // Generate code
    const lastProduct = await prisma.product.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const code = generateCode('SP', lastProduct?.code || null);

    const product = await prisma.product.create({
      data: {
        code,
        name,
        categoryId,
        unit,

        salePrice: parseFloat(salePrice) || 0,
        minStock: parseFloat(minStock) || 0,
        barcode: barcode || null,
        linkedStockId: linkedStockId || null,
        blendTemplateId: blendTemplateId || null,
      },
      include: { category: true },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error('Products POST error:', error);
    return NextResponse.json({ error: 'Lỗi tạo sản phẩm' }, { status: 500 });
  }
}

// PUT - Update product
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, categoryId, unit, salePrice, minStock, barcode, isActive, linkedStockId, blendTemplateId } = body;

    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID sản phẩm' }, { status: 400 });
    }

    // Check duplicate name when renaming
    if (name) {
      const existing = await prisma.product.findFirst({
        where: { name: { equals: name.trim(), mode: 'insensitive' }, id: { not: id } },
      });
      if (existing) {
        return NextResponse.json({ error: `Sản phẩm "${existing.name}" đã tồn tại (mã: ${existing.code})` }, { status: 400 });
      }
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(categoryId !== undefined && { categoryId }),
        ...(unit !== undefined && { unit }),

        ...(salePrice !== undefined && { salePrice: parseFloat(salePrice) }),
        ...(minStock !== undefined && { minStock: parseFloat(minStock) }),
        ...(barcode !== undefined && { barcode }),
        ...(isActive !== undefined && { isActive }),
        ...(linkedStockId !== undefined && { linkedStockId: linkedStockId || null }),
        ...(blendTemplateId !== undefined && { blendTemplateId: blendTemplateId || null }),
      },
      include: { category: true },
    });

    return NextResponse.json(product);
  } catch (error) {
    console.error('Products PUT error:', error);
    return NextResponse.json({ error: 'Lỗi cập nhật sản phẩm' }, { status: 500 });
  }
}

// DELETE - Delete product (hard delete only when it has no stock/transaction history)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Thiếu ID sản phẩm' }, { status: 400 });

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return NextResponse.json({ error: 'Không tìm thấy sản phẩm' }, { status: 404 });

    const [saleItemCount, purchaseItemCount, stockMovementCount] = await Promise.all([
      prisma.saleItem.count({ where: { productId: id } }),
      prisma.purchaseItem.count({ where: { productId: id } }),
      prisma.stockMovement.count({ where: { productId: id } }),
    ]);

    if (saleItemCount > 0 || purchaseItemCount > 0 || stockMovementCount > 0) {
      await prisma.product.update({
        where: { id },
        data: { isActive: false },
      });

      return NextResponse.json({
        success: true,
        mode: 'deactivated',
        message: `Sản phẩm "${product.name}" đã có lịch sử bán/nhập/chỉnh tồn nên đã được chuyển sang "Ngừng bán" thay vì xóa.`,
      });
    }

    try {
      await prisma.product.delete({ where: { id } });
      return NextResponse.json({ success: true, mode: 'deleted' });
    } catch {
      await prisma.product.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({
        success: true,
        mode: 'deactivated',
        message: `Sản phẩm "${product.name}" đã có lịch sử giao dịch nên đã được chuyển sang "Ngừng bán" thay vì xóa.`,
      });
    }
  } catch (error) {
    console.error('Products DELETE error:', error);
    return NextResponse.json({ error: 'Lỗi xóa sản phẩm' }, { status: 500 });
  }
}
