import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as authApi from '../../callapi/authApi'
import { ApiError } from '../../callapi/axiosClient'
import RegisterModal from './RegisterModal'

vi.mock('../../callapi/authApi', () => ({ register: vi.fn() }))

const renderModal = (props = {}) => {
  const handlers = { onClose: vi.fn(), onSuccess: vi.fn(), onSwitchToLogin: vi.fn() }
  render(<RegisterModal open {...handlers} {...props} />)
  return handlers
}

const fillValidForm = async () => {
  await userEvent.type(screen.getByLabelText(/^Họ và tên chủ sở hữu/), 'Nguyễn Văn An')
  await userEvent.type(screen.getByLabelText(/^Email chính thức/), 'an.nguyen@example.com')
  await userEvent.type(screen.getByLabelText(/^Số điện thoại/), '0901234567')
  await userEvent.type(screen.getByLabelText(/^Mật khẩu tài khoản/), 'Secure#Pass2026')
  await userEvent.type(screen.getByLabelText(/^Xác nhận mật khẩu/), 'Secure#Pass2026')
  await userEvent.click(screen.getByRole('checkbox', { name: /Tôi đồng ý/ }))
}

const submit = () => userEvent.click(screen.getByRole('button', { name: /Tạo Kho Di Sản Ngay/ }))

describe('RegisterModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('render_Closed_RendersNothing', () => {
    render(<RegisterModal open={false} onClose={vi.fn()} onSuccess={vi.fn()} onSwitchToLogin={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('render_Open_ShowsDesignTextsAndOptionalCitizenIdField', () => {
    renderModal()
    expect(screen.getByRole('dialog', { name: 'Đăng Ký Tạo Kho Di Sản Số Mới' })).toBeInTheDocument()
    expect(screen.getByText('VAULT OWNER SETUP')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Mật khẩu tài khoản/)).toHaveAttribute(
      'placeholder',
      'Tối thiểu 12 ký tự, có số & ký tự đặc biệt',
    )
    // BE đã hỗ trợ CCCD (IdentityNumber) là trường tuỳ chọn khi đăng ký
    const citizenId = screen.getByLabelText(/^Số CCCD/)
    expect(citizenId).toBeInTheDocument()
    expect(citizenId).not.toBeRequired()
    expect(screen.getByText(/Không bắt buộc/)).toBeInTheDocument()
  })

  it('submit_InvalidCitizenId_ShowsErrorAndDoesNotCallApi', async () => {
    renderModal()
    await fillValidForm()
    await userEvent.type(screen.getByLabelText(/^Số CCCD/), '12345')
    await submit()
    expect(screen.getByText('Số CCCD gồm đúng 12 chữ số.')).toBeInTheDocument()
    expect(authApi.register).not.toHaveBeenCalled()
  })

  it('submit_ValidCitizenId_SendsIdentityNumberToApi', async () => {
    authApi.register.mockResolvedValue({ userId: 1, email: 'an.nguyen@example.com' })
    renderModal()
    await fillValidForm()
    await userEvent.type(screen.getByLabelText(/^Số CCCD/), '079094004521')
    await submit()
    expect(authApi.register).toHaveBeenCalledWith(expect.objectContaining({ identityNumber: '079094004521' }))
  })

  it('render_PhoneField_IsContactOnlyWithoutOtpMention', () => {
    renderModal()
    // OTP chỉ gửi qua email, số điện thoại chỉ dùng để liên lạc
    expect(screen.getByLabelText(/^Số điện thoại liên lạc/)).toBeInTheDocument()
    expect(screen.queryByText(/Nhận OTP/)).not.toBeInTheDocument()
  })

  it('submit_EmptyForm_ShowsErrorsAndDoesNotCallApi', async () => {
    renderModal()
    await submit()
    expect(screen.getByText('Vui lòng nhập họ tên.')).toBeInTheDocument()
    expect(screen.getByText('Bạn cần đồng ý với Điều khoản dịch vụ.')).toBeInTheDocument()
    expect(authApi.register).not.toHaveBeenCalled()
  })

  it('submit_ValidForm_CallsRegisterAndOnSuccess', async () => {
    authApi.register.mockResolvedValue({ userId: 1, email: 'an.nguyen@example.com' })
    const { onSuccess } = renderModal()
    await fillValidForm()
    await submit()
    expect(authApi.register).toHaveBeenCalledWith({
      fullName: 'Nguyễn Văn An',
      email: 'an.nguyen@example.com',
      phone: '0901234567',
      identityNumber: '',
      password: 'Secure#Pass2026',
      confirmPassword: 'Secure#Pass2026',
    })
    expect(onSuccess).toHaveBeenCalledWith('an.nguyen@example.com')
  })

  it('submit_DuplicateEmail_ShowsEmailFieldError', async () => {
    authApi.register.mockRejectedValue(new ApiError(409, 'Email is already registered.'))
    const { onSuccess } = renderModal()
    await fillValidForm()
    await submit()
    expect(await screen.findByText('Email này đã được đăng ký.')).toBeInTheDocument()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('submit_DuplicatePhone_ShowsPhoneFieldError', async () => {
    authApi.register.mockRejectedValue(new ApiError(409, 'Số điện thoại này đã được đăng ký bởi một chủ sở hữu khác.', 'PHONE_ALREADY_EXISTS'))
    const { onSuccess } = renderModal()
    await fillValidForm()
    await submit()
    expect(await screen.findByText('Số điện thoại này đã được đăng ký bởi một chủ sở hữu khác.')).toBeInTheDocument()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('submit_DuplicateIdentityNumber_ShowsIdentityNumberFieldError', async () => {
    authApi.register.mockRejectedValue(new ApiError(409, 'Số CCCD này đã được đăng ký bởi một chủ sở hữu khác.', 'IDENTITY_NUMBER_ALREADY_EXISTS'))
    const { onSuccess } = renderModal()
    await fillValidForm()
    await submit()
    expect(await screen.findByText('Số CCCD này đã được đăng ký bởi một chủ sở hữu khác.')).toBeInTheDocument()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('submit_TooManyRequests_ShowsAlert', async () => {
    authApi.register.mockRejectedValue(new ApiError(429, ''))
    renderModal()
    await fillValidForm()
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('quá nhiều lần')
  })

  it('submit_Pending_DisablesSubmitButton', async () => {
    authApi.register.mockReturnValue(new Promise(() => {}))
    renderModal()
    await fillValidForm()
    await submit()
    expect(screen.getByRole('button', { name: /Đang tạo/ })).toBeDisabled()
  })

  it('closeButton_Clicked_CallsOnClose', async () => {
    const { onClose } = renderModal()
    await userEvent.click(screen.getByRole('button', { name: 'Đóng' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('escapeKey_Pressed_CallsOnClose', async () => {
    const { onClose } = renderModal()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('loginLink_Clicked_CallsOnSwitchToLogin', async () => {
    const { onSwitchToLogin } = renderModal()
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập ngay' }))
    expect(onSwitchToLogin).toHaveBeenCalledTimes(1)
  })
})
