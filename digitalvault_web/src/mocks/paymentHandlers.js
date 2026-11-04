import { http, HttpResponse } from 'msw'
import { getDb, saveDb } from './db'
import { hasUnknownFields, problem, route } from './helpers'
import { MOCK_VNPAY_SIGNATURE } from './vnpayMock'

// Mock thanh toán VNPay, bám PaymentController/VnPayService của BE
const PLANS = [
  { planId: 1, planName: 'Cơ bản', maxVaults: 1, maxStorageBytes: 1073741824, price: 99000, durationDays: 30 },
  { planId: 2, planName: 'Nâng cao', maxVaults: 5, maxStorageBytes: 10737418240, price: 499000, durationDays: 180 },
  { planId: 3, planName: 'Gia đình', maxVaults: 20, maxStorageBytes: 53687091200, price: 899000, durationDays: 365 },
]


const transactions = () => {
  const db = getDb()
  db.paymentTransactions ??= []
  return db.paymentTransactions
}

// Mã giao dịch 32 ký tự thập lục phân như BE (yyMMddHHmmss + Guid cắt còn 32)
function newTransactionCode() {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(2, 14)
  const random = Array.from({ length: 20 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return `${stamp}${random}`
}

export const paymentHandlers = [
  http.get(
    '*/api/payments/me/subscription',
    route(({ userId }) => {
      const db = getDb()
      const subscribed = !db.requireSubscription || (db.subscribedUserIds ?? []).includes(userId)
      return HttpResponse.json(
        subscribed
          ? { hasActiveSubscription: true, subscription: { subscriptionId: 1, status: 'Active', startDate: new Date().toISOString(), endDate: new Date(Date.now() + 30 * 86400000).toISOString(), plan: PLANS[0] } }
          : { hasActiveSubscription: false, subscription: null },
      )
    }),
  ),

  http.get(
    '*/api/payments/plans',
    route(() => HttpResponse.json([...PLANS].sort((a, b) => a.price - b.price)), { auth: false }),
  ),

  http.post(
    '*/api/payments/vnpay/checkout',
    route(({ userId, body }) => {
      if (hasUnknownFields(body, ['planId']) || !Number.isInteger(body?.planId)) return problem(400, 'PlanId is required.')
      const plan = PLANS.find((item) => item.planId === body.planId)
      if (!plan) return problem(404, 'Subscription plan not found or inactive.')
      const transactionCode = newTransactionCode()
      transactions().push({ transactionCode, userId, planId: plan.planId, amount: plan.price, status: 'Pending', createdAt: new Date().toISOString() })
      saveDb()
      const query = new URLSearchParams({ vnp_TxnRef: transactionCode, vnp_Amount: String(plan.price * 100), vnp_OrderInfo: `Payment for ${plan.planName}` })
      return HttpResponse.json({ transactionCode, amount: plan.price, paymentUrl: `/payment/mock-vnpay?${query}` })
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
