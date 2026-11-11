import { clearTokens, getTokens, setTokens } from '../utils/tokenStorage'
import { normalizeIdentityNumber } from '../utils/validators'
import axiosClient from './axiosClient'

// Các request xác thực tự xử lý 401 nên không kích hoạt redirect toàn cục
const AUTH_CONFIG = { skipAuthRedirect: true }

// Lưu cặp token từ TokenDto của BE ({ userId, roles, accessToken, refreshToken, refreshTokenExpiresAt, ... })
// để axiosClient tự gắn Bearer; trả về riêng userId và roles cho nơi gọi.
function storeSession({ userId, roles, accessToken, refreshToken, refreshTokenExpiresAt }) {
  setTokens({ accessToken, refreshToken, expiresAt: refreshTokenExpiresAt })
  return { userId, roles }
}

// Kết quả bước đăng nhập chính của BE (mật khẩu hoặc Google): 202 là cần xác thực hai lớp (chưa có token, trả challenge để nhập mã),
// còn lại là TokenDto được lưu thành phiên.
export function loginResultFromResponse(data) {
  if (data.requiresTwoFactor) {
    const { challengeId, method, expiresAt, mockCode } = data
    return { requiresTwoFactor: true, challengeId, method, expiresAt, ...(mockCode ? { mockCode } : {}) }
  }
  return storeSession(data)
}

// Đăng nhập: 200 là TokenDto; 202 là cần xác thực hai lớp (chưa có token, trả về thông tin challenge để nhập mã).
export async function login(email, password) {
  // Bỏ token cũ trước để không gửi kèm token hỏng/của tài khoản khác
  clearTokens()
  const { data } = await axiosClient.post('/auth/login', { email, password }, AUTH_CONFIG)
  return loginResultFromResponse(data)
}

// Bước 2 khi có xác thực hai lớp: mã 6 số gửi qua email hoặc từ ứng dụng TOTP
export async function verifyTwoFactor(challengeId, code) {
  clearTokens()
  const { data } = await axiosClient.post('/auth/2fa/verify', { challengeId, code: code.trim() }, AUTH_CONFIG)
  return storeSession(data)
}

// Chỉ gửi lại được mã Email (BE chờ 60 giây giữa hai lần) và trả challenge mới thay cho challenge cũ
export async function resendTwoFactor(challengeId) {
  const { data } = await axiosClient.post('/auth/2fa/resend', { challengeId }, AUTH_CONFIG)
  return data
}

// Đăng ký tài khoản Owner, chỉ gửi đúng các trường BE nhận (BE từ chối trường thừa)
export async function register({ fullName, email, phone, identityNumber, password, confirmPassword }) {
  const trimmedPhone = phone?.trim()
  const citizenId = normalizeIdentityNumber(identityNumber)
  const { data } = await axiosClient.post(
    '/auth/register',
    {
      fullName,
      email,
      phone: trimmedPhone ? trimmedPhone : null,
      // CCCD tuỳ chọn: chỉ gửi khi có nhập (BE bỏ qua khi thiếu)
      ...(citizenId ? { identityNumber: citizenId } : {}),
      password,
      confirmPassword,
    },
    AUTH_CONFIG,
  )
  return data
}

// Gửi kèm refresh token để BE thu hồi; luôn xoá token phía FE dù BE trả lỗi, để người dùng thoát được phiên
export async function logout() {
  const refreshToken = getTokens()?.refreshToken
  try {
    await axiosClient.post('/auth/logout', refreshToken ? { refreshToken } : {}, AUTH_CONFIG)
  } finally {
    clearTokens()
  }
}

// Kiểm tra phiên bằng GET /auth/me (BE đọc lại trạng thái và role từ database).
// Trả { userId, fullName, email, roles } khi còn phiên, null khi hết phiên; lỗi mạng thì ném ra.
export async function checkSession() {
  // Không có token thì chắc chắn chưa đăng nhập, khỏi gọi BE
  if (!getTokens()) return null
  try {
    const { data } = await axiosClient.get('/auth/me', AUTH_CONFIG)
    return { userId: data.userId, fullName: data.fullName, email: data.email, roles: data.roles }
  } catch (error) {
    if (error.status === 401) return null
    throw error
  }
}

// Quên mật khẩu (BE: IdentityService). Ba bước: gửi mã OTP qua email, xác nhận mã để nhận resetToken, đặt mật khẩu mới.
// BE giới hạn: xin lại mã sau 60 giây (429), mã 6 số hết hạn và chỉ được thử sai tối đa 5 lần (đều trả 400), mật khẩu mới từ 12 ký tự.
export async function requestPasswordReset(email) {
  const { data } = await axiosClient.post('/auth/forgot-password', { email: email.trim() }, AUTH_CONFIG)
  return data
}

export async function verifyResetOtp(email, otp) {
  const { data } = await axiosClient.post('/auth/forgot-password/verify-otp', { email: email.trim(), code: otp.trim() }, AUTH_CONFIG)
  return data
}

// Chỉ gửi đúng các trường hợp đồng; mật khẩu không bao giờ được log
export async function resetPassword({ email, resetToken, newPassword, confirmPassword }) {
  await axiosClient.post('/auth/reset-password', { email: email.trim(), resetToken, newPassword, confirmPassword }, AUTH_CONFIG)
}
