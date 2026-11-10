import { isValidEmail, LIMITS } from './validators'

// Vai trò hệ thống của BE (bảng ROLES) kèm tên hiển thị
export const ROLE_LABELS = {
  Admin: 'Quản trị viên',
  Owner: 'Chủ sở hữu',
  Executor: 'Người thi hành',
  Beneficiary: 'Người thụ hưởng',
  LegalVerifier: 'Người xác minh pháp lý',
}
export const ALL_ROLES = Object.keys(ROLE_LABELS)
export const roleLabel = (role) => ROLE_LABELS[role] ?? role

// Trạng thái tài khoản (USERS.Status) và tông màu hiển thị
const USER_STATUS_INFO = {
  Active: { text: 'Hoạt động', tone: 'ok' },
  Disabled: { text: 'Vô hiệu hóa', tone: 'muted' },
  Locked: { text: 'Bị khóa', tone: 'warn' },
}
export const USER_STATUSES = Object.keys(USER_STATUS_INFO)
export const userStatusInfo = (status) => USER_STATUS_INFO[status] ?? { text: status, tone: 'muted' }

// Tách lỗi 400/409 từ BE về đúng trường đang gặp ngoại lệ (email, phone, identityNumber)
export function extractUserFieldError(error) {
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
  if (code === 'EMAIL_ALREADY_EXISTS' || code === 'INVALID_EMAIL' || lower.includes('email')) {
    return { field: 'email', message: msg || 'Email này đã được sử dụng.' }
  }
  return null
}

// Thông báo lỗi chung cho các thao tác quản trị người dùng
export function adminErrorMessage(error) {
  if (error?.message && error.message !== 'Đã có lỗi xảy ra, vui lòng thử lại.') return error.message
  if (error?.status === 400) return 'Thông tin không hợp lệ. Vui lòng kiểm tra lại.'
  if (error?.status === 403) return 'Bạn không có quyền Quản trị hệ thống.'
  if (error?.status === 404) return 'Không tìm thấy người dùng. Vui lòng tải lại danh sách.'
  if (error?.status === 409) return 'Email này đã được sử dụng.'
  return error?.message || 'Đã có lỗi xảy ra, vui lòng thử lại.'
}

// Validate form tạo người dùng; mật khẩu chỉ cần đủ độ dài như BE
export function validateAdminUser({ fullName, email, password, phone, identityNumber, roles }) {
  const errors = {}
  const name = fullName.trim()
  if (!name) errors.fullName = 'Vui lòng nhập họ tên.'
  else if (name.length > LIMITS.fullName) errors.fullName = `Họ tên tối đa ${LIMITS.fullName} ký tự.`

  const mail = email.trim()
  if (!mail) errors.email = 'Vui lòng nhập email.'
  else if (!isValidEmail(mail) || mail.length > LIMITS.email) errors.email = 'Email không hợp lệ.'

  if (!password) errors.password = 'Vui lòng nhập mật khẩu.'
  else if (password.length < LIMITS.passwordMin) errors.password = `Mật khẩu tối thiểu ${LIMITS.passwordMin} ký tự.`
  else if (password.length > LIMITS.passwordMax) errors.password = `Mật khẩu tối đa ${LIMITS.passwordMax} ký tự.`

  if (phone.trim().length > LIMITS.phone) errors.phone = `Số điện thoại tối đa ${LIMITS.phone} ký tự.`
  if (identityNumber.trim().length > LIMITS.phone) errors.identityNumber = `Số CCCD tối đa ${LIMITS.phone} ký tự.`
  if (roles.length === 0) errors.roles = 'Chọn ít nhất một vai trò.'
  return errors
}

