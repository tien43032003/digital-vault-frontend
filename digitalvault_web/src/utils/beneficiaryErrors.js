import { conflictMessage } from './ownerErrors'

// Chuyển lỗi API chỉ định người thụ hưởng sang thông báo tiếng Việt (dùng chung cho các form chỉ định)
export function assignErrorMessage(error) {
  if (error?.status === 404) return 'Không tìm thấy tài khoản đang hoạt động với email này. Hãy nhờ người nhận đăng ký trước.'
  if (error?.status === 400) return 'Thông tin không hợp lệ (bạn không thể chọn chính mình làm người thụ hưởng).'
  if (error?.status === 409) {
    const detail = error.message ?? ''
    if (/already a pending or active/i.test(detail)) {
      return 'Người này đã được chỉ định cho tài sản (đang chờ xác nhận hoặc đã hiệu lực). Hãy chờ họ xác nhận hoặc chọn người khác.'
    }
    if (/cannot exceed/i.test(detail)) return 'Tổng tỷ lệ của những người thụ hưởng đang hiệu lực không được vượt 100%.'
    if (/giấy chứng tử|báo tử|deceased/i.test(detail)) return detail
    return conflictMessage(detail)
  }
  return error?.message || 'Đã có lỗi xảy ra, vui lòng thử lại.'
}
