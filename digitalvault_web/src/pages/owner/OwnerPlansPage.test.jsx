import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { login } from '../../callapi/authApi'
import { DEMO_ACCOUNT, getDb, resetMockDb } from '../../mocks/db'
import { handlers } from '../../mocks/handlers'
import { renderWithProviders } from '../../test/renderWithProviders'
import OwnerPlansPage from './OwnerPlansPage'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(async () => {
  resetMockDb()
  await login(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password)
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const demoUserId = () => getDb().users.find((user) => user.email === DEMO_ACCOUNT.email).userId
const DAY = 24 * 60 * 60 * 1000

// elapsedDays: gói đã chạy bao nhiêu ngày (mặc định 10 ngày: giữa kỳ, các nút đổi gói bị khoá); gói dài 30 ngày
const seedSubscription = (planId = 2, elapsedDays = 10, extra = []) => {
  getDb().userSubscriptions = [
    { subscriptionId: 1, userId: demoUserId(), planId, status: 'Active', startDate: new Date(Date.now() - elapsedDays * DAY).toISOString(), endDate: new Date(Date.now() + (30 - elapsedDays) * DAY).toISOString() },
    ...extra,
  ]
}

const seedTransactions = () => {
  getDb().paymentTransactions = [
    { transactionId: 1, transactionCode: 'TXN-OK', userId: demoUserId(), planId: 2, planName: 'Nâng cao', amount: 499000, paymentMethod: 'VNPay', status: 'Success', createdAt: new Date(Date.now() - 2 * DAY).toISOString() },
    { transactionId: 2, transactionCode: 'TXN-FAIL', userId: demoUserId(), planId: 1, planName: 'Cơ bản', amount: 99000, paymentMethod: 'VNPay', status: 'Failed', createdAt: new Date(Date.now() - DAY).toISOString() },
  ]
}

const renderPage = (props = {}) =>
  renderWithProviders(<OwnerPlansPage mockMode="off" {...props} />, {
    extraRoutes: [{ path: '/owner/plans/:planId/checkout', element: <p>Màn hình thanh toán</p> }],
  })
const waitForPage = () => screen.findByRole('heading', { level: 1, name: 'Gói dịch vụ' })
const plan = (name) => screen.getByRole('article', { name })

describe('OwnerPlansPage loading and error', () => {
  it('render_WhileFetching_ShowsLoadingStatus', async () => {
    renderPage()
    expect(screen.getByText('Đang tải các gói dịch vụ...')).toBeInTheDocument()
    await screen.findByRole('article', { name: 'Cơ bản' })
  })

  it('render_ApiFails_ShowsErrorWithRetry', async () => {
    server.use(http.get('*/api/payments/plans', () => HttpResponse.json({ status: 500, detail: 'Máy chủ đang bận.' }, { status: 500 })))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ đang bận.')
    server.resetHandlers()
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByRole('article', { name: 'Cơ bản' })).toBeInTheDocument()
  })

  it('render_NoPlans_ShowsEmptyMessage', async () => {
    server.use(http.get('*/api/payments/plans', () => HttpResponse.json([])))
    renderPage()
    expect(await screen.findByText('Hiện chưa có gói dịch vụ nào đang bán.')).toBeInTheDocument()
  })
})

describe('OwnerPlansPage content', () => {
  it('render_Plans_ShowsEachPlanWithPriceDurationVaultsAndStorage', async () => {
    renderPage()
    await waitForPage()
    await screen.findByRole('article', { name: 'Cơ bản' })
    expect(screen.getAllByRole('article')).toHaveLength(4)
    const basic = plan('Cơ bản')
    expect(basic).toHaveTextContent('99.000 ₫')
    expect(basic).toHaveTextContent('1 tháng')
    expect(basic).toHaveTextContent('1 kho')
    expect(basic).toHaveTextContent('1 GB')
    const family = plan('Gia đình')
    expect(family).toHaveTextContent('899.000 ₫')
    expect(family).toHaveTextContent('1 năm')
    expect(family).toHaveTextContent('20 kho')
    expect(family).toHaveTextContent('50 GB')
  })

  it('render_Info_ExplainsNewPlanReplacesOldOneAfterSuccessfulPayment', async () => {
    renderPage()
    await waitForPage()
    expect(await screen.findByText(/gói đang dùng sẽ hết hạn/)).toBeInTheDocument()
  })

  it('render_FullMock_ShowsMockNotice', async () => {
    renderPage({ mockMode: 'full' })
    await waitForPage()
    expect(screen.getByRole('note')).toBeInTheDocument()
  })

  it('render_FreePlan_ShowsFreeLabelAndOffersFreeSignUp', async () => {
    server.use(
      http.get('*/api/payments/plans', () =>
        HttpResponse.json([{ planId: 9, planName: 'Gói Miễn Phí', maxVaults: 1, maxStorageBytes: 1073741824, price: 0, durationDays: 30 }]),
      ),
    )
    renderPage()
    await screen.findByRole('article', { name: 'Gói Miễn Phí' })
    expect(plan('Gói Miễn Phí')).toHaveTextContent('Miễn phí')
    expect(within(plan('Gói Miễn Phí')).getByRole('button', { name: 'Dùng miễn phí' })).toHaveAttribute('href', '/owner/plans/9/checkout')
  })

  it('render_FreePlanIsCurrent_ShowsInUseAndNoAction', async () => {
    seedSubscription(4)
    renderPage()
    await screen.findByText('Đang dùng')
    expect(within(plan('Miễn phí')).getByRole('button', { name: 'Đang sử dụng' })).toBeDisabled()
    expect(within(plan('Cơ bản')).getByRole('button', { name: 'Mua gói' })).toBeInTheDocument()
  })

  it('render_NoticeFromCheckout_ShowsDismissibleSuccessAlert', async () => {
    renderWithProviders(<OwnerPlansPage mockMode="off" />, { route: { pathname: '/', state: { notice: 'Đã kích hoạt Miễn phí thành công.' } } })
    expect(screen.getByRole('alert')).toHaveTextContent('Đã kích hoạt Miễn phí thành công.')
    await userEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: /close/i }))
    expect(screen.queryByText('Đã kích hoạt Miễn phí thành công.')).not.toBeInTheDocument()
  })
})

