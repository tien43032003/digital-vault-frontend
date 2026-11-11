import { KeyRound, MonitorSmartphone, ShieldCheck, UserRound } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Alert, Button, Form } from 'react-bootstrap'
import { confirmPasswordChange, requestPasswordChange } from '../../callapi/authApi'
import { setTwoFactor, updateProfile } from '../../callapi/ownerApi'
import AppToast from '../../components/common/AppToast'
import MockNotice from '../../components/common/MockNotice'
import TextField from '../../components/common/TextField'
import { useSecuritySettings } from '../../hooks/useSecuritySettings'
import { MOCK_MODE } from '../../mocks/mode'
import { passwordConfirmError, passwordRequestError } from '../../utils/accountErrors'
import { resultInfo } from '../../utils/activityLog'
import { formatDateTime } from '../../utils/proofOfLife'
import { validateOtp, validatePasswordChange, validateProfile } from '../../utils/validators'

const BADGE_CLASS = { ok: 'av-badge-ok', warn: 'av-badge-warn', info: 'av-badge-info', muted: 'av-badge-muted' }
const EMPTY_PASSWORD_FORM = { currentPassword: '', newPassword: '', confirmPassword: '' }
const GENERIC_ERROR = 'Đã có lỗi xảy ra, vui lòng thử lại.'

// CCCD chỉ hiện 4 số cuối để tránh lộ khi người khác nhìn màn hình
const maskIdentityNumber = (value) => (value ? `${'•'.repeat(Math.max(value.length - 4, 0))}${value.slice(-4)}` : 'Chưa cập nhật')

function SectionTitle({ icon: Icon, children }) {
  return (
    <h2 className="mb-3 fw-bold text-ink d-flex align-items-center gap-2" style={{ fontSize: 16 }}>
      <Icon size={16} aria-hidden="true" />
      {children}
    </h2>
  )
}

function ProfileSection({ profile, onSaved }) {
  const [form, setForm] = useState({ fullName: profile.fullName, phone: profile.phone ?? '' })
  const [errors, setErrors] = useState({})
  const [save, setSave] = useState({ busy: false, error: '' })

  const setValue = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const nextErrors = validateProfile(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSave({ busy: true, error: '' })
    try {
      onSaved(await updateProfile(form))
      setSave({ busy: false, error: '' })
    } catch (error) {
      const code = error?.code || ''
      const msg = error?.message || GENERIC_ERROR
      if (code === 'PHONE_ALREADY_EXISTS' || code === 'INVALID_PHONE' || msg.toLowerCase().includes('điện thoại')) {
        setErrors((prev) => ({ ...prev, phone: msg }))
        setSave({ busy: false, error: '' })
      } else {
        setSave({ busy: false, error: msg })
      }
    }
  }

  return (
    <section className="av-panel" aria-label="Thông tin cá nhân">
      <SectionTitle icon={UserRound}>Thông tin cá nhân</SectionTitle>
      <form onSubmit={handleSubmit} noValidate className="d-flex flex-column gap-3">
        <div className="row g-3">
          <div className="col-12 col-lg-6">
            <TextField
              id="profile-name"
              name="fullName"
              label="Họ và tên"
              required
              value={form.fullName}
              onChange={(event) => setValue('fullName', event.target.value)}
              error={errors.fullName}
            />
          </div>
          <div className="col-12 col-lg-6">
            <TextField
              id="profile-phone"
              name="phone"
              label="Số điện thoại"
              value={form.phone}
              onChange={(event) => setValue('phone', event.target.value)}
              error={errors.phone}
            />
          </div>
          <div className="col-12 col-lg-6">
            <TextField id="profile-email" name="email" label="Email đăng nhập" value={profile.email} disabled readOnly />
          </div>
          <div className="col-12 col-lg-6">
            <p className="av-label mb-2">Số CCCD</p>
            <p className="mb-0 fs-14 text-ink font-mono">{maskIdentityNumber(profile.identityNumber)}</p>
          </div>
        </div>
        {save.error && <Alert variant="danger" className="av-alert mb-0">{save.error}</Alert>}
        <div>
          <Button type="submit" variant="primary" className="av-btn av-btn-md" disabled={save.busy}>
            {save.busy ? 'Đang xử lý dữ liệu...' : 'Lưu thay đổi'}
          </Button>
        </div>
      </form>
    </section>
  )
}

