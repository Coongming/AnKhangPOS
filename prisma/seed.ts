import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Đang tạo dữ liệu mặc định...');

  // Tạo nhóm sản phẩm mặc định
  const categories = ['Gạo', 'Nước', 'Khác'];
  for (const name of categories) {
    await prisma.productCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log('✅ Đã tạo nhóm sản phẩm');

  // Tạo danh mục chi phí mặc định
  const expenseCategories = [
    'Tiền điện',
    'Tiền nước',
    'Tiền thuê mặt bằng',
    'Vận chuyển',
    'Bốc xếp',
    'Sửa chữa',
    'Lương nhân viên',
    'Chi phí khác',
  ];
  for (const name of expenseCategories) {
    await prisma.expenseCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log('✅ Đã tạo danh mục chi phí');

  // Cài đặt hệ thống mặc định
  const settings = [
    { key: 'store_name', value: 'Cửa hàng An Khang' },
    { key: 'store_phone', value: '' },
    { key: 'store_address', value: '' },
    { key: 'allow_negative_stock', value: 'false' },
    { key: 'cost_method', value: 'simple_average' },
  ];
  for (const { key, value } of settings) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }
  console.log('✅ Đã tạo cài đặt hệ thống');

  console.log('🎉 Hoàn tất tạo dữ liệu mặc định!');
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi tạo dữ liệu:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
