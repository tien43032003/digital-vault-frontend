import axiosClient from './axiosClient'

// API thanh toán gói dịch vụ qua VNPay của BE (PaymentController)

// Danh sách gói đang bán (công khai), giá thấp trước; chấp nhận cả mảng thuần và PageDto
export async function getPlans() {
  const { data } = await axiosClient.get('/payments/plans')
  return Array.isArray(data) ? data : (data?.items ?? [])
}

// Tạo giao dịch chờ thanh toán và nhận paymentUrl để chuyển trình duyệt sang VNPay (BE trả 503 khi chưa cấu hình VNPay)
export async function createVnpayCheckout(planId) {
  const { data } = await axiosClient.post('/payments/vnpay/checkout', { planId })
  return data
}

// Chuyển nguyên các tham số vnp_* VNPay gửi về cho BE kiểm tra chữ ký và số tiền; BE trả { transactionCode, status, amount }
export async function confirmVnpayReturn(params) {
  const { data } = await axiosClient.get('/payments/vnpay/return', { params })
  return data
}

// Gói đang dùng của chính người dùng: { hasActiveSubscription, subscription }; chưa mua gói nào thì hasActiveSubscription = false
export async function getCurrentSubscription() {
  const { data } = await axiosClient.get('/payments/me/subscription')
  return data
}
