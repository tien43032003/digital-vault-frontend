import { Bell, CheckCheck, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Alert, Button } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import { getNotificationPage, markNotificationRead } from '../../callapi/ownerApi'
import AdminPager from '../../components/admin/AdminPager'
import { useAdminList } from '../../hooks/useAdminList'
import { notifyNotificationsChanged } from '../../hooks/useUnreadNotifications'
import { describeExecutorNotification } from '../../utils/notifications'
import { formatDateTime } from '../../utils/proofOfLife'

// Trang "Hộp thư & Thông báo" của Người thi hành: thông báo BE gửi (kết quả thẩm định pháp lý, hồ sơ được giao...), mới nhất trước
export default function ExecutorNotificationsPage() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [filter, setFilter] = useState('all')
  // Thông báo vừa đánh dấu đã đọc ở trang này, để hiện ngay không cần chờ tải lại danh sách
  const [readIds, setReadIds] = useState(() => new Set())
  const [busyIds, setBusyIds] = useState(() => new Set())
  const [markingAll, setMarkingAll] = useState(false)
  const [actionError, setActionError] = useState('')

  const params = useMemo(() => ({ page, pageSize }), [page, pageSize])
  const { items, error, loading, reload } = useAdminList(getNotificationPage, params)

  const isRead = (item) => item.isRead || readIds.has(item.notificationId)
  const unread = items.filter((item) => !isRead(item))
  const visible = filter === 'unread' ? unread : items

  const markRead = async (item) => {
    setBusyIds((prev) => new Set(prev).add(item.notificationId))
    setActionError('')
    try {
      await markNotificationRead(item.notificationId)
      setReadIds((prev) => new Set(prev).add(item.notificationId))
      notifyNotificationsChanged()
    } catch {
      setActionError('Không đánh dấu được thông báo. Vui lòng thử lại.')
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev)
        next.delete(item.notificationId)
        return next
      })
    }
  }

  // BE chưa có API đánh dấu tất cả nên đánh dấu lần lượt từng thông báo chưa đọc của trang đang xem
  const markAll = async () => {
    setMarkingAll(true)
    setActionError('')
    let failed = 0
    for (const item of unread) {
      try {
        await markNotificationRead(item.notificationId)
        setReadIds((prev) => new Set(prev).add(item.notificationId))
      } catch {
        failed += 1
      }
    }
    notifyNotificationsChanged()
    if (failed > 0) setActionError(`${failed} thông báo chưa đánh dấu được. Vui lòng thử lại.`)
    setMarkingAll(false)
  }

  const handleRefresh = () => {
    setReadIds(new Set())
    setActionError('')
    reload()
  }

  return (
    <div className="d-flex flex-column gap-4">
      <section className="av-panel av-banner">
        <div className="d-flex align-items-center gap-3">
          <span className="av-icon-tile">
            <Bell size={20} aria-hidden="true" />
          </span>
          <div>
            <h1 className="mb-1 fw-bold text-ink" style={{ fontSize: 20, letterSpacing: '-0.02em' }}>
              Hộp thư &amp; Thông báo
            </h1>
            <p className="mb-0 fs-12 text-slate-500">Kết quả thẩm định pháp lý và các cập nhật về hồ sơ bàn giao bạn phụ trách.</p>
          </div>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Button type="button" variant="light" className="av-btn av-btn-sm border" disabled={loading} onClick={handleRefresh}>
            <RefreshCw size={16} aria-hidden="true" />
            Làm mới
          </Button>
          <Button type="button" variant="primary" className="av-btn av-btn-sm" disabled={unread.length === 0 || markingAll} onClick={markAll}>
            <CheckCheck size={16} aria-hidden="true" />
            Đánh dấu tất cả đã đọc
          </Button>
        </div>
      </section>

      {actionError && <Alert variant="danger" className="av-alert mb-0">{actionError}</Alert>}

      <section className="av-panel d-flex flex-column gap-3" aria-label="Thông báo của bạn">
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
            Đang tải thông báo...
          </p>
        ) : items.length === 0 ? (
          <p className="av-empty mb-0">Bạn chưa có thông báo nào.</p>
        ) : (
          <>
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
              <div role="group" aria-label="Lọc thông báo" className="av-tabs">
                <button type="button" className="av-tab" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
                  Tất cả
                </button>
                <button type="button" className="av-tab" aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>
                  Chưa đọc
                </button>
              </div>
              <span className="fs-12 text-slate-500">{`${unread.length} chưa đọc`}</span>
            </div>

            {visible.length === 0 ? (
              <p className="av-empty mb-0">Không có thông báo chưa đọc.</p>
            ) : (
              <ul className="list-unstyled mb-0 d-flex flex-column gap-2" aria-label="Danh sách thông báo" aria-busy={loading}>
                {visible.map((item) => {
                  const read = isRead(item)
                  const info = describeExecutorNotification(item)
                  const requestId = info.requestId
                  return (
                    <li key={item.notificationId} className={`av-owner-notice-row${read ? '' : ' is-unread'}`}>
                      <div className="flex-grow-1" style={{ minWidth: 0 }}>
                        <div className="d-flex flex-wrap align-items-center gap-2">
                          <p className="mb-0 fw-semibold text-ink fs-13">{info.title}</p>
                          {!read && <span className="av-badge av-badge-info">Chưa đọc</span>}
                        </div>
                        {info.body && <p className="mb-1 mt-1 fs-13 text-slate-600">{info.body}</p>}
                        <p className="mb-0 fs-11 text-slate-400">{formatDateTime(item.createdAt)}</p>
                      </div>
                      <div className="d-flex flex-column align-items-end gap-1">
                        {requestId !== null && (
                          <Link to={`/executor/handovers/${requestId}`} className="fs-12 fw-medium">
                            {`Xem hồ sơ #${requestId}`}
                          </Link>
                        )}
                        {!read && (
                          <button type="button" className="av-ghost-btn" disabled={busyIds.has(item.notificationId) || markingAll} onClick={() => markRead(item)}>
                            Đánh dấu đã đọc
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
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
          </>
        )}
      </section>
    </div>
  )
}
