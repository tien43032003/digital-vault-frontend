import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { clearTokens, getTokens, setTokens } from '../utils/tokenStorage'
import axiosClient, { ApiError, setUnauthorizedHandler, SUBSCRIPTION_EXPIRED_EVENT } from './axiosClient'

// Adapter giả: trả về response hoặc lỗi theo status mong muốn
const okAdapter = (data = {}) => vi.fn((config) => Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config }))
const errorAdapter = (status, data) =>
  vi.fn((config) => {
    const error = new Error(`Request failed with status code ${status}`)
    error.config = config
    error.response = { data, status, headers: {}, config }
    return Promise.reject(error)
  })

describe('axiosClient', () => {
  beforeEach(() => clearTokens())

  afterEach(() => {
    setUnauthorizedHandler(null)
  })

  it('request_PostMethod_AddsVaultHeader', async () => {
    const adapter = okAdapter()
    await axiosClient.post('/auth/login', {}, { adapter })
    expect(adapter.mock.calls[0][0].headers['X-Vault-Request']).toBe('1')
  })

  it('request_GetMethod_DoesNotAddVaultHeader', async () => {
    const adapter = okAdapter()
    await axiosClient.get('/owner/vaults', { adapter })
    expect(adapter.mock.calls[0][0].headers['X-Vault-Request']).toBeUndefined()
  })

  it('request_Always_DoesNotSendCookies', async () => {
    const adapter = okAdapter()
    await axiosClient.get('/owner/vaults', { adapter })
    expect(adapter.mock.calls[0][0].withCredentials).toBeFalsy()
  })

  it('request_NoTokens_DoesNotSendAuthorization', async () => {
    const adapter = okAdapter()
    await axiosClient.get('/owner/vaults', { adapter })
    expect(adapter.mock.calls[0][0].headers.Authorization).toBeUndefined()
  })

  it('request_WithTokens_SendsBearerAccessToken', async () => {
    setTokens({ accessToken: 'abc.def', refreshToken: 'r1' })
    const adapter = okAdapter()
    await axiosClient.get('/owner/vaults', { adapter })
    expect(adapter.mock.calls[0][0].headers.Authorization).toBe('Bearer abc.def')
  })

  it('request_Default_UsesApiBaseUrl', () => {
    expect(axiosClient.defaults.baseURL).toBe('/api')
  })

  it('response_Error_NormalizesDetail', async () => {
    const adapter = errorAdapter(409, { status: 409, detail: 'Email is already registered.' })
    const error = await axiosClient.post('/auth/register', {}, { adapter }).catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(409)
    expect(error.message).toBe('Email is already registered.')
  })

  it('response_ErrorWithReasonCode_KeepsCodeFromEitherField', async () => {
    const viaCode = await axiosClient.post('/x', {}, { adapter: errorAdapter(409, { status: 409, detail: 'a', code: 'PLAN_CHANGE_LOCKED' }) }).catch((e) => e)
    const viaErrorCode = await axiosClient.post('/x', {}, { adapter: errorAdapter(403, { status: 403, detail: 'b', errorCode: 'SUBSCRIPTION_EXPIRED' }) }).catch((e) => e)
    const none = await axiosClient.post('/x', {}, { adapter: errorAdapter(400, { status: 400, detail: 'c' }) }).catch((e) => e)
    expect(viaCode.code).toBe('PLAN_CHANGE_LOCKED')
    expect(viaErrorCode.code).toBe('SUBSCRIPTION_EXPIRED')
    expect(none.code).toBeNull()
  })

  it('response_SubscriptionExpired403_AnnouncesReadOnlyModeAndKeepsFriendlyMessage', async () => {
    const listener = vi.fn()
    window.addEventListener(SUBSCRIPTION_EXPIRED_EVENT, listener)
    const error = await axiosClient.post('/owner/vaults', {}, { adapter: errorAdapter(403, { status: 403, detail: 'Gói dịch vụ đã hết hạn.', code: 'SUBSCRIPTION_EXPIRED' }) }).catch((e) => e)
    window.removeEventListener(SUBSCRIPTION_EXPIRED_EVENT, listener)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(error.code).toBe('SUBSCRIPTION_EXPIRED')
    expect(error.message).toContain('hết hạn')
  })

  it('response_Other403_DoesNotAnnounceReadOnlyMode', async () => {
    const listener = vi.fn()
    window.addEventListener(SUBSCRIPTION_EXPIRED_EVENT, listener)
    await axiosClient.post('/owner/vaults', {}, { adapter: errorAdapter(403, { status: 403, detail: 'Forbidden' }) }).catch((e) => e)
    window.removeEventListener(SUBSCRIPTION_EXPIRED_EVENT, listener)
    expect(listener).not.toHaveBeenCalled()
  })

  it('response_NetworkError_ReturnsStatusZero', async () => {
    const adapter = vi.fn((config) => {
      const error = new Error('Network Error')
      error.config = config
      return Promise.reject(error)
    })
    const error = await axiosClient.get('/owner/vaults', { adapter }).catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(0)
  })

  it('response_401_CallsUnauthorizedHandler', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    const adapter = errorAdapter(401, { status: 401, detail: 'Authentication required.' })
    await axiosClient.get('/owner/vaults', { adapter }).catch(() => {})
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('response_401WithSkipFlag_DoesNotCallUnauthorizedHandler', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    const adapter = errorAdapter(401, { status: 401, detail: 'Invalid credentials or account unavailable.' })
    const error = await axiosClient.post('/auth/login', {}, { adapter, skipAuthRedirect: true }).catch((e) => e)
    expect(handler).not.toHaveBeenCalled()
    expect(error.status).toBe(401)
  })
})

