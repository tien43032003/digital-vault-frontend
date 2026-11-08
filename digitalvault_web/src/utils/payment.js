import { parseServerDate } from './beneficiary'

// Số tiền VND làm tròn đến đồng, ngăn cách hàng nghìn bằng dấu chấm
export function formatVnd(amount) {
  return `${String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} ₫`
}

// Dung lượng dễ đọc theo tiếng Việt (dấu phẩy thập phân)
export function formatStorage(bytes) {
  const fmt = (value) => String(Math.round(value * 10) / 10).replace('.', ',')
  if (bytes >= 1024 ** 3) return `${fmt(bytes / 1024 ** 3)} GB`
  if (bytes >= 1024 ** 2) return `${fmt(bytes / 1024 ** 2)} MB`
  if (bytes >= 1024) return `${fmt(bytes / 1024)} KB`
  return `${bytes} B`
}

// Thời hạn gói: quy đổi sang năm hoặc tháng khi chia hết, còn lại giữ số ngày
export function formatDuration(days) {
  if (days >= 365 && days % 365 === 0) return `${days / 365} năm`
  if (days >= 30 && days % 30 === 0) return `${days / 30} tháng`
  return `${days} ngày`
}

// Trạng thái giao dịch của BE (PaymentTransaction.Status) và tông màu huy hiệu
const PAYMENT_STATUS_INFO = {
  Success: { text: 'Thanh toán thành công', tone: 'ok' },
  Failed: { text: 'Thanh toán thất bại', tone: 'warn' },
  Pending: { text: 'Đang chờ xác nhận', tone: 'caution' },
}
export const paymentStatusInfo = (status) => PAYMENT_STATUS_INFO[status] ?? { text: status, tone: 'muted' }

// Link thanh toán VNPay chỉ có hiệu lực 15 phút; quá hạn mà BE vẫn ghi Pending nghĩa là khách đã bỏ dở (VNPay không gọi lại)
export const PENDING_EXPIRE_MS = 15 * 60 * 1000
export function isPendingExpired(item, now = Date.now()) {
  if (item?.status !== 'Pending') return false
  const created = parseServerDate(item.createdAt).getTime()
  return !Number.isNaN(created) && now - created > PENDING_EXPIRE_MS
}

const PENDING_CHECKOUT_KEY = 'aeterna.pendingCheckouts'

// Lưu lại paymentUrl của giao dịch Pending vừa tạo (chỉ giữ 1 gói Pending duy nhất) để khách bấm "Tiếp tục thanh toán" mở lại đúng link VNPay cũ mà không tạo đơn Pending mới
export function savePendingCheckout(planId, checkout) {
  if (!checkout?.transactionCode || !checkout?.paymentUrl) return
  try {
    const entry = {
      planId: Number(planId),
      transactionCode: checkout.transactionCode,
      amount: checkout.amount,
      paymentUrl: checkout.paymentUrl,
      createdAt: Date.now(),
    }
    const map = {
      [String(planId)]: entry,
      [`tx:${checkout.transactionCode}`]: entry,
    }
    localStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(map))
  } catch {
    // Bỏ qua khi trình duyệt chặn storage
  }
}

export function getPendingCheckoutByPlan(planId, now = Date.now()) {
  try {
    const map = JSON.parse(localStorage.getItem(PENDING_CHECKOUT_KEY) || '{}')
    const entry = map[String(planId)]
    if (!entry?.paymentUrl || now - entry.createdAt > PENDING_EXPIRE_MS) return null
    return entry
  } catch {
    return null
  }
}

export function getPendingCheckoutByCode(transactionCode, now = Date.now()) {
  if (!transactionCode) return null
  try {
    const map = JSON.parse(localStorage.getItem(PENDING_CHECKOUT_KEY) || '{}')
    const entry = map[`tx:${transactionCode}`]
    if (!entry?.paymentUrl || now - entry.createdAt > PENDING_EXPIRE_MS) return null
    return entry
  } catch {
    return null
  }
}