// Validate form Admin sửa thông tin người dùng: họ tên bắt buộc, điện thoại và CCCD có thể để trống
export function validateAdminProfile({ fullName, phone, identityNumber }) {
  const errors = {}
  const name = fullName.trim()
  if (!name) errors.fullName = 'Vui lòng nhập họ tên.'
  else if (name.length > LIMITS.fullName) errors.fullName = `Họ tên tối đa ${LIMITS.fullName} ký tự.`
  if (phone.trim().length > LIMITS.phone) errors.phone = `Số điện thoại tối đa ${LIMITS.phone} ký tự.`
  if (identityNumber.trim().length > LIMITS.phone) errors.identityNumber = `Số CCCD tối đa ${LIMITS.phone} ký tự.`
  return errors
}

// Mật khẩu mới do Admin đặt: chỉ cần đủ độ dài như BE; trả thông báo lỗi hoặc chuỗi rỗng khi hợp lệ
export function validateNewPassword(password) {
  if (!password) return 'Vui lòng nhập mật khẩu mới.'
  if (password.length < LIMITS.passwordMin) return `Mật khẩu tối thiểu ${LIMITS.passwordMin} ký tự.`
  if (password.length > LIMITS.passwordMax) return `Mật khẩu tối đa ${LIMITS.passwordMax} ký tự.`
  return ''
}

const isPositiveInt = (value) => Number.isInteger(value) && value >= 1
const isNonNegativeInt = (value) => Number.isInteger(value) && value >= 0
// Cron 5 trường (phút giờ ngày tháng thứ), mỗi trường chỉ gồm số, *, /, -, ,
const CRON_PATTERN = /^\S+(\s+\S+){4}$/
const CRON_FIELD = /^[\d*/,-]+$/

// Validate toàn bộ tham số hệ thống trước khi gửi (BE không kiểm tra giá trị); trả { tênTrường: thông báo }
export function validateSystemConfig({ encryptionPolicy, proofOfLifePolicy, storagePolicy, backupPolicy }) {
  const errors = {}
  if (!isPositiveInt(encryptionPolicy.keyRotationIntervalDays) || encryptionPolicy.keyRotationIntervalDays > 3650) {
    errors.keyRotationIntervalDays = 'Chu kỳ xoay khóa là số ngày nguyên từ 1 đến 3650.'
  }
  if (!Number.isInteger(encryptionPolicy.minPasswordLength) || encryptionPolicy.minPasswordLength < 8 || encryptionPolicy.minPasswordLength > 128) {
    errors.minPasswordLength = 'Độ dài mật khẩu tối thiểu là số nguyên từ 8 đến 128.'
  }
  if (!isPositiveInt(proofOfLifePolicy.defaultPingIntervalDays)) errors.defaultPingIntervalDays = 'Chu kỳ điểm danh là số ngày nguyên lớn hơn 0.'
  if (!isPositiveInt(proofOfLifePolicy.gracePeriodDays)) errors.gracePeriodDays = 'Thời gian ân hạn là số ngày nguyên lớn hơn 0.'
  if (!isNonNegativeInt(proofOfLifePolicy.warningDaysBeforeGrace)) errors.warningDaysBeforeGrace = 'Số ngày cảnh báo là số nguyên không âm.'
  else if (!errors.gracePeriodDays && proofOfLifePolicy.warningDaysBeforeGrace > proofOfLifePolicy.gracePeriodDays) {
    errors.warningDaysBeforeGrace = 'Số ngày cảnh báo không được vượt quá thời gian ân hạn.'
  }
  if (!isPositiveInt(storagePolicy.maxUploadSizeBytes)) errors.maxUploadSizeBytes = 'Dung lượng tối đa là số byte nguyên lớn hơn 0.'
  const extensions = storagePolicy.allowedExtensions
  if (extensions.length === 0 || extensions.some((ext) => !/^\.[a-z0-9]+$/i.test(ext))) {
    errors.allowedExtensions = 'Nhập ít nhất một đuôi tệp, mỗi đuôi bắt đầu bằng dấu chấm (ví dụ .pdf).'
  }
  const cron = backupPolicy.cronSchedule.trim()
  if (!CRON_PATTERN.test(cron) || !cron.split(/\s+/).every((field) => CRON_FIELD.test(field))) {
    errors.cronSchedule = 'Lịch sao lưu phải là biểu thức cron 5 trường (ví dụ 0 0 * * *).'
  }
  if (!isPositiveInt(backupPolicy.retentionDays)) errors.retentionDays = 'Số ngày lưu bản sao lưu là số nguyên lớn hơn 0.'
  return errors
}

