import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { login } from '../../callapi/authApi'
import { createHandover } from '../../callapi/executorApi'
import { createPendingRequest } from '../../test/pendingRequest'
import { handoverCode } from '../../utils/handover'
import { DEMO_ACCOUNT, ROLE_ACCOUNTS, getDb, resetMockDb } from '../../mocks/db'
import { handlers } from '../../mocks/handlers'
import { renderWithProviders } from '../../test/renderWithProviders'
import ExecutorOrdersPage from './ExecutorOrdersPage'

const server = setupServer(...handlers)
const EXECUTOR = ROLE_ACCOUNTS.find((account) => account.role === 'Executor')

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(async () => {
  resetMockDb()
  await login(EXECUTOR.email, EXECUTOR.password)
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const renderPage = (props = {}) =>
  renderWithProviders(<ExecutorOrdersPage mockMode="full" {...props} />, {
    extraRoutes: [{ path: '/executor/handovers/:requestId', element: <p>handover-detail-page</p> }],
  })
const waitForPage = () => screen.findByRole('heading', { level: 1, name: 'Đơn bàn giao di sản' })

describe('ExecutorOrdersPage loading and error', () => {
  it('render_WhileFetching_ShowsLoadingStatus', async () => {
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải đơn bàn giao')
    await waitForPage()
  })

  it('render_ApiFails_ShowsErrorWithRetry', async () => {
    server.use(http.get('*/api/executor/assignments', () => HttpResponse.json({ status: 500, detail: 'Máy chủ đang bận.' }, { status: 500 })))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ đang bận.')
    server.resetHandlers()
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await waitForPage()).toBeInTheDocument()
  })

  it('render_FullMock_ShowsMockNotice', async () => {
    renderPage({ mockMode: 'full' })
    await waitForPage()
    expect(screen.getByRole('note')).toHaveTextContent('Dữ liệu mô phỏng')
  })

  it('render_HybridMode_HasNoMockNoticeBecauseBackendIsReal', async () => {
    renderPage({ mockMode: 'hybrid' })
    await waitForPage()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})

describe('ExecutorOrdersPage assignments', () => {
  it('assignments_Assigned_ShowsVaultWithStatusAndCreateButton', async () => {
    renderPage()
    await waitForPage()
    const section = screen.getByRole('region', { name: 'Kho được phân công' })
    expect(await within(section).findByText('Kho #1')).toBeInTheDocument()
    expect(section).toHaveTextContent('Đang hiệu lực')
    expect(within(section).getByRole('button', { name: 'Tạo hồ sơ bàn giao' })).toBeEnabled()
  })

  it('assignments_None_ShowsEmptyMessage', async () => {
    getDb().executorAssignments[1].executorId = 22
    renderPage()
    await waitForPage()
    expect(screen.getByText('Bạn chưa được phân công kho nào.')).toBeInTheDocument()
  })

  it('create_Clicked_CreatesDraftAndOpensItsDetail', async () => {
    renderPage()
    await waitForPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Tạo hồ sơ bàn giao' }))
    expect(await screen.findByText('handover-detail-page')).toBeInTheDocument()
    expect(getDb().handovers).toHaveLength(1)
  })

  it('create_VaultAlreadyHasOpenHandover_ShowsViewLinkInsteadOfCreateButton', async () => {
    const request = await createHandover(1)
    renderPage()
    await waitForPage()
    const section = screen.getByRole('region', { name: 'Kho được phân công' })
    expect(await within(section).findByRole('link', { name: 'Xem hồ sơ' })).toHaveAttribute('href', `/executor/handovers/${request.requestId}`)
    expect(within(section).queryByRole('button', { name: 'Tạo hồ sơ bàn giao' })).not.toBeInTheDocument()
  })

  it('create_ServerConflict_ShowsReadableError', async () => {
    server.use(http.post('*/api/executor/assignments/:vaultId/handovers', () => HttpResponse.json({ status: 409, detail: 'x' }, { status: 409 })))
    renderPage()
    await waitForPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Tạo hồ sơ bàn giao' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Kho này đã có hồ sơ bàn giao đang xử lý hoặc chưa có tài sản nào được phân bổ.')
  })

  it('create_NotAssigned403_ShowsReadableError', async () => {
    server.use(http.post('*/api/executor/assignments/:vaultId/handovers', () => HttpResponse.json({ status: 403, detail: 'x' }, { status: 403 })))
    renderPage()
    await waitForPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Tạo hồ sơ bàn giao' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn không được phân công kho này.')
  })

  it('create_ServerDown503_ShowsNoExecutorOrServerError', async () => {
    server.use(http.post('*/api/executor/assignments/:vaultId/handovers', () => HttpResponse.json({ status: 503, detail: 'Không có Executor phù hợp.' }, { status: 503 })))
    renderPage()
    await waitForPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Tạo hồ sơ bàn giao' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Không có Executor phù hợp.')
  })
})

