const GENERIC_ERROR = 'Đã có lỗi xảy ra, vui lòng thử lại.'

// Lỗi bước 1 đổi mật khẩu (gửi OTP): trả { field, message } khi lỗi thuộc một ô nhập, hoặc { alert } khi là lỗi chung của form
export function passwordRequestError(error) {
  if (error?.status === 400 && /hiện tại không chính xác/i.test(error.message ?? '')) {
    return { field: 'currentPassword', message: 'Mật khẩu hiện tại không đúng.' }
  }
  if (error?.status === 429) return { alert: 'Vui lòng đợi 60 giây trước khi yêu cầu mã xác nhận mới.' }
  if (error?.status === 503) return { alert: 'Máy chủ chưa gửi được email xác nhận. Vui lòng thử lại sau.' }
  return { alert: error?.message || GENERIC_ERROR }
}

// Lỗi bước 2 (nhập OTP): BE trả 400 cho cả mã sai, hết hạn lẫn quá 5 lần thử
export function passwordConfirmError(error) {
  if (error?.status === 400) return 'Mã OTP không đúng hoặc đã hết hạn.'
  if (error?.status === 429) return 'Bạn thao tác quá nhanh. Vui lòng đợi khoảng 1 phút rồi thử lại.'
  return error?.message || GENERIC_ERROR
}
