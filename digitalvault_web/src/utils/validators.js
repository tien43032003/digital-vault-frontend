// Giới hạn độ dài lấy theo DataAnnotations của BE
export const LIMITS = {
  fullName: 100,
  email: 150,
  phone: 20,
  passwordMin: 12,
  passwordMax: 1024,
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value) {
  return EMAIL_PATTERN.test(value)
}

// Validate form đăng nhập, trả về object { field: message } (rỗng nếu hợp lệ)
export function validateLogin({ email, password }) {
  const errors = {}
  const trimmedEmail = email.trim()
  if (!trimmedEmail) errors.email = 'Vui lòng nhập email.'
  else if (!isValidEmail(trimmedEmail)) errors.email = 'Email không hợp lệ.'

  if (!password) errors.password = 'Vui lòng nhập mật khẩu.'
  else if (password.length > LIMITS.passwordMax) errors.password = `Mật khẩu tối đa ${LIMITS.passwordMax} ký tự.`
  return errors
}

const PHONE_PATTERN = /^\+?[0-9][0-9\s]{7,19}$/
const PASSWORD_STRENGTH = /^(?=.*\d)(?=.*[^A-Za-z0-9]).+$/
const PASSWORD_RULE_MESSAGE = `Mật khẩu tối thiểu ${LIMITS.passwordMin} ký tự, có số và ký tự đặc biệt.`

const IDENTITY_NUMBER_PATTERN = /^\d{12}$/

// CCCD cho phép gõ có khoảng trắng (079 094 004521), chuẩn hoá về chuỗi liền trước khi kiểm tra và gửi BE
export function normalizeIdentityNumber(value) {
  return (value ?? '').replace(/\s+/g, '')
}

// Validate form đăng ký: giới hạn theo BE, quy tắc số và ký tự đặc biệt theo gợi ý trên thiết kế
export function validateRegister({ fullName, email, phone, identityNumber = '', password, confirmPassword, acceptTerms }) {
  const errors = {}
  const name = fullName.trim()
  if (!name) errors.fullName = 'Vui lòng nhập họ tên.'
  else if (name.length > LIMITS.fullName) errors.fullName = `Họ tên tối đa ${LIMITS.fullName} ký tự.`

  const mail = email.trim()
  if (!mail) errors.email = 'Vui lòng nhập email.'
  else if (mail.length > LIMITS.email) errors.email = `Email tối đa ${LIMITS.email} ký tự.`
  else if (!isValidEmail(mail)) errors.email = 'Email không hợp lệ.'

  const phoneValue = phone.trim()
  if (!phoneValue) errors.phone = 'Vui lòng nhập số điện thoại.'
  else if (phoneValue.length > LIMITS.phone || !PHONE_PATTERN.test(phoneValue)) errors.phone = 'Số điện thoại không hợp lệ.'

  // CCCD là trường tuỳ chọn (BE: IdentityNumber), chỉ kiểm tra khi người dùng có nhập
  const citizenId = normalizeIdentityNumber(identityNumber)
  if (citizenId && !IDENTITY_NUMBER_PATTERN.test(citizenId)) errors.identityNumber = 'Số CCCD gồm đúng 12 chữ số.'

  if (!password) errors.password = 'Vui lòng nhập mật khẩu.'
  else if (password.length < LIMITS.passwordMin || password.length > LIMITS.passwordMax || !PASSWORD_STRENGTH.test(password))
    errors.password = PASSWORD_RULE_MESSAGE

  if (!confirmPassword) errors.confirmPassword = 'Vui lòng nhập lại mật khẩu.'
  else if (confirmPassword !== password) errors.confirmPassword = 'Mật khẩu xác nhận không khớp.'

  if (!acceptTerms) errors.acceptTerms = 'Bạn cần đồng ý với Điều khoản dịch vụ.'
  return errors
}

export const isValidPhone = (value) => value.length <= LIMITS.phone && PHONE_PATTERN.test(value)

// Mật khẩu đủ độ dài và có cả số lẫn ký tự đặc biệt (dùng chung cho đăng ký và đổi mật khẩu)
export const isStrongPassword = (value) =>
  typeof value === 'string' && value.length >= LIMITS.passwordMin && value.length <= LIMITS.passwordMax && PASSWORD_STRENGTH.test(value)

// Validate form thông tin cá nhân: email và CCCD không sửa được nên không kiểm tra; số điện thoại là tuỳ chọn
export function validateProfile({ fullName, phone }) {
  const errors = {}
  const name = fullName.trim()
  if (!name) errors.fullName = 'Vui lòng nhập họ tên.'
  else if (name.length > LIMITS.fullName) errors.fullName = `Họ tên tối đa ${LIMITS.fullName} ký tự.`

  const phoneValue = phone.trim()
  if (phoneValue && !isValidPhone(phoneValue)) errors.phone = 'Số điện thoại không hợp lệ.'
  return errors
}

