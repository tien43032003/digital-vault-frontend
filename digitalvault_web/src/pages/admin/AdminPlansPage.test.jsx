import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAdminPlan,
  deleteAdminPlan,
  deleteInactivePlans,
  getAdminPlans,
  getPaymentTransaction,
  getPaymentTransactions,
  getPlanMonthlyStats,
  getPlanStatistics,
  updateAdminPlan,
} from '../../callapi/adminApi'
import AdminPlansPage from './AdminPlansPage'

vi.mock('../../callapi/adminApi', () => ({
  getAdminPlans: vi.fn(),
  createAdminPlan: vi.fn(),
  updateAdminPlan: vi.fn(),
  deleteAdminPlan: vi.fn(),
  deleteInactivePlans: vi.fn(),
  getPaymentTransactions: vi.fn(),
  getPlanMonthlyStats: vi.fn(),
  getPlanStatistics: vi.fn(),
  getPlanSubscribers: vi.fn(),
  getPaymentTransaction: vi.fn(),
}))

const GIB = 1024 ** 3
const plan = (planId, extra = {}) => ({
  planId,
  planName: `Gói ${planId}`,
  maxVaults: 3,
  maxStorageBytes: 5 * GIB,
  price: 199000,
  durationDays: 30,
  isActive: true,
  createdAt: '2026-10-01T00:00:00',
  ...extra,
})
const transaction = (transactionId, extra = {}) => ({
  transactionId,
  transactionCode: `TXN-${transactionId}`,
  amount: 199000,
  paymentMethod: 'VNPay',
  status: 'Success',
  createdAt: '2026-10-23T14:00:00',
  planName: 'Gói 1',
  ...extra,
})

const fill = (label, value) => fireEvent.change(screen.getByLabelText(new RegExp(label)), { target: { value } })

