import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getNotificationPage } from '../../callapi/ownerApi'
import ExecutorLayout from './ExecutorLayout'

vi.mock('../../callapi/ownerApi', () => ({ getNotificationPage: vi.fn() }))
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { email: 'exec@example.com' }, logout: vi.fn() }) }))
vi.mock('./PortalSwitcher', () => ({ default: () => null }))

const renderLayout = () =>
  render(
    <MemoryRouter>
      <ExecutorLayout />
    </MemoryRouter>,
  )

describe('ExecutorLayout', () => {
  beforeEach(() => vi.resetAllMocks())

  it('mailboxItem_IsNotificationsWithUnreadBadge', async () => {
    getNotificationPage.mockResolvedValue({ items: [{ notificationId: 1, isRead: false }, { notificationId: 2, isRead: false }, { notificationId: 3, isRead: true }] })
    renderLayout()
    const link = screen.getByRole('link', { name: /Hộp thư & Thông báo/ })
    expect(link).toHaveAttribute('href', '/executor/mailbox')
    expect(await screen.findByLabelText('2 thông báo chưa đọc')).toBeInTheDocument()
    expect(screen.queryByText('Hộp thư E2EE')).not.toBeInTheDocument()
  })

  it('mailboxItem_NoUnread_ShowsNoBadge', async () => {
    getNotificationPage.mockResolvedValue({ items: [{ notificationId: 1, isRead: true }] })
    renderLayout()
    await screen.findByRole('link', { name: /Hộp thư & Thông báo/ })
    expect(screen.queryByLabelText(/thông báo chưa đọc/)).not.toBeInTheDocument()
  })
})
