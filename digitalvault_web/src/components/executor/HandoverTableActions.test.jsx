import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { startHandover } from '../../callapi/executorApi'
import HandoverTable from './HandoverTable'

vi.mock('../../callapi/executorApi', () => ({ startHandover: vi.fn() }))

const handover = (requestId, status) => ({ requestId, vaultId: 1, status, initiatedAt: '2026-10-24T02:50:00Z', documents: [], cases: [] })

const renderTable = (handovers) =>
  render(
    <MemoryRouter initialEntries={['/executor/pending']}>
      <Routes>
        <Route path="/executor/pending" element={<HandoverTable handovers={handovers} />} />
        <Route path="/executor/handovers/:requestId" element={<p>detail-page</p>} />
      </Routes>
    </MemoryRouter>,
  )
const rowOf = (code) => screen.getByRole('row', { name: new RegExp(code) })

describe('HandoverTable: nút bước tiếp theo', () => {
  beforeEach(() => vi.resetAllMocks())

  it('rows_EachStatus_ShowItsNextStepLinkOrButton', () => {
    renderTable([handover(1, 'Pending_Legal'), handover(2, 'Rejected'), handover(3, 'Additional_Info'), handover(4, 'Approved'), handover(5, 'In_Progress'), handover(6, 'Draft'), handover(7, 'Completed')])
    expect(within(rowOf('0001')).getByRole('link', { name: 'Theo dõi thẩm định' })).toHaveAttribute('href', '/executor/handovers/1')
    expect(within(rowOf('0002')).getByRole('link', { name: 'Bổ sung và gửi lại' })).toHaveAttribute('href', '/executor/handovers/2')
    expect(within(rowOf('0003')).getByRole('link', { name: 'Bổ sung và gửi lại' })).toBeInTheDocument()
    expect(within(rowOf('0004')).getByRole('button', { name: 'Bắt đầu bàn giao' })).toBeEnabled()
    expect(within(rowOf('0005')).getByRole('link', { name: 'Hoàn tất bàn giao' })).toHaveAttribute('href', '/executor/handovers/5')
    expect(within(rowOf('0006')).getByRole('link', { name: 'Tiếp tục hồ sơ' })).toBeInTheDocument()
    expect(within(rowOf('0007')).getByRole('link', { name: 'Xem hồ sơ' })).toBeInTheDocument()
  })

  it('start_ApprovedClicked_StartsHandoverAndOpensDetail', async () => {
    startHandover.mockResolvedValue(undefined)
    renderTable([handover(4, 'Approved')])
    await userEvent.click(screen.getByRole('button', { name: 'Bắt đầu bàn giao' }))
    await waitFor(() => expect(startHandover).toHaveBeenCalledWith(4))
    expect(await screen.findByText('detail-page')).toBeInTheDocument()
  })

  it('start_Conflict_ShowsReadableErrorAndStaysOnList', async () => {
    startHandover.mockRejectedValue({ status: 409, message: 'x' })
    renderTable([handover(4, 'Approved')])
    await userEvent.click(screen.getByRole('button', { name: 'Bắt đầu bàn giao' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Hồ sơ chưa ở trạng thái phù hợp để bắt đầu bàn giao')
    expect(screen.queryByText('detail-page')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bắt đầu bàn giao' })).toBeEnabled()
  })
})
