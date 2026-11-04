import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createVnpayCheckout, getPlans } from '../../callapi/paymentApi'
import { redirectTo } from '../../utils/navigation'
import ChoosePlanModal from './ChoosePlanModal'

vi.mock('../../callapi/paymentApi', () => ({ getPlans: vi.fn(), createVnpayCheckout: vi.fn() }))
vi.mock('../../utils/navigation', () => ({ redirectTo: vi.fn() }))

const GIB = 1024 ** 3
const plans = [
  { planId: 1, planName: 'Gói Miễn Phí', maxVaults: 1, maxStorageBytes: 2 * GIB, price: 0, durationDays: 30 },
  { planId: 2, planName: 'Gói Tiêu Chuẩn', maxVaults: 5, maxStorageBytes: 10 * GIB, price: 99000, durationDays: 30 },
  { planId: 3, planName: 'Gói Cao Cấp', maxVaults: 20, maxStorageBytes: 100 * GIB, price: 299000, durationDays: 365 },
]

const renderModal = (props = {}) => {
  const onClose = vi.fn()
  const onContinueFree = vi.fn()
  render(<ChoosePlanModal onClose={onClose} onContinueFree={onContinueFree} {...props} />)
  return { onClose, onContinueFree }
}
const card = (name) => screen.getByRole('article', { name })

describe('ChoosePlanModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getPlans.mockResolvedValue(plans)
  })

  it('plans_Loaded_ShowsEachPlanWithPriceLimitsAndAction', async () => {
    renderModal()
    expect(screen.getByRole('dialog', { name: 'Chọn gói trước khi tạo kho đầu tiên' })).toBeInTheDocument()
    expect(await screen.findByRole('article', { name: 'Gói Tiêu Chuẩn' })).toBeInTheDocument()
    expect(within(card('Gói Miễn Phí')).getByText('Miễn phí')).toBeInTheDocument()
    expect(within(card('Gói Miễn Phí')).getByRole('button', { name: 'Dùng gói miễn phí' })).toBeInTheDocument()
    expect(within(card('Gói Tiêu Chuẩn')).getByText('99.000 ₫')).toBeInTheDocument()
    expect(within(card('Gói Tiêu Chuẩn')).getByText('Tối đa 5 kho')).toBeInTheDocument()
    expect(within(card('Gói Cao Cấp')).getByText('/ 1 năm')).toBeInTheDocument()
    expect(within(card('Gói Cao Cấp')).getByRole('button', { name: 'Thanh toán qua VNPay' })).toBeInTheDocument()
  })

  it('choose_PaidPlan_CreatesCheckoutAndRedirectsToVnpay', async () => {
    createVnpayCheckout.mockResolvedValue({ transactionCode: 'abc', amount: 99000, paymentUrl: 'https://vnpay.example/pay?x=1' })
    const { onContinueFree } = renderModal()
    await screen.findByRole('article', { name: 'Gói Tiêu Chuẩn' })
    fireEvent.click(within(card('Gói Tiêu Chuẩn')).getByRole('button', { name: 'Thanh toán qua VNPay' }))
    await waitFor(() => expect(redirectTo).toHaveBeenCalledWith('https://vnpay.example/pay?x=1'))
    expect(createVnpayCheckout).toHaveBeenCalledWith(2)
    expect(onContinueFree).not.toHaveBeenCalled()
    // Trong lúc chuyển trang, mọi nút chọn gói bị khóa để không thanh toán hai lần
    expect(within(card('Gói Cao Cấp')).getByRole('button', { name: 'Thanh toán qua VNPay' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Để sau' })).toBeDisabled()
  })

  it('choose_FreePlan_ContinuesToCreateVaultWithoutCheckout', async () => {
    const { onContinueFree } = renderModal()
    await screen.findByRole('article', { name: 'Gói Miễn Phí' })
    fireEvent.click(within(card('Gói Miễn Phí')).getByRole('button', { name: 'Dùng gói miễn phí' }))
    expect(onContinueFree).toHaveBeenCalledWith(expect.objectContaining({ planId: 1 }))
    expect(createVnpayCheckout).not.toHaveBeenCalled()
    expect(redirectTo).not.toHaveBeenCalled()
  })

  it('choose_CheckoutFails_ShowsReadableErrorAndUnlocksButtons', async () => {
    createVnpayCheckout.mockRejectedValue({ status: 503, message: 'x' })
    renderModal()
    await screen.findByRole('article', { name: 'Gói Tiêu Chuẩn' })
    fireEvent.click(within(card('Gói Tiêu Chuẩn')).getByRole('button', { name: 'Thanh toán qua VNPay' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Cổng thanh toán VNPay chưa được cấu hình')
    expect(redirectTo).not.toHaveBeenCalled()
    expect(within(card('Gói Tiêu Chuẩn')).getByRole('button', { name: 'Thanh toán qua VNPay' })).toBeEnabled()
  })

  it('later_Clicked_ClosesWithoutPaying', async () => {
    const { onClose } = renderModal()
    await screen.findByRole('article', { name: 'Gói Tiêu Chuẩn' })
    fireEvent.click(screen.getByRole('button', { name: 'Để sau' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(createVnpayCheckout).not.toHaveBeenCalled()
  })

  it('plans_ApiFails_ShowsErrorAndRetryReloads', async () => {
    getPlans.mockRejectedValueOnce(new Error('Máy chủ đang bận.'))
    renderModal()
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ đang bận.')
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByRole('article', { name: 'Gói Tiêu Chuẩn' })).toBeInTheDocument()
  })

  it('plans_None_ShowsEmptyMessage', async () => {
    getPlans.mockResolvedValue([])
    renderModal()
    expect(await screen.findByText('Hiện chưa có gói dịch vụ nào đang bán.')).toBeInTheDocument()
  })
})