describe('OwnerPlansPage current subscription', () => {
  it('render_NoActiveSubscription_ExplainsUserHasNoPaidPlan', async () => {
    renderPage()
    expect(await screen.findByText(/chưa có gói trả phí nào đang hiệu lực/)).toBeInTheDocument()
  })

  it('render_ActiveSubscription_ShowsPlanDaysLeftAndMarksCurrentCard', async () => {
    seedSubscription(2)
    renderPage()
    const panel = (await screen.findByRole('heading', { name: 'Gói đang sử dụng' })).closest('section')
    expect(await within(panel).findByText('Nâng cao')).toBeInTheDocument()
    expect(panel).toHaveTextContent('Đang hiệu lực')
    expect(panel).toHaveTextContent('Còn 20 ngày')
    await screen.findByRole('article', { name: 'Nâng cao' })
    expect(within(plan('Nâng cao')).getByText('Đang dùng')).toBeInTheDocument()
    // Đang giữa kỳ nên chưa gia hạn được: nút khoá kèm lý do
    expect(within(plan('Nâng cao')).getByRole('button', { name: 'Gia hạn gói' })).toBeDisabled()
    expect(within(plan('Nâng cao')).getByRole('button', { name: 'Gia hạn gói' })).not.toHaveAttribute('href')
    expect(within(plan('Cơ bản')).queryByText('Đang dùng')).not.toBeInTheDocument()
  })

  it('render_NoSubscription_EveryPaidPlanOffersBuy', async () => {
    renderPage()
    await screen.findByRole('article', { name: 'Cơ bản' })
    for (const name of ['Cơ bản', 'Nâng cao', 'Gia đình']) {
      expect(within(plan(name)).getByRole('button', { name: 'Mua gói' })).toHaveAttribute('href', expect.stringContaining('/checkout'))
    }
  })

  it('render_LastFiveDays_ShowsReminderOpensRenewAndNextPeriodForPaidPlans', async () => {
    seedSubscription(2, 27)
    renderPage()
    await screen.findByText('Đang dùng')
    expect(await screen.findByText(/còn 3 ngày nữa là hết hạn/)).toBeInTheDocument()
    expect(within(plan('Nâng cao')).getByRole('button', { name: 'Gia hạn gói' })).toHaveAttribute('href', '/owner/plans/2/checkout')
    expect(within(plan('Gia đình')).getByRole('button', { name: 'Đăng ký kỳ sau' })).toHaveAttribute('href', '/owner/plans/3/checkout')
    expect(within(plan('Cơ bản')).getByRole('button', { name: 'Đăng ký kỳ sau' })).toHaveAttribute('href', '/owner/plans/1/checkout')
    expect(within(plan('Miễn phí')).getByRole('button', { name: 'Dùng miễn phí' })).toBeDisabled()
  })

  it('render_MiddleOfPeriod_LocksOtherPlansWithReasonAndNoReminder', async () => {
    seedSubscription(2)
    renderPage()
    await screen.findByText('Đang dùng')
    expect(screen.queryByText(/nữa là hết hạn/)).not.toBeInTheDocument()
    const upgrade = within(plan('Gia đình')).getByRole('button', { name: 'Nâng cấp' })
    expect(upgrade).toBeDisabled()
    expect(plan('Gia đình')).toHaveTextContent('Quá 3 ngày đầu')
    expect(within(plan('Cơ bản')).getByRole('button', { name: 'Chuyển gói' })).toBeDisabled()
  })

  it('render_QueuedPlan_ShowsItsStartDateAndLocksEveryOtherPlan', async () => {
    seedSubscription(2, 27, [{ subscriptionId: 2, userId: demoUserId(), planId: 1, status: 'Scheduled', startDate: new Date(Date.now() + 3 * DAY).toISOString(), endDate: new Date(Date.now() + 33 * DAY).toISOString() }])
    renderPage()
    await screen.findByText('Đang dùng')
    // Một lần ở dải thông báo đầu trang, một lần làm lý do trên các thẻ gói bị khoá
    expect((await screen.findAllByText(/Bạn đã đăng ký gói Cơ bản cho kỳ sau/)).length).toBeGreaterThanOrEqual(2)
    expect(within(plan('Gia đình')).getByRole('button', { name: 'Đăng ký kỳ sau' })).toBeDisabled()
    expect(within(plan('Nâng cao')).getByRole('button', { name: 'Gia hạn gói' })).toBeDisabled()
  })

  it('render_FirstThreeDays_HigherPlanOffersUpgradeAndLowerPlanIsLocked', async () => {
    seedSubscription(2, 1)
    renderPage()
    await screen.findByText('Đang dùng')
    expect(within(plan('Gia đình')).getByRole('button', { name: 'Nâng cấp' })).toHaveAttribute('href', '/owner/plans/3/checkout')
    expect(within(plan('Cơ bản')).getByRole('button', { name: 'Chuyển gói' })).toBeDisabled()
    expect(plan('Cơ bản')).toHaveTextContent('chỉ chọn được khi gói hiện tại sắp hết hạn')
  })
})

