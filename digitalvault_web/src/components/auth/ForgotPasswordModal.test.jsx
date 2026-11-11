import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { login } from '../../callapi/authApi'
import { DEMO_ACCOUNT, resetMockDb } from '../../mocks/db'
import { handlers } from '../../mocks/handlers'
import ForgotPasswordModal from './ForgotPasswordModal'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockDb()
  sessionStorage.removeItem('aeterna.user')
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const NEW_PASSWORD = 'MatKhauMoi#2026'

function renderModal(props = {}) {
  const handlersProps = { onClose: vi.fn(), onReset: vi.fn() }
  render(<ForgotPasswordModal initialEmail={DEMO_ACCOUNT.email} mockMode="full" {...handlersProps} {...props} />)
  return handlersProps
}

const dialog = () => screen.getByRole('dialog', { name: 'Quên Mật Khẩu' })
const sendCode = () => userEvent.click(within(dialog()).getByRole('button', { name: 'Gửi mã xác nhận' }))
const readMockOtp = async () => (await within(dialog()).findByText(/Mã OTP mô phỏng: \d{6}/)).textContent.match(/\d{6}/)[0]

async function reachOtpStep(email) {
  if (email !== undefined) {
    const field = within(dialog()).getByLabelText(/^Email/)
    await userEvent.clear(field)
    await userEvent.type(field, email)
  }
  await sendCode()
  await within(dialog()).findByLabelText(/^Mã xác nhận/)
}

async function reachPasswordStep() {
  await reachOtpStep()
  await userEvent.type(within(dialog()).getByLabelText(/^Mã xác nhận/), await readMockOtp())
  await userEvent.click(within(dialog()).getByRole('button', { name: 'Xác nhận mã' }))
  await within(dialog()).findByLabelText(/^Mật khẩu mới/)
}

