import { clearTokens, getTokens, setTokens } from '../utils/tokenStorage'
import axiosClient from './axiosClient'
import {
  checkSession,
  confirmPasswordChange,
  login,
  logout,
  register,
  requestPasswordChange,
  requestPasswordReset,
  resendTwoFactor,
  resetPassword,
  verifyResetOtp,
  verifyTwoFactor,
} from './authApi'

vi.mock('./axiosClient', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

describe('authApi', () => {
  beforeEach(() => setTokens({ accessToken: 'a', refreshToken: 'r' }))

  afterEach(() => {
    vi.clearAllMocks()
    clearTokens()
  })

  it('login_ResponseWithTokens_StoresThemAndReturnsOnlyUserAndRoles', async () => {
    axiosClient.post.mockResolvedValue({
      data: {
        userId: 5,
        roles: ['Owner'],
        accessToken: 'acc',
        tokenType: 'Bearer',
        expiresIn: 900,
        refreshToken: 'ref',
        refreshTokenExpiresAt: '2026-10-21T00:00:00Z',
      },
    })
    await expect(login('an@example.com', 'x')).resolves.toEqual({ userId: 5, roles: ['Owner'] })
    expect(getTokens()).toEqual({ accessToken: 'acc', refreshToken: 'ref', expiresAt: '2026-10-21T00:00:00Z' })
  })

  it('login_TwoFactorRequired_ReturnsChallengeAndStoresNoTokens', async () => {
    axiosClient.post.mockResolvedValue({
      status: 202,
      data: { challengeId: 'a'.repeat(32), method: 'Email', expiresAt: '2026-10-21T00:05:00Z', requiresTwoFactor: true },
    })
    await expect(login('an@example.com', 'x')).resolves.toEqual({
      requiresTwoFactor: true,
      challengeId: 'a'.repeat(32),
      method: 'Email',
      expiresAt: '2026-10-21T00:05:00Z',
    })
    expect(getTokens()).toBeNull()
  })

  it('verifyTwoFactor_Code_PostsTrimmedCodeStoresTokensAndReturnsUser', async () => {
    axiosClient.post.mockResolvedValue({
      data: { userId: 5, roles: ['Owner'], accessToken: 'acc', refreshToken: 'ref', refreshTokenExpiresAt: '2026-10-21T00:00:00Z' },
    })
    await expect(verifyTwoFactor('c'.repeat(32), ' 123456 ')).resolves.toEqual({ userId: 5, roles: ['Owner'] })
    expect(axiosClient.post).toHaveBeenCalledWith('/auth/2fa/verify', { challengeId: 'c'.repeat(32), code: '123456' }, { skipAuthRedirect: true })
    expect(getTokens()).toMatchObject({ accessToken: 'acc', refreshToken: 'ref' })
  })

  it('verifyTwoFactor_Rejected_LeavesNoTokens', async () => {
    axiosClient.post.mockRejectedValue({ status: 400 })
    await expect(verifyTwoFactor('c'.repeat(32), '123456')).rejects.toEqual({ status: 400 })
    expect(getTokens()).toBeNull()
  })

  it('resendTwoFactor_ChallengeId_PostsAndReturnsNewChallenge', async () => {
    axiosClient.post.mockResolvedValue({ data: { challengeId: 'd'.repeat(32), method: 'Email', expiresAt: 'x', requiresTwoFactor: true } })
    await expect(resendTwoFactor('c'.repeat(32))).resolves.toMatchObject({ challengeId: 'd'.repeat(32) })
    expect(axiosClient.post).toHaveBeenCalledWith('/auth/2fa/resend', { challengeId: 'c'.repeat(32) }, { skipAuthRedirect: true })
  })

  it('login_Called_DropsOldTokensBeforeRequest', async () => {
    let tokensDuringRequest = 'not-called'
    axiosClient.post.mockImplementation(async () => {
      tokensDuringRequest = getTokens()
      return { data: { userId: 5, roles: [] } }
    })
    await login('an@example.com', 'x')
    expect(tokensDuringRequest).toBeNull()
    expect(getTokens()).toBeNull()
  })

  it('login_Rejected_LeavesNoTokens', async () => {
    axiosClient.post.mockRejectedValue({ status: 401 })
    await expect(login('an@example.com', 'x')).rejects.toEqual({ status: 401 })
    expect(getTokens()).toBeNull()
  })

  it('logout_ServerFails_StillClearsTokensAndThrows', async () => {
    axiosClient.post.mockRejectedValue({ status: 401 })
    await expect(logout()).rejects.toEqual({ status: 401 })
    expect(getTokens()).toBeNull()
  })

  it('logout_Success_ClearsTokens', async () => {
    axiosClient.post.mockResolvedValue({ status: 204 })
    await logout()
    expect(getTokens()).toBeNull()
  })

  it('checkSession_NoTokens_ReturnsNullWithoutCallingApi', async () => {
    clearTokens()
    await expect(checkSession()).resolves.toBeNull()
    expect(axiosClient.get).not.toHaveBeenCalled()
  })

  it('logout_WithRefreshToken_SendsItSoServerCanRevokeIt', async () => {
    axiosClient.post.mockResolvedValue({ status: 204 })
    await logout()
    expect(axiosClient.post).toHaveBeenCalledWith('/auth/logout', { refreshToken: 'r' }, { skipAuthRedirect: true })
  })

  it('logout_WithoutTokens_SendsEmptyBody', async () => {
    clearTokens()
    axiosClient.post.mockResolvedValue({ status: 204 })
    await logout()
    expect(axiosClient.post).toHaveBeenCalledWith('/auth/logout', {}, { skipAuthRedirect: true })
  })

  it('login_ValidCredentials_PostsAndReturnsUser', async () => {
    axiosClient.post.mockResolvedValue({ data: { userId: 7, roles: ['Owner'] } })
    const user = await login('an@example.com', 'Password123456')
    expect(axiosClient.post).toHaveBeenCalledWith(
      '/auth/login',
      { email: 'an@example.com', password: 'Password123456' },
      { skipAuthRedirect: true },
    )
    expect(user).toEqual({ userId: 7, roles: ['Owner'] })
  })

  it('requestPasswordReset_Email_PostsTrimmedEmailWithoutAuthRedirect', async () => {
    axiosClient.post.mockResolvedValue({ data: { maskedEmail: 'a***n@x.co' } })
    await expect(requestPasswordReset(' an@x.co ')).resolves.toEqual({ maskedEmail: 'a***n@x.co' })
    expect(axiosClient.post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'an@x.co' }, { skipAuthRedirect: true })
  })

  it('verifyResetOtp_EmailAndOtp_PostsTrimmedValues', async () => {
    axiosClient.post.mockResolvedValue({ data: { resetToken: 'abc' } })
    await expect(verifyResetOtp(' an@x.co ', ' 123456 ')).resolves.toEqual({ resetToken: 'abc' })
    expect(axiosClient.post).toHaveBeenCalledWith('/auth/forgot-password/verify-otp', { email: 'an@x.co', code: '123456' }, { skipAuthRedirect: true })
  })

  it('resetPassword_Values_PostsOnlyContractFields', async () => {
    axiosClient.post.mockResolvedValue({ data: undefined })
    await resetPassword({ email: ' an@x.co ', resetToken: 't', newPassword: 'a', confirmPassword: 'a', role: 'Admin' })
    expect(axiosClient.post).toHaveBeenCalledWith('/auth/reset-password', { email: 'an@x.co', resetToken: 't', newPassword: 'a', confirmPassword: 'a' }, { skipAuthRedirect: true })
  })

  it('requestPasswordChange_Values_PostsOldPasswordFieldNameOfBackend', async () => {
    axiosClient.post.mockResolvedValue({ data: { challengeId: 'c'.repeat(32), expiresInSeconds: 300, message: 'ok' } })
    await expect(requestPasswordChange({ currentPassword: 'Cu#123456789', newPassword: 'Moi#123456789', confirmPassword: 'Moi#123456789', extra: 'x' })).resolves.toMatchObject({ challengeId: 'c'.repeat(32), expiresInSeconds: 300 })
    expect(axiosClient.post).toHaveBeenCalledWith('/auth/change-password/request', { oldPassword: 'Cu#123456789', newPassword: 'Moi#123456789', confirmPassword: 'Moi#123456789' })
  })

  it('confirmPasswordChange_ChallengeAndCode_PostsTrimmedCode', async () => {
    axiosClient.post.mockResolvedValue({ data: { message: 'ok' } })
    await confirmPasswordChange('c'.repeat(32), ' 123456 ')
    expect(axiosClient.post).toHaveBeenCalledWith('/auth/change-password/confirm', { challengeId: 'c'.repeat(32), code: '123456' })
  })
  it('register_WithPhone_SendsOnlyContractFields', async () => {
    axiosClient.post.mockResolvedValue({ data: { userId: 1 } })
    await register({
      fullName: 'Nguyen Van An',
      email: 'an@example.com',
      phone: '0901234567',
      password: 'Password123456',
      confirmPassword: 'Password123456',
      acceptTerms: true,
    })
    expect(axiosClient.post).toHaveBeenCalledWith(
      '/auth/register',
      {
        fullName: 'Nguyen Van An',
        email: 'an@example.com',
        phone: '0901234567',
        password: 'Password123456',
        confirmPassword: 'Password123456',
      },
      { skipAuthRedirect: true },
    )
  })

  it('register_WithIdentityNumber_SendsNormalizedIdentityNumber', async () => {
    axiosClient.post.mockResolvedValue({ data: { userId: 1 } })
    await register({
      fullName: 'A',
      email: 'a@b.co',
      phone: '',
      identityNumber: ' 079 094 004521 ',
      password: 'x',
      confirmPassword: 'x',
    })
    expect(axiosClient.post.mock.calls[0][1].identityNumber).toBe('079094004521')
  })

  it('register_BlankIdentityNumber_OmitsTheField', async () => {
    axiosClient.post.mockResolvedValue({ data: { userId: 1 } })
    await register({ fullName: 'A', email: 'a@b.co', phone: '', identityNumber: '   ', password: 'x', confirmPassword: 'x' })
    expect(axiosClient.post.mock.calls[0][1]).not.toHaveProperty('identityNumber')
  })

  it('register_EmptyPhone_SendsNullPhone', async () => {
    axiosClient.post.mockResolvedValue({ data: { userId: 1 } })
    await register({ fullName: 'A', email: 'a@b.co', phone: '  ', password: 'x', confirmPassword: 'x' })
    expect(axiosClient.post.mock.calls[0][1].phone).toBeNull()
  })

  it('checkSession_ValidToken_ReturnsProfileFromMe', async () => {
    axiosClient.get.mockResolvedValue({ data: { userId: 5, fullName: 'An', email: 'an@x.co', roles: ['Owner'], status: 'Active' } })
    await expect(checkSession()).resolves.toEqual({ userId: 5, fullName: 'An', email: 'an@x.co', roles: ['Owner'] })
    expect(axiosClient.get).toHaveBeenCalledWith('/auth/me', { skipAuthRedirect: true })
  })

  it('checkSession_Unauthorized_ReturnsNull', async () => {
    axiosClient.get.mockRejectedValue({ status: 401 })
    await expect(checkSession()).resolves.toBeNull()
  })

  it('checkSession_NetworkError_Throws', async () => {
    axiosClient.get.mockRejectedValue({ status: 0 })
    await expect(checkSession()).rejects.toEqual({ status: 0 })
  })
})
