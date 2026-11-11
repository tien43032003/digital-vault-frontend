import { BellRing, CheckCheck, Inbox, Mail, MailOpen, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  NOTIFICATIONS_CHANGED_EVENT,
  emitNotificationsChanged,
  getNotifications,
  markNotificationRead,
  markNotificationsRead,
} from '../../callapi/notificationApi'
import { formatRelativeTime } from '../../utils/beneficiary'
import { describeNotification } from '../../utils/notifications'

const PANEL_LIMIT = 8
const PUSH_HIDE_MS = 6000

// Mới nhất trước
const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt) || b.notificationId - a.notificationId

// Icon "Hộp thư": hiện số thông báo chưa đọc, mở danh sách thông báo mới nhất và đẩy thông báo nổi khi có tin mới.
// Lấy dữ liệu từ GET /api/notifications theo chu kỳ pollMs và mỗi khi quay lại tab.
export default function NotificationBell({ inboxPath, pollMs = 30000 }) {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [push, setPush] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const seenRef = useRef(null)
  const wrapRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const list = (await getNotifications({ page: 1, pageSize: 20 })).slice().sort(byNewest)
      setItems(list)
      setError('')
      setLoaded(true)
      // Lần tải đầu chỉ ghi nhớ; các lần sau thông báo chưa đọc nào chưa thấy thì đẩy ra màn hình
      const known = seenRef.current
      if (known) {
        const fresh = list.filter((item) => !item.isRead && !known.has(item.notificationId))
        if (fresh.length > 0) setPush({ item: fresh[0], extra: fresh.length - 1, key: Date.now() })
      }
      seenRef.current = new Set(list.map((item) => item.notificationId))
    } catch (caught) {
      setError(caught?.message || 'Không tải được thông báo.')
      setLoaded(true)
    }
  }, [])

  // Tải ngay, sau đó hỏi lại theo chu kỳ; quay lại tab hoặc trang khác đánh dấu đã đọc thì tải lại
  useEffect(() => {
    let active = true
    const run = () => {
      if (active) load()
    }
    run()
    const timer = setInterval(run, pollMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') run()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, run)
    return () => {
      active = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, run)
    }
  }, [load, pollMs])

  // Đóng danh sách khi bấm ra ngoài hoặc nhấn Esc
  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Thông báo nổi tự ẩn
  useEffect(() => {
    if (!push) return undefined
    const timer = setTimeout(() => setPush(null), PUSH_HIDE_MS)
    return () => clearTimeout(timer)
  }, [push])

  const unread = items.filter((item) => !item.isRead)
  const unreadLabel = unread.length > 99 ? '99+' : String(unread.length)

  const markOne = async (item) => {
    if (item.isRead || busyId !== null) return
    setBusyId(item.notificationId)
    try {
      await markNotificationRead(item.notificationId)
      setItems((current) => current.map((entry) => (entry.notificationId === item.notificationId ? { ...entry, isRead: true } : entry)))
      emitNotificationsChanged()
    } catch (caught) {
      setError(caught?.message || 'Không đánh dấu được thông báo.')
    } finally {
      setBusyId(null)
    }
  }

  const markAll = async () => {
    if (unread.length === 0 || busyId !== null) return
    setBusyId('all')
    try {
      await markNotificationsRead(unread.map((item) => item.notificationId))
      emitNotificationsChanged()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="av-mailbox" ref={wrapRef}>
      <button
        type="button"
        id="beneficiary-mailbox-button"
        className={`av-mailbox-btn${open ? ' is-open' : ''}`}
        aria-label={unread.length > 0 ? `Hộp thư, ${unread.length} thông báo chưa đọc` : 'Hộp thư'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Mail size={18} aria-hidden="true" />
        <span className="av-mailbox-label">Hộp thư</span>
        {unread.length > 0 && (
          <span className="av-mailbox-badge" aria-hidden="true">
            {unreadLabel}
          </span>
        )}
      </button>

      {open && (
        <div className="av-mailbox-panel" role="dialog" aria-label="Thông báo mới nhất">
          <div className="av-mailbox-panel-head">
            <div>
              <p className="mb-0 fw-bold text-ink fs-14">Hộp thư thông báo</p>
              <p className="mb-0 fs-11 text-slate-500">{unread.length > 0 ? `${unread.length} thông báo chưa đọc` : 'Bạn đã đọc hết thông báo'}</p>
            </div>
            <button type="button" className="av-link-btn fs-12 d-inline-flex align-items-center gap-1" disabled={unread.length === 0 || busyId !== null} onClick={markAll}>
              <CheckCheck size={14} aria-hidden="true" />
              Đọc tất cả
            </button>
          </div>

          <div className="av-mailbox-list">
            {!loaded && (
              <p role="status" className="av-empty mb-0 d-flex align-items-center justify-content-center gap-2">
                <span className="spinner-border spinner-border-sm text-brand" aria-hidden="true" />
                Đang tải thông báo...
              </p>
            )}
            {loaded && error && <p className="av-mailbox-error mb-0">{error}</p>}
            {loaded && items.length === 0 && !error && (
              <div className="av-empty">
                <Inbox size={28} className="text-slate-400 mb-2" aria-hidden="true" />
                <p className="mb-0">Chưa có thông báo nào.</p>
              </div>
            )}
            {items.slice(0, PANEL_LIMIT).map((item) => {
              const info = describeNotification(item)
              return (
                <button
                  key={item.notificationId}
                  type="button"
                  className={`av-mailbox-item${item.isRead ? '' : ' is-unread'}`}
                  onClick={() => markOne(item)}
                  disabled={busyId === item.notificationId}
                  title={item.isRead ? 'Đã đọc' : 'Bấm để đánh dấu đã đọc'}
                >
                  <span className="av-mailbox-item-icon">{item.isRead ? <MailOpen size={14} aria-hidden="true" /> : <BellRing size={14} aria-hidden="true" />}</span>
                  <span className="av-mailbox-item-main">
                    <span className="d-block fs-13 fw-semibold text-ink text-truncate">{info.title || 'Thông báo hệ thống'}</span>
                    {info.body && <span className="av-mailbox-item-msg">{info.body}</span>}
                    <span className="d-block fs-11 text-slate-400 mt-1">{formatRelativeTime(item.createdAt)}</span>
                  </span>
                  {!item.isRead && <span className="av-unread-dot" aria-label="Chưa đọc" />}
                </button>
              )
            })}
          </div>

          {inboxPath && (
            <Link to={inboxPath} className="av-mailbox-panel-foot" onClick={() => setOpen(false)}>
              Xem toàn bộ hộp thư
            </Link>
          )}
        </div>
      )}

      {push && (
        <div className="av-push-wrap" key={push.key}>
          <div className="av-push-toast" role="status" aria-live="polite">
            <span className="av-push-icon">
              <BellRing size={16} aria-hidden="true" />
            </span>
            <div className="flex-grow-1" style={{ minWidth: 0 }}>
              <p className="mb-0 av-mono-tag fs-10">THÔNG BÁO MỚI</p>
              <p className="mb-0 fw-bold text-ink fs-13 text-truncate">{describeNotification(push.item).title || 'Thông báo hệ thống'}</p>
              {describeNotification(push.item).body && <p className="mb-0 fs-12 text-slate-500 av-clamp-2">{describeNotification(push.item).body}</p>}
              {push.extra > 0 && <p className="mb-0 mt-1 fs-11 text-brand fw-semibold">{`+${push.extra} thông báo khác`}</p>}
            </div>
            <button type="button" onClick={() => setPush(null)} aria-label="Đóng thông báo" className="av-icon-btn">
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
