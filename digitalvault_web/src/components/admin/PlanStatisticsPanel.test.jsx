import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPlanMonthlyStats, getPlanStatistics, getPlanSubscribers } from '../../callapi/adminApi'
import { currentMonthKey } from '../../utils/payment'
import PlanStatisticsPanel from './PlanStatisticsPanel'

vi.mock('../../callapi/adminApi', () => ({ getPlanMonthlyStats: vi.fn(), getPlanStatistics: vi.fn(), getPlanSubscribers: vi.fn() }))

const monthly = { month: '2026-11', totalSold: 7, totalRevenue: 1500000, items: [{ planId: 1, planName: 'Gói Tiêu Chuẩn', soldCount: 5, revenue: 495000, activeUsers: 4 }, { planId: 2, planName: 'Gói Cao Cấp', soldCount: 2, revenue: 598000, activeUsers: 2 }] }
const lifetime = [
  { planId: 1, planName: 'Gói Tiêu Chuẩn', price: 99000, durationDays: 30, isActive: true, activeUsersCount: 4, scheduledUsersCount: 1, expiredUsersCount: 3, totalSubscribersCount: 8, totalRevenue: 792000 },
  { planId: 2, planName: 'Gói Cao Cấp', price: 299000, durationDays: 30, isActive: true, activeUsersCount: 2, scheduledUsersCount: 0, expiredUsersCount: 0, totalSubscribersCount: 2, totalRevenue: 598000 },
  { planId: 3, planName: 'Gói Miễn Phí', price: 0, durationDays: 1, isActive: true, activeUsersCount: 9, scheduledUsersCount: 0, expiredUsersCount: 2, totalSubscribersCount: 11, totalRevenue: 0 },
]
const subscribers = { page: 1, pageSize: 10, total: 2, items: [{ subscriptionId: 11, userId: 5, fullName: 'Nguyễn Văn A', email: 'a@example.com', status: 'Active', startDate: '2026-11-02T00:00:00', endDate: '2026-12-02T00:00:00' }, { subscriptionId: 12, userId: 6, fullName: 'Lê Thị B', email: 'b@example.com', status: 'Expired', startDate: '2026-09-01T00:00:00', endDate: '2026-10-01T00:00:00' }] }

describe('PlanStatisticsPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getPlanMonthlyStats.mockResolvedValue(monthly)
    getPlanStatistics.mockResolvedValue(lifetime)
    getPlanSubscribers.mockResolvedValue(subscribers)
  })

  it('render_Loaded_ShowsMonthlyTotalsAndPerPlanRows', async () => {
    render(<PlanStatisticsPanel />)
    const table = await screen.findByRole('table', { name: 'Thống kê gói dịch vụ' })
    expect(getPlanMonthlyStats).toHaveBeenCalledWith(currentMonthKey())
    expect(screen.getByRole('group', { name: 'GÓI ĐÃ BÁN TRONG THÁNG' })).toHaveTextContent('7')
    expect(screen.getByRole('group', { name: 'DOANH THU TRONG THÁNG' })).toHaveTextContent('1.500.000 ₫')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Gói Tiêu Chuẩn')
    expect(rows[0]).toHaveTextContent('495.000 ₫')
    expect(rows[0]).toHaveTextContent('792.000 ₫')
    // Gói không bán trong tháng hiện 0, vẫn thấy số liệu toàn thời gian
    expect(rows[2]).toHaveTextContent('Gói Miễn Phí')
    expect(rows[2]).toHaveTextContent('0 ₫')
    expect(rows[2]).toHaveTextContent('11')
  })

  it('month_Changed_ReloadsMonthlyStats', async () => {
    render(<PlanStatisticsPanel />)
    await screen.findByRole('table', { name: 'Thống kê gói dịch vụ' })
    fireEvent.change(screen.getByLabelText('Tháng thống kê'), { target: { value: '2026-10' } })
    await waitFor(() => expect(getPlanMonthlyStats).toHaveBeenLastCalledWith('2026-10'))
  })

  it('error_ApiFails_ShowsMessageAndRetryReloads', async () => {
    getPlanMonthlyStats.mockRejectedValueOnce({ message: 'Máy chủ đang bận.' })
    render(<PlanStatisticsPanel />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ đang bận.')
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByRole('table', { name: 'Thống kê gói dịch vụ' })).toBeInTheDocument()
  })

  it('subscribers_Open_ListsUsersWithStartAndExpiryDates', async () => {
    render(<PlanStatisticsPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Xem người dùng gói Gói Tiêu Chuẩn' }))
    const dialog = await screen.findByRole('dialog')
    expect(getPlanSubscribers).toHaveBeenCalledWith(1, { page: 1, pageSize: 10, status: '' })
    const table = await within(dialog).findByRole('table', { name: 'Người dùng của gói' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Nguyễn Văn A')
    expect(rows[0]).toHaveTextContent('a@example.com')
    expect(rows[0]).toHaveTextContent('Đang dùng')
    expect(rows[0]).toHaveTextContent('02/11/2026')
    expect(rows[0]).toHaveTextContent('02/12/2026')
    expect(rows[1]).toHaveTextContent('Đã hết hạn')
  })

  it('subscribers_StatusFilter_SendsStatusAndResetsPage', async () => {
    render(<PlanStatisticsPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Xem người dùng gói Gói Tiêu Chuẩn' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.selectOptions(within(dialog).getByLabelText('Lọc người dùng theo trạng thái'), 'Active')
    await waitFor(() => expect(getPlanSubscribers).toHaveBeenLastCalledWith(1, { page: 1, pageSize: 10, status: 'Active' }))
  })

  it('subscribers_Empty_ShowsEmptyMessage', async () => {
    getPlanSubscribers.mockResolvedValue({ page: 1, pageSize: 10, total: 0, items: [] })
    render(<PlanStatisticsPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Xem người dùng gói Gói Cao Cấp' }))
    expect(await screen.findByText('Chưa có người dùng nào phù hợp.')).toBeInTheDocument()
  })
})
