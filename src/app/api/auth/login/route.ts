import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_COOKIE_NAME,
  createAuthToken,
  getAdminCredentials,
  getAuthCookieOptions,
  checkLoginRateLimit,
} from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { username, password, action } = await req.json();

    if (action === 'logout') {
      const response = NextResponse.json({ success: true });
      response.cookies.set(AUTH_COOKIE_NAME, '', { ...getAuthCookieOptions(), maxAge: 0 });
      return response;
    }

    // Rate limit
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const rateCheck = checkLoginRateLimit(ip);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Quá nhiều lần thử. Vui lòng đợi ${Math.ceil(rateCheck.retryAfterMs / 1000)}s` },
        { status: 429 }
      );
    }

    const adminCredentials = getAdminCredentials();
    if (!adminCredentials) {
      return NextResponse.json({ error: 'Chưa cấu hình tài khoản đăng nhập' }, { status: 500 });
    }

    if (username !== adminCredentials.username || password !== adminCredentials.password) {
      return NextResponse.json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' }, { status: 401 });
    }

    const token = await createAuthToken(username, 'admin');
    const response = NextResponse.json({ success: true, role: 'admin' });
    response.cookies.set(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
    return response;
  } catch {
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
