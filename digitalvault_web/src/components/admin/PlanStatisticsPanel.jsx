import { BarChart3, Banknote, Users, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Alert, Button, Form, Modal } from 'react-bootstrap'
import { getPlanMonthlyStats, getPlanStatistics, getPlanSubscribers } from '../../callapi/adminApi'
import { useAdminList } from '../../hooks/useAdminList'
import { useAdminResource } from '../../hooks/useAdminResource'
import { SUBSCRIBER_STATUSES, currentMonthKey, formatVnd, subscriberStatusInfo } from '../../utils/payment'
import { formatDate } from '../../utils/proofOfLife'
import { describeSubscription } from '../../utils/subscriptionStatus'
import AdminPager from './AdminPager'
import AdminResourceState from './AdminResourceState'

const BADGE_CLASS = { ok: 'av-badge-ok', warn: 'av-badge-warn', caution: 'av-badge-caution', muted: 'av-badge-muted' }

function StatBox({ label, icon: Icon, tone, children }) {
  return (
    <div role="group" aria-label={label} className="av-stat">
      <div style={{ minWidth: 0 }}>
        <p className="av-stat-label">{label}</p>
        {children}
      </div>
      <span className={`av-stat-icon ${tone}`}>
        <Icon size={18} aria-hidden="true" />
      </span>
    </div>
  )
}

