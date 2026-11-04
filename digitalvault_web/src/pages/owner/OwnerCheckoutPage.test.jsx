import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { useLocation } from 'react-router-dom'
import { login } from '../../callapi/authApi'
import { DEMO_ACCOUNT, getDb, resetMockDb } from '../../mocks/db'
import { handlers } from '../../mocks/handlers'
import { renderWithProviders } from '../../test/renderWithProviders'
import { redirectTo } from '../../utils/navigation'
import OwnerCheckoutPage from './OwnerCheckoutPage'

vi.mock('../../utils/navigation', () => ({ redirectTo: vi.fn() }))

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(async () => {
  resetMockDb()
  redirectTo.mockReset()
  await login(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password)
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const DAY = 24 * 60 * 60 * 1000
const demoUserId = () => getDb().users.find((user) => user.email === DEMO_ACCOUNT.email).userId

const renderCheckout = (planId = 2, props = {}) =>
  renderWithProviders(<OwnerCheckoutPage mockMode="off" {...props} />, {
    route: `/owner/plans/${planId}/checkout`,
    path: '/owner/plans/:planId/checkout',
    extraRoutes: [{ path: '/owner/plans', element: <PlansProbe /> }],
  })

// Trang đích sau khi gói được kích hoạt ngay: hiện thông báo nhận được qua state
function PlansProbe() {
  const { state } = useLocation()
  return <p data-testid="plans-notice">{state?.notice ?? ''}</p>
}
const waitForCheckout = () => screen.findByRole('heading', { level: 1, name: 'Thanh toán gói dịch vụ' })
const payButton = () => screen.getByRole('button', { name: /Thanh toán 499\.000/ })

describe('OwnerCheckoutPage summary', () => {
  it('render_WhileFetching_ShowsLoadingStatus', async () => {
    renderCheckout()
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải thông tin thanh toán')
    await waitForCheckout()
  })

  it('render_ValidPlan_ShowsOrderSummaryAndVnpayMethod', async () => {
    renderCheckout()
    await waitForCheckout()
    expect(screen.getByRole('heading', { name: 'Nâng cao' })).toBeInTheDocument()
    const summary = screen.getByRole('heading', { name: 'Tóm tắt đơn hàng' }).closest('section')
    expect(summary).toHaveTextContent('6 tháng')
    expect(summary).toHaveTextContent('Tổng thanh toán')
    expect(summary).toHaveTextContent('499.000 ₫')
    expect(screen.getByText('Cổng thanh toán VNPay')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Cổng thanh toán VNPay' })).toBeChecked()
  })

  it('render_PaymentMethods_MoMoAndBankTransferShownButComingSoon', async () => {
    renderCheckout()
    await waitForCheckout()
    expect(screen.getByRole('radio', { name: 'Ví MoMo' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Chuyển khoản ngân hàng' })).toBeDisabled()
    expect(screen.getAllByText('Sắp ra mắt')).toHaveLength(2)
  })

  it('render_UnknownPlan_ShowsNotFoundWithLinkBack', async () => {
    renderCheckout(999)
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy gói dịch vụ' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xem các gói dịch vụ' })).toHaveAttribute('href', '/owner/plans')
  })

  it('render_FreePlan_ShowsActivateButtonWithoutGatewayOptions', async () => {
    renderCheckout(4)
    await waitForCheckout()
    expect(screen.getByText(/Gói miễn phí không cần thanh toán/)).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quét mã QR bằng điện thoại' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kích hoạt gói miễn phí' })).toBeDisabled()
  })

  it('render_HasOtherActivePlan_WarnsCurrentPlanWillBeReplaced', async () => {
    getDb().userSubscriptions = [
      { subscriptionId: 1, userId: demoUserId(), planId: 1, status: 'Active', startDate: new Date(Date.now() - 27 * DAY).toISOString(), endDate: new Date(Date.now() + 3 * DAY).toISOString() },
    ]
    renderCheckout()
    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn đang dùng gói Cơ bản')
    expect(screen.getByRole('alert')).toHaveTextContent('gói Nâng cao có hiệu lực ngay')
  })

  it('render_PlanLockedByChangeRules_ShowsReasonInsteadOfPayment', async () => {
    getDb().userSubscriptions = [
      { subscriptionId: 1, userId: demoUserId(), planId: 1, status: 'Active', startDate: new Date(Date.now() - 10 * DAY).toISOString(), endDate: new Date(Date.now() + 20 * DAY).toISOString() },
    ]
    renderCheckout()
    expect(await screen.findByRole('heading', { name: 'Chưa thể chọn gói này' })).toBeInTheDocument()
    expect(screen.getByText(/Quá 3 ngày đầu/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Thanh toán/ })).not.toBeInTheDocument()
  })
})