// Validate form đổi mật khẩu
export function validatePasswordChange({ currentPassword, newPassword, confirmPassword }) {
  const errors = {}
  if (!currentPassword) errors.currentPassword = 'Vui lòng nhập mật khẩu hiện tại.'

  if (!newPassword) errors.newPassword = 'Vui lòng nhập mật khẩu mới.'
  else if (!isStrongPassword(newPassword)) errors.newPassword = PASSWORD_RULE_MESSAGE
  else if (newPassword === currentPassword) errors.newPassword = 'Mật khẩu mới phải khác mật khẩu hiện tại.'

  if (!confirmPassword) errors.confirmPassword = 'Vui lòng nhập lại mật khẩu mới.'
  else if (confirmPassword !== newPassword) errors.confirmPassword = 'Mật khẩu xác nhận không khớp.'
  return errors
}

// Validate form chỉ định người thụ hưởng khi phải chọn tài sản trước (trang Người thụ hưởng)
export function validateAssignment({ assetId, email, allocation }, remaining) {
  const errors = validateBeneficiary({ email, allocation }, remaining)
  if (!assetId) errors.assetId = 'Vui lòng chọn tài sản.'
  return errors
}

// Giới hạn upload theo BE: file giấy tờ tối đa 10 MB, chữ ký rời tối đa 16 KB, chỉ nhận PDF/PNG/JPEG/text
export const UPLOAD_LIMITS = { maxFileBytes: 10 * 1024 * 1024, maxSignatureBytes: 16384 }
const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain']
const ALLOWED_DOCUMENT_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.txt']
const DOCUMENT_TYPE_MESSAGE = 'Chỉ hỗ trợ PDF, PNG, JPEG hoặc văn bản (.txt).'

// Ưu tiên MIME type của trình duyệt, nếu trống thì dựa vào đuôi file
function isAllowedDocumentType(file) {
  const type = (file.type ?? '').toLowerCase()
  if (type) return ALLOWED_DOCUMENT_TYPES.includes(type)
  const name = (file.name ?? '').toLowerCase()
  return ALLOWED_DOCUMENT_EXTENSIONS.some((extension) => name.endsWith(extension))
}

function validateDocumentFile(file, requiredMessage) {
  if (!file) return requiredMessage
  if (file.size <= 0 || file.size > UPLOAD_LIMITS.maxFileBytes) return 'File phải từ 1 byte đến 10 MB.'
  if (!isAllowedDocumentType(file)) return DOCUMENT_TYPE_MESSAGE
  return undefined
}

// Validate form upload giấy tờ của Owner: bắt buộc file giấy tờ và chữ ký rời; người thụ hưởng là tuỳ chọn
export function validateUpload({ file, signature }) {
  const errors = {}
  const fileError = validateDocumentFile(file, 'Vui lòng chọn file giấy tờ.')
  if (fileError) errors.file = fileError

  if (!signature) errors.signature = 'Vui lòng chọn file chữ ký rời.'
  else if (signature.size <= 0 || signature.size > UPLOAD_LIMITS.maxSignatureBytes) {
    errors.signature = 'File chữ ký phải từ 1 byte đến 16 KB.'
  }
  return errors
}

// Validate form nộp giấy tờ của Người thi hành (giấy chứng tử, bằng chứng, biên bản hoàn tất): chữ ký rời bắt buộc hay không tuỳ nơi dùng
export function validateHandoverDocument({ file, signature }, { signatureRequired = false } = {}) {
  const errors = {}
  const fileError = validateDocumentFile(file, 'Vui lòng chọn file giấy tờ.')
  if (fileError) errors.file = fileError

  if (!signature) {
    if (signatureRequired) errors.signature = 'Vui lòng chọn file chữ ký rời.'
  } else if (signature.size <= 0 || signature.size > UPLOAD_LIMITS.maxSignatureBytes) {
    errors.signature = 'File chữ ký phải từ 1 byte đến 16 KB.'
  }
  return errors
}

// Validate form gửi thẩm định pháp lý: người xác minh (ID), ghi chú tuỳ chọn tối đa 2000 ký tự, file bằng chứng và chữ ký rời (.sig, bắt buộc)
export function validateLegalRequest({ verifierId, comment, evidence, signature }) {
  const errors = {}
  const id = String(verifierId ?? '').trim()
  if (!id) errors.verifierId = 'Vui lòng chọn người xác minh pháp lý.'
  else if (!Number.isInteger(Number(id)) || Number(id) < 1) errors.verifierId = 'ID người xác minh phải là số nguyên dương.'

  if ((comment ?? '').length > 2000) errors.comment = 'Ghi chú tối đa 2000 ký tự.'

  const evidenceError = validateDocumentFile(evidence, 'Vui lòng chọn file giấy tờ.')
  if (evidenceError) errors.evidence = evidenceError

  if (!signature) errors.signature = 'Vui lòng chọn file chữ ký rời.'
  else if (signature.size <= 0 || signature.size > UPLOAD_LIMITS.maxSignatureBytes) errors.signature = 'File chữ ký phải từ 1 byte đến 16 KB.'
  return errors
}

