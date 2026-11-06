import { parseQuotaError, quotaMessage } from './quota'

import { parseServerDate } from './beneficiary'

// Trạng thái hồ sơ bàn giao (HANDOVER_REQUESTS của BE) và tông màu hiển thị
const STATUS_INFO = {
  Pending_Executor: { text: 'Chờ Executor tiếp nhận', tone: 'info' },
  Declined: { text: 'Executor từ chối', tone: 'warn' },
  Draft: { text: 'Bản nháp', tone: 'muted' },
  Cancelled: { text: 'Đã hủy', tone: 'muted' },
  Pending_Legal: { text: 'Chờ thẩm định pháp lý', tone: 'info' },
  Additional_Info: { text: 'Cần bổ sung hồ sơ', tone: 'warn' },
  Rejected: { text: 'Bị từ chối', tone: 'warn' },
  Approved: { text: 'Đã duyệt pháp lý', tone: 'ok' },
  In_Progress: { text: 'Đang bàn giao', tone: 'info' },
  Completed: { text: 'Hoàn tất', tone: 'ok' },
}

// Mã hồ sơ hiển thị: HS-<năm tạo>-<số hồ sơ 4 chữ số>, ví dụ HS-2026-0007. BE chưa có trường mã hồ sơ nên FE ghép từ requestId và năm của initiatedAt
// (không có ngày tạo thì chỉ có HS-0007). Số hồ sơ vượt 4 chữ số vẫn giữ nguyên, không bị cắt.
export function handoverCode({ requestId, initiatedAt }) {
  const number = String(requestId).padStart(4, '0')
  const year = initiatedAt ? parseServerDate(initiatedAt).getFullYear() : Number.NaN
  return Number.isFinite(year) ? `HS-${year}-${number}` : `HS-${number}`
}

export function handoverStatusInfo(status) {
  return STATUS_INFO[status] ?? { text: status, tone: 'muted' }
}

// Trạng thái một lần thẩm định (LegalHistoryDto.status): Pending là đã gửi và chưa có kết quả, còn lại trùng trạng thái hồ sơ
export function verificationStatusInfo(status) {
  if (status === 'Pending') return { text: 'Đang chờ thẩm định', tone: 'info' }
  return handoverStatusInfo(status)
}

// Owner chỉ hủy được hồ sơ đang chờ Executor tiếp nhận, bản nháp hoặc bị từ chối (BE trả 409 với các trạng thái khác)
export const isCancellableStatus = (status) => ['Pending_Executor', 'Draft', 'Rejected'].includes(status)

// Như BE: kho bị khóa với Owner khi còn hồ sơ bàn giao chưa hủy và chưa bị Executor từ chối
export const isVaultLockedByHandover = (handovers, vaultId) =>
  (handovers ?? []).some((item) => item.vaultId === vaultId && !['Cancelled', 'Declined'].includes(item.status))

// Chủ sở hữu bị khóa tạo kho mới khi đã có hồ sơ bàn giao đang xử lý / đã duyệt ở bất kỳ kho nào
export const isOwnerLockedByHandover = (handovers) =>
  (handovers ?? []).some((item) => !['Cancelled', 'Declined', 'Rejected'].includes(item.status))

// Chỉ ở các trạng thái này Executor mới được nộp thêm giấy chứng tử/bằng chứng và gửi thẩm định
export const isEditableStatus = (status) => ['Draft', 'Rejected', 'Additional_Info'].includes(status)

// Nhóm trạng thái cho từng mục trên thanh điều hướng của Executor
export const HANDOVER_GROUPS = {
  pending: ['Pending_Legal', 'Additional_Info'],
  approved: ['Approved'],
  inProgress: ['In_Progress'],
  history: ['Completed', 'Cancelled', 'Declined'],
}

// Lọc theo nhóm trạng thái (không truyền thì lấy tất cả), mới nhất trước
export function filterHandovers(handovers, statuses) {
  const items = statuses ? handovers.filter((item) => statuses.includes(item.status)) : [...handovers]
  return items.sort((a, b) => b.requestId - a.requestId)
}

// Chuyển lỗi tạo hồ sơ bàn giao sang thông báo tiếng Việt
export function createHandoverErrorMessage(error) {
  if (error?.status === 409) return 'Kho này đã có hồ sơ bàn giao đang xử lý hoặc chưa có tài sản nào được phân bổ.'
  if (error?.status === 403) return 'Bạn không được phân công kho này.'
  return error?.message || 'Đã có lỗi xảy ra, vui lòng thử lại.'
}

