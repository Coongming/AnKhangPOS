import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import ChatBot from '@/components/ChatBot';
import { ToastProvider } from '@/components/Toast';
import { cookies } from 'next/headers';
import { Inter, Shrikhand, Dancing_Script } from 'next/font/google';

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
});

const shrikhand = Shrikhand({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-shrikhand',
});

const dancingScript = Dancing_Script({
  subsets: ['latin', 'vietnamese'],
  weight: ['700'],
  display: 'swap',
  variable: '--font-dancing',
});

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
    <html lang="vi" className={`${inter.className} ${shrikhand.variable} ${dancingScript.variable}`}>
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
              <ChatBot />
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