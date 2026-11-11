import { parseServerDate } from './beneficiary'

const DAY_MS = 24 * 60 * 60 * 1000

// Còn từ 0 đến 5 ngày là vào thời gian nhắc gia hạn (cùng mốc với quy tắc đổi gói)
export const EXPIRING_WITHIN_DAYS = 5

const time = (value) => parseServerDate(value).getTime()

// Trạng thái hiển thị của một đăng ký gói cho Admin, tự tính từ ngày tháng để luôn khớp với thời điểm đang xem
// Trả { key, label, tone, daysLeft }; daysLeft = null với gói miễn phí (không có hạn)
// Dữ liệu không có giá (vd danh sách người dùng của một gói) thì coi là gói trả phí và dựa vào ngày tháng
export function describeSubscription(item, now = Date.now()) {
  if (item.status === 'Scheduled') return { key: 'scheduled', label: 'Chờ kích hoạt', tone: 'info', daysLeft: null }
  if (item.price !== undefined && !(Number(item.price) > 0) && item.status !== 'Expired') return { key: 'free', label: 'Gói miễn phí', tone: 'muted', daysLeft: null }

  const end = time(item.endDate)
  if (item.status === 'Expired' || Number.isNaN(end) || end <= now) return { key: 'expired', label: 'Đã hết hạn', tone: 'danger', daysLeft: 0 }

  const daysLeft = Math.ceil((end - now) / DAY_MS)
  if (daysLeft <= EXPIRING_WITHIN_DAYS) return { key: 'expiring', label: 'Sắp đến hạn gia hạn', tone: 'warn', daysLeft }
  return { key: 'active', label: 'Đang sử dụng', tone: 'ok', daysLeft }
}

// Thời hạn thực tế của đăng ký (số ngày giữa ngày bắt đầu và ngày hết hạn); null với gói miễn phí hoặc ngày không hợp lệ
export function subscriptionSpanDays(item) {
  if (!(Number(item.price) > 0)) return null
  const start = time(item.startDate)
  const end = time(item.endDate)
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  return Math.round((end - start) / DAY_MS)
}

export const STATUS_FILTERS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'active', label: 'Đang sử dụng' },
  { value: 'expiring', label: 'Sắp đến hạn gia hạn' },
  { value: 'scheduled', label: 'Chờ kích hoạt' },
  { value: 'expired', label: 'Đã hết hạn' },
]

// Tham số gửi BE cho từng lựa chọn lọc: "sắp đến hạn" = đang hiệu lực và còn tối đa 5 ngày
export function statusFilterParams(value) {
  switch (value) {
    case 'active':
      return { status: 'Active' }
    case 'expiring':
      return { status: 'Active', expiringInDays: EXPIRING_WITHIN_DAYS }
    case 'scheduled':
      return { status: 'Scheduled' }
    case 'expired':
      return { status: 'Expired' }
    default:
      return {}
  }
}
