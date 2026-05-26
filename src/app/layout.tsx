import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import { ToastProvider } from '@/components/Toast';
import { cookies } from 'next/headers';

export const metadata: Metadata = {
  title: 'An Khang - Quản lý bán hàng',
  description: 'Ứng dụng quản lý bán hàng cho cửa hàng gạo & nước An Khang',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const isLoggedIn = !!cookieStore.get('auth_token');

  return (
    <html lang="vi">
      <body>
        <ToastProvider>
          {isLoggedIn ? (
            <div className="app-layout">
              <Sidebar />
              <main className="main-content">
                <div className="main-body">
                  {children}
                </div>
              </main>
            </div>
          ) : (
            <>{children}</>
          )}
        </ToastProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              document.addEventListener('wheel', function(e) {
                if (document.activeElement && document.activeElement.type === 'number') {
                  document.activeElement.blur();
                }
              }, { passive: true });
            `,
          }}
        />
      </body>
    </html>
  );
}