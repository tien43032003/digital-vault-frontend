import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getNotificationPage, markNotificationRead } from '../../callapi/ownerApi'
import { describeExecutorNotification } from '../../utils/notifications'
import ExecutorNotificationsPage from './ExecutorNotificationsPage'

vi.mock('../../callapi/ownerApi', () => ({ getNotificationPage: vi.fn(), markNotificationRead: vi.fn() }))

const note = (notificationId, extra = {}) => ({
  notificationId,
  type: 'Handover',
  title: 'Legal verification rejected',
  message: `Handover #${notificationId + 10} was rejected: cần xem xét thêm`,
  isRead: false,
  createdAt: '2026-10-24T09:00:00',
  ...extra,
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <ExecutorNotificationsPage />
    </MemoryRouter>,
  )

describe('ExecutorNotificationsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getNotificationPage.mockResolvedValue({ page: 1, pageSize: 20, items: [note(1), note(2, { isRead: true, title: 'Legal verification approved', message: 'Handover #12 was approved' })] })
  })

  it('list_Loaded_ShowsVietnameseResultsAndLinkToExecutorHandover', async () => {
    renderPage()
    const list = await screen.findByRole('list', { name: 'Danh sách thông báo' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('heading', { level: 1, name: 'Hộp thư & Thông báo' })).toBeInTheDocument()
    expect(within(list).getByText('Pháp lý đã từ chối hồ sơ')).toBeInTheDocument()
    expect(within(list).getByText('Pháp lý đã duyệt hồ sơ')).toBeInTheDocument()
    expect(within(list).getByText(/Hồ sơ #11 was rejected: cần xem xét thêm/)).toBeInTheDocument()
    expect(within(list).getByRole('link', { name: 'Xem hồ sơ #11' })).toHaveAttribute('href', '/executor/handovers/11')
    expect(screen.getByText('1 chưa đọc')).toBeInTheDocument()
  })

  it('markRead_Click_CallsApiAndShowsAsRead', async () => {
    markNotificationRead.mockResolvedValue(undefined)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Đánh dấu đã đọc' }))
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith(1))
    await waitFor(() => expect(screen.getByText('0 chưa đọc')).toBeInTheDocument())
  })

  it('list_Empty_ShowsEmptyMessage', async () => {
    getNotificationPage.mockResolvedValue({ page: 1, pageSize: 20, items: [] })
    renderPage()
    expect(await screen.findByText('Bạn chưa có thông báo nào.')).toBeInTheDocument()
  })
})

describe('describeExecutorNotification', () => {
  it.each([
    ['Legal verification approved', 'Handover #5 approved', 'Pháp lý đã duyệt hồ sơ', 'ok'],
    ['Legal verification rejected', 'Handover #5 rejected', 'Pháp lý đã từ chối hồ sơ', 'warn'],
    ['Additional information requested', 'Handover #5 needs more documents', 'Pháp lý yêu cầu bổ sung hồ sơ', 'warn'],
  ])('%s_IsTranslated', (title, message, expected, tone) => {
    expect(describeExecutorNotification({ title, message })).toMatchObject({ title: expected, tone, requestId: 5 })
  })

  it('unknownTitle_KeepsBackendTextButLocalizesHandoverNumber', () => {
    expect(describeExecutorNotification({ title: 'Something new', message: 'Handover #9 changed' })).toMatchObject({ title: 'Something new', body: 'Hồ sơ #9 changed', requestId: 9 })
  })

  it('knownOwnerStyleTitle_StillUsesGenericTranslation', () => {
    expect(describeExecutorNotification({ title: 'Vault assigned', message: 'Vault 3 assigned to you' })).toMatchObject({ title: 'Kho được giao cho Executor' })
  })
})
