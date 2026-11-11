import { setupServer } from 'msw/node'
import axiosClient from '../callapi/axiosClient'
import { confirmPasswordChange, requestPasswordChange } from '../callapi/authApi'
import { DEMO_ACCOUNT, getDb, resetMockDb } from './db'
import { handlers } from './handlers'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(async () => {
  resetMockDb()
  await axiosClient.post('/auth/login', { email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password })
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const NEW_PASSWORD = 'MatKhauMoi#2026'
const rejection = (promise) => promise.then(() => null, (error) => error)
const request = (overrides = {}) => requestPasswordChange({ currentPassword: DEMO_ACCOUNT.password, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD, ...overrides })
const loginStatus = async (password) => (await rejection(axiosClient.post('/auth/login', { email: DEMO_ACCOUNT.email, password })))?.status ?? 200

describe('mock change password step 1 (request OTP)', () => {
  it('request_ValidInput_ReturnsChallengeAndMockCode', async () => {
    const result = await request()
    expect(result.challengeId).toMatch(/^[0-9a-f]{32}$/)
    expect(result.expiresInSeconds).toBe(300)
    expect(result.mockCode).toMatch(/^\d{6}$/)
  })

  it('request_WrongCurrentPassword_Returns400WithBackendMessage', async () => {
    const error = await rejection(request({ currentPassword: 'SaiMatKhau#123' }))
    expect(error.status).toBe(400)
    expect(error.message).toBe('Mật khẩu hiện tại không chính xác.')
  })

  it('request_ConfirmMismatch_Returns400', async () => {
    expect((await rejection(request({ confirmPassword: 'KhongKhop#2026x' }))).status).toBe(400)
  })

  it('request_NewPasswordShorterThan12_Returns400', async () => {
    expect((await rejection(request({ newPassword: 'Ngan#1', confirmPassword: 'Ngan#1' }))).status).toBe(400)
  })

  it('request_SameAsCurrent_Returns400', async () => {
    expect((await rejection(request({ newPassword: DEMO_ACCOUNT.password, confirmPassword: DEMO_ACCOUNT.password }))).status).toBe(400)
  })

  it('request_NotLoggedIn_Returns401', async () => {
    sessionStorage.clear()
    localStorage.clear()
    expect((await rejection(request())).status).toBe(401)
  })

  it('request_DoesNotChangePasswordYet', async () => {
    await request()
    expect(await loginStatus(DEMO_ACCOUNT.password)).toBe(200)
    expect(await loginStatus(NEW_PASSWORD)).toBe(401)
  })
})

describe('mock change password step 2 (confirm OTP)', () => {
  it('confirm_CorrectCode_ChangesPasswordAndRecordsDate', async () => {
    const { challengeId, mockCode } = await request()
    await expect(confirmPasswordChange(challengeId, mockCode)).resolves.toMatchObject({ message: expect.any(String) })
    expect(await loginStatus(NEW_PASSWORD)).toBe(200)
    expect(await loginStatus(DEMO_ACCOUNT.password)).toBe(401)
    const profile = (await axiosClient.get('/owner/profile')).data
    expect(Date.now() - new Date(profile.passwordChangedAt).getTime()).toBeLessThan(60_000)
  })

  it('confirm_WrongCode_Returns400AndKeepsOldPassword', async () => {
    const { challengeId, mockCode } = await request()
    const wrong = mockCode === '000000' ? '111111' : '000000'
    expect((await rejection(confirmPasswordChange(challengeId, wrong))).status).toBe(400)
    expect(await loginStatus(DEMO_ACCOUNT.password)).toBe(200)
  })

  it('confirm_AfterFiveWrongAttempts_RejectsEvenCorrectCode', async () => {
    const { challengeId, mockCode } = await request()
    const wrong = mockCode === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i += 1) await rejection(confirmPasswordChange(challengeId, wrong))
    expect((await rejection(confirmPasswordChange(challengeId, mockCode))).status).toBe(400)
  })

  it('confirm_ExpiredChallenge_Returns400', async () => {
    const { challengeId, mockCode } = await request()
    getDb().passwordChallenges[challengeId].expiresAt = Date.now() - 1000
    expect((await rejection(confirmPasswordChange(challengeId, mockCode))).status).toBe(400)
  })

  it('confirm_NewRequest_ReplacesThePreviousChallenge', async () => {
    const first = await request()
    const second = await request()
    expect((await rejection(confirmPasswordChange(first.challengeId, first.mockCode))).status).toBe(400)
    await expect(confirmPasswordChange(second.challengeId, second.mockCode)).resolves.toBeTruthy()
  })

  it('confirm_CodeUsedTwice_SecondReturns400', async () => {
    const { challengeId, mockCode } = await request()
    await confirmPasswordChange(challengeId, mockCode)
    expect((await rejection(confirmPasswordChange(challengeId, mockCode))).status).toBe(400)
  })

  it('confirm_InvalidFormat_Returns400', async () => {
    const { challengeId } = await request()
    expect((await rejection(confirmPasswordChange(challengeId, 'abcdef'))).status).toBe(400)
    expect((await rejection(confirmPasswordChange('khong-hop-le', '123456'))).status).toBe(400)
  })
})
