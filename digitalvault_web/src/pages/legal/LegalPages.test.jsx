import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import { login } from '../../callapi/authApi'
import { approveLegalHandover, rejectLegalHandover } from '../../callapi/legalApi'
import { getDb, resetMockDb, ROLE_ACCOUNTS } from '../../mocks/db'
import { handlers } from '../../mocks/handlers'
import { renderWithProviders } from '../../test/renderWithProviders'
import LegalHandoverDetailPage from './LegalHandoverDetailPage'
import LegalHandoverListPage from './LegalHandoverListPage'

// jsdom làm File bị gửi thành chuỗi qua XHR nên không đi được multipart thật: mock hai hàm gửi quyết định (mock handler có test riêng ở môi trường Node)
vi.mock('../../callapi/legalApi', async (importOriginal) => ({ ...(await importOriginal()), approveLegalHandover: vi.fn(), rejectLegalHandover: vi.fn() }))

const server = setupServer(...handlers)
const reviewDto = (requestId, status, comment) => ({ verificationId: 1, requestId, verifierId: 1, status, comment, submittedAt: '2026-11-01T10:00:00', reviewedAt: '2026-11-01T11:00:00' })
const VERIFIER = ROLE_ACCOUNTS.find((account) => account.role === 'LegalVerifier')

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(async () => {
  resetMockDb()
  await login(VERIFIER.email, VERIFIER.password)
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function seedHandover(status = 'Pending_Legal', overrides = {}) {
  const db = getDb()
  const requestId = (db.handovers?.length || 0) + 1
  const item = {
    requestId,
    vaultId: 1,
    requestType: 'Standard',
    status,
    initiatedAt: new Date().toISOString(),
    documents: [
      {
        documentId: 101,
        fileName: 'Giay_Chung_Tu.pdf',
        fileType: 'application/pdf',
        isEncrypted: true,
        signatureValid: true,
      },
    ],
    assetDocuments: [
      {
        documentId: 201,
        fileName: 'So_Do_Dat.pdf',
        fileType: 'application/pdf',
        isEncrypted: true,
      },
    ],
    cases: [
      {
        handoverId: 1,
        assetId: 1,
        beneficiaryId: 1,
        status: 'Pending',
      },
    ],
    ...overrides,
  }
  db.handovers = [...(db.handovers || []), item]
  return item
}

describe('LegalHandoverListPage', () => {
  it('renders title and empty message when no items', async () => {
    renderWithProviders(<LegalHandoverListPage status="Pending_Legal" emptyMessage="Không có hồ sơ nào" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Hồ sơ chờ thẩm định' })).toBeInTheDocument()
    expect(await screen.findByText('Không có hồ sơ nào')).toBeInTheDocument()
  })

  it('renders handovers and links to detail', async () => {
    seedHandover('Pending_Legal')
    renderWithProviders(
      <LegalHandoverListPage status="Pending_Legal" />,
      {
        extraRoutes: [{ path: '/verifier/handovers/:requestId', element: <p>detail-page</p> }],
      },
    )

    expect(await screen.findByText(/^HS-\d{4}-0001$/)).toBeInTheDocument()
    expect(screen.getByText('Kho #1')).toBeInTheDocument()

    const viewLink = screen.getByRole('link', { name: /Xem/i })
    expect(viewLink).toHaveAttribute('href', '/verifier/handovers/1')
  })
})

describe('LegalHandoverListPage - tab Đã duyệt gộp nhiều trạng thái', () => {
  it('statuses_ApprovedInProgressCompleted_ShowsReviewedHandoversButNotOthers', async () => {
    seedHandover('Approved')
    seedHandover('In_Progress')
    seedHandover('Completed')
    seedHandover('Draft')
    seedHandover('Pending_Legal')
    renderWithProviders(<LegalHandoverListPage statuses={['Approved', 'In_Progress', 'Completed']} />, {
      extraRoutes: [{ path: '/verifier/handovers/:requestId', element: <p>detail-page</p> }],
    })
    expect(await screen.findByText(/^HS-\d{4}-0001$/)).toBeInTheDocument()
    expect(screen.getByText(/^HS-\d{4}-0002$/)).toBeInTheDocument()
    expect(screen.getByText(/^HS-\d{4}-0003$/)).toBeInTheDocument()
    expect(screen.queryByText(/^HS-\d{4}-0004$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^HS-\d{4}-0005$/)).not.toBeInTheDocument()
  })
})

describe('LegalHandoverDetailPage', () => {
  const renderDetail = (requestId) =>
    renderWithProviders(<LegalHandoverDetailPage />, {
      route: `/verifier/handovers/${requestId}`,
      path: '/verifier/handovers/:requestId',
      extraRoutes: [{ path: '/verifier/pending', element: <p>pending-list</p> }],
    })

  it('shows not found when invalid id', async () => {
    renderDetail(999)
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tìm thấy hồ sơ bàn giao.')
  })

  it('renders detail info, documents and allows review when Pending_Legal', async () => {
    const item = seedHandover('Pending_Legal')
    renderDetail(item.requestId)

    expect(await screen.findByRole('heading', { level: 1, name: new RegExp(`^HS-\\d{4}-${String(item.requestId).padStart(4, "0")}( · |$)`) })).toBeInTheDocument()
    expect(screen.getByText('Giay_Chung_Tu.pdf')).toBeInTheDocument()
    expect(screen.getByText('So_Do_Dat.pdf')).toBeInTheDocument()

    // Hai nút hành động: Duyệt, và nút gộp Từ chối / Yêu cầu bổ sung
    const approveBtn = screen.getByRole('button', { name: /Duyệt hồ sơ/i })
    const rejectBtn = screen.getByRole('button', { name: 'Từ chối / Yêu cầu bổ sung' })

    expect(approveBtn).not.toBeDisabled()
    expect(rejectBtn).not.toBeDisabled()
    expect(screen.queryByRole('button', { name: /Yêu cầu bổ sung thông tin/i })).not.toBeInTheDocument()
  })

  it('disables review action buttons when status is not Pending_Legal and not yet decided', async () => {
    const item = seedHandover('Draft')
    renderDetail(item.requestId)

    expect(await screen.findByRole('heading', { level: 1, name: new RegExp(`^HS-\\d{4}-${String(item.requestId).padStart(4, "0")}( · |$)`) })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Duyệt hồ sơ/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Từ chối/i })).toBeDisabled()
    expect(screen.getByText(/Chỉ những hồ sơ ở trạng thái/i)).toBeInTheDocument()
  })

  it.each([['In_Progress'], ['Completed']])('status%s_ShowsReviewedOutcomeInsteadOfWarning', async (status) => {
    const item = seedHandover(status)
    renderDetail(item.requestId)
    await screen.findByRole('heading', { level: 1, name: new RegExp(`^HS-\\d{4}-${String(item.requestId).padStart(4, '0')}( · |$)`) })
    expect(screen.getByText('Kết quả thẩm định:')).toBeInTheDocument()
    expect(screen.queryByText(/Chỉ những hồ sơ ở trạng thái/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Duyệt hồ sơ/i })).not.toBeInTheDocument()
  })

  it('replaces the action buttons with the review outcome once the handover is decided', async () => {
    const item = seedHandover('Approved')
    renderDetail(item.requestId)

    expect(await screen.findByRole('heading', { level: 1, name: new RegExp(`^HS-\\d{4}-${String(item.requestId).padStart(4, "0")}( · |$)`) })).toBeInTheDocument()
    expect(screen.getByText('Kết quả thẩm định:')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Duyệt hồ sơ/i })).not.toBeInTheDocument()
  })

  it('opens review modal, validates comment length 1-2000 chars, and submits approve', async () => {
    const item = seedHandover('Pending_Legal')
    renderDetail(item.requestId)

    await screen.findByRole('heading', { level: 1, name: new RegExp(`^HS-\\d{4}-${String(item.requestId).padStart(4, "0")}( · |$)`) })
    const approveBtn = screen.getByRole('button', { name: /Duyệt hồ sơ/i })
    await userEvent.click(approveBtn)

    // Modal opens
    const modal = screen.getByRole('dialog')
    expect(within(modal).getByRole('heading', { name: 'Phê duyệt hồ sơ bàn giao' })).toBeInTheDocument()

    const submitBtn = within(modal).getByRole('button', { name: 'Xác nhận duyệt' })
    const textarea = within(modal).getByPlaceholderText(/Nhập nhận xét \/ căn cứ phê duyệt/i)

    // Try submit empty -> validation error
    await userEvent.click(submitBtn)
    expect(within(modal).getByText(/tối thiểu 1 ký tự/i)).toBeInTheDocument()

    // Fill valid comment but no files -> file errors
    await userEvent.type(textarea, 'Hồ sơ pháp lý đầy đủ và hợp lệ theo Nghị định 23.')
    await userEvent.click(submitBtn)
    expect(within(modal).getByText('Vui lòng chọn file giấy tờ.')).toBeInTheDocument()
    expect(within(modal).getByText('Vui lòng chọn file chữ ký rời.')).toBeInTheDocument()

    // Attach decision file and signature then submit
    approveLegalHandover.mockResolvedValue(reviewDto(item.requestId, 'Approved', 'x'))
    const decisionFile = new File(['quyết định'], 'quyet-dinh.pdf', { type: 'application/pdf' })
    const signature = new File(['sig'], 'quyet-dinh.sig')
    await userEvent.upload(within(modal).getByLabelText(/Tệp văn bản thẩm định/), decisionFile)
    await userEvent.upload(within(modal).getByLabelText(/Chữ ký số rời/), signature)
    await userEvent.click(submitBtn)
    await waitFor(() => expect(approveLegalHandover).toHaveBeenCalledWith(item.requestId, { comment: 'Hồ sơ pháp lý đầy đủ và hợp lệ theo Nghị định 23.', file: decisionFile, signature }))

    // Hộp thoại nhập nhận xét đóng và hộp thoại kết quả hiện ra; bấm Đã hiểu thì đóng nốt
    const result = await screen.findByRole('heading', { name: 'Đã duyệt hồ sơ' })
    expect(screen.queryByRole('heading', { name: 'Phê duyệt hồ sơ bàn giao' })).not.toBeInTheDocument()
    expect(result).toBeInTheDocument()
    expect(screen.getByText('Trạng thái mới:')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Đã hiểu' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('reject_NeedsDecisionFileAndSignatureToo_ThenSubmits', async () => {
    const item = seedHandover('Pending_Legal')
    renderDetail(item.requestId)
    await screen.findByRole('heading', { level: 1, name: new RegExp(`^HS-\\d{4}-${String(item.requestId).padStart(4, '0')}( · |$)`) })
    await userEvent.click(screen.getByRole('button', { name: /Từ chối/i }))
    const modal = screen.getByRole('dialog')
    await userEvent.type(within(modal).getByPlaceholderText(/Nêu rõ lý do từ chối/i), 'Thiếu căn cứ pháp lý.')
    await userEvent.click(within(modal).getByRole('button', { name: 'Xác nhận gửi cho Người thi hành' }))
    expect(within(modal).getByText('Vui lòng chọn file giấy tờ.')).toBeInTheDocument()
    expect(within(modal).getByText('Vui lòng chọn file chữ ký rời.')).toBeInTheDocument()
    rejectLegalHandover.mockResolvedValue(reviewDto(item.requestId, 'Rejected', 'Thiếu căn cứ pháp lý.'))
    const decisionFile = new File(['x'], 'tu-choi.pdf', { type: 'application/pdf' })
    const signature = new File(['sig'], 'tu-choi.sig')
    await userEvent.upload(within(modal).getByLabelText(/Tệp văn bản thẩm định/), decisionFile)
    await userEvent.upload(within(modal).getByLabelText(/Chữ ký số rời/), signature)
    await userEvent.click(within(modal).getByRole('button', { name: 'Xác nhận gửi cho Người thi hành' }))
    await waitFor(() => expect(rejectLegalHandover).toHaveBeenCalledWith(item.requestId, { comment: 'Thiếu căn cứ pháp lý.', file: decisionFile, signature }))
    expect(await screen.findByRole('heading', { name: 'Đã từ chối hồ sơ' })).toBeInTheDocument()
  })

  it('signature_TooLarge_ShowsSizeError', async () => {
    const item = seedHandover('Pending_Legal')
    renderDetail(item.requestId)
    await screen.findByRole('heading', { level: 1, name: new RegExp(`^HS-\\d{4}-${String(item.requestId).padStart(4, '0')}( · |$)`) })
    await userEvent.click(screen.getByRole('button', { name: /Duyệt hồ sơ/i }))
    const modal = screen.getByRole('dialog')
    await userEvent.type(within(modal).getByPlaceholderText(/Nhập nhận xét/i), 'Đủ điều kiện.')
    await userEvent.upload(within(modal).getByLabelText(/Tệp văn bản thẩm định/), new File(['x'], 'qd.pdf', { type: 'application/pdf' }))
    await userEvent.upload(within(modal).getByLabelText(/Chữ ký số rời/), new File([new Uint8Array(20000)], 'qd.sig'))
    await userEvent.click(within(modal).getByRole('button', { name: 'Xác nhận duyệt' }))
    expect(within(modal).getByText('File chữ ký phải từ 1 byte đến 16 KB.')).toBeInTheDocument()
  })

  it('rejectButton_Combined_OpensModalWithRejectOrSupplementWording', async () => {
    const item = seedHandover('Pending_Legal')
    renderDetail(item.requestId)
    await screen.findByRole('heading', { level: 1, name: new RegExp(`^HS-\\d{4}-${String(item.requestId).padStart(4, '0')}( · |$)`) })
    await userEvent.click(screen.getByRole('button', { name: 'Từ chối / Yêu cầu bổ sung' }))
    const modal = screen.getByRole('dialog')
    expect(within(modal).getByRole('heading', { name: 'Từ chối / Yêu cầu bổ sung hồ sơ bàn giao' })).toBeInTheDocument()
    expect(within(modal).getByRole('button', { name: 'Xác nhận gửi cho Người thi hành' })).toBeInTheDocument()
    expect(within(modal).getByPlaceholderText(/lý do từ chối hoặc các giấy tờ\/bằng chứng yêu cầu Người thi hành bổ sung/i)).toBeInTheDocument()
    // Vẫn bắt buộc tệp quyết định và chữ ký số
    expect(within(modal).getByLabelText(/Tệp văn bản thẩm định/)).toBeInTheDocument()
    expect(within(modal).getByLabelText(/Chữ ký số rời/)).toBeInTheDocument()
  })
})
