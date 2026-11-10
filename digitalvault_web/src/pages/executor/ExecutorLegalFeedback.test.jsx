import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAssignments, getHandover, getLegalVerifiers } from '../../callapi/executorApi'
import HandoverTable from '../../components/executor/HandoverTable'
import ExecutorHandoverDetailPage from './ExecutorHandoverDetailPage'

vi.mock('../../callapi/executorApi', () => ({
  getAssignments: vi.fn(),
  getHandovers: vi.fn(),
  getHandover: vi.fn(),
  getLegalVerifiers: vi.fn(),
  acceptHandover: vi.fn(),
  declineHandover: vi.fn(),
  completeHandover: vi.fn(),
  createHandover: vi.fn(),
  downloadHandoverDocument: vi.fn(),
  requestLegalVerification: vi.fn(),
  simulateLegalApproval: vi.fn(),
  startHandover: vi.fn(),
  uploadDeathCertificate: vi.fn(),
  uploadEvidence: vi.fn(),
}))

const handover = (status, extra = {}) => ({
  requestId: 7,
  vaultId: 17,
  status,
  initiatedAt: '2026-10-24T02:50:00Z',
  documents: [],
  cases: [],
  ...extra,
})

const renderDetail = () =>
  render(
    <MemoryRouter initialEntries={['/executor/handovers/7']}>
      <Routes>
        <Route path="/executor/handovers/:requestId" element={<ExecutorHandoverDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )

describe('Executor: lý do từ chối / yêu cầu bổ sung của Pháp lý', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getAssignments.mockResolvedValue([])
    getLegalVerifiers.mockResolvedValue([])
  })

  it('table_RejectedWithComment_ShowsLegalReasonUnderBadge', () => {
    render(
      <MemoryRouter>
        <HandoverTable handovers={[handover('Rejected', { legalComment: 'cần xem xét thêm' })]} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Lý do pháp lý:')).toBeInTheDocument()
    expect(screen.getByText(/cần xem xét thêm/)).toBeInTheDocument()
  })

  it('table_AdditionalInfoWithComment_ShowsLegalReason', () => {
    render(
      <MemoryRouter>
        <HandoverTable handovers={[handover('Additional_Info', { legalComment: 'thiếu giấy chứng tử' })]} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/thiếu giấy chứng tử/)).toBeInTheDocument()
  })

  it.each([['Draft'], ['Pending_Legal'], ['Approved']])('table_Status%s_ShowsNoLegalReason', (status) => {
    render(
      <MemoryRouter>
        <HandoverTable handovers={[handover(status, { legalComment: 'không hiển thị' })]} />
      </MemoryRouter>,
    )
    expect(screen.queryByText('Lý do pháp lý:')).not.toBeInTheDocument()
  })

  it('table_RejectedWithoutComment_ShowsNoReasonLine', () => {
    render(
      <MemoryRouter>
        <HandoverTable handovers={[handover('Rejected')]} />
      </MemoryRouter>,
    )
    expect(screen.queryByText('Lý do pháp lý:')).not.toBeInTheDocument()
  })

  it('detail_Rejected_ShowsAlertWithVerifierReasonAndTime', async () => {
    getHandover.mockResolvedValue(handover('Rejected', { legalComment: 'cần xem xét thêm', legalVerifierName: 'Nguyễn Pháp Lý', legalReviewedAt: '2026-10-25T03:00:00' }))
    renderDetail()
    expect(await screen.findByText(/Hồ sơ bị Pháp lý từ chối \/ Yêu cầu bổ sung/)).toHaveTextContent('(Người thẩm định: Nguyễn Pháp Lý)')
    expect(screen.getByText(/cần xem xét thêm/)).toBeInTheDocument()
    expect(screen.getByText(/Thời gian phản hồi:/)).toBeInTheDocument()
  })

  it('detail_AdditionalInfoWithoutComment_ShowsDefaultInstruction', async () => {
    getHandover.mockResolvedValue(handover('Additional_Info'))
    renderDetail()
    expect(await screen.findByText('Pháp lý yêu cầu bổ sung thông tin')).toBeInTheDocument()
    expect(screen.getByText(/Vui lòng kiểm tra lại giấy tờ chứng tử và bằng chứng pháp lý/)).toBeInTheDocument()
  })

  it('detail_PendingLegal_ShowsNoLegalAlert', async () => {
    getHandover.mockResolvedValue(handover('Pending_Legal', { legalComment: 'cũ' }))
    renderDetail()
    await screen.findByText(/Tạo lúc/)
    expect(screen.queryByText(/Lý do \/ Yêu cầu từ Pháp lý/)).not.toBeInTheDocument()
  })
})