describe('OwnerCheckoutPage payment', () => {
  it('pay_BeforeAgreeingToTerms_IsDisabled', async () => {
    renderCheckout()
    await waitForCheckout()
    expect(payButton()).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox'))
    expect(payButton()).toBeEnabled()
  })

  it('pay_Click_CreatesCheckoutAndRedirectsBrowserToPaymentUrl', async () => {
    renderCheckout()
    await waitForCheckout()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(payButton())
    await vi.waitFor(() => expect(redirectTo).toHaveBeenCalledTimes(1))
    expect(redirectTo.mock.calls[0][0]).toContain('/payment/mock-vnpay')
    const stored = getDb().paymentTransactions
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ planId: 2, status: 'Pending' })
  })

  it('pay_ClickMultipleTimesOrReenter_KeepsOnlySinglePendingTransaction', async () => {
    const first = renderCheckout()
    await waitForCheckout()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(payButton())
    await vi.waitFor(() => expect(redirectTo).toHaveBeenCalledTimes(1))
    const firstUrl = redirectTo.mock.calls[0][0]
    expect(getDb().paymentTransactions).toHaveLength(1)

    first.unmount()
    renderCheckout()
    await waitForCheckout()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(payButton())
    await vi.waitFor(() => expect(redirectTo).toHaveBeenCalledTimes(2))
    expect(redirectTo.mock.calls[1][0]).toBe(firstUrl)
    expect(getDb().paymentTransactions).toHaveLength(1)
  })

  it('pay_WhileProcessing_KeepsButtonDisabled', async () => {
    server.use(
      http.post('*/api/payments/vnpay/checkout', async () => {
        await new Promise((resolve) => setTimeout(resolve, 150))
        return HttpResponse.json({ transactionCode: 'T1', amount: 499000, paymentUrl: 'https://vnpay.example/pay' })
      }),
    )
    renderCheckout()
    await waitForCheckout()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(payButton())
    expect(screen.getByRole('button', { name: 'Đang chuyển tới VNPay...' })).toBeDisabled()
    await vi.waitFor(() => expect(redirectTo).toHaveBeenCalledWith('https://vnpay.example/pay'))
  })

  it('pay_GatewayNotConfigured_ShowsErrorAndDoesNotRedirect', async () => {
    server.use(http.post('*/api/payments/vnpay/checkout', () => HttpResponse.json({ status: 503, detail: 'VNPay is not configured.' }, { status: 503 })))
    renderCheckout()
    await waitForCheckout()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(payButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('chưa được cấu hình')
    expect(redirectTo).not.toHaveBeenCalled()
    expect(payButton()).toBeEnabled()
  })
})

