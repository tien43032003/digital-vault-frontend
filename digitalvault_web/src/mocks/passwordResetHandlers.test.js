import { setupServer } from 'msw/node'
import axiosClient from '../callapi/axiosClient'
import { DEMO_ACCOUNT, getDb, resetMockDb } from './db'
import { handlers } from './handlers'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockDb()
  sessionStorage.removeItem('aeterna.user')
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const call = async (promise) => {
  try {
    const response = await promise
    return { status: response.status, data: response.data }
  } catch (error) {
    return { status: error.status, message: error.message }
  }
}

const NEW_PASSWORD = 'MatKhauMoi#2026'
const forgot = (email = DEMO_ACCOUNT.email, extra = {}) => call(axiosClient.post('/auth/forgot-password', { email, ...extra }))
const verify = (email, code) => call(axiosClient.post('/auth/forgot-password/verify-otp', { email, code }))
const reset = (body) => call(axiosClient.post('/auth/reset-password', { email: DEMO_ACCOUNT.email, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD, ...body }))
const login = (email, password) => call(axiosClient.post('/auth/login', { email, password }))

async function getResetToken() {
  const { data } = await forgot()
  return (await verify(DEMO_ACCOUNT.email, data.mockOtp)).data.resetToken
}

describe('mock forgot password', () => {
  it('post_KnownEmail_ReturnsMaskedEmailExpiryAndMockOtp', async () => {
    const result = await forgot()
    expect(result.status).toBe(200)
    expect(result.data.maskedEmail).toBe('o***r@example.com')
    expect(result.data.expiresInSeconds).toBe(300)
    expect(result.data.mockOtp).toMatch(/^\d{6}$/)
  })

  it('post_EmailInDifferentCase_StillWorks', async () => {
    expect((await forgot('OWNER@Example.com')).data.mockOtp).toMatch(/^\d{6}$/)
  })

  it('post_UnknownEmail_LooksIdenticalButHasNoOtp', async () => {
    const result = await forgot('khong.ton.tai@example.com')
    expect(result.status).toBe(200)
    expect(result.data.maskedEmail).toBe('k***i@example.com')
    expect(result.data.expiresInSeconds).toBe(300)
    expect(result.data.mockOtp).toBeUndefined()
  })

  it.each([[''], ['abc'], [null]])('post_InvalidEmail_Returns400', async (email) => {
    expect((await forgot(email)).status).toBe(400)
  })

  it('post_UnknownField_Returns400', async () => {
    expect((await forgot(DEMO_ACCOUNT.email, { role: 'Admin' })).status).toBe(400)
  })

  it('post_NewRequest_ReplacesPreviousOtp', async () => {
    const first = (await forgot()).data.mockOtp
    const second = (await forgot()).data.mockOtp
    if (first !== second) expect((await verify(DEMO_ACCOUNT.email, first)).status).toBe(400)
    expect((await verify(DEMO_ACCOUNT.email, second)).status).toBe(200)
  })
})

describe('mock verify reset otp', () => {
  it('post_CorrectOtp_ReturnsResetToken', async () => {
    const { data } = await forgot()
    const result = await verify(DEMO_ACCOUNT.email, data.mockOtp)
    expect(result.status).toBe(200)
    expect(typeof result.data.resetToken).toBe('string')
    expect(result.data.resetToken.length).toBeGreaterThan(10)
  })

  it('post_WrongOtp_Returns400', async () => {
    const { data } = await forgot()
    const wrong = data.mockOtp === '000000' ? '111111' : '000000'
    expect((await verify(DEMO_ACCOUNT.email, wrong)).status).toBe(400)
  })

  it('post_NoRequestedOtp_Returns400', async () => {
    expect((await verify(DEMO_ACCOUNT.email, '123456')).status).toBe(400)
  })

  it('post_UnknownEmail_Returns400', async () => {
    await forgot('khong.ton.tai@example.com')
    expect((await verify('khong.ton.tai@example.com', '123456')).status).toBe(400)
  })

  it('post_ExpiredOtp_Returns400', async () => {
    const { data } = await forgot()
    getDb().passwordResets[DEMO_ACCOUNT.email].expiresAt = Date.now() - 1000
    expect((await verify(DEMO_ACCOUNT.email, data.mockOtp)).status).toBe(400)
  })

  it('post_TooManyWrongAttempts_Returns400EvenWithCorrectOtp', async () => {
    const { data } = await forgot()
    const wrong = data.mockOtp === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i += 1) await verify(DEMO_ACCOUNT.email, wrong)
    // BE trả 400 chung cho mã sai, hết hạn và quá 5 lần thử
    expect((await verify(DEMO_ACCOUNT.email, data.mockOtp)).status).toBe(400)
  })

  it('post_OtpAlreadyUsed_Returns400', async () => {
    const { data } = await forgot()
    await verify(DEMO_ACCOUNT.email, data.mockOtp)
    expect((await verify(DEMO_ACCOUNT.email, data.mockOtp)).status).toBe(400)
  })

  it('post_InvalidFormat_Returns400', async () => {
    expect((await verify(DEMO_ACCOUNT.email, 'abcdef')).status).toBe(400)
    expect((await call(axiosClient.post('/auth/forgot-password/verify-otp', { email: DEMO_ACCOUNT.email }))).status).toBe(400)
  })
})

describe('mock reset password', () => {
  it('post_ValidToken_Returns204AndNewPasswordWorks', async () => {
    const resetToken = await getResetToken()
    expect((await reset({ resetToken })).status).toBe(204)
    expect((await login(DEMO_ACCOUNT.email, NEW_PASSWORD)).status).toBe(200)
    expect((await login(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password)).status).toBe(401)
  })

  it('post_TokenUsedTwice_SecondReturns400', async () => {
    const resetToken = await getResetToken()
    await reset({ resetToken })
    expect((await reset({ resetToken })).status).toBe(400)
  })

  it('post_UnknownToken_Returns400', async () => {
    expect((await reset({ resetToken: 'khong-co-token-nay-dau' })).status).toBe(400)
  })

  it('post_WeakPassword_Returns400AndKeepsTokenUsable', async () => {
    const resetToken = await getResetToken()
    expect((await reset({ resetToken, newPassword: 'ngan', confirmPassword: 'ngan' })).status).toBe(400)
    expect((await reset({ resetToken })).status).toBe(204)
  })

  it('post_ConfirmMismatch_Returns400', async () => {
    const resetToken = await getResetToken()
    expect((await reset({ resetToken, confirmPassword: 'KhacHoanToan#2026' })).status).toBe(400)
  })

  it('post_UnknownField_Returns400', async () => {
    const resetToken = await getResetToken()
    expect((await reset({ resetToken, role: 'Admin' })).status).toBe(400)
  })

  it('post_TokenBelongsToAnotherEmail_Returns400', async () => {
    const resetToken = await getResetToken()
    expect((await reset({ resetToken, email: 'nguoi.khac@example.com' })).status).toBe(400)
  })

  it('post_MissingEmail_Returns400', async () => {
    const resetToken = await getResetToken()
    expect((await call(axiosClient.post('/auth/reset-password', { resetToken, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }))).status).toBe(400)
  })
})
