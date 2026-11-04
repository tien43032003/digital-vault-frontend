import { useCallback, useState } from 'react'
import { Navigate } from 'react-router-dom'
import LoginForm from '../components/auth/LoginForm'
import RegisterModal from '../components/auth/RegisterModal'
import LandingFooter from '../components/landing/LandingFooter'
import LandingHeader from '../components/landing/LandingHeader'
import LandingHero from '../components/landing/LandingHero'
import { useAuth } from '../hooks/useAuth'
import { getPortalPreference } from '../utils/portalPreference'
import { getDefaultRouteForRoles } from '../utils/roleRoutes'

// Trang chủ: giới thiệu + form đăng nhập; modal đăng ký mở trên cùng trang.
// Người đã đăng nhập vào trang này (ví dụ bấm "Về trang chủ") được đưa thẳng vào khu làm việc của họ thay vì thấy lại form đăng nhập như đã bị đăng xuất.
export default function LandingPage() {
  const { user, isChecking } = useAuth()
  const [isRegisterOpen, setIsRegisterOpen] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState('')

  const closeRegister = useCallback(() => setIsRegisterOpen(false), [])

  // Chưa biết phiên còn hợp lệ hay không thì chờ, để không nháy form đăng nhập rồi mới chuyển
  if (isChecking) {
    return (
      <div className="av-center-screen">
        <p role="status" className="d-flex align-items-center gap-3 mb-0 fs-14 text-slate-500">
          <span className="spinner-border spinner-border-sm text-brand" aria-hidden="true" />
          Đang kiểm tra phiên đăng nhập...
        </p>
      </div>
    )
  }
  // Tài khoản chưa có vai trò nào thì không có khu làm việc để vào, vẫn hiện trang chủ để form đăng nhập báo lỗi phân quyền
  const workspace = user ? getDefaultRouteForRoles(user.roles, getPortalPreference()) : null
  if (workspace) return <Navigate to={workspace} replace />

  const handleRegisterSuccess = (email) => {
    setRegisteredEmail(email)
    setIsRegisterOpen(false)
  }

  return (
    <div className="d-flex min-vh-100 flex-column bg-page">
      <LandingHeader />
      <main className="d-flex flex-grow-1 align-items-center">
        <div className="av-container av-landing-grid">
          <LandingHero />
          <div className="d-flex justify-content-center justify-content-lg-end">
            <LoginForm
              key={registeredEmail}
              initialEmail={registeredEmail}
              notice={registeredEmail ? 'Đăng ký thành công. Vui lòng đăng nhập để tiếp tục.' : ''}
              onOpenRegister={() => setIsRegisterOpen(true)}
            />
          </div>
        </div>
      </main>
      <LandingFooter />
      <RegisterModal
        open={isRegisterOpen}
        onClose={closeRegister}
        onSuccess={handleRegisterSuccess}
        onSwitchToLogin={closeRegister}
      />
    </div>
  )
}
