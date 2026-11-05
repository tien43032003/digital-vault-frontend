import { http, HttpResponse } from 'msw'
import { getDb, saveDb } from './db'
import { hasUnknownFields, problem, route } from './helpers'
import { MOCK_VNPAY_SIGNATURE } from './vnpayMock'

// Mock thanh toán VNPay, bám PaymentController/VnPayService của BE
const PLANS = [
  { planId: 4, planName: 'Miễn phí', maxVaults: 1, maxStorageBytes: 536870912, price: 0, durationDays: 30 },
  { planId: 1, planName: 'Cơ bản', maxVaults: 1, maxStorageBytes: 1073741824, price: 99000, durationDays: 30 },
  { planId: 2, planName: 'Nâng cao', maxVaults: 5, maxStorageBytes: 10737418240, price: 499000, durationDays: 180 },
  { planId: 3, planName: 'Gia đình', maxVaults: 20, maxStorageBytes: 53687091200, price: 899000, durationDays: 365 },
]

const DAY_MS = 24 * 60 * 60 * 1000

const transactions = () => {
  const db = getDb()
  db.paymentTransactions ??= []
  return db.paymentTransactions
}

const subscriptions = () => {
  const db = getDb()
  db.userSubscriptions ??= []
  return db.userSubscriptions
}

const isLive = (item, userId, now) => item.userId === userId && item.status === 'Active' && new Date(item.endDate).getTime() > now

const currentPaidOf = (userId, now) =>
  subscriptions()
    .filter((item) => isLive(item, userId, now))
    .map((item) => ({ item, plan: PLANS.find((plan) => plan.planId === item.planId) }))
    .filter(({ plan }) => plan && plan.price > 0)
    .sort((a, b) => b.item.subscriptionId - a.item.subscriptionId)[0] ?? null

const scheduledOf = (userId) => subscriptions().filter((item) => item.userId === userId && item.status === 'Scheduled').sort((a, b) => b.subscriptionId - a.subscriptionId)[0] ?? null

const rejected = (reasonCode, reasonMessage) => ({ allowed: false, reasonCode, reasonMessage, changeType: null, amountDue: 0, startsAt: null, endsAt: null })

// Như BE (VnPayService.GetQuote): 3 ngày đầu chỉ nâng cấp trả phần chênh lệch; giữa kỳ khoá; 5 ngày cuối đăng ký kỳ sau; hết hạn hoặc chưa có gói trả phí thì mua mới
function computeQuote(userId, plan, now = Date.now()) {
  const current = currentPaidOf(userId, now)
  const scheduled = scheduledOf(userId)
  const duration = plan.durationDays > 0 ? plan.durationDays : 30
  if (current) {
    const start = new Date(current.item.startDate).getTime()
    const end = new Date(current.item.endDate).getTime()
    if (now <= start + 3 * DAY_MS) {
      if (plan.price > current.plan.price) {
        return { allowed: true, reasonCode: null, reasonMessage: null, changeType: 'Upgrade', amountDue: plan.price - current.plan.price, startsAt: new Date(now).toISOString(), endsAt: new Date(now + duration * DAY_MS).toISOString() }
      }
      return rejected('UPGRADE_PRICE_TOO_LOW', 'Trong 3 ngày đầu chỉ được nâng cấp lên gói có giá cao hơn gói hiện tại.')
    }
    if (now < end - 5 * DAY_MS) return rejected('PLAN_CHANGE_LOCKED', `Chỉ đổi gói được từ ${new Date(end - 5 * DAY_MS).toISOString()}.`)
    if (scheduled) return rejected('SCHEDULED_PLAN_EXISTS', 'Bạn đã có một gói đăng ký chờ kích hoạt. Chỉ cho phép tối đa một gói chờ.')
    return {
      allowed: true,
      reasonCode: null,
      reasonMessage: null,
      changeType: plan.planId === current.plan.planId ? 'Renew' : 'Scheduled',
      amountDue: plan.price,
      startsAt: current.item.endDate,
      endsAt: new Date(end + duration * DAY_MS).toISOString(),
    }
  }
  if (scheduled) return rejected('SCHEDULED_PLAN_EXISTS', 'Bạn đã có một gói đăng ký chờ kích hoạt. Chỉ cho phép tối đa một gói chờ.')
  return { allowed: true, reasonCode: null, reasonMessage: null, changeType: 'New', amountDue: plan.price, startsAt: new Date(now).toISOString(), endsAt: new Date(now + duration * DAY_MS).toISOString() }
}

