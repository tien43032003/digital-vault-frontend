import { CalendarClock, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Alert, Button, Form } from 'react-bootstrap'
import { getAdminUserSubscriptions } from '../../callapi/adminApi'
import AdminPager from '../../components/admin/AdminPager'
import MockNotice from '../../components/common/MockNotice'
import { useAdminList } from '../../hooks/useAdminList'
import { MOCK_MODE } from '../../mocks/mode'
import { formatDuration, formatPaymentDate, formatVnd } from '../../utils/payment'
import { describeSubscription, STATUS_FILTERS, statusFilterParams, subscriptionSpanDays } from '../../utils/subscriptionStatus'

// Màu huy hiệu: sắp đến hạn = vàng, hết hạn = đỏ (trong bộ màu của app "warn" là màu đỏ)
const BADGE_CLASS = { ok: 'av-badge-ok', warn: 'av-badge-caution', danger: 'av-badge-warn', info: 'av-badge-info', muted: 'av-badge-muted' }

// Đóng dấu giờ lúc tải dữ liệu lên từng dòng để trạng thái và số ngày còn lại nhất quán trong cả bảng
async function fetchSubscriptions(params) {
  const data = await getAdminUserSubscriptions(params)
  const fetchedAt = Date.now()
  return { ...data, items: (data.items ?? []).map((item) => ({ ...item, fetchedAt })) }
}

// Trang "Đăng ký gói" của Admin: người dùng đang dùng gói nào, thời hạn, ngày đăng ký, ngày hết hạn và trạng thái (đang dùng, sắp đến hạn, hết hạn...)
export default function AdminSubscriptionsPage({ mockMode = MOCK_MODE }) {
  const [filter, setFilter] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const params = useMemo(() => ({ page, pageSize, search, ...statusFilterParams(filter) }), [page, pageSize, search, filter])
  const { items, error, loading, reload } = useAdminList(fetchSubscriptions, params)

  const changeFilter = (value) => {
    setFilter(value)
    setPage(1)
  }

  const submitSearch = (event) => {
    event.preventDefault()
    setSearch(searchInput.trim())
    setPage(1)
  }

  return (
    <div className="d-flex flex-column gap-4">
      <section className="av-panel av-banner">
        <div className="d-flex align-items-center gap-3">
          <span className="av-icon-tile">
            <CalendarClock size={20} aria-hidden="true" />
          </span>
          <div>
            <h1 className="mb-1 fw-bold text-ink" style={{ fontSize: 20, letterSpacing: '-0.02em' }}>
              Đăng ký gói dịch vụ
            </h1>
            <p className="mb-0 fs-12 text-slate-500">Theo dõi người dùng đang dùng gói nào, đăng ký ngày nào, hết hạn ngày nào và ai sắp đến hạn gia hạn (còn tối đa 5 ngày).</p>
          </div>
        </div>
      </section>

      <MockNotice mode={mockMode === 'full' ? mockMode : 'off'} />

      <section className="av-panel d-flex flex-column gap-3" aria-label="Đăng ký gói của người dùng">
        <div className="row g-2">
          <div className="col-12 col-lg-4">
            <Form.Select aria-label="Lọc theo trạng thái" value={filter} onChange={(event) => changeFilter(event.target.value)}>
              {STATUS_FILTERS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Form.Select>
          </div>
          <form className="col-12 col-lg-5 d-flex gap-2" onSubmit={submitSearch} role="search">
            <Form.Control type="search" aria-label="Tìm theo email" placeholder="Tìm theo email người dùng" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
            <Button type="submit" variant="light" className="border">
              <Search size={16} aria-hidden="true" />
              <span className="visually-hidden">Tìm</span>
            </Button>
          </form>
        </div>

        {error ? (
          <Alert variant="danger" className="av-alert d-flex align-items-center justify-content-between gap-3 mb-0">
            <span>{error}</span>
            <Button type="button" variant="light" size="sm" className="border" onClick={reload}>
              Thử lại
            </Button>
          </Alert>
        ) : loading && items.length === 0 ? (
          <p role="status" className="d-flex align-items-center gap-3 fs-14 text-slate-500 mb-0">
            <span className="spinner-border spinner-border-sm text-brand" aria-hidden="true" />
            Đang tải danh sách đăng ký gói...
          </p>
        ) : items.length === 0 ? (
          <p className="av-empty mb-0">Không có đăng ký gói nào phù hợp.</p>
        ) : (
          <div className="table-responsive" aria-busy={loading}>
            <table className="table align-middle mb-0 fs-13" aria-label="Danh sách đăng ký gói">
              <thead>
                <tr className="fs-11 text-slate-500">
                  <th scope="col">Người dùng</th>
                  <th scope="col">Gói</th>
                  <th scope="col">Thời hạn</th>
                  <th scope="col">Ngày đăng ký</th>
                  <th scope="col">Ngày hết hạn</th>
                  <th scope="col">Còn lại</th>
                  <th scope="col">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const state = describeSubscription(item, item.fetchedAt)
                  const span = subscriptionSpanDays(item)
                  return (
                    <tr key={item.subscriptionId}>
                      <td>
                        {item.fullName && <p className="mb-0 fw-semibold text-ink">{item.fullName}</p>}
                        <p className="mb-0 fs-12 text-slate-500">{item.userEmail}</p>
                      </td>
                      <td>
                        <p className="mb-0 fw-semibold text-ink">{item.planName}</p>
                        <p className="mb-0 fs-12 text-slate-500">{Number(item.price) > 0 ? formatVnd(item.price) : 'Miễn phí'}</p>
                      </td>
                      <td className="text-nowrap">{span === null ? 'Không giới hạn' : formatDuration(span)}</td>
                      <td className="text-nowrap">{formatPaymentDate(item.startDate)}</td>
                      <td className="text-nowrap">{state.key === 'free' ? '—' : formatPaymentDate(item.endDate)}</td>
                      <td className="text-nowrap">{state.daysLeft === null ? '—' : state.key === 'expired' ? '—' : `Còn ${state.daysLeft} ngày`}</td>
                      <td>
                        <span className={`av-badge ${BADGE_CLASS[state.tone]}`}>{state.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <AdminPager page={page} pageSize={pageSize} count={items.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} />
      </section>
    </div>
  )
}