function PasswordSection({ passwordChangedAt, onChanged, mockMode }) {
  const [form, setForm] = useState(EMPTY_PASSWORD_FORM)
  const [errors, setErrors] = useState({})
  const [save, setSave] = useState({ busy: false, error: '' })
  // Bước 2 (nhập mã OTP gửi qua email): null khi đang ở bước nhập mật khẩu
  const [challenge, setChallenge] = useState(null)
  const [otp, setOtp] = useState('')
  const [otpError, setOtpError] = useState('')
  const [notice, setNotice] = useState('')

  const setValue = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  // BE kiểm tra mật khẩu hiện tại rồi gửi mã OTP về email; mật khẩu chỉ đổi sau khi nhập đúng mã
  const requestCode = async ({ resend = false } = {}) => {
    if (!resend) {
      const nextErrors = validatePasswordChange(form)
      setErrors(nextErrors)
      if (Object.keys(nextErrors).length > 0) return
    }
    setSave({ busy: true, error: '' })
    setNotice('')
    try {
      const result = await requestPasswordChange(form)
      setChallenge({ challengeId: result.challengeId, expiresInSeconds: result.expiresInSeconds, mockCode: result.mockCode ?? '' })
      setOtp('')
      setOtpError('')
      if (resend) setNotice('Đã gửi lại mã xác nhận.')
      setSave({ busy: false, error: '' })
    } catch (error) {
      const info = passwordRequestError(error)
      if (info.field) setErrors({ [info.field]: info.message })
      setSave({ busy: false, error: info.alert ?? '' })
    }
  }

  const confirmCode = async () => {
    const otpErrors = validateOtp(otp)
    if (otpErrors.otp) {
      setOtpError(otpErrors.otp)
      return
    }
    setSave({ busy: true, error: '' })
    setOtpError('')
    try {
      await confirmPasswordChange(challenge.challengeId, otp)
      setForm(EMPTY_PASSWORD_FORM)
      setChallenge(null)
      setOtp('')
      setSave({ busy: false, error: '' })
      onChanged()
    } catch (error) {
      setSave({ busy: false, error: '' })
      setOtpError(passwordConfirmError(error))
    }
  }

  const goBack = () => {
    setChallenge(null)
    setOtp('')
    setOtpError('')
    setNotice('')
    setSave({ busy: false, error: '' })
  }

  const subtitle = passwordChangedAt ? `Đổi lần cuối: ${formatDateTime(passwordChangedAt)}` : 'Bạn chưa từng đổi mật khẩu trên hệ thống này.'

  if (challenge) {
    const minutes = Math.max(1, Math.round((challenge.expiresInSeconds ?? 300) / 60))
    return (
      <section className="av-panel" aria-label="Đổi mật khẩu">
        <SectionTitle icon={KeyRound}>Đổi mật khẩu</SectionTitle>
        <p className="mb-3 fs-12 text-slate-500">{subtitle}</p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!save.busy) confirmCode()
          }}
          noValidate
          aria-label="Xác nhận đổi mật khẩu"
          className="d-flex flex-column gap-3"
        >
          <p className="mb-0 fs-13 text-slate-600">{`Mã xác nhận đã được gửi đến email của bạn. Nhập mã gồm 6 chữ số để hoàn tất; mã có hiệu lực ${minutes} phút.`}</p>
          {mockMode === 'full' && challenge.mockCode && <p className="mb-0 fs-12 text-slate-500">{`Mã OTP mô phỏng: ${challenge.mockCode}`}</p>}
          <TextField
            id="password-otp"
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            label="Mã xác nhận"
            required
            value={otp}
            onChange={(event) => {
              setOtp(event.target.value)
              setOtpError('')
            }}
            error={otpError}
          />
          {notice && (
            <p role="status" className="mb-0 fs-12 text-brand">
              {notice}
            </p>
          )}
          {save.error && <Alert variant="danger" className="av-alert mb-0">{save.error}</Alert>}
          <div className="d-flex flex-wrap gap-2">
            <Button type="submit" variant="primary" className="av-btn av-btn-md" disabled={save.busy}>
              {save.busy ? 'Đang xử lý dữ liệu...' : 'Xác nhận đổi mật khẩu'}
            </Button>
            <Button type="button" variant="light" className="av-btn av-btn-md border" disabled={save.busy} onClick={() => requestCode({ resend: true })}>
              Gửi lại mã
            </Button>
            <Button type="button" variant="light" className="av-btn av-btn-md border" disabled={save.busy} onClick={goBack}>
              Quay lại
            </Button>
          </div>
        </form>
      </section>
    )
  }

  return (
    <section className="av-panel" aria-label="Đổi mật khẩu">
      <SectionTitle icon={KeyRound}>Đổi mật khẩu</SectionTitle>
      <p className="mb-3 fs-12 text-slate-500">{subtitle}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!save.busy) requestCode()
        }}
        noValidate
        aria-label="Đổi mật khẩu"
        className="d-flex flex-column gap-3"
      >
        <TextField
          id="password-current"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          label="Mật khẩu hiện tại"
          required
          value={form.currentPassword}
          onChange={(event) => setValue('currentPassword', event.target.value)}
          error={errors.currentPassword}
        />
        <TextField
          id="password-new"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          label="Mật khẩu mới"
          required
          labelAside={<span className="fs-11 text-slate-400">Tối thiểu 12 ký tự, có số và ký tự đặc biệt</span>}
          value={form.newPassword}
          onChange={(event) => setValue('newPassword', event.target.value)}
          error={errors.newPassword}
        />
        <TextField
          id="password-confirm"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          label="Xác nhận mật khẩu mới"
          required
          value={form.confirmPassword}
          onChange={(event) => setValue('confirmPassword', event.target.value)}
          error={errors.confirmPassword}
        />
        <p className="mb-0 fs-12 text-slate-500">Để bảo mật, hệ thống sẽ gửi mã xác nhận gồm 6 chữ số về email của bạn trước khi đổi mật khẩu.</p>
        {save.error && <Alert variant="danger" className="av-alert mb-0">{save.error}</Alert>}
        <div>
          <Button type="submit" variant="primary" className="av-btn av-btn-md" disabled={save.busy}>
            {save.busy ? 'Đang xử lý dữ liệu...' : 'Gửi mã xác nhận'}
          </Button>
        </div>
      </form>
    </section>
  )
}
function TwoFactorSection({ enabled, onChanged }) {
  const [state, setState] = useState({ busy: false, error: '' })

  const handleToggle = async (event) => {
    const next = event.target.checked
    setState({ busy: true, error: '' })
    try {
      const result = await setTwoFactor(next)
      setState({ busy: false, error: '' })
      onChanged(result.twoFactorEnabled)
    } catch (error) {
      setState({ busy: false, error: error?.message || GENERIC_ERROR })
    }
  }

  return (
    <section className="av-panel" aria-label="Xác thực hai lớp">
      <SectionTitle icon={ShieldCheck}>Xác thực hai lớp (2FA)</SectionTitle>
      <p className="mb-3 fs-13 text-slate-600">
        Yêu cầu thêm mã xác nhận khi đăng nhập để bảo vệ kho di sản kể cả khi mật khẩu bị lộ.
      </p>
      <Form.Check
        type="switch"
        role="switch"
        id="two-factor-switch"
        label="Bật xác thực hai lớp"
        checked={enabled}
        disabled={state.busy}
        onChange={handleToggle}
      />
      {state.error && <Alert variant="danger" className="av-alert mt-3 mb-0">{state.error}</Alert>}
    </section>
  )
}