// Mức độ cảnh báo an ninh của BE (Critical, Warning, Info) và tông màu huy hiệu
const SEVERITY_INFO = {
  Critical: { text: 'Nghiêm trọng', tone: 'warn' },
  Warning: { text: 'Cảnh báo', tone: 'caution' },
  Info: { text: 'Thông tin', tone: 'info' },
}
export const severityInfo = (severity) => SEVERITY_INFO[severity] ?? { text: severity, tone: 'muted' }

const INTEGRATION_STATUS_INFO = {
  Connected: { text: 'Đã kết nối', tone: 'ok' },
  Disconnected: { text: 'Mất kết nối', tone: 'warn' },
  Degraded: { text: 'Chậm hoặc không ổn định', tone: 'caution' },
}
export const integrationStatusInfo = (status) => INTEGRATION_STATUS_INFO[status] ?? { text: status, tone: 'muted' }

// Mã quyền của BE (nhóm:hành động) kèm tên tiếng Việt; mã lạ giữ nguyên
const PERMISSION_LABELS = {
  'vault:create': 'Tạo kho',
  'vault:manage': 'Quản lý kho',
  'asset:create': 'Tạo tài sản',
  'asset:manage': 'Quản lý tài sản',
  'executor:assign': 'Gán người thi hành',
  'beneficiary:assign': 'Chỉ định người thụ hưởng',
  'proof_of_life:ping': 'Điểm danh sự sống',
  'audit:view_own': 'Xem nhật ký của mình',
  'handover:view_assigned': 'Xem hồ sơ được giao',
  'handover:accept': 'Tiếp nhận hồ sơ bàn giao',
  'handover:decline': 'Từ chối hồ sơ bàn giao',
  'handover:submit_proof': 'Nộp giấy tờ chứng minh',
  'handover:start': 'Bắt đầu bàn giao',
  'handover:complete': 'Hoàn tất bàn giao',
  'legal:view_queue': 'Xem hàng đợi thẩm định',
  'legal:review_evidence': 'Xem xét chứng cứ',
  'legal:approve': 'Duyệt hồ sơ',
  'legal:reject': 'Từ chối hồ sơ',
  'legal:request_info': 'Yêu cầu bổ sung thông tin',
  'legal:sign': 'Ký xác nhận pháp lý',
  'claim:view_cases': 'Xem hồ sơ thừa kế',
  'claim:download_asset': 'Tải tài sản được thừa kế',
  'claim:decrypt': 'Giải mã tài sản',
  'claim:confirm_receipt': 'Xác nhận đã nhận',
  'admin:users_manage': 'Quản lý người dùng',
  'admin:roles_view': 'Xem phân quyền',
  'admin:audit_logs': 'Xem nhật ký kiểm toán',
  'admin:security_alerts': 'Xem cảnh báo an ninh',
  'admin:system_config': 'Cấu hình hệ thống',
  'admin:key_rotation': 'Xoay vòng khóa mã hóa',
  'admin:integrations_manage': 'Quản lý tích hợp',
}
export const permissionLabel = (code) => PERMISSION_LABELS[code] ?? code

// Dung lượng dễ đọc theo tiếng Việt (dấu phẩy thập phân)
export function formatBytes(bytes) {
  const fmt = (value) => String(Math.round(value * 10) / 10).replace('.', ',')
  if (bytes >= 1024 * 1024) return `${fmt(bytes / (1024 * 1024))} MB`
  if (bytes >= 1024) return `${fmt(bytes / 1024)} KB`
  return `${bytes} B`
}
