import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPlans } from '../../callapi/paymentApi'
import ChoosePlanModal from './ChoosePlanModal'

vi.mock('../../callapi/paymentApi', () => ({ getPlans: vi.fn() }))

const GIB = 1024 ** 3
const plans = [
  { planId: 1, planName: 'Gói Miễn Phí', maxVaults: 1, maxStorageBytes: 2 * GIB, price: 0, durationDays: 30 },
  { planId: 2, planName: 'Gói Tiêu Chuẩn', maxVaults: 5, maxStorageBytes: 10 * GIB, price: 99000, durationDays: 30 },
  { planId: 3, planName: 'Gói Cao Cấp', maxVaults: 20, maxStorageBytes: 100 * GIB, price: 299000, durationDays: 365 },
]

// Màn hình thanh toán giả: chỉ để kiểm tra đã chuyển đúng tới gói được chọn
function CheckoutProbe() {
  const { planId } = useParams()
  return <p>{`checkout-page-${planId}`}</p>
}

const renderModal = (props = {}) => {
  const onClose = vi.fn()
  const onContinueFree = vi.fn()
  render(
    <MemoryRouter initialEntries={['/owner/assets']}>
      <Routes>
        <Route path="/owner/assets" element={<ChoosePlanModal onClose={onClose} onContinueFree={onContinueFree} {...props} />} />
        <Route path="/owner/plans/:planId/checkout" element={<CheckoutProbe />} />
      </Routes>
    </MemoryRouter>,
  )
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
    expect(within(card('Gói Cao Cấp')).getByRole('button', { name: 'Chọn gói và thanh toán' })).toBeInTheDocument()
  })

  it('choose_PaidPlan_OpensCheckoutScreenOfThatPlan', async () => {
    const { onContinueFree } = renderModal()
    await screen.findByRole('article', { name: 'Gói Tiêu Chuẩn' })
    fireEvent.click(within(card('Gói Tiêu Chuẩn')).getByRole('button', { name: 'Chọn gói và thanh toán' }))
    expect(await screen.findByText('checkout-page-2')).toBeInTheDocument()
    expect(onContinueFree).not.toHaveBeenCalled()
  })

  it('choose_FreePlan_ContinuesToCreateVaultWithoutCheckout', async () => {
    const { onContinueFree } = renderModal()
    await screen.findByRole('article', { name: 'Gói Miễn Phí' })
    fireEvent.click(within(card('Gói Miễn Phí')).getByRole('button', { name: 'Dùng gói miễn phí' }))
    expect(onContinueFree).toHaveBeenCalledWith(expect.objectContaining({ planId: 1 }))
    expect(screen.queryByText(/checkout-page/)).not.toBeInTheDocument()
  })

  it('later_Clicked_ClosesWithoutPaying', async () => {
    const { onClose } = renderModal()
    await screen.findByRole('article', { name: 'Gói Tiêu Chuẩn' })
    fireEvent.click(screen.getByRole('button', { name: 'Để sau' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/checkout-page/)).not.toBeInTheDocument()
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