describe('ExecutorOrdersPage accept / decline pending handover', () => {
  // Hồ sơ do chủ kho giao như thật: kho đủ giấy tờ, 100% phân bổ, Pending_Executor (rồi đăng nhập lại bằng Executor)
  const pendingRequest = () => createPendingRequest()
  const section = () => screen.getByRole('region', { name: 'Kho được phân công' })

  it('pending_Handover_ShowsAcceptAndDeclineButtonsNotCreate', async () => {
    const request = await pendingRequest()
    renderPage()
    await waitForPage()
    expect(await within(section()).findByRole('button', { name: 'Duyệt' })).toBeEnabled()
    expect(within(section()).getByRole('button', { name: 'Từ chối' })).toBeEnabled()
    expect(within(section()).getByRole('link', { name: 'Xem hồ sơ' })).toHaveAttribute('href', `/executor/handovers/${request.requestId}`)
    expect(section()).toHaveTextContent('đang chờ bạn tiếp nhận')
    // Kho có hồ sơ chờ tiếp nhận chỉ có Xem/Duyệt/Từ chối, không có nút tạo hồ sơ
    const row = within(section()).getByText(`Kho #${request.vaultId}`).closest('li')
    expect(within(row).queryByRole('button', { name: 'Tạo hồ sơ bàn giao' })).not.toBeInTheDocument()
  })

  it('pending_DraftHandover_HasNoAcceptDeclineButtons', async () => {
    await createHandover(1)
    renderPage()
    await waitForPage()
    await within(section()).findByRole('link', { name: 'Xem hồ sơ' })
    expect(within(section()).queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument()
    expect(within(section()).queryByRole('button', { name: 'Từ chối' })).not.toBeInTheDocument()
  })

  it('accept_Clicked_AcceptsAndOpensHandoverDetail', async () => {
    const request = await pendingRequest()
    renderPage()
    await waitForPage()
    await userEvent.click(await within(section()).findByRole('button', { name: 'Duyệt' }))
    expect(await screen.findByText('handover-detail-page')).toBeInTheDocument()
    expect(getDb().handovers.find((item) => item.requestId === request.requestId).status).toBe('Draft')
  })

  it('accept_ServerConflict_ShowsReadableErrorAndStaysOnPage', async () => {
    await pendingRequest()
    server.use(http.post('*/api/executor/handovers/:requestId/accept', () => HttpResponse.json({ status: 409, detail: 'x' }, { status: 409 })))
    renderPage()
    await waitForPage()
    await userEvent.click(await within(section()).findByRole('button', { name: 'Duyệt' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('handover-detail-page')).not.toBeInTheDocument()
  })

  it('decline_NeedsReason_ThenDeclinesAndNotifiesOwner', async () => {
    const request = await pendingRequest()
    renderPage()
    await waitForPage()
    await userEvent.click(await within(section()).findByRole('button', { name: 'Từ chối' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận từ chối' }))
    expect(getDb().handovers.find((item) => item.requestId === request.requestId).status).toBe('Pending_Executor')
    await userEvent.type(within(dialog).getByLabelText(/Lý do từ chối/), 'Tôi không thể tiếp nhận hồ sơ này')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận từ chối' }))
    expect(await screen.findByText('Đã từ chối hồ sơ')).toBeInTheDocument()
    expect(getDb().handovers.find((item) => item.requestId === request.requestId)).toMatchObject({ status: 'Declined', declineReason: 'Tôi không thể tiếp nhận hồ sơ này' })
    expect(getDb().notifications.some((note) => note.title === 'Executor declined handover')).toBe(true)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('decline_ServerError_KeepsDialogOpenWithMessage', async () => {
    await pendingRequest()
    server.use(http.post('*/api/executor/handovers/:requestId/decline', () => HttpResponse.json({ status: 403, detail: 'x' }, { status: 403 })))
    renderPage()
    await waitForPage()
    await userEvent.click(await within(section()).findByRole('button', { name: 'Từ chối' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/Lý do từ chối/), 'Không thể nhận')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận từ chối' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Bạn không có quyền xử lý hồ sơ này.')
  })
})

describe('ExecutorOrdersPage handover table', () => {
  it('table_NoHandovers_ShowsEmptyMessage', async () => {
    renderPage()
    await waitForPage()
    expect(screen.getByText('Chưa có hồ sơ bàn giao nào.')).toBeInTheDocument()
  })

  it('table_WithHandover_ShowsRowWithStatusVaultAndLink', async () => {
    const request = await createHandover(1)
    renderPage()
    await waitForPage()
    const table = await screen.findByRole('table', { name: 'Danh sách hồ sơ bàn giao' })
    const row = within(table).getByRole('row', { name: /HS-/ })
    expect(within(row).getByRole('link', { name: handoverCode(request) })).toHaveAttribute('href', `/executor/handovers/${request.requestId}`)
    expect(row).toHaveTextContent('Kho #1')
    expect(row).toHaveTextContent('Bản nháp')
    expect(row).toHaveTextContent('4 tài sản')
  })

  it('table_SeveralHandovers_AreSortedNewestFirst', async () => {
    const first = await createHandover(1)
    getDb().handovers[0].status = 'Cancelled'
    const second = await createHandover(1)
    renderPage()
    await waitForPage()
    const table = await screen.findByRole('table', { name: 'Danh sách hồ sơ bàn giao' })
    const links = within(table)
      .getAllByRole('link')
      .map((link) => link.textContent)
      .filter((text) => text.startsWith('HS-'))
    expect(links).toEqual([handoverCode(second), handoverCode(first)])
  })

  it('role_OwnerAccount_ShowsErrorBecauseBackendRejectsRole', async () => {
    await login(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password)
    renderPage()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
