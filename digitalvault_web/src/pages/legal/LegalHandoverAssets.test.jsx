import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLegalHandover } from '../../callapi/legalApi'
import LegalHandoverDetailPage from './LegalHandoverDetailPage'

vi.mock('../../callapi/legalApi', () => ({
  getLegalHandover: vi.fn(),
  downloadLegalHandoverDocument: vi.fn(),
  approveLegalHandover: vi.fn(),
  rejectLegalHandover: vi.fn(),
  requestAdditionalInfoLegalHandover: vi.fn(),
}))
vi.mock('../../utils/download', () => ({ downloadBlob: vi.fn() }))

const handover = {
  requestId: 4,
  vaultId: 15,
  status: 'Pending_Legal',
  initiatedAt: '2026-10-23T14:00:00Z',
  documents: [],
  cases: [{ handoverId: 5, assetId: 27, assetName: 'Ví crypto', beneficiaryId: 27, status: 'Pending' }],
  assets: [
    { assetId: 27, name: 'Ví crypto', type: 'CryptoWallet', description: 'Ví lạnh', status: 'Active', documents: [{ documentId: 11, fileName: 'seed.pdf', fileType: 'application/pdf', isEncrypted: true, signatureValid: true, status: 'Active' }] },
    { assetId: 28, name: 'Sổ tiết kiệm', type: 'BankAccount', status: 'Active', documents: [] },
  ],
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/verifier/handovers/4']}>
      <Routes>
        <Route path="/verifier/handovers/:requestId" element={<LegalHandoverDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )

describe('LegalHandoverDetailPage - tài sản của chủ kho', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getLegalHandover.mockResolvedValue(handover)
  })

  it('assets_Loaded_ListsEachAssetWithItsDocumentsAndCounts', async () => {
    renderPage()
    expect(await screen.findByText('2 tài sản · 1 tệp')).toBeInTheDocument()
    expect(screen.getAllByText('Ví crypto').length).toBeGreaterThan(0)
    expect(screen.getByText('Crypto · Ví lạnh')).toBeInTheDocument()
    expect(screen.getByText('seed.pdf')).toBeInTheDocument()
    expect(screen.getByText('Sổ tiết kiệm')).toBeInTheDocument()
    expect(screen.getByText('Tài sản này chưa có giấy tờ nào.')).toBeInTheDocument()
  })

  it('assets_Document_HasNoDownloadButtonButShowsSealedBadge', async () => {
    renderPage()
    const card = (await screen.findByText('seed.pdf')).closest('.border')
    expect(within(card).queryByRole('button', { name: /Tải về/ })).not.toBeInTheDocument()
    expect(within(card).getByText('Niêm phong bảo mật')).toBeInTheDocument()
  })

  it('assets_SignatureValid_ShowsOwnerSignatureBadge', async () => {
    renderPage()
    expect(await screen.findByText('Chữ ký Owner hợp lệ')).toBeInTheDocument()
  })

  it('assets_SignatureInvalid_ShowsInvalidBadge', async () => {
    const [first, second] = handover.assets
    const doc = { ...first.documents[0], signatureValid: false }
    getLegalHandover.mockResolvedValue({ ...handover, assets: [{ ...first, documents: [doc] }, second] })
    renderPage()
    expect(await screen.findByText('Chữ ký không hợp lệ')).toBeInTheDocument()
  })

  it('assets_SignatureUnknown_ShowsNoSignatureBadge', async () => {
    const [first, second] = handover.assets
    const doc = { ...first.documents[0] }
    delete doc.signatureValid
    getLegalHandover.mockResolvedValue({ ...handover, assets: [{ ...first, documents: [doc] }, second] })
    renderPage()
    await screen.findByText('seed.pdf')
    expect(screen.queryByText(/Chữ ký/)).not.toBeInTheDocument()
  })

  it('assets_None_ShowsEmptyMessage', async () => {
    getLegalHandover.mockResolvedValue({ ...handover, assets: [], cases: [] })
    renderPage()
    expect(await screen.findByText('Hồ sơ này chưa có tài sản nào của chủ kho.')).toBeInTheDocument()
  })

  it('title_WithOwner_ShowsRequestOwnerAndVault', async () => {
    getLegalHandover.mockResolvedValue({ ...handover, ownerName: 'Phạm Nhật Tiến' })
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: /^HS-\d{4}-0004 · Phạm Nhật Tiến · Kho #15$/ })).toBeInTheDocument()
  })

  it('title_OwnerOnlyInOwnerObject_StillShowsOwnerName', async () => {
    getLegalHandover.mockResolvedValue({ ...handover, owner: { userId: 5, fullName: 'Lê Văn A' } })
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: /^HS-\d{4}-0004 · Lê Văn A · Kho #15$/ })).toBeInTheDocument()
  })

  it('title_NoOwner_OmitsOwnerPart', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: /^HS-\d{4}-0004 · Kho #15$/ })).toBeInTheDocument()
  })

  it('cases_Table_ShowsAssetNameInsteadOfId', async () => {
    renderPage()
    const table = await screen.findByRole('table')
    expect(within(table).getByText('Ví crypto')).toBeInTheDocument()
    expect(within(table).queryByText('Tài sản #27')).not.toBeInTheDocument()
  })
})
