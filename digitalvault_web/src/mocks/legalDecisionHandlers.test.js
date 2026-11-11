// @vitest-environment node
// Chạy trong môi trường Node: jsdom làm File bị gửi thành chuỗi nên không test được multipart thật qua XHR của jsdom
import { setupServer } from 'msw/node'
import axiosClient from '../callapi/axiosClient'
import { approveLegalHandover, rejectLegalHandover } from '../callapi/legalApi'
import { getDb, resetMockDb, ROLE_ACCOUNTS } from './db'
import { handlers } from './handlers'

function memoryStorage() {
  const data = new Map()
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
  }
}
globalThis.sessionStorage = memoryStorage()
globalThis.localStorage = memoryStorage()
axiosClient.defaults.baseURL = 'http://localhost/api'

const server = setupServer(...handlers)
const verifier = ROLE_ACCOUNTS.find((account) => account.role === 'LegalVerifier')

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(async () => {
  resetMockDb()
  await axiosClient.post('/auth/login', { email: verifier.email, password: verifier.password })
  getDb().handovers = [{ requestId: 501, vaultId: 1, status: 'Pending_Legal', initiatedAt: '2026-11-01T10:00:00' }]
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const files = () => ({ file: new File(['quyết định'], 'qd.pdf', { type: 'application/pdf' }), signature: new File([new Uint8Array(64)], 'qd.sig') })

describe('mock legal decision (multipart)', () => {
  it('approve_FileSignatureAndComment_ReturnsApprovedReview', async () => {
    const review = await approveLegalHandover(501, { comment: 'Đủ căn cứ', ...files() })
    expect(review).toMatchObject({ requestId: 501, status: 'Approved', comment: 'Đủ căn cứ' })
  })

  it('reject_FileSignatureAndComment_ReturnsRejectedReview', async () => {
    const review = await rejectLegalHandover(501, { comment: 'Thiếu giấy tờ', ...files() })
    expect(review).toMatchObject({ requestId: 501, status: 'Rejected', comment: 'Thiếu giấy tờ' })
  })

  it.each([
    ['approve', approveLegalHandover],
    ['reject', rejectLegalHandover],
  ])('%s_MissingSignature_Returns400', async (_name, call) => {
    const { file } = files()
    await expect(call(501, { comment: 'x', file, signature: null })).rejects.toMatchObject({ status: 400 })
  })

  it('approve_JsonBodyInsteadOfMultipart_Returns400', async () => {
    await expect(axiosClient.post('/legal/handovers/501/approve', { comment: 'x' })).rejects.toMatchObject({ status: 400 })
  })
})
