import { setupServer } from 'msw/node'
import { login } from '../callapi/authApi'
import { getHandoverMessages, sendHandoverMessage } from '../callapi/chatApi'
import { DEMO_ACCOUNT, ROLE_ACCOUNTS, resetMockDb } from './db'
import { handlers } from './handlers'

const server = setupServer(...handlers)
const executor = ROLE_ACCOUNTS.find((account) => account.role === 'Executor')
const verifier = ROLE_ACCOUNTS.find((account) => account.role === 'LegalVerifier')

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => resetMockDb())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const rejection = (promise) => promise.then(() => null, (error) => error)

describe('mock handover chat', () => {
  it('getMessages_NoMessagesYet_ReturnsEmptyPage', async () => {
    await login(executor.email, executor.password)
    expect(await getHandoverMessages(1)).toEqual({ page: 1, pageSize: 50, items: [] })
  })

  it('send_ThenGet_ReturnsMessageWithSenderInfoAndNormalizedFields', async () => {
    await login(executor.email, executor.password)
    const sent = await sendHandoverMessage(1, '  Em đã nộp thêm giấy tờ  ')
    expect(sent).toMatchObject({ senderId: executor.userId, senderName: executor.fullName, senderRole: 'Executor', content: 'Em đã nộp thêm giấy tờ', messageType: 'Text' })
    expect(typeof sent.messageId).toBe('number')
    expect(sent.createdAt).toEqual(expect.any(String))
    const page = await getHandoverMessages(1)
    expect(page.items.map((item) => item.content)).toEqual(['Em đã nộp thêm giấy tờ'])
  })

  it('getMessages_TwoParticipants_BothSeeTheSameConversationNewestFirst', async () => {
    await login(executor.email, executor.password)
    await sendHandoverMessage(1, 'Câu hỏi từ Executor')
    await login(verifier.email, verifier.password)
    await sendHandoverMessage(1, 'Trả lời từ người thẩm định')
    const page = await getHandoverMessages(1)
    expect(page.items.map((item) => item.content)).toEqual(['Trả lời từ người thẩm định', 'Câu hỏi từ Executor'])
    expect(page.items[0].senderRole).toBe('LegalVerifier')
  })

  it('getMessages_OtherHandover_StaysSeparate', async () => {
    await login(executor.email, executor.password)
    await sendHandoverMessage(1, 'Chỉ ở hồ sơ 1')
    expect((await getHandoverMessages(2)).items).toEqual([])
  })

  it('getMessages_Paging_ReturnsRequestedSlice', async () => {
    await login(executor.email, executor.password)
    for (const text of ['một', 'hai', 'ba']) await sendHandoverMessage(1, text)
    const page = await getHandoverMessages(1, { page: 2, pageSize: 2 })
    expect(page.items.map((item) => item.content)).toEqual(['một'])
    expect(page.page).toBe(2)
  })

  it('chat_OwnerAccount_GetsForbiddenOnBothEndpoints', async () => {
    await login(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password)
    expect((await rejection(getHandoverMessages(1))).status).toBe(403)
    expect((await rejection(sendHandoverMessage(1, 'xin chào'))).status).toBe(403)
  })

  it('chat_NotLoggedIn_Returns401', async () => {
    sessionStorage.clear()
    localStorage.clear()
    expect((await rejection(getHandoverMessages(1))).status).toBe(401)
  })

  it('send_EmptyOrTooLongContent_Returns400', async () => {
    await login(executor.email, executor.password)
    expect((await rejection(sendHandoverMessage(1, '   '))).status).toBe(400)
    expect((await rejection(sendHandoverMessage(1, 'x'.repeat(4001)))).status).toBe(400)
    expect((await sendHandoverMessage(1, 'x'.repeat(4000))).content).toHaveLength(4000)
  })

  it('getMessages_PageSizeAboveHundred_Returns400', async () => {
    await login(executor.email, executor.password)
    expect((await rejection(getHandoverMessages(1, { pageSize: 101 }))).status).toBe(400)
  })
})
