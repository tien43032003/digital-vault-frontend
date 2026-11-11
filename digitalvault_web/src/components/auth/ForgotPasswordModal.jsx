import { KeyRound, X } from 'lucide-react'
import { useState } from 'react'
import { Alert, Button, Modal } from 'react-bootstrap'
import { requestPasswordReset, resetPassword, verifyResetOtp } from '../../callapi/authApi'
import { MOCK_MODE } from '../../mocks/mode'
import { validateEmailOnly, validateNewPassword, validateOtp } from '../../utils/validators'
import MockNotice from '../common/MockNotice'
import TextField from '../common/TextField'

const GENERIC_ERROR = 'Đã có lỗi xảy ra, vui lòng thử lại.'
const STEP_HELP = {
  email: 'Nhập email đăng ký, chúng tôi sẽ gửi mã xác nhận gồm 6 chữ số.',
  otp: 'Nhập mã xác nhận gồm 6 chữ số vừa được gửi tới',
  password: 'Đặt mật khẩu mới cho tài khoản của bạn.',
}

function requestErrorMessage(error) {
  if (error?.status === 429) return 'Bạn đã thử quá nhiều lần. Vui lòng đợi 1 phút rồi thử lại.'
  if (error?.status === 503) return 'Máy chủ chưa gửi được email xác nhận. Vui lòng thử lại sau.'
  return error?.message || GENERIC_ERROR
}

// BE không trả địa chỉ email đã che nên FE tự che từ email vừa nhập: a***n@domain
function maskEmail(value) {
  const [local = '', domain = ''] = value.trim().split('@')
  if (!local || !domain) return value.trim()
  return `${local[0]}***${local[local.length - 1]}@${domain}`
}

