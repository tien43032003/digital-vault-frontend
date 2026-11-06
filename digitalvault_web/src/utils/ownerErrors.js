import { parseQuotaError, quotaMessage } from './quota'

const HANDOVER_BLOCK =
  'Kho này đang có hồ sơ bàn giao nên không thể thay đổi tài sản, phân bổ hay giấy tờ. Hãy vào mục Hồ sơ bàn giao để hủy hồ sơ (đang chờ Executor tiếp nhận, bản nháp hoặc bị từ chối) rồi thử lại. Hồ sơ bị Executor từ chối thì không còn khóa kho.'

// Giải thích lỗi 409 của BE theo nội dung `detail` (BE dùng nhiều lý do khác nhau cho cùng một mã trạng thái)
export function conflictMessage(detail = '') {
  // Hạn mức gói phải xét trước vì câu "exceeds the supported quota range" chứa chữ "exceeds" của lỗi phân bổ
  const quota = parseQuotaError(detail)
  if (quota) return quotaMessage(quota)
  if (/giấy chứng tử|báo tử|deceased/i.test(detail)) return detail
  if (/handover/i.test(detail)) return HANDOVER_BLOCK
  if (/exceeds/i.test(detail)) return 'Tổng tỷ lệ phân bổ không được vượt 100%.'
  if (/assignment/i.test(detail)) return 'Phân bổ này không còn hiệu lực.'
  if (/inactive|not active/i.test(detail)) return 'Kho hoặc tài sản không còn hoạt động nên không thể thay đổi.'
  return detail ? `Thao tác xung đột với trạng thái hiện tại. Chi tiết từ máy chủ: ${detail}` : 'Thao tác xung đột với trạng thái hiện tại.'
}

// Thông báo lỗi tiếng Việt cho các thao tác sửa của Owner (tài sản, phân bổ, người thụ hưởng)
export function ownerMutationErrorMessage(error) {
  switch (error?.status) {
    case 409:
      return conflictMessage(error.message)
    case 404:
      return 'Không tìm thấy dữ liệu. Vui lòng tải lại trang.'
    case 403:
      return 'Bạn không có quyền thực hiện thao tác này.'
    default:
      return error?.message || 'Đã có lỗi xảy ra, vui lòng thử lại.'
  }
}
