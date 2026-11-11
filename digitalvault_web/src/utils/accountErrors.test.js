import { passwordConfirmError, passwordRequestError } from './accountErrors'

describe('passwordRequestError', () => {
  it('passwordRequestError_WrongCurrentPassword_PointsAtCurrentPasswordField', () => {
    expect(passwordRequestError({ status: 400, message: 'Mật khẩu hiện tại không chính xác.' })).toEqual({ field: 'currentPassword', message: 'Mật khẩu hiện tại không đúng.' })
  })

  it('passwordRequestError_Other400_KeepsBackendMessageAsAlert', () => {
    expect(passwordRequestError({ status: 400, message: 'Mật khẩu mới không được trùng với mật khẩu hiện tại.' })).toEqual({ alert: 'Mật khẩu mới không được trùng với mật khẩu hiện tại.' })
  })

  it('passwordRequestError_TooSoon429_AsksToWait60Seconds', () => {
    expect(passwordRequestError({ status: 429 }).alert).toContain('đợi 60 giây')
  })

  it('passwordRequestError_EmailNotConfigured503_ExplainsEmailProblem', () => {
    expect(passwordRequestError({ status: 503 }).alert).toContain('chưa gửi được email')
  })

  it('passwordRequestError_Unknown_UsesMessageOrDefault', () => {
    expect(passwordRequestError({ status: 500, message: 'Máy chủ bận.' })).toEqual({ alert: 'Máy chủ bận.' })
    expect(passwordRequestError(null)).toEqual({ alert: 'Đã có lỗi xảy ra, vui lòng thử lại.' })
  })
})

describe('passwordConfirmError', () => {
  it('passwordConfirmError_WrongOrExpiredCode_SaysCodeIsWrongOrExpired', () => {
    expect(passwordConfirmError({ status: 400, message: 'Mã OTP không chính xác.' })).toBe('Mã OTP không đúng hoặc đã hết hạn.')
  })

  it('passwordConfirmError_TooManyRequests429_AsksToWaitAMinute', () => {
    expect(passwordConfirmError({ status: 429 })).toContain('1 phút')
  })

  it('passwordConfirmError_Unknown_UsesMessageOrDefault', () => {
    expect(passwordConfirmError({ status: 500, message: 'Lỗi.' })).toBe('Lỗi.')
    expect(passwordConfirmError(undefined)).toBe('Đã có lỗi xảy ra, vui lòng thử lại.')
  })
})
