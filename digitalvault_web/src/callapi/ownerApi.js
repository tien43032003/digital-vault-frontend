import axiosClient from './axiosClient'
import { getAllPages } from './pagedList'

// Mô tả để trống thì gửi null, vì BE coi description là tuỳ chọn
const optionalText = (value) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export async function getVaults() {
  return getAllPages('/owner/vaults')
}

export async function getVault(vaultId) {
  const { data } = await axiosClient.get(`/owner/vaults/${vaultId}`)
  return data
}

// Chỉ gửi đúng các trường BE nhận (BE từ chối trường thừa)
export async function createVault({ name, description }) {
  const { data } = await axiosClient.post('/owner/vaults', {
    name: name.trim(),
    description: optionalText(description),
  })
  return data
}

// BE không xoá tài sản mà chỉ đánh dấu Revoked và vẫn trả trong danh sách, nên ẩn các tài sản đã thu hồi
// Truyền vaultId để chỉ lấy tài sản của một kho (BE lọc theo ?vaultId=); bỏ trống thì lấy tài sản của mọi kho
export async function getAssets(vaultId) {
  const data = await getAllPages('/owner/assets', vaultId === undefined ? {} : { vaultId })
  return data.filter((asset) => asset.status !== 'Revoked')
}

export async function getAsset(assetId) {
  const { data } = await axiosClient.get(`/owner/assets/${assetId}`)
  return data
}

export async function createAsset({ vaultId, name, type, description }) {
  const { data } = await axiosClient.post('/owner/assets', {
    vaultId,
    name: name.trim(),
    type,
    description: optionalText(description),
  })
  return data
}

// Upload giấy tờ của Owner (multipart): File và Signature (chữ ký rời) bắt buộc, BeneficiaryId tuỳ chọn.
// BE từ chối mọi trường khác; giấy chứng tử do Người thi hành nộp ở hồ sơ bàn giao.
export async function uploadDocument(assetId, { file, signature, beneficiaryId }) {
  const form = new FormData()
  form.append('File', file)
  form.append('Signature', signature)
  if (beneficiaryId) form.append('BeneficiaryId', String(beneficiaryId))
  const { data } = await axiosClient.post(`/owner/assets/${assetId}/documents`, form)
  return data
}

// Nhật ký hoạt động (BE đã ghi AuditLog nhưng chưa có API đọc, đang dùng mock)
export async function getActivityLogs() {
  const { data } = await axiosClient.get('/owner/activity-logs')
  return data
}

// Lần Owner xác nhận còn sống gần nhất (BE: GET /owner/life-confirmation); lastConfirmedAliveAt là null khi chưa xác nhận lần nào
export async function getLifeConfirmation() {
  const { data } = await axiosClient.get('/owner/life-confirmation')
  return data
}

// Bấm "Tôi vẫn còn sống": không có body, thời gian do máy chủ đặt; BE trả 409 khi hồ sơ bàn giao đã có giấy chứng tử đang xử lý hoặc đã duyệt pháp lý
export async function confirmAlive() {
  const { data } = await axiosClient.post('/owner/life-confirmation')
  return data
}

// Bỏ assetId để lấy người thụ hưởng trên mọi tài sản của user
export async function getBeneficiaries(assetId) {
  const data = await getAllPages('/owner/beneficiaries', assetId === undefined ? {} : { assetId })
  // BE giữ cả phân bổ đã thu hồi/từ chối để lưu lịch sử; giao diện chỉ hiển thị phân bổ hiệu lực (Active) và đang chờ người thụ hưởng xác nhận (Pending)
  return data.filter((row) => row.status === 'Active' || row.status === 'Pending')
}

export async function assignBeneficiary(assetId, { email, allocation }) {
  const { data } = await axiosClient.post(`/owner/assets/${assetId}/beneficiaries`, {
    email: email.trim(),
    allocation,
  })
  return data
}

// Danh sách Executor để Owner chọn. BE trả PageDto { userId, fullName } và hỗ trợ tìm theo tên (search) và loại người xung đột
// với một kho (vaultId); mock trả hồ sơ có executorId. Chuẩn hóa để luôn có executorId.
export async function getExecutors({ search, vaultId } = {}) {
  const params = {}
  if (search?.trim()) params.search = search.trim()
  if (vaultId) params.vaultId = vaultId
  const items = await getAllPages('/owner/executors', params)
  return items.map((item) => ({ ...item, executorId: item.executorId ?? item.userId }))
}

// Chi tiết một Executor đủ điều kiện (BE trả { userId, fullName, role, status, joinedAt }); 404 nếu không đủ điều kiện
export async function getExecutorDetail(executorId, vaultId) {
  const { data } = await axiosClient.get(`/owner/executors/${executorId}`, { params: vaultId ? { vaultId } : undefined })
  return data
}

export async function getVaultExecutor(vaultId) {
  const { data } = await axiosClient.get(`/owner/vaults/${vaultId}/executor`)
  return data
}

// Gán hoặc đổi Executor: PUT thật lên BE (204, không trả dữ liệu), sau đó đọc lại để hiển thị.
// BE chưa có GET xem Executor của kho nên lấy tên từ chi tiết Executor, nếu cũng không được thì chỉ biết ID vừa gán.
export async function assignExecutor(vaultId, executorId) {
  const id = Number(executorId)
  await axiosClient.put(`/owner/vaults/${vaultId}/executor`, { executorId: id })
  try {
    return await getVaultExecutor(vaultId)
  } catch {
    let fullName = `Executor #${id}`
    try {
      fullName = (await getExecutorDetail(id, vaultId)).fullName
    } catch {
      // Giữ tên theo ID khi không tra được chi tiết
    }
    return { vaultId, executorId: id, fullName, status: 'Active', assignedAt: new Date().toISOString() }
  }
}