const toSubscriptionDto = (item) => {
  if (!item) return null
  const { subscriptionId, status, startDate, endDate, planId } = item
  return { subscriptionId, status, startDate, endDate, plan: PLANS.find((plan) => plan.planId === planId) ?? null }
}

// Như BE: thanh toán thành công thì gói đang hiệu lực hết hạn và gói mới có hiệu lực từ bây giờ; riêng gia hạn/đăng ký kỳ sau thì xếp hàng chờ, bắt đầu khi gói hiện tại kết thúc
function activateSubscription(payment) {
  const plan = PLANS.find((item) => item.planId === payment.planId)
  if (!plan) return
  const now = Date.now()
  if ((payment.changeType === 'Renew' || payment.changeType === 'Scheduled') && payment.startsAt) {
    const queuedId = subscriptions().reduce((max, item) => Math.max(max, item.subscriptionId), 0) + 1
    const queued = { subscriptionId: queuedId, userId: payment.userId, planId: plan.planId, status: 'Scheduled', startDate: payment.startsAt, endDate: payment.endsAt }
    subscriptions().push(queued)
    payment.subscriptionId = queuedId
    return queued
  }
  subscriptions()
    .filter((item) => item.userId === payment.userId && item.status === 'Active')
    .forEach((item) => {
      item.status = 'Expired'
      item.endDate = new Date(now).toISOString()
    })
  const subscriptionId = subscriptions().reduce((max, item) => Math.max(max, item.subscriptionId), 0) + 1
  const created = {
    subscriptionId,
    userId: payment.userId,
    planId: plan.planId,
    status: 'Active',
    startDate: new Date(now).toISOString(),
    endDate: new Date(now + plan.durationDays * DAY_MS).toISOString(),
  }
  subscriptions().push(created)
  payment.subscriptionId = subscriptionId
  return created
}

// Lấy giao dịch Pending hiện có của người dùng để cập nhật trực tiếp tại chỗ (đảm bảo mỗi người dùng chỉ có tối đa 1 dòng Pending, không sinh thêm dòng thừa)
function takeExistingPending(userId) {
  const list = transactions()
  const existing = list.find((item) => item.userId === userId && item.status === 'Pending')
  if (!existing) return null
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (list[index].userId === userId && list[index].status === 'Pending' && list[index] !== existing) {
      list.splice(index, 1)
    }
  }
  return existing
}