// Hộp thoại người dùng của một gói: họ tên, email, trạng thái, ngày bắt đầu sử dụng và ngày hết hạn
function PlanSubscribersModal({ plan, onClose }) {
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  // Đóng dấu giờ lúc tải lên từng dòng để trạng thái và số ngày còn lại nhất quán trong cả bảng
  const fetchPage = useMemo(
    () => async (params) => {
      const data = await getPlanSubscribers(plan.planId, params)
      const fetchedAt = Date.now()
      return { ...data, items: (data.items ?? []).map((item) => ({ ...item, fetchedAt })) }
    },
    [plan.planId],
  )
  const params = useMemo(() => ({ page, pageSize, status }), [page, pageSize, status])
  const { items, error, loading, reload } = useAdminList(fetchPage, params)

  return (
    <Modal show onHide={onClose} centered animation={false} size="lg" dialogClassName="av-modal" aria-labelledby="plan-subscribers-title">
      <div className="av-modal-head">
        <div className="d-flex align-items-center gap-3">
          <span className="av-icon-tile">
            <Users size={20} aria-hidden="true" />
          </span>
          <h2 id="plan-subscribers-title" className="mb-0 fw-bold text-ink" style={{ fontSize: 19, letterSpacing: '-0.025em' }}>
            {`Người dùng gói ${plan.planName}`}
          </h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Đóng" className="av-close-btn">
          <X size={16} />
        </button>
      </div>
      <div className="av-modal-body d-flex flex-column gap-3">
        <div style={{ maxWidth: 280 }}>
          <Form.Select
            aria-label="Lọc người dùng theo trạng thái"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value)
              setPage(1)
            }}
          >
            <option value="">Tất cả trạng thái</option>
            {SUBSCRIBER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {subscriberStatusInfo(value).text}
              </option>
            ))}
          </Form.Select>
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
            Đang tải người dùng của gói...
          </p>
        ) : items.length === 0 ? (
          <p className="av-empty mb-0">Chưa có người dùng nào phù hợp.</p>
        ) : (
          <div className="table-responsive" aria-busy={loading}>
            <table className="table align-middle mb-0 fs-13" aria-label="Người dùng của gói">
              <thead>
                <tr className="fs-11 text-slate-500">
                  <th scope="col">Người dùng</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Ngày sử dụng</th>
                  <th scope="col">Ngày hết hạn</th>
                  <th scope="col">Còn lại</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  // Gói đang dùng mà còn tối đa 5 ngày thì báo "Sắp đến hạn" để Admin nhắc gia hạn
                  const state = describeSubscription(item, item.fetchedAt)
                  const info = state.key === 'expiring' ? { text: 'Sắp đến hạn', tone: 'caution' } : subscriberStatusInfo(item.status)
                  const showDaysLeft = item.status === 'Active' && (state.key === 'active' || state.key === 'expiring')
                  return (
                    <tr key={item.subscriptionId}>
                      <td>
                        <p className="mb-0 fw-semibold text-ink">{item.fullName}</p>
                        <p className="mb-0 fs-12 text-slate-500">{item.email}</p>
                      </td>
                      <td>
                        <span className={`av-badge ${BADGE_CLASS[info.tone]}`}>{info.text}</span>
                      </td>
                      <td className="text-nowrap">{formatDate(item.startDate)}</td>
                      <td className="text-nowrap">{formatDate(item.endDate)}</td>
                      <td className="text-nowrap">{showDaysLeft ? `Còn ${state.daysLeft} ngày` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <AdminPager
          page={page}
          pageSize={pageSize}
          count={items.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
        />
      </div>
      <div className="av-modal-foot justify-content-end">
        <Button type="button" variant="light" onClick={onClose} className="av-btn av-btn-md border">
          Đóng
        </Button>
      </div>
    </Modal>
  )
}

// Thống kê bán gói: trong tháng chọn (số gói đã bán, doanh thu, người đang dùng từng gói) và toàn thời gian (đang dùng, đặt trước, hết hạn, tổng đăng ký, tổng doanh thu)
export default function PlanStatisticsPanel() {
  const [month, setMonth] = useState(currentMonthKey())
  const [viewing, setViewing] = useState(null)

  const monthlyFetcher = useMemo(() => () => getPlanMonthlyStats(month), [month])
  const monthly = useAdminResource(monthlyFetcher)
  const lifetime = useAdminResource(getPlanStatistics)

  // Ghép số liệu tháng và toàn thời gian theo mã gói; gói không có bán trong tháng hiện 0
  const rows = useMemo(() => {
    if (!monthly.data || !lifetime.data) return []
    const byPlan = new Map((monthly.data.items ?? []).map((item) => [item.planId, item]))
    const known = new Set(lifetime.data.map((item) => item.planId))
    const merged = lifetime.data.map((total) => ({ ...total, month: byPlan.get(total.planId) ?? { soldCount: 0, revenue: 0, activeUsers: 0 } }))
    // Gói chỉ có trong thống kê tháng (BE không trả ở thống kê toàn thời gian) vẫn được hiển thị
    for (const item of monthly.data.items ?? []) {
      if (!known.has(item.planId)) merged.push({ planId: item.planId, planName: item.planName, month: item, missingTotals: true })
    }
    return merged
  }, [monthly.data, lifetime.data])

  const reload = () => {
    monthly.reload()
    lifetime.reload()
  }
  const error = monthly.error || lifetime.error
  const loading = monthly.loading || lifetime.loading
  const ready = Boolean(monthly.data && lifetime.data)

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-2">
        <div>
          <label htmlFor="plan-stats-month" className="av-label mb-1">
            Tháng thống kê
          </label>
          <Form.Control id="plan-stats-month" type="month" max={currentMonthKey()} value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} style={{ maxWidth: 200 }} />
        </div>
        <Button type="button" variant="light" className="av-btn av-btn-sm border" disabled={loading} onClick={reload}>
          Tải lại thống kê
        </Button>
      </div>

      <AdminResourceState error={error} loading={loading && !ready} hasData={ready} loadingText="Đang tải thống kê gói dịch vụ..." onRetry={reload} />

      {ready && (
        <>
          <div className="av-stat-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <StatBox label="GÓI ĐÃ BÁN TRONG THÁNG" icon={BarChart3} tone="is-brand">
              <p className="mb-0 mt-1">
                <span className="av-stat-value">{monthly.data.totalSold ?? 0}</span>
                <span className="av-stat-unit">gói</span>
              </p>
            </StatBox>
            <StatBox label="DOANH THU TRONG THÁNG" icon={Banknote} tone="is-amber">
              <p className="mb-0 mt-1">
                <span className="av-stat-value">{formatVnd(monthly.data.totalRevenue ?? 0)}</span>
              </p>
            </StatBox>
          </div>

          {rows.length === 0 ? (
            <p className="av-empty mb-0">Chưa có dữ liệu thống kê gói dịch vụ.</p>
          ) : (
            <div className="table-responsive" aria-busy={loading}>
              <table className="table align-middle mb-0 fs-13" aria-label="Thống kê gói dịch vụ">
                <thead>
                  <tr className="fs-11 text-slate-500">
                    <th scope="col">Gói</th>
                    <th scope="col" className="text-end">Đã bán (tháng)</th>
                    <th scope="col" className="text-end">Doanh thu (tháng)</th>
                    <th scope="col" className="text-end">Đang dùng</th>
                    <th scope="col" className="text-end">Đặt trước</th>
                    <th scope="col" className="text-end">Hết hạn</th>
                    <th scope="col" className="text-end">Tổng đăng ký</th>
                    <th scope="col" className="text-end">Tổng doanh thu</th>
                    <th scope="col">
                      <span className="visually-hidden">Thao tác</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.planId}>
                      <td className="fw-semibold text-ink">{row.planName}</td>
                      <td className="text-end">{row.month.soldCount}</td>
                      <td className="text-end text-nowrap">{formatVnd(row.month.revenue)}</td>
                      <td className="text-end">{row.missingTotals ? '—' : row.activeUsersCount}</td>
                      <td className="text-end">{row.missingTotals ? '—' : row.scheduledUsersCount}</td>
                      <td className="text-end">{row.missingTotals ? '—' : row.expiredUsersCount}</td>
                      <td className="text-end">{row.missingTotals ? '—' : row.totalSubscribersCount}</td>
                      <td className="text-end text-nowrap">{row.missingTotals ? '—' : formatVnd(row.totalRevenue)}</td>
                      <td className="text-end">
                        <button type="button" className="av-ghost-btn is-brand" aria-label={`Xem người dùng gói ${row.planName}`} onClick={() => setViewing(row)}>
                          <Users size={14} aria-hidden="true" />
                          Người dùng
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {viewing && <PlanSubscribersModal plan={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}
