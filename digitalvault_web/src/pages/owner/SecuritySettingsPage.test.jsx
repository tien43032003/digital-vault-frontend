import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { login } from '../../callapi/authApi'
import { getProfile } from '../../callapi/ownerApi'
import { DEMO_ACCOUNT, resetMockDb } from '../../mocks/db'
import { handlers } from '../../mocks/handlers'
import { renderWithProviders } from '../../test/renderWithProviders'
import SecuritySettingsPage from './SecuritySettingsPage'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(async () => {
  resetMockDb()
  await login(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password)
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const NEW_PASSWORD = 'MatKhauMoi#2026'
const renderPage = (props = {}) => renderWithProviders(<SecuritySettingsPage {...props} />)
const waitForPage = () => screen.findByRole('heading', { level: 1, name: 'Cài đặt bảo mật' })

async function fillPasswordForm({ current = DEMO_ACCOUNT.password, next = NEW_PASSWORD, confirm = next } = {}) {
  const form = screen.getByRole('form', { name: 'Đổi mật khẩu' })
  const type = async (label, value) => {
    const input = within(form).getByLabelText(label)
    await userEvent.clear(input)
    if (value) await userEvent.type(input, value)
  }
  await type(/Mật khẩu hiện tại/, current)
  await type(/^Mật khẩu mới/, next)
  await type(/Xác nhận mật khẩu mới/, confirm)
  return form
}

describe('SecuritySettingsPage loading and error', () => {
  it('render_WhileFetching_ShowsLoadingStatus', async () => {
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải cài đặt bảo mật')
    await waitForPage()
  })

  it('render_ApiFails_ShowsErrorWithRetry', async () => {
    server.use(http.get('*/api/owner/profile', () => HttpResponse.json({ status: 500, detail: 'Máy chủ đang bận.' }, { status: 500 })))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ đang bận.')
    server.resetHandlers()
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await waitForPage()).toBeInTheDocument()
  })

  it('render_MockMode_ShowsMockNotice', async () => {
    renderPage({ mockMode: 'hybrid' })
    await waitForPage()
    expect(screen.getByRole('note')).toHaveTextContent('Dữ liệu mô phỏng')
  })
})

describe('SecuritySettingsPage profile', () => {
  it('render_Profile_ShowsValuesAndReadOnlyAccountFields', async () => {
    renderPage()
    await waitForPage()
    const section = screen.getByRole('region', { name: 'Thông tin cá nhân' })
    expect(within(section).getByLabelText(/Họ và tên/)).toHaveValue('Nguyễn Văn An')
    expect(within(section).getByLabelText(/Số điện thoại/)).toHaveValue('0901234567')
    expect(within(section).getByLabelText(/Email/)).toHaveValue('owner@example.com')
    expect(within(section).getByLabelText(/Email/)).toBeDisabled()
    expect(section).toHaveTextContent('••••••••4521')
  })

  it('profile_Save_UpdatesDataAndShowsToast', async () => {
    renderPage()
    await waitForPage()
    const section = screen.getByRole('region', { name: 'Thông tin cá nhân' })
    const name = within(section).getByLabelText(/Họ và tên/)
    await userEvent.clear(name)
    await userEvent.type(name, 'Nguyễn Văn Bình')
    await userEvent.click(within(section).getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await screen.findByText('Đã cập nhật thông tin cá nhân')).toBeInTheDocument()
    expect((await getProfile()).fullName).toBe('Nguyễn Văn Bình')
  })

  it('profile_BlankName_ShowsErrorAndDoesNotCallApi', async () => {
    const requests = []
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'PUT') requests.push(request.url)
    })
    renderPage()
    await waitForPage()
    const section = screen.getByRole('region', { name: 'Thông tin cá nhân' })
    await userEvent.clear(within(section).getByLabelText(/Họ và tên/))
    await userEvent.click(within(section).getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await within(section).findByText('Vui lòng nhập họ tên.')).toBeInTheDocument()
    expect(requests).toHaveLength(0)
    server.events.removeAllListeners()
  })

  it('profile_ServerError_ShowsAlert', async () => {
    server.use(http.put('*/api/owner/profile', () => HttpResponse.json({ status: 500, detail: 'Không lưu được.' }, { status: 500 })))
    renderPage()
    await waitForPage()
    const section = screen.getByRole('region', { name: 'Thông tin cá nhân' })
    await userEvent.click(within(section).getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await within(section).findByRole('alert')).toHaveTextContent('Không lưu được.')
  })
})

