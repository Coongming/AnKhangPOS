import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_COOKIE_NAME,
  createAuthToken,
  getAdminCredentials,
  getAuthCookieOptions,
} from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { username, password, action } = await req.json();

    // Logout
    if (action === 'logout') {
      const response = NextResponse.json({ success: true });
      response.cookies.set(AUTH_COOKIE_NAME, '', {
        ...getAuthCookieOptions(),
        maxAge: 0,
      });
      return response;
    }

    const adminCredentials = getAdminCredentials();
    if (!adminCredentials) {
      return NextResponse.json(
        { error: 'Chưa cấu hình tài khoản đăng nhập' },
        { status: 500 }
      );
    }

    // Login
    if (username !== adminCredentials.username || password !== adminCredentials.password) {
      return NextResponse.json(
        { error: 'Tên đăng nhập hoặc mật khẩu không đúng' },
        { status: 401 }
      );
    }

    const token = await createAuthToken(username);
    const response = NextResponse.json({ success: true });
    response.cookies.set(AUTH_COOKIE_NAME, token, getAuthCookieOptions());

    return response;
  } catch {
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
