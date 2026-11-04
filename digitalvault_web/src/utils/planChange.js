import { parseServerDate } from './beneficiary'
import { formatPaymentDate, isFreePlan } from './payment'

const DAY_MS = 24 * 60 * 60 * 1000

// 3 ngày đầu của gói: được nâng cấp lên gói giá cao hơn
export const UPGRADE_WINDOW_DAYS = 3
// 5 ngày cuối của gói: nhắc gia hạn và được đăng ký gói cho kỳ sau
export const RENEWAL_WINDOW_DAYS = 5

// Những việc BE đã hỗ trợ. Hiện BE chưa tính tiền chênh lệch khi nâng cấp và chưa có gói xếp hàng cho kỳ sau;
// khi BE làm xong thì bật cờ tương ứng, FE tự mở nút.
export const BACKEND_SUPPORTS = { upgradeDifference: false, scheduledNextPeriod: false }

const time = (value) => parseServerDate(value).getTime()

// Gói trả phí còn hạn thì mới bị ràng buộc đổi gói; gói miễn phí hoặc đã hết hạn thì mua tự do
function activePaidSubscription(subscription, now) {
  if (!subscription?.plan || isFreePlan(subscription.plan)) return null
  const end = time(subscription.endDate)
  if (Number.isNaN(end) || end <= now) return null
  return subscription
}

// Mốc mở cửa đăng ký kỳ sau = 5 ngày trước ngày hết hạn
const renewalOpensAt = (subscription) => time(subscription.endDate) - RENEWAL_WINDOW_DAYS * DAY_MS

// Nhắc gia hạn: gói trả phí còn hạn và chỉ còn tối đa 5 ngày
export function renewalReminder(subscription, now = Date.now()) {
  const active = activePaidSubscription(subscription, now)
  if (!active) return { show: false, daysLeft: 0 }
  const daysLeft = Math.ceil((time(active.endDate) - now) / DAY_MS)
  return { show: daysLeft <= RENEWAL_WINDOW_DAYS, daysLeft }
}

const result = (type, allowed, label, primary, reason = null) => ({ type, allowed, label, primary, reason })

// Quy tắc đổi gói cho một gói `plan` khi tài khoản đang ở `subscription` (và có thể đã xếp sẵn `scheduled` cho kỳ sau).
// Chỉ để ẩn/khoá nút cho dễ hiểu; BE vẫn là nơi kiểm tra và quyết định cuối cùng.
export function getPlanChange({ plan, subscription, scheduled = null, now = Date.now(), support = BACKEND_SUPPORTS }) {
  const free = isFreePlan(plan)
  const active = activePaidSubscription(subscription, now)

  if (!active) {
    if (subscription?.plan && subscription.plan.planId === plan.planId && free) return result('in-use', false, 'Đang sử dụng', false)
    return result('buy', true, free ? 'Dùng miễn phí' : 'Mua gói', true)
  }

  const current = active.plan
  const same = current.planId === plan.planId
  const higher = Number(plan.price) > Number(current.price)
  const opensAt = formatPaymentDate(new Date(renewalOpensAt(active)))
  const label = same ? 'Gia hạn gói' : higher ? 'Nâng cấp' : 'Chuyển gói'

  if (free) return result('locked-free', false, 'Dùng miễn phí', false, 'Gói miễn phí chỉ dành cho tài khoản chưa dùng gói trả phí.')

  const inRenewalWindow = time(active.endDate) - now <= RENEWAL_WINDOW_DAYS * DAY_MS
  if (inRenewalWindow) {
    if (scheduled?.plan) {
      return result('scheduled', false, label, false, `Bạn đã đăng ký gói ${scheduled.plan.planName} cho kỳ sau, bắt đầu ngày ${formatPaymentDate(scheduled.startDate)}.`)
    }
    if (same) return result('renew', true, 'Gia hạn gói', true)
    return result('next-period', true, 'Đăng ký kỳ sau', false)
  }

  const sinceStart = now - time(active.startDate)
  const inUpgradeWindow = sinceStart <= UPGRADE_WINDOW_DAYS * DAY_MS
  if (inUpgradeWindow && higher) {
    if (support.upgradeDifference) return result('upgrade', true, 'Nâng cấp', true)
    return result('upgrade-pending', false, 'Nâng cấp (sắp có)', false, 'Trong 3 ngày đầu bạn chỉ cần trả phần chênh lệch giá. Tính năng này sắp được mở.')
  }

  if (same) return result('locked-renew', false, label, false, `Chỉ gia hạn được trong 5 ngày cuối, từ ngày ${opensAt}.`)
  if (higher && !inUpgradeWindow) {
    return result('locked-mid', false, label, false, `Quá 3 ngày đầu không thể nâng cấp giữa chừng. Bạn có thể đổi gói từ ngày ${opensAt}, khi gói hiện tại sắp hết hạn.`)
  }
  if (!higher && !inUpgradeWindow) {
    return result('locked-mid', false, label, false, `Gói đang dùng cần dùng hết thời hạn. Bạn có thể đổi gói từ ngày ${opensAt}, khi gói hiện tại sắp hết hạn.`)
  }
  return result('locked-lower', false, label, false, `Gói có giá thấp hơn gói đang dùng chỉ chọn được khi gói hiện tại sắp hết hạn, từ ngày ${opensAt}.`)
}
