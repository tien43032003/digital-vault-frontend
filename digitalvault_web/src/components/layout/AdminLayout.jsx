import { CalendarClock, CreditCard, History, KeyRound, LayoutDashboard, LogOut, Plug, ShieldCheck, SlidersHorizontal, Users, Workflow } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import BrandLogo from '../common/BrandLogo'
import PortalSwitcher from './PortalSwitcher'

const ADMIN_ITEMS = [
  { label: 'Tổng quan hệ thống', icon: LayoutDashboard, to: '/admin/dashboard' },
  { label: 'Quản lý người dùng & KYC', icon: Users, to: '/admin/users' },
  { label: 'Vai trò & phân quyền', icon: KeyRound, to: '/admin/roles' },
  { label: 'Giám sát mã hóa & khóa', icon: ShieldCheck, to: '/admin/hsm' },
  { label: 'Quy trình bàn giao', icon: Workflow, to: '/admin/handovers' },
]

const BILLING_ITEMS = [
  { label: 'Gói dịch vụ & Thanh toán', icon: CreditCard, to: '/admin/plans' },
  { label: 'Đăng ký gói của người dùng', icon: CalendarClock, to: '/admin/subscriptions' },
  { label: 'Nhật ký kiểm toán hệ thống', icon: History, to: '/admin/audit-logs' },
  { label: 'Trạng thái tích hợp dịch vụ', icon: Plug, to: '/admin/integrations' },
  { label: 'Cấu hình tham số', icon: SlidersHorizontal, to: '/admin/settings' },
]

function initialsFromEmail(email = '') {
  const name = email.split('@')[0].replace(/[^a-zA-Z]/g, '')
  return (name.slice(0, 2) || 'AD').toUpperCase()
}

function SidebarItem({ label, icon: Icon, to }) {
  return (
    <NavLink to={to} className="av-nav-item">
      <Icon size={16} aria-hidden="true" />
      <span className="flex-grow-1 text-truncate" style={{ minWidth: 0 }}>{label}</span>
    </NavLink>
  )
}

function SidebarSection({ title, items }) {
  return (
    <div>
      <p className="av-section-title">{title}</p>
      <div className="mt-2 d-flex flex-column gap-1">
        {items.map((item) => (
          <SidebarItem key={item.label} {...item} />
        ))}
      </div>
    </div>
  )
}

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/', { replace: true })
  }

  return (
    <div className="av-owner-shell">
      <aside className="av-sidebar">
        <div className="av-sidebar-head">
          <BrandLogo subtitle="AUDIT & CONTROL CENTER" />
        </div>

        <nav aria-label="Điều hướng Quản Trị Hệ Thống" className="av-sidebar-nav d-flex flex-column gap-4">
          <SidebarSection title="QUẢN TRỊ HỆ THỐNG" items={ADMIN_ITEMS} />
          <SidebarSection title="THANH TOÁN &amp; BẢO MẬT" items={BILLING_ITEMS} />
        </nav>

        <div className="d-flex flex-column gap-3 p-3" style={{ borderTop: '1px solid var(--av-slate-100)' }}>
          <div className="av-info-box" style={{ padding: 12 }}>
            <p className="d-flex align-items-center gap-2 mb-0 fs-12 fw-semibold text-brand">
              <ShieldCheck size={14} aria-hidden="true" />
              Trung Tâm Kiểm Soát
            </p>
            <p className="mt-1 mb-0 fs-11 text-slate-500" style={{ lineHeight: 1.6 }}>
              Giám sát hạ tầng mã hóa HSM L4, quản lý người dùng và rà soát audit log.
            </p>
          </div>

          <PortalSwitcher />

          <div className="av-user-box">
            <span className="av-avatar">{initialsFromEmail(user?.email)}</span>
            <div className="flex-grow-1" style={{ minWidth: 0 }}>
              <p className="mb-0 text-truncate fs-12 fw-semibold text-ink">{user?.email}</p>
              <p className="mb-0 font-mono fs-10 text-slate-400">SYSTEM ADMIN</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Đăng xuất"
              title="Đăng xuất"
              className="av-logout-btn"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-grow-1 p-4" style={{ minWidth: 0 }}>
        <Outlet />
      </main>
    </div>
  )
}
