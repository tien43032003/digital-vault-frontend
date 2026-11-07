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
      return 'Gói dịch vụ này chưa thể thanh toán (giá chưa hợp lệ).'
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
