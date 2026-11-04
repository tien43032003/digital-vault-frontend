import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import LandingPage from './LandingPage'

vi.mock('../callapi/authApi', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  checkSession: vi.fn(),
  register: vi.fn(),
}))

describe('LandingPage', () => {
  it('render_Default_ShowsHeaderHeroAndLoginCard', () => {
    renderWithProviders(<LandingPage />)
    expect(screen.getByRole('navigation')).toHaveTextContent('Chuẩn bảo mật E2EE')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bảo Vệ & Chuyển Giao')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Di Sản Kỹ Thuật Số')
    expect(screen.getByText('ZERO-KNOWLEDGE ENCRYPTION & LEGAL BINDING')).toBeInTheDocument()
    expect(screen.getByText("Cơ chế điểm danh sự sống (Dead Man's Switch)")).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Đăng Nhập Cổng An Toàn' })).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toHaveTextContent('AES-256-GCM')
  })

  it('accessButton_Rendered_LinksToLoginCard', () => {
    renderWithProviders(<LandingPage />)
    expect(screen.getByRole('link', { name: /Cổng Truy Cập/ })).toHaveAttribute('href', '#login')
  })
})

describe('LandingPage register flow', () => {
  it('registerLink_Clicked_OpensRegisterModal', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    renderWithProviders(<LandingPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Đăng ký tạo Vault mới' }))
    expect(screen.getByRole('dialog', { name: 'Đăng Ký Tạo Kho Di Sản Số Mới' })).toBeInTheDocument()
  })

  it('register_Success_ClosesModalAndPrefillsLoginEmail', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const authApi = await import('../callapi/authApi')
    authApi.register.mockResolvedValue({ userId: 1 })
    renderWithProviders(<LandingPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Đăng ký tạo Vault mới' }))
    await userEvent.type(screen.getByLabelText(/^Họ và tên chủ sở hữu/), 'Nguyễn Văn An')
    await userEvent.type(screen.getByLabelText(/^Email chính thức/), 'an.nguyen@example.com')
    await userEvent.type(screen.getByLabelText(/^Số điện thoại/), '0901234567')
    await userEvent.type(screen.getByLabelText(/^Mật khẩu tài khoản/), 'Secure#Pass2026')
    await userEvent.type(screen.getByLabelText(/^Xác nhận mật khẩu/), 'Secure#Pass2026')
    await userEvent.click(screen.getByRole('checkbox', { name: /Tôi đồng ý/ }))
    await userEvent.click(screen.getByRole('button', { name: /Tạo Kho Di Sản Ngay/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^Email$|^Email \*/)).toHaveValue('an.nguyen@example.com')
    expect(screen.getByRole('status')).toHaveTextContent('Đăng ký thành công')
  })
})

describe('LandingPage signed-in visitor', () => {
  const STORED_KEY = 'aeterna.user'

  const renderAsSignedIn = async (roles) => {
    const authApi = await import('../callapi/authApi')
    sessionStorage.setItem(STORED_KEY, JSON.stringify({ userId: 1, roles, email: 'an@example.com' }))
    authApi.checkSession.mockResolvedValue({ userId: 1, fullName: 'An', email: 'an@example.com', roles })
    return renderWithProviders(<LandingPage />, {
      extraRoutes: [
        { path: '/owner/assets', element: <p>owner-assets-page</p> },
        { path: '/admin', element: <p>admin-portal-page</p> },
        { path: '/beneficiary', element: <p>beneficiary-portal-page</p> },
      ],
    })
  }

  afterEach(() => sessionStorage.clear())

  it('visit_SignedInOwner_GoesStraightToOwnerWorkspaceInsteadOfShowingLogin', async () => {
    await renderAsSignedIn(['Owner'])
    expect(await screen.findByText('owner-assets-page')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Đăng Nhập Cổng An Toàn' })).not.toBeInTheDocument()
  })

  it('visit_SignedInAdmin_GoesToAdminPortal', async () => {
    await renderAsSignedIn(['Admin'])
    expect(await screen.findByText('admin-portal-page')).toBeInTheDocument()
  })

  it('visit_SignedInWithoutAnyRole_StaysOnLandingBecauseThereIsNowhereToGo', async () => {
    await renderAsSignedIn([])
    expect(await screen.findByRole('heading', { name: 'Đăng Nhập Cổng An Toàn' })).toBeInTheDocument()
  })

  it('visit_WhileCheckingSavedSession_ShowsCheckingMessageInsteadOfFlashingLogin', async () => {
    await renderAsSignedIn(['Owner'])
    expect(screen.getByRole('status')).toHaveTextContent('Đang kiểm tra phiên đăng nhập')
    expect(screen.queryByRole('heading', { name: 'Đăng Nhập Cổng An Toàn' })).not.toBeInTheDocument()
    await screen.findByText('owner-assets-page')
  })

  it('visit_SavedSessionExpired_ShowsLoginForm', async () => {
    const authApi = await import('../callapi/authApi')
    sessionStorage.setItem(STORED_KEY, JSON.stringify({ userId: 1, roles: ['Owner'], email: 'an@example.com' }))
    authApi.checkSession.mockResolvedValue(null)
    renderWithProviders(<LandingPage />, { extraRoutes: [{ path: '/owner/assets', element: <p>owner-assets-page</p> }] })
    expect(await screen.findByRole('heading', { name: 'Đăng Nhập Cổng An Toàn' })).toBeInTheDocument()
    expect(screen.queryByText('owner-assets-page')).not.toBeInTheDocument()
  })
})
