import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Whitelist các key được phép cập nhật
const ALLOWED_KEYS = new Set([
  'allow_negative_stock',
  'store_name',
  'store_phone',
  'store_address',
  'low_stock_threshold',
  'auto_backup',
  'receipt_footer',
  'default_payment_method',
]);

export async function GET() {
  try {
    const settings = await prisma.systemSetting.findMany();
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Settings GET error:', error);
    return NextResponse.json({ error: 'Lỗi tải cài đặt' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const invalidKeys = Object.keys(body).filter(k => !ALLOWED_KEYS.has(k));
    if (invalidKeys.length > 0) {
      return NextResponse.json(
        { error: `Key không hợp lệ: ${invalidKeys.join(', ')}` },
        { status: 400 }
      );
    }

    for (const [key, value] of Object.entries(body)) {
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { id: crypto.randomUUID(), key, value: String(value) },
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Settings PUT error:', error);
    return NextResponse.json({ error: 'Lỗi lưu cài đặt' }, { status: 500 });
  }
}
