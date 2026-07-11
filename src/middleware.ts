import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, verifyAuthToken, parseAuthToken } from '@/lib/auth';
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit';

const ADMIN_ONLY_ROUTES = ['/api/sync', '/api/backup', '/api/settings'];

const RATE_LIMITED_ROUTES: Record<string, string> = {
  '/api/sync': 'sync',
  '/api/backup/restore': 'backup',
  '/api/backup': 'backup',
  '/api/settings': 'settings',
  '/api/chat': 'chat',
};

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const hasValidSession = await verifyAuthToken(token);
  const isLoginPage = req.nextUrl.pathname === '/login';
  const isLoginApi = req.nextUrl.pathname === '/api/auth/login';
  const isApiRoute = req.nextUrl.pathname.startsWith('/api/');

  if (isLoginApi) return NextResponse.next();
  if (!hasValidSession && isApiRoute) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  if (!hasValidSession && !isLoginPage) {
    const response = NextResponse.redirect(new URL('/login', req.url));
    response.cookies.set(AUTH_COOKIE_NAME, '', { maxAge: 0, path: '/' });
    return response;
  }
  if (hasValidSession && isLoginPage) return NextResponse.redirect(new URL('/', req.url));

  if (hasValidSession && isApiRoute) {
    const isAdminRoute = ADMIN_ONLY_ROUTES.some(r => req.nextUrl.pathname.startsWith(r));
    if (isAdminRoute) {
      const session = await parseAuthToken(token);
      if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 });
      }
    }
    const rateLimitGroup = Object.entries(RATE_LIMITED_ROUTES).find(([path]) => req.nextUrl.pathname.startsWith(path));
    if (rateLimitGroup) {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const config = RATE_LIMITS[rateLimitGroup[1]];
      if (config) {
        const result = checkRateLimit(getRateLimitKey(ip, rateLimitGroup[1]), config);
        if (!result.allowed) {
          return NextResponse.json({ error: `Quá nhiều request. Đợi ${Math.ceil(result.retryAfterMs / 1000)}s` }, { status: 429 });
        }
      }
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
