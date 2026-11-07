import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getOwnerHandovers } from '../../callapi/ownerApi'
import CancelHandoverModal from '../../components/owner/CancelHandoverModal'
import OwnerHandoversPage from './OwnerHandoversPage'

vi.mock('../../callapi/ownerApi', async (importOriginal) => ({ ...(await importOriginal()), getOwnerHandovers: vi.fn(), cancelHandover: vi.fn() }))

const handover = (requestId, vaultId, extra = {}) => ({
  requestId,
  vaultId,
  status: 'Draft',
  initiatedAt: '2026-10-23T14:00:00Z',
  executorName: 'Người thi hành',
  documents: [],
  cases: [{ handoverId: requestId, assetId: 1, assetName: 'ví', beneficiaryId: 2, status: 'Pending' }],
  ...extra,
})

describe('Owner: hiển thị tên kho của hồ sơ bàn giao', () => {
  beforeEach(() => vi.resetAllMocks())

  it('list_VaultNameFromBackend_ReplacesVaultId', async () => {
    getOwnerHandovers.mockResolvedValue([handover(4, 15, { vaultName: 'Kho gia đình' }), handover(2, 9)])
    render(
      <MemoryRouter>
        <OwnerHandoversPage />
      </MemoryRouter>,
    )
    const table = await screen.findByRole('table', { name: 'Danh sách hồ sơ bàn giao' })
    expect(within(table).getByText('Kho gia đình')).toBeInTheDocument()
    expect(within(table).queryByText('Kho #15')).not.toBeInTheDocument()
    // Chưa có tên thì dùng "Kho #id" để không bị trống
    expect(within(table).getByText('Kho #9')).toBeInTheDocument()
  })

  it('cancelDialog_VaultName_IsUsedInsteadOfVaultId', () => {
    render(<CancelHandoverModal handover={handover(4, 15, { vaultName: 'Kho gia đình' })} onClose={vi.fn()} onCancelled={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('của Kho gia đình.')
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Kho #15')
    fireEvent.click(screen.getAllByRole('button', { name: /Đóng|Giữ lại|Hủy/ })[0])
  })

  it('cancelDialog_NoVaultName_FallsBackToVaultId', () => {
    render(<CancelHandoverModal handover={handover(4, 15)} onClose={vi.fn()} onCancelled={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('của Kho #15.')
  })
})