// Thông báo lỗi tiếng Việt khi Owner tạo hồ sơ bàn giao, tách theo lý do của BE
export function ownerCreateHandoverErrorMessage(error) {
  const detail = error?.message ?? ''
  if (error?.status === 404) return 'Không tìm thấy kho. Vui lòng tải lại trang.'
  if (error?.status === 403) return 'Bạn không có quyền tạo hồ sơ bàn giao.'
  if (error?.status === 503) return 'Hiện chưa có Người thi hành độc lập nào sẵn sàng. Hãy gán Người thi hành cho kho rồi thử lại.'
  if (error?.status === 409) {
    if (/exactly 100 percent/i.test(detail)) return 'Mỗi tài sản đang hoạt động cần có giấy tờ và được phân bổ đủ 100% cho người thụ hưởng đang hiệu lực trước khi tạo hồ sơ bàn giao.'
    if (/protected handover|inactive/i.test(detail)) return 'Kho đang không hoạt động hoặc đã có hồ sơ bàn giao chưa hủy. Hãy hủy hồ sơ đang chờ tiếp nhận, bản nháp hoặc bị từ chối trước khi tạo hồ sơ mới.'
    if (/independent/i.test(detail)) return 'Người thi hành của kho phải độc lập với chủ kho và những người thụ hưởng.'
    if (/Beneficiary unavailable/i.test(detail)) return 'Có người thụ hưởng không còn hoạt động nên chưa thể tạo hồ sơ bàn giao.'
    if (/Multiple active executors/i.test(detail)) return 'Kho có nhiều Người thi hành đang hiệu lực, cần quản trị viên chỉnh lại.'
    return 'Chưa thể tạo hồ sơ bàn giao vì trạng thái kho hiện tại.'
  }
  return detail || 'Đã có lỗi xảy ra, vui lòng thử lại.'
}

// BE chỉ báo lý do Executor từ chối qua thông báo có nội dung "Handover #<mã>: <lý do>"; tìm lý do của đúng hồ sơ (danh sách mới nhất trước)
export function declineReasonFromNotifications(notifications, requestId) {
  const prefix = `Handover #${requestId}:`
  const found = (notifications ?? []).find((item) => typeof item.message === 'string' && item.message.startsWith(prefix))
  const reason = found?.message.slice(prefix.length).trim()
  return reason || null
}

const SERVER_DETAIL = (error) => (error?.message ? ` Chi tiết từ máy chủ: ${error.message}` : '')

// Thông báo lỗi tiếng Việt cho từng thao tác của Người thi hành trên hồ sơ (kèm nguyên văn lý do của máy chủ khi hữu ích)
export function handoverActionErrorMessage(error, action) {
  const status = error?.status
  if (status === 404) return 'Không tìm thấy hồ sơ bàn giao.'
  if (status === 403) return 'Bạn không có quyền xử lý hồ sơ này.'
  if (status === 413) return 'File quá lớn. Mỗi file tối đa 10 MB.'
  if (action === 'upload') {
    if (status === 400) return `Tệp hoặc chữ ký không hợp lệ.${SERVER_DETAIL(error)}`
    if (status === 409) {
      // Giấy tờ nộp cho hồ sơ tính vào dung lượng gói của chủ kho nên có thể bị chặn vì hạn mức
      const quota = parseQuotaError(error?.message)
      return quota ? quotaMessage(quota, { forOwner: false }) : 'Hồ sơ không còn ở trạng thái cho phép nộp thêm giấy tờ.'
    }
  }
  if (action === 'legal') {
    if (status === 400) {
      return `Không gửi được hồ sơ. Hãy kiểm tra đã nộp giấy chứng tử, bằng chứng hợp lệ và người xác minh độc lập (không phải bạn, chủ kho hay người thụ hưởng).${SERVER_DETAIL(error)}`
    }
    if (status === 409) return 'Hồ sơ không ở trạng thái cho phép gửi thẩm định.'
  }
  if (action === 'accept' || action === 'decline') {
    if (status === 409 && /documents and exactly 100/i.test(error?.message ?? '')) {
      return 'Kho hoặc tài sản chưa đủ điều kiện để tiếp nhận: mỗi tài sản cần có giấy tờ và được phân bổ đủ 100%. Hãy báo chủ kho bổ sung.'
    }
    if (status === 409) return 'Hồ sơ không còn ở trạng thái chờ tiếp nhận (chủ kho có thể đã hủy hoặc đã có quyết định). Đã tải lại hồ sơ.'
    if (status === 400) return 'Lý do từ chối không hợp lệ (bắt buộc, tối đa 2000 ký tự).'
  }
  if (action === 'start' && status === 409) return 'Hồ sơ chưa ở trạng thái phù hợp để bắt đầu bàn giao (cần được duyệt pháp lý).'
  if (action === 'complete') {
    if (status === 400) {
      return `Biên bản hoặc chữ ký không hợp lệ. Hãy kiểm tra chữ ký rời RSA-SHA256 và chứng thư đã đăng ký.${SERVER_DETAIL(error)}`
    }
    if (status === 409) return 'Hồ sơ chưa đủ điều kiện để hoàn tất (cần được duyệt pháp lý).'
  }
  return error?.message || 'Đã có lỗi xảy ra, vui lòng thử lại.'
}
