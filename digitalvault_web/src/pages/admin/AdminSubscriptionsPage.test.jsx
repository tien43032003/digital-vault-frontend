import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { login } from '../../callapi/authApi'
import { ROLE_ACCOUNTS, resetMockDb } from '../../mocks/db'
import { handlers } from '../../mocks/handlers'
import { renderWithProviders } from '../../test/renderWithProviders'
import AdminSubscriptionsPage from './AdminSubscriptionsPage'

const server = setupServer(...handlers)
const admin = ROLE_ACCOUNTS.find((account) => account.role === 'Admin')
const DAY = 24 * 60 * 60 * 1000

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(async () => {
  resetMockDb()
  await login(admin.email, admin.password)
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString()
const row = (id, email, planName, price, status, startOffset, endOffset) => ({
  subscriptionId: id,
  userId: id,
  userEmail: email,
  fullName: `Người dùng ${id}`,
  planId: id,
  planName,
  price,
  status,
  startDate: iso(startOffset),
  endDate: iso(endOffset),
})

const ITEMS = [
  row(1, 'dang.dung@example.com', 'Cao Cấp', 299000, 'Active', -10, 20),
  row(2, 'sap.het@example.com', 'Tiêu Chuẩn', 99000, 'Active', -27, 3),
  row(3, 'het.han@example.com', 'Tiêu Chuẩn', 99000, 'Expired', -40, -10),
  row(4, 'cho.ky.sau@example.com', 'Cao Cấp', 299000, 'Scheduled', 3, 33),
  row(5, 'mien.phi@example.com', 'Miễn phí', 0, 'Active', -100, 36000),
]

const requests = []
const useList = (items = ITEMS) =>
  server.use(
    http.get('*/api/admin/user-subscriptions', ({ request }) => {
      requests.push(new URL(request.url).searchParams)
      return HttpResponse.json({ page: 1, pageSize: 10, items })
    }),
  )

beforeEach(() => {
  requests.length = 0
})

const renderPage = () => renderWithProviders(<AdminSubscriptionsPage mockMode="off" />)
const waitForTable = () => screen.findByRole('table', { name: 'Danh sách đăng ký gói' })
const dataRows = () => within(screen.getByRole('table', { name: 'Danh sách đăng ký gói' })).getAllByRole('row').slice(1)
const rowOf = (email) => dataRows().find((item) => within(item).queryByText(email))

describe('AdminSubscriptionsPage loading and error', () => {
  it('render_WhileFetching_ShowsLoadingStatus', async () => {
    useList()
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải danh sách đăng ký gói')
    await waitForTable()
  })

  it('render_ApiFails_ShowsErrorWithRetry', async () => {
    server.use(http.get('*/api/admin/user-subscriptions', () => HttpResponse.json({ status: 500, detail: 'Máy chủ đang bận.' }, { status: 500 })))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ đang bận.')
    useList()
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await waitForTable()).toBeInTheDocument()
  })

  it('render_NoSubscriptions_ShowsEmptyMessage', async () => {
    useList([])
    renderPage()
    expect(await screen.findByText('Không có đăng ký gói nào phù hợp.')).toBeInTheDocument()
  })
})

describe('AdminSubscriptionsPage table', () => {
  it('render_Ready_ShowsPlanDurationDatesAndDaysLeftPerUser', async () => {
    useList()
    renderPage()
    await waitForTable()
    expect(dataRows()).toHaveLength(5)
    const active = rowOf('dang.dung@example.com')
    expect(within(active).getByText('Cao Cấp')).toBeInTheDocument()
    expect(within(active).getByText('1 tháng')).toBeInTheDocument()
    expect(within(active).getByText('Còn 20 ngày')).toBeInTheDocument()
    expect(within(active).getByText('Đang sử dụng')).toBeInTheDocument()
    expect(active).toHaveTextContent(new Date(ITEMS[0].startDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }))
  })

  it('render_EachState_ShowsItsBadge', async () => {
    useList()
    renderPage()
    await waitForTable()
    expect(within(rowOf('sap.het@example.com')).getByText('Sắp đến hạn gia hạn')).toBeInTheDocument()
    expect(within(rowOf('sap.het@example.com')).getByText('Còn 3 ngày')).toBeInTheDocument()
    expect(within(rowOf('het.han@example.com')).getByText('Đã hết hạn')).toBeInTheDocument()
    expect(within(rowOf('cho.ky.sau@example.com')).getByText('Chờ kích hoạt')).toBeInTheDocument()
    expect(within(rowOf('mien.phi@example.com')).getByText('Gói miễn phí')).toBeInTheDocument()
  })

  it('render_FreePlan_ShowsUnlimitedDurationAndNoEndDate', async () => {
    useList()
    renderPage()
    await waitForTable()
    const free = rowOf('mien.phi@example.com')
    expect(within(free).getByText('Không giới hạn')).toBeInTheDocument()
    expect(free).not.toHaveTextContent('Còn ')
  })
})

describe('AdminSubscriptionsPage filters and paging', () => {
  it('filter_ExpiringSoon_SendsActiveStatusWithFiveDayWindow', async () => {
    useList()
    renderPage()
    await waitForTable()
    await userEvent.selectOptions(screen.getByLabelText('Lọc theo trạng thái'), 'expiring')
    await screen.findByRole('table', { name: 'Danh sách đăng ký gói' })
    const last = requests.at(-1)
    expect(last.get('status')).toBe('Active')
    expect(last.get('expiringInDays')).toBe('5')
    expect(last.get('page')).toBe('1')
  })

  it('filter_Expired_SendsExpiredStatusOnly', async () => {
    useList()
    renderPage()
    await waitForTable()
    await userEvent.selectOptions(screen.getByLabelText('Lọc theo trạng thái'), 'expired')
    await screen.findByRole('table', { name: 'Danh sách đăng ký gói' })
    const last = requests.at(-1)
    expect(last.get('status')).toBe('Expired')
    expect(last.has('expiringInDays')).toBe(false)
  })

  it('search_ByEmail_SendsSearchTextWhenSubmitted', async () => {
    useList()
    renderPage()
    await waitForTable()
    await userEvent.type(screen.getByLabelText('Tìm theo email'), 'sap.het{Enter}')
    await vi.waitFor(() => expect(requests.at(-1).get('search')).toBe('sap.het'))
  })

  it('pager_FullPage_AllowsGoingToNextPage', async () => {
    const full = Array.from({ length: 10 }, (_, index) => row(index + 1, `u${index + 1}@example.com`, 'Cao Cấp', 299000, 'Active', -1, 29))
    useList(full)
    renderPage()
    await waitForTable()
    await userEvent.click(screen.getByRole('button', { name: /Tiếp/ }))
    await vi.waitFor(() => expect(requests.at(-1).get('page')).toBe('2'))
  })
})
