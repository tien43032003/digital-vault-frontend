import { describeSubscription, STATUS_FILTERS, statusFilterParams, subscriptionSpanDays } from './subscriptionStatus'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-11-07T10:00:00Z')

// Gói trả phí đã chạy `elapsed` ngày trong tổng `total` ngày
const paid = (elapsed, total = 30, extra = {}) => ({
  subscriptionId: 1,
  status: 'Active',
  price: 299000,
  startDate: new Date(NOW - elapsed * DAY).toISOString(),
  endDate: new Date(NOW - elapsed * DAY + total * DAY).toISOString(),
  ...extra,
})

describe('describeSubscription', () => {
  it('describe_PaidWithMoreThanFiveDaysLeft_IsActive', () => {
    expect(describeSubscription(paid(10), NOW)).toMatchObject({ key: 'active', label: 'Đang sử dụng', tone: 'ok', daysLeft: 20 })
  })

  it('describe_PaidWithFiveOrFewerDaysLeft_IsExpiringSoon', () => {
    expect(describeSubscription(paid(25), NOW)).toMatchObject({ key: 'expiring', label: 'Sắp đến hạn gia hạn', tone: 'warn', daysLeft: 5 })
    expect(describeSubscription(paid(29), NOW)).toMatchObject({ key: 'expiring', daysLeft: 1 })
  })

  it('describe_SixDaysLeft_IsStillActive', () => {
    expect(describeSubscription(paid(24), NOW).key).toBe('active')
  })

  it('describe_EndDateInThePast_IsExpiredWithZeroDaysLeft', () => {
    expect(describeSubscription(paid(40), NOW)).toMatchObject({ key: 'expired', label: 'Đã hết hạn', tone: 'danger', daysLeft: 0 })
  })

  it('describe_StatusExpiredEvenIfDateLooksFuture_IsExpired', () => {
    expect(describeSubscription(paid(10, 30, { status: 'Expired' }), NOW).key).toBe('expired')
  })

  it('describe_ScheduledPlan_IsWaitingToStart', () => {
    const scheduled = paid(-3, 30, { status: 'Scheduled' })
    expect(describeSubscription(scheduled, NOW)).toMatchObject({ key: 'scheduled', label: 'Chờ kích hoạt', tone: 'info' })
  })

  it('describe_FreePlan_IsFreeAndNeverExpiring', () => {
    const free = { status: 'Active', price: 0, startDate: new Date(NOW - 400 * DAY).toISOString(), endDate: new Date(NOW + 36000 * DAY).toISOString() }
    expect(describeSubscription(free, NOW)).toMatchObject({ key: 'free', label: 'Gói miễn phí', tone: 'muted', daysLeft: null })
  })

  it('describe_NoPriceInData_IsTreatedAsPaidSoDatesDecide', () => {
    const item = { status: 'Active', startDate: new Date(NOW - 10 * DAY).toISOString(), endDate: new Date(NOW + 3 * DAY).toISOString() }
    expect(describeSubscription(item, NOW)).toMatchObject({ key: 'expiring', daysLeft: 3 })
  })

  it('describe_InvalidDates_FallsBackToExpired', () => {
    expect(describeSubscription({ status: 'Active', price: 99000, startDate: 'x', endDate: 'y' }, NOW).key).toBe('expired')
  })
})

describe('subscriptionSpanDays', () => {
  it('span_PaidPlan_ReturnsDaysBetweenStartAndEnd', () => {
    expect(subscriptionSpanDays(paid(10, 30))).toBe(30)
    expect(subscriptionSpanDays(paid(0, 180))).toBe(180)
  })

  it('span_FreeOrInvalid_ReturnsNull', () => {
    expect(subscriptionSpanDays({ price: 0, startDate: '2026-01-01', endDate: '2126-01-01' })).toBeNull()
    expect(subscriptionSpanDays({ price: 1, startDate: 'x', endDate: 'y' })).toBeNull()
  })
})

describe('statusFilterParams', () => {
  it('filters_AllOptions_MapToBackendQueryParameters', () => {
    expect(STATUS_FILTERS.map((item) => item.value)).toEqual(['', 'active', 'expiring', 'scheduled', 'expired'])
    expect(statusFilterParams('')).toEqual({})
    expect(statusFilterParams('active')).toEqual({ status: 'Active' })
    expect(statusFilterParams('expiring')).toEqual({ status: 'Active', expiringInDays: 5 })
    expect(statusFilterParams('scheduled')).toEqual({ status: 'Scheduled' })
    expect(statusFilterParams('expired')).toEqual({ status: 'Expired' })
  })
})
