import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { SUBSCRIPTION_EXPIRED_EVENT } from '../callapi/axiosClient'
import { useReadOnlyStatus } from './useReadOnlyStatus'

const server = setupServer()
let calls = 0

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  calls = 0
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const respondWith = (body, status = 200) =>
  server.use(
    http.get('*/api/payments/me/subscription', () => {
      calls += 1
      return HttpResponse.json(body, { status })
    }),
  )

describe('useReadOnlyStatus', () => {
  it('load_BackendSaysReadOnly_ReturnsTrue', async () => {
    respondWith({ hasActiveSubscription: false, isReadOnly: true })
    const { result } = renderHook(() => useReadOnlyStatus())
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('load_ActiveSubscription_ReturnsFalse', async () => {
    respondWith({ hasActiveSubscription: true, isReadOnly: false })
    const { result } = renderHook(() => useReadOnlyStatus())
    await waitFor(() => expect(calls).toBe(1))
    expect(result.current).toBe(false)
  })

  it('load_RequestFails_StaysEditableInsteadOfBlockingTheUser', async () => {
    respondWith({ status: 500, detail: 'Máy chủ đang bận.' }, 500)
    const { result } = renderHook(() => useReadOnlyStatus())
    await waitFor(() => expect(calls).toBe(1))
    expect(result.current).toBe(false)
  })

  it('event_SubscriptionExpiredWhileOpen_SwitchesToReadOnlyWithoutReload', async () => {
    respondWith({ hasActiveSubscription: true, isReadOnly: false })
    const { result } = renderHook(() => useReadOnlyStatus())
    await waitFor(() => expect(calls).toBe(1))
    act(() => {
      window.dispatchEvent(new CustomEvent(SUBSCRIPTION_EXPIRED_EVENT))
    })
    expect(result.current).toBe(true)
  })
})