describe('ForgotPasswordModal email step', () => {
  it('render_InitialEmail_PrefillsField', () => {
    renderModal()
    expect(within(dialog()).getByLabelText(/^Email/)).toHaveValue(DEMO_ACCOUNT.email)
    expect(within(dialog()).getByRole('button', { name: 'Gửi mã xác nhận' })).toBeEnabled()
  })

  it('send_EmptyEmail_ShowsError', async () => {
    renderModal({ initialEmail: '' })
    await sendCode()
    expect(await within(dialog()).findByText('Vui lòng nhập email.')).toBeInTheDocument()
  })

  it('send_InvalidEmail_ShowsError', async () => {
    renderModal({ initialEmail: 'abc' })
    await sendCode()
    expect(await within(dialog()).findByText('Email không hợp lệ.')).toBeInTheDocument()
  })

  it('send_KnownEmail_MovesToOtpStepShowingMaskedEmail', async () => {
    renderModal()
    await reachOtpStep()
    expect(dialog()).toHaveTextContent('o***r@example.com')
  })

  it('send_UnknownEmail_StillMovesToOtpStepWithoutRevealingAccount', async () => {
    renderModal()
    await reachOtpStep('khong.ton.tai@example.com')
    expect(dialog()).toHaveTextContent('k***i@example.com')
    expect(within(dialog()).queryByText(/Mã OTP mô phỏng/)).not.toBeInTheDocument()
  })

  it('send_ServerError_ShowsAlert', async () => {
    server.use(http.post('*/api/auth/forgot-password', () => HttpResponse.json({ status: 500, detail: 'Không gửi được thư.' }, { status: 500 })))
    renderModal()
    await sendCode()
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Không gửi được thư.')
  })

  it('send_TooManyRequests_ShowsWaitMessage', async () => {
    server.use(http.post('*/api/auth/forgot-password', () => HttpResponse.json({ status: 429, detail: 'x' }, { status: 429 })))
    renderModal()
    await sendCode()
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Bạn đã thử quá nhiều lần. Vui lòng đợi 1 phút rồi thử lại.')
  })

  it('send_EmailServiceNotConfigured503_ShowsReadableMessage', async () => {
    server.use(http.post('*/api/auth/forgot-password', () => HttpResponse.json({ status: 503, detail: 'Dịch vụ gửi email OTP chưa được cấu hình.' }, { status: 503 })))
    renderModal()
    await sendCode()
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Máy chủ chưa gửi được email xác nhận. Vui lòng thử lại sau.')
  })

  it('send_BackendReplyHasNoMaskedEmail_StillShowsMaskedTypedEmail', async () => {
    server.use(http.post('*/api/auth/forgot-password', () => HttpResponse.json({ expiresInSeconds: 300, message: 'Mã OTP đã được gửi.' })))
    renderModal()
    await reachOtpStep()
    expect(dialog()).toHaveTextContent('o***r@example.com')
  })

  it('cancel_Clicked_CallsOnClose', async () => {
    const props = renderModal()
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Hủy' }))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })
})

describe('ForgotPasswordModal mock hint', () => {
  it('otpStep_MockModeOn_ShowsDemoOtpHint', async () => {
    renderModal()
    await reachOtpStep()
    expect(await readMockOtp()).toMatch(/^\d{6}$/)
  })

  it('otpStep_MockModeOff_NeverShowsOtpEvenIfServerSendsIt', async () => {
    renderModal({ mockMode: 'off' })
    await reachOtpStep()
    expect(within(dialog()).queryByText(/Mã OTP mô phỏng/)).not.toBeInTheDocument()
  })
})

describe('ForgotPasswordModal otp step', () => {
  it('verify_NotSixDigits_ShowsErrorWithoutCallingApi', async () => {
    renderModal()
    await reachOtpStep()
    await userEvent.type(within(dialog()).getByLabelText(/^Mã xác nhận/), '12ab')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Xác nhận mã' }))
    expect(await within(dialog()).findByText('Mã gồm đúng 6 chữ số.')).toBeInTheDocument()
  })

  it('verify_WrongCode_ShowsFieldError', async () => {
    renderModal()
    await reachOtpStep()
    const otp = await readMockOtp()
    await userEvent.type(within(dialog()).getByLabelText(/^Mã xác nhận/), otp === '000000' ? '111111' : '000000')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Xác nhận mã' }))
    expect(await within(dialog()).findByText('Mã xác nhận không đúng hoặc đã hết hạn.')).toBeInTheDocument()
  })

  it('verify_TooManyAttempts_ShowsLockedMessage', async () => {
    server.use(http.post('*/api/auth/forgot-password/verify-otp', () => HttpResponse.json({ status: 429, detail: 'x' }, { status: 429 })))
    renderModal()
    await reachOtpStep()
    await userEvent.type(within(dialog()).getByLabelText(/^Mã xác nhận/), '123456')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Xác nhận mã' }))
    expect(await within(dialog()).findByText('Bạn đã nhập sai quá nhiều lần. Vui lòng yêu cầu mã mới.')).toBeInTheDocument()
  })

  it('verify_CorrectCode_MovesToNewPasswordStep', async () => {
    renderModal()
    await reachPasswordStep()
    expect(within(dialog()).getByLabelText(/^Mật khẩu mới/)).toBeInTheDocument()
  })

  it('resend_Clicked_IssuesNewCodeThatWorks', async () => {
    renderModal()
    await reachOtpStep()
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Gửi lại mã' }))
    const fresh = await readMockOtp()
    await userEvent.type(within(dialog()).getByLabelText(/^Mã xác nhận/), fresh)
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Xác nhận mã' }))
    expect(await within(dialog()).findByLabelText(/^Mật khẩu mới/)).toBeInTheDocument()
  })

  it('changeEmail_Clicked_ReturnsToEmailStep', async () => {
    renderModal()
    await reachOtpStep()
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Đổi email' }))
    expect(within(dialog()).getByLabelText(/^Email/)).toHaveValue(DEMO_ACCOUNT.email)
  })
})

describe('ForgotPasswordModal new password step', () => {
  const fill = async (password, confirm = password) => {
    const field = within(dialog()).getByLabelText(/^Mật khẩu mới/)
    await userEvent.clear(field)
    if (password) await userEvent.type(field, password)
    const confirmField = within(dialog()).getByLabelText(/^Xác nhận mật khẩu mới/)
    await userEvent.clear(confirmField)
    if (confirm) await userEvent.type(confirmField, confirm)
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Đặt lại mật khẩu' }))
  }

  it('reset_EmptyFields_ShowsErrors', async () => {
    renderModal()
    await reachPasswordStep()
    await fill('')
    expect(await within(dialog()).findByText('Vui lòng nhập mật khẩu mới.')).toBeInTheDocument()
    expect(within(dialog()).getByText('Vui lòng nhập lại mật khẩu mới.')).toBeInTheDocument()
  })

  it('reset_WeakPassword_ShowsRuleError', async () => {
    renderModal()
    await reachPasswordStep()
    await fill('ngan')
    expect(await within(dialog()).findByText('Mật khẩu tối thiểu 12 ký tự, có số và ký tự đặc biệt.')).toBeInTheDocument()
  })

  it('reset_ConfirmMismatch_ShowsError', async () => {
    renderModal()
    await reachPasswordStep()
    await fill(NEW_PASSWORD, 'KhacHoanToan#2026')
    expect(await within(dialog()).findByText('Mật khẩu xác nhận không khớp.')).toBeInTheDocument()
  })

  it('reset_Valid_ChangesPasswordAndCallsOnResetWithEmail', async () => {
    const props = renderModal()
    await reachPasswordStep()
    await fill(NEW_PASSWORD)
    await vi.waitFor(() => expect(props.onReset).toHaveBeenCalledWith(DEMO_ACCOUNT.email))
    await expect(login(DEMO_ACCOUNT.email, NEW_PASSWORD)).resolves.toMatchObject({ userId: 1 })
  })

  it('reset_Valid_SendsEmailTogetherWithTheResetToken', async () => {
    let received = null
    server.use(
      http.post('*/api/auth/reset-password', async ({ request }) => {
        received = await request.json()
        return HttpResponse.json({ message: 'ok' })
      }),
    )
    renderModal()
    await reachPasswordStep()
    await fill(NEW_PASSWORD)
    await vi.waitFor(() => expect(received).not.toBeNull())
    expect(received).toMatchObject({ email: DEMO_ACCOUNT.email, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })
    expect(typeof received.resetToken).toBe('string')
  })

  it('reset_ServerRejectsToken_ShowsExpiredMessage', async () => {
    server.use(http.post('*/api/auth/reset-password', () => HttpResponse.json({ status: 400, detail: 'x' }, { status: 400 })))
    renderModal()
    await reachPasswordStep()
    await fill(NEW_PASSWORD)
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Phiên đặt lại mật khẩu đã hết hạn. Vui lòng bắt đầu lại.')
  })
})