function RecentLoginsSection({ logins }) {
  return (
    <section className="av-panel" aria-label="Đăng nhập gần đây">
      <SectionTitle icon={MonitorSmartphone}>Đăng nhập gần đây</SectionTitle>
      {logins.status === 'error' && <p className="av-empty mb-0">Không tải được lịch sử đăng nhập.</p>}
      {logins.status === 'ready' && logins.items.length === 0 && <p className="av-empty mb-0">Chưa có lịch sử đăng nhập.</p>}
      {logins.items.length > 0 && (
        <ul className="list-unstyled mb-0 d-flex flex-column gap-2" aria-label="Danh sách đăng nhập gần đây">
          {logins.items.map((log) => {
            const result = resultInfo(log.result)
            return (
              <li key={log.logId} className="av-doc-item">
                <div className="av-doc-main">
                  <p className="mb-0 fs-13 fw-semibold text-ink">{formatDateTime(log.timestamp)}</p>
                  <p className="mb-0 font-mono fs-12 text-slate-500">{log.ipAddress}</p>
                </div>
                <span className={`av-badge ${BADGE_CLASS[result.tone]}`}>{result.text}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// Trang "Cài đặt bảo mật": thông tin cá nhân, đổi mật khẩu, xác thực hai lớp và lịch sử đăng nhập
export default function SecuritySettingsPage({ mockMode = MOCK_MODE }) {
  const { status, error, profile, logins, reload, applyProfile } = useSecuritySettings()
  const [toast, setToast] = useState(null)
  const closeToast = useCallback(() => setToast(null), [])

  if (status === 'loading') {
    return (
      <p role="status" className="d-flex align-items-center gap-3 fs-14 text-slate-500">
        <span className="spinner-border spinner-border-sm text-brand" aria-hidden="true" />
        Đang tải cài đặt bảo mật...
      </p>
    )
  }

  if (status === 'error') {
    return (
      <Alert variant="danger" className="av-alert d-flex align-items-center justify-content-between gap-3">
        <span>{error}</span>
        <Button type="button" variant="light" size="sm" className="border" onClick={reload}>
          Thử lại
        </Button>
      </Alert>
    )
  }

  return (
    <div className="d-flex flex-column gap-4">
      <section className="av-panel av-banner">
        <div className="d-flex align-items-center gap-3">
          <span className="av-icon-tile">
            <ShieldCheck size={20} aria-hidden="true" />
          </span>
          <div>
            <h1 className="mb-1 fw-bold text-ink" style={{ fontSize: 20, letterSpacing: '-0.02em' }}>
              Cài đặt bảo mật
            </h1>
            <p className="mb-0 fs-12 text-slate-500">Quản lý thông tin tài khoản, mật khẩu và các lớp bảo vệ đăng nhập.</p>
          </div>
        </div>
      </section>

      <MockNotice mode={mockMode} />

      <ProfileSection
        profile={profile}
        onSaved={(saved) => {
          applyProfile(saved)
          setToast({ title: 'Đã cập nhật thông tin cá nhân' })
        }}
      />
      <PasswordSection
        mockMode={mockMode}
        passwordChangedAt={profile.passwordChangedAt}
        onChanged={() => {
          applyProfile({ passwordChangedAt: new Date().toISOString() })
          setToast({ title: 'Đã đổi mật khẩu', detail: 'Lần đăng nhập sau hãy dùng mật khẩu mới.' })
        }}
      />
      <TwoFactorSection
        enabled={profile.twoFactorEnabled}
        onChanged={(enabled) => {
          applyProfile({ twoFactorEnabled: enabled })
          setToast({ title: enabled ? 'Đã bật xác thực hai lớp' : 'Đã tắt xác thực hai lớp' })
        }}
      />
      <RecentLoginsSection logins={logins} />

      <AppToast show={Boolean(toast)} onClose={closeToast} title={toast?.title} detail={toast?.detail} />
    </div>
  )
}