// Mã giao dịch 32 ký tự thập lục phân như BE (yyMMddHHmmss + Guid cắt còn 32)
function newTransactionCode() {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(2, 14)
  const random = Array.from({ length: 20 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return `${stamp}${random}`
}

export const paymentHandlers = [
  http.get(
    '*/api/payments/plans',
    route(() => HttpResponse.json([...PLANS].sort((a, b) => a.price - b.price)), { auth: false }),
  ),

  // Gói đang hiệu lực của người dùng đang đăng nhập (CurrentSubscriptionDto)
  http.get(
    '*/api/payments/me/subscription',
    route(({ userId }) => {
      const now = Date.now()
      const active = subscriptions()
        .filter((item) => item.userId === userId && item.status === 'Active' && new Date(item.endDate).getTime() > now)
        .sort((a, b) => b.subscriptionId - a.subscriptionId)[0]
      const scheduledSubscription = toSubscriptionDto(scheduledOf(userId))
      if (!active) {
        // Chỉ xem khi từng có gói trả phí, nay đã hết hạn và chưa có gì thay thế
        const hadPaid = subscriptions().some((item) => item.userId === userId && (PLANS.find((plan) => plan.planId === item.planId)?.price ?? 0) > 0)
        return HttpResponse.json({ hasActiveSubscription: false, subscription: null, scheduledSubscription, upgradeWindowEndsAt: null, renewalWindowStartsAt: null, daysLeft: null, isReadOnly: hadPaid && !scheduledSubscription })
      }
      const subscription = toSubscriptionDto(active)
      const paid = (subscription.plan?.price ?? 0) > 0
      return HttpResponse.json({
        hasActiveSubscription: true,
        subscription,
        scheduledSubscription,
        upgradeWindowEndsAt: paid ? new Date(new Date(active.startDate).getTime() + 3 * DAY_MS).toISOString() : null,
        renewalWindowStartsAt: paid ? new Date(new Date(active.endDate).getTime() - 5 * DAY_MS).toISOString() : null,
        daysLeft: paid ? Math.max(0, Math.ceil((new Date(active.endDate).getTime() - now) / DAY_MS)) : null,
        isReadOnly: false,
      })
    }),
  ),

  // Báo giá khi đổi sang một gói (SubscriptionQuoteDto): được chọn hay không, số tiền phải trả và ngày hiệu lực
  http.get(
    '*/api/payments/quote',
    route(({ request, userId }) => {
      const planId = Number(new URL(request.url).searchParams.get('planId'))
      const plan = PLANS.find((item) => item.planId === planId)
      if (!plan) return problem(404, 'Subscription plan not found.')
      return HttpResponse.json(computeQuote(userId, plan))
    }),
  ),

  // Lịch sử giao dịch của người dùng, mới nhất trước (PaymentTransactionPageDto)
  http.get(
    '*/api/payments/me/transactions',
    route(({ request, userId }) => {
      const query = new URL(request.url).searchParams
      const page = Math.max(1, Number(query.get('page')) || 1)
      const pageSize = Math.min(100, Math.max(1, Number(query.get('pageSize')) || 20))
      const status = query.get('status')
      const mine = transactions()
        .filter((item) => item.userId === userId && (!status || item.status === status))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      const items = mine.slice((page - 1) * pageSize, page * pageSize).map((item) => ({
        transactionId: item.transactionId,
        transactionCode: item.transactionCode,
        amount: item.amount,
        paymentMethod: item.paymentMethod ?? 'VNPay',
        status: item.status,
        createdAt: item.createdAt,
        subscriptionId: item.subscriptionId ?? null,
        planName: item.planName ?? PLANS.find((plan) => plan.planId === item.planId)?.planName ?? null,
      }))
      return HttpResponse.json({ page, pageSize, total: mine.length, items })
    }),
  ),

  // Kích hoạt gói miễn phí 0đ (POST /api/payments/select-free): BE tạo UserSubscription (Active) và trả CurrentSubscriptionDto
  http.post(
    '*/api/payments/select-free',
    route(({ userId, body }) => {
      if (hasUnknownFields(body, ['planId']) || !Number.isInteger(body?.planId)) return problem(400, 'PlanId is required.')
      const plan = PLANS.find((item) => item.planId === body.planId)
      if (!plan) return problem(404, 'Subscription plan not found or inactive.')
      if (plan.price > 0) return problem(400, 'This endpoint is only for free plans.')
      const existing = takeExistingPending(userId)
      const transactionCode = newTransactionCode()
      const payment = existing
        ? Object.assign(existing, {
            transactionCode,
            planId: plan.planId,
            planName: plan.planName,
            amount: 0,
            paymentMethod: 'Free',
            status: 'Success',
            createdAt: new Date().toISOString(),
          })
        : {
            transactionId: transactions().length + 1,
            transactionCode,
            userId,
            planId: plan.planId,
            planName: plan.planName,
            amount: 0,
            paymentMethod: 'Free',
            status: 'Success',
            createdAt: new Date().toISOString(),
          }
      if (!existing) transactions().push(payment)
      const created = activateSubscription(payment)
      saveDb()
      return HttpResponse.json({
        hasActiveSubscription: true,
        subscription: {
          subscriptionId: created.subscriptionId,
          status: created.status,
          startDate: created.startDate,
          endDate: created.endDate,
          plan,
        },
      })
    }),
  ),

  http.post(
    '*/api/payments/vnpay/checkout',
    route(({ userId, body }) => {
      if (hasUnknownFields(body, ['planId']) || !Number.isInteger(body?.planId)) return problem(400, 'PlanId is required.')
      const plan = PLANS.find((item) => item.planId === body.planId)
      if (!plan) return problem(404, 'Subscription plan not found or inactive.')
      const quote = computeQuote(userId, plan)
      if (!quote.allowed) return problem(409, quote.reasonMessage, quote.reasonCode)
      const existing = takeExistingPending(userId)
      const free = !(quote.amountDue > 0)
      const transactionCode = existing && existing.planId === plan.planId && !free ? existing.transactionCode : newTransactionCode()
      const payment = existing
        ? Object.assign(existing, {
            transactionCode,
            planId: plan.planId,
            planName: plan.planName,
            amount: quote.amountDue,
            changeType: quote.changeType,
            startsAt: quote.startsAt,
            endsAt: quote.endsAt,
            paymentMethod: free ? 'Free' : 'VNPay',
            status: free ? 'Success' : 'Pending',
            createdAt: new Date().toISOString(),
          })
        : {
            transactionId: transactions().length + 1,
            transactionCode,
            userId,
            planId: plan.planId,
            planName: plan.planName,
            amount: quote.amountDue,
            changeType: quote.changeType,
            startsAt: quote.startsAt,
            endsAt: quote.endsAt,
            paymentMethod: free ? 'Free' : 'VNPay',
            status: free ? 'Success' : 'Pending',
            createdAt: new Date().toISOString(),
          }
      if (!existing) transactions().push(payment)
      // Như BE: gói 0đ được kích hoạt ngay trong DB và trả paymentUrl rỗng để FE không chuyển sang VNPay
      if (free) {
        activateSubscription(payment)
        saveDb()
        return HttpResponse.json({ transactionCode, amount: 0, paymentUrl: '' })
      }
      saveDb()
      const query = new URLSearchParams({ vnp_TxnRef: transactionCode, vnp_Amount: String(quote.amountDue * 100), vnp_OrderInfo: `Payment for ${plan.planName}` })
      return HttpResponse.json({ transactionCode, amount: quote.amountDue, paymentUrl: `/payment/mock-vnpay?${query}` })
    }),
  ),

  // Endpoint công khai: khách chưa đăng nhập vẫn xác thực được kết quả khi được VNPay đưa về
  http.get(
    '*/api/payments/vnpay/return',
    route(
      ({ request }) => {
        const query = new URL(request.url).searchParams
        if (query.get('vnp_SecureHash') !== MOCK_VNPAY_SIGNATURE) return problem(400, 'Invalid VNPay signature.')
        const reference = query.get('vnp_TxnRef')
        const amountText = query.get('vnp_Amount')
        const responseCode = query.get('vnp_ResponseCode')
        const transactionStatus = query.get('vnp_TransactionStatus')
        if (!reference || !/^\d+$/.test(amountText ?? '') || !responseCode || !transactionStatus) return problem(400, 'Incomplete VNPay callback.')

        const payment = transactions().find((item) => item.transactionCode === reference)
        if (!payment) return problem(404, 'Payment transaction not found.')
        if (Number(amountText) !== payment.amount * 100) return problem(400, 'VNPay callback does not match the payment order.')

        const success = responseCode === '00' && transactionStatus === '00'
        if (payment.status === 'Pending') {
          payment.status = success ? 'Success' : 'Failed'
          if (success) activateSubscription(payment)
          saveDb()
        } else if (success && payment.status !== 'Success') {
          return problem(409, 'Payment already has a different final status.')
        }
        return HttpResponse.json({ transactionCode: reference, status: payment.status, amount: payment.amount })
      },
      { auth: false },
    ),
  ),
]
