import { getPlanChange, renewalReminder } from './planChange'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-11-04T10:00:00Z')

const FREE = { planId: 4, planName: 'Miễn phí', price: 0, durationDays: 30, maxVaults: 1, maxStorageBytes: 1 }
const STANDARD = { planId: 1, planName: 'Tiêu Chuẩn', price: 99000, durationDays: 30, maxVaults: 5, maxStorageBytes: 1 }
const PREMIUM = { planId: 2, planName: 'Cao Cấp', price: 299000, durationDays: 30, maxVaults: 20, maxStorageBytes: 1 }
const VIP = { planId: 3, planName: 'Vip', price: 1000000000, durationDays: 30, maxVaults: 100, maxStorageBytes: 1 }

// Gói Cao Cấp đang dùng, bắt đầu cách đây `daysAgo` ngày và dài 30 ngày
const premiumStartedDaysAgo = (daysAgo) => ({
  subscriptionId: 1,
  status: 'Active',
  plan: PREMIUM,
  startDate: new Date(NOW - daysAgo * DAY).toISOString(),
  endDate: new Date(NOW - daysAgo * DAY + 30 * DAY).toISOString(),
})

const change = (plan, subscription, extra = {}) => getPlanChange({ plan, subscription, now: NOW, ...extra })

describe('getPlanChange without a paid plan', () => {
  it('noSubscription_PaidPlan_OffersBuy', () => {
    expect(change(PREMIUM, null)).toMatchObject({ type: 'buy', allowed: true, label: 'Mua gói', primary: true, reason: null })
  })

  it('noSubscription_FreePlan_OffersFreeSignUp', () => {
    expect(change(FREE, null)).toMatchObject({ type: 'buy', allowed: true, label: 'Dùng miễn phí' })
  })

  it('freeSubscription_PaidPlan_OffersBuy', () => {
    expect(change(STANDARD, { status: 'Active', plan: FREE, startDate: new Date(NOW - 40 * DAY).toISOString(), endDate: new Date(NOW + 9999 * DAY).toISOString() })).toMatchObject({ allowed: true, label: 'Mua gói' })
  })

  it('freeSubscription_SameFreePlan_IsInUseAndNotActionable', () => {
    expect(change(FREE, { status: 'Active', plan: FREE, startDate: new Date(NOW).toISOString(), endDate: new Date(NOW + DAY).toISOString() })).toMatchObject({ type: 'in-use', allowed: false, label: 'Đang sử dụng' })
  })

  it('expiredSubscription_AnyPlan_CanBeBoughtAgain', () => {
    const expired = { ...premiumStartedDaysAgo(40), endDate: new Date(NOW - 10 * DAY).toISOString() }
    expect(change(STANDARD, expired)).toMatchObject({ allowed: true, label: 'Mua gói' })
  })
})

describe('getPlanChange during the first 3 days of a paid plan', () => {
  const sub = premiumStartedDaysAgo(1)

  it('lowerPricePlan_IsLockedUntilRenewalWindowWithDate', () => {
    const result = change(STANDARD, sub)
    expect(result).toMatchObject({ type: 'locked-lower', allowed: false, label: 'Chuyển gói', primary: false })
    // Gói bắt đầu 03/11 và hết hạn 03/12, mở đăng ký kỳ sau từ 28/11
    expect(result.reason).toContain('chỉ chọn được khi gói hiện tại sắp hết hạn')
    expect(result.reason).toContain('28/11/2026')
  })

  it('freePlan_IsLockedBecauseItIsOnlyForAccountsWithoutPaidPlan', () => {
    expect(change(FREE, sub)).toMatchObject({ type: 'locked-free', allowed: false })
  })

  it('higherPricePlan_WhenBackendHasNoDifferencePricingYet_IsShownAsComingSoon', () => {
    const result = change(VIP, sub)
    expect(result).toMatchObject({ type: 'upgrade-pending', allowed: false, label: 'Nâng cấp (sắp có)' })
    expect(result.reason).toContain('phần chênh lệch')
  })

  it('higherPricePlan_WhenBackendSupportsDifferencePricing_IsAllowedAsUpgrade', () => {
    expect(change(VIP, sub, { support: { upgradeDifference: true, scheduledNextPeriod: false } })).toMatchObject({ type: 'upgrade', allowed: true, label: 'Nâng cấp', primary: true })
  })

  it('samePlan_RenewIsLockedWithOpeningDate', () => {
    const result = change(PREMIUM, sub)
    expect(result).toMatchObject({ type: 'locked-renew', allowed: false, label: 'Gia hạn gói' })
    expect(result.reason).toContain('28/11/2026')
  })

  it('equalPriceDifferentPlan_IsTreatedAsNotHigher', () => {
    expect(change({ ...STANDARD, planId: 9, price: 299000 }, sub)).toMatchObject({ type: 'locked-lower', allowed: false })
  })

  it('upgradeWindowEdge_ExactlyThreeDaysIsStillInsideButJustAfterIsNot', () => {
    const exact = { ...premiumStartedDaysAgo(3) }
    expect(change(VIP, exact).type).toBe('upgrade-pending')
    const after = { ...premiumStartedDaysAgo(3), startDate: new Date(NOW - 3 * DAY - 1000).toISOString() }
    expect(change(VIP, after).type).toBe('locked-mid')
  })
})

