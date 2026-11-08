import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMySubscription, getPlans } from '../../callapi/paymentApi'
import { useOwnerCatalog } from '../../hooks/useOwnerCatalog'
import AssetCatalogPage from './AssetCatalogPage'

vi.mock('../../callapi/paymentApi', () => ({ getPlans: vi.fn(), getMySubscription: vi.fn() }))
vi.mock('../../hooks/useOwnerCatalog', () => ({ useOwnerCatalog: vi.fn() }))
vi.mock('../../hooks/useVaultExecutor', () => ({ useVaultExecutor: () => ({ status: 'ready', data: null, error: '', reload: vi.fn(), apply: vi.fn() }) }))

const GIB = 1024 ** 3
const plans = [
  { planId: 1, planName: 'Gói Miễn Phí', maxVaults: 1, maxStorageBytes: 2 * GIB, price: 0, durationDays: 30 },
  { planId: 2, planName: 'Gói Tiêu Chuẩn', maxVaults: 5, maxStorageBytes: 10 * GIB, price: 99000, durationDays: 30 },
]
const catalog = (extra = {}) => ({
  status: 'ready',
  error: '',
  vaults: [],
  assets: [],
  beneficiaries: [],
  handovers: [],
  assetsLoading: false,
  selectedVault: null,
  selectVault: vi.fn(),
  reload: vi.fn(),
  ...extra,
})
const PLAN_TITLE = 'Chọn gói trước khi tạo kho đầu tiên'
const VAULT_TITLE = 'Tạo Kho Lưu Trữ Mới'

// Màn hình thanh toán giả: chỉ để kiểm tra đã chuyển đúng tới gói được chọn
function CheckoutProbe() {
  const { planId } = useParams()
  return <p>{`checkout-page-${planId}`}</p>
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/owner/assets']}>
      <Routes>
        <Route path="/owner/assets" element={<AssetCatalogPage />} />
        <Route path="/owner/plans/:planId/checkout" element={<CheckoutProbe />} />
      </Routes>
    </MemoryRouter>,
  )
// Đợi kiểm tra gói xong rồi mới bấm, vì nút đọc kết quả kiểm tra gói tại thời điểm bấm
const clickCreateFirstVault = async () => {
  await waitFor(() => expect(getMySubscription).toHaveBeenCalled())
  await new Promise((resolve) => setTimeout(resolve, 30))
  fireEvent.click(await screen.findByRole('button', { name: 'Tạo kho đầu tiên' }))
}

describe('AssetCatalogPage: chọn gói trước khi tạo kho đầu tiên', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    useOwnerCatalog.mockReturnValue(catalog())
    getPlans.mockResolvedValue(plans)
  })

  it('firstVault_NoSubscription_ShowsPlanPopupInsteadOfCreateVaultForm', async () => {
    getMySubscription.mockResolvedValue({ hasActiveSubscription: false, subscription: null })
    renderPage()
    await clickCreateFirstVault()
    const dialog = await screen.findByRole('dialog', { name: PLAN_TITLE })
    expect(await within(dialog).findByRole('article', { name: 'Gói Tiêu Chuẩn' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: VAULT_TITLE })).not.toBeInTheDocument()
  })

  it('firstVault_ChoosePaidPlan_OpensCheckoutScreenWithoutCallingVnpayDirectly', async () => {
    getMySubscription.mockResolvedValue({ hasActiveSubscription: false, subscription: null })
    renderPage()
    await clickCreateFirstVault()
    const dialog = await screen.findByRole('dialog', { name: PLAN_TITLE })
    const card = await within(dialog).findByRole('article', { name: 'Gói Tiêu Chuẩn' })
    fireEvent.click(within(card).getByRole('button', { name: 'Chọn gói và thanh toán' }))
    expect(await screen.findByText('checkout-page-2')).toBeInTheDocument()
  })

  it('firstVault_ChooseFreePlan_OpensCreateVaultForm', async () => {
    getMySubscription.mockResolvedValue({ hasActiveSubscription: false, subscription: null })
    renderPage()
    await clickCreateFirstVault()
    const dialog = await screen.findByRole('dialog', { name: PLAN_TITLE })
    const card = await within(dialog).findByRole('article', { name: 'Gói Miễn Phí' })
    fireEvent.click(within(card).getByRole('button', { name: 'Dùng gói miễn phí' }))
    expect(await screen.findByRole('dialog', { name: VAULT_TITLE })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: PLAN_TITLE })).not.toBeInTheDocument()
  })

  it('firstVault_HasActiveSubscription_OpensCreateVaultFormDirectly', async () => {
    getMySubscription.mockResolvedValue({ hasActiveSubscription: true, subscription: { subscriptionId: 1 } })
    renderPage()
    await clickCreateFirstVault()
    expect(await screen.findByRole('dialog', { name: VAULT_TITLE })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: PLAN_TITLE })).not.toBeInTheDocument()
  })

  it('firstVault_SubscriptionCheckFails_DoesNotBlockCreatingVault', async () => {
    getMySubscription.mockRejectedValue(new Error('boom'))
    renderPage()
    await clickCreateFirstVault()
    expect(await screen.findByRole('dialog', { name: VAULT_TITLE })).toBeInTheDocument()
  })

  it('later_Clicked_ClosesPlanPopupWithoutCreatingVault', async () => {
    getMySubscription.mockResolvedValue({ hasActiveSubscription: false, subscription: null })
    renderPage()
    await clickCreateFirstVault()
    const dialog = await screen.findByRole('dialog', { name: PLAN_TITLE })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Để sau' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: PLAN_TITLE })).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog', { name: VAULT_TITLE })).not.toBeInTheDocument()
  })
})
