import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStartOfDayVN, getEndOfDayVN, getStartOfWeekVN, getStartOfMonthVN, getStartOfYearVN } from '@/lib/utils';
import { applyBlendVirtualStock } from '@/lib/blend-stock';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'revenue'; // revenue, profit, debt, stock
    const period = searchParams.get('period') || 'month'; // day, week, month, year, custom
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';

    // Calculate date range (Vietnam timezone)
    let startDate: Date;
    let endDate: Date;

    if (dateFrom && dateTo) {
      startDate = getStartOfDayVN(new Date(dateFrom + 'T00:00:00+07:00'));
      endDate = getEndOfDayVN(new Date(dateTo + 'T00:00:00+07:00'));
    } else {
      switch (period) {
        case 'day':
          startDate = getStartOfDayVN();
          endDate = getEndOfDayVN();
          break;
        case 'week':
          startDate = getStartOfWeekVN();
          endDate = getEndOfDayVN();
          break;
        case 'month':
          startDate = getStartOfMonthVN();
          endDate = getEndOfDayVN();
          break;
        case 'year':
          startDate = getStartOfYearVN();
          endDate = getEndOfDayVN();
          break;
        default:
          startDate = getStartOfMonthVN();
          endDate = getEndOfDayVN();
      }
    }

    if (type === 'revenue') {
      const sales = await prisma.sale.findMany({
        where: {
          saleDate: { gte: startDate, lt: endDate },
          status: 'completed',
        },
        orderBy: { saleDate: 'asc' },
      });

      const totalRevenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);
      const totalCost = sales.reduce((sum, s) => sum + s.totalCost, 0);
      const totalOrders = sales.length;
      const cashRevenue = sales.filter(s => s.paymentMethod === 'cash').reduce((sum, s) => sum + s.totalAmount, 0);
      const transferRevenue = sales.filter(s => s.paymentMethod === 'transfer').reduce((sum, s) => sum + s.totalAmount, 0);

      // Group by date
      const dailyData: Record<string, { date: string; revenue: number; orders: number; cashRevenue: number; transferRevenue: number }> = {};
      sales.forEach((s) => {
        // Convert to VN timezone for correct date grouping
        const vnDate = new Date(s.saleDate.getTime() + 7 * 60 * 60 * 1000);
        const dateKey = vnDate.toISOString().split('T')[0];
        if (!dailyData[dateKey]) dailyData[dateKey] = { date: dateKey, revenue: 0, orders: 0, cashRevenue: 0, transferRevenue: 0 };
        dailyData[dateKey].revenue += s.totalAmount;
        dailyData[dateKey].orders += 1;
        if (s.paymentMethod === 'cash') dailyData[dateKey].cashRevenue += s.totalAmount;
        else if (s.paymentMethod === 'transfer') dailyData[dateKey].transferRevenue += s.totalAmount;
      });

      return NextResponse.json({
        totalRevenue,
        totalCost,
        totalOrders,
        grossProfit: totalRevenue - totalCost,
        cashRevenue,
        transferRevenue,
        dailyData: Object.values(dailyData),
      });
    }

    if (type === 'profit') {
      const sales = await prisma.sale.findMany({
        where: { saleDate: { gte: startDate, lt: endDate }, status: 'completed' },
      });
      const expenses = await prisma.expense.findMany({
        where: { date: { gte: startDate, lt: endDate } },
        include: { category: true },
      });

      const totalRevenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);
      const totalCost = sales.reduce((sum, s) => sum + s.totalCost, 0);
      const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
      const grossProfit = totalRevenue - totalCost;
      const netProfit = grossProfit - totalExpenses;

      // Expense by category
      const expenseByCategory: Record<string, number> = {};
      expenses.forEach((e) => {
        const cat = e.category.name;
        expenseByCategory[cat] = (expenseByCategory[cat] || 0) + e.amount;
      });

      return NextResponse.json({
        totalRevenue,
        totalCost,
        totalExpenses,
        grossProfit,
        netProfit,
        expenseByCategory: Object.entries(expenseByCategory).map(([name, amount]) => ({ name, amount })),
      });
    }

    if (type === 'debt') {
      const customersWithDebt = await prisma.customer.findMany({
        where: { debt: { gt: 0 } },
        select: { id: true, code: true, name: true, phone: true, debt: true },
        orderBy: { debt: 'desc' },
      });
      const suppliersWithDebt = await prisma.supplier.findMany({
        where: { debt: { gt: 0 } },
        select: { id: true, code: true, name: true, phone: true, debt: true },
        orderBy: { debt: 'desc' },
      });

      const totalCustomerDebt = customersWithDebt.reduce((sum, c) => sum + c.debt, 0);
      const totalSupplierDebt = suppliersWithDebt.reduce((sum, s) => sum + s.debt, 0);

      return NextResponse.json({
        totalCustomerDebt,
        totalSupplierDebt,
        customers: customersWithDebt,
        suppliers: suppliersWithDebt,
      });
    }

    if (type === 'stock') {
      const products = await prisma.product.findMany({
        where: { isActive: true },
        select: {
          id: true, code: true, name: true, unit: true,
          stock: true, minStock: true, costPrice: true, salePrice: true,
          linkedStockId: true, blendTemplateId: true,
          category: { select: { name: true } },
        },
        orderBy: { stock: 'asc' },
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

      // Best/worst sellers
      const salesItems = await prisma.saleItem.findMany({
        where: {
          sale: { saleDate: { gte: startDate, lt: endDate }, status: 'completed' },
        },
        include: { product: { select: { name: true, unit: true } } },
      });

      const salesByProduct: Record<string, { name: string; unit: string; totalQty: number; totalRevenue: number }> = {};
      salesItems.forEach((item) => {
        if (!salesByProduct[item.productId]) {
          salesByProduct[item.productId] = { name: item.product.name, unit: item.product.unit, totalQty: 0, totalRevenue: 0 };
        }
        salesByProduct[item.productId].totalQty += item.quantity;
        salesByProduct[item.productId].totalRevenue += item.totalPrice;
      });

      const sortedBySales = Object.values(salesByProduct).sort((a, b) => b.totalQty - a.totalQty);
      const totalStockValue = products.reduce((sum, p) => sum + p.stock * p.costPrice, 0);

      return NextResponse.json({
        products,
        totalStockValue,
        bestSellers: sortedBySales.slice(0, 10),
        worstSellers: sortedBySales.slice(-10).reverse(),
        lowStock: products.filter((p) => p.stock <= p.minStock && p.minStock > 0),
      });
    }

    return NextResponse.json({ error: 'Loại báo cáo không hợp lệ' }, { status: 400 });
  } catch (error) {
    console.error('Reports error:', error);
    return NextResponse.json({ error: 'Lỗi tạo báo cáo' }, { status: 500 });
  }
}
