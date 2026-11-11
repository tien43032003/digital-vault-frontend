import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import AdminLayout from './AdminLayout'

vi.mock('../../hooks/useAuth', () => ({ useAuth: vi.fn() }))

const logout = vi.fn()

const renderLayout = (path = '/admin/dashboard') => {
  useAuth.mockReturnValue({ user: { userId: 8, roles: ['Admin'], email: 'admin@example.com' }, logout })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>landing-page</p>} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="dashboard" element={<p>dashboard-content</p>} />
          <Route path="users" element={<p>users-content</p>} />
          <Route path="roles" element={<p>roles-content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('AdminLayout', () => {
  beforeEach(() => {
    logout.mockReset().mockResolvedValue()
  })

  it('render_Default_ShowsSidebarAndOutlet', () => {
    renderLayout()
    expect(screen.getByText('AUDIT & CONTROL CENTER')).toBeInTheDocument()
    expect(screen.getByText('dashboard-content')).toBeInTheDocument()
  })

  it('nav_AllItems_LinkToTheirAdminPages', () => {
    renderLayout()
    const expected = {
      'Tổng quan hệ thống': '/admin/dashboard',
      'Quản lý người dùng & KYC': '/admin/users',
      'Vai trò & phân quyền': '/admin/roles',
      'Giám sát mã hóa & khóa': '/admin/hsm',
      'Quy trình bàn giao': '/admin/handovers',
      'Gói dịch vụ & Thanh toán': '/admin/plans',
      'Đăng ký gói của người dùng': '/admin/subscriptions',
      'Nhật ký kiểm toán hệ thống': '/admin/audit-logs',
      'Trạng thái tích hợp dịch vụ': '/admin/integrations',
      'Cấu hình tham số': '/admin/settings',
    }
    for (const [name, href] of Object.entries(expected)) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href)
    }
  })

  it('render_UsersRoute_MarksUsersLinkActive', () => {
    renderLayout('/admin/users')
    expect(screen.getByRole('link', { name: 'Quản lý người dùng & KYC' })).toHaveAttribute('aria-current', 'page')
  })

  it('nav_ClickRolesLink_ShowsRolesPage', async () => {
    renderLayout()
    await userEvent.click(screen.getByRole('link', { name: 'Vai trò & phân quyền' }))
    expect(screen.getByText('roles-content')).toBeInTheDocument()
  })

  it('logout_Click_LogsOutAndGoesToLanding', async () => {
    renderLayout()
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }))
    expect(logout).toHaveBeenCalled()
    expect(await screen.findByText('landing-page')).toBeInTheDocument()
  })
})
