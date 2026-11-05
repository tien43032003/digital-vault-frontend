import { Activity, Bell, ClipboardList, CreditCard, FolderLock, History, LogOut, Settings, ShieldCheck, UserCog, Users } from 'lucide-react'
import { Alert } from 'react-bootstrap'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useReadOnlyStatus } from '../../hooks/useReadOnlyStatus'
import { useUnreadNotifications } from '../../hooks/useUnreadNotifications'
import { formatUnreadCount } from '../../utils/notifications'
import BrandLogo from '../common/BrandLogo'
import PortalSwitcher from './PortalSwitcher'

const COMING_SOON = 'Sắp ra mắt'

const VAULT_ITEMS = [
  { label: 'Danh mục tài sản số', icon: FolderLock, to: '/owner/assets' },
  { label: 'Người thụ hưởng', icon: Users, to: '/owner/beneficiaries' },
  { label: 'Người thi hành (Executor)', icon: UserCog, to: '/owner/executor' },
  { label: 'Hồ sơ bàn giao', icon: ClipboardList, to: '/owner/handovers' },
  { label: 'Gói dịch vụ', icon: CreditCard, to: '/owner/plans' },
]

const MONITOR_ITEMS = [
  { label: 'Thông báo', icon: Bell, to: '/owner/notifications', unreadBadge: true },
  { label: 'Điểm danh sự sống', icon: Activity, to: '/owner/proof-of-life' },
  { label: 'Nhật ký hoạt động', icon: History, to: '/owner/activity-log' },
  { label: 'Cài đặt bảo mật', icon: Settings, to: '/owner/security' },
]

// Lấy 2 ký tự viết tắt từ phần tên của email để làm avatar
function initialsFromEmail(email = '') {
  const name = email.split('@')[0].replace(/[^a-zA-Z]/g, '')
  return (name.slice(0, 2) || 'VO').toUpperCase()
}

// Huy hiệu số thông báo chưa đọc cạnh mục Thông báo
function UnreadBadge() {
  const count = useUnreadNotifications()
  if (!count) return null
  return (
    <span className="av-badge av-badge-warn" aria-label={`${count} thông báo chưa đọc`}>
      {formatUnreadCount(count)}
    </span>
  )
}

function SidebarItem({ label, icon: Icon, to, unreadBadge }) {
  if (!to) {
    // Chức năng BE chưa có API: hiển thị theo thiết kế nhưng vô hiệu hoá
    return (
      <button type="button" disabled title={COMING_SOON} className="av-nav-item">
        <Icon size={16} aria-hidden="true" />
        <span className="flex-grow-1 text-start text-truncate" style={{ minWidth: 0 }}>{label}</span>
        <span className="av-soon-badge">{COMING_SOON}</span>
      </button>
    )
  }
  return (
    <NavLink to={to} className="av-nav-item">
      <Icon size={16} aria-hidden="true" />
      <span className="flex-grow-1 text-truncate" style={{ minWidth: 0 }}>{label}</span>
      {unreadBadge && <UnreadBadge />}
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

// Khung giao diện khu vực Vault Owner: sidebar trái + nội dung bên phải
export default function OwnerLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const readOnly = useReadOnlyStatus()
  // Trang Gói dịch vụ và Thanh toán tự giải thích tình trạng gói nên không lặp lại dải thông báo
  const onPlansPage = useLocation().pathname.startsWith('/owner/plans')

  const handleLogout = async () => {
    await logout()
    navigate('/', { replace: true })
  }

  return (
    <div className="av-owner-shell">
      <aside className="av-sidebar">
        <div className="av-sidebar-head">
          <BrandLogo subtitle="VAULT OWNER PORTAL" />
        </div>

        <nav aria-label="Điều hướng Vault Owner" className="av-sidebar-nav d-flex flex-column gap-4">
          <SidebarSection title="KHO TÀI SẢN SỐ" items={VAULT_ITEMS} />
          <SidebarSection title="GIÁM SÁT & BẢO MẬT" items={MONITOR_ITEMS} />
        </nav>

        <div className="d-flex flex-column gap-3 p-3" style={{ borderTop: '1px solid var(--av-slate-100)' }}>
          <div className="av-info-box" style={{ padding: 12 }}>
            <p className="d-flex align-items-center gap-2 mb-0 fs-12 fw-semibold text-brand">
              <ShieldCheck size={14} aria-hidden="true" />
              Bảo Chứng Số Hiệu &amp; E2EE
            </p>
            <p className="mt-1 mb-0 fs-11 text-slate-500" style={{ lineHeight: 1.6 }}>
              Dữ liệu tài sản được mã hóa AES-256-GCM trước khi lưu trữ.
            </p>
          </div>

          <PortalSwitcher />

          <div className="av-user-box">
            <span className="av-avatar">{initialsFromEmail(user?.email)}</span>
            <div className="flex-grow-1" style={{ minWidth: 0 }}>
              <p className="mb-0 text-truncate fs-12 fw-semibold text-ink">{user?.email}</p>
              <p className="mb-0 font-mono fs-10 text-slate-400">VAULT OWNER</p>
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
        {readOnly && !onPlansPage && (
          <Alert variant="warning" className="av-alert mb-4 d-flex flex-wrap align-items-center justify-content-between gap-2">
            <span>Gói dịch vụ của bạn đã hết hạn nên tài khoản đang ở chế độ chỉ xem. Bạn vẫn xem được dữ liệu và điểm danh sự sống; hãy gia hạn để tiếp tục thao tác.</span>
            <Link to="/owner/plans">Xem các gói dịch vụ</Link>
          </Alert>
        )}
        <Outlet />
      </main>
    </div>
  )
}
