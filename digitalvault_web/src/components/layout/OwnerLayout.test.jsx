import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useReadOnlyStatus } from '../../hooks/useReadOnlyStatus'
import { useUnreadNotifications } from '../../hooks/useUnreadNotifications'
import OwnerLayout from './OwnerLayout'

vi.mock('../../hooks/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('../../hooks/useUnreadNotifications', () => ({ useUnreadNotifications: vi.fn() }))
vi.mock('../../hooks/useReadOnlyStatus', () => ({ useReadOnlyStatus: vi.fn(() => false) }))

const logout = vi.fn()

const renderLayout = () => {
  useAuth.mockReturnValue({
    user: { userId: 1, roles: ['Owner'], email: 'an.nguyen@example.com' },
    logout,
  })
  return render(
    <MemoryRouter initialEntries={['/owner/assets']}>
      <Routes>
        <Route path="/" element={<p>landing-page</p>} />
        <Route path="/owner" element={<OwnerLayout />}>
          <Route path="assets" element={<p>assets-content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('OwnerLayout', () => {
  beforeEach(() => {
    logout.mockReset().mockResolvedValue()
    useUnreadNotifications.mockReset().mockReturnValue(0)
  })

  it('render_Default_ShowsSidebarSectionsAndOutlet', () => {
    renderLayout()
    expect(screen.getByText('VAULT OWNER PORTAL')).toBeInTheDocument()
    expect(screen.getByText('KHO TÀI SẢN SỐ')).toBeInTheDocument()
    expect(screen.getByText('GIÁM SÁT & BẢO MẬT')).toBeInTheDocument()
    expect(screen.getByText('assets-content')).toBeInTheDocument()
  })

  it('render_AssetsRoute_MarksAssetsLinkActive', () => {
    renderLayout()
    expect(screen.getByRole('link', { name: /Danh mục tài sản số/ })).toHaveAttribute('aria-current', 'page')
  })

  it('render_BeneficiariesLink_IsEnabled', () => {
    renderLayout()
    expect(screen.getByRole('link', { name: /Người thụ hưởng/ })).toHaveAttribute('href', '/owner/beneficiaries')
  })

  it('render_ProofOfLifeLink_IsEnabled', () => {
    renderLayout()
    expect(screen.getByRole('link', { name: /Điểm danh sự sống/ })).toHaveAttribute('href', '/owner/proof-of-life')
  })

  it('render_ExecutorLink_IsEnabled', () => {
    renderLayout()
    expect(screen.getByRole('link', { name: /Người thi hành/ })).toHaveAttribute('href', '/owner/executor')
  })

  it('render_ActivityLogLink_IsEnabled', () => {
    renderLayout()
    expect(screen.getByRole('link', { name: /Nhật ký hoạt động/ })).toHaveAttribute('href', '/owner/activity-log')
  })

  it('render_HandoversLink_IsEnabled', () => {
    renderLayout()
    expect(screen.getByRole('link', { name: /Hồ sơ bàn giao/ })).toHaveAttribute('href', '/owner/handovers')
  })

  it('render_SecuritySettingsLink_IsEnabled', () => {
    renderLayout()
    expect(screen.getByRole('link', { name: /Cài đặt bảo mật/ })).toHaveAttribute('href', '/owner/security')
  })

  it('render_AllSidebarItems_AreLinks', () => {
    renderLayout()
    const nav = screen.getByRole('navigation', { name: 'Điều hướng Vault Owner' })
    expect(within(nav).queryAllByRole('button')).toHaveLength(0)
    expect(within(nav).getAllByRole('link')).toHaveLength(9)
  })

  it('render_LoggedInUser_ShowsEmailAndInitials', () => {
    renderLayout()
    expect(screen.getByText('an.nguyen@example.com')).toBeInTheDocument()
    expect(screen.getByText('AN')).toBeInTheDocument()
  })

  it('logout_Clicked_LogsOutAndReturnsToLanding', async () => {
    renderLayout()
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }))
    expect(logout).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('landing-page')).toBeInTheDocument()
  })
})

describe('OwnerLayout read-only banner', () => {
  const renderAt = (path) => {
    useAuth.mockReturnValue({ user: { userId: 1, roles: ['Owner'], email: 'an.nguyen@example.com' }, logout })
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/owner" element={<OwnerLayout />}>
            <Route path="assets" element={<p>assets-content</p>} />
            <Route path="plans" element={<p>plans-content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
  }

  beforeEach(() => {
    useUnreadNotifications.mockReset().mockReturnValue(0)
  })

  it('banner_ReadOnly_ShowsExplanationWithLinkToPlans', () => {
    useReadOnlyStatus.mockReturnValue(true)
    renderAt('/owner/assets')
    expect(screen.getByRole('alert')).toHaveTextContent('chỉ xem')
    expect(screen.getByRole('link', { name: 'Xem các gói dịch vụ' })).toHaveAttribute('href', '/owner/plans')
    expect(screen.getByText('assets-content')).toBeInTheDocument()
  })

  it('banner_ReadOnlyOnPlansPage_IsHiddenBecauseThePageExplainsItself', () => {
    useReadOnlyStatus.mockReturnValue(true)
    renderAt('/owner/plans')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('banner_NotReadOnly_IsHidden', () => {
    useReadOnlyStatus.mockReturnValue(false)
    renderAt('/owner/assets')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('OwnerLayout plans entry', () => {
  beforeEach(() => {
    logout.mockReset().mockResolvedValue()
    useUnreadNotifications.mockReset().mockReturnValue(0)
  })

  it('nav_Plans_LinksToPlansPage', () => {
    renderLayout()
    expect(screen.getByRole('link', { name: 'Gói dịch vụ' })).toHaveAttribute('href', '/owner/plans')
  })
})

describe('OwnerLayout notifications entry', () => {
  beforeEach(() => {
    logout.mockReset().mockResolvedValue()
  })

  it('nav_Notifications_LinksToNotificationsPage', () => {
    useUnreadNotifications.mockReturnValue(0)
    renderLayout()
    expect(screen.getByRole('link', { name: /Thông báo/ })).toHaveAttribute('href', '/owner/notifications')
  })

  it('nav_NoUnread_ShowsNoBadge', () => {
    useUnreadNotifications.mockReturnValue(0)
    renderLayout()
    expect(screen.queryByLabelText(/chưa đọc/)).not.toBeInTheDocument()
  })

  it('nav_UnreadNotifications_ShowsCountBadge', () => {
    useUnreadNotifications.mockReturnValue(3)
    renderLayout()
    expect(screen.getByLabelText('3 thông báo chưa đọc')).toHaveTextContent('3')
  })

  it('nav_ManyUnread_CapsBadgeAtNinetyNinePlus', () => {
    useUnreadNotifications.mockReturnValue(150)
    renderLayout()
    expect(screen.getByLabelText('150 thông báo chưa đọc')).toHaveTextContent('99+')
  })
})
