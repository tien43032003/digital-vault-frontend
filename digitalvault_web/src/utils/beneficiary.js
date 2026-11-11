// Tiện ích cho cổng Người thụ hưởng: trạng thái hồ sơ, thông báo lỗi tiếng Việt, phiên xác thực OTP
import { validateHandoverDocument } from './validators'


const GENERIC_ERROR = 'Đã có lỗi xảy ra, vui lòng thử lại.'

// ---- Trạng thái từng phần bàn giao (HANDOVER_CASES của BE) ----
const CASE_STATUS_INFO = {
    Pending: { text: 'Chờ bàn giao', tone: 'muted' },
    In_Progress: { text: 'Đang chuyển giao', tone: 'info' },
    Completed: { text: 'Đã bàn giao - chờ xác nhận', tone: 'warn' },
    Received: { text: 'Đã nhận', tone: 'ok' },
    Cancelled: { text: 'Đã hủy', tone: 'muted' },
}

export function caseStatusInfo(status) {
    return CASE_STATUS_INFO[status] ?? { text: status || 'Không rõ', tone: 'muted' }
}

// Các bước của tiến trình bàn giao theo góc nhìn người thụ hưởng
export const HANDOVER_STEPS = [
    { key: 'Pending', label: 'Khởi tạo hồ sơ', description: 'Người thi hành đã lập hồ sơ và đang chờ hoàn tất thủ tục pháp lý.' },
    { key: 'In_Progress', label: 'Đang chuyển giao', description: 'Hồ sơ đã được duyệt pháp lý, người thi hành đang chuyển giao tài sản.' },
    { key: 'Completed', label: 'Đã bàn giao', description: 'Người thi hành đã nộp biên bản có chữ ký số. Bạn cần xác nhận đã nhận.' },
    { key: 'Received', label: 'Đã xác nhận', description: 'Bạn đã xác nhận nhận tài sản và hệ thống đã cấp biên nhận số.' },
]

// Vị trí bước hiện tại trên tiến trình (-1 nếu trạng thái lạ hoặc đã hủy)
export function handoverStepIndex(status) {
    return HANDOVER_STEPS.findIndex((step) => step.key === status)
}

// Chỉ được xác nhận khi người thi hành đã hoàn tất và chưa có biên nhận
export function canConfirmReceipt(status, receipt) {
    return status === 'Completed' && !receipt
}

// ---- Nhãn tài sản ----
const ASSET_STATUS_INFO = {
    Active: { text: 'Đang hiệu lực', tone: 'ok' },
    Transferred: { text: 'Đã chuyển giao', tone: 'info' },
    Locked: { text: 'Đang niêm phong', tone: 'muted' },
    Revoked: { text: 'Đã thu hồi', tone: 'warn' },
}

export function assetStatusInfo(status) {
    return ASSET_STATUS_INFO[status] ?? { text: status || 'Không rõ', tone: 'muted' }
}

// ---- Lỗi ----

// BE yêu cầu xác thực OTP trước khi xem dữ liệu thụ hưởng: nhận diện lỗi 403/428 có nhắc tới OTP
export function isOtpRequiredError(error) {
    if (error?.status === 428) return true
    return error?.status === 403 && /otp|one[- ]time|verif|xác thực/i.test(error?.message ?? '')
}

export function beneficiaryLoadErrorMessage(error, notFound = 'Không tìm thấy dữ liệu.') {
    if (error?.status === 404) return notFound
    if (isOtpRequiredError(error)) return 'Bạn cần xác thực OTP để xem dữ liệu thụ hưởng.'
    if (error?.status === 403) return 'Tài khoản không có quyền truy cập cổng Người thụ hưởng.'
    return error?.message || GENERIC_ERROR
}

export function otpRequestErrorMessage(error) {
    if (error?.status === 429) return 'Bạn đã yêu cầu mã quá nhiều lần. Vui lòng đợi 1 phút rồi thử lại.'
    if (error?.status === 503) return 'Không gửi được mã OTP lúc này. Vui lòng thử lại sau.'
    if (error?.status === 403) return 'Tài khoản không có quyền truy cập cổng Người thụ hưởng.'
    return error?.message || GENERIC_ERROR
}

// 400 hiện dưới ô nhập, còn lại hiện thành cảnh báo
export function otpVerifyError(error) {
    if (error?.status === 400) return { field: 'Mã OTP không đúng hoặc đã hết hạn.' }
    if (error?.status === 404 || error?.status === 410) return { alert: 'Mã OTP đã hết hạn. Vui lòng gửi lại mã mới.' }
    if (error?.status === 429) return { alert: 'Bạn đã nhập sai quá nhiều lần. Vui lòng gửi lại mã mới.' }
    if (error?.status === 403) return { alert: 'Tài khoản không có quyền truy cập cổng Người thụ hưởng.' }
    return { alert: error?.message || GENERIC_ERROR }
}

export function receiptErrorMessage(error) {
    if (error?.status === 409) return 'Hồ sơ chưa ở trạng thái cho phép xác nhận hoặc bạn đã xác nhận trước đó.'
    if (error?.status === 400) return `Thông tin xác nhận không hợp lệ.${error?.message ? ` ${error.message}` : ''}`
    if (error?.status === 404) return 'Không tìm thấy hồ sơ bàn giao.'
    if (error?.status === 403) return 'Bạn không có quyền xác nhận hồ sơ này.'
    return error?.message || GENERIC_ERROR
}

export const RECEIPT_NOTE_LIMIT = 1000

