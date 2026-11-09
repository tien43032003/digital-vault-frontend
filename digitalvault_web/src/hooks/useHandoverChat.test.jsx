import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { useHandoverChat } from './useHandoverChat'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const dto = (id, content, extra = {}) => ({ messageId: id, conversationId: 1, senderId: 5, senderName: 'LS. Lê Hoàng Nam', senderRole: 'Executor', content, messageType: 'Text', sentAt: `2026-11-09T10:0${id}:00Z`, ...extra })

// store.items: tin nhắn lưu ở "máy chủ" theo thứ tự cũ trước mới sau; trả về mới nhất trước như BE
function serve(store, { onGet, onPost } = {}) {
  server.use(
    http.get('*/api/handovers/:requestId/messages', () => {
      onGet?.()
      return HttpResponse.json({ page: 1, pageSize: 50, items: [...store.items].reverse() })
    }),
    http.post('*/api/handovers/:requestId/messages', async ({ request }) => {
      if (onPost) return onPost(request)
      const { content } = await request.json()
      const message = dto(store.items.length + 1, content)
      store.items.push(message)
      return HttpResponse.json(message)
    }),
  )
}

const render = (props = {}) => renderHook(() => useHandoverChat(1, { pollMs: 25, ...props }))

describe('useHandoverChat', () => {
  it('load_ExistingMessages_ReturnsThemOldestFirstAndReady', async () => {
    serve({ items: [dto(1, 'một'), dto(2, 'hai')] })
    const { result } = render()
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.messages.map((item) => item.content)).toEqual(['một', 'hai'])
  })

  it('load_ApiFails_ReturnsErrorStatusWithMessageAndRetryWorks', async () => {
    server.use(http.get('*/api/handovers/:requestId/messages', () => HttpResponse.json({ status: 403, detail: 'Bạn không có quyền xem lịch sử tin nhắn của đơn bàn giao này.' }, { status: 403 })))
    const { result } = render({ pollMs: 0 })
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toContain('không có quyền')
    serve({ items: [dto(1, 'một')] })
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.messages).toHaveLength(1)
  })

  it('poll_OtherSideSendsMessage_AppearsWithoutReload', async () => {
    const store = { items: [dto(1, 'một')] }
    serve(store)
    const { result } = render()
    await waitFor(() => expect(result.current.messages).toHaveLength(1))
    store.items.push(dto(2, 'người thẩm định trả lời', { senderId: 6, senderRole: 'LegalVerifier' }))
    await waitFor(() => expect(result.current.messages.map((item) => item.content)).toEqual(['một', 'người thẩm định trả lời']))
  })

  it('poll_NothingNew_KeepsSameMessagesArrayInstance', async () => {
    let gets = 0
    serve({ items: [dto(1, 'một')] }, { onGet: () => (gets += 1) })
    const { result } = render()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const first = result.current.messages
    await waitFor(() => expect(gets).toBeGreaterThanOrEqual(3))
    expect(result.current.messages).toBe(first)
  })

  it('poll_RequestFailsAfterLoading_KeepsMessagesAndStaysReady', async () => {
    const store = { items: [dto(1, 'một')] }
    serve(store)
    const { result } = render()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    server.use(http.get('*/api/handovers/:requestId/messages', () => HttpResponse.json({ status: 500, detail: 'bận' }, { status: 500 })))
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(result.current.status).toBe('ready')
    expect(result.current.messages).toHaveLength(1)
  })

  it('send_Success_AddsMessageOnceEvenIfPollingReturnsItToo', async () => {
    const store = { items: [] }
    serve(store)
    const { result } = render()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(async () => {
      await result.current.send('  chào bạn  ')
    })
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(result.current.messages.map((item) => item.content)).toEqual(['chào bạn'])
    expect(result.current.sendError).toBe('')
  })

  it('send_Fails_ShowsErrorAndDoesNotAddMessage', async () => {
    serve({ items: [] }, { onPost: () => HttpResponse.json({ status: 403, detail: 'Bạn không có quyền gửi tin nhắn trong đơn bàn giao này.' }, { status: 403 }) })
    const { result } = render({ pollMs: 0 })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    let sent
    await act(async () => {
      sent = await result.current.send('xin chào')
    })
    expect(sent).toBe(false)
    expect(result.current.sendError).toContain('không có quyền gửi')
    expect(result.current.messages).toHaveLength(0)
    expect(result.current.sending).toBe(false)
  })

  it('send_BlankContent_IsIgnoredWithoutCallingApi', async () => {
    let posts = 0
    serve({ items: [] }, { onPost: () => { posts += 1; return HttpResponse.json({}) } })
    const { result } = render({ pollMs: 0 })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    let sent
    await act(async () => {
      sent = await result.current.send('   ')
    })
    expect(sent).toBe(false)
    expect(posts).toBe(0)
  })

  it('unmount_StopsPolling', async () => {
    let gets = 0
    serve({ items: [dto(1, 'một')] }, { onGet: () => (gets += 1) })
    const { result, unmount } = render()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    unmount()
    const after = gets
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(gets - after).toBeLessThanOrEqual(1)
  })
})
