import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { login } from '../../callapi/authApi'
import { DEMO_ACCOUNT, getDb, resetMockDb } from '../../mocks/db'
import { handlers } from '../../mocks/handlers'
import { renderWithProviders } from '../../test/renderWithProviders'
import { clearTokens } from '../../utils/tokenStorage'
import PaymentResultPage from './PaymentResultPage'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockDb()
  clearTokens()
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const CODE = '261029034201aa9617d677e9ff56318e'

// Ghi một giao dịch của tài khoản demo vào db mock để API /payments/me/transactions trả về
function seedTransaction(status, overrides = {}) {
  getDb().paymentTransactions = [
    { transactionId: 1, transactionCode: CODE, userId: DEMO_ACCOUNT.userId, planId: 2, amount: 499000, status, createdAt: '2026-10-31T03:00:00.000Z', ...overrides },
  ]
}

const asLoggedInUser = () => login(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password)

const renderPage = (query, props = {}) =>
  renderWithProviders(<PaymentResultPage {...props} />, {
    route: `/payment-result${query}`,
    path: '/payment-result',
    extraRoutes: [
      { path: '/owner/plans', element: <p>plans-page</p> },
      { path: '/', element: <p>landing-page</p> },
    ],
  })

const heading = (name) => screen.findByRole('heading', { level: 1, name })

describe('PaymentResultPage invalid links', () => {
  it('render_NoParams_ShowsMissingInfoWithoutCallingApi', async () => {
    let called = false
    server.events.on('request:start', () => {
      called = true
    })
    renderPage('')
    expect(await heading('Không có thông tin thanh toán')).toBeInTheDocument()
    expect(called).toBe(false)
    server.events.removeAllListeners()
  })

  it.each([['?status=Success'], ['?code=' + CODE], ['?status=Hacked&code=' + CODE], ['?status=Success&code=%3Cscript%3E']])('render_InvalidParams_ShowsMissingInfo', async (query) => {
    renderPage(query)
    expect(await heading('Không có thông tin thanh toán')).toBeInTheDocument()
  })
})