describe('axiosClient token refresh', () => {
  const server = setupServer()
  const handler = vi.fn()
  let vaultCalls
  let refreshCalls

  // BE giả: access token 'old' hết hạn, 'new' hợp lệ; refresh-token đổi 'r-old' lấy cặp mới
  const useBackend = ({ refreshStatus = 200, vaultsAlways401 = false } = {}) => {
    server.use(
      http.get('*/api/owner/vaults', ({ request }) => {
        vaultCalls += 1
        const ok = request.headers.get('Authorization') === 'Bearer new' && !vaultsAlways401
        return ok ? HttpResponse.json([{ vaultId: 1 }]) : HttpResponse.json({ status: 401, detail: 'Authentication required.' }, { status: 401 })
      }),
      http.post('*/api/auth/refresh-token', async ({ request }) => {
        refreshCalls.push(await request.json())
        if (refreshStatus !== 200) return HttpResponse.json({ message: 'RefreshToken đã hết hạn.' }, { status: refreshStatus })
        return HttpResponse.json({ accessToken: 'new', refreshToken: 'r-new', refreshTokenExpiresAt: '2026-10-21T00:00:00Z' })
      }),
    )
  }

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    vaultCalls = 0
    refreshCalls = []
    handler.mockClear()
    setUnauthorizedHandler(handler)
    clearTokens()
    setTokens({ accessToken: 'old', refreshToken: 'r-old' })
  })
  afterEach(() => {
    server.resetHandlers()
    setUnauthorizedHandler(null)
    clearTokens()
  })
  afterAll(() => server.close())

  it('response_401WithRefreshToken_RefreshesAndRetriesOnce', async () => {
    useBackend()
    const { data } = await axiosClient.get('/owner/vaults')
    expect(data).toEqual([{ vaultId: 1 }])
    expect(refreshCalls).toEqual([{ refreshToken: 'r-old' }])
    expect(vaultCalls).toBe(2)
    expect(handler).not.toHaveBeenCalled()
  })

  it('response_RefreshSucceeds_StoresNewTokens', async () => {
    useBackend()
    await axiosClient.get('/owner/vaults')
    expect(getTokens()).toMatchObject({ accessToken: 'new', refreshToken: 'r-new', expiresAt: '2026-10-21T00:00:00Z' })
  })

  it('response_RefreshRequest_SendsVaultHeader', async () => {
    let header
    useBackend()
    server.use(
      http.post('*/api/auth/refresh-token', ({ request }) => {
        header = request.headers.get('X-Vault-Request')
        return HttpResponse.json({ accessToken: 'new', refreshToken: 'r-new' })
      }),
    )
    await axiosClient.get('/owner/vaults')
    expect(header).toBe('1')
  })

  it('response_RefreshRejected_ClearsTokensAndCallsUnauthorizedHandler', async () => {
    useBackend({ refreshStatus: 401 })
    const error = await axiosClient.get('/owner/vaults').catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(401)
    expect(getTokens()).toBeNull()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('response_StillUnauthorizedAfterRefresh_DoesNotLoopAndCallsHandler', async () => {
    useBackend({ vaultsAlways401: true })
    const error = await axiosClient.get('/owner/vaults').catch((e) => e)
    expect(error.status).toBe(401)
    expect(refreshCalls).toHaveLength(1)
    expect(vaultCalls).toBe(2)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('response_ConcurrentUnauthorized_RefreshesOnlyOnce', async () => {
    useBackend()
    const results = await Promise.all([axiosClient.get('/owner/vaults'), axiosClient.get('/owner/vaults'), axiosClient.get('/owner/vaults')])
    expect(results.every((r) => r.status === 200)).toBe(true)
    expect(refreshCalls).toHaveLength(1)
  })

  it('response_401WithoutRefreshToken_SkipsRefreshAndCallsHandler', async () => {
    clearTokens()
    useBackend()
    const error = await axiosClient.get('/owner/vaults').catch((e) => e)
    expect(error.status).toBe(401)
    expect(refreshCalls).toHaveLength(0)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('response_401WithSkipFlagAfterFailedRefresh_StillClearsTokensButNotHandler', async () => {
    useBackend({ refreshStatus: 400 })
    const error = await axiosClient.get('/owner/vaults', { skipAuthRedirect: true }).catch((e) => e)
    expect(error.status).toBe(401)
    expect(getTokens()).toBeNull()
    expect(handler).not.toHaveBeenCalled()
  })

  it('response_401OnRefreshEndpointItself_DoesNotTriggerAnotherRefresh', async () => {
    useBackend({ refreshStatus: 401 })
    await axiosClient.get('/owner/vaults').catch(() => {})
    expect(refreshCalls).toHaveLength(1)
  })
})