describe('getPlanChange in the middle of the period (after 3 days, before the last 5 days)', () => {
  const sub = premiumStartedDaysAgo(10)

  it('higherPricePlan_IsLockedWithRenewalDate', () => {
    const result = change(VIP, sub)
    expect(result).toMatchObject({ type: 'locked-mid', allowed: false, label: 'Nâng cấp' })
    expect(result.reason).toContain('Quá 3 ngày đầu')
    // Hết hạn 24/11, mở đăng ký kỳ sau từ 19/11
    expect(result.reason).toContain('19/11/2026')
  })

  it('lowerPricePlan_IsLocked', () => {
    expect(change(STANDARD, sub)).toMatchObject({ type: 'locked-mid', allowed: false, label: 'Chuyển gói' })
  })

  it('samePlan_RenewIsLocked', () => {
    expect(change(PREMIUM, sub)).toMatchObject({ type: 'locked-renew', allowed: false, label: 'Gia hạn gói' })
  })
})

describe('getPlanChange in the last 5 days (renewal window)', () => {
  // Còn 4 ngày
  const sub = premiumStartedDaysAgo(26)

  it('samePlan_IsRenewAndPrimary', () => {
    expect(change(PREMIUM, sub)).toMatchObject({ type: 'renew', allowed: true, label: 'Gia hạn gói', primary: true })
  })

  it('anyOtherPaidPlanIncludingLowerOnes_WhenBackendCannotQueueYet_IsShownAsComingSoon', () => {
    for (const plan of [STANDARD, VIP]) {
      const result = change(plan, sub)
      expect(result).toMatchObject({ type: 'next-period-pending', allowed: false, label: 'Đăng ký kỳ sau (sắp có)', primary: false })
      expect(result.reason).toContain('sau khi gói hiện tại kết thúc')
    }
  })

  it('anyOtherPaidPlanIncludingLowerOnes_WhenBackendCanQueue_IsAllowedForNextPeriod', () => {
    const support = { upgradeDifference: false, scheduledNextPeriod: true }
    for (const plan of [STANDARD, VIP]) {
      expect(change(plan, sub, { support })).toMatchObject({ type: 'next-period', allowed: true, label: 'Đăng ký kỳ sau', primary: false })
    }
  })

  it('freePlan_StaysLocked', () => {
    expect(change(FREE, sub)).toMatchObject({ type: 'locked-free', allowed: false })
  })

  it('exactlyFiveDaysLeft_OpensWindow_SixDaysLeftDoesNot', () => {
    expect(change(PREMIUM, premiumStartedDaysAgo(25)).type).toBe('renew')
    expect(change(PREMIUM, premiumStartedDaysAgo(24)).type).toBe('locked-renew')
  })

  it('alreadyScheduledNextPlan_LocksEverythingAndNamesIt', () => {
    const scheduled = { status: 'Scheduled', plan: STANDARD, startDate: new Date(NOW + 4 * DAY).toISOString() }
    const result = change(VIP, sub, { scheduled })
    expect(result).toMatchObject({ type: 'scheduled', allowed: false })
    expect(result.reason).toContain('Tiêu Chuẩn')
    expect(result.reason).toContain('08/11/2026')
  })
})

describe('renewalReminder', () => {
  it('paidPlanWithFiveOrFewerDaysLeft_ShowsReminderWithDaysLeft', () => {
    expect(renewalReminder(premiumStartedDaysAgo(26), NOW)).toEqual({ show: true, daysLeft: 4 })
    expect(renewalReminder(premiumStartedDaysAgo(25), NOW)).toEqual({ show: true, daysLeft: 5 })
  })

  it('moreThanFiveDaysLeft_NoReminder', () => {
    expect(renewalReminder(premiumStartedDaysAgo(10), NOW)).toEqual({ show: false, daysLeft: 20 })
  })

  it('noSubscriptionFreePlanOrExpired_NoReminder', () => {
    expect(renewalReminder(null, NOW).show).toBe(false)
    expect(renewalReminder({ plan: FREE, startDate: new Date(NOW).toISOString(), endDate: new Date(NOW + 2 * DAY).toISOString() }, NOW).show).toBe(false)
    expect(renewalReminder({ ...premiumStartedDaysAgo(40), endDate: new Date(NOW - DAY).toISOString() }, NOW).show).toBe(false)
  })
})