// BE yêu cầu multipart: File (tệp xác nhận) và Signature (chữ ký số rời) bắt buộc, Note tuỳ chọn
export function validateReceipt({ note, accepted, file, signature }) {
    const errors = validateHandoverDocument({ file, signature }, { signatureRequired: true })
    if (errors.file === 'Vui lòng chọn file giấy tờ.') errors.file = 'Vui lòng chọn tệp xác nhận nhận tài sản.'
    if ((note ?? '').trim().length > RECEIPT_NOTE_LIMIT) errors.note = `Ghi chú tối đa ${RECEIPT_NOTE_LIMIT} ký tự.`
    if (!accepted) errors.accepted = 'Vui lòng xác nhận bạn đã nhận đầy đủ tài sản.'
    return errors
}

// ---- Phiên xác thực OTP ----
// Nguồn sự thật là BE (chặn 403/428 khi chưa xác thực). sessionStorage chỉ lưu "gợi ý" gồm hạn phiên để
// khỏi bắt nhập lại OTP khi tải lại trang; cổng OTP luôn hỏi lại BE trước khi tin gợi ý này.
export const OTP_STORAGE_KEY = 'aeterna.beneficiary.otp'
// Hạn dự phòng khi phản hồi verify của BE không kèm hạn phiên (khớp thời hạn phiên mặc định của BE)
export const OTP_SESSION_TTL_MS = 15 * 60 * 1000

// Lấy mốc hết hạn phiên (ms) từ phản hồi verify của BE: expiresAt/verifiedUntil (ISO) hoặc expiresInSeconds; null nếu không có
export function otpSessionExpiry(data, now = Date.now()) {
    if (!data || typeof data !== 'object') return null
    const iso = data.expiresAt ?? data.verifiedUntil ?? data.sessionExpiresAt
    if (iso) {
        const time = parseServerDate(iso).getTime()
        if (!Number.isNaN(time)) return time
    }
    const seconds = Number(data.expiresInSeconds ?? data.expiresIn)
    return Number.isFinite(seconds) && seconds > 0 ? now + seconds * 1000 : null
}

// Mốc hết hạn (ms) đã lưu cho người dùng này, hoặc null nếu không có/đã hết hạn/thuộc người khác
export function readOtpSessionHint(userKey, now = Date.now()) {
    try {
        const stored = JSON.parse(sessionStorage.getItem(OTP_STORAGE_KEY))
        const expiresAt = Number(stored?.expiresAt)
        if (!stored || stored.userKey !== String(userKey) || !Number.isFinite(expiresAt) || expiresAt <= now) return null
        return expiresAt
    } catch {
        return null
    }
}

export function isOtpVerified(userKey, now = Date.now()) {
    return readOtpSessionHint(userKey, now) !== null
}

// Lưu gợi ý phiên và trả về mốc hết hạn (ms) đã dùng
export function markOtpVerified(userKey, expiresAt = null, now = Date.now()) {
    const until = Number.isFinite(expiresAt) && expiresAt > now ? expiresAt : now + OTP_SESSION_TTL_MS
    try {
        sessionStorage.setItem(OTP_STORAGE_KEY, JSON.stringify({ userKey: String(userKey), expiresAt: until }))
    } catch {
        // Bỏ qua khi trình duyệt chặn storage
    }
    return until
}

export function clearOtpVerified() {
    try {
        sessionStorage.removeItem(OTP_STORAGE_KEY)
    } catch {
        // Bỏ qua khi trình duyệt chặn storage
    }
}

// ---- Thời gian ----

// BE (.NET/SQL Server) lưu giờ UTC nhưng có thể trả chuỗi ISO không kèm múi giờ (không có Z hoặc ±hh:mm).
// JS sẽ hiểu chuỗi đó là giờ địa phương, làm lệch đúng bằng độ lệch múi giờ (UTC+7 → "7 giờ trước"), nên coi là UTC.
export function parseServerDate(iso) {
    if (iso instanceof Date) return iso
    if (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(iso)) {
        return new Date(`${iso}Z`)
    }
    return new Date(iso)
}

// "vừa xong", "5 phút trước", "3 giờ trước", "2 ngày trước"
export function formatRelativeTime(iso, now = Date.now()) {
    const time = parseServerDate(iso).getTime()
    if (Number.isNaN(time)) return ''
    const seconds = Math.max(0, Math.round((now - time) / 1000))
    if (seconds < 60) return 'vừa xong'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} phút trước`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} giờ trước`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days} ngày trước`
    return parseServerDate(iso).toLocaleDateString('vi-VN')
}

// Số giây còn lại tới mốc hết hạn (không âm)
export function secondsUntil(iso, now = Date.now()) {
    const time = parseServerDate(iso).getTime()
    if (Number.isNaN(time)) return 0
    return Math.max(0, Math.ceil((time - now) / 1000))
}

export function formatCountdown(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

// Nội dung văn bản của biên nhận số để tải về
export function receiptText(receipt, assetName) {
    const lines = [
        'BIÊN NHẬN SỐ - XÁC NHẬN NHẬN TÀI SẢN DI SẢN',
        '==========================================',
        `Mã biên nhận: #${receipt.receiptId}`,
        `Hồ sơ bàn giao: #${receipt.handoverId}`,
        `Tài sản: ${assetName || '—'}`,
        `Người thụ hưởng: #${receipt.beneficiaryId}`,
        `Trạng thái: ${receipt.status ?? '—'}`,
        `Thời điểm xác nhận: ${receipt.confirmedAt ? new Date(receipt.confirmedAt).toLocaleString('vi-VN') : '—'}`,
        `Ghi chú: ${receipt.note || '—'}`,
    ]
    return `${lines.join('\n')}\n`
}
