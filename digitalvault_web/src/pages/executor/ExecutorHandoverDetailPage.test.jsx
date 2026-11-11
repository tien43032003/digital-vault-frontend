import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { login } from '../../callapi/authApi'
import { createHandover } from '../../callapi/executorApi'
import { ROLE_ACCOUNTS, getDb, resetMockDb } from '../../mocks/db'
import { handlers } from '../../mocks/handlers'
import { renderWithProviders } from '../../test/renderWithProviders'
import ExecutorHandoverDetailPage from './ExecutorHandoverDetailPage'

const server = setupServer(...handlers)
const EXECUTOR = ROLE_ACCOUNTS.find((account) => account.role === 'Executor')

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(async () => {
  resetMockDb()
  await login(EXECUTOR.email, EXECUTOR.password)
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const renderDetail = (requestId, props = {}) =>
  renderWithProviders(<ExecutorHandoverDetailPage mockMode="full" {...props} />, {
    route: `/executor/handovers/${requestId}`,
    path: '/executor/handovers/:requestId',
    extraRoutes: [{ path: '/executor/orders', element: <p>orders-page</p> }],
  })
const waitForDetail = () => screen.findByRole('heading', { level: 1, name: /^HS-/ })

async function createWithStatus(status) {
  const request = await createHandover(1)
  getDb().handovers[0].status = status
  return request.requestId
}

describe('ExecutorHandoverDetailPage loading and errors', () => {
  it('render_WhileFetching_ShowsLoadingStatus', async () => {
    const id = await createWithStatus('Draft')
    renderDetail(id)
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải hồ sơ bàn giao')
    await waitForDetail()
  })

  it('render_UnknownHandover_ShowsNotFoundWithBackLink', async () => {
    renderDetail(999)
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tìm thấy hồ sơ bàn giao.')
    expect(screen.getByRole('link', { name: /Quay lại đơn bàn giao/ })).toHaveAttribute('href', '/executor/orders')
  })

  it('render_ServerError_ShowsMessage', async () => {
    const id = await createWithStatus('Draft')
    server.use(http.get('*/api/executor/handovers/:requestId', () => HttpResponse.json({ status: 500, detail: 'Máy chủ lỗi.' }, { status: 500 })))
    renderDetail(id)
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ lỗi.')
  })
})

describe('ExecutorHandoverDetailPage content', () => {
  it('header_Handover_ShowsIdVaultAndStatus', async () => {
    const id = await createWithStatus('Draft')
    renderDetail(id)
    expect(await waitForDetail()).toHaveTextContent(`-${String(id).padStart(4, "0")}`)
    expect(screen.getByText('Kho #1')).toBeInTheDocument()
    expect(screen.getByText('Bản nháp')).toBeInTheDocument()
  })

  it('cases_Handover_ListsEachAllocationOfTheVault', async () => {
    const id = await createWithStatus('Draft')
    renderDetail(id)
    await waitForDetail()
    const table = screen.getByRole('table', { name: 'Tài sản và người thụ hưởng' })
    expect(within(table).getAllByRole('row').slice(1)).toHaveLength(6)
    expect(within(table).getAllByText('Chờ bàn giao').length).toBeGreaterThan(0)
  })

  it('documents_None_ShowsEmptyMessage', async () => {
    const id = await createWithStatus('Draft')
    renderDetail(id)
    await waitForDetail()
    expect(screen.getByText('Chưa có giấy tờ nào trong hồ sơ.')).toBeInTheDocument()
  })

  it('documents_WithFiles_ListsThemWithDownloadButtons', async () => {
    const id = await createWithStatus('Draft')
    getDb().handovers[0].documents.push({ documentId: 50, fileName: 'GiayChungTu.pdf', fileType: 'application/pdf', purpose: 'DeathCertificate', hasSignature: true })
    renderDetail(id)
    await waitForDetail()
    const list = screen.getByRole('list', { name: 'Giấy tờ của hồ sơ' })
    expect(within(list).getByText('GiayChungTu.pdf')).toBeInTheDocument()
    expect(within(list).getByRole('button', { name: 'Tải về' })).toBeEnabled()
  })
})

describe('ExecutorHandoverDetailPage actions by status', () => {
  it.each([['Draft'], ['Rejected'], ['Additional_Info']])('actions_%s_ShowsEvidenceAndSubmissionForms', async (status) => {
    const id = await createWithStatus(status)
    renderDetail(id)
    await waitForDetail()
    expect(screen.getByRole('region', { name: 'Nộp giấy chứng tử' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Nộp bằng chứng bổ sung' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Gửi thẩm định pháp lý' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Hoàn tất bàn giao' })).not.toBeInTheDocument()
  })

  it('actions_PendingLegal_ShowsWaitingMessageAndNoForms', async () => {
    const id = await createWithStatus('Pending_Legal')
    renderDetail(id)
    await waitForDetail()
    expect(screen.getByText(/Đang chờ người xác minh pháp lý/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Nộp giấy chứng tử' })).not.toBeInTheDocument()
  })

  it('actions_PendingLegalFullMock_OffersApprovalSimulationThatUnlocksStart', async () => {
    const id = await createWithStatus('Pending_Legal')
    renderDetail(id)
    await waitForDetail()
    await userEvent.click(screen.getByRole('button', { name: 'Mô phỏng người xác minh duyệt hồ sơ' }))
    expect(await screen.findByRole('button', { name: 'Bắt đầu bàn giao' })).toBeEnabled()
    expect(screen.getByText('Đã duyệt pháp lý')).toBeInTheDocument()
  })

  it('actions_PendingLegalHybrid_HasNoApprovalSimulation', async () => {
    const id = await createWithStatus('Pending_Legal')
    renderDetail(id, { mockMode: 'hybrid' })
    await waitForDetail()
    expect(screen.queryByRole('button', { name: /Mô phỏng người xác minh/ })).not.toBeInTheDocument()
  })

  it('actions_Approved_StartMovesToInProgressAndShowsCompletionForm', async () => {
    const id = await createWithStatus('Approved')
    renderDetail(id)
    await waitForDetail()
    await userEvent.click(screen.getByRole('button', { name: 'Bắt đầu bàn giao' }))
    expect(await screen.findByRole('region', { name: 'Hoàn tất bàn giao' })).toBeInTheDocument()
    expect(screen.getByText('Đang bàn giao')).toBeInTheDocument()
    expect(screen.getByText('Đã bắt đầu bàn giao')).toBeInTheDocument()
  })

  it('actions_StartRejectedByServer_ShowsAlert', async () => {
    const id = await createWithStatus('Approved')
    server.use(http.post('*/api/executor/handovers/:requestId/start', () => HttpResponse.json({ status: 409, detail: 'x' }, { status: 409 })))
    renderDetail(id)
    await waitForDetail()
    await userEvent.click(screen.getByRole('button', { name: 'Bắt đầu bàn giao' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Hồ sơ chưa ở trạng thái phù hợp')
  })

  it('actions_InProgress_ShowsCompletionFormOnly', async () => {
    const id = await createWithStatus('In_Progress')
    renderDetail(id)
    await waitForDetail()
    expect(screen.getByRole('region', { name: 'Hoàn tất bàn giao' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bắt đầu bàn giao' })).not.toBeInTheDocument()
  })

  it.each([['Completed', 'Hồ sơ đã hoàn tất'], ['Cancelled', 'Hồ sơ đã bị hủy']])('actions_%s_IsReadOnly', async (status, message) => {
    const id = await createWithStatus(status)
    renderDetail(id)
    await waitForDetail()
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Hoàn tất bàn giao' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Nộp giấy chứng tử' })).not.toBeInTheDocument()
  })
})

describe('ExecutorHandoverDetailPage document download', () => {
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL
  let clicked

  beforeEach(() => {
    clicked = []
    URL.createObjectURL = vi.fn(() => 'blob:doc')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      clicked.push(this.download)
    })
  })

  afterEach(() => {
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
    vi.restoreAllMocks()
  })

  async function openWithDocument(hasSignature) {
    const id = await createWithStatus('Draft')
    getDb().handovers[0].documents.push({ documentId: 50, fileName: 'GiayChungTu.pdf', fileType: 'application/pdf', purpose: 'DeathCertificate', hasSignature })
    renderDetail(id)
    await waitForDetail()
    await userEvent.click(within(screen.getByRole('list', { name: 'Giấy tờ của hồ sơ' })).getByRole('button', { name: 'Tải về' }))
  }

  it('download_Clicked_SavesFileWithItsNameAndShowsToast', async () => {
    await openWithDocument(true)
    expect(await screen.findByText('Đã tải xuống GiayChungTu.pdf')).toBeInTheDocument()
    expect(clicked).toEqual(['GiayChungTu.pdf'])
  })

  it('download_NoValidSignature_WarnsInTheToast', async () => {
    await openWithDocument(false)
    expect(await screen.findByText(/chưa có chữ ký hợp lệ/i)).toBeInTheDocument()
  })

  it('download_ServerError_ShowsAlertAndDoesNotSaveFile', async () => {
    server.use(http.get('*/api/executor/handovers/:requestId/documents/:documentId/content', () => HttpResponse.json({ status: 500, detail: 'Kho lưu trữ bận.' }, { status: 500 })))
    await openWithDocument(true)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không tải được GiayChungTu.pdf'))
    expect(clicked).toEqual([])
  })
})

describe('ExecutorHandoverDetailPage chat', () => {
  it.each(['Pending_Legal', 'Additional_Info', 'Approved', 'In_Progress', 'Completed', 'Rejected'])('chat_StatusWithLegalReview_ShowsPanel', async (status) => {
    const id = await createWithStatus(status)
    renderDetail(id)
    await waitForDetail()
    expect(await screen.findByRole('region', { name: 'Trao đổi hồ sơ bàn giao' })).toBeInTheDocument()
  })

  it.each(['Draft', 'Pending_Executor', 'Declined'])('chat_StatusBeforeLegalReview_HidesPanel', async (status) => {
    const id = await createWithStatus(status)
    renderDetail(id)
    await waitForDetail()
    expect(screen.queryByRole('region', { name: 'Trao đổi hồ sơ bàn giao' })).not.toBeInTheDocument()
  })

  it('chat_Panel_ShowsMessagesAndSendsNewOne', async () => {
    const id = await createWithStatus('Pending_Legal')
    sessionStorage.setItem('aeterna.user', JSON.stringify({ userId: EXECUTOR.userId, roles: ['Executor'], email: EXECUTOR.email }))
    renderDetail(id)
    await waitForDetail()
    const panel = await screen.findByRole('region', { name: 'Trao đổi hồ sơ bàn giao' })
    await screen.findByText(/Chưa có tin nhắn nào/)
    await userEvent.type(within(panel).getByRole('textbox', { name: 'Nội dung tin nhắn' }), 'Đã bổ sung giấy tờ')
    await userEvent.click(within(panel).getByRole('button', { name: 'Gửi' }))
    expect(await within(panel).findByText('Đã bổ sung giấy tờ')).toBeInTheDocument()
    expect(within(panel).getByText('Bạn')).toBeInTheDocument()
  })
})