// Modal khôi phục mật khẩu 3 bước (email → mã OTP → mật khẩu mới). Chỉ mount khi mở.
// mockOtp chỉ hiển thị khi chạy mock để có thể demo không cần email thật; với BE thật mã OTP được gửi qua email.
export default function ForgotPasswordModal({ initialEmail = '', mockMode = MOCK_MODE, onClose, onReset }) {
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState(initialEmail)
  const [otp, setOtp] = useState('')
  const [passwords, setPasswords] = useState({ newPassword: '', confirmPassword: '' })
  const [challenge, setChallenge] = useState({ maskedEmail: '', mockOtp: '' })
  const [resetToken, setResetToken] = useState('')
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleClose = () => {
    if (!busy) onClose()
  }

  const sendCode = async () => {
    const emailError = validateEmailOnly(email)
    setErrors({ email: emailError })
    if (emailError) return
    setBusy(true)
    setSubmitError('')
    try {
      const result = await requestPasswordReset(email)
      setChallenge({ maskedEmail: maskEmail(email), mockOtp: result?.mockOtp ?? '' })
      setOtp('')
      setStep('otp')
    } catch (error) {
      setSubmitError(requestErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const confirmCode = async () => {
    const nextErrors = validateOtp(otp)
    setErrors(nextErrors)
    if (nextErrors.otp) return
    setBusy(true)
    setSubmitError('')
    try {
      const result = await verifyResetOtp(email, otp)
      setResetToken(result.resetToken)
      setErrors({})
      setStep('password')
    } catch (error) {
      if (error?.status === 400) setErrors({ otp: 'Mã xác nhận không đúng hoặc đã hết hạn.' })
      else if (error?.status === 429) setErrors({ otp: 'Bạn đã nhập sai quá nhiều lần. Vui lòng yêu cầu mã mới.' })
      else setSubmitError(error?.message || GENERIC_ERROR)
    } finally {
      setBusy(false)
    }
  }

  const saveNewPassword = async () => {
    const nextErrors = validateNewPassword(passwords)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    setBusy(true)
    setSubmitError('')
    try {
      await resetPassword({ email, resetToken, ...passwords })
      onReset(email.trim())
    } catch (error) {
      setBusy(false)
      setSubmitError(error?.status === 400 ? 'Phiên đặt lại mật khẩu đã hết hạn. Vui lòng bắt đầu lại.' : error?.message || GENERIC_ERROR)
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (busy) return
    if (step === 'email') sendCode()
    else if (step === 'otp') confirmCode()
    else saveNewPassword()
  }

  const goBackToEmail = () => {
    setStep('email')
    setErrors({})
    setSubmitError('')
  }

  const primaryLabel = { email: 'Gửi mã xác nhận', otp: 'Xác nhận mã', password: 'Đặt lại mật khẩu' }[step]

  return (
    <Modal show onHide={handleClose} centered animation={false} dialogClassName="av-modal" aria-labelledby="forgot-password-title">
      <div className="av-modal-head">
        <div className="d-flex align-items-center gap-3">
          <span className="av-icon-tile">
            <KeyRound size={20} aria-hidden="true" />
          </span>
          <h2 id="forgot-password-title" className="mb-0 fw-bold text-ink" style={{ fontSize: 19, letterSpacing: '-0.025em' }}>
            Quên Mật Khẩu
          </h2>
        </div>
        <button type="button" onClick={handleClose} aria-label="Đóng" className="av-close-btn">
          <X size={16} />
        </button>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="av-modal-body d-flex flex-column gap-3">
          <p className="mb-0 fs-13 text-slate-600">
            {STEP_HELP[step]}
            {step === 'otp' && <strong className="text-ink">{` ${challenge.maskedEmail}`}</strong>}
          </p>

          {step === 'email' && (
            <TextField
              id="forgot-email"
              name="email"
              type="email"
              label="Email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setErrors({})
              }}
              error={errors.email}
            />
          )}

          {step === 'otp' && (
            <>
              {challenge.mockOtp && <MockNotice mode={mockMode} message={`Mã OTP mô phỏng: ${challenge.mockOtp}`} />}
              <TextField
                id="forgot-otp"
                name="otp"
                inputMode="numeric"
                maxLength={6}
                label="Mã xác nhận"
                required
                autoComplete="one-time-code"
                value={otp}
                onChange={(event) => {
                  setOtp(event.target.value)
                  setErrors({})
                }}
                error={errors.otp}
              />
              <div className="d-flex justify-content-between">
                <button type="button" className="av-link-btn fs-12" disabled={busy} onClick={goBackToEmail}>
                  Đổi email
                </button>
                <button type="button" className="av-link-btn fs-12" disabled={busy} onClick={sendCode}>
                  Gửi lại mã
                </button>
              </div>
            </>
          )}

          {step === 'password' && (
            <>
              <TextField
                id="forgot-new-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                label="Mật khẩu mới"
                required
                labelAside={<span className="fs-11 text-slate-400">Tối thiểu 12 ký tự, có số và ký tự đặc biệt</span>}
                value={passwords.newPassword}
                onChange={(event) => {
                  setPasswords((prev) => ({ ...prev, newPassword: event.target.value }))
                  setErrors((prev) => ({ ...prev, newPassword: undefined }))
                }}
                error={errors.newPassword}
              />
              <TextField
                id="forgot-confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                label="Xác nhận mật khẩu mới"
                required
                value={passwords.confirmPassword}
                onChange={(event) => {
                  setPasswords((prev) => ({ ...prev, confirmPassword: event.target.value }))
                  setErrors((prev) => ({ ...prev, confirmPassword: undefined }))
                }}
                error={errors.confirmPassword}
              />
            </>
          )}

          {step === 'email' && <MockNotice mode={mockMode} message="Chế độ mô phỏng: chỉ đặt lại được mật khẩu cho tài khoản demo, không đổi mật khẩu trên máy chủ thật." />}
          {submitError && <Alert variant="danger" className="av-alert mb-0">{submitError}</Alert>}
        </div>

        <div className="av-modal-foot justify-content-end gap-2">
          <Button type="button" variant="light" onClick={handleClose} disabled={busy} className="av-btn av-btn-md border">
            Hủy
          </Button>
          <Button type="submit" variant="primary" disabled={busy} className="av-btn av-btn-md">
            {busy ? 'Đang xử lý dữ liệu...' : primaryLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
