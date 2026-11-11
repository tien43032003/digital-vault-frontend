import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getHandoverMessages } from '../../callapi/chatApi'
import { getLegalHandover } from '../../callapi/legalApi'
import LegalHandoverDetailPage from './LegalHandoverDetailPage'

vi.mock('../../callapi/legalApi', () => ({
  getLegalHandover: vi.fn(),
  getLegalHandovers: vi.fn(),
  downloadLegalHandoverDocument: vi.fn(),
  approveLegalHandover: vi.fn(),
  rejectLegalHandover: vi.fn(),
  requestAdditionalInfoLegalHandover: vi.fn(),
}))
vi.mock('../../callapi/chatApi', () => ({ getHandoverMessages: vi.fn(), sendHandoverMessage: vi.fn() }))
vi.mock('../../utils/download', () => ({ downloadBlob: vi.fn() }))

const handover = (status) => ({ requestId: 4, vaultId: 15, vaultName: 'Kho gia đình', ownerName: 'Thịnh', status, initiatedAt: '2026-10-23T14:00:00Z', documents: [], assets: [], cases: [] })

const renderDetail = () =>
  render(
    <MemoryRouter initialEntries={['/verifier/handovers/4']}>
      <Routes>
        <Route path="/verifier/handovers/:requestId" element={<LegalHandoverDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )

describe('LegalHandoverDetailPage chat', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getHandoverMessages.mockResolvedValue({ page: 1, pageSize: 50, items: [{ messageId: 1, senderId: 5, senderName: 'LS. Lê Hoàng Nam', senderRole: 'Executor', content: 'Em đã nộp giấy tờ', messageType: 'Text', createdAt: '2026-11-09T10:00:00Z' }] })
  })

  it.each(['Pending_Legal', 'Additional_Info', 'Approved', 'In_Progress', 'Completed', 'Rejected'])('chat_StatusWithLegalReview_ShowsExecutorMessages', async (status) => {
    getLegalHandover.mockResolvedValue(handover(status))
    renderDetail()
    expect(await screen.findByRole('region', { name: 'Trao đổi hồ sơ bàn giao' })).toBeInTheDocument()
    expect(await screen.findByText('Em đã nộp giấy tờ')).toBeInTheDocument()
    expect(getHandoverMessages).toHaveBeenCalledWith(4, expect.anything())
  })

  it('chat_StatusBeforeLegalReview_HidesPanel', async () => {
    getLegalHandover.mockResolvedValue(handover('Pending_Executor'))
    renderDetail()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('region', { name: 'Trao đổi hồ sơ bàn giao' })).not.toBeInTheDocument()
    expect(getHandoverMessages).not.toHaveBeenCalled()
  })
})