// Lý do Executor từ chối tiếp nhận hồ sơ: bắt buộc, tối đa 2000 ký tự như BE; trả thông báo lỗi hoặc null
export function validateDeclineReason(reason) {
  const trimmed = (reason ?? '').trim()
  if (!trimmed) return 'Vui lòng nhập lý do từ chối.'
  if (trimmed.length > 2000) return 'Lý do tối đa 2000 ký tự.'
  return null
}

// Giới hạn của kho và tài sản lấy theo CreateVaultInput / CreateAssetInput của BE
export const VAULT_LIMITS = { name: 100, description: 4000, assetType: 50 }
const ASSET_TYPE_PATTERN = /^[\x20-\x7E]+$/

// Validate form tạo kho
export function validateVault({ name, description }) {
  const errors = {}
  const trimmed = name.trim()
  if (!trimmed) errors.name = 'Vui lòng nhập tên kho.'
  else if (trimmed.length > VAULT_LIMITS.name) errors.name = `Tên kho tối đa ${VAULT_LIMITS.name} ký tự.`
  if (description.trim().length > VAULT_LIMITS.description) errors.description = `Mô tả tối đa ${VAULT_LIMITS.description} ký tự.`
  return errors
}

// Validate form thêm tài sản; type là chuỗi ASCII vì cột AssetType của BE là varchar(50)
export function validateAsset({ name, type, description }) {
  const errors = {}
  const trimmed = name.trim()
  if (!trimmed) errors.name = 'Vui lòng nhập tên tài sản.'
  else if (trimmed.length > VAULT_LIMITS.name) errors.name = `Tên tài sản tối đa ${VAULT_LIMITS.name} ký tự.`

  if (!type) errors.type = 'Vui lòng chọn loại tài sản.'
  else if (type.length > VAULT_LIMITS.assetType || !ASSET_TYPE_PATTERN.test(type))
    errors.type = `Loại tài sản chỉ gồm ký tự ASCII, tối đa ${VAULT_LIMITS.assetType} ký tự.`

  if (description.trim().length > VAULT_LIMITS.description) errors.description = `Mô tả tối đa ${VAULT_LIMITS.description} ký tự.`
  return errors
}

// Validate form chỉ định người thụ hưởng; remaining là phần trăm còn có thể phân bổ trên tài sản
export function validateBeneficiary({ email, allocation }, remaining) {
  const errors = {}
  const mail = email.trim()
  if (!mail) errors.email = 'Vui lòng nhập email.'
  else if (mail.length > LIMITS.email) errors.email = `Email tối đa ${LIMITS.email} ký tự.`
  else if (!isValidEmail(mail)) errors.email = 'Email không hợp lệ.'

  const raw = allocation.trim().replace(',', '.')
  const value = Number(raw)
  if (!raw) errors.allocation = 'Vui lòng nhập tỷ lệ phân bổ.'
  else if (!Number.isFinite(value) || value < 0.01 || value > 100) errors.allocation = 'Tỷ lệ phải từ 0,01 đến 100.'
  else if (Math.round(value * 100) / 100 !== value) errors.allocation = 'Tỷ lệ tối đa 2 chữ số thập phân.'
  else if (value > remaining) errors.allocation = `Chỉ còn ${remaining}% có thể phân bổ.`
  return errors
}

// Validate riêng ô email (dùng ở bước nhập email của luồng quên mật khẩu)
export function validateEmailOnly(email) {
  const mail = email.trim()
  if (!mail) return 'Vui lòng nhập email.'
  if (mail.length > LIMITS.email) return `Email tối đa ${LIMITS.email} ký tự.`
  if (!isValidEmail(mail)) return 'Email không hợp lệ.'
  return undefined
}

// Mã OTP gồm đúng 6 chữ số
export function validateOtp(value) {
  const otp = value.trim()
  if (!otp) return { otp: 'Vui lòng nhập mã xác nhận.' }
  if (!/^\d{6}$/.test(otp)) return { otp: 'Mã gồm đúng 6 chữ số.' }
  return {}
}

// Validate bước đặt mật khẩu mới khi quên mật khẩu (không có mật khẩu hiện tại để so sánh)
export function validateNewPassword({ newPassword, confirmPassword }) {
  const errors = {}
  if (!newPassword) errors.newPassword = 'Vui lòng nhập mật khẩu mới.'
  else if (!isStrongPassword(newPassword)) errors.newPassword = PASSWORD_RULE_MESSAGE

  if (!confirmPassword) errors.confirmPassword = 'Vui lòng nhập lại mật khẩu mới.'
  else if (confirmPassword !== newPassword) errors.confirmPassword = 'Mật khẩu xác nhận không khớp.'
  return errors
}