export function clearPendingCheckout(planId, transactionCode) {
  try {
    const map = JSON.parse(localStorage.getItem(PENDING_CHECKOUT_KEY) || '{}')
    if (planId !== undefined) delete map[String(planId)]
    if (transactionCode) delete map[`tx:${transactionCode}`]
    localStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(map))
  } catch {
    // Bỏ qua khi trình duyệt chặn storage
  }
}

// Bộ lọc trạng thái của lịch sử giao dịch (giá trị gửi lên BE qua ?status=)
export const PAYMENT_STATUS_FILTERS = [
  { value: '', label: 'Tất cả' },
  { value: 'Success', label: 'Thành công' },
  { value: 'Pending', label: 'Đang chờ' },
  { value: 'Failed', label: 'Thất bại' },
]

// Trạng thái gói của người dùng (UserSubscription.Status); giá trị lạ giữ nguyên để không mất thông tin
const SUBSCRIPTION_STATUS_INFO = {
  Active: { text: 'Đang hiệu lực', tone: 'ok' },
  Expired: { text: 'Đã hết hạn', tone: 'muted' },
  Cancelled: { text: 'Đã hủy', tone: 'muted' },
  Pending: { text: 'Chờ kích hoạt', tone: 'caution' },
}
export const subscriptionStatusInfo = (status) => SUBSCRIPTION_STATUS_INFO[status] ?? { text: status || 'Không rõ', tone: 'muted' }

// Gói giá 0 là gói miễn phí: BE kích hoạt ngay, không tạo thanh toán VNPay
export const isFreePlan = (plan) => !(Number(plan?.price) > 0)

export const formatPlanPrice = (plan) => (isFreePlan(plan) ? 'Miễn phí' : formatVnd(plan.price))

const DAY_MS = 24 * 60 * 60 * 1000

// Số ngày còn lại (làm tròn lên, không âm) tới ngày hết hạn gói
export function daysLeft(endDate, now = Date.now()) {
  const end = parseServerDate(endDate).getTime()
  if (Number.isNaN(end)) return 0
  return Math.max(0, Math.ceil((end - now) / DAY_MS))
}

// Ngày hết hạn dự kiến nếu kích hoạt gói ngay bây giờ (BE tính chính xác khi thanh toán thành công)
export function estimatedEndDate(durationDays, now = Date.now()) {
  return new Date(now + durationDays * DAY_MS)
}

// Phần trăm thời hạn đã dùng của gói (0-100), dùng cho thanh tiến độ
export function usedPercent(startDate, endDate, now = Date.now()) {
  const start = parseServerDate(startDate).getTime()
  const end = parseServerDate(endDate).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 100
  return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)))
}

