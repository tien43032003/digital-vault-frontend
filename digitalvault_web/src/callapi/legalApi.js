import axiosClient from './axiosClient'
import { getAllPages } from './pagedList'

// API cổng Thẩm Định Pháp Lý / Công Chứng (role LegalVerifier)
// Hồ sơ bàn giao, tải giấy tờ chứng tử / bằng chứng, tải tài liệu tài sản và các hành động duyệt/từ chối/yêu cầu bổ sung

/**
 * Lấy danh sách hồ sơ bàn giao theo phân trang và trạng thái
 * @param {{ page?: number, pageSize?: number, status?: string }} params
 * @returns {Promise<{ page: number, pageSize: number, items: Array }>}
 */
export async function getLegalHandovers({ page = 1, pageSize = 20, status = '' } = {}) {
  const params = { page, pageSize }
  if (status) params.status = status
  const { data } = await axiosClient.get('/legal/handovers', { params })
  return data
}

// Các phần phụ của trang chi tiết (tài sản, lịch sử, tình trạng chủ kho): lỗi hoặc rỗng chỉ làm phần đó trống, không làm hỏng cả trang
const orFallback = (promise, fallback) => promise.then((value) => value ?? fallback, () => fallback)

/**
 * Lấy thông tin chi tiết một hồ sơ bàn giao
 * @param {number|string} requestId
 */
export async function getLegalHandover(requestId) {
  const { data } = await axiosClient.get(`/legal/handovers/${requestId}`)
  // BE bọc chi tiết dạng { request: HandoverDto, verification: {...} }; gộp phẳng để trang đọc requestId, status, documents... trực tiếp.
  // Dữ liệu phẳng (mock, BE cũ) giữ nguyên.
  if (data?.request && typeof data.request === 'object') {
    const { request, ...rest } = data
    const handover = { ...request, ...rest }
    const [assets, history, ownerStatus] = await Promise.all([
      handover.assets ?? orFallback(getLegalAssets(requestId), []),
      handover.history ?? orFallback(getLegalHistory(requestId), []),
      handover.ownerStatus ?? orFallback(getLegalOwnerStatus(requestId), null),
    ])
    return { ...handover, assets, history, ownerStatus }
  }
  return data
}

/**
 * Tài sản của chủ kho nằm trong hồ sơ, mỗi tài sản kèm danh sách tài liệu (GET /legal/handovers/{id}/assets, PageDto)
 * @param {number|string} requestId
 * @returns {Promise<Array<{ assetId: number, name: string, type: string, description: string, status: string, documents: Array }>>}
 */
export async function getLegalAssets(requestId) {
  return getAllPages(`/legal/handovers/${requestId}/assets`)
}

/**
 * Lịch sử thẩm định của một hồ sơ (GET /legal/handovers/{id}/history, mảng LegalHistoryDto), mới nhất trước
 * @param {number|string} requestId
 * @returns {Promise<Array<{ verificationId: number, verifierName: string, status: string, comment: string, submittedAt: string, reviewedAt: string|null }>>}
 */
export async function getLegalHistory(requestId) {
  const { data } = await axiosClient.get(`/legal/handovers/${requestId}/history`)
  const entries = Array.isArray(data) ? data : (data?.items ?? [])
  return [...entries].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
}

/**
 * Tình trạng chủ kho gắn với hồ sơ (GET /legal/handovers/{id}/owner-status, OwnerLifeStatusDto):
 * trạng thái, lần xác nhận còn sống gần nhất, ID giấy chứng tử, người và thời điểm xác minh
 * @param {number|string} requestId
 */
export async function getLegalOwnerStatus(requestId) {
  const { data } = await axiosClient.get(`/legal/handovers/${requestId}/owner-status`)
  return data
}

/**
 * Tải giấy tờ chứng tử hoặc bằng chứng Executor đã nộp trong hồ sơ
 * @param {number|string} requestId
 * @param {number|string} documentId
 * @returns {Promise<{ blob: Blob, signatureValid: boolean }>}
 */
export async function downloadLegalHandoverDocument(requestId, documentId) {
  const response = await axiosClient.get(`/legal/handovers/${requestId}/documents/${documentId}/content`, {
    responseType: 'blob',
  })
  return {
    blob: response.data,
    signatureValid: response.headers?.['x-signature-valid'] === 'true',
  }
}

/**
 * Phê duyệt hồ sơ pháp lý (chỉ khả dụng khi status là Pending_Legal)
 * @param {number|string} requestId
 * @param {{ comment: string }} input
 * @returns {Promise<{ verificationId: number, requestId: number, verifierId: number, status: string, comment: string, submittedAt: string, reviewedAt: string }>}
 */
export async function approveLegalHandover(requestId, { comment }) {
  const trimmed = comment?.trim() ?? ''
  const { data } = await axiosClient.post(`/legal/handovers/${requestId}/approve`, {
    comment: trimmed,
  })
  return data
}

/**
 * Từ chối hồ sơ pháp lý
 * @param {number|string} requestId
 * @param {{ comment: string }} input
 */
export async function rejectLegalHandover(requestId, { comment }) {
  const trimmed = comment?.trim() ?? ''
  const { data } = await axiosClient.post(`/legal/handovers/${requestId}/reject`, {
    comment: trimmed,
  })
  return data
}

/**
 * Yêu cầu Executor bổ sung thêm thông tin/bằng chứng cho hồ sơ
 * @param {number|string} requestId
 * @param {{ comment: string }} input
 */
export async function requestAdditionalInfoLegalHandover(requestId, { comment }) {
  const trimmed = comment?.trim() ?? ''
  const { data } = await axiosClient.post(`/legal/handovers/${requestId}/request-additional-information`, {
    comment: trimmed,
  })
  return data
}