describe('OwnerCheckoutPage QR payment', () => {
  const qrButton = () => screen.getByRole('button', { name: 'Quét mã QR bằng điện thoại' })
  const renderQr = () => renderCheckout(2, { qrPollMs: 40 })

  it('qr_BeforeAgreeingToTerms_IsDisabled', async () => {
    renderQr()
    await waitForCheckout()
    expect(qrButton()).toBeDisabled()
  })

  it('qr_Click_CreatesTransactionShowsQrAndDoesNotRedirect', async () => {
    renderQr()
    await waitForCheckout()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(qrButton())
    const figure = await screen.findByRole('figure', { name: 'Mã QR thanh toán' })
    expect(figure.querySelector('svg')).not.toBeNull()
    const [stored] = getDb().paymentTransactions
    expect(stored).toMatchObject({ planId: 2, status: 'Pending' })
    expect(screen.getByText(`Mã giao dịch: ${stored.transactionCode}`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mở trong tab mới' })).toHaveAttribute('href', expect.stringContaining('/payment/mock-vnpay'))
    expect(redirectTo).not.toHaveBeenCalled()
  })

  it('qr_PaidOnAnotherDevice_PollingShowsSuccess', async () => {
    renderQr()
    await waitForCheckout()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(qrButton())
    await screen.findByRole('figure', { name: 'Mã QR thanh toán' })
    getDb().paymentTransactions[0].status = 'Success'
    expect(await screen.findByText('Thanh toán thành công')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Về trang Gói dịch vụ' })).toHaveAttribute('href', '/owner/plans')
  })

  it('qr_PaymentFailed_ShowsFailureAndCanCreateNewCode', async () => {
    renderQr()
    await waitForCheckout()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(qrButton())
    await screen.findByRole('figure', { name: 'Mã QR thanh toán' })
    getDb().paymentTransactions[0].status = 'Failed'
    expect(await screen.findByText('Thanh toán thất bại')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tạo mã mới' }))
    expect(await screen.findByRole('figure', { name: 'Mã QR thanh toán' })).toBeInTheDocument()
    expect(getDb().paymentTransactions).toHaveLength(2)
  })

  it('qr_Cancel_ReturnsToPaymentButtons', async () => {
    renderQr()
    await waitForCheckout()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(qrButton())
    await screen.findByRole('figure', { name: 'Mã QR thanh toán' })
    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }))
    expect(screen.queryByRole('figure', { name: 'Mã QR thanh toán' })).not.toBeInTheDocument()
    expect(qrButton()).toBeEnabled()
  })
})

describe('OwnerCheckoutPage empty paymentUrl (plan activated by BE)', () => {
  it('freePlan_Activate_DoesNotRedirectToVnpayAndReturnsToPlansWithNotice', async () => {
    renderCheckout(4)
    await waitForCheckout()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Kích hoạt gói miễn phí' }))
    expect(await screen.findByTestId('plans-notice')).toHaveTextContent('Đã kích hoạt Miễn phí thành công.')
    expect(redirectTo).not.toHaveBeenCalled()
    expect(getDb().userSubscriptions).toEqual([expect.objectContaining({ planId: 4, status: 'Active', userId: demoUserId() })])
  })

  it('anyPlan_BackendReturnsEmptyUrl_TreatsAsActivatedInsteadOfRedirecting', async () => {
    server.use(http.post('*/api/payments/vnpay/checkout', () => HttpResponse.json({ transactionCode: 'T0', amount: 0, paymentUrl: '' })))
    renderCheckout()
    await waitForCheckout()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(payButton())
    expect(await screen.findByTestId('plans-notice')).toHaveTextContent('Đã kích hoạt Nâng cao thành công.')
    expect(redirectTo).not.toHaveBeenCalled()
  })

  it('qr_BackendReturnsEmptyUrl_AlsoReturnsToPlansWithoutQr', async () => {
    server.use(http.post('*/api/payments/vnpay/checkout', () => HttpResponse.json({ transactionCode: 'T0', amount: 0, paymentUrl: '' })))
    renderCheckout()
    await waitForCheckout()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Quét mã QR bằng điện thoại' }))
    expect(await screen.findByTestId('plans-notice')).toHaveTextContent('Đã kích hoạt')
  })
})

describe('OwnerCheckoutPage response shape from BE free-plan doc', () => {
  it('freePlan_ResponseWithReferenceAndNullUrl_IsTreatedAsActivated', async () => {
    server.use(http.post('*/api/payments/vnpay/checkout', () => HttpResponse.json({ reference: '261030210000abc123', amount: 0, paymentUrl: null })))
    renderCheckout(4)
    await waitForCheckout()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Kích hoạt gói miễn phí' }))
    expect(await screen.findByTestId('plans-notice')).toHaveTextContent('Đã kích hoạt Miễn phí thành công.')
    expect(redirectTo).not.toHaveBeenCalled()
  })

  it('qr_ResponseUsingReferenceField_ShowsCodeAndPollsByIt', async () => {
    server.use(
      http.post('*/api/payments/vnpay/checkout', () => HttpResponse.json({ reference: 'REF-123', amount: 499000, paymentUrl: 'https://sandbox.vnpayment.vn/pay?x=1' })),
      http.get('*/api/payments/me/transactions', () =>
        HttpResponse.json({ page: 1, pageSize: 20, total: 1, items: [{ transactionId: 1, transactionCode: 'REF-123', amount: 499000, status: 'Success', createdAt: new Date().toISOString() }] }),
      ),
    )
    renderCheckout(2, { qrPollMs: 40 })
    await waitForCheckout()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Quét mã QR bằng điện thoại' }))
    expect(await screen.findByText('Mã giao dịch: REF-123')).toBeInTheDocument()
    expect(await screen.findByText('Thanh toán thành công')).toBeInTheDocument()
  })
})