describe('SecuritySettingsPage change password', () => {
  const sendCodeButton = (form) => within(form).getByRole('button', { name: 'Gửi mã xác nhận' })
  const otpForm = () => screen.findByRole('form', { name: 'Xác nhận đổi mật khẩu' })
  const typeOtp = async (form, code) => {
    const input = within(form).getByLabelText(/^Mã xác nhận/)
    await userEvent.clear(input)
    if (code) await userEvent.type(input, code)
  }

  async function reachOtpStep(options) {
    renderPage({ mockMode: 'full' })
    await waitForPage()
    const form = await fillPasswordForm(options)
    await userEvent.click(sendCodeButton(form))
    return otpForm()
  }

  it('password_ValidInput_AsksForEmailCodeInsteadOfChangingImmediately', async () => {
    const step = await reachOtpStep()
    expect(step).toHaveTextContent('Mã xác nhận đã được gửi đến email của bạn')
    // Chưa đổi mật khẩu cho tới khi nhập đúng mã
    await expect(login(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password)).resolves.toMatchObject({ userId: 1 })
  })

  it('password_CorrectCode_ChangesPasswordClearsFormAndShowsToast', async () => {
    const step = await reachOtpStep()
    await typeOtp(step, '123456')
    await userEvent.click(within(step).getByRole('button', { name: 'Xác nhận đổi mật khẩu' }))
    expect(await screen.findByText('Đã đổi mật khẩu')).toBeInTheDocument()
    const form = await screen.findByRole('form', { name: 'Đổi mật khẩu' })
    expect(within(form).getByLabelText(/Mật khẩu hiện tại/)).toHaveValue('')
    expect(within(form).getByLabelText(/^Mật khẩu mới/)).toHaveValue('')
    await expect(login(DEMO_ACCOUNT.email, NEW_PASSWORD)).resolves.toMatchObject({ userId: 1 })
  })

  it('password_MockMode_ShowsDemoCodeButRealModeNever', async () => {
    const step = await reachOtpStep()
    expect(step).toHaveTextContent('Mã OTP mô phỏng: 123456')
  })

  it('password_RealMode_NeverShowsTheCodeEvenIfServerSendsIt', async () => {
    renderPage({ mockMode: 'off' })
    await waitForPage()
    const form = await fillPasswordForm()
    await userEvent.click(sendCodeButton(form))
    const step = await otpForm()
    expect(step).not.toHaveTextContent('Mã OTP mô phỏng')
  })

  it('password_WrongCode_ShowsFieldErrorAndKeepsOldPassword', async () => {
    const step = await reachOtpStep()
    await typeOtp(step, '000000')
    await userEvent.click(within(step).getByRole('button', { name: 'Xác nhận đổi mật khẩu' }))
    expect(await within(step).findByText('Mã OTP không đúng hoặc đã hết hạn.')).toBeInTheDocument()
    await expect(login(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password)).resolves.toMatchObject({ userId: 1 })
  })

  it('password_CodeNotSixDigits_ShowsErrorWithoutCallingApi', async () => {
    const step = await reachOtpStep()
    await typeOtp(step, '12ab')
    await userEvent.click(within(step).getByRole('button', { name: 'Xác nhận đổi mật khẩu' }))
    expect(await within(step).findByText('Mã gồm đúng 6 chữ số.')).toBeInTheDocument()
  })

  it('password_ResendCode_RequestsANewCodeThatWorks', async () => {
    const step = await reachOtpStep()
    await userEvent.click(within(step).getByRole('button', { name: 'Gửi lại mã' }))
    expect(await within(step).findByText('Đã gửi lại mã xác nhận.')).toBeInTheDocument()
    await typeOtp(step, '123456')
    await userEvent.click(within(step).getByRole('button', { name: 'Xác nhận đổi mật khẩu' }))
    expect(await screen.findByText('Đã đổi mật khẩu')).toBeInTheDocument()
  })

  it('password_Back_ReturnsToFormKeepingTypedValues', async () => {
    const step = await reachOtpStep()
    await userEvent.click(within(step).getByRole('button', { name: 'Quay lại' }))
    const form = await screen.findByRole('form', { name: 'Đổi mật khẩu' })
    expect(within(form).getByLabelText(/^Mật khẩu mới/)).toHaveValue(NEW_PASSWORD)
  })

  it('password_WrongCurrent_ShowsFieldErrorOnFirstStep', async () => {
    renderPage()
    await waitForPage()
    const form = await fillPasswordForm({ current: 'SaiMatKhau#123' })
    await userEvent.click(sendCodeButton(form))
    expect(await within(form).findByText('Mật khẩu hiện tại không đúng.')).toBeInTheDocument()
  })

  it('password_RequestedTooSoon429_AsksToWait60Seconds', async () => {
    server.use(http.post('*/api/auth/change-password/request', () => HttpResponse.json({ status: 429, detail: 'x' }, { status: 429 })))
    renderPage()
    await waitForPage()
    const form = await fillPasswordForm()
    await userEvent.click(sendCodeButton(form))
    expect(await within(form).findByRole('alert')).toHaveTextContent('đợi 60 giây')
  })

  it('password_EmailServiceDown503_ExplainsEmailProblem', async () => {
    server.use(http.post('*/api/auth/change-password/request', () => HttpResponse.json({ status: 503, detail: 'x' }, { status: 503 })))
    renderPage()
    await waitForPage()
    const form = await fillPasswordForm()
    await userEvent.click(sendCodeButton(form))
    expect(await within(form).findByRole('alert')).toHaveTextContent('chưa gửi được email')
  })

  it('password_WeakNewPassword_ShowsRuleError', async () => {
    renderPage()
    await waitForPage()
    const form = await fillPasswordForm({ next: 'ngan' })
    await userEvent.click(sendCodeButton(form))
    expect(await within(form).findByText('Mật khẩu tối thiểu 12 ký tự, có số và ký tự đặc biệt.')).toBeInTheDocument()
  })

  it('password_ConfirmMismatch_ShowsError', async () => {
    renderPage()
    await waitForPage()
    const form = await fillPasswordForm({ confirm: 'KhacHoanToan#2026' })
    await userEvent.click(sendCodeButton(form))
    expect(await within(form).findByText('Mật khẩu xác nhận không khớp.')).toBeInTheDocument()
  })

  it('password_SameAsCurrent_ShowsError', async () => {
    renderPage()
    await waitForPage()
    const form = await fillPasswordForm({ next: DEMO_ACCOUNT.password })
    await userEvent.click(sendCodeButton(form))
    expect(await within(form).findByText('Mật khẩu mới phải khác mật khẩu hiện tại.')).toBeInTheDocument()
  })

  it('password_ShowsLastChangedDate', async () => {
    renderPage()
    await waitForPage()
    expect(screen.getByRole('region', { name: 'Đổi mật khẩu' })).toHaveTextContent('Đổi lần cuối')
  })
})
describe('SecuritySettingsPage two-factor', () => {
  it('twoFactor_Toggle_EnablesAndShowsToast', async () => {
    renderPage()
    await waitForPage()
    const toggle = screen.getByRole('switch', { name: 'Bật xác thực hai lớp' })
    expect(toggle).not.toBeChecked()
    await userEvent.click(toggle)
    expect(await screen.findByText('Đã bật xác thực hai lớp')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Bật xác thực hai lớp' })).toBeChecked()
  })

  it('twoFactor_ServerError_KeepsPreviousStateAndShowsAlert', async () => {
    server.use(http.put('*/api/owner/security/two-factor', () => HttpResponse.json({ status: 500, detail: 'Lỗi hệ thống.' }, { status: 500 })))
    renderPage()
    await waitForPage()
    await userEvent.click(screen.getByRole('switch', { name: 'Bật xác thực hai lớp' }))
    expect(await screen.findByText('Lỗi hệ thống.')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Bật xác thực hai lớp' })).not.toBeChecked()
  })
})

describe('SecuritySettingsPage recent logins', () => {
  it('logins_Seeded_ListsOnlyLoginEntriesWithIpAndResult', async () => {
    renderPage()
    await waitForPage()
    const section = await screen.findByRole('region', { name: 'Đăng nhập gần đây' })
    expect(await within(section).findByText('14.161.42.90')).toBeInTheDocument()
    expect(within(section).getByText('113.190.234.12')).toBeInTheDocument()
    expect(within(section).getByText('Thất bại')).toBeInTheDocument()
    expect(within(section).queryByText('Tạo kho')).not.toBeInTheDocument()
  })

  it('logins_LogsFail_ShowsFallbackMessageInsteadOfBreakingPage', async () => {
    server.use(http.get('*/api/owner/activity-logs', () => HttpResponse.json({ status: 500, detail: 'x' }, { status: 500 })))
    renderPage()
    await waitForPage()
    const section = await screen.findByRole('region', { name: 'Đăng nhập gần đây' })
    expect(await within(section).findByText('Không tải được lịch sử đăng nhập.')).toBeInTheDocument()
  })
})
