import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, verifyAuthToken } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const hasValidSession = await verifyAuthToken(token);
  const isLoginPage = req.nextUrl.pathname === '/login';
  const isLoginApi = req.nextUrl.pathname === '/api/auth/login';
  const isApiRoute = req.nextUrl.pathname.startsWith('/api/');

  if (isLoginApi) {
    return NextResponse.next();
  }

  if (!hasValidSession && isApiRoute) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  }

  if (!hasValidSession && !isLoginPage) {
    const response = NextResponse.redirect(new URL('/login', req.url));
    response.cookies.set(AUTH_COOKIE_NAME, '', { maxAge: 0, path: '/' });
    return response;
  }

  if (hasValidSession && isLoginPage) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
