import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLegalHandover, getLegalHandovers } from '../../callapi/legalApi'
import LegalHandoverDetailPage from './LegalHandoverDetailPage'
import LegalHandoverListPage from './LegalHandoverListPage'

vi.mock('../../callapi/legalApi', () => ({
  getLegalHandover: vi.fn(),
  getLegalHandovers: vi.fn(),
  downloadLegalHandoverDocument: vi.fn(),
  approveLegalHandover: vi.fn(),
  rejectLegalHandover: vi.fn(),
  requestAdditionalInfoLegalHandover: vi.fn(),
}))
vi.mock('../../utils/download', () => ({ downloadBlob: vi.fn() }))

const handover = {
  requestId: 4,
  vaultId: 15,
  vaultName: 'Kho gia đình',
  ownerName: 'Thịnh Nguyễn Quốc',
  status: 'Pending_Legal',
  initiatedAt: '2026-10-23T14:00:00Z',
  documents: [],
  assets: [],
  cases: [
    { handoverId: 5, assetId: 27, assetName: 'hihi', beneficiaryId: 27, beneficiaryName: 'Lê Văn B', allocationPercentage: 60, status: 'Pending' },
    { handoverId: 6, assetId: 27, assetName: 'hihi', beneficiaryId: 28, beneficiaryName: null, allocationPercentage: 12.5, status: 'Pending' },
    { handoverId: 7, assetId: 28, assetName: 'sổ', beneficiaryId: 29, status: 'Pending' },
  ],
}

describe('Pháp lý: tên kho, người thụ hưởng và tỉ lệ phân bổ', () => {
  beforeEach(() => vi.resetAllMocks())

  it('detail_Loaded_ShowsVaultNameBeneficiaryNameAndAllocation', async () => {
    getLegalHandover.mockResolvedValue(handover)
    render(
      <MemoryRouter initialEntries={['/verifier/handovers/4']}>
        <Routes>
          <Route path="/verifier/handovers/:requestId" element={<LegalHandoverDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { level: 1, name: /^HS-\d{4}-0004 · Thịnh Nguyễn Quốc · Kho gia đình$/ })).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'Người thụ hưởng' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Tỉ lệ phân bổ' })).toBeInTheDocument()
    const rows = within(table).getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('Lê Văn B')).toBeInTheDocument()
    expect(within(rows[0]).getByText('60%')).toBeInTheDocument()
    // Chưa có tên thì dùng ID; tỉ lệ lẻ giữ nguyên số thập phân
    expect(within(rows[1]).getByText('Người nhận #28')).toBeInTheDocument()
    expect(within(rows[1]).getByText('12.5%')).toBeInTheDocument()
    // BE không trả tỉ lệ thì hiện dấu gạch
    expect(within(rows[2]).getByText('—')).toBeInTheDocument()
  })

  it('list_Loaded_ShowsVaultNameAndOwnerUnderCode', async () => {
    getLegalHandovers.mockResolvedValue({ page: 1, pageSize: 10, items: [handover] })
    render(
      <MemoryRouter>
        <LegalHandoverListPage title="Hồ sơ chờ thẩm định" description="d" status="Pending_Legal" emptyMessage="trống" />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Kho gia đình')).toBeInTheDocument()
    expect(screen.getByText('Chủ kho: Thịnh Nguyễn Quốc')).toBeInTheDocument()
  })

  it('list_NoVaultNameOrOwner_ShowsOnlyVaultId', async () => {
    getLegalHandovers.mockResolvedValue({ page: 1, pageSize: 10, items: [{ ...handover, vaultName: null, ownerName: null }] })
    render(
      <MemoryRouter>
        <LegalHandoverListPage title="Hồ sơ chờ thẩm định" description="d" status="Pending_Legal" emptyMessage="trống" />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Kho #15')).toBeInTheDocument()
    expect(screen.queryByText(/Chủ kho/)).not.toBeInTheDocument()
  })
})
