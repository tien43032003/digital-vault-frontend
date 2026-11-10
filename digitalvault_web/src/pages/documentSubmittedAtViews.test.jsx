import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAssignments, getHandover, getLegalVerifiers } from '../callapi/executorApi'
import { getLegalHandover } from '../callapi/legalApi'
import DocumentList from '../components/beneficiary/DocumentList'
import { documentSubmittedLabel } from '../utils/handover'
import ExecutorHandoverDetailPage from './executor/ExecutorHandoverDetailPage'
import LegalHandoverDetailPage from './legal/LegalHandoverDetailPage'

vi.mock('../callapi/executorApi', () => ({
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
vi.mock('../callapi/legalApi', () => ({
  getLegalHandover: vi.fn(),
  downloadLegalHandoverDocument: vi.fn(),
  approveLegalHandover: vi.fn(),
  rejectLegalHandover: vi.fn(),
  requestAdditionalInfoLegalHandover: vi.fn(),
}))

const documents = [
  { documentId: 1, fileName: 'giay_chung_tu.pdf', fileType: 'application/pdf', isEncrypted: true, signatureValid: true, submitAt: '2026-11-10T13:03:48' },
  { documentId: 2, fileName: 'bang_chung_bo_sung.pdf', fileType: 'application/pdf', isEncrypted: true, signatureValid: true, submitAt: '2026-11-11T08:15:00' },
  { documentId: 3, fileName: 'cu.pdf', fileType: 'application/pdf', isEncrypted: true },
]
const base = { requestId: 7, vaultId: 17, status: 'Draft', initiatedAt: '2026-10-24T02:50:00Z', cases: [], documents }

describe('Giờ nộp của giấy tờ hồ sơ ở các vai trò', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getAssignments.mockResolvedValue([])
    getLegalVerifiers.mockResolvedValue([])
  })

  it('beneficiaryDocumentList_ShowsSubmittedTimeOnlyWhenBackendSendsIt', () => {
    render(<DocumentList documents={documents} download={vi.fn()} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent(documentSubmittedLabel(documents[0]))
    expect(rows[1]).toHaveTextContent(documentSubmittedLabel(documents[1]))
    expect(rows[2]).not.toHaveTextContent('Nộp lúc')
  })

  it('executorDetail_ShowsSubmittedTimePerDocument', async () => {
    getHandover.mockResolvedValue(base)
    render(
      <MemoryRouter initialEntries={['/executor/handovers/7']}>
        <Routes>
          <Route path="/executor/handovers/:requestId" element={<ExecutorHandoverDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )
    const list = await screen.findByRole('list', { name: 'Giấy tờ của hồ sơ' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent(documentSubmittedLabel(documents[0]))
    expect(rows[1]).toHaveTextContent(documentSubmittedLabel(documents[1]))
    expect(rows[2]).not.toHaveTextContent('Nộp lúc')
  })

  it('legalDetail_ShowsSubmittedTimePerExecutorDocument', async () => {
    getLegalHandover.mockResolvedValue({ ...base, status: 'Pending_Legal', assets: [], history: [], ownerStatus: null })
    render(
      <MemoryRouter initialEntries={['/verifier/handovers/7']}>
        <Routes>
          <Route path="/verifier/handovers/:requestId" element={<LegalHandoverDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )
    const row = async (name) => (await screen.findByText(name)).closest('.border')
    expect(await row('giay_chung_tu.pdf')).toHaveTextContent(documentSubmittedLabel(documents[0]))
    expect(await row('bang_chung_bo_sung.pdf')).toHaveTextContent(documentSubmittedLabel(documents[1]))
    expect(await row('cu.pdf')).not.toHaveTextContent('Nộp lúc')
  })
})
