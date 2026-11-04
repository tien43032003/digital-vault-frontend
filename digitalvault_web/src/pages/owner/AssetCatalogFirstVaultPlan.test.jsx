import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createVnpayCheckout, getCurrentSubscription, getPlans } from '../../callapi/paymentApi'
import { useOwnerCatalog } from '../../hooks/useOwnerCatalog'
import { redirectTo } from '../../utils/navigation'
import AssetCatalogPage from './AssetCatalogPage'

vi.mock('../../callapi/paymentApi', () => ({ getPlans: vi.fn(), createVnpayCheckout: vi.fn(), getCurrentSubscription: vi.fn() }))
vi.mock('../../hooks/useOwnerCatalog', () => ({ useOwnerCatalog: vi.fn() }))
vi.mock('../../hooks/useVaultExecutor', () => ({ useVaultExecutor: () => ({ status: 'ready', data: null, error: '', reload: vi.fn(), apply: vi.fn() }) }))
vi.mock('../../utils/navigation', () => ({ redirectTo: vi.fn() }))

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

const renderPage = () =>
  render(
    <MemoryRouter>
      <AssetCatalogPage />
    </MemoryRouter>,
  )
// Đợi kiểm tra gói xong rồi mới bấm, vì nút đọc kết quả kiểm tra gói tại thời điểm bấm
const clickCreateFirstVault = async () => {
  await waitFor(() => expect(getCurrentSubscription).toHaveBeenCalled())
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
    getCurrentSubscription.mockResolvedValue({ hasActiveSubscription: false, subscription: null })
    renderPage()
    await clickCreateFirstVault()
    const dialog = await screen.findByRole('dialog', { name: PLAN_TITLE })
    expect(await within(dialog).findByRole('article', { name: 'Gói Tiêu Chuẩn' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: VAULT_TITLE })).not.toBeInTheDocument()
  })

  it('firstVault_ChoosePaidPlan_RedirectsToVnpay', async () => {
    getCurrentSubscription.mockResolvedValue({ hasActiveSubscription: false, subscription: null })
    createVnpayCheckout.mockResolvedValue({ paymentUrl: 'https://vnpay.example/pay' })
    renderPage()
    await clickCreateFirstVault()
    const dialog = await screen.findByRole('dialog', { name: PLAN_TITLE })
    const card = await within(dialog).findByRole('article', { name: 'Gói Tiêu Chuẩn' })
    fireEvent.click(within(card).getByRole('button', { name: 'Thanh toán qua VNPay' }))
    await waitFor(() => expect(redirectTo).toHaveBeenCalledWith('https://vnpay.example/pay'))
  })

  it('firstVault_ChooseFreePlan_OpensCreateVaultForm', async () => {
    getCurrentSubscription.mockResolvedValue({ hasActiveSubscription: false, subscription: null })
    renderPage()
    await clickCreateFirstVault()
    const dialog = await screen.findByRole('dialog', { name: PLAN_TITLE })
    const card = await within(dialog).findByRole('article', { name: 'Gói Miễn Phí' })
    fireEvent.click(within(card).getByRole('button', { name: 'Dùng gói miễn phí' }))
    expect(await screen.findByRole('dialog', { name: VAULT_TITLE })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: PLAN_TITLE })).not.toBeInTheDocument()
  })

  it('firstVault_HasActiveSubscription_OpensCreateVaultFormDirectly', async () => {
    getCurrentSubscription.mockResolvedValue({ hasActiveSubscription: true, subscription: { subscriptionId: 1 } })
    renderPage()
    await clickCreateFirstVault()
    expect(await screen.findByRole('dialog', { name: VAULT_TITLE })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: PLAN_TITLE })).not.toBeInTheDocument()
  })

  it('firstVault_SubscriptionCheckFails_DoesNotBlockCreatingVault', async () => {
    getCurrentSubscription.mockRejectedValue(new Error('boom'))
    renderPage()
    await clickCreateFirstVault()
    expect(await screen.findByRole('dialog', { name: VAULT_TITLE })).toBeInTheDocument()
  })

  it('later_Clicked_ClosesPlanPopupWithoutCreatingVault', async () => {
    getCurrentSubscription.mockResolvedValue({ hasActiveSubscription: false, subscription: null })
    renderPage()
    await clickCreateFirstVault()
    const dialog = await screen.findByRole('dialog', { name: PLAN_TITLE })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Để sau' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: PLAN_TITLE })).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog', { name: VAULT_TITLE })).not.toBeInTheDocument()
  })
})
