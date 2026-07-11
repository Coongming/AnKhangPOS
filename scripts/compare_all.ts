import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const backupFile = '/home/vanduccongminh/ankhangpos-backup-2026-07-09T06-40-57.json';

async function main() {
  const data = JSON.parse(fs.readFileSync(backupFile, 'utf8')).data;

  console.log('========== SO SÁNH TOÀN BỘ DATABASE ==========\n');

  // 1. Categories
  const dbCats = await prisma.productCategory.findMany();
  const fileCats: any[] = data.categories || [];
  const missingCats = fileCats.filter((f: any) => !dbCats.find(d => d.id === f.id));
  const extraCats = dbCats.filter(d => !fileCats.find((f: any) => f.id === d.id));
  console.log(`📁 DANH MỤC: File=${fileCats.length} | DB=${dbCats.length}`);
  if (missingCats.length) console.log(`   ❌ Có trong file, CHƯA CÓ trong DB:`, missingCats.map((c: any) => c.name));
  if (extraCats.length) console.log(`   ➕ Có trong DB, KHÔNG CÓ trong file:`, extraCats.map(c => c.name));
  if (!missingCats.length && !extraCats.length) console.log(`   ✅ Giống nhau`);

  // 2. Products
  const dbProds = await prisma.product.findMany();
  const fileProds: any[] = data.products || [];
  const missingProds = fileProds.filter((f: any) => !dbProds.find(d => d.id === f.id));
  const extraProds = dbProds.filter(d => !fileProds.find((f: any) => f.id === d.id));
  console.log(`\n📦 SẢN PHẨM: File=${fileProds.length} | DB=${dbProds.length}`);
  if (missingProds.length) console.log(`   ❌ Có trong file, CHƯA CÓ trong DB:`, missingProds.map((p: any) => `${p.code}-${p.name}`));
  if (extraProds.length) console.log(`   ➕ Có trong DB, KHÔNG CÓ trong file:`, extraProds.map(p => `${p.code}-${p.name}`));
  if (!missingProds.length && !extraProds.length) console.log(`   ✅ Giống nhau`);
  // Check stock differences
  const stockDiffs: string[] = [];
  for (const fp of fileProds) {
    const dp = dbProds.find(d => d.id === fp.id);
    if (dp && Math.abs(Number(dp.stock) - Number(fp.stock)) > 0.01) {
      stockDiffs.push(`${dp.code} ${dp.name}: DB=${dp.stock} | File=${fp.stock}`);
    }
  }
  if (stockDiffs.length) {
    console.log(`   ⚠ Tồn kho KHÁC NHAU (${stockDiffs.length}):`);
    stockDiffs.forEach(s => console.log(`     ${s}`));
  }

  // 3. Customers
  const dbCusts = await prisma.customer.findMany();
  const fileCusts: any[] = data.customers || [];
  const missingCusts = fileCusts.filter((f: any) => !dbCusts.find(d => d.id === f.id));
  const extraCusts = dbCusts.filter(d => !fileCusts.find((f: any) => f.id === d.id));
  console.log(`\n👥 KHÁCH HÀNG: File=${fileCusts.length} | DB=${dbCusts.length}`);
  if (missingCusts.length) console.log(`   ❌ Có trong file, CHƯA CÓ trong DB:`, missingCusts.map((c: any) => `${c.code}-${c.name}`));
  if (extraCusts.length) console.log(`   ➕ Có trong DB, KHÔNG CÓ trong file:`, extraCusts.map(c => `${c.code}-${c.name}`));
  if (!missingCusts.length && !extraCusts.length) console.log(`   ✅ Giống nhau`);
  // Check debt differences
  const debtDiffs: string[] = [];
  for (const fc of fileCusts) {
    const dc = dbCusts.find(d => d.id === fc.id);
    if (dc && Math.abs(Number(dc.debt) - Number(fc.debt || 0)) > 0.01) {
      debtDiffs.push(`${dc.code} ${dc.name}: DB=${dc.debt} | File=${fc.debt}`);
    }
  }
  if (debtDiffs.length) {
    console.log(`   ⚠ Công nợ KHÁC NHAU (${debtDiffs.length}):`);
    debtDiffs.forEach(s => console.log(`     ${s}`));
  }

  // 4. Suppliers
  const dbSupps = await prisma.supplier.findMany();
  const fileSupps: any[] = data.suppliers || [];
  const missingSupps = fileSupps.filter((f: any) => !dbSupps.find(d => d.id === f.id));
  const extraSupps = dbSupps.filter(d => !fileSupps.find((f: any) => f.id === d.id));
  console.log(`\n🚛 NHÀ CUNG CẤP: File=${fileSupps.length} | DB=${dbSupps.length}`);
  if (missingSupps.length) console.log(`   ❌ Có trong file, CHƯA CÓ trong DB:`, missingSupps.map((s: any) => `${s.code}-${s.name}`));
  if (extraSupps.length) console.log(`   ➕ Có trong DB, KHÔNG CÓ trong file:`, extraSupps.map(s => `${s.code}-${s.name}`));
  if (!missingSupps.length && !extraSupps.length) console.log(`   ✅ Giống nhau`);
  // Supplier debt
  const suppDebtDiffs: string[] = [];
  for (const fs2 of fileSupps) {
    const ds = dbSupps.find(d => d.id === fs2.id);
    if (ds && Math.abs(Number(ds.debt) - Number(fs2.debt || 0)) > 0.01) {
      suppDebtDiffs.push(`${ds.code} ${ds.name}: DB=${ds.debt} | File=${fs2.debt}`);
    }
  }
  if (suppDebtDiffs.length) {
    console.log(`   ⚠ Công nợ NCC KHÁC NHAU (${suppDebtDiffs.length}):`);
    suppDebtDiffs.forEach(s => console.log(`     ${s}`));
  }

  // 5. Sales
  const dbSaleCount = await prisma.sale.count();
  const fileSales: any[] = data.sales || [];
  const dbSaleIds = (await prisma.sale.findMany({ select: { id: true } })).map(s => s.id);
  const missingSales = fileSales.filter((f: any) => !dbSaleIds.includes(f.id));
  const extraSaleCount = dbSaleIds.filter(id => !fileSales.find((f: any) => f.id === id)).length;
  console.log(`\n🧾 HÓA ĐƠN BÁN: File=${fileSales.length} | DB=${dbSaleCount}`);
  if (missingSales.length) console.log(`   ❌ Có trong file, CHƯA CÓ trong DB: ${missingSales.length} hóa đơn`);
  if (extraSaleCount) console.log(`   ➕ Có trong DB, KHÔNG CÓ trong file: ${extraSaleCount} hóa đơn`);
  if (!missingSales.length && !extraSaleCount) console.log(`   ✅ Giống nhau`);

  // 6. Sale Items
  const dbItemCount = await prisma.saleItem.count();
  const fileItems: any[] = data.saleItems || [];
  console.log(`\n📋 CHI TIẾT HÓA ĐƠN: File=${fileItems.length} | DB=${dbItemCount}`);

  // 7. Purchases
  const dbPurchCount = await prisma.purchase.count();
  const filePurchases: any[] = data.purchases || [];
  const dbPurchIds = (await prisma.purchase.findMany({ select: { id: true } })).map(p => p.id);
  const missingPurch = filePurchases.filter((f: any) => !dbPurchIds.includes(f.id));
  const extraPurch = dbPurchIds.filter(id => !filePurchases.find((f: any) => f.id === id)).length;
  console.log(`\n📥 PHIẾU NHẬP/TRẢ: File=${filePurchases.length} | DB=${dbPurchCount}`);
  if (missingPurch.length) console.log(`   ❌ Có trong file, CHƯA CÓ trong DB: ${missingPurch.length} phiếu`, missingPurch.map((p: any) => p.code));
  if (extraPurch) console.log(`   ➕ Có trong DB, KHÔNG CÓ trong file: ${extraPurch} phiếu`);
  if (!missingPurch.length && !extraPurch) console.log(`   ✅ Giống nhau`);

  // 8. Debt Transactions
  const dbDebtCount = await prisma.debtTransaction.count();
  const fileDebts: any[] = data.debtTransactions || [];
  const dbDebtIds = (await prisma.debtTransaction.findMany({ select: { id: true } })).map(d => d.id);
  const missingDebts = fileDebts.filter((f: any) => !dbDebtIds.includes(f.id));
  const extraDebts = dbDebtIds.filter(id => !fileDebts.find((f: any) => f.id === id)).length;
  console.log(`\n💰 GIAO DỊCH CÔNG NỢ: File=${fileDebts.length} | DB=${dbDebtCount}`);
  if (missingDebts.length) console.log(`   ❌ Có trong file, CHƯA CÓ trong DB: ${missingDebts.length} giao dịch`);
  if (extraDebts) console.log(`   ➕ Có trong DB, KHÔNG CÓ trong file: ${extraDebts} giao dịch`);
  if (!missingDebts.length && !extraDebts) console.log(`   ✅ Giống nhau`);

  // 9. Stock Movements
  const dbStockMoveCount = await prisma.stockMovement.count();
  const fileStockMoves: any[] = data.stockMovements || [];
  console.log(`\n📊 LỊCH SỬ KHO: File=${fileStockMoves.length} | DB=${dbStockMoveCount}`);

  // 10. Cash Book (model removed — skip)
  const fileCash: any[] = data.cashBookEntries || [];
  if (fileCash.length) {
    console.log(`\n📒 SỔ QUỸ: File=${fileCash.length} | DB=N/A (model không tồn tại)`);
  }

  // 11. Settings
  const dbSettings = await prisma.systemSetting.findMany();
  const fileSettings: any[] = data.systemSettings || [];
  console.log(`\n⚙️ CÀI ĐẶT: File=${fileSettings.length} | DB=${dbSettings.length}`);

  console.log('\n========== KẾT THÚC SO SÁNH ==========');
}

main()
  .catch(e => console.error('ERROR:', e.message))
  .finally(() => prisma.$disconnect());
