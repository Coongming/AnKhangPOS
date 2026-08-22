import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStartOfDayVN, getEndOfDayVN, getStartOfWeekVN, getStartOfMonthVN, getStartOfYearVN } from '@/lib/utils';
import { applyBlendVirtualStock } from '@/lib/blend-stock';

export const dynamic = 'force-dynamic';

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
        case 'all':
          startDate = new Date('2000-01-01T00:00:00Z');
          endDate = getEndOfDayVN();
          break;
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

      const totalRevenue = sales.reduce((sum, s) => sum + Number(s.totalAmount), 0);
      const totalCost = sales.reduce((sum, s) => sum + Number(s.totalCost), 0);
      const totalOrders = sales.length;
      const cashRevenue = sales.filter(s => s.paymentMethod === 'cash').reduce((sum, s) => sum + Number(s.paidAmount), 0);
      const transferRevenue = sales.filter(s => s.paymentMethod === 'transfer').reduce((sum, s) => sum + Number(s.paidAmount), 0);
      const debtRevenue = sales.reduce((sum, s) => sum + Number(s.debtAmount), 0);

      // Group by date
      const dailyData: Record<string, { date: string; revenue: number; orders: number; cashRevenue: number; transferRevenue: number; debtRevenue: number }> = {};
      sales.forEach((s) => {
        // Convert to VN timezone for correct date grouping
        const vnDate = new Date(s.saleDate.getTime() + 7 * 60 * 60 * 1000);
        const dateKey = vnDate.toISOString().split('T')[0];
        if (!dailyData[dateKey]) dailyData[dateKey] = { date: dateKey, revenue: 0, orders: 0, cashRevenue: 0, transferRevenue: 0, debtRevenue: 0 };
        dailyData[dateKey].revenue += Number(s.totalAmount);
        dailyData[dateKey].orders += 1;
        dailyData[dateKey].debtRevenue += Number(s.debtAmount);
        if (s.paymentMethod === 'cash') dailyData[dateKey].cashRevenue += Number(s.paidAmount);
        else if (s.paymentMethod === 'transfer') dailyData[dateKey].transferRevenue += Number(s.paidAmount);
      });

      return NextResponse.json({
        totalRevenue,
        totalCost,
        totalOrders,
        grossProfit: totalRevenue - totalCost,
        cashRevenue,
        transferRevenue,
        debtRevenue,
        dailyData: Object.values(dailyData),
      });
    }

    if (type === 'profit') {
      const sales = await prisma.sale.findMany({
        where: { saleDate: { gte: startDate, lt: endDate }, status: 'completed' },
      });
      // Only count OPERATING expenses for profit calculation
      const expenses = await prisma.expense.findMany({
        where: { date: { gte: startDate, lt: endDate }, category: { type: 'operating' } },
        include: { category: true },
      });

      const totalRevenue = sales.reduce((sum, s) => sum + Number(s.totalAmount), 0);
      const totalCost = sales.reduce((sum, s) => sum + Number(s.totalCost), 0);
      const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
      const grossProfit = totalRevenue - totalCost;
      const netProfit = grossProfit - totalExpenses;

      // Expense by category
      const expenseByCategory: Record<string, number> = {};
      expenses.forEach((e) => {
        const cat = e.category.name;
        expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Number(e.amount);
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

    if (type === 'cashflow') {
      // === TIỀN VÀO ===
      const sales = await prisma.sale.findMany({
        where: { saleDate: { gte: startDate, lt: endDate }, status: 'completed' },
      });
      const cashPaidAtSale = sales.filter(s => s.paymentMethod === 'cash').reduce((sum, s) => sum + Number(s.paidAmount), 0);
      const transferPaidAtSale = sales.filter(s => s.paymentMethod === 'transfer').reduce((sum, s) => sum + Number(s.paidAmount), 0);

      // Gộp tiền khách trả nợ vào đúng phương thức thu tiền bán hàng.
      const customerPayments = await prisma.debtTransaction.findMany({
        where: { type: 'customer_payment', createdAt: { gte: startDate, lt: endDate } },
      });
      const cashDebtPayments = customerPayments
        .filter(payment => payment.paymentMethod !== 'transfer')
        .reduce((sum, payment) => sum + Math.abs(Number(payment.amount)), 0);
      const transferDebtPayments = customerPayments
        .filter(payment => payment.paymentMethod === 'transfer')
        .reduce((sum, payment) => sum + Math.abs(Number(payment.amount)), 0);
      const cashSales = cashPaidAtSale + cashDebtPayments;
      const transferSales = transferPaidAtSale + transferDebtPayments;

      // Nộp thêm vốn (cashflow expenses with "Nộp thêm vốn" category)
      const capitalDeposits = await prisma.expense.findMany({
        where: { date: { gte: startDate, lt: endDate }, category: { type: 'cashflow', name: 'Nộp thêm vốn' } },
      });
      const totalCapitalDeposits = capitalDeposits.reduce((sum, e) => sum + Number(e.amount), 0);

      // === TIỀN RA ===
      // Trả NCC: mọi khoản tiền thực chi đều nằm trong sổ thanh toán độc lập.
      const supplierPayments = await prisma.debtTransaction.findMany({
        where: { type: 'supplier_payment', createdAt: { gte: startDate, lt: endDate } },
      });
      const totalSupplierPayments = supplierPayments.reduce((sum, d) => sum + Math.abs(Number(d.amount)), 0);

      // SalaryPayment đã tự tạo Expense. Loại expense liên kết để sổ quỹ không tính lương hai lần.
      const salaryPayments = await prisma.salaryPayment.findMany({
        where: { createdAt: { gte: startDate, lt: endDate } },
      });
      const totalSalary = salaryPayments.reduce((sum, salary) => sum + Number(salary.totalPay), 0);
      const salaryExpenseIds = salaryPayments
        .map((salary) => salary.expenseId)
        .filter((expenseId): expenseId is string => Boolean(expenseId));

      // Chi phí vận hành
      const operatingExpenses = await prisma.expense.findMany({
        where: {
          date: { gte: startDate, lt: endDate },
          category: { type: 'operating' },
          ...(salaryExpenseIds.length > 0 && { id: { notIn: salaryExpenseIds } }),
        },
        include: { category: true },
      });
      const totalOperatingExpenses = operatingExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

      // Chi lưu chuyển (rút lợi nhuận, etc.) - trừ "Nộp thêm vốn"
      const cashflowExpenses = await prisma.expense.findMany({
        where: { date: { gte: startDate, lt: endDate }, category: { type: 'cashflow', NOT: { name: 'Nộp thêm vốn' } } },
        include: { category: true },
      });
      const totalCashflowOut = cashflowExpenses.reduce((sum, e) => sum + Number(e.amount), 0);


      const totalIn = cashSales + transferSales + totalCapitalDeposits;
      const totalOut = totalSupplierPayments + totalOperatingExpenses + totalCashflowOut + totalSalary;

      // Chi tiết chi phí vận hành theo danh mục
      const opExpByCategory: Record<string, number> = {};
      operatingExpenses.forEach((e) => {
        const cat = e.category.name;
        opExpByCategory[cat] = (opExpByCategory[cat] || 0) + Number(e.amount);
      });

      // Chi tiết lưu chuyển tiền theo danh mục
      const cfExpByCategory: Record<string, number> = {};
      cashflowExpenses.forEach((e) => {
        const cat = e.category.name;
        cfExpByCategory[cat] = (cfExpByCategory[cat] || 0) + Number(e.amount);
      });

      return NextResponse.json({
        moneyIn: {
          cashSales,
          transferSales,
          capitalDeposits: totalCapitalDeposits,
          total: totalIn,
        },
        moneyOut: {
          supplierPayments: totalSupplierPayments,
          operatingExpenses: totalOperatingExpenses,
          cashflowOut: totalCashflowOut,
          salary: totalSalary,
          total: totalOut,
        },
        balance: totalIn - totalOut,
        operatingExpensesByCategory: Object.entries(opExpByCategory).map(([name, amount]) => ({ name, amount })),
        cashflowExpensesByCategory: Object.entries(cfExpByCategory).map(([name, amount]) => ({ name, amount })),
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

      const totalCustomerDebt = customersWithDebt.reduce((sum, c) => sum + Number(c.debt), 0);
      const totalSupplierDebt = suppliersWithDebt.reduce((sum, s) => sum + Number(s.debt), 0);

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
          select: { id: true, stock: true, costPrice: true },
        });
        const linkedStockMap = new Map(linkedProducts.map((p) => [p.id, { stock: p.stock, costPrice: p.costPrice }]));

        for (const product of products) {
          if (product.linkedStockId && linkedStockMap.has(product.linkedStockId)) {
            const linkedProduct = linkedStockMap.get(product.linkedStockId)!;
            product.stock = linkedProduct.stock;
            product.costPrice = linkedProduct.costPrice;
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
        salesByProduct[item.productId].totalQty += Number(item.quantity);
        salesByProduct[item.productId].totalRevenue += Number(item.totalPrice);
      });

      const sortedBySales = Object.values(salesByProduct).sort((a, b) => b.totalQty - a.totalQty);
      const totalStockValue = products.reduce((sum, p) => sum + Number(p.stock) * Number(p.costPrice), 0);

      return NextResponse.json({
        products,
        totalStockValue,
        bestSellers: sortedBySales.slice(0, 10),
        worstSellers: sortedBySales.slice(-10).reverse(),
        lowStock: products.filter((p) => Number(p.stock) <= Number(p.minStock) && Number(p.minStock) > 0),
      });
    }

    return NextResponse.json({ error: 'Loại báo cáo không hợp lệ' }, { status: 400 });
  } catch (error) {
    console.error('Reports error:', error);
    return NextResponse.json({ error: 'Lỗi tạo báo cáo' }, { status: 500 });
  }
}
