'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard, Package, Truck, Users, ClipboardList,
  ShoppingCart, Receipt, Wallet, DollarSign, Warehouse,
  BarChart3, TrendingUp, FileText, PackageSearch, Settings,
  Database, History, Beaker, Menu, X, FileDown, LogOut,
} from 'lucide-react';

const navGroups = [
  {
    title: 'Tổng quan',
    items: [{ label: 'Bảng điều khiển', href: '/', icon: LayoutDashboard }],
  },
  {
    title: 'Danh mục',
    items: [
      { label: 'Sản phẩm', href: '/san-pham', icon: Package },
      { label: 'Nhà cung cấp', href: '/nha-cung-cap', icon: Truck },
      { label: 'Khách hàng', href: '/khach-hang', icon: Users },
      { label: 'Nhân viên', href: '/nhan-vien', icon: Users },
      { label: 'Danh mục chi phí', href: '/danh-muc-chi-phi', icon: ClipboardList },
    ],
  },
  {
    title: 'Nghiệp vụ',
    items: [
      { label: 'Bán hàng', href: '/ban-hang', icon: ShoppingCart },
      { label: 'Lịch sử bán hàng', href: '/lich-su-ban-hang', icon: Receipt },
      { label: 'Nhập hàng', href: '/nhap-hang', icon: ClipboardList },
      { label: 'Công nợ', href: '/cong-no', icon: Wallet },
      { label: 'Chi phí', href: '/chi-phi', icon: DollarSign },
      { label: 'Trộn gạo', href: '/tron-gao', icon: Beaker },
      { label: 'Tồn kho', href: '/ton-kho', icon: Warehouse },
    ],
  },
  {
    title: 'Báo cáo',
    items: [
      { label: 'Doanh thu', href: '/bao-cao/doanh-thu', icon: BarChart3 },
      { label: 'Lợi nhuận', href: '/bao-cao/loi-nhuan', icon: TrendingUp },
      { label: 'Công nợ', href: '/bao-cao/cong-no', icon: FileText },
      { label: 'Tồn kho', href: '/bao-cao/ton-kho', icon: PackageSearch },
      { label: 'Xuất báo cáo', href: '/xuat-bao-cao', icon: FileDown },
    ],
  },
  {
    title: 'Hệ thống',
    items: [
      { label: 'Cài đặt', href: '/he-thong/cai-dat', icon: Settings },
      { label: 'Sao lưu', href: '/he-thong/backup', icon: Database },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
    } catch { /* ignore */ }
    router.push('/login');
    router.refresh();
  };

  // Đóng sidebar khi chuyển trang
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Khóa scroll khi sidebar mobile mở
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const sidebarContent = (
    <>
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">AK</div>
        <div>
          <h1>An Khang</h1>
          <p>Quản lý bán hàng</p>
        </div>
        {/* Nút đóng trên mobile */}
        <button
          onClick={() => setMobileOpen(false)}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
          }}
          className="mobile-close-btn"
        >
          <X size={22} />
        </button>
      </div>
      <nav className="sidebar-nav">
        {navGroups.map((group) => (
          <div key={group.title} className="nav-group">
            <div className="nav-group-title">{group.title}</div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                >
                  <Icon />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-color)', marginTop: 'auto' }}>
        <button onClick={handleLogout} className="nav-item" style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--danger)', fontWeight: 600 }}>
          <LogOut size={18} />
          <span>Đăng xuất</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Nút hamburger - chỉ hiện trên mobile */}
      <button
        onClick={() => setMobileOpen(true)}
        style={{
          position: 'fixed',
          top: 12,
          left: 12,
          zIndex: 1000,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '6px 8px',
          cursor: 'pointer',
          color: 'var(--text-heading)',
          display: 'flex',
          alignItems: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
        className="hamburger-btn"
      >
        <Menu size={22} />
      </button>

      {/* Sidebar desktop - hiện thường */}
      <aside className="sidebar sidebar-desktop">
        {sidebarContent}
      </aside>

      {/* Overlay khi mobile sidebar mở */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 1001,
          }}
        />
      )}

      {/* Sidebar mobile - slide từ trái */}
      <aside
        className="sidebar sidebar-mobile"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          height: '100vh',
          zIndex: 1002,
          transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s ease',
        }}
      >
        {sidebarContent}
      </aside>
    </>
  );
}