describe('PaymentResultPage not signed in', () => {
  it('render_SuccessQuery_ShowsResultWithCodeAndAskToSignInToVerify', async () => {
    renderPage(`?status=Success&code=${CODE}`)
    expect(await heading('Thanh toán thành công')).toBeInTheDocument()
    expect(screen.getByText(CODE)).toBeInTheDocument()
    expect(screen.getByText(/chưa được đối chiếu/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Đăng nhập để đối chiếu' })).toHaveAttribute('href', '/')
  })

  it('render_FailedQuery_ShowsFailure', async () => {
    renderPage(`?status=Failed&code=${CODE}`)
    expect(await heading('Thanh toán thất bại')).toBeInTheDocument()
  })

  it('render_PendingQuery_ShowsWaitingAndDoesNotPollWithoutSession', async () => {
    renderPage(`?status=Pending&code=${CODE}`, { pollIntervalMs: 10 })
    expect(await heading('Đang chờ xác nhận')).toBeInTheDocument()
    expect(screen.queryByText(/Đang tự động kiểm tra lại/)).not.toBeInTheDocument()
  })
})

describe('PaymentResultPage signed in verification', () => {
  it('verify_TransactionFound_ShowsAmountPlanAndTime', async () => {
    await asLoggedInUser()
    seedTransaction('Success')
    renderPage(`?status=Success&code=${CODE}`)
    expect(await heading('Thanh toán thành công')).toBeInTheDocument()
    expect(await screen.findByText('499.000 ₫')).toBeInTheDocument()
    expect(screen.getByText('Nâng cao')).toBeInTheDocument()
    expect(screen.queryByText(/chưa được đối chiếu/)).not.toBeInTheDocument()
  })

  it('verify_QueryClaimsSuccessButServerSaysFailed_TrustsServer', async () => {
    await asLoggedInUser()
    seedTransaction('Failed')
    renderPage(`?status=Success&code=${CODE}`)
    expect(await heading('Thanh toán thất bại')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Thanh toán thành công' })).not.toBeInTheDocument()
  })

  it('verify_TransactionNotInMyAccount_DoesNotClaimSuccess', async () => {
    await asLoggedInUser()
    seedTransaction('Success', { userId: 2 })
    renderPage(`?status=Success&code=${CODE}`)
    expect(await heading('Không tìm thấy giao dịch')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Thanh toán thành công' })).not.toBeInTheDocument()
  })

  it('verify_WhileChecking_ShowsLoadingStatus', async () => {
    await asLoggedInUser()
    seedTransaction('Success')
    renderPage(`?status=Success&code=${CODE}`)
    expect(screen.getByRole('status')).toHaveTextContent('Đang đối chiếu giao dịch')
    await heading('Thanh toán thành công')
  })

  it('verify_ApiFails_FallsBackToQueryResultWithWarning', async () => {
    await asLoggedInUser()
    server.use(http.get('*/api/payments/me/transactions', () => HttpResponse.json({ status: 500, detail: 'Máy chủ đang bận.' }, { status: 500 })))
    renderPage(`?status=Success&code=${CODE}`)
    expect(await heading('Thanh toán thành công')).toBeInTheDocument()
    expect(await screen.findByText(/Chưa đối chiếu được với máy chủ/)).toBeInTheDocument()
  })

  it('verify_SessionExpired401_TreatedLikeNotSignedIn', async () => {
    await asLoggedInUser()
    server.use(http.get('*/api/payments/me/transactions', () => HttpResponse.json({ status: 401, detail: 'x' }, { status: 401 })))
    renderPage(`?status=Failed&code=${CODE}`)
    expect(await heading('Thanh toán thất bại')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Đăng nhập để đối chiếu' })).toBeInTheDocument()
  })
})

describe('PaymentResultPage pending polling', () => {
  const renderPolling = (props = {}) => renderPage(`?status=Pending&code=${CODE}`, { pollIntervalMs: 15, maxPolls: 3, ...props })

  // Trả lần lượt các trạng thái; lần cuối lặp lại mãi, đồng thời đếm số lần BE bị gọi
  function useSequence(statuses) {
    const calls = { count: 0 }
    server.use(
      http.get('*/api/payments/me/transactions', () => {
        const status = statuses[Math.min(calls.count, statuses.length - 1)]
        calls.count += 1
        return HttpResponse.json({ page: 1, pageSize: 50, total: 1, items: [{ transactionId: 1, transactionCode: CODE, amount: 499000, paymentMethod: 'VNPay', status, createdAt: '2026-10-31T03:00:00Z', planName: 'Nâng cao' }] })
      }),
    )
    return calls
  }

  it('pending_ThenConfirmedByIpn_UpdatesToSuccessWithoutManualReload', async () => {
    await asLoggedInUser()
    const calls = useSequence(['Pending', 'Pending', 'Success'])
    renderPolling()
    expect(await heading('Đang chờ xác nhận')).toBeInTheDocument()
    expect(screen.getByText(/Đang tự động kiểm tra lại/)).toBeInTheDocument()
    expect(await heading('Thanh toán thành công')).toBeInTheDocument()
    expect(calls.count).toBe(3)
  })

  it('pending_NeverConfirmed_StopsAfterMaxPollsAndOffersManualRecheck', async () => {
    await asLoggedInUser()
    const calls = useSequence(['Pending'])
    renderPolling()
    expect(await screen.findByRole('button', { name: 'Kiểm tra lại' })).toBeInTheDocument()
    expect(screen.getByText(/VNPay chưa xác nhận giao dịch/)).toBeInTheDocument()
    const stopped = calls.count
    expect(stopped).toBe(4)
    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(calls.count).toBe(stopped)
  })

  it('recheck_AfterGivingUp_FetchesAgainAndShowsConfirmedResult', async () => {
    await asLoggedInUser()
    let status = 'Pending'
    server.use(
      http.get('*/api/payments/me/transactions', () =>
        HttpResponse.json({ page: 1, pageSize: 50, total: 1, items: [{ transactionId: 1, transactionCode: CODE, amount: 499000, paymentMethod: 'VNPay', status, createdAt: '2026-10-31T03:00:00Z', planName: 'Nâng cao' }] }),
      ),
    )
    renderPolling({ maxPolls: 1 })
    const button = await screen.findByRole('button', { name: 'Kiểm tra lại' })
    status = 'Success'
    await userEvent.click(button)
    expect(await heading('Thanh toán thành công')).toBeInTheDocument()
  })
})

describe('PaymentResultPage links', () => {
  it('links_AfterResult_GoToPlansOrHome', async () => {
    renderPage(`?status=Failed&code=${CODE}`)
    await heading('Thanh toán thất bại')
    expect(screen.getByRole('link', { name: 'Xem các gói dịch vụ' })).toHaveAttribute('href', '/owner/plans')
    await userEvent.click(screen.getByRole('link', { name: 'Về trang chủ' }))
    expect(await screen.findByText('landing-page')).toBeInTheDocument()
  })
})