export async function revokeExecutor(vaultId) {
  await axiosClient.post(`/owner/vaults/${vaultId}/executor/revoke`)
}


// Cài đặt bảo mật (BE chưa có API, đang dùng mock)
export async function getProfile() {
  const { data } = await axiosClient.get('/owner/profile')
  return data
}

// Số điện thoại để trống thì gửi null (xóa số)
export async function updateProfile({ fullName, phone }) {
  const { data } = await axiosClient.put('/owner/profile', { fullName: fullName.trim(), phone: optionalText(phone) })
  return data
}

export async function setTwoFactor(enabled) {
  const { data } = await axiosClient.put('/owner/security/two-factor', { enabled })
  return data
}

// Sửa tài sản; không gửi vaultId vì tài sản không được chuyển kho
export async function updateAsset(assetId, { name, type, description }) {
  const { data } = await axiosClient.put(`/owner/assets/${assetId}`, {
    name: name.trim(),
    type,
    description: optionalText(description),
  })
  return data
}

// BE không xoá hẳn tài sản mà thu hồi (Status = Revoked), dữ liệu và lịch sử vẫn giữ
export async function revokeAsset(assetId) {
  await axiosClient.post(`/owner/assets/${assetId}/revoke`)
}

// Danh sách phân bổ của một tài sản kèm assignmentId (BeneficiaryDto của /owner/beneficiaries không có id này)
export async function getAllocations(assetId) {
  return getAllPages(`/owner/assets/${assetId}/allocations`)
}

// BE sửa/thu hồi phân bổ theo assignmentId nên tra id của phân bổ đang hiệu lực theo người thụ hưởng
async function findActiveAssignment(assetId, beneficiaryId) {
  const assignment = (await getAllocations(assetId)).find((row) => row.beneficiaryId === beneficiaryId && row.status === 'Active')
  if (!assignment) throw Object.assign(new Error('Assignment not found.'), { status: 404 })
  return assignment
}

export async function updateBeneficiaryAllocation(assetId, beneficiaryId, allocation) {
  const { assignmentId } = await findActiveAssignment(assetId, beneficiaryId)
  const { data } = await axiosClient.put(`/owner/assets/${assetId}/allocations/${assignmentId}`, { allocation: Number(allocation) })
  return data
}

// Gỡ người thụ hưởng = thu hồi phân bổ (Status = Revoked), phần trăm trả về chưa phân bổ
export async function removeBeneficiary(assetId, beneficiaryId) {
  const { assignmentId } = await findActiveAssignment(assetId, beneficiaryId)
  await axiosClient.post(`/owner/assets/${assetId}/allocations/${assignmentId}/revoke`)
}

// Tải nội dung giấy tờ (đã giải mã) về dạng Blob
export async function downloadDocument(assetId, documentId) {
  const { data } = await axiosClient.get(`/owner/assets/${assetId}/documents/${documentId}/content`, { responseType: 'blob' })
  return data
}

// Hồ sơ bàn giao của các kho của Owner (PageDto của BE); lấy trang đầu tối đa 100 hồ sơ
export async function getOwnerHandovers() {
  return getAllPages('/owner/handovers')
}

// Sửa tên và mô tả kho; BE từ chối (409) khi kho đã đóng hoặc đang có hồ sơ bàn giao chưa hủy
export async function updateVault(vaultId, { name, description }) {
  const { data } = await axiosClient.put(`/owner/vaults/${vaultId}`, {
    name: name.trim(),
    description: optionalText(description),
  })
  return data
}

// Đóng kho (không có API mở lại); BE từ chối (409) khi kho đã đóng hoặc đang có hồ sơ bàn giao chưa hủy
export async function closeVault(vaultId) {
  await axiosClient.post(`/owner/vaults/${vaultId}/close`)
}

// Thu hồi giấy tờ của tài sản: BE đánh dấu Revoked và không trả giấy tờ này trong tài sản nữa
export async function revokeDocument(assetId, documentId) {
  await axiosClient.post(`/owner/assets/${assetId}/documents/${documentId}/revoke`)
}

// Một trang thông báo (BE: PageDto { page, pageSize, items }, mới nhất trước); bản BE cũ trả mảng thì bọc lại
export async function getNotificationPage({ page = 1, pageSize = 20 } = {}) {
  const { data } = await axiosClient.get('/notifications', { params: { page, pageSize } })
  return Array.isArray(data) ? { page, pageSize, items: data } : data
}

// Đánh dấu một thông báo đã đọc (BE trả 204, 404 nếu không phải của mình); BE chưa có API đánh dấu tất cả
export async function markNotificationRead(notificationId) {
  await axiosClient.post(`/notifications/${notificationId}/read`)
}

// Thông báo của chính người dùng, mới nhất trước (BE: GET /notifications, PageDto). Dùng để tìm lý do Executor từ chối hồ sơ
export async function getNotifications() {
  return getAllPages('/notifications')
}

// Chi tiết một hồ sơ bàn giao của kho thuộc Owner (404 nếu không phải của mình)
export async function getOwnerHandover(requestId) {
  const { data } = await axiosClient.get(`/owner/handovers/${requestId}`)
  return data
}

// Owner tạo hồ sơ bàn giao Draft cho kho; BE yêu cầu mọi tài sản có giấy tờ và đủ 100% phân bổ, chưa có Executor thì tự gán một người độc lập
export async function createOwnerHandover(vaultId) {
  const { data } = await axiosClient.post(`/owner/vaults/${vaultId}/handovers`)
  return data
}

// Chỉ hủy được hồ sơ Draft hoặc Rejected; hủy xong kho được sửa lại bình thường
export async function cancelHandover(requestId) {
  await axiosClient.post(`/owner/handovers/${requestId}/cancel`)
}