describe('AdminPlansPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getAdminPlans.mockResolvedValue([plan(1), plan(2, { isActive: false, maxStorageBytes: 500 * 1024 ** 2, durationDays: 365 })])
    getPaymentTransactions.mockResolvedValue({ page: 1, pageSize: 20, total: 1, items: [transaction(7)] })
  })

  it('statsTab_Clicked_ShowsPlanStatisticsAndHidesPlanActions', async () => {
    getPlanMonthlyStats.mockResolvedValue({ month: '2026-11', totalSold: 2, totalRevenue: 198000, items: [{ planId: 1, planName: 'Gói thử', soldCount: 2, revenue: 198000, activeUsers: 2 }] })
    getPlanStatistics.mockResolvedValue([{ planId: 1, planName: 'Gói thử', price: 99000, durationDays: 30, isActive: true, activeUsersCount: 2, scheduledUsersCount: 0, expiredUsersCount: 0, totalSubscribersCount: 2, totalRevenue: 198000 }])
    render(<AdminPlansPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Thống kê gói' }))
    expect(await screen.findByRole('table', { name: 'Thống kê gói dịch vụ' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'GÓI ĐÃ BÁN TRONG THÁNG' })).toHaveTextContent('2')
    expect(screen.queryByRole('button', { name: 'Thêm gói' })).not.toBeInTheDocument()
  })

  it('plans_Loaded_ShowsLimitsPriceDurationAndSellingStatus', async () => {
    render(<AdminPlansPage />)
    const table = await screen.findByRole('table', { name: 'Danh sách gói dịch vụ' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('5 GB')).toBeInTheDocument()
    expect(within(rows[0]).getByText('199.000 ₫')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Đang bán')).toBeInTheDocument()
  })

  it('plans_ActiveByDefault_TabSwitchesToInactiveGroupWithResellButton', async () => {
    render(<AdminPlansPage />)
    const table = await screen.findByRole('table', { name: 'Danh sách gói dịch vụ' })
    expect(within(table).queryByText('Gói 2')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đang bán (1)' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(table).getByRole('button', { name: 'Xóa gói Gói 1' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ngừng bán (1)' }))
    const inactiveTable = screen.getByRole('table', { name: 'Danh sách gói dịch vụ' })
    const rows = within(inactiveTable).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(1)
    expect(within(inactiveTable).queryByText('Gói 1')).not.toBeInTheDocument()
    expect(within(rows[0]).getByText('500 MB')).toBeInTheDocument()
    expect(within(rows[0]).getByText('1 năm')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Ngừng bán')).toBeInTheDocument()
    expect(within(rows[0]).getByRole('button', { name: 'Bán lại gói Gói 2' })).toBeInTheDocument()
    expect(within(rows[0]).queryByRole('button', { name: 'Xóa gói Gói 2' })).not.toBeInTheDocument()
  })

  it('resell_InactivePlan_SendsSamePlanWithIsActiveTrue', async () => {
    updateAdminPlan.mockResolvedValue(plan(2))
    render(<AdminPlansPage />)
    await screen.findByRole('table', { name: 'Danh sách gói dịch vụ' })
    fireEvent.click(screen.getByRole('button', { name: /^Ngừng bán/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Bán lại gói Gói 2' }))
    await waitFor(() =>
      expect(updateAdminPlan).toHaveBeenCalledWith(2, { planName: 'Gói 2', maxVaults: 3, maxStorageBytes: 500 * 1024 ** 2, price: 199000, durationDays: 365, isActive: true }),
    )
    expect(await screen.findByText('Đã bán lại gói dịch vụ')).toBeInTheDocument()
  })

  it('resell_ServerRejects_ShowsErrorAboveTable', async () => {
    updateAdminPlan.mockRejectedValue({ status: 404, message: 'x' })
    render(<AdminPlansPage />)
    await screen.findByRole('table', { name: 'Danh sách gói dịch vụ' })
    fireEvent.click(screen.getByRole('button', { name: /^Ngừng bán/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Bán lại gói Gói 2' }))
    expect(await screen.findByText(/Không tìm thấy gói dịch vụ/)).toBeInTheDocument()
  })

  const openPermanentDelete = async (name) => {
    render(<AdminPlansPage />)
    await screen.findByRole('table', { name: 'Danh sách gói dịch vụ' })
    fireEvent.click(screen.getByRole('button', { name: /^Ngừng bán/ }))
    fireEvent.click(screen.getByRole('button', { name: `Xóa vĩnh viễn gói ${name}` }))
    return screen.getByRole('dialog', { name: 'Xóa Vĩnh Viễn Gói Dịch Vụ' })
  }

  it('deletePermanent_InactivePlan_HasDeleteButtonAndPermanentWording', async () => {
    const dialog = await openPermanentDelete('Gói 2')
    expect(dialog).toHaveTextContent('xóa vĩnh viễn gói Gói 2')
    expect(within(dialog).getByRole('button', { name: 'Xóa vĩnh viễn' })).toBeInTheDocument()
  })

  it('deletePermanent_ActivePlan_HasNoPermanentDeleteButton', async () => {
    render(<AdminPlansPage />)
    await screen.findByRole('table', { name: 'Danh sách gói dịch vụ' })
    expect(screen.queryByRole('button', { name: /Xóa vĩnh viễn/ })).not.toBeInTheDocument()
  })

  it('deletePermanent_ServerRemovesPlan_ShowsPermanentlyDeletedToastAndDropsRow', async () => {
    deleteAdminPlan.mockResolvedValue(undefined)
    const dialog = await openPermanentDelete('Gói 2')
    getAdminPlans.mockResolvedValue([plan(1)])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xóa vĩnh viễn' }))
    await waitFor(() => expect(deleteAdminPlan).toHaveBeenCalledWith(2, { permanent: true }))
    expect(await screen.findByText('Đã xóa vĩnh viễn gói dịch vụ')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xóa vĩnh viễn gói Gói 2' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ngừng bán (0)' })).toBeInTheDocument()
  })

  it('deletePermanent_ServerKeepsPlan_TellsAdminThePlanWasNotRemoved', async () => {
    deleteAdminPlan.mockResolvedValue(undefined)
    const dialog = await openPermanentDelete('Gói 2')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xóa vĩnh viễn' }))
    expect(await screen.findByText('Máy chủ vẫn giữ gói này')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xóa vĩnh viễn gói Gói 2' })).toBeInTheDocument()
  })

  it('deletePermanent_Server409_ExplainsPlanIsInUseAndKeepsDialogOpen', async () => {
    deleteAdminPlan.mockRejectedValue({ status: 409, message: 'x' })
    const dialog = await openPermanentDelete('Gói 2')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xóa vĩnh viễn' }))
    expect(await within(dialog).findByText(/không thể xóa hẳn/)).toBeInTheDocument()
  })

  it('deletePermanent_Cancel_ClosesWithoutCallingApi', async () => {
    const dialog = await openPermanentDelete('Gói 2')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }))
    expect(deleteAdminPlan).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  const openBulkDelete = async () => {
    render(<AdminPlansPage />)
    await screen.findByRole('table', { name: 'Danh sách gói dịch vụ' })
    fireEvent.click(screen.getByRole('button', { name: /^Ngừng bán/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Xóa tất cả gói ngừng bán' }))
    return screen.getByRole('dialog', { name: 'Xóa Tất Cả Gói Ngừng Bán' })
  }

  it('bulkDelete_ActiveGroup_HasNoBulkButton', async () => {
    render(<AdminPlansPage />)
    await screen.findByRole('table', { name: 'Danh sách gói dịch vụ' })
    expect(screen.queryByRole('button', { name: 'Xóa tất cả gói ngừng bán' })).not.toBeInTheDocument()
  })

  it('bulkDelete_Confirm_CallsInactiveEndpointAndShowsDeletedAndSkippedCounts', async () => {
    deleteInactivePlans.mockResolvedValue({ deletedCount: 1, deletedPlanIds: [2], skippedPlanIds: [5, 6], message: 'Done' })
    const dialog = await openBulkDelete()
    expect(dialog).toHaveTextContent('1 gói')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xóa tất cả' }))
    await waitFor(() => expect(deleteInactivePlans).toHaveBeenCalledTimes(1))
    expect(await within(dialog).findByText('Đã xóa 1 gói.')).toBeInTheDocument()
    expect(within(dialog).getByText('2 gói được giữ lại vì đã có giao dịch hoặc người đăng ký.')).toBeInTheDocument()
    getAdminPlans.mockResolvedValue([plan(1)])
    // Có hai nút "Đóng" (dấu X ở đầu và nút ở chân hộp thoại): bấm nút ở chân
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Đóng' }).at(-1))
    expect(await screen.findByText('Đã xóa 1 gói ngừng bán')).toBeInTheDocument()
    await waitFor(() => expect(getAdminPlans).toHaveBeenCalledTimes(2))
  })

  it('bulkDelete_Cancel_ClosesWithoutCallingApi', async () => {
    const dialog = await openBulkDelete()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }))
    expect(deleteInactivePlans).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('bulkDelete_ServerError_ShowsErrorAndKeepsDialogOpen', async () => {
    deleteInactivePlans.mockRejectedValue({ status: 403, message: 'x' })
    const dialog = await openBulkDelete()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xóa tất cả' }))
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Xóa tất cả' })).toBeEnabled()
  })

  it('plans_AllInactive_ShowsHintToRevealThem', async () => {
    getAdminPlans.mockResolvedValue([plan(2, { isActive: false })])
    render(<AdminPlansPage />)
    expect(await screen.findByText('Chưa có gói nào đang bán.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ngừng bán (1)' })).toBeInTheDocument()
  })

  it('plans_ApiFails_ShowsErrorAndRetryReloads', async () => {
    getAdminPlans.mockRejectedValueOnce(new Error('Máy chủ đang bận.'))
    render(<AdminPlansPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ đang bận.')
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByRole('table', { name: 'Danh sách gói dịch vụ' })).toBeInTheDocument()
  })

  it('plans_None_ShowsEmptyMessage', async () => {
    getAdminPlans.mockResolvedValue([])
    render(<AdminPlansPage />)
    expect(await screen.findByText(/Chưa có gói dịch vụ nào/)).toBeInTheDocument()
  })

  it('create_ValidForm_SendsBytesAndReloads', async () => {
    createAdminPlan.mockResolvedValue(plan(3))
    render(<AdminPlansPage />)
    await screen.findByRole('table', { name: 'Danh sách gói dịch vụ' })
    fireEvent.click(screen.getByRole('button', { name: /Thêm gói/ }))
    fill('Tên gói', 'Gói Pro')
    fill('Số kho tối đa', '10')
    fill('Dung lượng tối đa', '20')
    fill('Giá', '499000')
    fill('Thời hạn', '365')
    fireEvent.click(screen.getByRole('button', { name: 'Tạo gói' }))
    await waitFor(() =>
      expect(createAdminPlan).toHaveBeenCalledWith({ planName: 'Gói Pro', maxVaults: 10, maxStorageBytes: 20 * GIB, price: 499000, durationDays: 365, isActive: true }),
    )
    expect(await screen.findByText('Đã tạo gói dịch vụ')).toBeInTheDocument()
    expect(getAdminPlans).toHaveBeenCalledTimes(2)
  })

  it('edit_FreePlanWithZeroPrice_IsAcceptedAndSentAsZero', async () => {
    getAdminPlans.mockResolvedValue([plan(1, { planName: 'Gói Miễn Phí', price: 0 })])
    updateAdminPlan.mockResolvedValue(plan(1))
    render(<AdminPlansPage />)
    await screen.findByRole('table', { name: 'Danh sách gói dịch vụ' })
    fireEvent.click(screen.getByRole('button', { name: 'Sửa gói Gói Miễn Phí' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    await waitFor(() => expect(updateAdminPlan).toHaveBeenCalledWith(1, expect.objectContaining({ price: 0 })))
  })

  it('create_FreePlan_SendsPriceZero', async () => {
    createAdminPlan.mockResolvedValue(plan(3, { price: 0 }))
    render(<AdminPlansPage />)
    await screen.findByRole('table', { name: 'Danh sách gói dịch vụ' })
    fireEvent.click(screen.getByRole('button', { name: /Thêm gói/ }))
    fill('Tên gói', 'Gói Miễn Phí')
    fill('Số kho tối đa', '1')
    fill('Dung lượng tối đa', '2')
    fill('Giá', '0')
    fill('Thời hạn', '30')
    fireEvent.click(screen.getByRole('button', { name: 'Tạo gói' }))
    await waitFor(() => expect(createAdminPlan).toHaveBeenCalledWith(expect.objectContaining({ planName: 'Gói Miễn Phí', price: 0 })))
  })

  it('edit_PriceAtBackendBounds_IsAccepted', async () => {
    updateAdminPlan.mockResolvedValue(plan(1))
    render(<AdminPlansPage />)
    await screen.findByRole('table', { name: 'Danh sách gói dịch vụ' })
    fireEvent.click(screen.getByRole('button', { name: 'Sửa gói Gói 1' }))
    fill('Giá', '0')
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    await waitFor(() => expect(updateAdminPlan).toHaveBeenLastCalledWith(1, expect.objectContaining({ price: 0 })))
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa gói Gói 1' }))
    fill('Giá', '1000000000')
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    await waitFor(() => expect(updateAdminPlan).toHaveBeenLastCalledWith(1, expect.objectContaining({ price: 1000000000 })))
  })

  it('edit_PriceOverBackendMaximum_IsBlocked', async () => {
    render(<AdminPlansPage />)
    await screen.findByRole('table', { name: 'Danh sách gói dịch vụ' })
    fireEvent.click(screen.getByRole('button', { name: 'Sửa gói Gói 1' }))
    fill('Giá', '1000000001')
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await screen.findByText('Giá phải từ 0 ₫ (gói miễn phí) đến 1.000.000.000 ₫.')).toBeInTheDocument()
    expect(updateAdminPlan).not.toHaveBeenCalled()
  })

  it('edit_NegativePrice_ShowsErrorAndDoesNotCallApi', async () => {
    render(<AdminPlansPage />)
    await screen.findByRole('table', { name: 'Danh sách gói dịch vụ' })
    fireEvent.click(screen.getByRole('button', { name: 'Sửa gói Gói 1' }))
    fill('Giá', '-5')
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await screen.findByText('Giá phải từ 0 ₫ (gói miễn phí) đến 1.000.000.000 ₫.')).toBeInTheDocument()
    expect(updateAdminPlan).not.toHaveBeenCalled()
  })

  it('create_EmptyForm_ShowsFieldErrorsAndDoesNotCallApi', async () => {
    render(<AdminPlansPage />)
    await screen.findByRole('table', { name: 'Danh sách gói dịch vụ' })
    fireEvent.click(screen.getByRole('button', { name: /Thêm gói/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Tạo gói' }))
    expect(await screen.findByText('Vui lòng nhập tên gói.')).toBeInTheDocument()
    expect(screen.getByText('Dung lượng phải lớn hơn 0 GB.')).toBeInTheDocument()
    expect(createAdminPlan).not.toHaveBeenCalled()
  })

  it('save_Server400_ShowsServerReason', async () => {
    updateAdminPlan.mockRejectedValue({ status: 400, message: 'The field Price must be between 1 and 1E+16.' })
    render(<AdminPlansPage />)
    await screen.findByRole('table', { name: 'Danh sách gói dịch vụ' })
    fireEvent.click(screen.getByRole('button', { name: 'Sửa gói Gói 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await screen.findByText(/Chi tiết từ máy chủ: The field Price must be between 1/)).toBeInTheDocument()
  })

  it('create_ServerConflict409_ShowsMessageAndKeepsModalOpen', async () => {
    createAdminPlan.mockRejectedValue({ status: 409, message: 'x' })
    render(<AdminPlansPage />)
    await screen.findByRole('table', { name: 'Danh sách gói dịch vụ' })
    fireEvent.click(screen.getByRole('button', { name: /Thêm gói/ }))
    fill('Tên gói', 'Gói 1')
    fill('Số kho tối đa', '1')
    fill('Dung lượng tối đa', '1')
    fill('Giá', '50000')
    fill('Thời hạn', '30')
    fireEvent.click(screen.getByRole('button', { name: 'Tạo gói' }))
    expect(await screen.findByText(/Tên gói đã tồn tại/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tạo gói' })).toBeInTheDocument()
  })

  it('edit_UnchangedStorage_KeepsOriginalBytesAndTurnsOffSelling', async () => {
    updateAdminPlan.mockResolvedValue(plan(2))
    render(<AdminPlansPage />)
    await screen.findByRole('table', { name: 'Danh sách gói dịch vụ' })
    fireEvent.click(screen.getByRole('button', { name: /^Ngừng bán/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Sửa gói Gói 2' }))
    fireEvent.click(screen.getByLabelText(/Đang bán/))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    await waitFor(() =>
      expect(updateAdminPlan).toHaveBeenCalledWith(2, { planName: 'Gói 2', maxVaults: 3, maxStorageBytes: 500 * 1024 ** 2, price: 199000, durationDays: 365, isActive: true }),
    )
  })

  it('delete_Confirmed_CallsApiAndReloads', async () => {
    deleteAdminPlan.mockResolvedValue(undefined)
    render(<AdminPlansPage />)
    await screen.findByRole('table', { name: 'Danh sách gói dịch vụ' })
    fireEvent.click(screen.getByRole('button', { name: 'Xóa gói Gói 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Xóa gói' }))
    await waitFor(() => expect(deleteAdminPlan).toHaveBeenCalledWith(1))
    expect(await screen.findByText('Đã ngừng bán gói dịch vụ')).toBeInTheDocument()
  })

  it('delete_PlanInUse409_ExplainsAndSuggestsStoppingSales', async () => {
    deleteAdminPlan.mockRejectedValue({ status: 409, message: 'x' })
    render(<AdminPlansPage />)
    await screen.findByRole('table', { name: 'Danh sách gói dịch vụ' })
    fireEvent.click(screen.getByRole('button', { name: 'Xóa gói Gói 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Xóa gói' }))
    expect(await screen.findByText(/Gói đang được sử dụng nên không xóa được/)).toBeInTheDocument()
  })

  it('transactions_Tab_ListsTransactionsAndFiltersByStatusAndUser', async () => {
    render(<AdminPlansPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Giao dịch thanh toán' }))
    const table = await screen.findByRole('table', { name: 'Giao dịch thanh toán' })
    expect(within(table).getByText('TXN-7')).toBeInTheDocument()
    expect(within(table).getByText('Thanh toán thành công')).toBeInTheDocument()
    expect(getPaymentTransactions).toHaveBeenCalledWith({ page: 1, pageSize: 20, status: '', userId: '' })

    fireEvent.change(screen.getByLabelText('Lọc theo trạng thái giao dịch'), { target: { value: 'Failed' } })
    fireEvent.change(screen.getByLabelText('Lọc theo ID người dùng'), { target: { value: '5' } })
    await waitFor(() => expect(getPaymentTransactions).toHaveBeenLastCalledWith({ page: 1, pageSize: 20, status: 'Failed', userId: '5' }))
  })

  it('transactions_DetailClicked_ShowsPayerEmail', async () => {
    getPaymentTransaction.mockResolvedValue({ ...transaction(7), userId: 5, userEmail: 'owner@example.com' })
    render(<AdminPlansPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Giao dịch thanh toán' }))
    fireEvent.click(await screen.findByRole('button', { name: /Xem chi tiết giao dịch TXN-7/ }))
    expect(await screen.findByText('owner@example.com')).toBeInTheDocument()
    expect(getPaymentTransaction).toHaveBeenCalledWith(7)
  })

  it('transactions_Empty_ShowsEmptyMessage', async () => {
    getPaymentTransactions.mockResolvedValue({ page: 1, pageSize: 20, total: 0, items: [] })
    render(<AdminPlansPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Giao dịch thanh toán' }))
    expect(await screen.findByText('Chưa có giao dịch phù hợp.')).toBeInTheDocument()
  })
})
