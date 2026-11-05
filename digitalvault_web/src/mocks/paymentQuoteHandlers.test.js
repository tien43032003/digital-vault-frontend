import { setupServer } from 'msw/node'
import axiosClient from '../callapi/axiosClient'
import { DEMO_ACCOUNT, getDb, resetMockDb } from './db'
import { handlers } from './handlers'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(async () => {
  resetMockDb()
  await axiosClient.post('/auth/login', { email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password })
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const DAY = 24 * 60 * 60 * 1000
const demoUserId = () => getDb().users.find((user) => user.email === DEMO_ACCOUNT.email).userId

const call = async (promise) => {
  try {
    const response = await promise
    return { status: response.status, data: response.data }
  } catch (error) {
    return { status: error.status, message: error.message, code: error.code }
  }
}

// Gói trả phí đã chạy `elapsedDays` ngày trong tổng 30 ngày; planId 2 = Nâng cao 499.000đ
const seed = (planId, elapsedDays, extra = []) => {
  getDb().userSubscriptions = [
    { subscriptionId: 1, userId: demoUserId(), planId, status: 'Active', startDate: new Date(Date.now() - elapsedDays * DAY).toISOString(), endDate: new Date(Date.now() + (30 - elapsedDays) * DAY).toISOString() },
    ...extra,
  ]
}
const quote = (planId) => call(axiosClient.get('/payments/quote', { params: { planId } }))

describe('mock GET /payments/quote', () => {
  it('quote_NoPaidPlan_ReturnsNewWithFullPrice', async () => {
    const { status, data } = await quote(1)
    expect(status).toBe(200)
    expect(data).toMatchObject({ allowed: true, changeType: 'New', amountDue: 99000, reasonCode: null })
  })

  it('quote_UnknownPlan_Returns404', async () => {
    expect((await quote(999)).status).toBe(404)
  })

  it('quote_NotLoggedIn_Returns401', async () => {
    sessionStorage.clear()
    localStorage.clear()
    expect((await quote(1)).status).toBe(401)
  })

  it('quote_UpgradeInFirstThreeDays_ChargesOnlyTheDifference', async () => {
    seed(1, 1)
    const { data } = await quote(2)
    expect(data).toMatchObject({ allowed: true, changeType: 'Upgrade', amountDue: 499000 - 99000 })
    expect(new Date(data.endsAt).getTime() - new Date(data.startsAt).getTime()).toBe(180 * DAY)
  })

  it('quote_LowerOrSamePlanInFirstThreeDays_IsRejectedWithPriceTooLow', async () => {
    seed(2, 1)
    for (const planId of [1, 2]) {
      expect((await quote(planId)).data).toMatchObject({ allowed: false, reasonCode: 'UPGRADE_PRICE_TOO_LOW', amountDue: 0 })
    }
  })

  it('quote_MiddleOfPeriod_IsLocked', async () => {
    seed(1, 10)
    expect((await quote(3)).data).toMatchObject({ allowed: false, reasonCode: 'PLAN_CHANGE_LOCKED' })
  })

  it('quote_LastFiveDays_RenewStartsWhenCurrentPlanEnds', async () => {
    seed(2, 27)
    const { data } = await quote(2)
    expect(data).toMatchObject({ allowed: true, changeType: 'Renew', amountDue: 499000 })
    expect(data.startsAt).toBe(getDb().userSubscriptions[0].endDate)
  })

  it('quote_LastFiveDays_OtherPlanIsScheduledForNextPeriod', async () => {
    seed(2, 27)
    expect((await quote(1)).data).toMatchObject({ allowed: true, changeType: 'Scheduled', amountDue: 99000 })
  })

  it('quote_LastFiveDaysWithPlanAlreadyQueued_IsRejected', async () => {
    seed(2, 27, [{ subscriptionId: 2, userId: demoUserId(), planId: 1, status: 'Scheduled', startDate: new Date(Date.now() + 3 * DAY).toISOString(), endDate: new Date(Date.now() + 33 * DAY).toISOString() }])
    expect((await quote(3)).data).toMatchObject({ allowed: false, reasonCode: 'SCHEDULED_PLAN_EXISTS' })
  })
})

describe('mock /payments/me/subscription lifecycle fields', () => {
  it('currentSubscription_PaidPlan_ReturnsWindowsAndDaysLeft', async () => {
    seed(2, 27)
    const { data } = await call(axiosClient.get('/payments/me/subscription'))
    const sub = data.subscription
    expect(new Date(data.upgradeWindowEndsAt).getTime()).toBe(new Date(sub.startDate).getTime() + 3 * DAY)
    expect(new Date(data.renewalWindowStartsAt).getTime()).toBe(new Date(sub.endDate).getTime() - 5 * DAY)
    expect(data.daysLeft).toBe(3)
    expect(data.scheduledSubscription).toBeNull()
    expect(data.isReadOnly).toBe(false)
  })

  it('currentSubscription_WithQueuedPlan_ReturnsScheduledSubscription', async () => {
    seed(2, 27, [{ subscriptionId: 2, userId: demoUserId(), planId: 1, status: 'Scheduled', startDate: new Date(Date.now() + 3 * DAY).toISOString(), endDate: new Date(Date.now() + 33 * DAY).toISOString() }])
    const { data } = await call(axiosClient.get('/payments/me/subscription'))
    expect(data.scheduledSubscription).toMatchObject({ status: 'Scheduled', plan: { planId: 1 } })
  })

  it('currentSubscription_PaidPlanExpiredAndNothingElse_IsReadOnly', async () => {
    getDb().userSubscriptions = [
      { subscriptionId: 1, userId: demoUserId(), planId: 2, status: 'Active', startDate: new Date(Date.now() - 40 * DAY).toISOString(), endDate: new Date(Date.now() - 10 * DAY).toISOString() },
    ]
    const { data } = await call(axiosClient.get('/payments/me/subscription'))
    expect(data).toMatchObject({ hasActiveSubscription: false, isReadOnly: true })
  })
})

describe('mock checkout follows the quote', () => {
  it('checkout_MiddleOfPeriod_Returns409WithReasonCode', async () => {
    seed(1, 10)
    const result = await call(axiosClient.post('/payments/vnpay/checkout', { planId: 3 }))
    expect(result.status).toBe(409)
    expect(result.code).toBe('PLAN_CHANGE_LOCKED')
  })

  it('checkout_Upgrade_CreatesTransactionForTheDifferenceOnly', async () => {
    seed(1, 1)
    const { data } = await call(axiosClient.post('/payments/vnpay/checkout', { planId: 2 }))
    expect(data.amount).toBe(400000)
  })
})
