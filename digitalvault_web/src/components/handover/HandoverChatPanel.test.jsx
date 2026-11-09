import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import HandoverChatPanel from './HandoverChatPanel'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const dto = (id, content, extra = {}) => ({ messageId: id, conversationId: 1, senderId: 5, senderName: 'LS. Lê Hoàng Nam', senderRole: 'Executor', content, messageType: 'Text', sentAt: `2026-11-09T10:0${id}:00Z`, ...extra })

function serve(items = [], { onPost } = {}) {
  const store = { items: [...items], posts: [] }
  server.use(
    http.get('*/api/handovers/:requestId/messages', () => HttpResponse.json({ page: 1, pageSize: 50, items: [...store.items].reverse() })),
    http.post('*/api/handovers/:requestId/messages', async ({ request }) => {
      if (onPost) return onPost(request)
      const { content } = await request.json()
      store.posts.push(content)
      const message = dto(store.items.length + 1, content)
      store.items.push(message)
      return HttpResponse.json(message)
    }),
  )
  return store
}

const renderPanel = (props = {}) => render(<HandoverChatPanel requestId={1} currentUserId={5} counterpart="người thẩm định" pollMs={0} {...props} />)
const box = () => screen.getByRole('textbox', { name: 'Nội dung tin nhắn' })

describe('HandoverChatPanel states', () => {
  it('render_WhileLoading_ShowsStatus', async () => {
    serve()
    renderPanel()
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải tin nhắn')
    await screen.findByText(/Chưa có tin nhắn nào/)
  })

  it('render_NoMessages_ShowsEmptyHintWithCounterpart', async () => {
    serve()
    renderPanel()
    expect(await screen.findByText(/Chưa có tin nhắn nào/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Trao đổi hồ sơ bàn giao' })).toHaveTextContent('người thẩm định')
  })

  it('render_LoadFails_ShowsErrorWithRetry', async () => {
    server.use(http.get('*/api/handovers/:requestId/messages', () => HttpResponse.json({ status: 403, detail: 'Bạn không có quyền xem lịch sử tin nhắn của đơn bàn giao này.' }, { status: 403 })))
    renderPanel()
    expect(await screen.findByRole('alert')).toHaveTextContent('không có quyền xem lịch sử')
    serve([dto(1, 'đã có tin')])
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByText('đã có tin')).toBeInTheDocument()
  })
})

describe('HandoverChatPanel messages', () => {
  it('render_Messages_ShowsOldestFirstWithSenderRoleAndOwnLabel', async () => {
    serve([dto(1, 'Em đã nộp giấy tờ'), dto(2, 'Đã nhận, tôi sẽ kiểm tra', { senderId: 6, senderName: 'CCV. Nguyễn Văn Cường', senderRole: 'LegalVerifier' })])
    renderPanel()
    const log = await screen.findByRole('log', { name: 'Tin nhắn' })
    const items = within(log).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Bạn')
    expect(items[0]).toHaveTextContent('Em đã nộp giấy tờ')
    expect(items[1]).toHaveTextContent('CCV. Nguyễn Văn Cường')
    expect(items[1]).toHaveTextContent('Người thẩm định')
    expect(items[1]).not.toHaveTextContent('Bạn')
  })

  it('render_MessageWithLineBreaks_PreservesThemAndNeverInterpretsHtml', async () => {
    serve([dto(1, 'dòng một\n<b>dòng hai</b>')])
    renderPanel()
    const text = await screen.findByText(/dòng một/)
    expect(text.textContent).toBe('dòng một\n<b>dòng hai</b>')
    expect(text.querySelector('b')).toBeNull()
    expect(text).toHaveStyle({ whiteSpace: 'pre-wrap' })
  })
})

describe('HandoverChatPanel sending', () => {
  it('send_ClickSend_PostsTrimmedTextAndClearsTheBox', async () => {
    const store = serve()
    renderPanel()
    await screen.findByText(/Chưa có tin nhắn nào/)
    await userEvent.type(box(), '  Xin chào  ')
    await userEvent.click(screen.getByRole('button', { name: 'Gửi' }))
    expect(await screen.findByText('Xin chào')).toBeInTheDocument()
    expect(store.posts).toEqual(['Xin chào'])
    expect(box()).toHaveValue('')
  })

  it('send_EnterKey_SendsButShiftEnterAddsNewLine', async () => {
    const store = serve()
    renderPanel()
    await screen.findByText(/Chưa có tin nhắn nào/)
    await userEvent.type(box(), 'dòng 1{Shift>}{Enter}{/Shift}dòng 2')
    expect(box()).toHaveValue('dòng 1\ndòng 2')
    await userEvent.type(box(), '{Enter}')
    await screen.findByText(/dòng 1/)
    expect(store.posts).toEqual(['dòng 1\ndòng 2'])
  })

  it('send_EmptyBox_DisablesSendButton', async () => {
    serve()
    renderPanel()
    await screen.findByText(/Chưa có tin nhắn nào/)
    expect(screen.getByRole('button', { name: 'Gửi' })).toBeDisabled()
    await userEvent.type(box(), '   ')
    expect(screen.getByRole('button', { name: 'Gửi' })).toBeDisabled()
  })

  it('send_Fails_ShowsErrorKeepsTextForRetry', async () => {
    serve([], { onPost: () => HttpResponse.json({ status: 403, detail: 'Bạn không có quyền gửi tin nhắn trong đơn bàn giao này.' }, { status: 403 }) })
    renderPanel()
    await screen.findByText(/Chưa có tin nhắn nào/)
    await userEvent.type(box(), 'không gửi được')
    await userEvent.click(screen.getByRole('button', { name: 'Gửi' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('không có quyền gửi')
    expect(box()).toHaveValue('không gửi được')
  })

  it('box_LimitedToBackendMaximumLength', async () => {
    serve()
    renderPanel()
    await screen.findByText(/Chưa có tin nhắn nào/)
    expect(box()).toHaveAttribute('maxlength', '4000')
  })
})