describe('OwnerPlansPage navigation and history', () => {
  it('choosePlan_Click_OpensCheckoutScreenForThatPlan', async () => {
    renderPage()
    await screen.findByRole('article', { name: 'Nâng cao' })
    await userEvent.click(within(plan('Nâng cao')).getByRole('button', { name: 'Mua gói' }))
    expect(await screen.findByText('Màn hình thanh toán')).toBeInTheDocument()
  })

  it('history_Empty_ShowsEmptyMessage', async () => {
    renderPage()
    expect(await screen.findByText('Bạn chưa có giao dịch thanh toán nào.')).toBeInTheDocument()
  })

  it('history_WithTransactions_ListsNewestFirstAndFiltersByStatus', async () => {
    seedTransactions()
    renderPage()
    const table = await screen.findByRole('table', { name: 'Lịch sử thanh toán' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('TXN-FAIL')
    expect(rows[0]).toHaveTextContent('Thanh toán thất bại')
    expect(rows[1]).toHaveTextContent('TXN-OK')
    expect(rows[1]).toHaveTextContent('499.000 ₫')

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Lọc theo trạng thái giao dịch' }), 'Success')
    await vi.waitFor(() => expect(within(screen.getByRole('table', { name: 'Lịch sử thanh toán' })).getAllByRole('row')).toHaveLength(2))
    expect(screen.getByRole('table', { name: 'Lịch sử thanh toán' })).toHaveTextContent('TXN-OK')
    expect(screen.getByRole('table', { name: 'Lịch sử thanh toán' })).not.toHaveTextContent('TXN-FAIL')
  })

  it('history_MultiplePendingTransactions_KeepsOnlyLatestPendingRow', async () => {
    getDb().paymentTransactions = Array.from({ length: 12 }, (_, index) => ({
      transactionId: index + 1,
      transactionCode: index === 0 ? 'TXN-NEW' : `TXN-DUP-${index}`,
      userId: demoUserId(),
      planId: 2,
      planName: 'Nâng cao',
      amount: 499000,
      paymentMethod: 'VNPay',
      status: 'Pending',
      createdAt: new Date(Date.now() - (index + 1) * 60 * 1000).toISOString(),
    }))
    renderPage()
    const table = await screen.findByRole('table', { name: 'Lịch sử thanh toán' })
    await screen.findByRole('article', { name: 'Cơ bản' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('TXN-NEW')
    expect(rows[0]).toHaveTextContent('Đang chờ xác nhận')
    expect(within(rows[0]).getByRole('button', { name: 'Tiếp tục thanh toán' })).toHaveAttribute('href', '/owner/plans/2/checkout')
    expect(table).not.toHaveTextContent('TXN-DUP-1')
    expect(screen.queryByRole('navigation', { name: 'Phân trang lịch sử thanh toán' })).not.toBeInTheDocument()
  })

  it('history_ExpiredPendingTransaction_MarksExpiredAndOffersRetry', async () => {
    getDb().paymentTransactions = [
      { transactionId: 2, transactionCode: 'TXN-OLD', userId: demoUserId(), planId: 1, planName: 'Cơ bản', amount: 99000, paymentMethod: 'VNPay', status: 'Pending', createdAt: new Date(Date.now() - DAY).toISOString() },
    ]
    renderPage()
    const table = await screen.findByRole('table', { name: 'Lịch sử thanh toán' })
    await screen.findByRole('article', { name: 'Cơ bản' })
    const [old] = within(table).getAllByRole('row').slice(1)
    expect(old).toHaveTextContent('Quá hạn thanh toán')
    expect(within(old).getByRole('button', { name: 'Thanh toán lại' })).toHaveAttribute('href', '/owner/plans/1/checkout')
  })
})
