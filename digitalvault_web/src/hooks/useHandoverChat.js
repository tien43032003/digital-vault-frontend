import { useCallback, useEffect, useRef, useState } from 'react'
import { getHandoverMessages, sendHandoverMessage } from '../callapi/chatApi'
import { CHAT_POLL_MS, mergeMessages } from '../utils/chat'

const PAGE_SIZE = 50

// Khung chat của một hồ sơ bàn giao: tải lịch sử, hỏi lại tin mới theo chu kỳ (tạm dừng khi tab bị ẩn) và gửi tin.
// BE đã có SignalR nhưng hiện chỉ dùng REST để chạy được ngay; chuyển sang SignalR sau không đổi giao diện hook này.
export function useHandoverChat(requestId, { pollMs = CHAT_POLL_MS } = {}) {
  const [state, setState] = useState({ key: null, status: 'loading', messages: [], error: '' })
  const [reloadKey, setReloadKey] = useState(0)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const loadedKey = useRef(null)

  const key = `${requestId}:${reloadKey}`

  useEffect(() => {
    let cancelled = false
    let timer = null
    const isReload = loadedKey.current !== key

    const fetchPage = async () => {
      const page = await getHandoverMessages(requestId, { page: 1, pageSize: PAGE_SIZE })
      return page.items
    }

    const poll = async () => {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.hidden) {
        timer = setTimeout(poll, pollMs)
        return
      }
      try {
        const items = await fetchPage()
        if (!cancelled) setState((prev) => (prev.status === 'ready' ? { ...prev, messages: mergeMessages(prev.messages, items) } : prev))
      } catch {
        // Lỗi khi hỏi lại tin mới: giữ nguyên tin đang có, lần sau thử lại
      }
      if (!cancelled) timer = setTimeout(poll, pollMs)
    }

    if (isReload) setState({ key, status: 'loading', messages: [], error: '' })
    loadedKey.current = key
    fetchPage()
      .then((items) => {
        if (cancelled) return
        setState({ key, status: 'ready', messages: mergeMessages([], items), error: '' })
        if (pollMs > 0) timer = setTimeout(poll, pollMs)
      })
      .catch((caught) => {
        if (!cancelled) setState({ key, status: 'error', messages: [], error: caught?.message || 'Không tải được tin nhắn.' })
      })

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [requestId, key, pollMs])

  const reload = useCallback(() => setReloadKey((value) => value + 1), [])

  // Trả true khi gửi thành công để giao diện biết có xoá ô nhập hay không
  const send = useCallback(
    async (content) => {
      const text = (content ?? '').trim()
      if (!text) return false
      setSending(true)
      setSendError('')
      try {
        const message = await sendHandoverMessage(requestId, text)
        setState((prev) => ({ ...prev, messages: mergeMessages(prev.messages, [message]) }))
        return true
      } catch (caught) {
        setSendError(caught?.message || 'Không gửi được tin nhắn.')
        return false
      } finally {
        setSending(false)
      }
    },
    [requestId],
  )

  return { status: state.status, error: state.error, messages: state.messages, sending, sendError, send, reload }
}
