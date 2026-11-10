import axiosClient from './axiosClient'

// API cổng System Admin của BE (role Admin): người dùng và nhật ký kiểm toán. Danh sách trả PageDto { page, pageSize, items }.

// role/status/userId rỗng thì không gửi lên BE (BE bỏ qua bộ lọc khi chuỗi rỗng); userId chấp nhận cả dạng "#15"
export async function getAdminUsers({ page = 1, pageSize = 20, role = '', status = '', userId = '' } = {}) {
  const params = { page, pageSize }
  if (role) params.role = role
  if (status) params.status = status
  const trimmedId = String(userId ?? '').trim().replace(/^#/, '')
  if (trimmedId) params.userId = trimmedId
  const { data } = await axiosClient.get('/admin/users', { params })
  return data
}

export async function createAdminUser(input) {
  const { data } = await axiosClient.post('/admin/users', input)
  return data
}

// BE thay toàn bộ danh sách vai trò của người dùng bằng danh sách gửi lên (204)
export async function updateUserRoles(userId, roles) {
  await axiosClient.put(`/admin/users/${userId}/roles`, { roles })
}

// status: Active | Disabled | Locked (204)
export async function updateUserStatus(userId, status) {
  await axiosClient.put(`/admin/users/${userId}/status`, { status })
}

export async function getAuditLogs({ page = 1, pageSize = 20, action = '' } = {}) {
  const params = { page, pageSize }
  if (action) params.action = action
  const { data } = await axiosClient.get('/admin/audit-logs', { params })
  return data
}

// Sửa họ tên, điện thoại, CCCD của người dùng (BE bỏ qua họ tên rỗng, ô điện thoại hoặc CCCD rỗng nghĩa là xóa); trả người dùng sau khi sửa
export async function updateAdminUser(userId, { fullName, phone, identityNumber }) {
  const { data } = await axiosClient.put(`/admin/users/${userId}`, {
    fullName: fullName.trim(),
    phone: phone.trim(),
    identityNumber: identityNumber.trim(),
  })
  return data
}

// Hồ sơ bàn giao toàn hệ thống (GET /admin/handovers, PageDto { page, pageSize, items } gồm HandoverOverviewDto); status/ownerId rỗng thì không lọc.
// BE chưa có endpoint này (swagger hiện chưa liệt kê); trang Admin sẽ báo rõ cho tới khi BE bổ sung, rồi tự hiển thị.
export async function getHandoverOverview({ page = 1, pageSize = 20, status = '', ownerId = '' } = {}) {
  const params = { page, pageSize }
  if (status) params.status = status
  if (ownerId) params.ownerId = ownerId
  const { data } = await axiosClient.get('/admin/handovers', { params })
  return data
}

// Admin đặt lại mật khẩu cho người dùng (BE mở khóa đăng nhập sai và trả { message })
export async function resetUserPassword(userId, newPassword) {
  const { data } = await axiosClient.post(`/admin/users/${userId}/reset-password`, { newPassword })
  return data
}

// Ma trận phân quyền: 5 vai trò, danh mục quyền và số người dùng đang hoạt động của từng vai trò
export async function getAdminRoles() {
  const { data } = await axiosClient.get('/admin/roles')
  return data
}

// Bảng điều khiển cảnh báo an ninh trong 24 giờ qua
export async function getSecurityAlerts() {
  const { data } = await axiosClient.get('/admin/security/alerts')
  return data
}

export async function getSystemConfig() {
  const { data } = await axiosClient.get('/admin/system/config')
  return data
}

// BE thay nguyên cả nhóm tham số được gửi lên (không gộp từng trường) và bỏ qua nhóm bị bỏ trống
export async function updateSystemConfig(input) {
  const { data } = await axiosClient.put('/admin/system/config', input)
  return data
}

export async function getKeyRotation() {
  const { data } = await axiosClient.get('/admin/system/key-rotation')
  return data
}

// Tăng phiên bản (+1) của mọi khóa mã hóa đang hoạt động; trả thống kê sau khi xoay
export async function rotateEncryptionKeys() {
  const { data } = await axiosClient.post('/admin/system/key-rotation/rotate', {})
  return data
}

export async function getIntegrations() {
  const { data } = await axiosClient.get('/admin/integrations')
  return data
}

// Kiểm tra kết nối thời gian thực tới một dịch vụ tích hợp (404 nếu mã dịch vụ không tồn tại)
export async function pingIntegration(serviceId) {
  const { data } = await axiosClient.post(`/admin/integrations/${serviceId}/ping`)
  return data
}

// ----- Gói dịch vụ & thanh toán (AdminPayments) -----

// Toàn bộ gói, kể cả gói ngừng bán (mảng thuần)
export async function getAdminPlans() {
  const { data } = await axiosClient.get('/admin/subscription-plans')
  return Array.isArray(data) ? data : (data?.items ?? [])
}

// input: { planName, maxVaults, maxStorageBytes, price, durationDays, isActive }; trả gói sau khi lưu
export async function createAdminPlan(input) {
  const { data } = await axiosClient.post('/admin/subscription-plans', input)
  return data
}

export async function updateAdminPlan(planId, input) {
  const { data } = await axiosClient.put(`/admin/subscription-plans/${planId}`, input)
  return data
}

// Mặc định ngừng bán gói đang bán (xóa mềm); permanent: true xóa hẳn gói đã ngừng bán (DELETE /{id}/permanent)
export async function deleteAdminPlan(planId, { permanent = false } = {}) {
  await axiosClient.delete(permanent ? `/admin/subscription-plans/${planId}/permanent` : `/admin/subscription-plans/${planId}`)
}

// Xóa hàng loạt mọi gói đã ngừng bán; trả { deletedCount, deletedPlanIds, skippedPlanIds, message } (gói đã có giao dịch hoặc người đăng ký bị bỏ qua)
export async function deleteInactivePlans() {
  const { data } = await axiosClient.delete('/admin/subscription-plans/inactive')
  return data
}

// Thống kê bán gói trong một tháng (month dạng "yyyy-MM"): { month, totalSold, totalRevenue, items: [{ planId, planName, soldCount, revenue, activeUsers }] }
export async function getPlanMonthlyStats(month = '') {
  const params = month ? { month } : undefined
  const { data } = await axiosClient.get('/admin/subscription-plans/stats', { params })
  return data
}

// Thống kê toàn thời gian của từng gói (mảng): người đang dùng, đã đặt trước, đã hết hạn, tổng người đăng ký, tổng doanh thu
export async function getPlanStatistics() {
  const { data } = await axiosClient.get('/admin/subscription-plans/statistics')
  return Array.isArray(data) ? data : (data?.items ?? [])
}

// Người dùng của một gói kèm ngày bắt đầu và hết hạn (PageDto { page, pageSize, total, items }); status rỗng thì không lọc
export async function getPlanSubscribers(planId, { page = 1, pageSize = 20, status = '' } = {}) {
  const params = { page, pageSize }
  if (status) params.status = status
  const { data } = await axiosClient.get(`/admin/subscription-plans/${planId}/subscribers`, { params })
  return data
}

// Giao dịch thanh toán của mọi người dùng (PageDto { page, pageSize, total, items }); status/userId rỗng thì không lọc
export async function getPaymentTransactions({ page = 1, pageSize = 20, status = '', userId = '' } = {}) {
  const params = { page, pageSize }
  if (status) params.status = status
  if (userId) params.userId = userId
  const { data } = await axiosClient.get('/admin/payment-transactions', { params })
  return data
}

export async function getPaymentTransaction(transactionId) {
  const { data } = await axiosClient.get(`/admin/payment-transactions/${transactionId}`)
  return data
}
