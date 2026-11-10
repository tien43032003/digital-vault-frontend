import { Bell, BellRing, CheckCheck, Inbox, MailOpen } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Alert } from 'react-bootstrap'
import {
  NOTIFICATIONS_CHANGED_EVENT,
  emitNotificationsChanged,
  getAllNotifications,
  markNotificationRead,
  markNotificationsRead,
} from '../../callapi/notificationApi'
import { ErrorState, LoadingState, PageBanner } from '../../components/beneficiary/BeneficiaryUi'
import { formatRelativeTime } from '../../utils/beneficiary'
import { describeNotification } from '../../utils/notifications'
import { formatDateTime } from '../../utils/proofOfLife'

const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt) || b.notificationId - a.notificationId

// Trang Hộp thư: toàn bộ thông báo (GET /api/notifications), đánh dấu đã đọc (POST /api/notifications/{id}/read)
export default function BeneficiaryNotificationsPage() {
  const [state, setState] = useState({ status: 'loading', items: [], error: null })
  const [filter, setFilter] = useState('all')
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    getAllNotifications()
      .then((items) => {
        if (!cancelled) setState({ status: 'ready', items: [...items].sort(byNewest), error: null })
      })
      .catch((error) => {
        if (!cancelled) setState((current) => ({ ...current, status: current.items.length ? 'ready' : 'error', error }))
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const reload = useCallback(() => setReloadKey((key) => key + 1), [])

  // Icon Hộp thư đánh dấu đã đọc thì trang này cũng tải lại
  useEffect(() => {
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, reload)
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, reload)
  }, [reload])

  const markOne = async (item) => {
    if (item.isRead || busyId !== null) return
    setBusyId(item.notificationId)
    setActionError('')
    try {
      await markNotificationRead(item.notificationId)
      setState((current) => ({
        ...current,
        items: current.items.map((entry) => (entry.notificationId === item.notificationId ? { ...entry, isRead: true } : entry)),
      }))
      emitNotificationsChanged()
    } catch (caught) {
      setActionError(caught?.message || 'Không đánh dấu được thông báo.')
    } finally {
      setBusyId(null)
    }
  }

  const unread = state.items.filter((item) => !item.isRead)

  const markAll = async () => {
    if (unread.length === 0 || busyId !== null) return
    setBusyId('all')
    setActionError('')
    try {
      const done = await markNotificationsRead(unread.map((item) => item.notificationId))
      if (done < unread.length) setActionError(`Có ${unread.length - done} thông báo chưa đánh dấu được, vui lòng thử lại.`)
      emitNotificationsChanged()
    } finally {
      setBusyId(null)
    }
  }

  if (state.status === 'loading') return <LoadingState message="Đang tải hộp thư..." />
  if (state.status === 'error') return <ErrorState message={state.error?.message || 'Không tải được thông báo.'} onRetry={reload} />

  const visible = filter === 'unread' ? unread : state.items

  return (
    <div className="d-flex flex-column gap-4">
      <PageBanner icon={Bell} tag="SECURE INBOX" title="Hộp thư thông báo" description="Thông báo về di sản, tiến trình bàn giao và các tin nhắn từ hệ thống.">
        <button type="button" className="av-ghost-btn is-brand" id="notifications-mark-all" disabled={unread.length === 0 || busyId !== null} onClick={markAll}>
          <CheckCheck size={14} aria-hidden="true" />
          {busyId === 'all' ? 'Đang đánh dấu...' : 'Đánh dấu tất cả đã đọc'}
        </button>
      </PageBanner>

      {actionError && <Alert variant="danger" className="av-alert mb-0">{actionError}</Alert>}

      <section className="av-panel d-flex flex-column gap-3" aria-label="Danh sách thông báo">
        <div className="av-tabs" role="group" aria-label="Lọc thông báo">
          <button type="button" className="av-tab" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            {`Tất cả (${state.items.length})`}
          </button>
          <button type="button" className="av-tab" aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>
            {`Chưa đọc (${unread.length})`}
          </button>
        </div>

        {visible.length === 0 ? (
          <div className="av-empty">
            <Inbox size={32} className="text-slate-400 mb-2" aria-hidden="true" />
            <p className="mb-0">{filter === 'unread' ? 'Bạn đã đọc hết thông báo.' : 'Chưa có thông báo nào.'}</p>
          </div>
        ) : (
          <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
            {visible.map((item) => {
              const info = describeNotification(item)
              return (
              <li key={item.notificationId} className={`av-inbox-row${item.isRead ? '' : ' is-unread'}`}>
                <span className={`av-stat-icon ${item.isRead ? '' : 'is-brand'}`}>
                  {item.isRead ? <MailOpen size={16} aria-hidden="true" /> : <BellRing size={16} aria-hidden="true" />}
                </span>
                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                  <div className="d-flex flex-wrap align-items-center gap-2">
                    <p className="mb-0 fs-14 fw-semibold text-ink">{info.title}</p>
                    {info.typeLabel && <span className="av-code-tag">{info.typeLabel}</span>}
                    {!item.isRead && <span className="av-badge av-badge-info">Mới</span>}
                  </div>
                  {info.body && <p className="mb-0 mt-1 fs-13 text-slate-600" style={{ whiteSpace: 'pre-line' }}>{info.body}</p>}
                  <p className="mb-0 mt-1 fs-11 text-slate-400" title={item.createdAt ? formatDateTime(item.createdAt) : undefined}>
                    {formatRelativeTime(item.createdAt)}
                  </p>
                </div>
                {!item.isRead && (
                  <button
                    type="button"
                    className="av-ghost-btn"
                    id={`notification-read-${item.notificationId}`}
                    disabled={busyId !== null}
                    onClick={() => markOne(item)}
                  >
                    {busyId === item.notificationId ? 'Đang lưu...' : 'Đánh dấu đã đọc'}
                  </button>
                )}
              </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