// Ngày theo giờ địa phương (dd/mm/yyyy), chấp nhận chuỗi giờ UTC không kèm múi giờ của BE
export function formatPaymentDate(value) {
  const date = parseServerDate(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatPaymentDateTime(value) {
  const date = parseServerDate(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Chỉ giữ các tham số vnp_* VNPay gửi về; BE kiểm tra chữ ký trên đúng tập này nên không được sửa hay bỏ bớt
export function vnpayParams(searchParams) {
  const result = {}
  searchParams.forEach((value, key) => {
    if (key.startsWith('vnp_')) result[key] = value
  })
  return result
}

const DEFAULT_ERROR = 'Đã có lỗi xảy ra, vui lòng thử lại.'
const NOT_CONFIGURED = 'Cổng thanh toán VNPay chưa được cấu hình. Vui lòng liên hệ quản trị viên.'

// Lỗi khi bấm thanh toán một gói
export function checkoutErrorMessage(error) {
  switch (error?.status) {
    case 401:
      return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
    case 404:
      return 'Gói dịch vụ không còn khả dụng. Vui lòng tải lại trang.'
    case 400:
      return error?.message || 'Gói dịch vụ này chưa thể thanh toán (giá chưa hợp lệ).'
    case 503:
      return NOT_CONFIGURED
    default:
      return error?.message || DEFAULT_ERROR
  }
}

// Lỗi khi xác thực kết quả VNPay trả về
export function returnErrorMessage(error) {
  switch (error?.status) {
    case 400:
      return 'Không xác thực được kết quả thanh toán (chữ ký hoặc dữ liệu không hợp lệ).'
    case 404:
      return 'Không tìm thấy giao dịch thanh toán này.'
    case 409:
      return 'Giao dịch đã có kết quả khác với thông báo này, vui lòng kiểm tra lại với quản trị viên.'
    case 503:
      return NOT_CONFIGURED
    default:
      return error?.message || DEFAULT_ERROR
  }
}

// Nút hành động trên thẻ gói, tùy gói đang dùng: chưa có gói thì Mua (gói 0đ là Dùng miễn phí), cùng gói thì Gia hạn,
// gói đắt hơn thì Nâng cấp, rẻ hơn thì Chuyển gói. Đang dùng đúng gói miễn phí thì không cần thao tác nên trả null.
export function planAction(plan, currentPlan) {
  const free = isFreePlan(plan)
  if (currentPlan && currentPlan.planId === plan.planId) return free ? null : { label: 'Gia hạn gói', primary: false }
  if (!currentPlan || isFreePlan(currentPlan)) return free ? { label: 'Dùng miễn phí', primary: true } : { label: 'Mua gói', primary: true }
  if (Number(plan.price) > Number(currentPlan.price)) return { label: 'Nâng cấp', primary: true }
  return { label: 'Chuyển gói', primary: false }
}

// BE kích hoạt gói 0đ ngay trong DB và trả paymentUrl rỗng: khi đó không chuyển sang VNPay mà coi như đã đăng ký thành công
export const needsGatewayRedirect = (checkout) => typeof checkout?.paymentUrl === 'string' && checkout.paymentUrl.trim() !== ''

// Phương thức thanh toán theo thiết kế. BE hiện chỉ có API VNPay (/payments/vnpay/*), các phương thức khác hiển thị nhưng chưa chọn được.
export const PAYMENT_METHODS = [
  { value: 'VNPay', label: 'Cổng thanh toán VNPay', description: 'Thẻ ATM nội địa, Internet Banking, thẻ quốc tế hoặc quét mã VNPAY-QR.', available: true },
  { value: 'MoMo', label: 'Ví MoMo', description: 'Thanh toán bằng ví điện tử MoMo.', available: false },
  { value: 'BankTransfer', label: 'Chuyển khoản ngân hàng', description: 'Chuyển khoản theo số tài khoản và nội dung đối soát.', available: false },
]

// ----- Quản lý gói dịch vụ của Admin -----

const GIB = 1024 ** 3
const PLAN_LIMITS = { nameMax: 100, vaultsMax: 100000, durationMax: 3650, priceMin: 0, priceMax: 1000000000 }

const toNumber = (value) => Number(String(value ?? '').trim().replace(',', '.'))
const isPositiveInteger = (value) => /^\d+$/.test(String(value ?? '').trim()) && Number(value) >= 1

// Giá trị ban đầu của form: dung lượng đổi sang GB (tối đa 2 chữ số thập phân)
export function planToForm(plan) {
  if (!plan) return { planName: '', maxVaults: '', storageGb: '', price: '', durationDays: '', isActive: true }
  return {
    planName: plan.planName ?? '',
    maxVaults: String(plan.maxVaults),
    storageGb: String(Math.round((plan.maxStorageBytes / GIB) * 100) / 100),
    price: String(plan.price),
    durationDays: String(plan.durationDays),
    isActive: plan.isActive,
  }
}

// Validate form gói theo giới hạn của BE (SaveSubscriptionPlanInput), trả { field: message }
export function validatePlanForm({ planName, maxVaults, storageGb, price, durationDays }) {
  const errors = {}
  const name = planName.trim()
  if (!name) errors.planName = 'Vui lòng nhập tên gói.'
  else if (name.length > PLAN_LIMITS.nameMax) errors.planName = `Tên gói tối đa ${PLAN_LIMITS.nameMax} ký tự.`

  if (!isPositiveInteger(maxVaults) || Number(maxVaults) > PLAN_LIMITS.vaultsMax) errors.maxVaults = `Số kho là số nguyên từ 1 đến ${PLAN_LIMITS.vaultsMax}.`

  const gb = toNumber(storageGb)
  if (!String(storageGb).trim() || !Number.isFinite(gb) || gb <= 0 || Math.round(gb * GIB) < 1) errors.storageGb = 'Dung lượng phải lớn hơn 0 GB.'

  const amount = toNumber(price)
  if (!String(price).trim() || !Number.isFinite(amount) || amount < PLAN_LIMITS.priceMin || amount > PLAN_LIMITS.priceMax) {
    errors.price = `Giá phải từ ${formatVnd(PLAN_LIMITS.priceMin)} (gói miễn phí) đến ${formatVnd(PLAN_LIMITS.priceMax)}.`
  }

  if (!isPositiveInteger(durationDays) || Number(durationDays) > PLAN_LIMITS.durationMax) errors.durationDays = `Thời hạn là số nguyên từ 1 đến ${PLAN_LIMITS.durationMax} ngày.`
  return errors
}

// Chuyển form sang body gửi BE. Nếu ô dung lượng không đổi so với gói gốc thì giữ nguyên số byte (tránh sai số khi làm tròn GB)
export function planFormToInput(form, original = null) {
  const keepBytes = original && form.storageGb.trim() === planToForm(original).storageGb
  return {
    planName: form.planName.trim(),
    maxVaults: Number(form.maxVaults),
    maxStorageBytes: keepBytes ? original.maxStorageBytes : Math.round(toNumber(form.storageGb) * GIB),
    price: toNumber(form.price),
    durationDays: Number(form.durationDays),
    isActive: form.isActive,
  }
}

// Lý do máy chủ trả về; bỏ qua câu mặc định của axiosClient để không lặp lại thông báo chung
const serverDetail = (error) => (error?.message && error.message !== DEFAULT_ERROR ? ` Chi tiết từ máy chủ: ${error.message}` : '')

// Lỗi khi tạo, sửa hoặc xóa gói; action: 'save' | 'delete' (ngừng bán gói đang bán) | 'delete-permanent' (xóa hẳn gói đã ngừng bán)
export function adminPlanErrorMessage(error, action = 'save') {
  switch (error?.status) {
    case 400:
      // Kèm nguyên văn lý do của máy chủ (nếu có) để biết trường nào bị từ chối
      return `Thông tin gói không hợp lệ. Vui lòng kiểm tra lại.${serverDetail(error)}`
    case 403:
      return 'Bạn không có quyền quản trị gói dịch vụ.'
    case 404:
      return 'Không tìm thấy gói dịch vụ. Vui lòng tải lại danh sách.'
    case 409:
      if (action === 'delete-permanent') return 'Gói đã có giao dịch hoặc người đăng ký nên không thể xóa hẳn. Bạn có thể giữ gói ở nhóm "Ngừng bán".'
      return action === 'delete'
        ? 'Gói đang được sử dụng nên không xóa được. Bạn có thể chuyển gói sang "Ngừng bán".'
        : 'Tên gói đã tồn tại hoặc dữ liệu đang xung đột.'
    default:
      return error?.message || DEFAULT_ERROR
  }
}

export const ADMIN_PAYMENT_STATUSES = ['Success', 'Pending', 'Failed']
