import axiosClient from './axiosClient'

// API thanh toán gói dịch vụ của BE (PaymentController)

// Danh sách gói đang bán (công khai), giá thấp trước; chấp nhận cả mảng thuần và PageDto
export async function getPlans() {
  const { data } = await axiosClient.get('/payments/plans')
  return Array.isArray(data) ? data : (data?.items ?? [])
}

// Gói đang hiệu lực của người dùng đang đăng nhập: CurrentSubscriptionDto { hasActiveSubscription, subscription }
// subscription = UserSubscriptionDto { subscriptionId, status, startDate, endDate, plan: SubscriptionPlanDto }
export async function getMySubscription() {
  const { data } = await axiosClient.get('/payments/me/subscription')
  return data
}

// Lịch sử giao dịch của người dùng đang đăng nhập (PaymentTransactionPageDto { page, pageSize, total, items })
// status tuỳ chọn: Success | Pending | Failed; bỏ trống để lấy tất cả
export async function getMyTransactions({ page = 1, pageSize = 10, status } = {}) {
  const params = { page, pageSize }
  if (status) params.status = status
  const { data } = await axiosClient.get('/payments/me/transactions', { params })
  return { page: data?.page ?? page, pageSize: data?.pageSize ?? pageSize, total: data?.total ?? 0, items: data?.items ?? [] }
}

// Kích hoạt gói miễn phí (0đ): BE tạo UserSubscription (Active) ngay và trả CurrentSubscriptionDto
export async function selectFreePlan(planId) {
  const { data } = await axiosClient.post('/payments/select-free', { planId })
  return data
}

// Tạo giao dịch chờ thanh toán và nhận paymentUrl để chuyển trình duyệt sang VNPay (BE trả 503 khi chưa cấu hình VNPay)
export async function createVnpayCheckout(planId) {
  const { data: raw } = await axiosClient.post('/payments/vnpay/checkout', { planId })
  // Swagger ghi mã giao dịch là transactionCode, tài liệu gói 0đ của BE lại ghi reference: nhận cả hai.
  // Gói 0đ: BE kích hoạt ngay, trả 200 với paymentUrl "" hoặc null.
  const data = { ...raw, transactionCode: raw?.transactionCode ?? raw?.reference ?? null, paymentUrl: raw?.paymentUrl ?? '' }
  return data
}

// Chuyển nguyên các tham số vnp_* VNPay gửi về cho BE kiểm tra chữ ký và số tiền; BE trả { transactionCode, status, amount }
export async function confirmVnpayReturn(params) {
  const { data } = await axiosClient.get('/payments/vnpay/return', { params })
  return data
}

// Báo giá khi đổi sang gói planId: SubscriptionQuoteDto { allowed, reasonCode, reasonMessage, changeType, amountDue, startsAt, endsAt }
// changeType: New | Renew | Upgrade | Scheduled; reasonCode: UPGRADE_PRICE_TOO_LOW | PLAN_CHANGE_LOCKED | SCHEDULED_PLAN_EXISTS
export async function getQuote(planId) {
  const { data } = await axiosClient.get('/payments/quote', { params: { planId } })
  return data
}
