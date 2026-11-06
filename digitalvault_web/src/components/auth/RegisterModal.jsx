import { HardDrive, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { Alert, Button, Modal } from 'react-bootstrap'
import { register } from '../../callapi/authApi'
import { validateRegister } from '../../utils/validators'
import TextField from '../common/TextField'

const EMPTY_FORM = {
  fullName: '',
  email: '',
  phone: '',
  identityNumber: '',
  password: '',
  confirmPassword: '',
  acceptTerms: false,
}

// Chuyển lỗi API đăng ký sang thông báo tiếng Việt
function registerErrorMessage(error) {
  if (error?.status === 429) return 'Bạn đã thử quá nhiều lần. Vui lòng đợi 1 phút rồi thử lại.'
  if (error?.message && error.message !== 'Đã có lỗi xảy ra, vui lòng thử lại.') return error.message
  if (error?.status === 400) return 'Thông tin đăng ký không hợp lệ. Vui lòng kiểm tra lại.'
  return error?.message || 'Đã có lỗi xảy ra, vui lòng thử lại.'
}

// Tách lỗi 400/409 từ BE về đúng trường đang gặp ngoại lệ (email, phone, identityNumber)
function extractFieldError(error) {
  if (error?.status !== 409 && error?.status !== 400) return null
  const code = error?.code || ''
  const msg = error?.message || ''
  const lower = msg.toLowerCase()

  if (code === 'PHONE_ALREADY_EXISTS' || code === 'INVALID_PHONE' || lower.includes('điện thoại') || lower.includes('phone')) {
    return { field: 'phone', message: msg || 'Số điện thoại này đã được đăng ký.' }
  }
  if (code === 'IDENTITY_NUMBER_ALREADY_EXISTS' || code === 'INVALID_IDENTITY_NUMBER' || lower.includes('cccd') || lower.includes('identity')) {
    return { field: 'identityNumber', message: msg || 'Số CCCD này đã được đăng ký.' }
  }
  if (code === 'EMAIL_ALREADY_EXISTS' || code === 'INVALID_EMAIL' || error?.status === 409 || lower.includes('email')) {
    const emailMsg = msg && !lower.includes('already registered') ? msg : 'Email này đã được đăng ký.'
    return { field: 'email', message: emailMsg }
  }
  return null
}

// Modal đăng ký tài khoản Vault Owner, hiển thị đè lên landing page
export default function RegisterModal({ open, onClose, onSuccess, onSwitchToLogin }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
    setErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitError('')
    const nextErrors = validateRegister(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const email = form.email.trim()
    setIsSubmitting(true)
    try {
      await register({
        fullName: form.fullName.trim(),
        email,
        phone: form.phone,
        identityNumber: form.identityNumber,
        password: form.password,
        confirmPassword: form.confirmPassword,
      })
      setForm(EMPTY_FORM)
      onSuccess(email)
    } catch (error) {
      const fieldError = extractFieldError(error)
      if (fieldError) setErrors((prev) => ({ ...prev, [fieldError.field]: fieldError.message }))
      else setSubmitError(registerErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  // Modal của react-bootstrap tự xử lý phím Esc, focus trap và aria-modal
  return (
    <Modal
      show={open}
      onHide={onClose}
      centered
      animation={false}
      dialogClassName="av-modal"
      aria-labelledby="register-title"
    >
      <div className="av-modal-head">
        <div className="d-flex align-items-center gap-3">
          <span className="av-icon-tile">
            <UserPlus size={20} aria-hidden="true" />
          </span>
          <div>
            <span className="av-modal-tag av-mono-tag">VAULT OWNER SETUP</span>
            <h2 id="register-title" className="mt-1 mb-0 fw-bold text-ink" style={{ fontSize: 19, letterSpacing: '-0.025em' }}>
              Đăng Ký Tạo Kho Di Sản Số Mới
            </h2>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Đóng" className="av-close-btn">
          <X size={16} />
        </button>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="av-modal-body">
          <div className="row g-4">
            <TextField
              id="register-fullName"
              name="fullName"
              label="Họ và tên chủ sở hữu"
              required
              autoComplete="name"
              placeholder="Ví dụ: Nguyễn Văn An"
              value={form.fullName}
              onChange={handleChange}
              inputClassName="av-input-sm"
              error={errors.fullName}
              className="col-12"
            />
            <TextField
              id="register-email"
              name="email"
              type="email"
              label="Email chính thức"
              required
              autoComplete="email"
              placeholder="an.nguyen@example.com"
              value={form.email}
              onChange={handleChange}
              inputClassName="av-input-sm"
              error={errors.email}
              className="col-12 col-sm-6"
            />
            <TextField
              id="register-phone"
              name="phone"
              type="tel"
              label="Số điện thoại liên lạc"
              required
              autoComplete="tel"
              placeholder="0901 234 567"
              value={form.phone}
              onChange={handleChange}
              inputClassName="av-input-sm"
              error={errors.phone}
              className="col-12 col-sm-6"
            />
            <TextField
              id="register-identityNumber"
              name="identityNumber"
              label="Số CCCD (gắn chip)"
              labelAside={<span className="fs-11 text-slate-400">Không bắt buộc</span>}
              inputMode="numeric"
              autoComplete="off"
              placeholder="12 chữ số CCCD"
              value={form.identityNumber}
              onChange={handleChange}
              inputClassName="av-input-sm"
              error={errors.identityNumber}
              className="col-12"
            />
            <TextField
              id="register-password"
              name="password"
              type="password"
              label="Mật khẩu tài khoản"
              required
              autoComplete="new-password"
              placeholder="Tối thiểu 12 ký tự, có số & ký tự đặc biệt"
              value={form.password}
              onChange={handleChange}
              inputClassName="av-input-sm"
              error={errors.password}
              className="col-12 col-sm-6"
            />
            <TextField
              id="register-confirmPassword"
              name="confirmPassword"
              type="password"
              label="Xác nhận mật khẩu"
              required
              autoComplete="new-password"
              placeholder="Nhập lại mật khẩu"
              value={form.confirmPassword}
              onChange={handleChange}
              inputClassName="av-input-sm"
              error={errors.confirmPassword}
              className="col-12 col-sm-6"
            />

            <div className="col-12">
              <label htmlFor="register-acceptTerms" className="av-terms">
                <input
                  id="register-acceptTerms"
                  name="acceptTerms"
                  type="checkbox"
                  checked={form.acceptTerms}
                  onChange={handleChange}
                />
                <span>
                  Tôi đồng ý với <span className="fw-semibold text-brand">Điều khoản dịch vụ</span> và xác nhận chịu
                  trách nhiệm pháp lý về quyền sở hữu đối với các tài sản số lưu trữ trong kho.
                </span>
              </label>
              {errors.acceptTerms && <p className="av-error">{errors.acceptTerms}</p>}
            </div>

            {submitError && (
              <div className="col-12">
                <Alert variant="danger" className="av-alert">{submitError}</Alert>
              </div>
            )}
          </div>
        </div>

        <div className="av-modal-foot">
          <p className="mb-0 fs-13 text-slate-500">
            Đã có tài khoản?{' '}
            <button type="button" onClick={onSwitchToLogin} className="av-link-btn">
              Đăng nhập ngay
            </button>
          </p>
          <Button type="submit" variant="primary" disabled={isSubmitting} className="av-btn av-btn-md">
            {isSubmitting ? 'Đang tạo...' : 'Tạo Kho Di Sản Ngay'}
            {!isSubmitting && <HardDrive size={16} aria-hidden="true" />}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
